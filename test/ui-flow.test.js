"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

function makeHarness() {
  const root = path.resolve(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const ctx = new Proxy({ createLinearGradient(){return{addColorStop(){}}}, createRadialGradient(){return{addColorStop(){}}}, setLineDash(){}, measureText(){return{width:1}} }, { get(o,k){return k in o?o[k]:()=>{}}, set(o,k,v){o[k]=v;return true} });
  class Element {
    constructor(id=""){this.id=id;this.textContent="";this._html="";this.style={};this.dataset={};this.children=[];this.handlers={};this.width=1;this.height=1;this.hidden=false;const classes=new Set();this.classList={add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)}}
    set innerHTML(v){this._html=v;if(v==="")this.children=[]} get innerHTML(){return this._html}
    addEventListener(type,fn){this.handlers[type]=fn} click(event={target:this}){return this.onclick?this.onclick(event):this.handlers.click?.(event)}
    appendChild(node){this.children.push(node);return node} remove(){}
    closest(selector){return selector===".card"?this.card:null}
    focus(){} select(){}
    getBoundingClientRect(){return{width:this.id==="minimap"?190:900,height:this.id==="minimap"?135:600}}
    get clientWidth(){return this.id==="minimap"?190:900} get clientHeight(){return this.id==="minimap"?135:600}
    getContext(){return ctx}
  }
  const elements={};for(const match of html.matchAll(/\bid="([^"]+)"/g))elements[match[1]]=new Element(match[1]);
  const screens=[...html.matchAll(/<section id="([^"]+)" class="screen(?: active)?"/g)].map(x=>elements[x[1]]);
  const controls=[..."NSWE"].map(dir=>{const e=new Element();e.dataset.dir=dir;return e});
  const document={handlers:{},getElementById:id=>elements[id]||null,querySelectorAll:q=>q===".screen"?screens:q===".control"?controls:[],querySelector:()=>null,addEventListener(type,fn){this.handlers[type]=fn},createElement:()=>new Element()};
  screens[0].classList.add("active");
  const store=new Map();let id=0;
  const c={console,document,window:null,devicePixelRatio:1,Date,Math,Set,Object,Array,JSON,String,Number,Infinity,
    localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
    sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},navigator:{},location:{protocol:"http:",host:"localhost:3000"},
    setInterval:()=>++id,clearInterval(){},setTimeout(fn,ms){const n=++id;if(ms===1250)fn();return n},clearTimeout(){},confirm:()=>true,alert(){},addEventListener(){}};
  c.window=c;vm.createContext(c);
  let room=null,role=1;
  function publish(){c.onOnlineState(structuredClone(room),role)}
  c.Multiplayer={
    resume(){},identity(){return{roomCode:room?.roomCode,playerId:role,connected:true}},
    async create(city){const m=c.MAPS[city];role=1;room={roomCode:"FOG7X2",city,player1:{position:m.start1,facing:"N",connected:true},player2:{position:m.start2,facing:"N",connected:false},player1Position:m.start1,player2Position:m.start2,currentTurn:1,moves:0,gameStarted:false,gameFinished:false,winner:null,exploredState:{1:{nodes:[m.start1],edges:[]},2:{nodes:[m.start2],edges:[]}},startedAt:Date.now(),timestamp:Date.now()};publish();return{roomCode:room.roomCode,playerId:1,state:room}},
    async join(code){if(code!=="FOG7X2")throw Error("TEAM_NOT_FOUND");role=2;return{roomCode:room.roomCode,playerId:2,state:room}},
    async move(direction){if(role!==room.currentTurn)throw Error("NOT_YOUR_TURN");const m=c.MAPS[room.city],from=room[`player${role}Position`],opp={N:"S",S:"N",E:"W",W:"E"};let to=null;for(const[a,b,d]of m.edges){if(a===from&&d===direction)to=b;if(b===from&&opp[d]===direction)to=a}if(!to)throw Error("NO_ROAD");room[`player${role}Position`]=to;room[`player${role}`].position=to;room[`player${role}`].facing=direction;room.moves++;room.exploredState[role].nodes.push(to);room.exploredState[role].edges.push([from,to].sort().join("|"));if(to===m.goal){room.gameFinished=true;room.winner=role}else room.currentTurn=role===1?2:1;publish()},
    async rematch(){},async cancel(){room=null}
  };
  for(const name of ["maps.js","graph.js","camera.js","pathfinding.js","history.js","fog.js","minimap.js","renderer.js","game.js","ui.js","main.js"])vm.runInContext(fs.readFileSync(path.join(root,"js",name),"utf8"),c,{filename:name});
  return{c,elements,screens,document,controls};
}

test("menu routes into Online Team lobby/game and preserves single-player Dijkstra win/history", async()=>{
  const {c,elements:e,screens,document:doc}=makeHarness(),active=()=>screens.find(s=>s.classList.contains("active"))?.id;
  e.newGame.click();assert.equal(active(),"mode");e.onlineBtn.click();assert.equal(active(),"online");e.createTeam.click();assert.equal(active(),"maps");
  const county=e.mapGrid.children.find(x=>x.dataset.map==="county");assert.ok(county);
  await e.mapGrid.handlers.click({target:{closest:()=>county}});assert.equal(active(),"lobby");assert.equal(e.teamCodeDisplay.textContent,"FOG7X2");assert.match(e.lobbyStatus.textContent,/WAITING/);
  const roomCity=c.MAPS.county;const m=roomCity;e.playerOneReady.textContent="PLAYER 1 · READY";e.playerTwoReady.textContent="PLAYER 2 · READY";
  c.onlineState.gameStarted=true;c.onlineState.player2.connected=true;c.onOnlineState(c.onlineState,1);
  assert.equal(active(),"game");assert.equal(c.map,c.MAPS.county);assert.equal(c.mode,"online");assert.equal(c.turn,1);assert.equal(e.connectionText.textContent,"CONNECTION · ONLINE");
  assert.equal(c.isWorldCurrentlyVisible(...c.map.nodes[c.map.start2]),false,"teammate at the far start does not reveal the hidden city");
  doc.handlers.keydown({key:"ArrowRight",preventDefault(){}});assert.equal(c.moves,1);assert.equal(c.turn,2);assert.equal(c.onlineState.moves,1);assert(c.exploredEdges[1].size>0);assert.equal(c.optimal,dijkstraDistance(c.MAPS.county));
  doc.handlers.keydown({key:"ArrowRight",preventDefault(){}});assert.equal(c.moves,1,"client blocks local input while player 2 has the turn");

  await e.quitGame.click();assert.equal(active(),"title");e.newGame.click();e.onlineBtn.click();e.joinTeam.click();assert.equal(active(),"join");e.teamCodeInput.value="NOPE";
  await e.joinForm.handlers.submit({preventDefault(){}});assert.equal(e.joinError.textContent,"TEAM NOT FOUND");e.joinBack.click();e.onlineBack.click();
  e.newGame.click();e.singleBtn.click();
  const vice=e.mapGrid.children.find(x=>x.dataset.map==="vice");await e.mapGrid.handlers.click({target:{closest:()=>vice}});assert.equal(active(),"game");assert.equal(c.mode,"single");
  const g=vm.runInContext("graph()",c),route=c.optimalPath.slice();for(let i=1;i<route.length;i++){const dir=g[route[i-1]].find(edge=>edge.to===route[i]).dir;const key={N:"ArrowUp",S:"ArrowDown",E:"ArrowRight",W:"ArrowLeft"}[dir];doc.handlers.keydown({key,preventDefault(){}})}
  assert.equal(active(),"win");assert.equal(e.winTitle.textContent,"MISSION COMPLETE");e.mainMenu.click();e.historyBtn.click();assert.equal(active(),"history");assert.equal(e.hg.textContent,1);
});

function dijkstraDistance(map){
  const adj={};for(const id of Object.keys(map.nodes))adj[id]=[];const opp={N:"S",S:"N",E:"W",W:"E"};for(const[a,b,d]of map.edges){adj[a].push({to:b,dir:d,cost:1});adj[b].push({to:a,dir:opp[d],cost:1})}
  const dist=Object.fromEntries(Object.keys(adj).map(id=>[id,Infinity]));dist[map.start1]=0;const q=[map.start1];while(q.length){const u=q.shift();for(const e of adj[u])if(dist[e.to]>dist[u]+1){dist[e.to]=dist[u]+1;q.push(e.to)}}return dist[map.goal]
}
