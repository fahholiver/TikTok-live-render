// Corrida de Bolinhas: each viewer drops a marble with their avatar down an obstacle course.
(() => {
  const G = window.Games, { W, H, rand, clamp } = G;
  const LENGTH = 7200, FINISH = LENGTH - 700, GATE = 560, LOBBY_TIME = 30, MAX = 80;
  const LEFT = 70, RIGHT = W - 70, GRAVITY = 1100;
  let state, statics, marbles, queue, timer, cam, places, firstFinish, raceTime, results;

  function seg(ax, ay, bx, by, t = 7) { statics.push({ ax, ay, bx, by, t, top: Math.min(ay, by) - 40, bottom: Math.max(ay, by) + 40 }); }
  function peg(x, y) { seg(x, y, x, y, 15); }

  function buildTrack() {
    statics = [];
    seg(LEFT, -400, LEFT, LENGTH);
    seg(RIGHT, -400, RIGHT, LENGTH);
    seg(LEFT, LENGTH - 330, RIGHT, LENGTH - 330);
    let y = GATE + 220;
    const kinds = ['pegs', 'ramps', 'funnel', 'pegs', 'zigzag'];
    let i = Math.floor(rand(0, kinds.length));
    while (y < FINISH - 600) {
      const kind = kinds[i++ % kinds.length];
      if (kind === 'pegs') {
        for (let row = 0; row < 5; row++) {
          const off = row % 2 ? 65 : 0;
          for (let x = LEFT + 70 + off; x < RIGHT - 40; x += 130) peg(x + rand(-12, 12), y + row * 105);
        }
        y += 620;
      } else if (kind === 'ramps') {
        seg(LEFT, y, RIGHT - 190, y + 170);
        seg(RIGHT, y + 300, LEFT + 190, y + 470);
        y += 640;
      } else if (kind === 'funnel') {
        const gap = rand(LEFT + 240, RIGHT - 240);
        seg(LEFT, y, gap - 95, y + 300);
        seg(RIGHT, y, gap + 95, y + 300);
        peg(gap, y + 420);
        y += 600;
      } else {
        for (let k = 0; k < 4; k++) {
          const left = k % 2 === 0, x = rand(LEFT + 160, RIGHT - 160);
          seg(left ? LEFT : RIGHT, y + k * 150, x, y + k * 150 + (left ? 70 : 70));
        }
        y += 680;
      }
    }
  }

  function addMarble(ev) {
    if (marbles.some(m => m.uid === ev.uid) || marbles.length >= MAX) return false;
    const r = clamp(36 - marbles.length * 0.2, 22, 36);
    marbles.push({ uid: ev.uid, name: ev.name, avatar: ev.avatar, x: rand(LEFT + 60, RIGHT - 60), y: rand(-160, 120), vx: rand(-60, 60), vy: 0, r, m: 1, angle: 0, still: 0, boost: 0, place: 0 });
    return true;
  }

  function init() {
    state = 'lobby';
    marbles = [];
    places = [];
    results = [];
    cam = 0;
    raceTime = 0;
    firstFinish = null;
    timer = LOBBY_TIME;
    buildTrack();
    for (const ev of queue || []) addMarble(ev);
    queue = [];
  }

  function hitStatic(m, s) {
    const dx = s.bx - s.ax, dy = s.by - s.ay, len2 = dx * dx + dy * dy;
    const t = len2 ? clamp(((m.x - s.ax) * dx + (m.y - s.ay) * dy) / len2, 0, 1) : 0;
    const cx = s.ax + dx * t, cy = s.ay + dy * t;
    let nx = m.x - cx, ny = m.y - cy;
    const d = Math.hypot(nx, ny), min = m.r + s.t;
    if (d >= min) return;
    if (d === 0) { nx = 0; ny = -1; } else { nx /= d; ny /= d; }
    m.x += nx * (min - d); m.y += ny * (min - d);
    const vn = m.vx * nx + m.vy * ny;
    if (vn < 0) {
      m.vx -= 1.45 * vn * nx; m.vy -= 1.45 * vn * ny;
      m.vx *= 0.995; m.vy *= 0.995;
    }
  }

  function step(h) {
    const solids = state === 'lobby' ? [...statics, { ax: LEFT, ay: GATE, bx: RIGHT, by: GATE, t: 10, top: GATE - 40, bottom: GATE + 40 }] : statics;
    for (const m of marbles) {
      m.vy += GRAVITY * h;
      const speed = Math.hypot(m.vx, m.vy);
      if (speed > 1500) { m.vx *= 1500 / speed; m.vy *= 1500 / speed; }
      m.x += m.vx * h; m.y += m.vy * h;
      m.angle += m.vx / m.r * h;
      for (const s of solids) if (m.y + m.r > s.top && m.y - m.r < s.bottom) hitStatic(m, s);
      m.x = clamp(m.x, LEFT + m.r, RIGHT - m.r);
    }
    G.collide(marbles, 0.5);
  }

  function boost(m, power) {
    m.vy += power;
    m.vx += rand(-power, power) * 0.4;
    m.boost = Math.max(m.boost, 1.2);
  }

  function finish() {
    state = 'results';
    timer = 10;
    const rest = marbles.filter(m => !m.place).sort((a, b) => b.y - a.y);
    results = [...places, ...rest];
    if (results[0]) G.toast(`🏆 ${results[0].name} venceu a corrida!`, '#fde047');
  }

  function update(dt) {
    if (state === 'lobby') {
      if (marbles.length) timer -= dt;
      if (timer <= 0) {
        if (marbles.length >= 2) { state = 'race'; G.toast('🚦 Valendo!', '#4ade80'); }
        else timer = 10;
      }
    } else if (state === 'race') {
      raceTime += dt;
      for (const m of marbles) {
        const moving = Math.hypot(m.vx, m.vy) > 30;
        m.still = moving || m.place ? 0 : m.still + dt;
        if (m.still > 1.4) { m.vx = rand(-420, 420); m.vy = -260; m.still = 0; }
        if (!m.place && m.y > FINISH) {
          places.push(m);
          m.place = places.length;
          if (m.place === 1) { firstFinish = raceTime; G.burst(m.x, m.y, '#fde047', 40); }
          if (m.place <= 3) G.toast(`${['🥇', '🥈', '🥉'][m.place - 1]} ${m.name}`, '#fde047');
        }
      }
      if (places.length === marbles.length || (firstFinish !== null && raceTime - firstFinish > 25) || raceTime > 160) finish();
    } else if (state === 'results') {
      timer -= dt;
      if (timer <= 0) init();
    }
    const steps = 4;
    for (let i = 0; i < steps; i++) step(dt / steps);
    for (const m of marbles) {
      m.boost = Math.max(0, m.boost - dt);
      if (m.boost > 0 && Math.random() < 0.6) G.burst(m.x, m.y - m.r, '#fb923c', 1, 160);
    }
    let target = 0;
    if (state !== 'lobby') {
      const lead = marbles.filter(m => !m.place).sort((a, b) => b.y - a.y)[0] || [...marbles].sort((a, b) => b.y - a.y)[0];
      if (lead) target = lead.y - H * 0.45;
    }
    cam += (clamp(target, 0, LENGTH - H) - cam) * Math.min(1, dt * 3);
  }

  function ranking() {
    return [...marbles].sort((a, b) => (a.place || 1e9) - (b.place || 1e9) || b.y - a.y);
  }

  function draw(ctx) {
    const depth = clamp(cam / LENGTH, 0, 1);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, `hsl(${265 - depth * 60} 60% ${16 - depth * 6}%)`);
    bg.addColorStop(1, `hsl(${220 - depth * 40} 70% 8%)`);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(0, -cam);
    // finish band
    for (let x = LEFT, k = 0; x < RIGHT; x += 40, k++) {
      ctx.fillStyle = k % 2 ? '#fff' : '#111';
      ctx.fillRect(x, FINISH, 40, 20);
      ctx.fillStyle = k % 2 ? '#111' : '#fff';
      ctx.fillRect(x, FINISH + 20, 40, 20);
    }
    ctx.lineCap = 'round';
    ctx.shadowBlur = 18;
    for (const s of statics) {
      if (s.bottom < cam - 50 || s.top > cam + H + 50) continue;
      ctx.shadowColor = '#22d3ee';
      if (s.ax === s.bx && s.ay === s.by) {
        ctx.fillStyle = '#a5f3fc';
        ctx.beginPath(); ctx.arc(s.ax, s.ay, s.t, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = s.t * 2;
        ctx.beginPath(); ctx.moveTo(s.ax, s.ay); ctx.lineTo(s.bx, s.by); ctx.stroke();
      }
    }
    if (state === 'lobby') {
      ctx.shadowColor = '#f472b6';
      ctx.strokeStyle = '#f472b6';
      ctx.lineWidth = 20;
      ctx.beginPath(); ctx.moveTo(LEFT, GATE); ctx.lineTo(RIGHT, GATE); ctx.stroke();
    }
    ctx.shadowBlur = 0;
    G.drawParticles(ctx);
    const top = new Set(ranking().slice(0, 5));
    for (const m of marbles) {
      if (m.y < cam - 100 || m.y > cam + H + 100) continue;
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(m.angle);
      G.drawAvatar(ctx, m, 0, 0, m.r);
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.beginPath(); ctx.arc(m.x - m.r * 0.35, m.y - m.r * 0.4, m.r * 0.22, 0, Math.PI * 2); ctx.fill();
      if (marbles.length <= 16 || top.has(m) || m.boost > 0) G.text(ctx, m.name, m.x, m.y - m.r - 22, { size: 26, max: 220 });
    }
    ctx.restore();

    if (state === 'lobby') {
      G.panel(ctx, 90, 700, W - 180, 300);
      G.text(ctx, 'Comente para entrar!', W / 2, 780, { size: 64, color: '#f9a8d4' });
      G.text(ctx, marbles.length ? (marbles.length < 2 && timer <= 10 ? 'Esperando mais 1 jogador…' : `Largada em ${Math.ceil(timer)}s`) : 'Aguardando jogadores', W / 2, 870, { size: 52 });
      G.text(ctx, `${marbles.length} bolinha${marbles.length === 1 ? '' : 's'} na pista`, W / 2, 945, { size: 36, color: '#cbd5e1', weight: 600 });
    } else {
      const list = ranking().slice(0, 5);
      G.panel(ctx, 30, 170, 420, 40 + list.length * 66);
      list.forEach((m, i) => {
        const y = 210 + i * 66;
        G.text(ctx, `${i + 1}º`, 70, y, { size: 34, color: i ? '#e2e8f0' : '#fde047' });
        G.drawAvatar(ctx, m, 140, y, 26);
        G.text(ctx, m.name, 180, y, { size: 32, align: 'left', max: 250 });
      });
      G.text(ctx, `${Math.round(clamp(cam / (FINISH - H * 0.55), 0, 1) * 100)}%`, W - 80, 220, { size: 40, align: 'right', color: '#a5f3fc' });
    }
    if (state === 'results') {
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillRect(0, 0, W, H);
      G.text(ctx, '🏁 Resultado', W / 2, 560, { size: 84, color: '#fde047' });
      const podium = [[0, W / 2, 820, 120], [1, W / 2 - 300, 900, 95], [2, W / 2 + 300, 960, 85]];
      for (const [rank, x, y, r] of podium) {
        const m = results[rank];
        if (!m) continue;
        G.drawAvatar(ctx, m, x, y, r, ['#fde047', '#cbd5e1', '#fb923c'][rank]);
        G.text(ctx, ['🥇', '🥈', '🥉'][rank], x, y - r - 40, { size: 64 });
        G.text(ctx, m.name, x, y + r + 46, { size: 40, max: 300 });
      }
      G.text(ctx, `Nova corrida em ${Math.ceil(timer)}s`, W / 2, 1220, { size: 44, color: '#e2e8f0' });
    }
  }

  function event(ev) {
    const m = marbles.find(x => x.uid === ev.uid);
    if (ev.type === 'chat') {
      if (state === 'lobby') { if (addMarble(ev)) G.toast(`➕ ${ev.name} entrou`, '#a5f3fc'); }
      else if (m) { if (state === 'race') boost(m, 140); }
      else if (!queue.some(q => q.uid === ev.uid) && queue.length < MAX) queue.push(ev);
    } else if (ev.type === 'gift') {
      if (!m && state === 'lobby') addMarble(ev);
      const target = marbles.find(x => x.uid === ev.uid);
      if (target) {
        if (state === 'race') boost(target, 380 + Math.min(1300, 160 * Math.log2(ev.coins + 1)));
        else target.boost = 3;
        G.toast(`🚀 Turbo de ${ev.name}! (${ev.giftName})`, '#fb923c');
      } else if (!queue.some(q => q.uid === ev.uid)) queue.push(ev);
    } else if (ev.type === 'like' && m && state === 'race') {
      m.vx += rand(-90, 90);
      m.vy += Math.min(200, 25 * ev.count);
    }
  }

  G.register({
    id: 'corrida', title: 'Corrida de Bolinhas', emoji: '🔮',
    blurb: 'Cada espectador vira uma bolinha com o próprio avatar e desce uma pista cheia de obstáculos.',
    help: ['💬 Comente para entrar na corrida', '🎁 Presente = turbo  ·  ❤️ Curtidas = empurrão'],
    simChat: () => G.pick(['eu!', 'bora correr', 'vai!!', 'kkk', 'entrei']),
    init, update, draw, event
  });
})();
