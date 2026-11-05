const { createHmac, timingSafeEqual } = require('node:crypto');
const configured = process.env.RENDER_EXTERNAL_URL || process.env.READER_ORIGIN;
const origin = configured ? new URL(configured) : null;
const password = process.env.READER_PASSWORD;
if (origin && (!password || password.length < 16)) throw new Error('READER_PASSWORD deve ter pelo menos 16 caracteres.');
const token = label => createHmac('sha256', password).update(label).digest('hex');
const panelToken = origin ? token('tiktok-reader-panel') : '';
const overlayToken = origin ? token('tiktok-reader-overlay') : '';
const cookieName = origin?.protocol === 'https:' ? '__Host-reader' : 'reader';

function equal(value, expected) {
  const input = Buffer.from(typeof value === 'string' ? value : '');
  const target = Buffer.from(expected);
  return input.length === target.length && timingSafeEqual(input, target);
}
function panel(req) {
  return (req.headers.cookie || '').split(';').some(part => equal(part.trim(), cookieName + '=' + panelToken));
}
function overlay(key) { return equal(key, overlayToken); }
function validRequest(req) {
  const host = req.headers.host || '';
  const requestOrigin = req.headers.origin;
  if (origin) return host === origin.host && (!requestOrigin || requestOrigin === origin.origin);
  return /^(127\.0\.0\.1|localhost):8765$/.test(host) &&
    (!requestOrigin || /^http:\/\/(127\.0\.0\.1|localhost):8765$/.test(requestOrigin));
}
function middleware(req, res, next) {
  if (!validRequest(req)) return res.sendStatus(403);
  if (!origin) return next();
  res.set({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' });
  if (req.path === '/' && req.query.overlay === '1') return overlay(req.query.key) ? next() : res.sendStatus(403);
  if (req.path === '/app.js' || req.path === '/transport.js') return next();
  if (panel(req)) return next();
  const basic = 'Basic ' + Buffer.from('reader:' + password).toString('base64');
  if (equal(req.headers.authorization, basic)) {
    res.cookie(cookieName, panelToken, { httpOnly: true, sameSite: 'strict', secure: origin.protocol === 'https:', path: '/' });
    return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="TikTok Live Reader"').status(401).send('Usuário: reader. Use a senha definida na hospedagem.');
}
module.exports = { origin, validRequest, middleware, panel, overlay, overlayToken };
