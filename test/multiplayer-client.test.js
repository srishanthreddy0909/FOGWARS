"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

async function urlFor(pagePort) {
  let url;
  class FakeWebSocket {
    static OPEN=1;static CONNECTING=0;static CLOSED=3;static CLOSING=2;
    constructor(value){url=value;this.readyState=0;this.listeners={};queueMicrotask(()=>{this.readyState=1;this.listeners.open?.()})}
    addEventListener(type,fn){this.listeners[type]=fn}
    send(raw){const request=JSON.parse(raw);this.listeners.message?.({data:JSON.stringify({type:"reply",requestId:request.requestId,ok:true,roomCode:"FOGABCD",playerId:1,token:"token",state:{roomCode:"FOGABCD"}})})}
    close(){this.readyState=3;this.listeners.close?.()}
  }
  const context={WebSocket:FakeWebSocket,location:{protocol:"http:",host:`localhost:${pagePort}`,hostname:"localhost",port:String(pagePort)},sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},Map,Date,Promise,JSON,String,setTimeout,clearTimeout,onOnlineState(){},onOnlineConnection(){}};
  const api=vm.runInNewContext(fs.readFileSync(require.resolve("../js/multiplayer.js"),"utf8")+"\nMultiplayer",context);
  await api.create("vice");
  return url;
}

test("Online Team targets Node :3000 from either the Node page or Python :8000 page", async()=>{
  assert.equal(await urlFor(8000),"ws://localhost:3000/ws");
  assert.equal(await urlFor(3000),"ws://localhost:3000/ws");
});
