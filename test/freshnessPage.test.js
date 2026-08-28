import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const freshnessMarkup = await readFile(path.join(projectRoot, 'freshness/index.html'), 'utf8');
const freshnessScript = await readFile(path.join(projectRoot, 'src/scripts/freshness.js'), 'utf8');
const freshnessCss = await readFile(path.join(projectRoot, 'src/styles/freshness.css'), 'utf8');
const homeMarkup = await readFile(path.join(projectRoot, 'index.html'), 'utf8');
const robots = await readFile(path.join(projectRoot, 'public/robots.txt'), 'utf8');
const viteConfig = await readFile(path.join(projectRoot, 'vite.config.js'), 'utf8');

test('freshness mini-landing is built but not discoverable from the public site', () => {
  assert.match(viteConfig, /freshness:\s*resolve\(import\.meta\.dirname, 'freshness\/index\.html'\)/);
  assert.match(freshnessMarkup, /name="robots" content="noindex, nofollow, noarchive"/);
  assert.match(robots, /Disallow: \/freshness\//);
  assert.doesNotMatch(homeMarkup, /href="\/freshness\/?"/);
});

test('freshness page uses real Monoblend roasting assets and explains Bellwether accurately', () => {
  assert.match(freshnessMarkup, /\/thread\/IMG_0507\.webp/);
  assert.match(freshnessMarkup, /\/thread\/IMG_0685\.webp/);
  assert.match(freshnessMarkup, /all-electric, ventless, automatic commercial roaster/i);
  assert.match(freshnessMarkup, /green coffee/i);
  assert.match(freshnessMarkup, /Roasting starts/);
});

test('freshness benefit points form a four-card visual grid with a result card', () => {
  assert.equal((freshnessMarkup.match(/<article(?: class="fresh-notes__result")? data-fresh-reveal>/g) || []).length, 4);
  assert.match(freshnessMarkup, /class="fresh-notes__result"/);
  assert.match(freshnessMarkup, /Alive<br \/><em>in the cup\.<\/em>/);
  assert.match(freshnessCss, /@media \(max-width: 880px\)[\s\S]*?\.fresh-notes\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(freshnessCss, /\.fresh-notes \.fresh-notes__result\s*\{[\s\S]*?border:\s*0[\s\S]*?background:\s*transparent[\s\S]*?box-shadow:\s*none/);
});

test('freshness story repeatedly gives visitors a route to the cafe', () => {
  assert.match(freshnessMarkup, /class="fresh-curtain"/);
  assert.equal((freshnessMarkup.match(/class="visit-cta(?: |")/g) || []).length, 4);
  assert.ok((freshnessMarkup.match(/google\.com\/maps\/dir/g) || []).length >= 5);
  assert.match(freshnessMarkup, /GET DIRECTIONS/);
  assert.match(freshnessMarkup, /VISIT MONOBLEND/);
  assert.match(freshnessMarkup, /href="\/\?game=arcade"/);
  assert.match(freshnessMarkup, /UP TO 25% OFF/);
  assert.match(freshnessMarkup, /PLAY FOR A DISCOUNT/);
  assert.doesNotMatch(freshnessMarkup, /[←→↑↓↗↘↖↙]/);
  assert.match(freshnessMarkup, /OPEN IN GOOGLE MAPS/);
  assert.match(freshnessMarkup, /OPENS THE ARCADE/);
});

test('hero stays focused on the visit instead of showing a roast-date widget', () => {
  assert.doesNotMatch(freshnessMarkup, /roast-stamp|data-roast-date|ROAST DATE/);
  assert.doesNotMatch(freshnessScript, /URLSearchParams|roastDate/);
  assert.match(freshnessMarkup, /class="fresh-hero__actions"/);
  assert.match(freshnessCss, /\.fresh-hero__media\s*\{[\s\S]*?width:\s*clamp\(320px, 34vw, 400px\)[\s\S]*?height:\s*min\(68svh, 600px\)/);
  assert.match(freshnessCss, /@media \(max-width: 880px\)[\s\S]*?\.fresh-hero__media\s*\{[\s\S]*?position:\s*relative[\s\S]*?width:\s*min\(100%, 560px\)/);
});
