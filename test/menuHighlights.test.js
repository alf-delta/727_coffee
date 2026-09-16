import assert from 'node:assert/strict';
import test from 'node:test';
import { renderMenuHighlight } from '../src/scripts/menu.js';

const monthly = { highlight: { title: 'MONTH’S BESTSELLER', description: 'Coffee favorite', month: '2026-09' } };

test('monthly highlights follow the New York month boundary', () => {
  assert.match(renderMenuHighlight(monthly, { now: new Date('2026-10-01T03:59:59Z') }), /BESTSELLER/);
  assert.equal(renderMenuHighlight(monthly, { now: new Date('2026-10-01T04:00:00Z') }), '');
  assert.equal(renderMenuHighlight(monthly, { now: new Date('2026-09-01T03:59:59Z') }), '');
});

test('highlights escape copy and only expand descriptions in details', () => {
  const item = { highlight: { title: '<script>', description: '<img>' } };
  assert.equal(renderMenuHighlight({}), '');
  assert.match(renderMenuHighlight(item), /&lt;script&gt;/);
  assert.doesNotMatch(renderMenuHighlight(item), /onclick|&lt;img&gt;/);
  assert.match(renderMenuHighlight(item, { detail: true }), /&lt;img&gt;/);
});
