import {
  checkerCookie,
  destroyCheckerSession,
} from '../../src/server/checkerAuth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  await destroyCheckerSession(req);
  res.setHeader('Set-Cookie', checkerCookie('', { clear: true }));
  return res.status(200).json({ authenticated: false });
}
