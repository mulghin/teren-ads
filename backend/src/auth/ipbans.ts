import fs from 'fs';
import { IPS_FILE, writeJsonAtomic } from './users';

// Sliding 1h window per IP. Separate counters + thresholds for
// unknown-username vs wrong-password fails. Persisted so a ban survives
// process restart. Window resets if the last fail is over IP_WINDOW_MS ago.
const IP_WINDOW_MS        = 60 * 60 * 1000;
const IP_BAN_UNKNOWN_MAX  = 10;
const IP_BAN_UNKNOWN_MS   = 24 * 60 * 60 * 1000;
const IP_BAN_WRONG_PW_MAX = 15;
const IP_BAN_WRONG_PW_MS  =  6 * 60 * 60 * 1000;

export interface IpRecord {
  fails_unknown: number;
  fails_wrong_pw: number;
  first_fail_at: string | null;
  last_fail_at: string | null;
  banned_until: string | null;
}

export type IpFailKind = 'unknown' | 'wrong_pw';
export type BanReason = 'username_enum' | 'brute_force';

export function loadIps(): Record<string, IpRecord> {
  try {
    if (!fs.existsSync(IPS_FILE)) return {};
    return JSON.parse(fs.readFileSync(IPS_FILE, 'utf8'));
  } catch (e) {
    console.error('[ipbans] ips.json read error:', e);
    return {};
  }
}

export function saveIps(ips: Record<string, IpRecord>) {
  writeJsonAtomic(IPS_FILE, ips);
}

export function isIpBanned(ip: string): boolean {
  const r = loadIps()[ip];
  return !!(r && r.banned_until && new Date(r.banned_until).getTime() > Date.now());
}

// Edge-triggered: newBanReason is set only on the not-banned → banned
// transition so callers fire one Telegram alert per burst.
export function recordIpFail(
  ip: string,
  kind: IpFailKind
): { newBanReason: BanReason | null; bannedUntil: string | null } {
  const ips = loadIps();
  const now = Date.now();
  const r: IpRecord = ips[ip] || {
    fails_unknown: 0, fails_wrong_pw: 0,
    first_fail_at: null, last_fail_at: null, banned_until: null,
  };
  const wasBanned = !!(r.banned_until && new Date(r.banned_until).getTime() > now);

  if (r.last_fail_at && now - new Date(r.last_fail_at).getTime() > IP_WINDOW_MS) {
    r.fails_unknown = 0;
    r.fails_wrong_pw = 0;
    r.first_fail_at = null;
  }
  if (!r.first_fail_at) r.first_fail_at = new Date(now).toISOString();
  r.last_fail_at = new Date(now).toISOString();

  if (kind === 'unknown')  r.fails_unknown  = (r.fails_unknown  || 0) + 1;
  if (kind === 'wrong_pw') r.fails_wrong_pw = (r.fails_wrong_pw || 0) + 1;

  let newBanReason: BanReason | null = null;
  if (r.fails_unknown >= IP_BAN_UNKNOWN_MAX) {
    r.banned_until = new Date(now + IP_BAN_UNKNOWN_MS).toISOString();
    if (!wasBanned) newBanReason = 'username_enum';
    console.warn(`[auth] ip banned 24h (username enum): ${ip}`);
  } else if (r.fails_wrong_pw >= IP_BAN_WRONG_PW_MAX) {
    r.banned_until = new Date(now + IP_BAN_WRONG_PW_MS).toISOString();
    if (!wasBanned) newBanReason = 'brute_force';
    console.warn(`[auth] ip banned 6h (brute force): ${ip}`);
  }

  ips[ip] = r;
  saveIps(ips);
  return { newBanReason, bannedUntil: r.banned_until };
}

export function unbanIp(ip: string) {
  const ips = loadIps();
  if (ips[ip]) {
    delete ips[ip];
    saveIps(ips);
  }
}

export function listIpBans() {
  const ips = loadIps();
  const now = Date.now();
  return Object.entries(ips).map(([ip, r]) => ({
    ip,
    fails_unknown:  r.fails_unknown  || 0,
    fails_wrong_pw: r.fails_wrong_pw || 0,
    first_fail_at:  r.first_fail_at,
    last_fail_at:   r.last_fail_at,
    banned_until:   r.banned_until,
    is_banned:      !!(r.banned_until && new Date(r.banned_until).getTime() > now),
  }));
}
