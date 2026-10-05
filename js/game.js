var mode="single",mapKey="vice",map=null,turn=1,players={},moves=0,elapsed=0,timer=null,running=false,optimal=0,optimalPath=[],showRoute=false,explored={1:new Set(),2:new Set()},exploredEdges={1:new Set(),2:new Set()};
var onlinePlayerId=null,onlineState=null,onlineResultShown=false,onlineLobbyTimer=null;
const canvas=document.getElementById("canvas"),ctx=canvas.getContext("2d"),$=id=>document.getElementById(id);
function formatTime(s){return String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0")}
function show(id){document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));$(id).classList.add("active")}
function resize(){const d=devicePixelRatio||1;for(const c of [canvas,$("minimap")]){const r=c.getBoundingClientRect();c.width=Math.max(1,r.width*d);c.height=Math.max(1,r.height*d)}ctx.setTransform(d,0,0,d,0,0);if(running)draw()}
window.addEventListener("resize",resize);
function applyExploration(state){
 if(!state?.exploredState)return;
 for(const id of [1,2]){explored[id]=new Set(state.exploredState[id]?.nodes||[]);exploredEdges[id]=new Set(state.exploredState[id]?.edges||[])}
}
function startGame(key,snapshot=null){
 mapKey=key;map=MAPS[key];if(!map)return;
 if(mode!=="online"){
  turn=1;moves=0;elapsed=0;running=true;showRoute=false;explored={1:new Set(),2:new Set()};exploredEdges={1:new Set(),2:new Set()};
  players={1:{node:map.start1,moves:0,facing:"N"},2:{node:map.start2,moves:0,facing:"N"}};
 }else{
  snapshot=snapshot||onlineState;if(!snapshot)return;
  turn=snapshot.currentTurn;moves=snapshot.moves;elapsed=Math.max(0,Math.floor((Date.now()-snapshot.startedAt)/1000));running=!snapshot.gameFinished;showRoute=false;applyExploration(snapshot);
  players={1:{node:snapshot.player1Position,moves:0,facing:snapshot.player1.facing||"N"},2:{node:snapshot.player2Position,moves:0,facing:snapshot.player2.facing||"N"}};
  onlineResultShown=false;
 }
 const dj=dijkstra(map.start1,map.goal);optimal=dj?.distance||0;optimalPath=dj?.path||[];
 $("cityText").textContent=map.name+" · "+(mode==="single"?"SOLO":mode==="online"?"ONLINE TEAM":"DUO");
 $("modeText").textContent=mode==="single"?"SINGLE PLAYER":mode==="online"?"ONLINE TEAM":"LOCAL 2 PLAYER";
 $("optimalText").textContent=optimal;$("networkHud").hidden=mode!=="online";
 show("game");resize();update();clearInterval(timer);
 timer=setInterval(()=>{if(!running)return;if(mode==="online"&&onlineState?.startedAt)elapsed=Math.max(0,Math.floor((Date.now()-onlineState.startedAt)/1000));else elapsed++;$("timeText").textContent=formatTime(elapsed)},1000);
}
function update(){
 if(!players[turn])return;
 const p=players[turn];$("movesText").textContent=moves;$("yourMoves").textContent=mode==="online"?moves:p.moves;
 $("turnText").textContent=mode==="single"?"PLAYER 1":"PLAYER "+turn;$("turnBox").textContent=mode==="single"?"PLAYER 1":"PLAYER "+turn;
 $("playerText").textContent=mode==="online"?`P${onlinePlayerId||"?"} · P${turn}`:mode==="two"?`P${turn} · P${turn}`:"PLAYER 1";
 if(mode==="online"){
  const identity=$("identityHud"),mine=onlinePlayerId===turn;
  $("teamHud").textContent=`TEAM: ${onlineState?.roomCode||"------"}`;
  identity.textContent=`YOU: PLAYER ${onlinePlayerId||"?"} · ${mine?"YOUR TURN":`PLAYER ${turn} TURN`}`;
  identity.style.color=mine?"#8dffe3":"#ffe0a6";
  $("teammateHud").textContent=`TEAMMATE: PLAYER ${onlinePlayerId===1?2:1}`;
  $("connectionText").textContent=`CONNECTION · ${onlineState?.player1.connected&&onlineState?.player2.connected?"ONLINE":"TEAMMATE DISCONNECTED"}`;
 }
 updateFogState();updateCamera();draw();
}
function move(dir){
 if(!running)return;
 if(mode==="online"){
  if(onlinePlayerId!==turn){toast("WAIT FOR PLAYER "+turn+"'S TURN");return}
  Multiplayer.move(dir).catch(e=>toast(({NO_ROAD:"NO ROAD IN THAT DIRECTION",NOT_YOUR_TURN:"TURN CHANGED · WAIT FOR YOUR TURN",TEAMMATE_DISCONNECTED:"WAITING FOR TEAMMATE",GAME_NOT_ACTIVE:"TEAM GAME IS NOT ACTIVE"})[e.message]||"CONNECTION INTERRUPTED"));return;
 }
 const from=players[turn].node,e=graph()[from].find(x=>x.dir===dir);if(!e){toast("NO ROAD IN THAT DIRECTION");return}markRoadExplored(from,e.to,turn);players[turn].facing=dir;players[turn].node=e.to;players[turn].moves++;moves++;if(players[turn].node===map.goal){finish(turn);return}if(mode==="two")turn=turn===1?2:1;update()
}
function toast(t){const old=document.querySelector(".toast");old?.remove();const el=document.createElement("div");el.className="toast";el.textContent=t;$("game").appendChild(el);setTimeout(()=>el.remove(),1200)}
function finish(winner){
 if(!running&&onlineResultShown)return;
 running=false;clearInterval(timer);elapsed=mode==="online"&&onlineState?.startedAt?Math.max(0,Math.floor((Date.now()-onlineState.startedAt)/1000)):elapsed;
 $("finalTime").textContent=formatTime(elapsed);$("finalMoves").textContent=moves;$("finalOptimal").textContent=optimal;
 $("efficiency").textContent=`EFFICIENCY · ${Math.round(optimal/Math.max(moves,optimal)*100)}%`;
 $("winTitle").textContent=mode==="online"?"MISSION COMPLETE":mode==="two"?"PLAYER "+winner+" WINS":"MISSION COMPLETE";
 $("winMsg").textContent=mode==="online"?`TEAM ${onlineState?.roomCode||""} · PLAYER 1 ✓ · PLAYER 2 ✓ · PLAYER ${winner} REACHED THE CENTER`:`${map.name} · ${mode==="two"?"First navigator to reach the center wins.":"You reached the center."}`;
 if(mode==="online")onlineResultShown=true;
 saveHistory(winner);$("again").textContent=mode==="online"?"PLAY AGAIN · TEAM":"PLAY AGAIN";show("win");
}
function onOnlineState(state,playerId){
 if(playerId)onlinePlayerId=playerId;
 onlineState=state;mode="online";mapKey=state.city;map=MAPS[mapKey];if(!map)return;
 turn=state.currentTurn;moves=state.moves;applyExploration(state);
 players={1:{node:state.player1Position,moves:0,facing:state.player1.facing||"N"},2:{node:state.player2Position,moves:0,facing:state.player2.facing||"N"}};
 $("teamCodeDisplay").textContent=state.roomCode;$("teamHud").textContent=`TEAM: ${state.roomCode}`;
 $("playerOneReady").textContent=`PLAYER 1 · ${onlinePlayerId===1?"YOU · ":""}${state.player1.connected?"READY ✓":"WAITING..."}`;
 $("playerTwoReady").textContent=`PLAYER 2 · ${onlinePlayerId===2?"YOU · ":""}${state.player2.connected?"READY ✓":"WAITING..."}`;
 if(!state.gameStarted){clearTimeout(onlineLobbyTimer);$("lobbyTitle").textContent="TEAM ASSEMBLY";$("lobbyStatus").textContent="WAITING FOR TEAMMATE...";$("lobbyActions").hidden=false;show("lobby");return}
 if(state.gameFinished){if(!onlineResultShown){const dj=dijkstra(map.start1,map.goal);optimal=dj?.distance||0;optimalPath=dj?.path||[];finish(state.winner)}return}
 if(running){
  elapsed=Math.max(0,Math.floor((Date.now()-state.startedAt)/1000));update();
  const teammateConnected=onlinePlayerId===1?state.player2.connected:state.player1.connected;
  $("connectionText").textContent=state.player1.connected&&state.player2.connected?"CONNECTION · ONLINE":teammateConnected?"CONNECTION · YOU RECONNECTING":"CONNECTION · TEAMMATE DISCONNECTED";return;
 }
 if(onlineLobbyTimer)return;
 $("lobbyTitle").textContent="TEAM READY";$("lobbyStatus").textContent=`TEAM FOUND · ${MAPS[state.city].name} · NAVIGATION STARTS NOW`;
 $("lobbyActions").hidden=true;$("teamLabel").textContent="CONNECTED NAVIGATORS";show("lobby");
 onlineLobbyTimer=setTimeout(()=>{onlineLobbyTimer=null;if(onlineState&&!onlineState.gameFinished)startGame(onlineState.city,onlineState)},1250);
}
function onOnlineConnection(connected,message){
 if($("connectionText"))$("connectionText").textContent=`CONNECTION · ${connected?"ONLINE":message||"RECONNECTING..."}`;
 if(!connected&&onlineState&&!onlineState.gameFinished){$("lobbyStatus").textContent="TEAMMATE DISCONNECTED · RECONNECTING...";if(!running&&document.getElementById("lobby").classList.contains("active"))show("lobby")}
}
function onOnlineNotice(notice){
 clearTimeout(onlineLobbyTimer);onlineLobbyTimer=null;
 const message=notice.message||notice.code||"NETWORK ISSUE";
 if(notice.code==="TEAM_EXPIRED"||notice.code==="TEAM_CANCELLED"){
  running=false;clearInterval(timer);$("joinError").textContent=message;$("lobbyStatus").textContent=message;show("online");
 }else{$("lobbyStatus").textContent=message;toast(message)}
}
