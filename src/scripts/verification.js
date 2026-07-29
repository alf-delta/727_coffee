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
    throw new Error(body.message || 'Something went wrong. Please try again.');
  }
  return body;
}

export function mountContactVerification(container, {
  game,
  initialStep = 'phone',
  contact = null,
  onPlay,
} = {}) {
  let destroyed = false;

  function renderPhoneStep() {
    if (destroyed) return;
    container.innerHTML = `
      <section class="game-lobby game-lobby--verification">
        <header class="game-lobby__header">
          <span class="game-lobby__eyebrow">YOUR BEST RUN IS SAVED</span>
          <strong>GET YOUR COUPON</strong>
          <span>Verify your mobile number and we’ll send today’s coupon by text.</span>
        </header>

        <form class="contact-verify" data-step="phone">
          <label class="contact-verify__field">
            <span>MOBILE NUMBER</span>
            <input
              name="contact"
              type="tel"
              inputmode="tel"
              autocomplete="tel"
              placeholder="+1 212 555 0123"
              required
            />
          </label>
          <p class="contact-verify__disclosure">
            This number is used to verify today’s game limit and deliver the coupon you request. Standard message and data rates may apply.
          </p>
          <p class="contact-verify__error" role="alert" hidden></p>
          <button class="contact-verify__submit" type="submit">TEXT ME A CODE →</button>
          <p class="contact-verify__fineprint">No marketing subscription is required.</p>
        </form>
      </section>`;

    bindSendForm('sms');
  }

  function renderEmailStep() {
    if (destroyed) return;
    container.innerHTML = `
      <section class="game-lobby game-lobby--verification">
        <header class="game-lobby__header">
          <span class="game-lobby__eyebrow">OPTIONAL EXTRA CHANCE</span>
          <strong>UNLOCK ONE MORE RUN</strong>
          <span>Verify your email to add one final attempt. Your coupon will use the best result from all four runs.</span>
        </header>

        <form class="contact-verify" data-step="email">
          <label class="contact-verify__field">
            <span>EMAIL ADDRESS</span>
            <input
              name="contact"
              type="email"
              inputmode="email"
              autocomplete="email"
              placeholder="you@example.com"
              required
            />
          </label>
          <p class="contact-verify__disclosure">
            Email is optional and is used to verify this extra attempt. Your coupon will still be delivered to your confirmed phone number.
          </p>
          <p class="contact-verify__error" role="alert" hidden></p>
          <button class="contact-verify__submit" type="submit">EMAIL ME A CODE →</button>
          <button class="contact-verify__back" type="button" data-action="back-to-choice">BACK TO COUPON OPTIONS</button>
        </form>
      </section>`;

    bindSendForm('email');
    container.querySelector('[data-action="back-to-choice"]')
      ?.addEventListener('click', () => renderPostPhoneStep());
  }

  function bindSendForm(channel) {
    const form = container.querySelector('.contact-verify');
    const input = form.elements.contact;
    requestAnimationFrame(() => input.focus({ preventScroll: true }));

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = form.querySelector('.contact-verify__submit');
      const error = form.querySelector('.contact-verify__error');
      submit.disabled = true;
      submit.textContent = 'SENDING…';
      error.hidden = true;

      try {
        const challenge = await readResponse(await fetch('/api/verification/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel,
            value: input.value,
          }),
        }));
        renderCodeStep(challenge);
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
        submit.disabled = false;
        submit.textContent = channel === 'sms' ? 'TEXT ME A CODE →' : 'EMAIL ME A CODE →';
      }
    });
  }

  function renderCodeStep(challenge) {
    if (destroyed) return;
    const isPhone = challenge.channel === 'sms';
    container.innerHTML = `
      <section class="game-lobby game-lobby--verification">
        <header class="game-lobby__header">
          <span class="game-lobby__eyebrow">${isPhone ? 'TEXT SENT' : 'EMAIL SENT'}</span>
          <strong>ENTER YOUR CODE</strong>
          <span>Enter the six-digit code sent to ${escapeHtml(challenge.masked)}.</span>
        </header>

        <form class="contact-verify contact-verify--code" data-step="code">
          <label class="contact-verify__field contact-verify__field--code">
            <span>VERIFICATION CODE</span>
            <input
              name="code"
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              pattern="[0-9]*"
              maxlength="6"
              placeholder="000000"
              required
            />
          </label>
          ${challenge.devCode ? `<p class="contact-verify__dev">LOCAL CODE · <strong>${escapeHtml(challenge.devCode)}</strong></p>` : ''}
          <p class="contact-verify__error" role="alert" hidden></p>
          <button class="contact-verify__submit" type="submit">VERIFY CODE →</button>
          <button class="contact-verify__back" type="button" data-action="change-contact">USE A DIFFERENT ${isPhone ? 'NUMBER' : 'EMAIL'}</button>
        </form>
      </section>`;

    const form = container.querySelector('.contact-verify');
    const input = form.elements.code;
    requestAnimationFrame(() => input.focus({ preventScroll: true }));
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(0, 6);
    });
    form.querySelector('[data-action="change-contact"]').addEventListener(
      'click',
      isPhone ? renderPhoneStep : renderEmailStep,
    );

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = form.querySelector('.contact-verify__submit');
      const error = form.querySelector('.contact-verify__error');
      submit.disabled = true;
      submit.textContent = 'VERIFYING…';
      error.hidden = true;

      try {
        const verified = await readResponse(await fetch('/api/verification/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challengeId: challenge.challengeId,
            code: input.value,
          }),
        }));
        if (verified.verificationType === 'phone') {
          contact = verified.contact;
          renderPostPhoneStep();
        } else {
          renderEmailSuccess(verified);
        }
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
        submit.disabled = false;
        submit.textContent = 'VERIFY CODE →';
        input.select();
      }
    });
  }

  function renderPostPhoneStep() {
    if (destroyed) return;
    container.innerHTML = `
      <section class="game-lobby game-lobby--verification game-lobby--verified" aria-live="polite">
        <header class="game-lobby__header">
          <span class="game-lobby__eyebrow">PHONE VERIFIED</span>
          <strong>GO BIGGER OR CASH IN?</strong>
          <span>${escapeHtml(contact?.masked || 'Your mobile number')} is ready for coupon delivery.</span>
        </header>
        <div class="contact-verify__success-mark" aria-hidden="true">✓</div>
        <div class="contact-verify__success-actions">
          <button type="button" class="contact-verify__submit" data-action="unlock-email">ONE MORE RUN — WIN A BIGGER DISCOUNT →</button>
          <button type="button" class="contact-verify__claim" data-action="claim-best">GET MY COUPON NOW</button>
        </div>
        <p class="contact-verify__choice-note">The extra run is optional. If you play it, your best result from all four runs determines the coupon.</p>
        <p class="contact-verify__error" role="alert" hidden></p>
      </section>`;

    container.querySelector('[data-action="unlock-email"]').addEventListener('click', renderEmailStep);
    container.querySelector('[data-action="claim-best"]').addEventListener('click', claimBest);
  }

  function renderEmailSuccess(verified) {
    if (destroyed) return;
    const remaining = Math.max(0, Number(verified.attemptsRemainingToday) || 0);
    container.innerHTML = `
      <section class="game-lobby game-lobby--verification game-lobby--verified" aria-live="polite">
        <header class="game-lobby__header">
          <span class="game-lobby__eyebrow">EMAIL VERIFIED</span>
          <strong>YOUR EXTRA RUN IS READY</strong>
          <span>${escapeHtml(verified.emailContact?.masked || '')} unlocked one final attempt.</span>
        </header>
        <div class="contact-verify__success-mark" aria-hidden="true">+1</div>
        <p class="contact-verify__remaining">${remaining} ${remaining === 1 ? 'ATTEMPT' : 'ATTEMPTS'} AVAILABLE</p>
        <div class="contact-verify__success-actions">
          <button type="button" class="contact-verify__submit" data-action="play-bonus">PLAY EXTRA RUN →</button>
        </div>
      </section>`;

    container.querySelector('[data-action="play-bonus"]').addEventListener('click', () => {
      onPlay?.();
    });
  }

  async function claimBest(event) {
    const button = event.currentTarget;
    const error = container.querySelector('.contact-verify__error');
    button.disabled = true;
    button.textContent = 'SENDING COUPON…';
    error.hidden = true;
    try {
      const reward = await readResponse(await fetch('/api/game/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game }),
      }));
      renderCoupon(reward);
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
      button.disabled = false;
      button.textContent = 'SEND MY CURRENT COUPON';
    }
  }

  function renderCoupon(reward) {
    if (destroyed) return;
    const code = escapeHtml(reward.couponCode || '');
    const deliveredTo = reward.delivery?.masked || reward.contact?.masked;
    container.innerHTML = `
      <section class="game-lobby game-lobby--verification game-lobby--coupon" aria-live="polite">
        <span class="game-lobby__eyebrow">YOUR BEST RESULT</span>
        <strong class="contact-verify__discount">${Number(reward.discountPercent) || 0}% OFF</strong>
        <span class="contact-verify__best">BEST OF ${Number(reward.attemptsUsed) || 1} RUNS · RUN ${Number(reward.bestAttemptNumber) || 1}</span>
        <div class="contact-verify__coupon-code" aria-label="Coupon code ${code}">
          <span>${code.slice(0, 4)}</span><span>${code.slice(4)}</span>
        </div>
        <p>Show this code to your barista before payment. It expires at the end of today.</p>
        ${deliveredTo ? `<small>${reward.delivery?.delivered ? 'TEXTED TO' : 'SAVE THIS CODE · DELIVERY TO'} ${escapeHtml(deliveredTo)}</small>` : ''}
      </section>`;
  }

  if (initialStep === 'post-phone') renderPostPhoneStep();
  else if (initialStep === 'email') renderEmailStep();
  else renderPhoneStep();

  return {
    destroy() {
      destroyed = true;
    },
  };
}
