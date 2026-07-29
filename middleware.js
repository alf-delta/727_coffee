import { next } from '@vercel/edge';

/**
 * Runs on every page navigation (not on /api/* or static assets). Assigns a
 * long-lived anonymous uid before the HTML is sent. The chosen game is stored
 * server-side per UTC day, so it cannot be switched by editing cookies.
 */
export const config = {
  matcher: ['/((?!api/|assets/|.*\\.[\\w]+$).*)'],
};

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function readCookie(cookieHeader, name) {
  const match = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(cookieHeader || '');
  return match ? decodeURIComponent(match[1]) : null;
}

export default async function middleware(request) {
  const cookieHeader = request.headers.get('cookie');
  const existingUid = readCookie(cookieHeader, 'mb_uid');

  if (existingUid) return next();

  const uid = existingUid || crypto.randomUUID();
  const isHttps = new URL(request.url).protocol === 'https:';
  const secure = isHttps ? '; Secure' : '';

  const response = next();
  response.headers.append('Set-Cookie', `mb_uid=${uid}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax${secure}`);
  return response;
}
