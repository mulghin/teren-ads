import { Router } from 'express';
import bcrypt from 'bcrypt';
import {
  loadUsers, saveUsers, sanitize, ROLES, Role,
} from '../auth/users';
import { listIpBans, unbanIp } from '../auth/ipbans';
import { requireRole } from '../middleware/auth';

const router = Router();

// All endpoints here require the caller to be an active admin.
router.use(requireRole('admin'));

router.get('/', (_req, res) => {
  res.json(loadUsers().map(sanitize));
});

router.post('/', async (req, res) => {
  const { username, password, name, role } = req.body || {};
  if (typeof username !== 'string' || !/^[a-zA-Z0-9._-]{2,32}$/.test(username)) {
    return res.status(400).json({ error: 'invalid username (2-32 chars, a-z 0-9 . _ -)' });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'password must be at least 8 chars' });
  }
  if (!ROLES.includes(role)) {
    return res.status(400).json({ error: 'invalid role' });
  }
  const users = loadUsers();
  if (users.some(u => u.username === username)) {
    return res.status(409).json({ error: 'username already exists' });
  }
  const hash = await bcrypt.hash(password, 10);
  users.push({
    username,
    password: hash,
    name: typeof name === 'string' ? name : '',
    role: role as Role,
    active: true,
    created_at: new Date().toISOString(),
  });
  saveUsers(users);
  res.json({ ok: true });
});

router.put('/:username', async (req, res) => {
  const { username } = req.params;
  const { name, role, active, password } = req.body || {};
  const users = loadUsers();
  const u = users.find(x => x.username === username);
  if (!u) return res.status(404).json({ error: 'not found' });

  if (role !== undefined && !ROLES.includes(role)) {
    return res.status(400).json({ error: 'invalid role' });
  }

  // Protect the last live admin from demotion / deactivation so no one
  // accidentally locks themselves out of the panel.
  const demoting  = role   && role !== 'admin'  && u.role === 'admin';
  const disabling = active === false           && u.role === 'admin';
  if (demoting || disabling) {
    const otherLive = users.filter(x =>
      x.username !== username && x.role === 'admin' && x.active !== false);
    if (otherLive.length === 0) {
      return res.status(400).json({ error: 'cannot remove the last active admin' });
    }
  }

  if (name !== undefined && typeof name === 'string') u.name = name;
  if (role !== undefined)                              u.role = role as Role;
  if (active !== undefined)                            u.active = !!active;
  if (password !== undefined && password !== '') {
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'password must be at least 8 chars' });
    }
    u.password     = await bcrypt.hash(password, 10);
    u.login_fails  = 0;
    u.locked_until = null;
  }

  saveUsers(users);
  res.json({ ok: true });
});

router.delete('/:username', (req, res) => {
  const { username } = req.params;
  const sessionUser = (req.session as any)?.user;
  if (username === sessionUser) {
    return res.status(400).json({ error: 'cannot delete your own account' });
  }
  const users = loadUsers();
  const u = users.find(x => x.username === username);
  if (!u) return res.status(404).json({ error: 'not found' });
  if (u.role === 'admin') {
    const otherLive = users.filter(x =>
      x.username !== username && x.role === 'admin' && x.active !== false);
    if (otherLive.length === 0) {
      return res.status(400).json({ error: 'cannot delete the last active admin' });
    }
  }
  const idx = users.indexOf(u);
  users.splice(idx, 1);
  saveUsers(users);
  res.json({ ok: true });
});

router.post('/:username/unlock', (req, res) => {
  const users = loadUsers();
  const u = users.find(x => x.username === req.params.username);
  if (!u) return res.status(404).json({ error: 'not found' });
  u.login_fails  = 0;
  u.locked_until = null;
  saveUsers(users);
  res.json({ ok: true });
});

router.get('/:username/history', (req, res) => {
  const u = loadUsers().find(x => x.username === req.params.username);
  if (!u) return res.status(404).json({ error: 'not found' });
  res.json(u.login_history || []);
});

// IP bans — shares the admin gate
router.get('/-/ip-bans', (_req, res) => {
  res.json(listIpBans());
});

router.post('/-/ip-bans/:ip/unban', (req, res) => {
  unbanIp(req.params.ip);
  res.json({ ok: true });
});

export default router;
