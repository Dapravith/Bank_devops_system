import { NextFunction, Request, Response } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { env } from '../config/env';

declare module 'express-serve-static-core' {
  interface Request {
    partner?: { sub: string; iss: string; aud: string };
  }
}

/**
 * Verifies a partner-issued HS256 JWT in the Authorization header.
 * Disabled when JWT_AUTH_ENABLED=false to keep the curl examples and
 * docker-compose flow zero-config.
 */
export function requireJwt() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!env.JWT_AUTH_ENABLED) {
      return next();
    }

    const header = req.header('authorization');
    if (!header || !header.toLowerCase().startsWith('bearer ')) {
      res.status(401).json({ status: 0, message: 'Missing bearer token' });
      return;
    }

    const token = header.slice(7).trim();
    try {
      const decoded = jwt.verify(token, env.PARTNER_JWT_SECRET, {
        algorithms: ['HS256'],
        issuer: env.PARTNER_JWT_ISSUER,
        audience: env.PARTNER_JWT_AUDIENCE,
      }) as JwtPayload;

      req.partner = {
        sub: String(decoded.sub ?? 'unknown'),
        iss: String(decoded.iss ?? ''),
        aud: String(decoded.aud ?? ''),
      };
      next();
    } catch {
      res.status(401).json({ status: 0, message: 'Invalid or expired token' });
    }
  };
}

/**
 * Admin endpoints (DLQ list / requeue) are protected by a static API key
 * via `x-admin-api-key`. Suitable for portfolio scope; in production this
 * would be RBAC behind an internal IdP.
 */
export function requireAdminKey() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const provided = req.header('x-admin-api-key');
    if (!provided || provided !== env.ADMIN_API_KEY) {
      res.status(401).json({ status: 0, message: 'Admin authentication required' });
      return;
    }
    next();
  };
}
