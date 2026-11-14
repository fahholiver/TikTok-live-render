/* Overlay da impressora: recebe as acoes do servidor e anima a impressao. */
(() => {
  const params = new URLSearchParams(location.search);
  const PREVIA = false;
  const palco = document.getElementById('palco');
  const rolo = document.getElementById('rolo');
  const ponte = document.getElementById('ponte');
  const carro = document.getElementById('carro');
  const cabeca = document.getElementById('cabeca');
  const alertasEl = document.getElementById('alertas');
  const lateralEl = document.getElementById('lateral');
  const coracoesEl = document.getElementById('coracoes');
  const bannerEl = document.getElementById('banner');
  const bannerTexto = document.getElementById('bannerTexto');
  const bannerTimer = document.getElementById('bannerTimer');
  const avisoEl = document.getElementById('aviso');

  let cfg = { overlay: {}, regras: [], musica: {}, efeitos: {} };
  const fila = [];
  let imprimindo = false;

  // ---------------------------------------------------------- escala do palco
  function escalar() {
    const s = Math.min(window.innerWidth / 1080, window.innerHeight / 1920);
    palco.style.transform = `translate(-50%, -50%) scale(${s})`;
    palco.style.transformOrigin = '50% 50%';
  }
  window.addEventListener('resize', escalar);
  escalar();

  // ---------------------------------------------------------- som (gerado, sem arquivos)
  let audio = null;
  function ctx() {
    if (PREVIA) return null;
    if (!audio) {
      try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { return null; }
    }
    if (audio.state === 'suspended') {
      audio.resume().catch(() => {});
      if (audio.state === 'suspended') avisoEl.style.display = 'block';
    }
    return audio;
  }
  document.addEventListener('click', () => {
    ctx();
    avisoEl.style.display = 'none';
    if (musicaBloqueada) tocarMusica();
  });

  // ---------------------------------------------------------- musica de fundo
  const limitar = (v, padrao) => Math.max(0, Math.min(1, Number(v ?? padrao)));
  let sons = { musicas: [], efeitos: [] };
  const player = new Audio();
  player.preload = 'auto';
  let ordem = [];
  let musicaNome = '';
  let pausadaManual = false;
  let musicaBloqueada = false;
  let errosSeguidos = 0;
  let abaixar = 1; // multiplicador do volume enquanto um efeito toca
  let efeitosTocando = 0;

  function volumeMusica() {
    player.volume = limitar(cfg.musica && cfg.musica.volume, 0.25) * abaixar;
  }

  function embaralhar(lista) {
    const a = lista.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    if (a.length > 1 && a[0] === musicaNome) a.push(a.shift()); // nao repete a mesma musica em seguida
    return a;
  }

  function avisarMusica() {

  }

  function tocarMusica() {
    volumeMusica();
    player.play().then(() => {
      musicaBloqueada = false;
      avisoEl.style.display = 'none';
    }).catch(() => {
      musicaBloqueada = true;
      avisoEl.style.display = 'block';
    });
  }

  function proximaMusica() {
    if (PREVIA) return;
    const lista = sons.musicas;
    if (!(cfg.musica && cfg.musica.ativa) || !lista.length) {
      player.pause();
      if (!lista.length) { musicaNome = ''; player.removeAttribute('src'); }
      avisarMusica();
      return;
    }
    ordem = ordem.filter((m) => lista.includes(m));
    if (!ordem.length) ordem = cfg.musica.aleatoria ? embaralhar(lista) : lista.slice();
    musicaNome = ordem.shift();
    player.src = '/sons/musicas/' + encodeURIComponent(musicaNome);
    tocarMusica();
    avisarMusica();
  }

  player.addEventListener('ended', () => { errosSeguidos = 0; proximaMusica(); });
  player.addEventListener('playing', () => { errosSeguidos = 0; });
  player.addEventListener('error', () => {
    // arquivo com problema: pula para a proxima (e desiste se todas derem erro)
    if (++errosSeguidos <= sons.musicas.length) setTimeout(proximaMusica, 500);
  });
  player.addEventListener('play', avisarMusica);
  player.addEventListener('pause', avisarMusica);

  function sincronizarMusica() {
    if (PREVIA) return;
    volumeMusica();
    const ativa = cfg.musica && cfg.musica.ativa;
    if (!ativa) { player.pause(); return; }
    if (pausadaManual || !player.paused) return;
    if (player.getAttribute('src') && sons.musicas.includes(musicaNome)) tocarMusica();
    else proximaMusica();
  }

  function comandoMusica(cmd) {
    if (cmd === 'proxima') { pausadaManual = false; errosSeguidos = 0; proximaMusica(); }
    if (cmd === 'pausar') {
      if (player.paused) { pausadaManual = false; sincronizarMusica(); }
      else { pausadaManual = true; player.pause(); }
    }
  }

  // ---------------------------------------------------------- efeitos sonoros
  function tocarEfeito(arquivo) {
    if (PREVIA || !arquivo) return;
    const a = new Audio('/sons/efeitos/' + encodeURIComponent(arquivo));
    a.volume = limitar(cfg.efeitos && cfg.efeitos.volume, 0.8);
    let devolvido = false;
    const devolver = () => {
      if (devolvido) return;
      devolvido = true;
      efeitosTocando = Math.max(0, efeitosTocando - 1);
      if (!efeitosTocando) { abaixar = 1; volumeMusica(); }
    };
    if (cfg.musica && cfg.musica.abaixarNoEfeito) {
      efeitosTocando++;
      abaixar = 0.3;
      volumeMusica();
    } else devolvido = true;
    a.addEventListener('ended', devolver);
    a.addEventListener('error', devolver);
    setTimeout(devolver, 15000); // seguranca para efeitos muito longos
    a.play().catch(() => { avisoEl.style.display = 'block'; devolver(); });
  }

  function somImpressora(seg) {
    const a = ctx();
    if (!a) return;
    const vol = PREVIA ? 0 : Number(cfg.overlay.volume ?? 0.6);
    if (vol <= 0) return;
    const g = a.createGain();
    g.gain.value = 0.0001;
    g.connect(a.destination);
    const o = a.createOscillator();
    o.type = 'sawtooth';
    const t0 = a.currentTime;
    // motor de passo: frequencia "pulando" como uma impressora
    for (let t = 0; t < seg; t += 0.12) {
      o.frequency.setValueAtTime(140 + Math.random() * 90 + (Math.floor(t / 0.36) % 2) * 120, t0 + t);
    }
    const f = a.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 900;
    o.connect(f); f.connect(g);
    g.gain.exponentialRampToValueAtTime(0.12 * vol, t0 + 0.05);
    g.gain.setValueAtTime(0.12 * vol, t0 + seg - 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + seg);
    o.start(t0); o.stop(t0 + seg + 0.05);
  }

  // zumbido curto do motor quando a maquina se desloca
  function somMotor(seg, freq = 95) {
    const a = ctx();
    if (!a) return;
    const vol = Number(cfg.overlay.volume ?? 0.6);
    if (vol <= 0 || seg <= 0) return;
    const o = a.createOscillator(); const g = a.createGain(); const f = a.createBiquadFilter();
    o.type = 'square'; o.frequency.value = freq; f.type = 'lowpass'; f.frequency.value = 500;
    const t0 = a.currentTime;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.05 * vol, t0 + 0.05);
    g.gain.setValueAtTime(0.05 * vol, t0 + Math.max(0.06, seg - 0.06));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + seg);
    o.connect(f); f.connect(g); g.connect(a.destination);
    o.start(t0); o.stop(t0 + seg + 0.05);
  }

  function somPlim() {
    const a = ctx();
    if (!a) return;
    const vol = PREVIA ? 0 : Number(cfg.overlay.volume ?? 0.6);
    if (vol <= 0) return;
    [880, 1318].forEach((fr, i) => {
      const o = a.createOscillator(); const g = a.createGain();
      o.frequency.value = fr; o.type = 'sine';
      const t = a.currentTime + i * 0.12;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25 * vol, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.55);
    });
  }

  // ---------------------------------------------------------- utilidades
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // iniciais seguras com emoji / letras decoradas (nao corta o caractere pela metade)
  const iniciais = (n) => {
    const palavras = String(n || '').split(/\s+/).map((p) => Array.from(p).filter((ch) => /[\p{L}\p{N}]/u.test(ch)).join('')).filter(Boolean);
    return palavras.map((p) => Array.from(p)[0]).slice(0, 2).join('').toUpperCase() || '♥';
  };

  // tenta cada URL de foto em ordem (proxy do servidor primeiro); se todas falharem, mostra as iniciais
  window.proximaFoto = (img) => {
    let lista = [];
    try { lista = JSON.parse(img.dataset.l || '[]'); } catch (_) {}
    const i = Number(img.dataset.i || 0) + 1;
    if (i < lista.length) {
      img.dataset.i = i;
      img.src = lista[i];
    } else {
      const span = document.createElement('span');
      span.textContent = img.dataset.ini || '♥';
      img.replaceWith(span);
    }
  };

  function fotoHtml(fotos, nome) {
    const lista = (Array.isArray(fotos) ? fotos : [fotos]).filter(Boolean);
    const ini = esc(iniciais(nome));
    if (!lista.length) return `<span>${ini}</span>`;
    return `<img src="${esc(lista[0])}" data-i="0" data-l="${esc(JSON.stringify(lista))}" data-ini="${ini}" referrerpolicy="no-referrer" onerror="proximaFoto(this)">`;
  }

  // ---------------------------------------------------------- impressao (plotter)
  // Coordenadas em px "do papel" (0,0 = canto superior esquerdo do papel visivel).
  // A pagina e uma grade de 6 colunas; cada cartao ocupa uma vaga livre da grade,
  // entao NUNCA um cartao e impresso em cima do outro. Quando nao cabe mais nada,
  // a maquina volta para o inicio e o papel avanca, mostrando uma pagina em branco.
  const PAPEL_L = 840;
  const MARGEM = 20;
  const COLS = 6;
  const U = (PAPEL_L - MARGEM * 2) / COLS; // tamanho de 1 unidade da grade (~107px)
  const LINHAS = 8; // linhas da grade por pagina
  const PAGINA_Y = 60; // inicio da grade na pagina (abaixo da posicao de descanso da ponte)
  const PASSO = PAGINA_Y + LINHAS * U + 50; // quanto o papel anda por pagina
  const ESPACO = 14; // espaco entre cartoes
  const CASA = { x: PAPEL_L / 2, y: 18 }; // posicao de descanso da cabeca
  const TAMANHOS = { normal: [2, 2], maior: [3, 3], grande: [4, 4], vip: [6, 5] };

  let pagina = 0;
  let grade = novaGrade();
  let pos = { x: CASA.x, y: CASA.y };
  let timerCasa = null;

  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  const vel = () => Math.max(0.3, Number(cfg.overlay.velocidade) || 1);

  function novaGrade() {
    return Array.from({ length: LINHAS }, () => new Array(COLS).fill(false));
  }

  // procura a primeira vaga livre (de cima para baixo, da esquerda para a direita)
  function reservar(w, h) {
    for (let r = 0; r + h <= LINHAS; r++) {
      for (let c = 0; c + w <= COLS; c++) {
        let livre = true;
        for (let i = r; i < r + h && livre; i++) for (let j = c; j < c + w; j++) if (grade[i][j]) { livre = false; break; }
        if (livre) {
          for (let i = r; i < r + h; i++) for (let j = c; j < c + w; j++) grade[i][j] = true;
          return { c, r };
        }
      }
    }
    return null;
  }

  function posicionar(x, y, seg, curva = 'ease-in-out') {
    const t = seg > 0 ? `transform ${seg}s ${curva}` : 'none';
    ponte.style.transition = t;
    carro.style.transition = t;
    ponte.style.transform = `translateY(${y}px)`;
    carro.style.transform = `translateX(${x}px)`;
    pos = { x, y };
  }

  async function moverPara(x, y) {
    const dist = Math.hypot(x - pos.x, y - pos.y);
    if (dist < 1) return;
    const seg = Math.max(0.25, dist / (850 * vel()));
    somMotor(seg);
    posicionar(x, y, seg);
    await dormir(seg * 1000 + 30);
  }

  async function irParaCasa() {
    cabeca.classList.remove('ativa');
    await moverPara(CASA.x, CASA.y);
  }

  async function avancarPapel() {
    await irParaCasa();
    pagina++;
    const seg = 2 / vel();
    const div = document.createElement('div');
    div.className = 'divisa';
    div.dataset.pagina = pagina;
    div.style.top = (-pagina * PASSO + PAGINA_Y - 30) + 'px';
    rolo.appendChild(div);
    somMotor(seg, 70);
    rolo.style.transition = `transform ${seg}s ease-in-out`;
    rolo.style.transform = `translateY(${pagina * PASSO}px)`;
    await dormir(seg * 1000 + 50);
    grade = novaGrade();
    // remove o que ja saiu de vista (mantem a pagina anterior, que ainda aparece embaixo)
    rolo.querySelectorAll('[data-pagina]').forEach((el) => {
      if (Number(el.dataset.pagina) < pagina - 1) el.remove();
    });
  }

  function criarCartao(d, tamanho, vaga, w, h) {
    const larg = w * U - ESPACO;
    const alt = h * U - ESPACO;
    const x = MARGEM + vaga.c * U + ESPACO / 2;
    const y = PAGINA_Y + vaga.r * U + ESPACO / 2; // coordenada no papel (pagina atual)
    const el = document.createElement('div');
    el.className = `cartao t-${tamanho}`;
    el.dataset.pagina = pagina;
    el.style.cssText = `left:${x}px;top:${y - pagina * PASSO}px;width:${larg}px;height:${alt}px;font-size:${Math.min(larg, alt) / 9.5}px`;
    const icone = d.iconeUrl ? `<img src="${esc(d.iconeUrl)}">` : esc(d.icone || '');
    const foto = Math.min(larg, alt) * 0.56;
    el.innerHTML = `
      <div class="foto" style="width:${foto}px;height:${foto}px">${fotoHtml(d.fotos && d.fotos.length ? d.fotos : d.foto, d.nome)}</div>
      <div class="titulo"><span class="c">❤</span> ${esc(d.nome)} <span class="c">❤</span></div>
      <div class="sub">${icone}<span>${esc(d.texto)}</span></div>`;
    rolo.appendChild(el);
    ajustarTitulo(el.querySelector('.titulo'));
    return { el, x, y, larg, alt };
  }

  async function imprimirCartao(d) {
    const tamanho = TAMANHOS[d.tamanho] ? d.tamanho : 'normal';
    const [w, h] = TAMANHOS[tamanho];
    let vaga = reservar(w, h);
    if (!vaga) {
      await avancarPapel();
      vaga = reservar(w, h);
    }
    const k = criarCartao(d, tamanho, vaga, w, h);

    // 1) vai ate o canto superior esquerdo da vaga
    await moverPara(k.x, k.y);

    // 2) varredura: a ponte desce sobre o cartao enquanto a cabeca vai e volta (zigue-zague)
    const seg = (1.6 + h * 0.55) / vel();
    let voltas = Math.max(3, Math.round(seg / 0.17));
    if (voltas % 2 === 0) voltas++; // numero impar => termina do lado direito
    cabeca.style.setProperty('--amp', k.larg / 2 + 'px');
    cabeca.style.setProperty('--periodo', seg / voltas + 's');
    cabeca.style.setProperty('--voltas', voltas);
    cabeca.classList.add('ativa');
    posicionar(k.x + k.larg / 2, k.y, 0); // centro da vaga; a animacao comeca em -amp (= canto esquerdo)
    cabeca.classList.add('varrendo');
    void cabeca.offsetWidth;

    if (d.som !== false) somImpressora(seg);
    tocarEfeito(d.efeito);
    requestAnimationFrame(() => {
      ponte.style.transition = `transform ${seg}s linear`;
      ponte.style.transform = `translateY(${k.y + k.alt}px)`;
      k.el.style.transition = `clip-path ${seg}s linear`;
      k.el.style.clipPath = 'inset(0 0 0 0)';
    });
    await dormir(seg * 1000 + 40);

    // 3) termina no canto inferior direito, sem "pulo"
    cabeca.classList.remove('varrendo');
    posicionar(k.x + k.larg, k.y + k.alt, 0);
    if (d.som !== false) somPlim();
  }

  function imprimir(d) {
    fila.push(d);
    proximo();
  }

  async function proximo() {
    if (imprimindo || !fila.length) return;
    imprimindo = true;
    clearTimeout(timerCasa);
    while (fila.length) {
      const job = fila.shift();
      try {
        if (job.avancar) await avancarPapel();
        else await imprimirCartao(job);
      } catch (e) {
        console.error(e);
      }
      await dormir(250);
    }
    imprimindo = false;
    cabeca.classList.remove('ativa');
    // parada: depois de um tempo sem pedidos, volta para a posicao de descanso
    timerCasa = setTimeout(async () => {
      if (imprimindo || fila.length) return;
      imprimindo = true; // trava a maquina enquanto volta, para nao brigar com um novo pedido
      await irParaCasa();
      imprimindo = false;
      proximo();
    }, 1500);
  }

  posicionar(CASA.x, CASA.y, 0);

  // diminui a fonte do nome ate caber no cartao
  function ajustarTitulo(el) {
    let tam = parseFloat(getComputedStyle(el).fontSize);
    const max = el.parentElement.clientWidth - 30;
    while (el.scrollWidth > max && tam > 14) {
      tam -= 2;
      el.style.fontSize = tam + 'px';
    }
  }

  // emoji do presente a partir das regras (quando o TikTok nao manda a imagem)
  function emojiDoPresente(nome) {
    const n = String(nome || '').toLowerCase();
    const r = (cfg.regras || []).find((x) => x.gatilho === 'presente' && String(x.presente || '').toLowerCase() === n);
    return r ? r.icone : '🎁';
  }

  // ---------------------------------------------------------- alertas
  function alerta({ nome, foto, desc, icone, iconeUrl, qtd, destaque }) {
    const el = document.createElement('div');
    el.className = 'alerta' + (destaque ? ' destaque' : '');
    const gi = iconeUrl ? `<img src="${esc(iconeUrl)}">` : esc(icone || '🎁');
    el.innerHTML = `
      <div class="av">${fotoHtml(foto, nome)}</div>
      <div class="tx"><div class="nm">${esc(nome)}</div><div class="ds">${esc(desc)}</div></div>
      <div class="gi">${gi}</div>
      ${qtd ? `<div class="qt">x${esc(qtd)}</div>` : ''}`;
    alertasEl.appendChild(el);
    while (alertasEl.children.length > 3) alertasEl.firstElementChild.remove();
    setTimeout(() => el.remove(), 5200);
  }

  // ---------------------------------------------------------- coracoes
  let coracoesAtivos = 0;
  function coracoes(qtd) {
    if (!cfg.overlay.coracoes) return;
    const n = Math.min(qtd, 6);
    const cores = ['❤️', '💖', '💗', '💓', '🧡', '💜'];
    for (let i = 0; i < n && coracoesAtivos < 40; i++) {
      coracoesAtivos++;
      setTimeout(() => {
        const c = document.createElement('div');
        c.className = 'coracao';
        c.textContent = cores[Math.floor(Math.random() * cores.length)];
        c.style.left = Math.random() * 70 + 'px';
        c.style.setProperty('--dx', (Math.random() * 120 - 60) + 'px');
        coracoesEl.appendChild(c);
        setTimeout(() => { c.remove(); coracoesAtivos--; }, 2500);
      }, i * 120);
    }
  }

  // ---------------------------------------------------------- banner / timer
  let fimTimer = 0;
  function reiniciarTimer() {
    fimTimer = Date.now() + Math.max(1, Number(cfg.overlay.bannerMinutos) || 15) * 60000;
    try { localStorage.setItem('fimTimer', String(fimTimer)); } catch (_) {}
  }
  try { fimTimer = Number(localStorage.getItem('fimTimer')) || 0; } catch (_) {}

  setInterval(() => {
    if (!cfg.overlay.bannerAtivo) return;
    let resta = fimTimer - Date.now();
    if (resta <= 0) {
      if (cfg.overlay.bannerRepetir || !fimTimer) { reiniciarTimer(); resta = fimTimer - Date.now(); } else resta = 0;
    }
    const s = Math.ceil(resta / 1000);
    bannerTimer.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }, 250);

  // ---------------------------------------------------------- aplicar config
  function aplicarConfig(c) {
    const minutosAntes = cfg.overlay && cfg.overlay.bannerMinutos;
    cfg = c;
    const o = c.overlay || {};
    document.body.classList.remove('fundo-escuro', 'fundo-verde');
    const fundo = new URLSearchParams(location.search).get('fundo') || o.fundo;
    if (fundo === 'escuro') document.body.classList.add('fundo-escuro');
    if (fundo === 'verde') document.body.classList.add('fundo-verde');

    bannerEl.classList.toggle('oculto', !o.bannerAtivo);
    bannerTexto.textContent = o.bannerTexto || '';
    if (minutosAntes !== undefined && minutosAntes !== o.bannerMinutos) reiniciarTimer();

    lateralEl.classList.toggle('oculto', !o.mostrarLateral);
    lateralEl.innerHTML = (c.regras || [])
      .filter((r) => r.ativo && r.lateral)
      .map((r) => `<div class="item"><span class="ic">${esc(r.icone || '🎁')}</span>${esc(r.rotulo || '')}</div>`)
      .join('');
  }

  aplicarConfig({
    overlay: { fundo: 'escuro', bannerAtivo: true, bannerTexto: '1.000 CURTIDAS = SUA FOTO IMPRESSA', bannerMinutos: 15, bannerRepetir: true, coracoes: true },
  });
  reiniciarTimer();

  const likes = new Map();
  function gift(entry) {
    if (!entry?.gift) return;
    const nome = entry.user || 'Espectador';
    const foto = entry.avatar;
    const presente = entry.giftName || 'presente';
    const qtd = Number(entry.count) || 1;
    const icone = emojiDoPresente(presente);
    alerta({ nome, foto, desc: 'enviou ' + presente, icone, qtd });
    imprimir({ nome, foto, texto: 'enviou ' + presente + ' ×' + qtd, icone });
  }
  function like(entry) {
    const count = Math.min(1000, Math.max(1, Number(entry.count) || 1));
    const uid = entry.uid || entry.user;
    coracoes(count);
    if (!uid) return;
    const total = (likes.get(uid) || 0) + count;
    if (total >= 1000) imprimir({ nome: entry.user, foto: entry.avatar, texto: 'deu 1.000 curtidas', icone: '❤️' });
    likes.set(uid, total % 1000);
  }
  if (typeof io === 'function') {
    const socket = io({ auth: { overlayKey: params.get('key') || '' } });
    socket.on('entry', gift);
    socket.on('like', like);
    socket.on('clear', () => likes.clear());
  } else if (typeof BroadcastChannel === 'function') {
    const channel = new BroadcastChannel('reader-demo');
    channel.onmessage = ({ data }) => gift(data);
  }

  if (params.get('sim') === '1') {
    const sample = () => {
      gift({ gift: true, user: 'Espectador de teste', giftName: 'Rosa', count: 1 });
      like({ uid: 'simulado', user: 'Espectador de teste', count: 1000 });
    };
    sample();
    setInterval(sample, 12000);
  }
})();
