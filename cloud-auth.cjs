const parseLogin = require('express').urlencoded({ extended: false, limit: '2kb', parameterLimit: 2 });
const { createHmac, timingSafeEqual } = require('node:crypto');
const configured = process.env.RENDER_EXTERNAL_URL || process.env.READER_ORIGIN;
const origin = configured ? new URL(configured) : null;
const back4app = process.env.READER_PLATFORM === 'back4app';
const enabled = Boolean(origin || back4app);
const password = process.env.READER_PASSWORD;
if (enabled && (!password || password.length < 16)) throw new Error('READER_PASSWORD deve ter pelo menos 16 caracteres.');
const token = label => createHmac('sha256', password).update(label).digest('hex');
const panelToken = enabled ? token('tiktok-reader-panel') : '';
const overlayToken = enabled ? token('tiktok-reader-overlay') : '';
const cookieName = (back4app || origin?.protocol === 'https:') ? '__Host-reader' : 'reader';

function equal(value, expected) {
  const input = Buffer.from(typeof value === 'string' ? value : '');
  const target = Buffer.from(expected);
  return input.length === target.length && timingSafeEqual(input, target);
}
function panel(req) {
  return (req.headers.cookie || '').split(';').some(part => equal(part.trim(), cookieName + '=' + panelToken));
}
function overlay(key) { return equal(key, overlayToken); }
function requestOriginFor(req) {
  if (origin) return origin.origin;
  const host = req.headers.host || '';
  return back4app && /^[a-z0-9-]+\.(?:b4a\.run|back4\.app)$/i.test(host) ? 'https://' + host.toLowerCase() : null;
}
function validRequest(req) {
  const host = req.headers.host || '';
  const requestOrigin = req.headers.origin;
  if (enabled) {
    const expected = requestOriginFor(req);
    return Boolean(expected && host.toLowerCase() === new URL(expected).host && (!requestOrigin || requestOrigin === expected));
  }
  return /^(127\.0\.0\.1|localhost):8765$/.test(host) &&
    (!requestOrigin || /^http:\/\/(127\.0\.0\.1|localhost):8765$/.test(requestOrigin));
}
function loginPage(res, invalid = false) {
  // Preserve the same-origin header on form submissions in mobile browsers.
  res.set('Referrer-Policy', 'same-origin');
  return res.status(invalid ? 401 : 200).type('html').send(`<!doctype html>
<html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Entrar · TikTok Live Reader</title>
<style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#0f172a;color:#f8fafc;font:16px system-ui}main{box-sizing:border-box;width:min(92%,400px);padding:24px;background:#1e293b;border:1px solid #475569;border-radius:14px}h1{margin-top:0;font-size:1.5rem}form{display:grid;gap:12px}input,button{box-sizing:border-box;width:100%;font:inherit;padding:12px;border-radius:8px}input{background:#0f172a;color:white;border:1px solid #64748b}button{background:#0369a1;color:white;border:0;font-weight:700}p{line-height:1.5}</style>
<main><h1>TikTok Live Reader</h1><p>Use a senha do painel configurada no Back4app.</p>
${invalid ? '<p role="alert">Senha incorreta. Confira o valor de READER_PASSWORD.</p>' : ''}
<form action="/login" method="post"><label for="password">Senha do painel</label>
<input id="password" name="password" type="password" autocomplete="current-password" required maxlength="512">
<button type="submit">Entrar</button></form></main></html>`);
}
function setSession(req, res) {
  res.cookie(cookieName, panelToken, { httpOnly: true, sameSite: 'strict', secure: requestOriginFor(req).startsWith('https:'), path: '/' });
}
function middleware(req, res, next) {
  if (!validRequest(req)) return res.sendStatus(403);
  if (!enabled) return next();
  res.set({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' });
  if (req.path === '/login' && req.method === 'POST') {
    return parseLogin(req, res, err => {
      if (err) return res.sendStatus(err.status || 400);
      if (!equal(req.body?.password, password)) return loginPage(res, true);
      setSession(req, res);
      return res.redirect(303, '/');
    });
  }
  if (req.path === '/' && req.query.overlay === '1') return overlay(req.query.key) ? next() : res.sendStatus(403);
  if (req.path === '/app.js' || req.path === '/transport.js') return next();
  if (panel(req)) return next();
  const basic = 'Basic ' + Buffer.from('reader:' + password).toString('base64');
  if (equal(req.headers.authorization, basic)) {
    setSession(req, res);
    return next();
  }
  if (req.path === '/' && req.method === 'GET') return loginPage(res);
  return res.sendStatus(401);
}
module.exports = { origin, enabled, requestOriginFor, validRequest, middleware, panel, overlay, overlayToken };

