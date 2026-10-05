// The renderer is deliberately a visual layer over MAPS.nodes/MAPS.edges.
// Every street follows a real graph edge; procedural lots are kept clear of roads.
function visible(x,y,pad=100){return x+pad>=0&&y+pad>=0&&x-pad<=canvas.clientWidth&&y-pad<=canvas.clientHeight}
function hash2(x,y){const n=Math.sin(x*127.1+y*311.7+(mapKey.length*19.3))*43758.5453;return n-Math.floor(n)}
function worldEllipseContains(x,y,area,padding=0){const rx=Math.max(1,area[2]/2+padding),ry=Math.max(1,area[3]/2+padding),dx=(x-area[0])/rx,dy=(y-area[1])/ry;return dx*dx+dy*dy<1}
function roadDistance(x,y){let best=Infinity;for(const [a,b] of map.edges){const p=map.nodes[a],q=map.nodes[b],vx=q[0]-p[0],vy=q[1]-p[1],t=Math.max(0,Math.min(1,((x-p[0])*vx+(y-p[1])*vy)/(vx*vx+vy*vy))),dx=x-(p[0]+t*vx),dy=y-(p[1]+t*vy);best=Math.min(best,Math.hypot(dx,dy))}return best}
function isProtectedLot(x,y){return map.water.some(a=>worldEllipseContains(x,y,a,28000))||map.parks.some(a=>worldEllipseContains(x,y,a,22000))||map.markets.some(a=>worldEllipseContains(x,y,a,60000))}

function draw(){
 if(!map||!running)return;
 const w=canvas.clientWidth,h=canvas.clientHeight;
 ctx.clearRect(0,0,w,h);
 drawBackground(w,h);                 // 1. background
 drawTerrain();                       // 2. terrain/parcels
 drawWater();                         // 3. water
 drawParks();                         // 4. parks
 drawCityBuildings();                 // 5. homes and blocks
 drawTerminalBarriers();              // 6. obstacles only beyond graph terminal nodes
 drawRoads();                         // 7. road base, curb and asphalt
 drawRoadMarkings();                  // 8. lane marks and crosswalks
 drawMarketsAndLandmarks();           // 9. shops and city identity
 drawStreetLights();                  // 9b. roadside light pools
 drawGraphNodes();                    // 10. true navigation intersections
 drawAtmosphericParticles();          // restrained local ambience
 if(showRoute)drawOptimalRoute();     // 11. optional Dijkstra route
 drawFog();                           // 12. fog is confined to this map canvas
 drawVisiblePlayers();                // 13. characters above fog
 drawGoal();                          // 14. center marker above fog
 drawMinimap();
}

function drawBackground(w,h){
 const g=ctx.createLinearGradient(0,0,w,h),urban=mapKey==="metro",coastal=mapKey==="vice";
 g.addColorStop(0,urban?"#182433":coastal?"#20182c":"#30241d");g.addColorStop(.55,urban?"#111d2a":coastal?"#17192a":"#25231c");g.addColorStop(1,urban?"#101923":coastal?"#111c27":"#17231d");ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
}
function drawTerrain(){
 const step=110000,startX=Math.floor((cam.x-150000)/step)*step,startY=Math.floor((cam.y-150000)/step)*step;
 for(let x=startX;x<cam.x+canvas.clientWidth/VIEW_SCALE+step;x+=step)for(let y=startY;y<cam.y+canvas.clientHeight/VIEW_SCALE+step;y+=step){
  const px=sx(x),py=sy(y),r=hash2(x/step,y/step),width=mapKey==="county"?"#25322a":mapKey==="metro"?"#20282a":"#202e2c";
  ctx.fillStyle=r>.55?width:(mapKey==="county"?"#222f27":"#1d2929");ctx.fillRect(px+5,py+5,Math.max(1,step*VIEW_SCALE-10),Math.max(1,step*VIEW_SCALE-10));
  if(r>.89){ctx.strokeStyle="rgba(156,177,139,.10)";ctx.lineWidth=1;ctx.strokeRect(px+12,py+12,step*VIEW_SCALE-24,step*VIEW_SCALE-24)}
 }
}

function drawWater(){
 for(const a of map.water){const x=sx(a[0]),y=sy(a[1]),rx=a[2]*VIEW_SCALE/2,ry=a[3]*VIEW_SCALE/2;if(!visible(x,y,Math.max(rx,ry)))continue;
  const vice=mapKey==="vice",shore=vice?"#c359ba":mapKey==="metro"?"#4a9dcc":"#d28e53",water0=vice?"#183c68":"#15505a",water1=vice?"#123651":"#0c3947";
  ctx.save();ctx.shadowColor=vice?"#38cfff":"#48a9cb";ctx.shadowBlur=vice?24:12;ctx.fillStyle=vice?"#8352aa":"#b5a77b";ctx.beginPath();ctx.ellipse(x,y,rx+7,ry+7,-.12,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
  const g=ctx.createLinearGradient(x-rx,y-ry,x+rx,y+ry);g.addColorStop(0,water0);g.addColorStop(.45,water1);g.addColorStop(1,"#092a38");ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(x,y,rx,ry,-.12,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle=shore;ctx.lineWidth=2.3;ctx.beginPath();ctx.ellipse(x,y,rx-2,ry-2,-.12,0,Math.PI*2);ctx.stroke();
  for(let i=-3;i<=3;i++){const wy=y+i*ry*.22;if(wy<y-ry||wy>y+ry)continue;ctx.strokeStyle=vice?(i%2?"rgba(239,106,226,.30)":"rgba(102,235,255,.52)"):(i%2?"rgba(139,213,204,.25)":"rgba(114,205,208,.43)");ctx.shadowColor=vice?"#43dfff":"#61d5dc";ctx.shadowBlur=vice?7:3;ctx.lineWidth=i%2?1:1.5;ctx.beginPath();ctx.ellipse(x+i*19,wy,Math.max(7,rx*.18),Math.max(2,ry*.018),-.12,0,Math.PI*2);ctx.stroke()}ctx.shadowBlur=0;
  // Graph edges drawn later become visible causeways/bridges across water where the source graph allows them.
  ctx.restore();
 }
}

function drawTree(x,y,r){
 ctx.save();ctx.fillStyle="rgba(0,0,0,.28)";ctx.beginPath();ctx.ellipse(x+3,y+5,r*1.05,r*.78,0,0,Math.PI*2);ctx.fill();ctx.fillStyle="#684c35";ctx.fillRect(x-2,y-1,4,r*.75);
 const canopy=ctx.createRadialGradient(x-r*.35,y-r*.45,1,x,y,r);canopy.addColorStop(0,"#6eaa5c");canopy.addColorStop(.62,"#367b49");canopy.addColorStop(1,"#20523a");ctx.fillStyle=canopy;ctx.beginPath();ctx.arc(x,y-r*.22,r,0,Math.PI*2);ctx.fill();ctx.strokeStyle="rgba(157,206,119,.25)";ctx.lineWidth=1;ctx.beginPath();ctx.arc(x-r*.08,y-r*.3,r*.7,3.5,5.5);ctx.stroke();ctx.restore();
}
function drawParks(){
 for(let pi=0;pi<map.parks.length;pi++){const a=map.parks[pi],x=sx(a[0]),y=sy(a[1]),rx=a[2]*VIEW_SCALE/2,ry=a[3]*VIEW_SCALE/2;if(!visible(x,y,Math.max(rx,ry)))continue;
  ctx.fillStyle="rgba(6,15,12,.36)";ctx.beginPath();ctx.ellipse(x+3,y+5,rx+5,ry+5,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=mapKey==="county"?"#315c3e":"#28583c";ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle="#66865a";ctx.lineWidth=3;ctx.setLineDash([9,5]);ctx.beginPath();ctx.ellipse(x,y,rx-3,ry-3,0,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
  // Looping footpath and small pond are park scenery, never graph edges.
  ctx.strokeStyle="rgba(211,199,142,.70)";ctx.lineWidth=5;ctx.beginPath();ctx.ellipse(x-rx*.08,y+ry*.06,rx*.56,ry*.30,-.12,0,Math.PI*2);ctx.stroke();ctx.strokeStyle="rgba(240,222,163,.45)";ctx.lineWidth=1;ctx.stroke();
  if(pi===0&&mapKey!=="county"){ctx.fillStyle="#135466";ctx.strokeStyle="#68a49a";ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(x+rx*.3,y-ry*.22,Math.max(7,rx*.1),Math.max(4,ry*.09),-.3,0,Math.PI*2);ctx.fill();ctx.stroke()}
  const step=105000;for(let tx=Math.floor((a[0]-a[2]*.43)/step)*step;tx<a[0]+a[2]*.43;tx+=step)for(let ty=Math.floor((a[1]-a[3]*.38)/step)*step;ty<a[1]+a[3]*.38;ty+=step){if(worldEllipseContains(tx,ty,a,-16000)&&hash2(tx/step,ty/step)>.30){const sx1=sx(tx),sy1=sy(ty);if(visible(sx1,sy1,20))drawTree(sx1,sy1,8+hash2(ty/step,tx/step)*4)}}
  ctx.fillStyle="#a99768";for(const side of [-1,1]){const bx=x+side*rx*.48,by=y+ry*.12;ctx.fillRect(bx-6,by-2,13,3);ctx.fillStyle="#493e2c";ctx.fillRect(bx-5,by+1,2,3);ctx.fillRect(bx+4,by+1,2,3);ctx.fillStyle="#a99768"}
 }
}

function drawBuilding(x,y,w,h,type,seed){
 if(!visible(x,y,Math.max(w,h)+8))return;ctx.save();
 const colors=mapKey==="vice"?{wall:"#b17da6",roof:"#694e84",dark:"#4b365e",glass:"#a1f6f1"}:mapKey==="county"?{wall:"#b39a6d",roof:"#654a33",dark:"#493a2d",glass:"#ffc873"}:{wall:"#849cad",roof:"#465e7b",dark:"#354255",glass:"#9be8ff"};
 const left=x-w/2,top=y-h/2,depth=Math.max(3,h*.15),house=type==="house",shop=type==="shop",warehouse=type==="warehouse",apt=type==="apartment";
 ctx.fillStyle="rgba(0,0,0,.35)";ctx.beginPath();ctx.ellipse(x+4,y+depth+4,w*.62,h*.55,0,0,Math.PI*2);ctx.fill();
 ctx.fillStyle=colors.dark;ctx.fillRect(left,top+depth,w,h-depth);ctx.fillStyle=colors.wall;ctx.fillRect(left,top,w,h-depth);
 ctx.fillStyle=colors.roof;ctx.beginPath();if(house){ctx.moveTo(left-2,top+h*.25);ctx.lineTo(x,top-2);ctx.lineTo(left+w+2,top+h*.25);ctx.lineTo(left+w,top+h*.83);ctx.lineTo(left,top+h*.83)}else{ctx.moveTo(left+2,top+2);ctx.lineTo(left+w-2,top+2);ctx.lineTo(left+w,top+h*.78);ctx.lineTo(left+4,top+h*.78)}ctx.closePath();ctx.fill();
 ctx.strokeStyle="rgba(255,235,198,.35)";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(left+3,top+h*.24);ctx.lineTo(x,top+2);ctx.lineTo(left+w-3,top+h*.24);ctx.stroke();
 if(apt||warehouse){const rows=apt?2:1,cols=Math.max(2,Math.floor(w/10));for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){const wx=left+5+col*((w-10)/cols),wy=top+5+row*((h*.48)/rows),lit=(seed+row+col)%3!==1;ctx.fillStyle=lit?colors.glass:"#273341";ctx.shadowColor=lit?colors.glass:"transparent";ctx.shadowBlur=lit?5:0;ctx.fillRect(wx,wy,3,4)}ctx.shadowBlur=0}
 else{ctx.fillStyle=colors.glass;ctx.shadowColor=colors.glass;ctx.shadowBlur=5;ctx.fillRect(left+w*.2,top+h*.45,4,5);ctx.fillRect(left+w*.65,top+h*.45,4,5);ctx.shadowBlur=0;ctx.fillStyle="#45362d";ctx.fillRect(x-2,top+h*.58,5,h*.2)}
 if(shop){const neon=mapKey==="vice"?"#ff75dd":mapKey==="metro"?"#77dfff":"#ffc467";ctx.shadowColor=neon;ctx.shadowBlur=8;ctx.fillStyle=neon;ctx.fillRect(left-2,top+h*.35,w+4,4);for(let i=0;i<4;i++){ctx.fillStyle=i%2?"#ec719c":"#ffe29a";ctx.fillRect(left+i*w/4,top+h*.34,w/4,4)}ctx.fillStyle="#f3dfad";ctx.fillRect(left+w*.25,top+h*.12,w*.5,5);ctx.shadowBlur=0}
 if(house){ctx.fillStyle="#d2b888";ctx.fillRect(x-3,top+h*.79,6,4);ctx.fillStyle="#49604c";ctx.fillRect(left-4,top+h*.88,3,5);ctx.fillRect(left+w+1,top+h*.88,3,5)}
 ctx.restore();
}

function drawCityBuildings(){
 const cell=78000,startX=Math.floor((cam.x-100000)/cell)*cell,startY=Math.floor((cam.y-100000)/cell)*cell;
 for(let wx=startX;wx<cam.x+canvas.clientWidth/VIEW_SCALE+cell;wx+=cell)for(let wy=startY;wy<cam.y+canvas.clientHeight/VIEW_SCALE+cell;wy+=cell){
  const seed=hash2(wx/cell,wy/cell);if(seed<.10)continue;const xw=wx+cell*(.27+seed*.45),yw=wy+cell*(.24+hash2(wy/cell,wx/cell)*.5);
  if(isProtectedLot(xw,yw)||roadDistance(xw,yw)<35000)continue;
  const x=sx(xw),y=sy(yw),size=mapKey==="county"?"house":mapKey==="metro"?(seed>.57?"apartment":"shop"):(seed>.70?"apartment":seed>.43?"shop":"house");
  const bw=(size==="house"?24: size==="apartment"?32:size==="shop"?35:40)+seed*10,bh=(size==="house"?19:24)+hash2(wx/cell+4,wy/cell+2)*8;
  // Suburban lots retain a garden around detached homes.
  if(size==="house"&&mapKey==="county"){ctx.fillStyle="rgba(102,139,80,.38)";ctx.fillRect(x-bw*.75,y-bh*.72,bw*1.5,bh*1.5)}
  drawBuilding(x,y,bw,bh,size,Math.floor(seed*9));
  if(seed>.72&&roadDistance(xw+27000,yw+22000)>22000){drawTree(x+20,y+15,5);ctx.fillStyle="#b4a27d";ctx.fillRect(x-20,y+19,7,2)}
 }
}

function drawTerminalBarriers(){
 const g=graph();for(const [id,node] of Object.entries(map.nodes)){const adjacent=g[id]||[];if(adjacent.length!==1)continue;const prev=map.nodes[adjacent[0].to],dx=node[0]-prev[0],dy=node[1]-prev[1],len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len,x=sx(node[0]+ux*43000),y=sy(node[1]+uy*43000);if(!visible(x,y,16))continue;
  const px=-uy*11,py=ux*11;ctx.strokeStyle="#17191a";ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(x-px,y-py);ctx.lineTo(x+px,y+py);ctx.stroke();ctx.strokeStyle="#e0a54c";ctx.lineWidth=5;ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(x-px,y-py);ctx.lineTo(x+px,y+py);ctx.stroke();ctx.setLineDash([]);
  for(const s of [-1,1]){ctx.fillStyle="#ef874b";ctx.beginPath();ctx.moveTo(x+px*s-4,y+py*s+4);ctx.lineTo(x+px*s+4,y+py*s+4);ctx.lineTo(x+px*s,y+py*s-5);ctx.closePath();ctx.fill()}
 }
}

function drawRoads(){
 for(const [a,b] of map.edges){const p=map.nodes[a],q=map.nodes[b],x1=sx(p[0]),y1=sy(p[1]),x2=sx(q[0]),y2=sy(q[1]);if(Math.max(x1,x2)<-80||Math.min(x1,x2)>canvas.clientWidth+80||Math.max(y1,y2)<-80||Math.min(y1,y2)>canvas.clientHeight+80)continue;
  const major=Math.hypot(q[0]-p[0],q[1]-p[1])>310000||a===map.goal||b===map.goal,outer=major?32:25,sidewalk=major?26:20,asphalt=major?20:15,accent=mapKey==="vice"?"#ed65de":mapKey==="county"?"#dfa05a":"#64bdf2",traveled=exploredEdges[turn]?.has([a,b].sort().join("|"));
  ctx.lineCap="round";ctx.lineJoin="round";ctx.strokeStyle="rgba(3,7,8,.75)";ctx.lineWidth=outer+4;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
  ctx.strokeStyle=mapKey==="vice"?"#9e598b":mapKey==="county"?"#9b7548":"#557f9f";ctx.lineWidth=outer;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
  ctx.strokeStyle=mapKey==="metro"?"#778c99":mapKey==="vice"?"#72708e":"#8c795d";ctx.lineWidth=sidewalk;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
  ctx.save();ctx.globalAlpha=traveled?.76:.26;ctx.strokeStyle=accent;ctx.shadowColor=accent;ctx.shadowBlur=traveled?13:8;ctx.lineWidth=asphalt+4;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.restore();
  ctx.strokeStyle=mapKey==="vice"?"#303149":mapKey==="county"?"#37312a":"#202e3c";ctx.lineWidth=asphalt;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
  if(edgeCrossesWater(p,q))drawBridgeRails(x1,y1,x2,y2);
 }
}
function edgeCrossesWater(p,q){for(const area of map.water)for(let i=1;i<10;i++){const t=i/10;if(worldEllipseContains(p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t,area))return true}return false}
function drawBridgeRails(x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy),px=-dy/len*12,py=dx/len*12;ctx.save();ctx.strokeStyle="#8ca7a2";ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(x1+px,y1+py);ctx.lineTo(x2+px,y2+py);ctx.moveTo(x1-px,y1-py);ctx.lineTo(x2-px,y2-py);ctx.stroke();ctx.fillStyle="#c4b687";for(const t of [.16,.84]){ctx.beginPath();ctx.arc(x1+dx*t+px,y1+dy*t+py,1.8,0,7);ctx.arc(x1+dx*t-px,y1+dy*t-py,1.8,0,7);ctx.fill()}ctx.restore()}
function drawRoadMarkings(){
 for(const [a,b] of map.edges){const p=map.nodes[a],q=map.nodes[b],x1=sx(p[0]),y1=sy(p[1]),x2=sx(q[0]),y2=sy(q[1]);if(Math.max(x1,x2)<-40||Math.min(x1,x2)>canvas.clientWidth+40||Math.max(y1,y2)<-40||Math.min(y1,y2)>canvas.clientHeight+40)continue;
  const major=Math.hypot(q[0]-p[0],q[1]-p[1])>310000||a===map.goal||b===map.goal;ctx.strokeStyle=mapKey==="vice"?(major?"rgba(109,244,255,.96)":"rgba(226,191,241,.8)"):mapKey==="county"?(major?"rgba(255,190,101,.95)":"rgba(226,205,163,.8)"):(major?"rgba(134,215,255,.98)":"rgba(205,227,241,.82)");ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=major?5:2;ctx.lineWidth=major?1.7:1.2;ctx.setLineDash(major?[10,9]:[6,10]);ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.setLineDash([]);ctx.shadowBlur=0;
 }
 const g=graph();for(const [id,node] of Object.entries(map.nodes)){const exits=g[id]||[];if(exits.length<3)continue;for(const e of exits){const q=map.nodes[e.to],dx=q[0]-node[0],dy=q[1]-node[1],len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len,cx=sx(node[0]+ux*29000),cy=sy(node[1]+uy*29000),px=-uy*7,py=ux*7;for(let k=0;k<3;k++){const d=k*4;ctx.strokeStyle="rgba(218,210,174,.75)";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(cx+ux*d-px,cy+uy*d-py);ctx.lineTo(cx+ux*d+px,cy+uy*d+py);ctx.stroke()}}}
}

function drawShop(x,y,label,variant=0){
 if(roadDistance(x,y)<33000)return;const sx1=sx(x),sy1=sy(y);if(!visible(sx1,sy1,35))return;drawBuilding(sx1,sy1,variant?33:28,variant?22:18,"shop",variant+2);
 const sign=mapKey==="vice"?"#ff91e5":mapKey==="county"?"#ffd078":"#8de2ff";ctx.fillStyle=sign;ctx.shadowColor=sign;ctx.shadowBlur=8;ctx.font="bold 7px sans-serif";ctx.textAlign="center";ctx.fillText(label,sx1,sy1-15);ctx.textAlign="start";ctx.shadowBlur=0;
}
function drawLandmark(l){
 const [wx,wy,type,label]=l,x=sx(wx),y=sy(wy),neon=mapKey==="vice"?"#ff75dc":mapKey==="county"?"#ffc26e":"#81d9ff";if(!visible(x,y,55))return;const nearRoad=roadDistance(wx,wy)<25000;
 // If authored landmark metadata sits too close to a street, shift only its art, never the graph.
 const ox=nearRoad?52:0,oy=nearRoad?-42:0;
 if(type==="tower"||type==="waterTower"){
  ctx.fillStyle="rgba(0,0,0,.4)";ctx.beginPath();ctx.ellipse(x+ox+3,y+oy+10,20,9,0,0,7);ctx.fill();ctx.fillStyle=type==="tower"?"#59696a":"#938665";ctx.fillRect(x+ox-13,y+oy-7,26,18);ctx.fillStyle="#bbc5b6";ctx.fillRect(x+ox-9,y+oy-16,18,11);ctx.fillStyle=neon;ctx.beginPath();ctx.moveTo(x+ox,y+oy-50);ctx.lineTo(x+ox-10,y+oy-16);ctx.lineTo(x+ox+10,y+oy-16);ctx.closePath();ctx.fill();ctx.shadowColor=neon;ctx.shadowBlur=14;ctx.fillStyle="#fff4cf";ctx.fillRect(x+ox-2,y+oy-49,4,8);ctx.shadowBlur=0;
 }else if(type==="stadium"){
  ctx.fillStyle="#30383a";ctx.beginPath();ctx.ellipse(x+ox,y+oy,34,23,0,0,7);ctx.fill();ctx.strokeStyle="#a8996f";ctx.lineWidth=3;ctx.stroke();ctx.fillStyle="#56794d";ctx.beginPath();ctx.ellipse(x+ox,y+oy,23,13,0,0,7);ctx.fill();ctx.strokeStyle="#d6c78f";ctx.lineWidth=1;ctx.stroke();
 }else if(type==="fountain"){
  ctx.fillStyle="#bbb08b";ctx.beginPath();ctx.arc(x+ox,y+oy,20,0,7);ctx.fill();ctx.fillStyle="#27778a";ctx.beginPath();ctx.arc(x+ox,y+oy,14,0,7);ctx.fill();ctx.fillStyle="#8ce2dc";ctx.beginPath();ctx.arc(x+ox,y+oy,5,0,7);ctx.fill();
 }else{
  ctx.fillStyle="#aa9872";ctx.fillRect(x+ox-28,y+oy-19,56,38);ctx.fillStyle="#6b9261";ctx.fillRect(x+ox-20,y+oy-13,40,26);ctx.strokeStyle="#ead89d";ctx.lineWidth=2;ctx.strokeRect(x+ox-20,y+oy-13,40,26);ctx.fillStyle="#d8c68d";ctx.fillRect(x+ox-2,y+oy-26,4,52);ctx.fillRect(x+ox-28,y+oy-2,56,4);
 }
 ctx.fillStyle="rgba(5,11,11,.88)";const tw=Math.min(110,label.length*5+12);ctx.fillRect(x+ox-tw/2,y+oy+22,tw,13);ctx.fillStyle=neon;ctx.shadowColor=neon;ctx.shadowBlur=6;ctx.font="bold 7px sans-serif";ctx.textAlign="center";ctx.fillText(label,x+ox,y+oy+31);ctx.textAlign="start";ctx.shadowBlur=0;
}
function drawMarketsAndLandmarks(){
 map.markets.forEach((m,i)=>{const [cx,cy]=m;const x=sx(cx),y=sy(cy);if(visible(x,y,150)){ctx.fillStyle="rgba(153,116,63,.13)";ctx.beginPath();ctx.ellipse(x,y,Math.max(35,m[2]*VIEW_SCALE*.34),Math.max(25,m[3]*VIEW_SCALE*.34),0,0,7);ctx.fill();const offsets=[[-48000,-22000],[42000,-40000],[55000,30000],[-25000,47000]];offsets.forEach((o,j)=>drawShop(cx+o[0],cy+o[1],j===0?"MARKET":"SHOP",(i+j)%2))}});
 (map.landmarks||[]).forEach(drawLandmark);
}
function drawStreetLights(){
 const warm=mapKey==="county"?"#ffc36d":mapKey==="vice"?"#77f5ff":"#a2dfff";
 for(let i=0;i<map.edges.length;i+=2){const [a,b]=map.edges[i],p=map.nodes[a],q=map.nodes[b],dx=q[0]-p[0],dy=q[1]-p[1],len=Math.hypot(dx,dy),side=(i%4===0?1:-1),wx=(p[0]+q[0])/2-dy/len*18000*side,wy=(p[1]+q[1])/2+dx/len*18000*side,x=sx(wx),y=sy(wy);if(!visible(x,y,28))continue;
  const halo=ctx.createRadialGradient(x,y,1,x,y,23);halo.addColorStop(0,mapKey==="vice"?"rgba(98,233,255,.28)":"rgba(255,190,104,.22)");halo.addColorStop(1,"rgba(0,0,0,0)");ctx.fillStyle=halo;ctx.fillRect(x-23,y-23,46,46);ctx.strokeStyle=mapKey==="metro"?"#8db2c8":"#887a61";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y+5);ctx.lineTo(x,y-9);ctx.lineTo(x+5,y-12);ctx.stroke();ctx.fillStyle=warm;ctx.shadowColor=warm;ctx.shadowBlur=9;ctx.beginPath();ctx.arc(x+5,y-12,2.4,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
 }
}
function drawAtmosphericParticles(){
 const p=map.nodes[players[turn].node],cx=sx(p[0]),cy=sy(p[1]),time=Date.now()/1700;
 for(let i=0;i<16;i++){const x=cx+Math.sin(time+i*12.73)*(75+(i%4)*34),y=cy+Math.cos(time*.73+i*8.11)*(55+(i%5)*28),r=1+(i%3)*.45;if(Math.hypot(x-cx,y-cy)>FOG_VISIBLE_RADIUS*.87)continue;const color=mapKey==="vice"?(i%2?"#ff77dc":"#6ef3ff"):mapKey==="county"?"#f2b86d":"#85d9ff";ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=8;ctx.globalAlpha=.35+((Math.sin(time*2+i)+1)*.16);ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill()}ctx.globalAlpha=1;ctx.shadowBlur=0;
}

function drawGraphNodes(){
 const g=graph(),glow=mapKey==="vice"?"#72dfff":mapKey==="county"?"#ffbf65":"#80cfff";for(const [id,n] of Object.entries(map.nodes)){if(id===map.goal&&!isWorldCurrentlyVisible(n[0],n[1]))continue;const x=sx(n[0]),y=sy(n[1]);if(!visible(x,y,13))continue;ctx.fillStyle="rgba(4,9,10,.7)";ctx.beginPath();ctx.arc(x,y,10,0,7);ctx.fill();ctx.shadowColor=glow;ctx.shadowBlur=(g[id]||[]).length>=3?12:6;ctx.fillStyle=id===map.goal?"#eee0ff":glow;ctx.beginPath();ctx.arc(x,y,id===map.goal?4.5:3.2,0,7);ctx.fill();ctx.shadowBlur=0;if((g[id]||[]).length>=3){ctx.strokeStyle=glow;ctx.globalAlpha=.72;ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(x,y,8,0,7);ctx.stroke();ctx.globalAlpha=1}}
 drawStartMarker(map.start1,1);if(mode!=="single")drawStartMarker(map.start2,2);
}
function drawStartMarker(id,num){const n=map.nodes[id],x=sx(n[0]),y=sy(n[1]);if(!visible(x,y,50))return;const color=num===2?"#cfb7ff":"#67f0d1";ctx.fillStyle="rgba(5,12,13,.86)";ctx.fillRect(x-31,y-37,62,14);ctx.fillStyle=color;ctx.font="bold 8px sans-serif";ctx.textAlign="center";ctx.fillText(`P${num} START`,x,y-27);ctx.textAlign="start";ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,13,0,7);ctx.stroke()}

function drawOptimalRoute(){
 if(!optimalPath.length)return;ctx.save();ctx.lineCap="round";ctx.lineJoin="round";ctx.strokeStyle="rgba(89,245,211,.27)";ctx.lineWidth=13;ctx.beginPath();optimalPath.forEach((id,i)=>i?ctx.lineTo(sx(map.nodes[id][0]),sy(map.nodes[id][1])):ctx.moveTo(sx(map.nodes[id][0]),sy(map.nodes[id][1])));ctx.stroke();ctx.strokeStyle="#9ffff0";ctx.lineWidth=3;ctx.setLineDash([6,8]);ctx.stroke();ctx.setLineDash([]);ctx.restore();
}

function drawCharacter(id,num,isActive){
 const n=map.nodes[id],x=sx(n[0]),y=sy(n[1]),color=num===2?"#cbb6ff":"#74f2d4",phase=Date.now()/115,step=Math.sin(phase)*(isActive?2.2:0.5),rotation=({N:0,E:Math.PI/2,S:Math.PI,W:-Math.PI/2})[players[num].facing||"N"];ctx.save();ctx.translate(x,y);ctx.rotate(rotation);ctx.shadowColor=color;ctx.shadowBlur=isActive?15:7;
 // Ground shadow and small animated feet.
 ctx.fillStyle="rgba(0,0,0,.62)";ctx.beginPath();ctx.ellipse(1,10,13,7,0,0,7);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle=num===2?"#8d79be":"#338f78";ctx.fillRect(-7+step,5,5,8);ctx.fillRect(2-step,5,5,8);
 // Backpack, torso, arms, head and a forward-facing cap/arrow read clearly at map scale.
 ctx.fillStyle=num===2?"#725eaa":"#267f6b";ctx.fillRect(-10,-9,20,19);ctx.fillStyle=color;ctx.fillRect(-7,-10,14,16);ctx.fillStyle=num===2?"#eddfff":"#f2d5ae";ctx.beginPath();ctx.arc(0,-15,6.5,0,7);ctx.fill();ctx.fillStyle="#182122";ctx.fillRect(-4,-17,2,2);ctx.fillRect(2,-17,2,2);ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,-24);ctx.lineTo(-4,-19);ctx.lineTo(4,-19);ctx.closePath();ctx.fill();ctx.fillStyle="#e8d69e";ctx.fillRect(-2,-3,4,3);ctx.restore();
}
function drawVisiblePlayers(){
 const active=map.nodes[players[turn].node];for(const num of [1,2]){if(num===2&&mode==="single")continue;const node=map.nodes[players[num].node],near=Math.hypot(node[0]-active[0],node[1]-active[1])<=fogWorldRadius();if(num!==turn&&!near)continue;const x=sx(node[0]),y=sy(node[1]),color=num===2?"#c6a4ff":"#68ffe2",aura=ctx.createRadialGradient(x,y,2,x,y,num===turn?52:35);aura.addColorStop(0,num===2?"rgba(183,140,255,.36)":"rgba(83,255,220,.34)");aura.addColorStop(1,"rgba(72,225,213,0)");ctx.fillStyle=aura;ctx.fillRect(x-55,y-55,110,110);ctx.shadowColor=color;ctx.shadowBlur=12;ctx.strokeStyle=color;ctx.globalAlpha=.68;ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(x,y,num===turn?24:20,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;ctx.shadowBlur=0;drawCharacter(players[num].node,num,num===turn);drawPlayerLabel(x,y,num,color)}
}
function drawPlayerLabel(x,y,num,color){ctx.save();ctx.font="bold 7px sans-serif";ctx.textAlign="center";ctx.fillStyle="rgba(2,10,15,.9)";ctx.fillRect(x-29,y-38,58,12);ctx.strokeStyle=color;ctx.globalAlpha=.7;ctx.strokeRect(x-29,y-38,58,12);ctx.globalAlpha=1;ctx.fillStyle="#f1ffff";ctx.shadowColor=color;ctx.shadowBlur=5;ctx.fillText(`PLAYER ${num}`,x,y-30);ctx.restore()}
function drawGoal(){
 const n=map.nodes[map.goal];if(!isWorldCurrentlyVisible(n[0],n[1]))return;const x=sx(n[0]),y=sy(n[1]);
 const pulse=1+Math.sin(Date.now()/260)*.12;ctx.save();ctx.translate(x,y);ctx.scale(pulse,pulse);const beam=ctx.createRadialGradient(0,0,4,0,0,75);beam.addColorStop(0,"rgba(183,155,255,.30)");beam.addColorStop(1,"rgba(183,155,255,0)");ctx.fillStyle=beam;ctx.fillRect(-75,-75,150,150);ctx.shadowColor="#bca5ff";ctx.shadowBlur=25;ctx.strokeStyle="#ddceff";ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,29,0,7);ctx.stroke();ctx.beginPath();ctx.arc(0,0,18,0,7);ctx.stroke();ctx.fillStyle="#f0e7ff";ctx.beginPath();ctx.moveTo(0,-10);ctx.lineTo(8,0);ctx.lineTo(0,10);ctx.lineTo(-8,0);ctx.closePath();ctx.fill();ctx.shadowBlur=0;ctx.fillStyle="#f0e5ff";ctx.font="bold 10px sans-serif";ctx.textAlign="center";ctx.fillText("CENTER",0,-38);ctx.textAlign="start";ctx.restore();
}

// Keep canvas animation lightweight; the HTML HUD and its controls are outside this canvas.
setInterval(()=>{if(running)draw()},85);
