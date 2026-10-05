"use strict";

const path = require("node:path");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const { EventEmitter } = require("node:events");
const { MAPS } = require("./js/maps.js");

const server = http.createServer(serveHttp);
const PORT = Number(process.env.PORT) || 3000;
const ROOM_TTL_MS = 30 * 60 * 1000;
const rooms = new Map();
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function serveHttp(req, res) {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
  }
  let relative;
  try { relative = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname); }
  catch { res.writeHead(400); return res.end("Bad path"); }
  const file = path.resolve(__dirname, `.${relative}`);
  if (!file.startsWith(`${__dirname}${path.sep}`) || /(^|\/)\./.test(relative.slice(1))) { res.writeHead(403); return res.end("Forbidden"); }
  const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(error.code === "ENOENT" ? 404 : 500); return res.end(error.code === "ENOENT" ? "Not found" : "Server error"); }
    res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "X-Content-Type-Options": "nosniff" });
    res.end(data);
  });
}

function websocketFrame(opcode, payload = Buffer.alloc(0)) {
  payload = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  let header;
  if (payload.length < 126) { header = Buffer.from([0x80 | opcode, payload.length]); }
  else if (payload.length < 65536) { header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(payload.length, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(payload.length), 2); }
  return Buffer.concat([header, payload]);
}
class WebSocketPeer extends EventEmitter {
  constructor(raw) {
    super(); this.raw = raw; this.readyState = 1; this.buffer = Buffer.alloc(0); this.fragmentOpcode = 0; this.fragments = [];
    raw.on("data", chunk => this.consume(chunk));
    raw.on("error", () => this.finish()); raw.on("close", () => this.finish());
  }
  send(text) { if (this.readyState === 1) this.raw.write(websocketFrame(1, Buffer.from(text))); }
  close(code = 1000, reason = "") {
    if (this.readyState !== 1) return;
    this.readyState = 2;
    const body = Buffer.alloc(2 + Buffer.byteLength(reason)); body.writeUInt16BE(code, 0); body.write(reason, 2);
    this.raw.end(websocketFrame(8, body)); setTimeout(() => this.raw.destroy(), 1000).unref?.();
  }
  finish() { if (this.readyState === 3) return; this.readyState = 3; this.emit("close"); }
  consume(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 2) {
      const first = this.buffer[0], second = this.buffer[1], opcode = first & 0x0f, masked = !!(second & 0x80);
      let length = second & 0x7f, offset = 2;
      if (!masked) return this.close(1002, "Client frames must be masked");
      if (length === 126) { if (this.buffer.length < 4) return; length = this.buffer.readUInt16BE(2); offset = 4; }
      else if (length === 127) { if (this.buffer.length < 10) return; const big = this.buffer.readBigUInt64BE(2); if (big > 1024n * 1024n) return this.close(1009, "Message too large"); length = Number(big); offset = 10; }
      if (length > 1024 * 1024) return this.close(1009, "Message too large");
      if (this.buffer.length < offset + 4 + length) return;
      const mask = this.buffer.subarray(offset, offset + 4); offset += 4;
      const payload = Buffer.from(this.buffer.subarray(offset, offset + length)); this.buffer = this.buffer.subarray(offset + length);
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      if (opcode === 8) { this.readyState = 2; this.raw.end(websocketFrame(8, payload)); this.finish(); return; }
      if (opcode === 9) { this.raw.write(websocketFrame(10, payload)); continue; }
      if (opcode === 10) continue;
      if (opcode === 1) { this.fragmentOpcode = 1; this.fragments = [payload]; }
      else if (opcode === 0 && this.fragmentOpcode === 1) this.fragments.push(payload);
      else return this.close(1002, "Unsupported frame");
      if (first & 0x80) { const message = Buffer.concat(this.fragments); this.fragments = []; this.fragmentOpcode = 0; if (opcode === 1 || opcode === 0) this.emit("message", message); }
    }
  }
}
server.on("upgrade", (req, raw) => {
  const url = new URL(req.url, "http://localhost"), key = req.headers["sec-websocket-key"];
  const origin = req.headers.origin;
  const sameOrigin = !origin || (() => {
    try {
      const source = new URL(origin), target = new URL(`http://${req.headers.host}`);
      const sameHost = source.hostname.toLowerCase() === target.hostname.toLowerCase();
      const sameOriginPort = source.host === req.headers.host;
      const localPythonFrontend = sameHost && source.port === "8000" && target.port === "3000";
      return sameOriginPort || localPythonFrontend;
    } catch { return false; }
  })();
  if (url.pathname !== "/ws" || req.headers.upgrade?.toLowerCase() !== "websocket" || req.headers["sec-websocket-version"] !== "13" || !key || !sameOrigin) { raw.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"); return raw.destroy(); }
  const accept = crypto.createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  raw.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  handleConnection(new WebSocketPeer(raw));
});

function randomCode() {
  const bytes = crypto.randomBytes(4);
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return `FOG${suffix}`;
}
function newToken() { return crypto.randomBytes(24).toString("base64url"); }
function otherDirection(dir) { return ({ N: "S", S: "N", E: "W", W: "E" })[dir]; }
function emptyExploration(map) {
  return { nodes: new Set([map.start1]), edges: new Set() };
}
function makeRoom(code, city) {
  const map = MAPS[city];
  const room = {
    code, city, createdAt: Date.now(), expiresAt: Date.now() + ROOM_TTL_MS,
    gameStarted: false, gameFinished: false, winner: null, currentTurn: 1,
    moves: 0, startedAt: null,
    players: {
      1: { token: newToken(), position: map.start1, facing: "N", connected: false, claimed: false, socket: null },
      2: { token: newToken(), position: map.start2, facing: "N", connected: false, claimed: false, socket: null }
    },
    exploredState: { 1: emptyExploration(map), 2: { nodes: new Set([map.start2]), edges: new Set() } },
    expiryTimer: null
  };
  room.expiryTimer = setTimeout(() => expireRoom(code), ROOM_TTL_MS);
  room.expiryTimer.unref?.();
  return room;
}
function publicState(room) {
  const p1 = room.players[1], p2 = room.players[2];
  return {
    roomCode: room.code, city: room.city,
    player1: { position: p1.position, facing: p1.facing, connected: p1.connected },
    player2: { position: p2.position, facing: p2.facing, connected: p2.connected },
    player1Position: p1.position, player2Position: p2.position,
    currentTurn: room.currentTurn, moves: room.moves,
    gameStarted: room.gameStarted, gameFinished: room.gameFinished,
    winner: room.winner, exploredState: {
      1: { nodes: [...room.exploredState[1].nodes], edges: [...room.exploredState[1].edges] },
      2: { nodes: [...room.exploredState[2].nodes], edges: [...room.exploredState[2].edges] }
    },
    startedAt: room.startedAt, timestamp: Date.now(), expiresAt: room.expiresAt
  };
}
function send(socket, data) {
  if (socket && socket.readyState === 1) socket.send(JSON.stringify(data));
}
function reply(socket, requestId, ok, payload = {}) {
  send(socket, { type: "reply", requestId, ok, ...payload });
}
function broadcast(room) {
  const state = publicState(room);
  for (const player of Object.values(room.players)) send(player.socket, { type: "state", state });
}
function attachPlayer(room, playerId, socket) {
  const player = room.players[playerId];
  if (player.socket && player.socket !== socket) {
    player.socket._fogwarsRoom = null;
    player.socket.close(4001, "Session resumed in another connection");
  }
  player.socket = socket;
  player.connected = true;
  player.claimed = true;
  socket._fogwarsRoom = room.code;
  socket._fogwarsPlayer = playerId;
  if (!room.gameStarted && room.players[1].connected && room.players[2].connected) {
    room.gameStarted = true;
    room.startedAt = Date.now();
  }
  broadcast(room);
}
function expireRoom(code) {
  const room = rooms.get(code);
  if (!room) return;
  for (const player of Object.values(room.players)) {
    send(player.socket, { type: "notice", code: "TEAM_EXPIRED", message: "TEAM EXPIRED" });
    if (player.socket) player.socket.close(4002, "Team expired");
  }
  rooms.delete(code);
}
function roomFor(socket) {
  const room = rooms.get(socket._fogwarsRoom);
  if (!room || !socket._fogwarsPlayer || room.players[socket._fogwarsPlayer].socket !== socket) return null;
  return room;
}

function handleConnection(socket) {
  socket.on("message", raw => {
    let message;
    try { message = JSON.parse(raw.toString()); }
    catch { return reply(socket, null, false, { error: "INVALID_MESSAGE" }); }
    const { type, requestId } = message;

    if (type === "create") {
      if (!MAPS[message.city]) return reply(socket, requestId, false, { error: "INVALID_CITY" });
      let code;
      do { code = randomCode(); } while (rooms.has(code));
      const room = makeRoom(code, message.city);
      rooms.set(code, room);
      attachPlayer(room, 1, socket);
      return reply(socket, requestId, true, { roomCode: code, playerId: 1, token: room.players[1].token, state: publicState(room) });
    }

    if (type === "join") {
      const code = String(message.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const room = rooms.get(code);
      if (!room) return reply(socket, requestId, false, { error: "TEAM_NOT_FOUND" });
      if (Date.now() >= room.expiresAt) { expireRoom(code); return reply(socket, requestId, false, { error: "TEAM_EXPIRED" }); }
      let playerId = null;
      if (message.token) {
        playerId = [1, 2].find(id => room.players[id].token === message.token) || null;
        if (!playerId) return reply(socket, requestId, false, { error: "SESSION_INVALID" });
      } else {
        if (room.players[1].socket === socket || room.players[2].socket === socket) playerId = socket._fogwarsPlayer;
        else if (!room.players[2].claimed && !room.gameStarted) playerId = 2;
        else return reply(socket, requestId, false, { error: "TEAM_FULL" });
      }
      attachPlayer(room, playerId, socket);
      return reply(socket, requestId, true, { roomCode: code, playerId, token: room.players[playerId].token, state: publicState(room) });
    }

    if (type === "move") {
      const room = roomFor(socket);
      if (!room) return reply(socket, requestId, false, { error: "NOT_IN_TEAM" });
      const playerId = socket._fogwarsPlayer;
      if (!room.gameStarted || room.gameFinished) return reply(socket, requestId, false, { error: "GAME_NOT_ACTIVE" });
      if (!room.players[2].connected) return reply(socket, requestId, false, { error: "TEAMMATE_DISCONNECTED" });
      if (room.currentTurn !== playerId) return reply(socket, requestId, false, { error: "NOT_YOUR_TURN" });
      const dir = message.direction;
      if (!["N", "S", "E", "W"].includes(dir)) return reply(socket, requestId, false, { error: "INVALID_MOVE" });
      const map = MAPS[room.city], from = room.players[playerId].position;
      let to = null;
      for (const [a, b, edgeDir] of map.edges) {
        if (a === from && edgeDir === dir) { to = b; break; }
        if (b === from && otherDirection(edgeDir) === dir) { to = a; break; }
      }
      if (to === null) return reply(socket, requestId, false, { error: "NO_ROAD" });
      const player = room.players[playerId], exploration = room.exploredState[playerId];
      const edgeKey = [from, to].sort().join("|");
      player.position = to;
      player.facing = dir;
      exploration.nodes.add(to);
      exploration.edges.add(edgeKey);
      room.moves += 1;
      if (to === map["goal"]) {
        room.gameFinished = true;
        room.winner = playerId;
      } else room.currentTurn = playerId === 1 ? 2 : 1;
      broadcast(room);
      return reply(socket, requestId, true);
    }

    if (type === "rematch") {
      const room = roomFor(socket);
      if (!room) return reply(socket, requestId, false, { error: "NOT_IN_TEAM" });
      if (!room.gameFinished || !room.players[1].connected || !room.players[2].connected) return reply(socket, requestId, false, { error: "TEAM_NOT_READY" });
      const map = MAPS[room.city];
      room.players[1].position = map.start1; room.players[1].facing = "N";
      room.players[2].position = map.start2; room.players[2].facing = "N";
      room.exploredState = { 1: emptyExploration(map), 2: { nodes: new Set([map.start2]), edges: new Set() } };
      room.currentTurn = 1; room.moves = 0; room.winner = null;
      room.gameFinished = false; room.gameStarted = true; room.startedAt = Date.now();
      broadcast(room);
      return reply(socket, requestId, true);
    }

    if (type === "cancel") {
      const room = roomFor(socket);
      if (!room) return reply(socket, requestId, true);
      if (socket._fogwarsPlayer === 1) {
        for (const player of Object.values(room.players)) {
          send(player.socket, { type: "notice", code: "TEAM_CANCELLED", message: "TEAM CANCELLED" });
          if (player.socket) player.socket.close(4003, "Team cancelled");
        }
        clearTimeout(room.expiryTimer); rooms.delete(room.code);
      } else {
        const player = room.players[2]; player.connected = false; player.socket = null;
        socket._fogwarsRoom = null; socket._fogwarsPlayer = null; broadcast(room);
      }
      return reply(socket, requestId, true);
    }

    reply(socket, requestId, false, { error: "UNKNOWN_ACTION" });
  });

  socket.on("close", () => {
    const room = roomFor(socket);
    if (!room) return;
    const player = room.players[socket._fogwarsPlayer];
    player.connected = false;
    player.socket = null;
    broadcast(room);
  });
}

if (require.main === module) {
  server.listen(PORT, "0.0.0.0", () => console.log(`FOGWARS server listening at http://localhost:${PORT}`));
}

module.exports = { handleConnection, rooms, publicState, WebSocketPeer, server };
