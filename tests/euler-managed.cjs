// Testa o caminho EULERSTREAM_API_KEY com um servidor WebSocket falso local.
const {spawn}=require('node:child_process'),assert=require('node:assert/strict'),{io}=require('socket.io-client'),{WebSocketServer}=require('ws');
const wss=new WebSocketServer({port:8799});const seen=[];
wss.on('connection',(ws,req)=>{const q=new URL(req.url,'http://x').searchParams;seen.push(q.get('uniqueId')+':'+q.get('apiKey'));
 if(q.get('uniqueId')==='offline')return ws.close(4404,'not live');
 setTimeout(()=>{
  ws.send(JSON.stringify({messages:[{type:'WebcastChatMessage',data:{user:{nickname:'Ana'},comment:'Oi live'}}]}));
  ws.send(Buffer.from(JSON.stringify({messages:[{type:'WebcastGiftMessage',data:{user:{uniqueId:'fa'},giftDetails:{giftName:'Rosa',giftType:1},repeatCount:2,repeatEnd:false}},{type:'WebcastGiftMessage',data:{user:{uniqueId:'fa'},giftDetails:{giftName:'Rosa',giftType:1},repeatCount:5,repeatEnd:true}}]})));
  ws.send(JSON.stringify({messages:[{type:'WebcastMemberMessage',data:{user:{nickname:'X'}}}]}));
 },100);});
const child=spawn(process.execPath,['server.cjs'],{cwd:__dirname+'/..',env:{...process.env,EULERSTREAM_API_KEY:'chave-teste',EULERSTREAM_WS_URL:'ws://127.0.0.1:8799'},stdio:['ignore','pipe','inherit']});child.stdout.on('data',d=>process.env.DEBUG&&process.stdout.write(d));
const delay=ms=>new Promise(r=>setTimeout(r,ms));let socket;
function waitEvent(name,pred=()=>true){return new Promise((res,rej)=>{const t=setTimeout(()=>{socket.off(name,on);rej(new Error('Timeout '+name));},4000);function on(v){if(pred(v)){clearTimeout(t);socket.off(name,on);res(v);}}socket.on(name,on);});}
(async()=>{await new Promise((res,rej)=>{child.stdout.once('data',res);child.once('exit',c=>rej(new Error('Server exited '+c)));});
 socket=io('http://127.0.0.1:8765',{autoConnect:false});const ready=waitEvent('status');socket.connect();await ready;
 const entries=[];socket.on('entry',e=>entries.push(e));
 const live=waitEvent('status',s=>s.phase==='live');socket.emit('connectLive','@perfil.teste');await live;await delay(400);
 assert.deepEqual(seen,['perfil.teste:chave-teste']);
 assert.deepEqual(entries.map(e=>[e.user,e.text,e.gift]),[['Ana','Oi live',false],['fa','Enviou Rosa ×5',true]]);
 const fail=waitEvent('status',s=>s.phase==='error');socket.emit('connectLive','offline');assert.match((await fail).message,/não está ao vivo/);
 console.log('PASS: EulerStream gerenciado: parâmetros, JSON texto e binário, comentário, sequência de presente e código 4404.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{socket?.disconnect();child.kill();wss.close();});
