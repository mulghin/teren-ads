import { Request, Response, NextFunction } from 'express';

// Belt-and-braces CSRF defense on top of SameSite=strict session cookies.
// For any state-changing request we require the Origin header to match one
// of the allow-listed origins, or (fallback) a Referer header that does.
// A bookmark/link navigation that happens to carry the session cookie can
// never POST without an Origin from our own pages.
export function makeSameOrigin(allowedOrigins: string[]) {
  return function requireSameOrigin(req: Request, res: Response, next: NextFunction) {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();

    // Whitelist login endpoint — it has to work pre-session. Rate limit +
    // sameSite-strict cookie + origin check in the login handler itself
    // (if desired) cover it.
    if (req.path === '/login' || req.path === '/api/login') {
      // Still demand Origin/Referer for login POST; a crafted form from
      // another origin shouldn't trigger IP-ban counters against an
      // unsuspecting user.
      return checkOrigin(req, res, next, allowedOrigins);
    }

    return checkOrigin(req, res, next, allowedOrigins);
  };
}

function checkOrigin(req: Request, res: Response, next: NextFunction, allowed: string[]) {
  const origin = req.get('origin');
  if (origin) {
    if (!allowed.includes(origin)) {
      return res.status(403).json({ error: 'origin not allowed' });
    }
    return next();
  }
  const ref = req.get('referer');
  if (ref && allowed.some(a => ref === a || ref.startsWith(a + '/'))) return next();
  return res.status(403).json({ error: 'missing origin/referer' });
}
