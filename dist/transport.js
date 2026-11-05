// Transport for the hosted demonstration. The Node server serves Socket.IO here.
window.io = function () {
  const overlay = new URLSearchParams(location.search).get('overlay') === '1';
  const events = new Map();
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('reader-demo') : null;
  function dispatch(event, data) { events.get(event)?.(data); }
  if (channel) channel.onmessage = ({ data }) => dispatch('entry', data);
  queueMicrotask(() => {
    dispatch('connect');
    dispatch('status', { phase: 'idle', message: 'Modo teste · use os botões de comentário e presente.' });
    document.getElementById('connect').disabled = true;
    document.getElementById('disconnect').disabled = true;
    document.getElementById('username').disabled = true;
    if (!overlay) dispatch('notice', 'O servidor que recebe eventos reais do TikTok ainda precisa ser hospedado.');
  });
  return {
    on(event, listener) { events.set(event, listener); },
    emit(event, kind) {
      if (event !== 'demo' || overlay) return;
      const gift = kind === 'gift';
      const entry = { user: 'Usuário de teste', text: gift ? 'Enviou Rosa 🌹 ×3' : 'O leitor de comentários está funcionando!', gift, demo: true };
      dispatch('entry', entry);
      channel?.postMessage(entry);
    }
  };
};
