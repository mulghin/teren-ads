import { Request, Response, NextFunction } from 'express';

const API_KEY = process.env.API_KEY;
const INSECURE_NO_AUTH = process.env.INSECURE_NO_AUTH === '1';

if (!API_KEY && !INSECURE_NO_AUTH) {
  console.error(
    '[auth] FATAL: API_KEY env var is required. ' +
    'Set API_KEY=<secret> or, for local dev only, INSECURE_NO_AUTH=1.'
  );
  process.exit(1);
}

if (!API_KEY && INSECURE_NO_AUTH) {
  console.warn('[auth] WARNING: INSECURE_NO_AUTH=1 — API is unauthenticated.');
}

export function apiAuth(req: Request, res: Response, next: NextFunction) {
  if (!API_KEY) return next();

  const header = req.headers.authorization;
  const provided = header?.startsWith('Bearer ')
    ? header.slice(7)
    : (req.headers['x-api-key'] as string | undefined);

  if (!provided || provided !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}
