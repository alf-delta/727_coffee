import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST_DIR = join(process.cwd(), 'dist');
const ASSETS_DIR = join(DIST_DIR, 'assets');
const SOCIAL_DIR = join(DIST_DIR, 'social');

const budgets = {
  mainJavaScriptGzip: 25 * 1024,
  mainCssGzip: 22 * 1024,
  socialVideoFile: 6 * 1024 * 1024,
  socialVideoTotal: 15 * 1024 * 1024,
};

function assertBudget(label, actual, maximum) {
  if (actual > maximum) {
    throw new Error(`${label} exceeded: ${actual} bytes > ${maximum} bytes`);
  }
  console.log(`✓ ${label}: ${actual} / ${maximum} bytes`);
}

const assetFiles = readdirSync(ASSETS_DIR);
const mainJavaScript = assetFiles.find((file) => /^main-.*\.js$/.test(file));
const mainCss = assetFiles.find((file) => /^main-.*\.css$/.test(file));

if (!mainJavaScript || !mainCss) {
  throw new Error('Could not locate the production main JS/CSS bundles.');
}

assertBudget(
  'main JavaScript gzip',
  gzipSync(readFileSync(join(ASSETS_DIR, mainJavaScript))).byteLength,
  budgets.mainJavaScriptGzip,
);
assertBudget(
  'main CSS gzip',
  gzipSync(readFileSync(join(ASSETS_DIR, mainCss))).byteLength,
  budgets.mainCssGzip,
);

const socialVideos = readdirSync(SOCIAL_DIR).filter((file) => /-mobile\.mp4$/.test(file));
if (socialVideos.length !== 5) {
  throw new Error(`Expected five optimized social videos, found ${socialVideos.length}.`);
}

let socialVideoTotal = 0;
socialVideos.forEach((file) => {
  const size = statSync(join(SOCIAL_DIR, file)).size;
  socialVideoTotal += size;
  assertBudget(`social/${file}`, size, budgets.socialVideoFile);
});
assertBudget('social video total', socialVideoTotal, budgets.socialVideoTotal);
