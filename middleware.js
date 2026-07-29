import { next } from '@vercel/edge';

/**
 * Runs on every page navigation (not on /api/* or static assets). Assigns a
 * long-lived anonymous uid + a sticky 50/50 game variant on first visit —
 * done at the edge, before any HTML is sent, so there's no client-side
 * "flash of the wrong game" on mobile. Both cookies persist for a year so
 * the A/B split and daily reward limits stay consistent across visits.
 */
export const config = {
  matcher: ['/((?!api/|assets/|.*\\.[\\w]+$).*)'],
};

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function readCookie(cookieHeader, name) {
  const match = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(cookieHeader || '');
  return match ? decodeURIComponent(match[1]) : null;
}

async function assignVariant(uid) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(uid));
  return new Uint8Array(digest)[0] % 2 === 0 ? 'flappy' : 'tap';
}

export default async function middleware(request) {
  const cookieHeader = request.headers.get('cookie');
  const existingUid = readCookie(cookieHeader, 'mb_uid');
  const existingVariant = readCookie(cookieHeader, 'mb_variant');

  if (existingUid && existingVariant) return next();

  const uid = existingUid || crypto.randomUUID();
  const variant = existingVariant || (await assignVariant(uid));
  const isHttps = new URL(request.url).protocol === 'https:';
  const secure = isHttps ? '; Secure' : '';

  const response = next();
  response.headers.append('Set-Cookie', `mb_uid=${uid}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax${secure}`);
  response.headers.append('Set-Cookie', `mb_variant=${variant}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax${secure}`);
  return response;
}
