// The supplied city edges remain the authoritative movement network.
function graph(){const g={};Object.keys(map.nodes).forEach(k=>g[k]=[]);map.edges.forEach(([a,b,d])=>{g[a].push({to:b,dir:d,cost:1});g[b].push({to:a,dir:opp(d),cost:1})});return g}
function opp(d){return({N:"S",S:"N",E:"W",W:"E"})[d]}
