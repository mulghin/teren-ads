import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcrypt';
import {
  loadUsers, saveUsers, findUser,
  sanitize, pushLoginHistory, isLocked,
  DUMMY_PW_HASH, ROLES, Role,
} from '../auth/users';
import { recordIpFail, isIpBanned } from '../auth/ipbans';
import { clientIp, requireAuth } from '../middleware/auth';

const router = Router();

// Brute-force protection layers:
//   1) IP rate limit: 10 POSTs / 15 min per IP, successful ones don't count.
//   2) Per-user fail counter → 15-min lockout after 5 fails (per-user, not
//      per-IP, so a spray across many IPs still trips it).
//   3) Constant ~600ms minimum latency on /login so bcrypt timing and error-
//      branch timing can't leak "no such user" vs "wrong pw".
const LOGIN_MAX_FAILS   = 5;
const LOGIN_LOCK_MS     = 15 * 60 * 1000;
const LOGIN_MIN_LATENCY = 600;

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => clientIp(req),
  message: { error: 'Too many login attempts, try again in 15 minutes.' },
});

function uaSummary(ua: string): string {
  if (!ua) return 'unknown';
  let os = 'unknown';
  if      (/Windows/.test(ua))          os = 'Windows';
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
  else if (/Android/.test(ua))          os = 'Android';
  else if (/Mac OS X/.test(ua))         os = 'macOS';
  else if (/Linux/.test(ua))            os = 'Linux';

  let br = 'unknown';
  if      (/Edg\//.test(ua))                         br = 'Edge';
  else if (/OPR\/|Opera/.test(ua))                   br = 'Opera';
  else if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) br = 'Chrome';
  else if (/Firefox\//.test(ua))                     br = 'Firefox';
  else if (/Safari\//.test(ua))                      br = 'Safari';

  return `${os} · ${br}`;
}

function finishWithDelay(res: any, payload: any, status: number, startedAt: number) {
  const elapsed = Date.now() - startedAt;
  const wait = Math.max(0, LOGIN_MIN_LATENCY - elapsed);
  setTimeout(() => res.status(status).json(payload), wait);
}

router.post('/login', loginLimiter, async (req, res) => {
  const startedAt = Date.now();
  const ip = clientIp(req);
  const ua = req.get('user-agent') || '';
  const now = new Date().toISOString();

  if (isIpBanned(ip)) {
    return finishWithDelay(res, { error: 'ip_banned' }, 429, startedAt);
  }

  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return finishWithDelay(res, { error: 'bad_request' }, 400, startedAt);
  }

  const users = loadUsers();
  const user = users.find(u => u.username === username);

  // Always run bcrypt so timing is constant across all branches.
  const match = await bcrypt.compare(password, (user && user.password) || DUMMY_PW_HASH);

  if (!user) {
    recordIpFail(ip, 'unknown');
    return finishWithDelay(res, { error: 'invalid_credentials' }, 401, startedAt);
  }
  if (user.active === false) {
    pushLoginHistory(user, { at: now, ip, ua, device: uaSummary(ua), ok: false, reason: 'disabled' });
    saveUsers(users);
    return finishWithDelay(res, { error: 'account_disabled' }, 403, startedAt);
  }
  if (isLocked(user)) {
    pushLoginHistory(user, { at: now, ip, ua, device: uaSummary(ua), ok: false, reason: 'locked' });
    saveUsers(users);
    return finishWithDelay(res, { error: 'account_locked' }, 423, startedAt);
  }
  if (!match) {
    user.login_fails = (user.login_fails || 0) + 1;
    if (user.login_fails >= LOGIN_MAX_FAILS) {
      user.locked_until = new Date(Date.now() + LOGIN_LOCK_MS).toISOString();
      console.warn(`[auth] lockout: ${user.username} (ip=${ip})`);
    }
    pushLoginHistory(user, { at: now, ip, ua, device: uaSummary(ua), ok: false, reason: 'wrong_pw' });
    saveUsers(users);
    recordIpFail(ip, 'wrong_pw');
    return finishWithDelay(res, { error: 'invalid_credentials' }, 401, startedAt);
  }

  user.login_fails  = 0;
  user.locked_until = null;
  user.last_login   = now;
  pushLoginHistory(user, { at: now, ip, ua, device: uaSummary(ua), ok: true });
  saveUsers(users);

  (req.session as any).user = username;
  finishWithDelay(res, { ok: true, user: sanitize(user) }, 200, startedAt);
});

router.post('/logout', requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('tads.sid');
    res.json({ ok: true });
  });
});

router.get('/me', requireAuth, (req, res) => {
  const u = (req as any).user;
  if (!u) return res.status(401).json({ error: 'no user' });
  res.json(sanitize(u));
});

// Bootstrap: if users.json is empty, allow a one-time admin creation from
// any browser. Once at least one user exists, this endpoint 403s. This is
// the safe alternative to shipping default admin/admin123 creds.
router.post('/setup', async (req, res) => {
  const users = loadUsers();
  if (users.length > 0) {
    return res.status(403).json({ error: 'setup already complete' });
  }
  const { username, password, name } = req.body || {};
  if (typeof username !== 'string' || !/^[a-zA-Z0-9._-]{2,32}$/.test(username)) {
    return res.status(400).json({ error: 'invalid username (2-32 chars, a-z 0-9 . _ -)' });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'password must be at least 8 chars' });
  }
  const hash = await bcrypt.hash(password, 10);
  const now = new Date().toISOString();
  const user: any = {
    username, password: hash,
    name: typeof name === 'string' ? name : '',
    role: 'admin' as Role, active: true,
    created_at: now, last_login: now,
    login_fails: 0, locked_until: null,
  };
  saveUsers([user]);
  console.log(`[auth] initial admin created: ${username}`);
  (req.session as any).user = username;
  res.json({ ok: true, user: sanitize(user) });
});

// Public status probe — SPA uses this to decide between /login and /setup
// without needing a valid session. Only exposes "is users file empty".
router.get('/status', (_req, res) => {
  res.json({ needs_setup: loadUsers().length === 0 });
});

export default router;
