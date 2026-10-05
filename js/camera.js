// Local navigation camera: keep the active navigator centered at the existing map scale.
var cam={x:0,y:0};
function updateCamera(){
 const p=map.nodes[players[turn].node],w=canvas.clientWidth,h=canvas.clientHeight,viewW=w/VIEW_SCALE,viewH=h/VIEW_SCALE;
 cam.x=Math.max(0,Math.min(WORLD.w-viewW,p[0]-viewW/2));cam.y=Math.max(0,Math.min(WORLD.h-viewH,p[1]-viewH/2));
 const goal=map.nodes[map.goal],dx=goal[0]-p[0],dy=goal[1]-p[1],heading=Math.abs(dx)>Math.abs(dy)?(dx>0?90:270):(dy>0?180:0);
 $("needle").style.transform=`rotate(${heading}deg)`;
}
function sx(x){return(x-cam.x)*VIEW_SCALE}
function sy(y){return(y-cam.y)*VIEW_SCALE}
