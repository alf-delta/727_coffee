import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { kitchenMenu } from '../src/data/menu.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const menuScript = await readFile(path.join(projectRoot, 'src/scripts/menu.js'), 'utf8');
const mainCss = await readFile(path.join(projectRoot, 'src/styles/main.css'), 'utf8');

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
  assert.match(menuScript, /class="kitchen-menu__card"[\s\S]*?aria-haspopup="dialog"/);
  assert.match(menuScript, /role="dialog"[\s\S]*?aria-modal="true"/);
  assert.match(menuScript, /detailImage\.src = encodeAssetPath\(item\.image\)/);
  assert.match(menuScript, /detailDescription\.textContent = item\.desc/);
  assert.match(menuScript, /event\.key === 'Escape'/);
  assert.match(menuScript, /detailTrigger\?\.focus/);
  assert.match(mainCss, /\.overlay__panel\.has-kitchen-detail-open\s*\{[\s\S]*?overflow:\s*hidden/);
  assert.match(mainCss, /\.kitchen-detail__photo\s*\{[\s\S]*?height:\s*min\(49svh, 490px\)/);
});
