"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { handleConnection, rooms, WebSocketPeer } = require("../server.js");
const { MAPS } = require("../js/maps.js");

class TestPeer extends EventEmitter {
  constructor() { super(); this.readyState = 1; this.messages = []; }
  send(text) { this.messages.push(JSON.parse(text)); }
  close() { this.readyState = 3; this.emit("close"); }
  request(type, payload = {}) {
    const requestId = `${this.messages.length}-${Math.random()}`;
    this.emit("message", Buffer.from(JSON.stringify({ type, requestId, ...payload })));
    return this.messages.filter(m => m.type === "reply" && m.requestId === requestId).at(-1);
  }
  latestState() { return this.messages.filter(m => m.type === "state").at(-1)?.state; }
}

function graph(map) {
  const result = Object.fromEntries(Object.keys(map.nodes).map(id => [id, []]));
  const opposite = { N: "S", S: "N", E: "W", W: "E" };
  for (const [a, b, dir] of map.edges) { result[a].push({ to: b, dir }); result[b].push({ to: a, dir: opposite[dir] }); }
  return result;
}
function nextDirection(map, from, goal) {
  const g = graph(map), queue = [from], prev = new Map([[from, null]]);
  for (let i = 0; i < queue.length && !prev.has(goal); i++) for (const edge of g[queue[i]]) if (!prev.has(edge.to)) { prev.set(edge.to, { id: queue[i], dir: edge.dir }); queue.push(edge.to); }
  if (!prev.has(goal)) return null;
  let node = goal, step;
  while (prev.get(node)?.id !== from) { step = prev.get(node); node = step.id; }
  return prev.get(node)?.dir;
}

test("WebSocket peer decodes masked client frames and emits unmasked server text frames", () => {
  class RawSocket extends EventEmitter {
    constructor() { super(); this.writes = []; this.destroyed = false; }
    write(data) { this.writes.push(Buffer.from(data)); }
    end(data) { if (data) this.write(data); this.destroyed = true; this.emit("close"); }
    destroy() { this.destroyed = true; this.emit("close"); }
  }
  const raw = new RawSocket(), peer = new WebSocketPeer(raw), received = [];
  peer.on("message", data => received.push(data.toString()));
  const message = Buffer.from("{\"type\":\"ping\"}"), mask = Buffer.from([0x17, 0x42, 0xa9, 0x5c]);
  const frame = Buffer.alloc(2 + 4 + message.length); frame[0] = 0x81; frame[1] = 0x80 | message.length; mask.copy(frame, 2);
  for (let i = 0; i < message.length; i++) frame[6 + i] = message[i] ^ mask[i & 3];
  raw.emit("data", frame.subarray(0, 5)); assert.equal(received.length, 0);
  raw.emit("data", frame.subarray(5)); assert.deepEqual(received, ['{"type":"ping"}']);
  peer.send('{"type":"pong"}');
  const response = raw.writes.at(-1); assert.equal(response[0], 0x81); assert.equal(response[1], 15);
  assert.equal(response.subarray(2).toString(), '{"type":"pong"}');
  peer.close();
});

test("authoritative team create, join, turn validation, reconnect, Dijkstra-goal completion and rematch", () => {
  const p1 = new TestPeer(), p2 = new TestPeer(), p3 = new TestPeer(), bad = new TestPeer();
  handleConnection(p1); handleConnection(p2); handleConnection(p3); handleConnection(bad);
  const created = p1.request("create", { city: "vice" });
  assert.equal(created.ok, true);
  assert.match(created.roomCode, /^FOG[A-Z0-9]{4}$/);
  assert.equal(created.state.city, "vice");
  assert.equal(p1.latestState().gameStarted, false, "creator waits for player 2");
  assert.equal(bad.request("join", { code: "INVALID" }).error, "TEAM_NOT_FOUND");
  const joined = p2.request("join", { code: created.roomCode.toLowerCase() });
  assert.equal(joined.ok, true); assert.equal(joined.playerId, 2);
  assert.equal(p1.latestState().gameStarted, true); assert.equal(p1.latestState().city, p2.latestState().city);
  assert.equal(p3.request("join", { code: created.roomCode }).error, "TEAM_FULL");

  const map = MAPS.vice, toward = nextDirection(map, map.start1, map.goal);
  assert.ok(toward);
  assert.equal(p2.request("move", { direction: "N" }).error, "NOT_YOUR_TURN");
  assert.equal(p1.request("move", { direction: "N" }).error, "NO_ROAD");
  assert.equal(p1.request("move", { direction: toward }).ok, true);
  assert.equal(p1.latestState().currentTurn, 2); assert.equal(p1.latestState().moves, 1);
  assert.equal(p2.latestState().player1Position, p1.latestState().player1Position);

  const p2Token = joined.token;
  assert.equal(p2.request("move", { direction: nextDirection(map, map.start2, map.goal) }).ok, true);
  assert.equal(p1.latestState().currentTurn, 1); assert.equal(p1.latestState().moves, 2);
  p2.close();
  assert.equal(p1.latestState().player2.connected, false);
  assert.equal(p1.request("move", { direction: nextDirection(map, p1.latestState().player1Position, map.goal) }).error, "TEAMMATE_DISCONNECTED");
  const p2Reconnected = new TestPeer(); handleConnection(p2Reconnected);
  const resumed = p2Reconnected.request("join", { code: created.roomCode, token: p2Token });
  assert.equal(resumed.ok, true); assert.equal(resumed.playerId, 2); assert.equal(resumed.state.moves, 2);

  let guard = 0;
  while (!p1.latestState().gameFinished && guard++ < 100) {
    const state = p1.latestState(), current = state.currentTurn, position = current === 1 ? state.player1Position : state.player2Position;
    const peer = current === 1 ? p1 : p2Reconnected;
    const direction = nextDirection(map, position, map.goal);
    assert.ok(direction, `path exists from ${position}`);
    assert.equal(peer.request("move", { direction }).ok, true);
  }
  assert.equal(p1.latestState().gameFinished, true);
  assert.equal(p1.latestState().winner, p2Reconnected.latestState().winner);
  assert.equal(p1.latestState().moves, p2Reconnected.latestState().moves);
  assert.equal(p2Reconnected.request("rematch").ok, true);
  assert.equal(p1.latestState().gameFinished, false); assert.equal(p1.latestState().moves, 0);
  for (const city of ["county", "metro"]) {
    const host = new TestPeer(), guest = new TestPeer(); handleConnection(host); handleConnection(guest);
    const room = host.request("create", { city }); const other = guest.request("join", { code: room.roomCode });
    assert.equal(other.ok, true); assert.equal(other.state.city, city);
    const cityMap = MAPS[city], direction = nextDirection(cityMap, cityMap.start1, cityMap.goal);
    assert.ok(direction); assert.equal(host.request("move", { direction }).ok, true);
    assert.equal(guest.latestState().city, city); assert.equal(guest.latestState().moves, 1);
    host.request("cancel");
  }
  for (const code of [...rooms.keys()]) clearTimeout(rooms.get(code).expiryTimer);
  rooms.clear();
});
