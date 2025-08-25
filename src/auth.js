// src/auth.js
import session from 'express-session';

/**
 * Session-Middleware
 * - Dev: Cookie nicht secure, SameSite=Lax
 * - Prod: secure + SameSite=Lax (anpassbar)
 */
export function sessionMiddleware(secret) {
  const isProd = process.argv.includes('--prod');
  return session({
    name: 'sid',
    secret: String(secret || 'dev-secret'),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,         // hinter HTTPS true setzen
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 Tage
    },
  });
}

/**
 * Require Role Guard
 */
export function requireRole(allowed = []) {
  return (req, res, next) => {
    const u = req.session?.user;
    if (!u) return res.status(401).json({ ok: false, error: 'unauthenticated' });
    if (!allowed.includes(u.role)) return res.status(403).json({ ok: false, error: 'forbidden' });
    next();
  };
}

/**
 * /api/me & /api/logout
 */
export function attachAuthRoutes(app) {
  app.get('/api/me', (req, res) => {
    res.json({ user: req.session?.user || null });
  });

  app.post('/api/logout', (req, res) => {
    if (!req.session) return res.json({ ok: true });
    req.session.destroy(() => res.json({ ok: true }));
  });
}
