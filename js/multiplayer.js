/* WebSocket transport and reconnect/session handling live in this module. */
const Multiplayer = (() => {
  const STORAGE_KEY = "fogwars_online_session";
  let socket = null, playerId = null, roomCode = null, token = null;
  let reconnectTimer = null, reconnectDelay = 500, intentionalClose = false, requestId = 0;
  const pending = new Map();

  function storedSession() {
    try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null"); }
    catch { return null; }
  }
  function saveSession() {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ roomCode, token, playerId })); } catch {}
  }
  function clearSession() {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
    roomCode = token = playerId = null;
  }
  function notifyStatus(connected, message = "") {
    if (typeof onOnlineConnection === "function") onOnlineConnection(connected, message);
  }
  function publishState(state) {
    if (!state || typeof onOnlineState !== "function") return;
    onOnlineState(state, playerId);
  }
  function socketUrl() {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    // Support the documented two-server local setup: Python serves the page on
    // :8000 while Node owns the authoritative WebSocket endpoint on :3000.
    const host = location.port === "8000" ? `${location.hostname}:3000` : location.host;
    return `${protocol}//${host}/ws`;
  }
  function connect() {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      if (socket.readyState === WebSocket.OPEN) return Promise.resolve(socket);
      return new Promise((resolve, reject) => {
        const check = () => socket && socket.readyState === WebSocket.OPEN ? resolve(socket) : socket && socket.readyState === WebSocket.CLOSED ? reject(new Error("SERVER_UNAVAILABLE")) : setTimeout(check, 100);
        check();
      });
    }
    notifyStatus(false, "CONNECTING...");
    return new Promise((resolve, reject) => {
      const current = new WebSocket(socketUrl());
      socket = current;
      const timeout = setTimeout(() => { try { current.close(); } catch {} reject(new Error("SERVER_UNAVAILABLE")); }, 7000);
      current.addEventListener("open", () => {
        clearTimeout(timeout); reconnectDelay = 500; notifyStatus(true, "ONLINE"); resolve(current);
      }, { once: true });
      current.addEventListener("error", () => {
        clearTimeout(timeout); reject(new Error("SERVER_UNAVAILABLE"));
      }, { once: true });
      current.addEventListener("message", event => {
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message.type === "reply") {
          const item = pending.get(message.requestId);
          if (item) {
            pending.delete(message.requestId); clearTimeout(item.timer);
            message.ok ? item.resolve(message) : item.reject(new Error(message.error || "NETWORK_ERROR"));
          }
          if (message.ok && message.state) publishState(message.state);
        } else if (message.type === "state") publishState(message.state);
        else if (message.type === "notice") {
          if (message.code === "TEAM_EXPIRED" || message.code === "TEAM_CANCELLED") { clearSession(); intentionalClose = true; }
          if (typeof onOnlineNotice === "function") onOnlineNotice(message);
        }
      });
      current.addEventListener("close", () => {
        if (socket === current) socket = null;
        for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error("CONNECTION_LOST")); }
        pending.clear();
        if (!intentionalClose && storedSession()) {
          notifyStatus(false, "RECONNECTING...");
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(resume, reconnectDelay);
          reconnectDelay = Math.min(8000, reconnectDelay * 1.7);
        } else if (!intentionalClose) notifyStatus(false, "OFFLINE");
      });
    });
  }
  async function request(type, payload = {}) {
    const ws = await connect();
    const id = `${Date.now()}-${++requestId}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error("SERVER_TIMEOUT")); }, 9000);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ type, requestId: id, ...payload }));
    });
  }
  function remember(reply) {
    roomCode = reply.roomCode; token = reply.token; playerId = reply.playerId;
    intentionalClose = false; saveSession();
    if (reply.state) publishState(reply.state);
  }
  async function create(city) {
    intentionalClose = false;
    const response = await request("create", { city }); remember(response); return response;
  }
  async function join(code) {
    intentionalClose = false;
    const response = await request("join", { code: String(code).toUpperCase().trim() }); remember(response); return response;
  }
  async function move(direction) { return request("move", { direction }); }
  async function rematch() { return request("rematch"); }
  async function resume() {
    const saved = storedSession();
    if (!saved || intentionalClose) return;
    roomCode = saved.roomCode; token = saved.token; playerId = saved.playerId;
    try {
      const ws = await connect();
      if (ws !== socket || !ws || ws.readyState !== WebSocket.OPEN) return;
      const response = await request("join", { code: roomCode, token });
      remember(response);
    } catch (error) {
      if (["TEAM_NOT_FOUND", "TEAM_EXPIRED", "SESSION_INVALID"].includes(error.message)) {
        clearSession(); intentionalClose = true;
        if (typeof onOnlineNotice === "function") onOnlineNotice({ code: error.message, message: error.message.replaceAll("_", " ") });
      }
    }
  }
  async function cancel() {
    intentionalClose = true; clearTimeout(reconnectTimer);
    try { if (socket && socket.readyState === WebSocket.OPEN) await request("cancel"); } catch {}
    clearSession();
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
  }
  function identity() { return { roomCode, playerId, connected: !!socket && socket.readyState === WebSocket.OPEN }; }
  return { create, join, move, rematch, resume, cancel, identity };
})();
