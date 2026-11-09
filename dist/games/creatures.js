// Bichinhos Evolutivos: each viewer hatches a creature that grows and evolves with interaction.
(() => {
  const G = window.Games, { W, H, rand, clamp } = G;
  const STAGES = [
    { name: 'Ovo', xp: 0 }, { name: 'Filhote', xp: 40 }, { name: 'Jovem', xp: 150 }, { name: 'Adulto', xp: 400 },
    { name: 'Campeão', xp: 1000 }, { name: 'Mítico', xp: 2500 }, { name: 'Lendário', xp: 6000 }
  ];
  const MAX = 60, IDLE_LIMIT = 15 * 60, TOP = 420, BOTTOM = 1640;
  let pets, clock;

  const stageOf = xp => STAGES.reduce((s, st, i) => xp >= st.xp ? i : s, 0);
  const radiusOf = stage => 30 + stage * 11;

  function init() { pets = []; clock = 0; }

  function petFor(ev) {
    let p = pets.find(x => x.uid === ev.uid);
    if (!p) {
      if (pets.length >= MAX) {
        pets.sort((a, b) => b.seen - a.seen);
        pets.pop();
      }
      const seed = G.hash(ev.uid);
      p = {
        uid: ev.uid, name: ev.name, avatar: ev.avatar, seed, hue: seed % 360,
        eyes: 1 + (seed >> 3) % 3, spikes: 5 + (seed >> 5) % 6, wobble: rand(0, 6),
        x: rand(120, W - 120), y: rand(TOP + 100, BOTTOM - 100), vx: 0, vy: 0, tx: 0, ty: 0,
        xp: 0, stage: 0, r: radiusOf(0), m: 1, hop: 0, say: '', sayT: 0, glow: 0, seen: clock
      };
      p.tx = p.x; p.ty = p.y;
      pets.push(p);
      G.toast(`🥚 ${ev.name} chocou um ovo!`, '#a7f3d0');
    }
    p.name = ev.name;
    if (ev.avatar) p.avatar = ev.avatar;
    p.seen = clock;
    return p;
  }

  function gain(p, xp) {
    p.xp += xp;
    const stage = stageOf(p.xp);
    if (stage > p.stage) {
      p.stage = stage;
      p.glow = 2.5;
      G.burst(p.x, p.y, `hsl(${p.hue} 90% 65%)`, 40, 600);
      G.toast(`✨ ${p.name} evoluiu para ${STAGES[stage].name}!`, `hsl(${p.hue} 90% 75%)`);
    }
  }

  function update(dt) {
    clock += dt;
    pets = pets.filter(p => clock - p.seen < IDLE_LIMIT);
    for (const p of pets) {
      p.r += (radiusOf(p.stage) - p.r) * Math.min(1, dt * 3);
      p.m = 1 + p.stage;
      p.glow = Math.max(0, p.glow - dt);
      p.sayT = Math.max(0, p.sayT - dt);
      p.hop = Math.max(0, p.hop - dt * 2.5);
      if (Math.hypot(p.tx - p.x, p.ty - p.y) < 30 || Math.random() < dt * 0.15) {
        p.tx = rand(80 + p.r, W - 80 - p.r);
        p.ty = rand(TOP + p.r, BOTTOM - p.r);
      }
      const speed = p.stage === 0 ? 0 : 60 + p.stage * 8;
      const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy) || 1;
      p.vx += (dx / d * speed - p.vx) * Math.min(1, dt * 2);
      p.vy += (dy / d * speed - p.vy) * Math.min(1, dt * 2);
      p.x = clamp(p.x + p.vx * dt, p.r, W - p.r);
      p.y = clamp(p.y + p.vy * dt, TOP, BOTTOM);
    }
    G.collide(pets, 0.2);
  }

  function drawPet(ctx, p, t) {
    const { x, r, stage, hue } = p;
    const y = p.y - Math.sin(p.hop * Math.PI) * 50;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + r * 0.9, r * 0.9, r * 0.25, 0, 0, Math.PI * 2); ctx.fill();
    if (stage >= 6 || p.glow > 0) {
      ctx.fillStyle = `hsla(${hue} 100% 70% / ${stage >= 6 ? 0.25 + 0.1 * Math.sin(t * 3) : p.glow / 3})`;
      ctx.beginPath(); ctx.arc(x, y, r * 1.7, 0, Math.PI * 2); ctx.fill();
    }
    if (stage === 0) {
      ctx.fillStyle = `hsl(${hue} 60% 88%)`;
      ctx.beginPath(); ctx.ellipse(x, y, r * 0.8, r, Math.sin(t * 4 + p.wobble) * 0.1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `hsl(${hue} 70% 60%)`;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x - r * 0.3 + i * r * 0.3, y - r * 0.2 + (i % 2) * r * 0.4, r * 0.13, 0, Math.PI * 2); ctx.fill(); }
      const cracks = clamp(p.xp / STAGES[1].xp, 0, 1);
      if (cracks > 0.3) {
        ctx.strokeStyle = '#334155'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x - r * 0.5, y - r * 0.1);
        for (let i = 1; i <= 4; i++) ctx.lineTo(x - r * 0.5 + i * r * 0.25 * cracks, y - r * 0.1 + (i % 2 ? -1 : 1) * r * 0.15);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    if (stage >= 5) {
      ctx.fillStyle = `hsla(${(hue + 40) % 360} 80% 75% / .8)`;
      const flap = Math.sin(t * 8 + p.wobble) * 0.35;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(x + side * r * 0.5, y - r * 0.2);
        ctx.quadraticCurveTo(x + side * r * 2.1, y - r * (1.3 + flap), x + side * r * 1.6, y + r * 0.3);
        ctx.closePath(); ctx.fill();
      }
    }
    if (stage >= 3) {
      ctx.fillStyle = `hsl(${hue} 70% 35%)`;
      for (let i = 0; i < p.spikes; i++) {
        const a = Math.PI + (i + 0.5) / p.spikes * Math.PI;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a - 0.2) * r * 0.9, y + Math.sin(a - 0.2) * r * 0.9);
        ctx.lineTo(x + Math.cos(a) * r * 1.35, y + Math.sin(a) * r * 1.35);
        ctx.lineTo(x + Math.cos(a + 0.2) * r * 0.9, y + Math.sin(a + 0.2) * r * 0.9);
        ctx.fill();
      }
    }
    const body = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r);
    body.addColorStop(0, `hsl(${hue} 90% 75%)`);
    body.addColorStop(1, `hsl(${hue} 75% 45%)`);
    ctx.fillStyle = body;
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = i / 24 * Math.PI * 2, wob = 1 + Math.sin(a * 3 + t * 3 + p.wobble) * 0.05;
      const px = x + Math.cos(a) * r * wob, py = y + Math.sin(a) * r * wob * 0.92;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.fill();
    if (stage >= 4) {
      ctx.fillStyle = '#fef3c7';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(x + side * r * 0.35, y - r * 0.75);
        ctx.lineTo(x + side * r * 0.6, y - r * 1.45);
        ctx.lineTo(x + side * r * 0.65, y - r * 0.6);
        ctx.fill();
      }
    }
    if (stage >= 6) G.text(ctx, '👑', x, y - r * 1.35, { size: r * 0.7, stroke: null });
    const blink = Math.sin(t * 1.3 + p.wobble * 5) > 0.97;
    const gap = r * 0.42;
    for (let i = 0; i < p.eyes; i++) {
      const ex = x + (i - (p.eyes - 1) / 2) * gap, ey = y - r * 0.15;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(ex, ey, r * 0.17, blink ? r * 0.03 : r * 0.2, 0, 0, Math.PI * 2); ctx.fill();
      if (!blink) {
        ctx.fillStyle = '#0f172a';
        ctx.beginPath(); ctx.arc(ex + Math.sign(p.vx) * r * 0.05, ey + r * 0.03, r * 0.09, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = Math.max(3, r * 0.06);
    ctx.beginPath(); ctx.arc(x, y + r * 0.28, r * 0.22, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    ctx.restore();
  }

  function draw(ctx) {
    const t = performance.now() / 1000;
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0c4a6e'); bg.addColorStop(0.35, '#065f46'); bg.addColorStop(1, '#14532d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 40; i++) {
      const gx = (G.hash('grass' + i) % W), gy = TOP + (G.hash('gy' + i) % (BOTTOM - TOP));
      ctx.fillStyle = 'rgba(134,239,172,.15)';
      ctx.beginPath(); ctx.ellipse(gx, gy, 60, 16, 0, 0, Math.PI * 2); ctx.fill();
    }
    const sorted = [...pets].sort((a, b) => a.y - b.y);
    for (const p of sorted) drawPet(ctx, p, t);
    G.drawParticles(ctx);
    for (const p of sorted) {
      const y = p.y - Math.sin(p.hop * Math.PI) * 50;
      G.drawAvatar(ctx, p, p.x - p.r * 0.2 - 60, y + p.r + 34, 18);
      G.text(ctx, p.name, p.x - p.r * 0.2 - 34, y + p.r + 34, { size: 26, align: 'left', max: 220 });
      G.text(ctx, `${STAGES[p.stage].name} · ${Math.floor(p.xp)} XP`, p.x, y + p.r + 66, { size: 20, color: '#d1fae5', weight: 600 });
      if (p.sayT > 0) {
        ctx.globalAlpha = clamp(p.sayT, 0, 1);
        G.panel(ctx, p.x - 170, y - p.r - 110, 340, 60, 'rgba(255,255,255,.92)', 20);
        G.text(ctx, p.say, p.x, y - p.r - 80, { size: 26, color: '#0f172a', stroke: null, max: 310 });
        ctx.globalAlpha = 1;
      }
    }
    const top = [...pets].sort((a, b) => b.xp - a.xp).slice(0, 5);
    if (top.length) {
      G.panel(ctx, 30, 160, 470, 60 + top.length * 58);
      G.text(ctx, '🏅 Mais evoluídos', 265, 195, { size: 32, color: '#fde047' });
      top.forEach((p, i) => {
        const y = 250 + i * 58;
        G.drawAvatar(ctx, p, 75, y, 22, `hsl(${p.hue} 80% 60%)`);
        G.text(ctx, p.name, 110, y, { size: 28, align: 'left', max: 200 });
        G.text(ctx, STAGES[p.stage].name, 480, y, { size: 24, align: 'right', color: '#a7f3d0', weight: 600 });
      });
    } else {
      G.panel(ctx, 90, 760, W - 180, 220);
      G.text(ctx, 'Comente para chocar seu ovo!', W / 2, 830, { size: 54, color: '#a7f3d0', max: W - 220 });
      G.text(ctx, 'Interaja para ele evoluir', W / 2, 910, { size: 40 });
    }
  }

  function event(ev) {
    const p = petFor(ev);
    if (ev.type === 'chat') {
      gain(p, 10);
      p.hop = 1;
      p.say = ev.text.slice(0, 40);
      p.sayT = 3.5;
    } else if (ev.type === 'like') {
      gain(p, Math.min(30, ev.count));
    } else if (ev.type === 'gift') {
      gain(p, ev.coins * 25);
      p.hop = 1;
      p.glow = Math.max(p.glow, 1.5);
      G.toast(`🎁 ${ev.name} alimentou o bichinho com ${ev.giftName}`, '#fde047');
    }
  }

  G.register({
    id: 'bichinhos', title: 'Bichinhos Evolutivos', emoji: '🐣',
    blurb: 'Cada espectador choca um ovo. Interações dão XP e o bichinho evolui até virar lendário.',
    help: ['💬 Comente para chocar e dar XP ao seu bichinho', '❤️ Curtidas = XP  ·  🎁 Presente = muito XP'],
    toastY: 570,
    simChat: () => G.pick(['cresce!', 'olha o meu', 'evolui', 'que fofo', 'kkkk', 'oi']),
    init, update, draw, event
  });
})();
