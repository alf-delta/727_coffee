export function mountCouponDesk(body) {
  body.innerHTML = `
    <main class="coupon-desk">
      <section class="coupon-desk__panel">
        <header class="coupon-desk__header">
          <span>MONOBLEND</span>
          <strong>Coupon Desk</strong>
          <p>Staff screen · single-use coupon redemption</p>
        </header>

        <form class="coupon-desk__form">
          <label>
            Guest code
            <input
              name="code"
              inputmode="text"
              autocomplete="off"
              maxlength="9"
              placeholder="ABCD 2345"
              required
            />
          </label>
          <label>
            Staff PIN
            <input
              name="pin"
              type="password"
              inputmode="numeric"
              autocomplete="current-password"
              placeholder="••••"
              required
            />
          </label>
          <button type="submit">Verify and redeem</button>
        </form>

        <div class="coupon-desk__result" data-role="result" aria-live="polite"></div>
        <a class="coupon-desk__back" href="/">← Return to website</a>
      </section>
    </main>`;

  const form = body.querySelector('.coupon-desk__form');
  const codeInput = form.elements.code;
  const resultEl = body.querySelector('[data-role="result"]');

  codeInput.addEventListener('input', () => {
    const raw = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    codeInput.value = raw.length > 4 ? `${raw.slice(0, 4)} ${raw.slice(4)}` : raw;
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button');
    const data = new FormData(form);
    button.disabled = true;
    button.textContent = 'Verifying…';
    resultEl.className = 'coupon-desk__result';
    resultEl.textContent = '';

    try {
      const res = await fetch('/api/coupon/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: data.get('code'),
          pin: data.get('pin'),
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        resultEl.classList.add('is-error');
        resultEl.innerHTML = `
          <strong>Coupon not accepted</strong>
          <span>${result.message || 'Check the code and try again.'}</span>`;
        return;
      }

      resultEl.classList.add('is-success');
      resultEl.innerHTML = `
        <strong>${Number(result.discountPercent) || 0}% — coupon redeemed</strong>
        <span>The discount can be applied to the order. Reuse is now blocked.</span>`;
      form.reset();
      codeInput.focus();
    } catch {
      resultEl.classList.add('is-error');
      resultEl.innerHTML = `
        <strong>Connection lost</strong>
        <span>Do not apply the discount until the server confirms redemption.</span>`;
    } finally {
      button.disabled = false;
      button.textContent = 'Verify and redeem';
    }
  });

  codeInput.focus();
}
