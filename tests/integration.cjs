const {spawn}=require('node:child_process'),assert=require('node:assert/strict'),{io}=require('socket.io-client');
const child=spawn(process.execPath,['--require','./tests/fake-connector.cjs','server.cjs'],{cwd:__dirname+'/..',stdio:['ignore','pipe','pipe']});
const delay=ms=>new Promise(r=>setTimeout(r,ms));let socket;
function waitEvent(name,predicate=()=>true){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{socket.off(name,on);reject(new Error('Timeout '+name));},4000);function on(v){if(predicate(v)){clearTimeout(timer);socket.off(name,on);resolve(v);}}socket.on(name,on);});}
(async()=>{await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(new Error('Server exited '+code)));});
assert.equal((await fetch('http://127.0.0.1:8765')).status,200);assert.equal((await fetch('http://127.0.0.1:8765/games.html')).status,200);
socket=io('http://127.0.0.1:8765',{autoConnect:false});const ready=waitEvent('status');socket.connect();await ready;
const bad=waitEvent('notice');socket.emit('connectLive','https://bad');assert.match(await bad,/Digite/);
const entries=[],likes=[];socket.on('entry',e=>entries.push(e));socket.on('like',l=>likes.push(l));let live=waitEvent('status',s=>s.phase==='live');socket.emit('connectLive','@teste');await live;await delay(250);assert.equal(entries.length,2);assert.equal(entries[0].text,'Olá <script>!');assert.equal(entries[1].text,'Enviou Rosa ×3');assert.equal(entries[0].uid,'pessoa');assert.equal(entries[0].avatar,'https://p16.example/a.jpg');assert.equal(entries[1].coins,3);assert.equal(likes[0]?.count,5);
const demo=waitEvent('entry',e=>e.demo);socket.emit('demo','gift');assert.equal((await demo).gift,true);
const idle=waitEvent('status',s=>s.phase==='idle');socket.emit('disconnectLive');await idle;
const fail=waitEvent('status',s=>s.phase==='error');socket.emit('connectLive','offline');assert.match((await fail).message,/offline/);
console.log('PASS: HTTP, Socket.IO, validação de @, comentários, sequências de presentes, testes, desconexão e erro offline.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{socket?.disconnect();child.kill();});
