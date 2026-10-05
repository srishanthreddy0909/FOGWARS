// Exploration-limited minimap. It follows the active player and never fits the whole city.
function drawMinimap(){
 const c=$("minimap"),m=c.getContext("2d"),rect=c.getBoundingClientRect(),d=devicePixelRatio||1,w=rect.width,h=rect.height,center=map.nodes[players[turn].node],windowWorld=260000;
 m.setTransform(d,0,0,d,0,0);m.clearRect(0,0,w,h);m.fillStyle="rgba(3,9,11,.96)";m.fillRect(0,0,w,h);
 const scale=Math.min((w-16)/(windowWorld*2),(h-16)/(windowWorld*2)),point=(x,y)=>[w/2+(x-center[0])*scale,h/2+(y-center[1])*scale];
 // A subdued border/range ring reinforces that this is a local navigation view.
 m.strokeStyle="rgba(106,139,132,.26)";m.lineWidth=1;m.beginPath();m.arc(w/2,h/2,FOG_VISIBLE_RADIUS*scale/VIEW_SCALE,0,Math.PI*2);m.stroke();
 const traveled=exploredEdges[turn]||new Set();m.lineCap="round";m.lineWidth=2.1;
 for(const [a,b] of map.edges){const p=map.nodes[a],q=map.nodes[b],key=[a,b].sort().join("|"),isTraveled=traveled.has(key);let ax=p[0],ay=p[1],bx=q[0],by=q[1];
  if(!isTraveled){const vx=bx-ax,vy=by-ay,A=vx*vx+vy*vy,B=2*((ax-center[0])*vx+(ay-center[1])*vy),C=(ax-center[0])**2+(ay-center[1])**2-fogWorldRadius()**2,disc=B*B-4*A*C;if(disc<0)continue;const t0=(-B-Math.sqrt(disc))/(2*A),t1=(-B+Math.sqrt(disc))/(2*A),lo=Math.max(0,t0),hi=Math.min(1,t1);if(lo>hi)continue;const x0=ax+vx*lo,y0=ay+vy*lo,x1=ax+vx*hi,y1=ay+vy*hi;ax=x0;ay=y0;bx=x1;by=y1}
  const p0=point(ax,ay),p1=point(bx,by);m.strokeStyle=isTraveled?"rgba(116,183,166,.58)":"rgba(112,203,187,.92)";m.beginPath();m.moveTo(...p0);m.lineTo(...p1);m.stroke();
 }
 // Only the visited junctions and the active navigator are shown. The goal stays hidden.
 for(const id of explored[turn]||[]){const [x,y]=point(...map.nodes[id]);m.fillStyle="rgba(116,188,169,.6)";m.beginPath();m.arc(x,y,2.5,0,Math.PI*2);m.fill()}
 for(const num of [1,2]){if(num===2&&mode==="single")continue;const id=players[num].node;if(num!==turn&&!isNodeExplored(id)&&!isWorldCurrentlyVisible(...map.nodes[id],turn))continue;const [x,y]=point(...map.nodes[id]);m.fillStyle=num===1?"#70f1d2":"#cbb6ff";m.beginPath();m.arc(x,y,4,0,Math.PI*2);m.fill()}
}
