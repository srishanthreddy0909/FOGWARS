// Fog state is tracked per player. The world graph remains private game state;
// only recently visible and previously visited geometry is uncovered to the player.
const FOG_VISIBLE_RADIUS=234; // modest increase for clearer nearby roads and junction approaches
const FOG_EDGE_RADIUS=300;
const FOG_EXPLORED_RADIUS=112;
let fogCanvas=null,fogContext=null;
function fogWorldRadius(){return FOG_VISIBLE_RADIUS/VIEW_SCALE}
function isWorldCurrentlyVisible(x,y,player=turn){const p=map.nodes[players[player].node];return Math.hypot(x-p[0],y-p[1])<=fogWorldRadius()}
function isNodeExplored(id,player=turn){return !!explored[player]&&explored[player].has(id)}
function updateFogState(){if(!map||!players[turn])return;explored[turn].add(players[turn].node)}
function markRoadExplored(from,to,player=turn){const ids=[from,to].sort();exploredEdges[player].add(ids.join("|"))}
function drawFog(){
 const p=map.nodes[players[turn].node],px=sx(p[0]),py=sy(p[1]),w=canvas.clientWidth,h=canvas.clientHeight;
 if(!fogCanvas){fogCanvas=document.createElement("canvas");fogContext=fogCanvas.getContext("2d")}
 const d=devicePixelRatio||1;fogCanvas.width=canvas.width;fogCanvas.height=canvas.height;fogContext.setTransform(d,0,0,d,0,0);
 fogContext.globalCompositeOperation="source-over";fogContext.fillStyle="rgba(2,7,10,.985)";fogContext.fillRect(0,0,w,h);
 // Formerly visited places stay recognizable as silhouettes beneath a heavy veil.
 fogContext.save();fogContext.globalCompositeOperation="destination-out";
 for(const id of explored[turn]||[]){const n=map.nodes[id],x=sx(n[0]),y=sy(n[1]);if(!fogCanvasPointVisible(x,y,FOG_EXPLORED_RADIUS))continue;const dim=fogContext.createRadialGradient(x,y,8,x,y,FOG_EXPLORED_RADIUS);dim.addColorStop(0,"rgba(0,0,0,.28)");dim.addColorStop(1,"rgba(0,0,0,0)");fogContext.fillStyle=dim;fogContext.fillRect(x-FOG_EXPLORED_RADIUS,y-FOG_EXPLORED_RADIUS,FOG_EXPLORED_RADIUS*2,FOG_EXPLORED_RADIUS*2)}
 // Small, irregular visibility mask with a soft falloff and almost opaque outer fog.
 const clear=fogContext.createRadialGradient(px,py,72,px,py,FOG_EDGE_RADIUS);clear.addColorStop(0,"rgba(0,0,0,.985)");clear.addColorStop(.68,"rgba(0,0,0,.97)");clear.addColorStop(.86,"rgba(0,0,0,.55)");clear.addColorStop(1,"rgba(0,0,0,0)");fogContext.fillStyle=clear;fogContext.fillRect(px-FOG_EDGE_RADIUS,py-FOG_EDGE_RADIUS,FOG_EDGE_RADIUS*2,FOG_EDGE_RADIUS*2);
 for(const [ox,oy] of [[18,-20],[-24,14],[31,26],[-13,-34]]){const r=fogContext.createRadialGradient(px+ox,py+oy,15,px+ox,py+oy,FOG_EDGE_RADIUS*.76);r.addColorStop(0,"rgba(0,0,0,.30)");r.addColorStop(1,"rgba(0,0,0,0)");fogContext.fillStyle=r;fogContext.fillRect(px+ox-FOG_EDGE_RADIUS,py+oy-FOG_EDGE_RADIUS,FOG_EDGE_RADIUS*2,FOG_EDGE_RADIUS*2)}
 fogContext.restore();ctx.drawImage(fogCanvas,0,0,w,h);
 const glow=ctx.createRadialGradient(px,py,8,px,py,175);glow.addColorStop(0,"rgba(105,225,203,.09)");glow.addColorStop(1,"rgba(105,225,203,0)");ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
}
function fogCanvasPointVisible(x,y,r){return x+r>=0&&y+r>=0&&x-r<=canvas.clientWidth&&y-r<=canvas.clientHeight}
