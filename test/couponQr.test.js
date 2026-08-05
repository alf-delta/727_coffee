import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCouponQrPayload,
  normalizeCouponCode,
  parseCouponQrPayload,
} from '../src/scripts/couponQr.js';

test('coupon QR: normalizes the displayed eight-character code', () => {
  assert.equal(normalizeCouponCode('ab12 cd34'), 'AB12CD34');
  assert.equal(normalizeCouponCode('short'), '');
});

test('coupon QR: creates and reads a branded payload', () => {
  assert.equal(createCouponQrPayload('ab12 cd34'), 'MONOBLEND:AB12CD34');
  assert.equal(parseCouponQrPayload('MONOBLEND:AB12CD34'), 'AB12CD34');
});

test('coupon QR: accepts a raw code but rejects unrelated QR content', () => {
  assert.equal(parseCouponQrPayload('AB12 CD34'), 'AB12CD34');
  assert.equal(parseCouponQrPayload('https://example.com/not-a-coupon'), '');
});
