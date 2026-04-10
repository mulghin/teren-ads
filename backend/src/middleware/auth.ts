import { Request, Response, NextFunction } from 'express';

/**
 * API key authentication middleware.
 * Set API_KEY environment variable to enable auth.
 * If API_KEY is not set, auth is skipped (development mode).
 */
export function apiAuth(req: Request, res: Response, next: NextFunction) {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return next(); // Dev mode: no auth required

  const header = req.headers.authorization;
  const provided = header?.startsWith('Bearer ') ? header.slice(7) : req.headers['x-api-key'] as string;

  if (!provided || provided !== apiKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}
