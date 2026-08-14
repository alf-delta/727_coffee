import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { kitchenMenu } from '../src/data/menu.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const menuScript = await readFile(path.join(projectRoot, 'src/scripts/menu.js'), 'utf8');
const mainCss = await readFile(path.join(projectRoot, 'src/styles/main.css'), 'utf8');
const homeMarkup = await readFile(path.join(projectRoot, 'index.html'), 'utf8');

test('kitchen cards expose complete detail content and valid images', async () => {
  const items = kitchenMenu.sections.flatMap((section) => section.items);
  assert.ok(items.length > 0);

  await Promise.all(items.map(async (item) => {
    assert.ok(item.name);
    assert.ok(item.price);
    assert.ok(item.desc);
    assert.ok(item.image.endsWith('.webp'));
    await access(path.join(projectRoot, 'public', item.image));
  }));
});

test('kitchen cards open an accessible, dismissible detail dialog', () => {
  assert.match(menuScript, /class="kitchen-menu__card-button"[\s\S]*?aria-haspopup="dialog"/);
  assert.match(menuScript, /<article class="kitchen-menu__card">/);
  assert.match(menuScript, /role="dialog"[\s\S]*?aria-modal="true"/);
  assert.match(menuScript, /detailImage\.src = encodeAssetPath\(item\.image\)/);
  assert.match(menuScript, /detailDescription\.textContent = item\.desc/);
  assert.match(menuScript, /event\.key === 'Escape'/);
  assert.match(menuScript, /detailTrigger\?\.focus/);
  assert.match(mainCss, /\.overlay__panel\.has-kitchen-detail-open\s*\{[\s\S]*?overflow:\s*hidden/);
  assert.match(mainCss, /\.kitchen-menu__card-button\s*\{[\s\S]*?position:\s*absolute[\s\S]*?inset:\s*0/);
  assert.match(mainCss, /\.overlay__close\s*\{[\s\S]*?position:\s*sticky[\s\S]*?z-index:\s*30/);
  assert.match(mainCss, /\.kitchen-menu__card\s*\{[\s\S]*?isolation:\s*isolate/);
  assert.match(mainCss, /\.kitchen-detail__photo\s*\{[\s\S]*?height:\s*min\(49svh, 490px\)/);
});

test('kitchen detail supports cyclic swipe and accessible navigation', () => {
  assert.match(menuScript, /SWIPE_THRESHOLD_PX = 52/);
  assert.match(menuScript, /detailContent\.addEventListener\('pointerdown'/);
  assert.match(menuScript, /detailContent\.addEventListener\('pointermove'/);
  assert.match(menuScript, /moveKitchenDetail\(deltaX < 0 \? 1 : -1\)/);
  assert.match(menuScript, /\(index \+ kitchenEntries\.length\) % kitchenEntries\.length/);
  assert.match(menuScript, /data-kitchen-detail-prev aria-label="Previous dish"/);
  assert.match(menuScript, /data-kitchen-detail-next aria-label="Next dish"/);
  assert.match(menuScript, /event\.key === 'ArrowLeft'/);
  assert.match(menuScript, /event\.key === 'ArrowRight'/);
  assert.match(mainCss, /\.kitchen-detail__content\s*\{[\s\S]*?touch-action:\s*pan-y/);
  assert.match(mainCss, /@keyframes kitchen-detail-next/);
  assert.match(mainCss, /@keyframes kitchen-detail-previous/);
});

test('menu keeps navigation fixed and places close control above the sheet', () => {
  assert.match(homeMarkup, /class="overlay__panel overlay__panel--menu"/);
  assert.match(menuScript, /container\.scrollTop = 0/);
  assert.match(mainCss, /\.overlay__panel--menu\s*\{[\s\S]*?overflow:\s*visible/);
  assert.match(mainCss, /\.overlay__panel--menu\s*\{[^}]*background:\s*transparent[^}]*box-shadow:\s*none/);
  assert.match(mainCss, /\.overlay__panel--menu > \.overlay__close\s*\{[\s\S]*?position:\s*absolute[\s\S]*?top:\s*-48px/);
  assert.match(menuScript, /class="menu__viewport"[\s\S]*?class="menu__tabs"[\s\S]*?class="menu__body"/);
  assert.match(menuScript, /menuViewport\.scrollTop = 0/);
  assert.match(mainCss, /#menu-content\s*\{[\s\S]*?overflow:\s*hidden/);
  assert.match(mainCss, /\.menu__tabs\s*\{[^}]*position:\s*sticky[^}]*top:\s*var\(--space-3\)/);
  assert.match(mainCss, /\.menu__tabs\s*\{[^}]*border-radius:\s*var\(--radius-pill\)/);
  assert.match(mainCss, /\.menu__tabs\s*\{[^}]*margin:\s*0 var\(--space-6\) var\(--space-6\)/);
  assert.match(mainCss, /\.menu__viewport\s*\{[^}]*overflow-y:\s*auto[^}]*background:\s*var\(--color-surface-cream\)/);
  assert.match(mainCss, /\.menu__viewport::before\s*\{[^}]*height:\s*var\(--space-3\)/);
  assert.match(mainCss, /\.menu__body\s*\{[^}]*background:\s*var\(--color-surface-cream\)/);
});
