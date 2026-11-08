// Shared engine for the live games: canvas, live events, avatars, HUD and crowd simulation.
(() => {
  const W = 1080, H = 1920;
  const params = new URLSearchParams(location.search);
  const key = params.get('key');
  const obs = key !== null || params.get('obs') === '1';
  const games = new Map();
  let game = null, last = performance.now(), simulate = false, simTimer = 0;
  const toasts = [], particles = [], avatars = new Map();

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pick = list => list[Math.floor(Math.random() * list.length)];
  function hash(text) {
    let h = 2166136261;
    for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return h >>> 0;
  }
  const hue = id => hash(id) % 360;
  const color = (id, l = 58) => `hsl(${hue(id)} 85% ${l}%)`;

  function avatarImage(viewer) {
    if (!viewer?.avatar) return null;
    let img = avatars.get(viewer.avatar);
    if (!img) {
      img = new Image();
      img.referrerPolicy = 'no-referrer';
      img.decoding = 'async';
      img.src = viewer.avatar;
      avatars.set(viewer.avatar, img);
      if (avatars.size > 600) avatars.delete(avatars.keys().next().value);
    }
    return img.complete && img.naturalWidth ? img : null;
  }

  function drawAvatar(ctx, viewer, x, y, r, ring = color(viewer.uid)) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = ring;
    ctx.fill();
    const img = avatarImage(viewer);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.86, 0, Math.PI * 2);
    ctx.clip();
    if (img) ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
    else {
      ctx.fillStyle = color(viewer.uid, 30);
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.fillStyle = '#fff';
      ctx.font = `800 ${Math.round(r)}px system-ui,sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((viewer.name || '?').trim().charAt(0).toUpperCase() || '?', x, y + r * 0.05);
    }
    ctx.restore();
  }

  function text(ctx, str, x, y, { size = 40, color: fill = '#fff', align = 'center', weight = 800, stroke = 'rgba(0,0,0,.75)', base = 'middle', max } = {}) {
    ctx.save();
    ctx.font = `${weight} ${size}px system-ui,"Segoe UI",sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = base;
    let s = String(str);
    if (max) while (s.length > 1 && ctx.measureText(s).width > max) s = s.slice(0, -2) + '…';
    if (stroke) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(4, size / 6);
      ctx.strokeStyle = stroke;
      ctx.strokeText(s, x, y);
    }
    ctx.fillStyle = fill;
    ctx.fillText(s, x, y);
    ctx.restore();
  }

  function panel(ctx, x, y, w, h, fill = 'rgba(8,12,28,.78)', r = 24) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();
  }

  function toast(message, tint = '#fbbf24') {
    toasts.push({ message, tint, t: 4 });
    if (toasts.length > 3) toasts.shift();
  }

  function burst(x, y, tint, n = 18, speed = 420) {
    for (let i = 0; i < n && particles.length < 700; i++) {
      const a = rand(0, Math.PI * 2), v = rand(speed * 0.3, speed);
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.5, 1.1), max: 1.1, tint, r: rand(4, 10) });
    }
  }
  function drawParticles(ctx) {
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.tint;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Pushes overlapping circles apart and exchanges momentum along the contact normal.
  function collide(bodies, bounce = 0.6) {
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      if (a.out) continue;
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        if (b.out) continue;
        const dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r, d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 === 0) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, ma = a.m || 1, mb = b.m || 1, overlap = min - d;
        a.x -= nx * overlap * mb / (ma + mb); a.y -= ny * overlap * mb / (ma + mb);
        b.x += nx * overlap * ma / (ma + mb); b.y += ny * overlap * ma / (ma + mb);
        const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel > 0) continue;
        const impulse = -(1 + bounce) * rel / (1 / ma + 1 / mb);
        a.vx -= impulse * nx / ma; a.vy -= impulse * ny / ma;
        b.vx += impulse * nx / mb; b.vy += impulse * ny / mb;
      }
    }
  }

  function normalize(entry, type) {
    const name = String(entry?.user || 'Viewer').slice(0, 40);
    return {
      type,
      uid: String(entry?.uid || name),
      name,
      avatar: typeof entry?.avatar === 'string' && entry.avatar.startsWith('https://') ? entry.avatar : null,
      text: String(entry?.text || '').slice(0, 200),
      coins: type === 'gift' ? Math.max(1, Number(entry?.coins) || 1) : 0,
      count: Math.max(1, Number(entry?.count) || 1),
      giftName: String(entry?.giftName || 'presente'),
      demo: Boolean(entry?.demo)
    };
  }
  function dispatch(ev) {
    if (!game) return;
    try { game.event(ev); } catch (err) { console.error(err); }
  }
  const fromEntry = entry => dispatch(normalize(entry, entry?.gift ? 'gift' : 'chat'));

  // Fake viewers for testing without a live.
  const fakeNames = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fábio', 'Gabi', 'Heitor', 'Iris', 'João', 'Kaká', 'Lara', 'Miguel', 'Nina', 'Otávio', 'Paula', 'Quésia', 'Rafa', 'Sofia', 'Téo', 'Ursula', 'Vini', 'Wesley', 'Xuxa', 'Yara', 'Zeca', 'Luna', 'Davi', 'Malu', 'Enzo', 'Bia', 'Caio'];
  function simulateTick(dt) {
    simTimer -= dt;
    if (simTimer > 0) return;
    simTimer = rand(0.15, 0.6);
    const name = pick(fakeNames), base = { user: name, uid: 'sim-' + name, demo: true };
    const roll = Math.random();
    if (roll < 0.06) fromEntry({ ...base, gift: true, giftName: 'Rosa', count: 1, coins: pick([1, 1, 5, 10, 30, 99, 199]) });
    else if (roll < 0.45) dispatch(normalize({ ...base, count: Math.ceil(rand(1, 15)) }, 'like'));
    else fromEntry({ ...base, text: game?.simChat?.() || pick(['oi', 'bora!', 'kkkk', 'vai vai', '🔥🔥']) });
  }

  function drawHud(ctx, dt) {
    if (!game) return;
    panel(ctx, 140, 26, W - 280, 104, 'rgba(8,12,28,.82)', 52);
    text(ctx, `${game.emoji} ${game.title}`, W / 2, 80, { size: 56, max: W - 330 });
    const help = game.help || [];
    if (help.length) {
      const lines = help.length;
      const h = 34 + lines * 50;
      panel(ctx, 40, H - h - 40, W - 80, h, 'rgba(8,12,28,.8)');
      help.forEach((line, i) => text(ctx, line, W / 2, H - h - 40 + 42 + i * 50, { size: 34, weight: 700, color: '#e2e8f0', max: W - 140 }));
    }
    let y = game.toastY || 180;
    for (let i = toasts.length - 1; i >= 0; i--) {
      const t = toasts[i];
      t.t -= dt;
      if (t.t <= 0) { toasts.splice(i, 1); continue; }
      ctx.globalAlpha = clamp(t.t, 0, 1);
      text(ctx, t.message, W / 2, y, { size: 38, color: t.tint, max: W - 100 });
      ctx.globalAlpha = 1;
      y += 52;
    }
  }

  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');
  canvas.width = W; canvas.height = H;
  function fit() {
    const s = Math.min(innerWidth / W, innerHeight / H);
    canvas.style.width = W * s + 'px';
    canvas.style.height = H * s + 'px';
  }
  addEventListener('resize', fit);
  fit();

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (game) {
      if (simulate) simulateTick(dt);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy = p.vy * 0.96 + 300 * dt;
        if (p.life <= 0) particles.splice(i, 1);
      }
      try {
        game.update(dt);
        ctx.clearRect(0, 0, W, H);
        game.draw(ctx);
      } catch (err) { console.error(err); }
      drawHud(ctx, dt);
    }
    requestAnimationFrame(frame);
  }

  window.Games = {
    W, H, rand, clamp, pick, hash, hue, color, text, panel, toast, burst, drawParticles, drawAvatar, collide,
    register(def) { games.set(def.id, def); },
    list: () => [...games.values()],
    start(id) {
      game = games.get(id) || null;
      toasts.length = 0; particles.length = 0;
      if (game) { game.init(); document.title = game.title + ' · TikTok Live'; }
      return game;
    },
    reset() { if (game) { toasts.length = 0; particles.length = 0; game.init(); } },
    setSimulate(on) { simulate = Boolean(on); },
    obs, key,
    boot() {
      if (typeof window.io === 'function' && window.io.Manager) {
        const socket = window.io({ auth: { overlayKey: key } });
        socket.on('entry', fromEntry);
        socket.on('like', like => dispatch(normalize(like, 'like')));
        socket.on('connect_error', err => toast('Sem conexão com o servidor: ' + err.message, '#fda4af'));
      }
      if (typeof BroadcastChannel === 'function') new BroadcastChannel('reader-demo').onmessage = ({ data }) => fromEntry(data);
      requestAnimationFrame(frame);
    }
  };
})();
