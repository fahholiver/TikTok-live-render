// Arena do Empurrão: viewers bump each other off a shrinking floating platform.
(() => {
  const G = window.Games, { W, H, rand, clamp } = G;
  const CX = W / 2, CY = 1110, START_R = 450, MIN_R = 150, SHRINK_TIME = 70, LOBBY_TIME = 25, MAX = 60;
  let state, players, fallen, queue, timer, radius, fightTime, winner, waves;

  function add(ev) {
    if (players.some(p => p.uid === ev.uid) || players.length >= MAX) return false;
    const a = rand(0, Math.PI * 2), d = rand(0, START_R - 80);
    players.push({ uid: ev.uid, name: ev.name, avatar: ev.avatar, x: CX + Math.cos(a) * d, y: CY + Math.sin(a) * d, vx: 0, vy: 0, r: 34, m: 1, think: rand(0.5, 1.5), power: 0, out: false, fall: 0, hits: 0 });
    return true;
  }

  function init() {
    state = 'lobby';
    players = []; fallen = []; waves = [];
    timer = LOBBY_TIME; radius = START_R; fightTime = 0; winner = null;
    for (const ev of queue || []) add(ev);
    queue = [];
  }

  const alive = () => players.filter(p => !p.out);

  function dash(p, strength) {
    const others = alive().filter(o => o !== p);
    let tx = CX - p.x, ty = CY - p.y;
    if (others.length) {
      const near = others.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[Math.random() < 0.7 ? 0 : Math.floor(rand(0, others.length))];
      tx = near.x - p.x; ty = near.y - p.y;
    }
    const d = Math.hypot(tx, ty) || 1;
    p.vx += tx / d * strength + rand(-60, 60);
    p.vy += ty / d * strength + rand(-60, 60);
  }

  function shockwave(p, coins) {
    const reach = 160 + Math.min(260, 50 * Math.log2(coins + 1));
    const force = 500 + Math.min(1100, 160 * Math.log2(coins + 1));
    waves.push({ x: p.x, y: p.y, r: 0, max: reach, t: 0.5 });
    for (const o of alive()) {
      if (o === p) continue;
      const dx = o.x - p.x, dy = o.y - p.y, d = Math.hypot(dx, dy) || 1;
      if (d > reach) continue;
      const k = force * (1 - d / reach * 0.6);
      o.vx += dx / d * k; o.vy += dy / d * k;
    }
    p.power = 6;
    G.burst(p.x, p.y, '#f472b6', 30, 600);
  }

  function update(dt) {
    if (state === 'lobby') {
      if (players.length) timer -= dt;
      if (timer <= 0) {
        if (players.length >= 2) { state = 'fight'; G.toast('🥊 Empurra!', '#f472b6'); }
        else timer = 10;
      }
    } else if (state === 'fight') {
      fightTime += dt;
      radius = START_R - (START_R - MIN_R) * clamp(fightTime / SHRINK_TIME, 0, 1);
      for (const p of alive()) {
        p.think -= dt;
        if (p.think <= 0) { p.think = rand(0.6, 1.6); dash(p, rand(260, 420)); }
      }
      if (fightTime > SHRINK_TIME + 30) for (const p of alive()) dash(p, 80);
    } else if (state === 'results') {
      timer -= dt;
      if (timer <= 0) init();
    }
    for (const p of players) {
      p.power = Math.max(0, p.power - dt);
      p.m = p.power > 0 ? 2.5 : 1;
      if (p.out) { p.fall += dt; p.x += p.vx * dt * 0.4; p.y += p.vy * dt * 0.4; continue; }
      const damp = Math.pow(state === 'lobby' ? 0.05 : 0.35, dt);
      p.vx *= damp; p.vy *= damp;
      const s = Math.hypot(p.vx, p.vy);
      if (s > 1300) { p.vx *= 1300 / s; p.vy *= 1300 / s; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const d = Math.hypot(p.x - CX, p.y - CY);
      if (state === 'lobby' && d > radius - p.r) {
        p.x = CX + (p.x - CX) / d * (radius - p.r); p.y = CY + (p.y - CY) / d * (radius - p.r);
      } else if (state === 'fight' && d > radius + p.r * 0.2) {
        p.out = true;
        fallen.push(p);
        G.burst(p.x, p.y, G.color(p.uid), 22);
        const left = alive().length;
        G.toast(`💥 ${p.name} caiu! Restam ${left}`, '#fda4af');
      }
    }
    G.collide(players, 0.9);
    for (const w of waves) { w.t -= dt; w.r = w.max * (1 - w.t / 0.5); }
    waves = waves.filter(w => w.t > 0);
    if (state === 'fight' && alive().length <= 1) {
      winner = alive()[0] || fallen[fallen.length - 1] || null;
      state = 'results'; timer = 9;
      if (winner) { G.toast(`👑 ${winner.name} é o campeão da arena!`, '#fde047'); G.burst(winner.x, winner.y, '#fde047', 60, 700); }
    }
  }

  function draw(ctx) {
    const bg = ctx.createRadialGradient(CX, CY, 100, CX, CY, 1200);
    bg.addColorStop(0, '#3b0764'); bg.addColorStop(1, '#020617');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // lava sea
    const t = performance.now() / 1000;
    for (let i = 0; i < 26; i++) {
      const a = i / 26 * Math.PI * 2 + t * 0.1, d = 560 + Math.sin(t * 2 + i) * 30;
      ctx.fillStyle = `rgba(249,115,22,${0.12 + 0.06 * Math.sin(t * 3 + i)})`;
      ctx.beginPath(); ctx.arc(CX + Math.cos(a) * d, CY + Math.sin(a) * d * 1.3, 120, 0, Math.PI * 2); ctx.fill();
    }
    // platform
    ctx.save();
    ctx.shadowColor = '#c084fc'; ctx.shadowBlur = 40;
    ctx.fillStyle = '#1e1b4b';
    ctx.beginPath(); ctx.arc(CX, CY + 26, radius, 0, Math.PI * 2); ctx.fill();
    const top = ctx.createRadialGradient(CX, CY - 80, 20, CX, CY, radius);
    top.addColorStop(0, '#6d28d9'); top.addColorStop(1, '#312e81');
    ctx.fillStyle = top;
    ctx.beginPath(); ctx.arc(CX, CY, radius, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = state === 'fight' && radius < START_R - 5 ? '#f87171' : '#c4b5fd';
    ctx.lineWidth = 8;
    ctx.beginPath(); ctx.arc(CX, CY, radius, 0, Math.PI * 2); ctx.stroke();
    for (const w of waves) {
      ctx.strokeStyle = `rgba(244,114,182,${w.t * 2})`; ctx.lineWidth = 14;
      ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2); ctx.stroke();
    }
    for (const p of players) {
      if (p.out && p.fall > 1.2) continue;
      const scale = p.out ? Math.max(0.05, 1 - p.fall) : 1;
      if (p.power > 0) {
        ctx.fillStyle = 'rgba(244,114,182,.35)';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 1.5, 0, Math.PI * 2); ctx.fill();
      }
      G.drawAvatar(ctx, p, p.x, p.y, p.r * scale);
      if (!p.out && (players.length <= 20 || p.power > 0)) G.text(ctx, p.name, p.x, p.y - p.r - 20, { size: 24, max: 200 });
    }
    G.drawParticles(ctx);
    const n = alive().length;
    if (state === 'lobby') {
      G.panel(ctx, 90, 160, W - 180, 260);
      G.text(ctx, 'Comente para entrar na arena!', W / 2, 230, { size: 52, color: '#f9a8d4', max: W - 220 });
      G.text(ctx, players.length ? (players.length < 2 && timer <= 10 ? 'Esperando mais 1 lutador…' : `Luta em ${Math.ceil(timer)}s`) : 'Aguardando lutadores', W / 2, 310, { size: 50 });
      G.text(ctx, `${players.length} lutador${players.length === 1 ? '' : 'es'}`, W / 2, 375, { size: 34, color: '#cbd5e1', weight: 600 });
    } else if (state === 'fight') {
      G.text(ctx, `🧍 ${n} de pé`, W / 2, 200, { size: 52, color: '#fde047' });
    } else if (state === 'results') {
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, W, H);
      if (winner) {
        G.text(ctx, '👑 Campeão da Arena', W / 2, 640, { size: 76, color: '#fde047' });
        G.drawAvatar(ctx, winner, W / 2, 900, 150, '#fde047');
        G.text(ctx, winner.name, W / 2, 1110, { size: 58, max: W - 160 });
      }
      G.text(ctx, `Nova rodada em ${Math.ceil(timer)}s`, W / 2, 1220, { size: 42, color: '#e2e8f0' });
    }
  }

  function event(ev) {
    const p = players.find(x => x.uid === ev.uid);
    if (ev.type === 'chat') {
      if (state === 'lobby') { if (add(ev)) G.toast(`➕ ${ev.name} entrou na arena`, '#c4b5fd'); }
      else if (p && !p.out && state === 'fight') dash(p, 360);
      else if (!p && !queue.some(q => q.uid === ev.uid) && queue.length < MAX) queue.push(ev);
    } else if (ev.type === 'gift') {
      if (!p && state === 'lobby') add(ev);
      const me = players.find(x => x.uid === ev.uid);
      if (me && !me.out && state === 'fight') { shockwave(me, ev.coins); G.toast(`💫 Onda de choque de ${ev.name}!`, '#f472b6'); }
      else if (me && state === 'lobby') { me.power = 3; G.toast(`💪 ${ev.name} chegou com ${ev.giftName}`, '#f472b6'); }
      else if (!me && !queue.some(q => q.uid === ev.uid)) queue.push(ev);
    } else if (ev.type === 'like' && p && !p.out && state === 'fight') {
      dash(p, Math.min(300, 40 * ev.count));
    }
  }

  G.register({
    id: 'arena', title: 'Arena do Empurrão', emoji: '🥊',
    blurb: 'Todo mundo numa plataforma que encolhe. Empurre os outros para a lava: o último de pé vence.',
    help: ['💬 Comente para entrar na arena', '💬 De novo = investida  ·  ❤️ Curtida = empurrão', '🎁 Presente = onda de choque'],
    toastY: 470,
    simChat: () => G.pick(['vou ganhar', 'sai da frente', 'bora', 'kkkk', 'empurra!']),
    init, update, draw, event
  });
})();
