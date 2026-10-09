import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFile(path.join(projectRoot, file), 'utf8');
const officeMarkup = await read('office/index.html');
const officeScript = await read('src/scripts/office.js');
const mainScript = await read('src/scripts/main.js');
const homeMarkup = await read('index.html');
const robots = await read('public/robots.txt');
const viteConfig = await read('vite.config.js');

test('office landing is built but not discoverable from the public site', () => {
  assert.match(viteConfig, /office:\s*resolve\(import\.meta\.dirname, 'office\/index\.html'\)/);
  assert.match(officeMarkup, /name="robots" content="noindex, nofollow, noarchive"/);
  assert.match(robots, /Disallow: \/office\//);
  assert.doesNotMatch(homeMarkup, /href="\/office\/?"/);
});

test('office page shows breakfast, lunch and the 3+ people offer as deep-linkable cards', () => {
  const cards = [...officeMarkup.matchAll(/<article class="offer(?: offer--team)?" id="([a-z]+)">([\s\S]*?)<\/article>/g)];
  assert.deepEqual(cards.map(([, id]) => id), ['breakfast', 'lunch', 'team']);

  const [breakfast, lunch, team] = cards.map(([, , body]) => body);
  assert.match(breakfast, /SPECIAL OFFER[\s\S]*Breakfast/);
  assert.match(lunch, /SPECIAL OFFER[\s\S]*Lunch/);
  assert.match(team, /3\+ PEOPLE/);
  assert.match(team, /SINGLE CHECK/);
  assert.match(team, /10%/);
});

test('office page routes visitors to the menus and the cafe', () => {
  assert.match(officeMarkup, /href="\/\?menu=kitchen"/);
  assert.match(officeMarkup, /href="\/\?menu=drink"/);
  // The menu links only work while the home page opens the menu from ?menu=.
  assert.match(mainScript, /requestedMenuTab === 'kitchen' \|\| requestedMenuTab === 'drink'/);

  const directions = officeMarkup.match(/https:\/\/www\.google\.com\/maps\/dir\/[^"]+/g) || [];
  assert.ok(directions.length >= 2);
  directions.forEach((href) => assert.match(href, /142%20W%2023rd%20St/));
});

test('office page markup is accessible and every local asset exists', async () => {
  assert.match(officeMarkup, /<html lang="en">/);
  assert.equal((officeMarkup.match(/<h1\b/g) || []).length, 1);

  const images = officeMarkup.match(/<img\b[^>]*>/g) || [];
  assert.ok(images.length >= 3);
  for (const tag of images) {
    assert.match(tag, /\balt="[^"]+"/);
    const [, source] = tag.match(/\bsrc="(\/[^"]+)"/);
    await access(path.join(projectRoot, 'public', source));
  }

  for (const [tag] of officeMarkup.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) {
    assert.match(tag, /rel="noopener noreferrer"/);
  }
});

test('office page measures visits with the same cookieless analytics as the home page', () => {
  assert.match(officeMarkup, /<script type="module" src="\/src\/scripts\/office\.js"><\/script>/);
  assert.match(officeScript, /import \{ inject \} from '@vercel\/analytics'/);
  assert.match(officeScript, /inject\(\)/);
});
