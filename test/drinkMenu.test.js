import assert from 'node:assert/strict';
import test from 'node:test';
import { drinkMenu } from '../src/data/menu.js';
import { renderSections } from '../src/scripts/menu.js';

const PRICE = /^\d+\.\d{2}$/;
const FREE_TEXT_PRICES = new Set(['See Pour Over Menu']);

test('drink menu items are named once per section and priced as dollars', () => {
  for (const section of drinkMenu.sections) {
    assert.ok(section.name);
    const names = section.items.map((item) => item.name);
    assert.ok(names.length > 0, `${section.name} has no items`);
    assert.equal(new Set(names).size, names.length, `${section.name} repeats an item`);

    for (const item of section.items) {
      assert.ok(item.name, `${section.name} has an unnamed item`);
      // formatPrice() drops the "$" from anything that is not a plain number, so a typo fails silently.
      for (const price of [].concat(item.price)) {
        assert.ok(PRICE.test(price) || FREE_TEXT_PRICES.has(price), `${item.name}: unexpected price "${price}"`);
      }
    }
  }
});

test('section notes render under the title, escaped, and only when present', () => {
  const section = { name: 'Signature Coffee', note: 'Hot <b>or</b> iced', items: [{ name: 'Latte', price: '6.75' }] };
  const html = renderSections({ sections: [section] });
  assert.match(html, /<p class="menu__section-note">Hot &lt;b&gt;or&lt;\/b&gt; iced<\/p>/);
  assert.ok(html.indexOf('menu__section-title') < html.indexOf('menu__section-note'));
  assert.ok(html.indexOf('menu__section-note') < html.indexOf('menu__item'));

  assert.doesNotMatch(renderSections({ sections: [{ ...section, note: undefined }] }), /menu__section-note/);
  assert.match(renderSections(drinkMenu), /Large iced \+ \$1\.50/);
});
