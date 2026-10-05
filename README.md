# FOGWARS

FOGWARS is a vanilla JavaScript city navigation game. Its original three city graphs, graph-based movement, Dijkstra route, local exploration fog, and game history remain in place. Online Team mode adds an authoritative Node.js/WebSocket room server; it does not use local storage to synchronize players.

## Run

Start the dependency-free Node.js application server from this folder:

```sh
npm start
```

The Node server serves the complete app at <http://localhost:3000/> and validates team rooms, turns, graph moves, explored nodes, move totals, and mission completion. If you also start `python3 -m http.server 8000`, you may open <http://localhost:8000/> instead: pages on that port connect their WebSocket to the Node service on port 3000. Both players must use the same reachable server. Internet hosting or port forwarding is only needed if the two players are on different networks. Remote HTTPS hosting needs a TLS reverse proxy that forwards WebSocket upgrades to this server.

## Online Team

Choose **NEW GAME → ONLINE TEAM → CREATE TEAM**, select the city, then share the generated team code. The other player chooses **ONLINE TEAM → JOIN TEAM** and enters the code. The server starts the session after the second player joins. Both clients receive server-authoritative position, turn, move count, game result, and per-player explored graph state. The canvas and minimap still apply the local fog-of-war rules and hide distant objectives and remote player markers.

Refreshes and temporary network loss attempt to reconnect to the same room using a per-browser session token. Rooms expire after 30 minutes. Game history remains local to each browser.

## Structure

- `index.html` contains the screens and controls.
- `css/` contains shared, menu, and gameplay styles.
- `js/maps.js` contains the city graphs and shared map data (also loaded by Node for validation).
- `js/graph.js` and `js/pathfinding.js` provide the existing graph and Dijkstra systems.
- `js/multiplayer.js` handles browser WebSocket transport and reconnect state.
- `server.js` uses Node.js core HTTP and WebSocket protocol support to serve the app and keep temporary authoritative multiplayer rooms in memory; no npm dependencies are required.
- `js/camera.js`, `js/fog.js`, `js/renderer.js`, and `js/minimap.js` retain local navigation visibility.
- `js/game.js`, `js/ui.js`, and `js/history.js` handle play, screens, and per-browser results.

Room state is in server memory and is intentionally temporary; restarting the Node process closes active rooms.
