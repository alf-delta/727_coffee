import { parseCouponQrPayload } from './couponQr.js';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function readResponse(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || 'Something went wrong.');
    error.code = body.error;
    error.status = response.status;
    error.details = body;
    throw error;
  }
  return body;
}

function formatCouponTime(epochMs, timeZone) {
  if (!Number(epochMs)) return 'Not available';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || 'America/New_York',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(epochMs));
}

function formatRemaining(seconds) {
  const totalMinutes = Math.max(0, Math.ceil((Number(seconds) || 0) / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes} min`;
  if (!minutes) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
}

export function mountCouponDesk(body) {
  let destroyed = false;
  let activeScanner = null;
  let scannerStarting = false;
  let scannerRequestId = 0;

  function stopScanner({ hide = true } = {}) {
    scannerRequestId += 1;
    scannerStarting = false;
    const scanner = activeScanner;
    activeScanner = null;
    scanner?.stop();
    scanner?.destroy();
    const scannerView = body.querySelector('[data-role="coupon-scanner"]');
    if (scannerView && hide) scannerView.hidden = true;
  }

  const stopScannerOnPageHide = () => stopScanner();
  window.addEventListener('pagehide', stopScannerOnPageHide);

  function shell(content, { signedIn = false } = {}) {
    stopScanner();
    body.innerHTML = `
      <main class="coupon-desk">
        <section class="coupon-desk__panel">
          <header class="coupon-desk__header">
            <span>MONOBLEND · STAFF ONLY</span>
            <strong>Coupon Checker</strong>
            <p>${signedIn
              ? 'Verify a guest code and redeem it in one secure step.'
              : 'Authorized café staff must sign in to continue.'}</p>
          </header>
          ${content}
          <a class="coupon-desk__back" href="/">← Return to website</a>
        </section>
      </main>`;
  }

  function renderLogin(message = '') {
    if (destroyed) return;
    shell(`
      <form class="coupon-desk__form coupon-desk__form--login">
        <label>
          Staff password
          <input
            name="password"
            type="password"
            autocomplete="current-password"
            placeholder="Enter password"
            required
          />
        </label>
        <button type="submit">Sign in →</button>
      </form>
      <div class="coupon-desk__result${message ? ' is-error' : ''}" data-role="result" aria-live="polite">
        ${message ? `<strong>Access denied</strong><span>${escapeHtml(message)}</span>` : ''}
      </div>`);

    const form = body.querySelector('.coupon-desk__form');
    const input = form.elements.password;
    requestAnimationFrame(() => input.focus({ preventScroll: true }));
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button');
      const resultEl = body.querySelector('[data-role="result"]');
      button.disabled = true;
      button.textContent = 'Signing in…';
      resultEl.className = 'coupon-desk__result';
      resultEl.innerHTML = '';

      try {
        await readResponse(await fetch('/api/checker/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: input.value }),
        }));
        renderChecker();
      } catch (error) {
        resultEl.classList.add('is-error');
        resultEl.innerHTML = `
          <strong>Access denied</strong>
          <span>${escapeHtml(error.message)}</span>`;
        input.select();
        button.disabled = false;
        button.textContent = 'Sign in →';
      }
    });
  }

  function renderChecker() {
    if (destroyed) return;
    shell(`
      <div class="coupon-desk__session">
        <span><i aria-hidden="true"></i> STAFF SESSION ACTIVE</span>
        <button type="button" data-action="checker-logout">SIGN OUT</button>
      </div>
      <div class="coupon-desk__scan-launcher">
        <span class="coupon-desk__scan-kicker">FASTEST WAY TO REDEEM</span>
        <button type="button" data-action="start-coupon-scan">
          <span class="coupon-desk__scan-icon" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <span class="coupon-desk__scan-copy">
            <strong>SCAN COUPON QR</strong>
            <small>OPEN CAMERA</small>
          </span>
          <span class="coupon-desk__scan-arrow" aria-hidden="true">→</span>
        </button>
        <span class="coupon-desk__scan-hint">Point, scan, and verify automatically</span>
      </div>
      <section class="coupon-desk__scanner" data-role="coupon-scanner" aria-label="Coupon QR scanner" hidden>
        <div class="coupon-desk__camera">
          <video muted playsinline></video>
          <div class="coupon-desk__reticle" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        </div>
        <p data-role="scanner-status" aria-live="polite">Point the camera at the guest’s QR code.</p>
        <button type="button" data-action="stop-coupon-scan">CLOSE CAMERA</button>
      </section>
      <div class="coupon-desk__manual-divider"><span>OR ENTER MANUALLY</span></div>
      <form class="coupon-desk__form">
        <label>
          Guest coupon code
          <input
            name="code"
            inputmode="text"
            autocomplete="off"
            autocapitalize="characters"
            maxlength="9"
            placeholder="ABCD 2345"
            required
          />
        </label>
        <p class="coupon-desk__warning">A successful check redeems the coupon immediately and blocks reuse.</p>
        <button type="submit">Verify &amp; redeem →</button>
      </form>
      <div class="coupon-desk__result" data-role="result" aria-live="polite"></div>`, { signedIn: true });

    const form = body.querySelector('.coupon-desk__form');
    const codeInput = form.elements.code;
    const resultEl = body.querySelector('[data-role="result"]');
    const scanButton = body.querySelector('[data-action="start-coupon-scan"]');
    const scannerView = body.querySelector('[data-role="coupon-scanner"]');
    const scannerStatus = body.querySelector('[data-role="scanner-status"]');
    const scannerVideo = scannerView.querySelector('video');
    const scanButtonTitle = scanButton.querySelector('strong');
    const scanButtonDetail = scanButton.querySelector('small');
    let scanLocked = false;

    const setScanButtonState = (title, detail, { disabled = false, active = false } = {}) => {
      scanButtonTitle.textContent = title;
      scanButtonDetail.textContent = detail;
      scanButton.disabled = disabled;
      scanButton.classList.toggle('is-active', active);
    };

    const showResultPopup = ({
      type,
      eyebrow,
      title,
      discountPercent,
      message,
      details,
    }) => {
      stopScanner();
      const safeDetails = details
        .filter((detail) => detail.value !== null && detail.value !== undefined && detail.value !== '')
        .map((detail) => `
          <div>
            <dt>${escapeHtml(detail.label)}</dt>
            <dd>${escapeHtml(detail.value)}</dd>
          </div>`)
        .join('');

      resultEl.className = `coupon-desk__result is-open is-${type}`;
      resultEl.innerHTML = `
        <section class="coupon-desk__result-card" role="alertdialog" aria-modal="true" aria-labelledby="coupon-result-title">
          <span class="coupon-desk__result-mark" aria-hidden="true">${type === 'success' ? '✓' : '!'}</span>
          <span class="coupon-desk__result-eyebrow">${escapeHtml(eyebrow)}</span>
          <strong id="coupon-result-title" class="coupon-desk__result-title">${escapeHtml(title)}</strong>
          ${Number(discountPercent) > 0
            ? `<span class="coupon-desk__result-discount">${Number(discountPercent)}% OFF</span>`
            : ''}
          <p>${escapeHtml(message)}</p>
          <dl class="coupon-desk__details">${safeDetails}</dl>
          <button type="button" class="coupon-desk__result-close" data-action="dismiss-coupon-result">CHECK NEXT COUPON</button>
        </section>`;

      const closeButton = resultEl.querySelector('[data-action="dismiss-coupon-result"]');
      closeButton.addEventListener('click', () => {
        resultEl.className = 'coupon-desk__result';
        resultEl.replaceChildren();
        setScanButtonState('SCAN COUPON QR', 'OPEN CAMERA');
        if (matchMedia('(pointer: fine)').matches) codeInput.focus({ preventScroll: true });
      });
      requestAnimationFrame(() => closeButton.focus({ preventScroll: true }));
    };

    codeInput.addEventListener('input', () => {
      const raw = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
      codeInput.value = raw.length > 4 ? `${raw.slice(0, 4)} ${raw.slice(4)}` : raw;
    });

    body.querySelector('[data-action="checker-logout"]').addEventListener('click', async () => {
      await fetch('/api/checker/logout', { method: 'POST' }).catch(() => {});
      renderLogin();
    });

    body.querySelector('[data-action="stop-coupon-scan"]').addEventListener('click', () => {
      stopScanner();
      setScanButtonState('SCAN COUPON QR', 'OPEN CAMERA');
    });

    scanButton.addEventListener('click', async () => {
      if (scannerStarting || activeScanner) return;
      const requestId = ++scannerRequestId;
      scannerStarting = true;
      scanLocked = false;
      setScanButtonState('OPENING CAMERA…', 'ALLOW CAMERA ACCESS', { disabled: true, active: true });
      scannerView.hidden = false;
      scannerView.classList.remove('is-error');
      scannerStatus.textContent = 'Starting the rear camera…';

      try {
        if (!window.isSecureContext) {
          throw new Error('Camera scanning requires a secure HTTPS connection.');
        }

        const module = await import('qr-scanner');
        const QrScanner = module.default;
        if (!await QrScanner.hasCamera()) throw new Error('No camera is available on this device.');
        if (destroyed || !scannerView.isConnected || requestId !== scannerRequestId) return;

        const scanner = new QrScanner(scannerVideo, (scanResult) => {
          if (scanLocked) return;
          const couponCode = parseCouponQrPayload(scanResult?.data || scanResult);
          if (!couponCode) {
            scannerStatus.textContent = 'That is not a Monoblend coupon. Try another QR code.';
            return;
          }

          scanLocked = true;
          codeInput.value = `${couponCode.slice(0, 4)} ${couponCode.slice(4)}`;
          scannerStatus.textContent = 'Coupon found. Verifying now…';
          stopScanner();
          requestAnimationFrame(() => form.requestSubmit());
        }, {
          preferredCamera: 'environment',
          maxScansPerSecond: 12,
          highlightScanRegion: false,
          highlightCodeOutline: true,
          returnDetailedScanResult: true,
        });

        activeScanner = scanner;
        await scanner.start();
        if (destroyed || requestId !== scannerRequestId || activeScanner !== scanner) {
          scanner.stop();
          scanner.destroy();
          return;
        }
        scannerStatus.textContent = 'Hold the guest’s QR code inside the frame.';
        setScanButtonState('CAMERA ACTIVE', 'POINT AT COUPON', { disabled: true, active: true });
      } catch (error) {
        if (requestId !== scannerRequestId) return;
        stopScanner({ hide: false });
        scannerView.classList.add('is-error');
        scannerStatus.textContent = error?.name === 'NotAllowedError'
          ? 'Camera access was blocked. Allow it in browser settings or enter the code manually.'
          : (error?.message || 'Could not start the camera. Enter the code manually.');
        setScanButtonState('TRY CAMERA AGAIN', 'OR ENTER CODE BELOW');
      } finally {
        if (requestId === scannerRequestId) scannerStarting = false;
      }
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      const rawCode = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
      const submittedCode = rawCode.length === 8
        ? `${rawCode.slice(0, 4)} ${rawCode.slice(4)}`
        : codeInput.value;
      button.disabled = true;
      button.textContent = 'Checking…';
      resultEl.className = 'coupon-desk__result';
      resultEl.textContent = '';

      try {
        const result = await readResponse(await fetch('/api/coupon/redeem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: codeInput.value }),
        }));
        form.reset();
        showResultPopup({
          type: 'success',
          eyebrow: 'COUPON VERIFIED',
          title: 'ACCEPTED',
          discountPercent: result.discountPercent,
          message: 'Apply this discount to the current order. The coupon is now marked as used.',
          details: [
            { label: 'COUPON', value: submittedCode },
            { label: 'EMAIL', value: result.email || result.maskedEmail || 'Not recorded' },
            { label: 'REDEEMED AT', value: formatCouponTime(result.redeemedAt, result.timeZone) },
            { label: 'VALID UNTIL', value: formatCouponTime(result.expiresAt, result.timeZone) },
            { label: 'TIME REMAINING', value: formatRemaining(result.remainingSeconds) },
          ],
        });
      } catch (error) {
        if (error.status === 401) {
          renderLogin('Your staff session expired. Sign in again.');
          return;
        }
        if (error.code === 'coupon_already_redeemed') {
          form.reset();
          showResultPopup({
            type: 'used',
            eyebrow: 'DO NOT APPLY DISCOUNT',
            title: 'ALREADY USED',
            discountPercent: error.details?.discountPercent,
            message: error.details?.redeemedAt
              ? 'This coupon was redeemed earlier. Do not apply the discount again.'
              : 'This coupon has already been redeemed. Do not apply the discount again.',
            details: [
              { label: 'COUPON', value: submittedCode },
              { label: 'EMAIL', value: error.details?.email || error.details?.maskedEmail || 'Not recorded' },
              { label: 'USED AT', value: error.details?.redeemedAt
                ? formatCouponTime(error.details.redeemedAt, error.details?.timeZone)
                : 'Time unavailable' },
              { label: 'ORIGINAL EXPIRY', value: formatCouponTime(error.details?.expiresAt, error.details?.timeZone) },
            ],
          });
          return;
        }
        resultEl.classList.add('is-error');
        resultEl.innerHTML = `
          <strong>COUPON NOT ACCEPTED</strong>
          <span>${escapeHtml(error.message || 'Check the code and try again.')}</span>`;
      } finally {
        if (!button.isConnected) return;
        button.disabled = false;
        button.textContent = 'Verify & redeem →';
        setScanButtonState('SCAN COUPON QR', 'OPEN CAMERA');
        if (!resultEl.classList.contains('is-open') && matchMedia('(pointer: fine)').matches) {
          codeInput.focus();
          codeInput.select();
        }
      }
    });

    if (matchMedia('(pointer: fine)').matches) {
      requestAnimationFrame(() => codeInput.focus({ preventScroll: true }));
    }
  }

  shell(`
    <div class="coupon-desk__loading" aria-live="polite">
      <span>CHECKING STAFF SESSION…</span>
    </div>`);

  fetch('/api/checker/login', { method: 'GET' })
    .then(readResponse)
    .then((session) => {
      if (session.authenticated) renderChecker();
      else renderLogin();
    })
    .catch(() => renderLogin());

  return {
    destroy() {
      destroyed = true;
      window.removeEventListener('pagehide', stopScannerOnPageHide);
      stopScanner();
    },
  };
}
