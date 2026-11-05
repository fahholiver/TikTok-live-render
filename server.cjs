const express = require('express');
const http = require('node:http');
const { Server } = require('socket.io');
const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');
const app = express(), server = http.createServer(app);
const auth = require('./cloud-auth.cjs');
const io = new Server(server, {allowRequest:(req,cb)=>cb(null,auth.validRequest(req))});
app.get('/healthz', (_req,res)=>res.status(200).send('ok'));
app.use(auth.middleware);
app.get('/transport.js', (req,res)=>res.redirect('/socket.io/socket.io.js'));
app.get('/api/overlay-url', (req,res)=>res.json({url: auth.enabled ? auth.requestOriginFor(req)+'/?overlay=1&key='+auth.overlayToken : null}));
app.use(express.static(__dirname+'/dist'));
io.use((socket,next)=>{
 if(!auth.enabled) return next();
 if(auth.panel(socket.request)){socket.data.canControl=true;return next();}
 if(auth.overlay(socket.handshake.auth?.overlayKey))return next();
 next(new Error('Acesso não autorizado'));
});
const eulerCloseErrors = {
 4400: 'O EulerStream recusou os parâmetros da conexão.',
 4401: 'A chave do EulerStream foi recusada.',
 4403: 'A conta EulerStream não tem acesso a esta conexão.',
 4404: 'O perfil não está ao vivo.',
 4429: 'Limite de conexões do EulerStream atingido.'
};
async function frameText(data) {
 if (typeof data === 'string') return data;
 if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
 if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8');
 if (typeof data?.text === 'function') return data.text();
 return '';
}
function eulerEvents(frame) {
 const list = Array.isArray(frame) ? frame : Array.isArray(frame?.messages) ? frame.messages : [frame];
 return list.map(event => ({
  type: String(event?.type ?? event?.event ?? event?.method ?? ''),
  data: event?.data ?? event?.payload ?? event
 }));
}
function managedConnection(username, apiKey) {
 const handlers = new Map();
 const seen = new Map();
 let socket, cancel, opened = false, logged = 0;
 const emit = (event, value) => handlers.get(event)?.(value);
 const tag = `[EulerStream @${username}]`;
 return {
  on(event, handler) { handlers.set(event, handler); },
  connect() {
   return new Promise((resolve, reject) => {
    cancel = () => reject(new Error('Conexão cancelada.'));
    const url = new URL(process.env.EULERSTREAM_WS_URL || 'wss://ws.eulerstream.com');
    url.searchParams.set('uniqueId', username);
    url.searchParams.set('apiKey', apiKey);
    socket = new WebSocket(url);
    socket.binaryType = 'arraybuffer';
    socket.addEventListener('open', () => { opened = true; console.log(tag, 'WebSocket aberto.'); resolve(); }, { once: true });
    socket.addEventListener('message', async ({data}) => {
     const text = await frameText(data);
     let frame;
     try { frame = JSON.parse(text); }
     catch {
      if (logged++ < 5) console.log(tag, 'Frame não JSON recebido:', typeof data, text.length, 'bytes');
      return;
     }
     for (const {type, data: payload} of eulerEvents(frame)) {
      if (!seen.has(type)) console.log(tag, 'Primeiro evento do tipo', JSON.stringify(type), '· campos:', Object.keys(payload || {}).slice(0, 15).join(','));
      seen.set(type, (seen.get(type) || 0) + 1);
      if (!payload) continue;
      if (/chat/i.test(type)) emit(WebcastEvent.CHAT, {...payload, comment: payload.comment ?? payload.content});
      else if (/gift/i.test(type)) emit(WebcastEvent.GIFT, {
       ...payload,
       giftName: payload.giftName ?? payload.gift?.name ?? payload.giftDetails?.giftName,
       repeatCount: payload.repeatCount ?? payload.giftCount ?? payload.comboCount
      });
      else if (/control/i.test(type) && Number(payload.action) === 3) emit(WebcastEvent.STREAM_END);
     }
    });
    socket.addEventListener('error', () => {
     if (!opened) reject(new Error('O WebSocket do EulerStream não abriu. Confira a chave e os limites da conta.'));
    });
    socket.addEventListener('close', ({code, reason}) => {
     console.log(tag, 'WebSocket fechado:', code, reason || '', '· eventos recebidos:', JSON.stringify(Object.fromEntries(seen)));
     const message = eulerCloseErrors[code] || (code >= 4000 ? `O EulerStream encerrou a conexão (código ${code}${reason ? ': ' + reason : ''}).` : '');
     if (!opened) return reject(new Error(message || `O EulerStream encerrou a conexão (código ${code}).`));
     if (code === 4005) emit(WebcastEvent.STREAM_END);
     else emit(ControlEvent.DISCONNECTED, message || undefined);
    });
   });
  },
  disconnect() { cancel?.(); socket?.close(1000); }
 };
}

let connection=null, generation=0, state={phase:'idle',message:'Desconectado',username:''}, history=[];
function status(phase,message,username=state.username){state={phase,message,username};io.emit('status',state);}
function stop(){generation++;const old=connection;connection=null;if(old){try{Promise.resolve(old.disconnect()).catch(()=>{});}catch{}}}
function publish(e){history.push(e);if(history.length>200)history.shift();io.emit('entry',e);}
io.on('connection',socket=>{
 socket.emit('status',state);socket.emit('history',history);
 if(auth.origin&&!socket.data.canControl)return;
 socket.on('demo',kind=>publish({user:'Usuário de teste',text:kind==='gift'?'Enviou Rosa 🌹 ×3':'O leitor de comentários está funcionando!',gift:kind==='gift',demo:true}));
 socket.on('disconnectLive',()=>{stop();status('idle','Desconectado');});
 socket.on('connectLive',async raw=>{
  const username=typeof raw==='string'?raw.trim().replace(/^@/,''):'';
  if(!/^[a-zA-Z0-9._]{1,32}$/.test(username))return socket.emit('notice','Digite apenas o @ do perfil, sem links.');
  if(state.phase==='connecting')return socket.emit('notice','Aguarde a tentativa atual ou clique em Cancelar.');
  const apiKey = process.env.EULERSTREAM_API_KEY?.trim();
  if (auth.enabled && !apiKey) return status('error','Configure EULERSTREAM_API_KEY na hospedagem para usar o WebSocket Community.',username);
  stop();const ticket=generation;history=[];io.emit('clear');status('connecting','Conectando à live…',username);
  const live=apiKey ? managedConnection(username,apiKey) : new TikTokLiveConnection(username,{enableExtendedGiftInfo:true,processInitialData:false});connection=live;
  const current=()=>ticket===generation;
  live.on(WebcastEvent.CHAT,d=>{if(current())publish({user:d.user?.nickname||d.nickname||d.user?.uniqueId||d.uniqueId||'Viewer',text:String(d.comment||'').slice(0,1500),gift:false});});
  live.on(WebcastEvent.GIFT,d=>{
   if(!current())return;
   const type=Number(d.giftDetails?.giftType??d.gift?.giftType??d.giftType);
   if(type===1&&!d.repeatEnd)return;
   const name=d.extendedGiftInfo?.name||d.giftDetails?.giftName||d.gift?.name||d.giftName||`Presente ${d.giftId||''}`;
   publish({user:d.user?.nickname||d.nickname||d.user?.uniqueId||d.uniqueId||'Viewer',text:`Enviou ${name} ×${Number(d.repeatCount)||1}`,gift:true});
  });
  live.on(ControlEvent.ERROR,e=>{if(current())io.emit('notice',String(e?.message||e?.exception?.message||'Erro na comunicação com o TikTok').slice(0,400));});
  live.on(ControlEvent.DISCONNECTED,reason=>{if(current()){stop();if(typeof reason==='string')status('error',reason);else status('idle','Conexão encerrada. Verifique a live e conecte novamente.');}});
  live.on(WebcastEvent.STREAM_END,()=>{if(current()){stop();status('idle','Esta live terminou.');}});
  const timeout=setTimeout(()=>{if(current()){stop();status('error','Tempo de conexão esgotado. Confirme que o perfil está ao vivo e tente novamente.');}},45000);
  try{await live.connect();if(!current()){try{live.disconnect();}catch{}return;}status('live',`Ao vivo · @${username}`,username);}
  catch(e){if(current()){stop();status('error','Não foi possível conectar: '+String(e.message||e).slice(0,350),username);}}
  finally{clearTimeout(timeout);}
 });
});
server.on('error',e=>{console.error('Não foi possível iniciar:',e.message);process.exit(1);});
const port=auth.enabled?Number(process.env.PORT||8765):8765;
server.listen(port,auth.enabled?'0.0.0.0':'127.0.0.1',()=>console.log('Painel: '+(auth.enabled?.origin||'http://127.0.0.1:8765')));
