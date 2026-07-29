import { randomUUID, createHash } from 'node:crypto';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function readCookie(header, name) {
  const match = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(header || '');
  return match ? match[1] : null;
}

function assignVariant(uid) {
  const digest = createHash('sha256').update(uid).digest();
  return digest[0] % 2 === 0 ? 'flappy' : 'tap';
}

/**
 * Dev-only Vite plugin standing in for two things Vercel provides in
 * production and that plain `vite dev` does not: Edge Middleware (uid/variant
 * cookie assignment, mirrors middleware.js) and the /api/* serverless
 * functions. It mounts the REAL handler files from /api, so gameplay,
 * scoring, and reward issuance behave identically to production — the only
 * thing simulated is the request plumbing (cookies, Set-Cookie, req.query),
 * which Vercel's runtime normally provides for free.
 */
export function devApiPlugin() {
  return {
    name: 'monoblend-dev-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url.startsWith('/api/') || req.url.startsWith('/@') || req.url.includes('.')) return next();

        const cookieHeader = req.headers.cookie || '';
        const hasUid = readCookie(cookieHeader, 'mb_uid');
        const hasVariant = readCookie(cookieHeader, 'mb_variant');
        if (hasUid && hasVariant) return next();

        const uid = hasUid || randomUUID();
        const variant = hasVariant || assignVariant(uid);
        res.setHeader('Set-Cookie', [
          `mb_uid=${uid}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`,
          `mb_variant=${variant}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`,
        ]);
        req.headers.cookie = `${cookieHeader}; mb_uid=${uid}; mb_variant=${variant}`;
        next();
      });

      server.middlewares.use('/api', async (req, res, next) => {
        const routes = {
          '/game/start': '/api/game/start.js',
          '/game/finish': '/api/game/finish.js',
          '/game/claim': '/api/game/claim.js',
          '/coupon/redeem': '/api/coupon/redeem.js',
          '/coupon/status': '/api/coupon/status.js',
          '/stats': '/api/stats.js',
        };
        const pathname = req.url.split('?')[0];
        const modulePath = routes[pathname];
        if (!modulePath) return next();

        try {
          const url = new URL(req.url, 'http://localhost');
          req.query = Object.fromEntries(url.searchParams);
          res.status = (code) => {
            res.statusCode = code;
            return res;
          };
          res.json = (payload) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(payload));
          };

          const mod = await server.ssrLoadModule(modulePath);
          await mod.default(req, res);
        } catch (err) {
          console.error('[dev-api]', err);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'internal_error' }));
        }
      });
    },
  };
}
