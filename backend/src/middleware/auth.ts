import { Request, Response, NextFunction } from 'express';
import { findUser, Role, ROLES } from '../auth/users';

// Session-based auth. The login route sets req.session.user = username;
// this middleware gates every protected /api route by checking it, plus an
// active-user lookup so a disabled account can't keep using a stale cookie.
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const username = (req.session as any)?.user as string | undefined;
  if (!username) {
    return res.status(401).json({ error: 'auth required' });
  }
  const u = findUser(username);
  if (!u || u.active === false) {
    // Clear the now-invalid session so the SPA redirects cleanly to /login.
    req.session.destroy(() => {});
    return res.status(401).json({ error: 'session invalid' });
  }
  (req as any).user = u;
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const u = (req as any).user;
    if (!u) return res.status(401).json({ error: 'auth required' });
    if (!ROLES.includes(u.role) || !roles.includes(u.role)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    next();
  };
}

// Low hop count — we run behind vite dev proxy (same-origin) in dev and
// optionally behind nginx in prod. Trust only 1 hop of X-Forwarded-For so
// a client can't spoof X-Forwarded-For to bypass IP bans.
export function clientIp(req: Request): string {
  return (req.ip || req.socket?.remoteAddress || 'unknown').toString();
}
