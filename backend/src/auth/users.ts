import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';

export const ROLES = ['admin', 'operator', 'viewer'] as const;
export type Role = typeof ROLES[number];

export interface LoginHistoryEntry {
  at: string;
  ip: string;
  ua: string;
  device: string;
  ok: boolean;
  reason?: 'wrong_pw' | 'locked' | 'disabled';
}

export interface User {
  username: string;
  password: string;
  name: string;
  role: Role;
  active: boolean;
  created_at: string;
  last_login?: string | null;
  login_fails?: number;
  locked_until?: string | null;
  login_history?: LoginHistoryEntry[];
}

const DATA_DIR = process.env.AUTH_DATA_DIR || path.join(process.cwd(), 'data');
export const USERS_FILE = path.join(DATA_DIR, 'users.json');
export const IPS_FILE = path.join(DATA_DIR, 'ips.json');

const LOGIN_HISTORY_MAX = 30;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
}

// Atomic JSON write: tmp file + rename, survives SIGTERM mid-save.
export function writeJsonAtomic(filePath: string, obj: unknown) {
  ensureDir();
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, '.' + path.basename(filePath) + '.' + process.pid + '.' + Date.now() + '.tmp');
  const data = JSON.stringify(obj, null, 2);
  const fd = fs.openSync(tmp, 'w', 0o600);
  try {
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, filePath);
}

export function loadUsers(): User[] {
  try {
    if (!fs.existsSync(USERS_FILE)) return [];
    const raw = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    console.error('[users] users.json read error:', e);
    return [];
  }
}

export function saveUsers(users: User[]) {
  writeJsonAtomic(USERS_FILE, users);
}

export function findUser(username: string): User | undefined {
  return loadUsers().find(u => u.username === username);
}

export function sanitize(u: User) {
  return {
    username: u.username,
    name: u.name || '',
    role: u.role,
    active: u.active !== false,
    created_at: u.created_at || null,
    last_login: u.last_login || null,
    login_fails: u.login_fails || 0,
    locked_until: u.locked_until || null,
  };
}

export function pushLoginHistory(user: User, entry: LoginHistoryEntry) {
  user.login_history = user.login_history || [];
  user.login_history.unshift(entry);
  if (user.login_history.length > LOGIN_HISTORY_MAX) {
    user.login_history.length = LOGIN_HISTORY_MAX;
  }
}

export function isLocked(u: User): boolean {
  return !!(u.locked_until && new Date(u.locked_until).getTime() > Date.now());
}

// Back-fill role/active/created_at for any pre-existing entries. No-op on empty.
export function migrateUsers() {
  const users = loadUsers();
  if (users.length === 0) return;
  let changed = false;
  users.forEach((u, i) => {
    if (!u.role)                { u.role = i === 0 ? 'admin' : 'operator'; changed = true; }
    if (u.active === undefined) { u.active = true; changed = true; }
    if (!u.created_at)          { u.created_at = new Date().toISOString(); changed = true; }
    if (u.name === undefined)   { u.name = ''; changed = true; }
  });
  if (changed) {
    saveUsers(users);
    console.log('[users] migrated legacy entries to new schema');
  }
}

// Precomputed dummy hash used when no real user matches — keeps bcrypt timing
// constant across user-exists / disabled / locked / wrong-password / correct
// paths. Prevents user enumeration via response-time analysis.
export const DUMMY_PW_HASH = bcrypt.hashSync(require('crypto').randomBytes(32).toString('hex'), 10);
