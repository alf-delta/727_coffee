import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const HOST = '127.0.0.1';
const PORT = 4173;
const BASE_URL = `http://${HOST}:${PORT}`;
const preview = spawn(
  'npm',
  ['run', 'preview', '--', '--host', HOST, '--port', String(PORT)],
  { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] },
);

let previewOutput = '';
preview.stdout.on('data', (chunk) => { previewOutput += chunk; });
preview.stderr.on('data', (chunk) => { previewOutput += chunk; });

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForPreview() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(BASE_URL);
      if (response.ok) return;
    } catch {
      // Preview is still starting.
    }
    await delay(150);
  }
  throw new Error(`Preview did not start in time.\n${previewOutput}`);
}

try {
  await waitForPreview();

  const homeResponse = await fetch(BASE_URL);
  const home = await homeResponse.text();
  assert.equal(homeResponse.status, 200);
  assert.match(home, /THIS IS MONOBLEND/);
  assert.match(home, /reel-01-mobile\.mp4/);

  const checkerResponse = await fetch(`${BASE_URL}/checker/`);
  assert.equal(checkerResponse.status, 200);
  assert.match(await checkerResponse.text(), /Coupon Checker · Monoblend Coffee/);

  const freshnessResponse = await fetch(`${BASE_URL}/freshness/`);
  const freshness = await freshnessResponse.text();
  assert.equal(freshnessResponse.status, 200);
  assert.match(freshness, /Your coffee had a[\s\S]*very short commute/);
  assert.match(freshness, /noindex, nofollow, noarchive/);

  const videoResponse = await fetch(`${BASE_URL}/social/reel-01-mobile.mp4`, { method: 'HEAD' });
  assert.equal(videoResponse.status, 200);
  assert.equal(videoResponse.headers.get('content-type'), 'video/mp4');
  assert.ok(Number(videoResponse.headers.get('content-length')) > 0);

  console.log('✓ production preview smoke test passed');
} finally {
  preview.kill('SIGTERM');
}
