import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { officeOffers, getOfficeOfferItems } from '../src/data/officeOffers.js';
import { kitchenMenu } from '../src/data/menu.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFile(path.join(projectRoot, file), 'utf8');
const officeMarkup = await read('office/index.html');
const officeScript = await read('src/scripts/office.js');
const overlayScript = await read('src/scripts/menuOverlay.js');
const officeCss = await read('src/styles/office.css');
const mainCss = await read('src/styles/main.css');
const homeMarkup = await read('index.html');
const robots = await read('public/robots.txt');
const viteConfig = await read('vite.config.js');

test('office landing is built but not discoverable from the public site', () => {
  assert.match(viteConfig, /office:\s*resolve\(import\.meta\.dirname, 'office\/index\.html'\)/);
  assert.match(officeMarkup, /name="robots" content="noindex, nofollow, noarchive"/);
  assert.match(robots, /Disallow: \/office\//);
  assert.doesNotMatch(homeMarkup, /href="\/office\/?"/);
});

test('office offers are clickable dialogs with distinct hours and team conditions', () => {
  const cards = [...officeMarkup.matchAll(/<article class="offer(?: offer--(?:lunch|team))?" id="([a-z]+)">([\s\S]*?)<\/article>/g)];
  assert.deepEqual(cards.map(([, id]) => id), ['breakfast', 'lunch', 'team']);

  const [breakfast, lunch, team] = cards.map(([, , body]) => body);
  cards.forEach(([, id, body]) => {
    assert.match(body, new RegExp(`data-offer="${id}"[^>]*aria-haspopup="dialog"`));
    assert.match(body, /aria-labelledby="[^"]+"/);
  });
  assert.match(breakfast, /MON–FRI · 7–11 AM/);
  assert.match(lunch, /11 AM – 4 PM/);
  assert.match(team, /ALL DAY/);
  assert.match(team, /3 or more people/);
  assert.match(team, /One shared check/);
  assert.match(team, /10%/);
  assert.match(breakfast, /\$19\.99/);
  assert.match(lunch, /\$19\.99/);
  assert.match(officeMarkup, /<dialog class="offer-dialog" aria-labelledby="offer-dialog-title"/);
});

test('office menu is autonomous and reuses the home menu renderer and CSS', () => {
  assert.match(officeMarkup, /data-open-menu="kitchen"/);
  assert.match(officeMarkup, /data-open-menu="drink"/);
  assert.doesNotMatch(officeMarkup, /href="\/(?:\?|"|#)/);
  assert.match(officeMarkup, /id="menu-overlay" role="dialog" aria-modal="true"/);
  assert.match(officeMarkup, /class="overlay__panel overlay__panel--menu"/);
  assert.match(overlayScript, /import \{ renderMenu \} from '\.\/menu\.js'/);
  assert.match(overlayScript, /background\.inert = true/);
  assert.match(overlayScript, /trigger\?\.focus/);
  assert.match(officeCss, /@import '\.\/menu\.css'/);
  assert.match(mainCss, /@import '\.\/menu\.css'/);
});

test('office page gives directions directly from the landing and offer dialog', () => {
  const directions = officeMarkup.match(/https:\/\/www\.google\.com\/maps\/dir\/[^"]+/g) || [];
  assert.ok(directions.length >= 3);
  directions.forEach((href) => assert.match(href, /142%20W%2023rd%20St/));
});

test('offer items resolve only explicit eligible names from the canonical kitchen menu', () => {
  Object.values(officeOffers).forEach((offer) => {
    assert.deepEqual(getOfficeOfferItems(offer).map((item) => item.name), offer.itemNames);
  });
  assert.throws(() => getOfficeOfferItems({ itemNames: ['Unknown dish'] }), /Unknown office offer item/);
});

test('breakfast covers all syrniki on weekday mornings and lunch excludes the specified dishes', () => {
  const items = kitchenMenu.sections.flatMap((section) => section.items);
  const syrniki = items.filter((item) => item.name.startsWith('Syrnik ')).map((item) => item.name);
  const excludedLunchItems = new Set([
    ...syrniki,
    'Chia Cup',
    'Smoked Salmon Cream Cheese Toast',
    'Salmon Wrap',
  ]);
  assert.deepEqual(officeOffers.breakfast.itemNames, syrniki);
  assert.deepEqual(
    officeOffers.lunch.itemNames,
    items.filter((item) => !excludedLunchItems.has(item.name)).map((item) => item.name),
  );
  assert.equal(officeOffers.lunch.itemNames.length, 8);
  assert.equal(officeOffers.breakfast.price, '19.99');
  assert.equal(officeOffers.lunch.price, '19.99');
  assert.equal(officeOffers.breakfast.time, 'Mon–Fri · 7–11 AM');
  assert.equal(officeOffers.lunch.time, '11 AM – 4 PM');
  assert.match(officeOffers.breakfast.conditions, /any coffee for \$19\.99/);
  assert.match(officeOffers.lunch.conditions, /any coffee for \$19\.99/);
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
  assert.match(officeScript, /import\('@vercel\/analytics'\)/);
  assert.match(officeScript, /inject\(\)/);
  assert.match(officeScript, /\.catch\(/);
});
