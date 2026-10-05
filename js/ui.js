function renderMaps(){const grid=$("mapGrid");grid.innerHTML="";const palette={vice:["COASTAL · NIGHTLIFE","Coastal avenues, waterfront parks and bustling market streets."],county:["SUBURBAN · OPEN","Open county roads, generous green space and long sightlines."],metro:["URBAN · DENSE","Tight intersections, busy markets and iconic city blocks."]};Object.entries(MAPS).forEach(([key,m])=>{const b=document.createElement("button");b.className="card";b.dataset.map=key;const roads=m.edges.map(([a,c])=>{const p=m.nodes[a],q=m.nodes[c],x=p[0]/WORLD.w*100,y=p[1]/WORLD.h*100,dx=(q[0]-p[0])/WORLD.w*100,dy=(q[1]-p[1])/WORLD.h*100,len=Math.hypot(dx,dy),ang=Math.atan2(dy,dx)*180/Math.PI;return`<i class="pvroad" style="left:${x}%;top:${y}%;width:${len}%;transform:rotate(${ang}deg)"></i>`}).join("");b.innerHTML=`<div class="preview"><i class="pvwater" style="left:67%;top:65%;width:33%;height:36%"></i><i class="pvpark" style="left:23%;top:27%;width:23%;height:22%"></i>${roads}<i class="pvstart" style="left:${m.nodes[m.start1][0]/WORLD.w*100}%;top:${m.nodes[m.start1][1]/WORLD.h*100}%"></i><i class="pvgoal" style="left:${m.nodes[m.goal][0]/WORLD.w*100}%;top:${m.nodes[m.goal][1]/WORLD.h*100}%"></i></div><h2>${m.name}</h2><p><b>${palette[key][0]}</b><br>${palette[key][1]}</p><span class="select-label">${mode==="online"?"CREATE TEAM IN THIS CITY ↗":"SELECT CITY ↗"}</span>`;grid.appendChild(b)})}
$("mapGrid").addEventListener("click",e=>{const b=e.target.closest(".card");if(!b)return;if(mode==="online"){show("lobby");$("lobbyTitle").textContent="CREATING TEAM";$("lobbyStatus").textContent="SECURING A TEAM CHANNEL...";$("lobbyActions").hidden=true;Multiplayer.create(b.dataset.map).catch(err=>{show("maps");alert(networkError(err.message))})}else startGame(b.dataset.map)});
function networkError(code){
 if(code==="SERVER_UNAVAILABLE"||code==="CONNECTION_LOST"){
  if(location.protocol==="file:")return"Online Team needs the Node server. From the FOGWARS folder run `npm start`, then open http://localhost:3000/.";
  if(location.port==="8000")return"Python is serving this page on :8000, which is fine. Start the Node WebSocket server with npm start on :3000, then retry Online Team.";
  if(location.port&&location.port!=="3000")return`This page is open on port ${location.port}. Start the Node WebSocket server with npm start on :3000, or open the app at http://localhost:3000/.`;
  return"Could not reach the FOGWARS WebSocket server at this address. In the project folder run `npm start`, then open http://localhost:3000/.";
 }
 return({SERVER_TIMEOUT:"The server did not respond. Please try again.",TEAM_NOT_FOUND:"TEAM NOT FOUND",TEAM_FULL:"TEAM FULL",TEAM_EXPIRED:"TEAM EXPIRED",INVALID_CITY:"This city is unavailable."})[code]||String(code).replaceAll("_"," ")
}
$("newGame").onclick=()=>show("mode");
$("singleBtn").onclick=()=>{mode="single";show("maps")};
$("onlineBtn").onclick=()=>{mode="online";show("online")};
$("createTeam").onclick=()=>{mode="online";renderMaps();show("maps")};
$("joinTeam").onclick=()=>{$("joinError").textContent="";$("teamCodeInput").value="";show("join");$("teamCodeInput").focus()};
$("onlineBack").onclick=()=>show("mode");
$("modeBack").onclick=()=>show("title");
$("mapBack").onclick=()=>show(mode==="online"?"online":"mode");
$("joinBack").onclick=()=>show("online");
$("joinForm").addEventListener("submit",async e=>{e.preventDefault();const code=$("teamCodeInput").value.trim();if(!code){$("joinError").textContent="ENTER A TEAM CODE";return}mode="online";$("joinError").textContent="CONNECTING TO TEAM...";try{await Multiplayer.join(code);$("joinError").textContent=""}catch(err){$("joinError").textContent=networkError(err.message)}});
$("cancelTeam").onclick=async()=>{await Multiplayer.cancel();clearTimeout(onlineLobbyTimer);onlineLobbyTimer=null;running=false;clearInterval(timer);mode="single";show("online")};
$("copyCode").onclick=async()=>{const code=$("teamCodeDisplay").textContent;try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(code);else throw new Error("clipboard unavailable");$("copyCode").textContent="COPIED ✓"}catch{const field=document.createElement("textarea");field.value=code;field.style.position="fixed";field.style.opacity="0";document.body.appendChild(field);field.select();try{document.execCommand("copy");$("copyCode").textContent="COPIED ✓"}catch{$("lobbyStatus").textContent=`TEAM CODE: ${code} · COPY UNAVAILABLE`}field.remove()}setTimeout(()=>$("copyCode").textContent="COPY CODE",1800)};
$("quitGame").onclick=async()=>{running=false;clearInterval(timer);if(mode==="online"){await Multiplayer.cancel();mode="single"}show("title")};
$("again").onclick=()=>{if(mode==="online")Multiplayer.rematch().catch(e=>toast(networkError(e.message)));else startGame(mapKey)};
$("mainMenu").onclick=async()=>{if(mode==="online"){await Multiplayer.cancel();mode="single"}show("title")};
$("historyBtn").onclick=()=>{renderHistory();show("history")};
$("historyBack").onclick=()=>show("title");
$("clearHistory").onclick=()=>{if(confirm("Delete all history?")){clearHistory();renderHistory()}};
$("exitBtn").onclick=()=>alert("Close this browser tab to exit FOGWARS.");
$("routeToggle").onclick=()=>{showRoute=!showRoute;$("routeToggle").textContent=showRoute?"HIDE OPTIMAL ROUTE":"SHOW OPTIMAL ROUTE";draw()};
document.querySelectorAll(".control").forEach(b=>b.addEventListener("click",()=>move(b.dataset.dir)));
document.addEventListener("keydown",e=>{if(!running)return;const k=e.key.toLowerCase(),d=k==="w"||k==="arrowup"?"N":k==="s"||k==="arrowdown"?"S":k==="a"||k==="arrowleft"?"W":k==="d"||k==="arrowright"?"E":null;if(d){e.preventDefault();move(d)}});
