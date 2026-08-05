const COUPON_QR_PREFIX = 'MONOBLEND:';

export function normalizeCouponCode(value) {
  const normalized = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return normalized.length === 8 ? normalized : '';
}

export function createCouponQrPayload(code) {
  const normalized = normalizeCouponCode(code);
  return normalized ? `${COUPON_QR_PREFIX}${normalized}` : '';
}

export function parseCouponQrPayload(payload) {
  const value = String(payload || '').trim();
  if (!value) return '';

  const prefixed = value.toUpperCase().startsWith(COUPON_QR_PREFIX)
    ? value.slice(COUPON_QR_PREFIX.length)
    : value;
  return normalizeCouponCode(prefixed);
}

export async function mountCouponQr(root, code) {
  const holder = root?.querySelector?.('[data-role="coupon-qr"]');
  const payload = createCouponQrPayload(code);
  if (!holder || !payload) return;

  holder.setAttribute('aria-label', 'Scannable coupon QR code');
  holder.setAttribute('role', 'img');

  try {
    const module = await import('qrcode');
    const QRCode = module.default || module;
    const canvas = document.createElement('canvas');
    canvas.className = 'coupon-qr__canvas';
    await QRCode.toCanvas(canvas, payload, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 256,
      color: {
        dark: '#211a3aff',
        light: '#fff8e8ff',
      },
    });
    if (holder.isConnected) holder.replaceChildren(canvas);
  } catch (error) {
    holder.remove();
    console.error('[coupon-qr]', error);
  }
}
