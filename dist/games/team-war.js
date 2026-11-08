// Guerra de Times: viewers pick blue or red, comments spawn soldiers and gifts spawn champions.
(() => {
  const G = window.Games, { W, H, rand, clamp } = G;
  const TEAMS = {
    red: { name: 'Vermelho', color: '#ef4444', light: '#fca5a5', baseY: 330, dir: 1 },
    blue: { name: 'Azul', color: '#3b82f6', light: '#93c5fd', baseY: 1600, dir: -1 }
  };
  const BASE_HP = 1500, MAX_UNITS = 170, PER_USER = 3;
  let units, members, bases, score = { red: 0, blue: 0 }, state, timer, damage, likePool, shots, winnerTeam;

  function init() {
    units = []; shots = [];
    members = members || new Map();
    bases = { red: BASE_HP, blue: BASE_HP };
    damage = new Map(); likePool = new Map();
    state = 'battle'; timer = 0; winnerTeam = null;
  }

  function teamOf(ev) {
    const t = ev.text.toLowerCase();
    const wantsRed = /vermelh|\bred\b|🔴|❤️|^\s*2\s*$/.test(t), wantsBlue = /azul|\bblue\b|🔵|💙|^\s*1\s*$/.test(t);
    let team = members.get(ev.uid)?.team;
    if (wantsRed !== wantsBlue && (wantsRed || wantsBlue)) {
      const next = wantsRed ? 'red' : 'blue';
      if (team !== next) { team = next; G.toast(`${ev.name} entrou no time ${TEAMS[team].name}`, TEAMS[team].light); }
    }
    if (!team) {
      const counts = { red: 0, blue: 0 };
      for (const m of members.values()) counts[m.team]++;
      team = counts.red < counts.blue ? 'red' : counts.blue < counts.red ? 'blue' : G.pick(['red', 'blue']);
      G.toast(`${ev.name} entrou no time ${TEAMS[team].name}`, TEAMS[team].light);
    }
    members.set(ev.uid, { team, name: ev.name, avatar: ev.avatar, uid: ev.uid });
    if (members.size > 2000) members.delete(members.keys().next().value);
    return team;
  }

  function spawn(owner, team, champion = 0) {
    if (state !== 'battle') return;
    if (!champion && units.filter(u => u.uid === owner.uid && !u.champion).length >= PER_USER) return;
    if (units.length >= MAX_UNITS) {
      const idx = units.findIndex(u => !u.champion && u.team === team);
      if (idx < 0) return;
      units.splice(idx, 1);
    }
    const T = TEAMS[team];
    const power = champion ? clamp(Math.log2(champion + 1), 1, 14) : 0;
    const hp = champion ? 120 + power * 70 : 40;
    units.push({
      uid: owner.uid, name: owner.name, avatar: owner.avatar, team,
      x: rand(140, W - 140), y: T.baseY + T.dir * rand(110, 160),
      vx: 0, vy: 0, r: champion ? 34 + power * 3 : 20, m: champion ? 3 + power : 1,
      hp, max: hp, dmg: champion ? 10 + power * 3 : 6, speed: champion ? 70 : rand(85, 110),
      cool: rand(0, 0.6), champion: Boolean(champion), flash: 0
    });
  }

  function hurtBase(team, amount, by) {
    bases[team] = Math.max(0, bases[team] - amount);
    if (by) damage.set(by.uid, { name: by.name, avatar: by.avatar, team: by.team, dmg: (damage.get(by.uid)?.dmg || 0) + amount });
    if (bases[team] <= 0 && state === 'battle') {
      winnerTeam = team === 'red' ? 'blue' : 'red';
      score[winnerTeam]++;
      state = 'results'; timer = 9;
      G.toast(`🏆 Time ${TEAMS[winnerTeam].name} venceu!`, TEAMS[winnerTeam].light);
      G.burst(W / 2, TEAMS[team].baseY, TEAMS[winnerTeam].color, 70, 800);
    }
  }

  function update(dt) {
    if (state === 'results') {
      timer -= dt;
      if (timer <= 0) init();
      for (const u of units) { u.vx *= 0.9; u.vy *= 0.9; }
      return;
    }
    for (const u of units) {
      const T = TEAMS[u.team], enemyBase = u.team === 'red' ? 'blue' : 'red';
      let target = null, best = 260;
      for (const o of units) {
        if (o.team === u.team) continue;
        const d = Math.hypot(o.x - u.x, o.y - u.y);
        if (d < best) { best = d; target = o; }
      }
      u.cool -= dt; u.flash = Math.max(0, u.flash - dt);
      let mx = 0, my = T.dir;
      if (target) {
        mx = (target.x - u.x) / best; my = (target.y - u.y) / best;
        if (best < u.r + target.r + 14) {
          mx = my = 0;
          if (u.cool <= 0) {
            u.cool = 0.8;
            target.hp -= u.dmg; target.flash = 0.15;
            shots.push({ x1: u.x, y1: u.y, x2: target.x, y2: target.y, t: 0.12, c: T.light });
            damage.set(u.uid, { name: u.name, avatar: u.avatar, team: u.team, dmg: (damage.get(u.uid)?.dmg || 0) + u.dmg });
          }
        }
      } else {
        const by = TEAMS[enemyBase].baseY;
        if (Math.abs(u.y - by) < 110 + u.r) {
          mx = my = 0;
          if (u.cool <= 0) { u.cool = 0.9; hurtBase(enemyBase, u.dmg, u); G.burst(u.x, by, TEAMS[enemyBase].light, 3, 200); }
        }
      }
      u.vx += (mx * u.speed - u.vx) * Math.min(1, dt * 5);
      u.vy += (my * u.speed - u.vy) * Math.min(1, dt * 5);
      u.x = clamp(u.x + u.vx * dt, 40, W - 40);
      u.y = clamp(u.y + u.vy * dt, TEAMS.red.baseY + 40, TEAMS.blue.baseY - 40);
    }
    for (let i = units.length - 1; i >= 0; i--) if (units[i].hp <= 0) { G.burst(units[i].x, units[i].y, TEAMS[units[i].team].color, units[i].champion ? 30 : 8); units.splice(i, 1); }
    G.collide(units, 0.1);
    for (const s of shots) s.t -= dt;
    shots = shots.filter(s => s.t > 0);
  }

  function drawBase(ctx, key) {
    const T = TEAMS[key], y = T.baseY;
    ctx.fillStyle = T.color + '33';
    ctx.fillRect(0, y - 90, W, 180);
    ctx.save();
    ctx.shadowColor = T.color; ctx.shadowBlur = 30;
    ctx.fillStyle = T.color;
    ctx.beginPath(); ctx.roundRect(W / 2 - 170, y - 70, 340, 140, 26); ctx.fill();
    ctx.restore();
    G.text(ctx, `${key === 'red' ? '🔴' : '🔵'} ${T.name}`, W / 2, y - 20, { size: 46 });
    const pct = bases[key] / BASE_HP;
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(W / 2 - 150, y + 22, 300, 26);
    ctx.fillStyle = pct > 0.3 ? '#4ade80' : '#f87171'; ctx.fillRect(W / 2 - 150, y + 22, 300 * pct, 26);
    const n = [...members.values()].filter(m => m.team === key).length;
    G.text(ctx, `👥 ${n}  ·  🏆 ${score[key]}`, key === 'red' ? 170 : W - 170, y, { size: 36 });
  }

  function draw(ctx) {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#450a0a'); bg.addColorStop(0.5, '#0f172a'); bg.addColorStop(1, '#172554');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 4;
    ctx.setLineDash([30, 30]);
    ctx.beginPath(); ctx.moveTo(0, (TEAMS.red.baseY + TEAMS.blue.baseY) / 2); ctx.lineTo(W, (TEAMS.red.baseY + TEAMS.blue.baseY) / 2); ctx.stroke();
    ctx.setLineDash([]);
    drawBase(ctx, 'red'); drawBase(ctx, 'blue');
    for (const s of shots) {
      ctx.strokeStyle = s.c; ctx.lineWidth = 5; ctx.globalAlpha = s.t / 0.12;
      ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const u of units) {
      const T = TEAMS[u.team];
      if (u.champion) {
        ctx.fillStyle = T.color + '55';
        ctx.beginPath(); ctx.arc(u.x, u.y, u.r * 1.35, 0, Math.PI * 2); ctx.fill();
      }
      G.drawAvatar(ctx, u, u.x, u.y, u.r, u.flash > 0 ? '#fff' : T.color);
      if (u.champion || u.hp < u.max) {
        ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(u.x - u.r, u.y - u.r - 14, u.r * 2, 7);
        ctx.fillStyle = T.light; ctx.fillRect(u.x - u.r, u.y - u.r - 14, u.r * 2 * clamp(u.hp / u.max, 0, 1), 7);
      }
      if (u.champion) G.text(ctx, '⭐ ' + u.name, u.x, u.y - u.r - 36, { size: 26, max: 260 });
    }
    G.drawParticles(ctx);
    const top = [...damage.values()].sort((a, b) => b.dmg - a.dmg).slice(0, 3);
    if (top.length) {
      G.panel(ctx, W - 380, 1180, 350, 50 + top.length * 60);
      G.text(ctx, 'Mais dano', W - 205, 1210, { size: 30, color: '#fde047' });
      top.forEach((d, i) => {
        G.drawAvatar(ctx, d, W - 340, 1265 + i * 60, 22, TEAMS[d.team].color);
        G.text(ctx, d.name, W - 305, 1265 + i * 60, { size: 28, align: 'left', max: 200 });
      });
    }
    if (state === 'results' && winnerTeam) {
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, W, H);
      G.text(ctx, `🏆 Time ${TEAMS[winnerTeam].name} venceu!`, W / 2, 860, { size: 78, color: TEAMS[winnerTeam].light, max: W - 100 });
      G.text(ctx, `Placar  🔴 ${score.red}  x  ${score.blue} 🔵`, W / 2, 970, { size: 50 });
      G.text(ctx, `Nova batalha em ${Math.ceil(timer)}s`, W / 2, 1060, { size: 40, color: '#e2e8f0' });
    }
  }

  function event(ev) {
    if (ev.type === 'like') {
      const member = members.get(ev.uid);
      if (!member) return;
      const pool = (likePool.get(ev.uid) || 0) + ev.count;
      likePool.set(ev.uid, pool % 15);
      for (let i = 0; i < Math.min(3, Math.floor(pool / 15)); i++) spawn(member, member.team);
      return;
    }
    const team = teamOf(ev);
    const owner = members.get(ev.uid);
    if (ev.type === 'chat') spawn(owner, team);
    else if (ev.type === 'gift') {
      spawn(owner, team, ev.coins);
      if (ev.coins >= 30 && state === 'battle') {
        const enemy = team === 'red' ? 'blue' : 'red';
        hurtBase(enemy, Math.min(250, 5 * Math.log2(ev.coins + 1) * 6), owner);
        G.burst(W / 2, TEAMS[enemy].baseY, '#fde047', 40, 700);
        G.toast(`☄️ Meteoro de ${ev.name} no time ${TEAMS[enemy].name}!`, '#fde047');
      } else G.toast(`⭐ ${ev.name} invocou um campeão!`, TEAMS[team].light);
    }
  }

  G.register({
    id: 'times', title: 'Guerra de Times', emoji: '⚔️',
    blurb: 'Azul contra vermelho. Comentários viram soldados, presentes viram campeões e meteoros.',
    help: ['💬 Comente "azul" ou "vermelho" para escolher o time', '💬 Comentário = soldado  ·  ❤️ 15 curtidas = soldado', '🎁 Presente = campeão (grande = meteoro)'],
    toastY: 480,
    simChat: () => G.pick(['azul', 'vermelho', 'vai azul!', 'bora vermelho', 'ataca', '1', '2', 'kkk']),
    init, update, draw, event
  });
})();
