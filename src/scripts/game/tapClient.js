import {
  SESSION,
  filterValidTaps,
  computeTapSeries,
} from '../../shared/tapPhysics.js';
import { computeTapProgress } from '../../shared/tapProgress.js';
import { mountCouponQr } from '../couponQr.js';

const MAX_PRESSURE_BAR = 12;
const IDEAL_PRESSURE_MIN = 8.5;
const IDEAL_PRESSURE_MAX = 9.7;
const MIN_FINISH_SEQUENCE_MS = 1450;
const RESULT_ACTION_GUARD_MS = 450;
const IMPACT_POOL_SIZE = 12;
const ANALYSIS_INTERVAL_MS = 1000 / 30;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function pressureStatus(pressure, elapsedMs) {
  if (elapsedMs < SESSION.warmupDurationMs) return 'PRE-INFUSION';
  if (pressure < 5.5) return 'BUILD PRESSURE';
  if (pressure < IDEAL_PRESSURE_MIN) return 'ALMOST DIALED IN';
  if (pressure <= IDEAL_PRESSURE_MAX) return 'SWEET SPOT · HOLD IT';
  if (pressure <= 10.7) return 'HIGH PRESSURE';
  return 'REDLINE · FIND RHYTHM';
}

export function mount(container, options = {}) {
  const panel = container.closest('.overlay__panel--game');
  panel?.classList.add('overlay__panel--tap');

  container.innerHTML = `
    <div class="tapgame" data-phase="loading" data-pressure="low">
      <div class="tapgame__machine">
        <header class="tapgame__header">
          <div>
            <span class="tapgame__brand">MONOBLEND</span>
            <span class="tapgame__model">SHOT LAB · 01</span>
          </div>
          <span class="tapgame__power"><i></i> READY</span>
        </header>

        <div class="tapgame__readouts" aria-label="Shot statistics">
          <div class="tapgame__readout">
            <small>SHOT TIME</small>
            <strong data-role="time">6.0</strong>
            <span>SEC</span>
          </div>
          <div class="tapgame__readout tapgame__readout--discount">
            <small>YOUR DISCOUNT</small>
            <strong data-role="discount">3</strong>
            <span>% OFF</span>
          </div>
          <div class="tapgame__readout">
            <small>INPUT</small>
            <strong data-role="tap-count">00</strong>
            <span>TAPS</span>
          </div>
        </div>

        <section class="tapgame__instrument">
          <div class="tapgame__gauge-wrap">
            <canvas
              class="tapgame__gauge"
              role="img"
              aria-label="Espresso pressure gauge from zero to twelve bar"
            ></canvas>
            <span class="tapgame__gauge-glass" aria-hidden="true"></span>
          </div>
          <div class="tapgame__pressure-state">
            <span class="tapgame__pressure-light"></span>
            <strong data-role="zone">BUILD PRESSURE</strong>
          </div>
          <div class="tapgame__rhythm">
            <small>RHYTHM</small>
            <span class="tapgame__rhythm-lights" aria-hidden="true">
              <i></i><i></i><i></i><i></i><i></i>
            </span>
            <strong data-role="combo">x00</strong>
          </div>
        </section>

        <div class="tapgame__brew-stage" aria-hidden="true">
          <div class="tapgame__group">
            <span></span><span></span><span></span>
          </div>
          <div class="tapgame__portafilter"></div>
          <div class="tapgame__streams"><i></i><i></i></div>
          <div class="tapgame__cup">
            <div class="tapgame__coffee"><i></i></div>
            <span class="tapgame__cup-handle"></span>
          </div>
          <div class="tapgame__scale">
            <span>DOSE 18.0g</span>
            <span data-role="yield">0.0g OUT</span>
          </div>
        </div>

        <div class="tapgame__control-deck">
          <button class="tapgame__brew-button" type="button" data-role="target" aria-label="Tap rapidly to build espresso pressure">
            <span class="tapgame__button-ring"></span>
            <span class="tapgame__button-face">
              <small>TAP TO BUILD</small>
              <strong>PRESSURE</strong>
              <i>SPACE / TAP</i>
            </span>
          </button>
          <div class="tapgame__feedback" data-role="feedback" aria-live="polite"></div>
        </div>
      </div>

      <div class="tapgame__overlay" data-role="prompt" aria-live="polite">
        <div class="tapgame__intro-card">
          <span>MONOBLEND SHOT CHALLENGE</span>
          <strong>LOADING MACHINE…</strong>
        </div>
      </div>
    </div>`;

  const game = container.querySelector('.tapgame');
  const canvas = container.querySelector('canvas');
  const prompt = container.querySelector('[data-role="prompt"]');
  const target = container.querySelector('[data-role="target"]');
  const zoneEl = container.querySelector('[data-role="zone"]');
  const timeEl = container.querySelector('[data-role="time"]');
  const discountEl = container.querySelector('[data-role="discount"]');
  const tapCountEl = container.querySelector('[data-role="tap-count"]');
  const comboEl = container.querySelector('[data-role="combo"]');
  const yieldEl = container.querySelector('[data-role="yield"]');
  const feedbackEl = container.querySelector('[data-role="feedback"]');
  const rhythmLights = [...container.querySelectorAll('.tapgame__rhythm-lights i')];
  const ctx = canvas.getContext('2d');

  let destroyed = false;
  let phase = 'loading';
  let attempt = null;
  let sessionStartPerf = 0;
  let raf = null;
  let countdownTimer = null;
  let pressTimer = null;
  let resultActionTimer = null;
  let requestController = null;
  let displayedPressure = 0;
  let latestPressure = 0;
  let visualCombo = 0;
  let lastTapMs = null;
  let bestCombo = 0;
  let lastAnalysisFrame = -Infinity;
  let latestProgress = null;

  const rawTaps = [];
  const isTrustedFlags = [];
  const pointerIds = [];
  const pressDurationsMs = [];
  const visibilityEvents = [];
  const pointerDownAt = new Map();
  const activePointers = new Set();
  const activeImpacts = new Set();
  const impactCleanupTimers = new Map();
  const reduceMotionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const impactPool = Array.from({ length: IMPACT_POOL_SIZE }, () => {
    const impact = document.createElement('span');
    impact.className = 'tapgame__impact';
    impact.textContent = '+1';
    impact.setAttribute('aria-hidden', 'true');
    game.append(impact);
    return impact;
  });

  function removeImpact(impact) {
    clearTimeout(impactCleanupTimers.get(impact));
    impactCleanupTimers.delete(impact);
    activeImpacts.delete(impact);
    impact.classList.remove('is-active');
  }

  function clearImpacts() {
    [...activeImpacts].forEach(removeImpact);
  }

  function setPhase(nextPhase) {
    if (nextPhase !== 'playing') clearImpacts();
    phase = nextPhase;
    game.dataset.phase = nextPhase;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawGauge(latestPressure);
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  function onVisibilityChange() {
    if (phase !== 'playing') return;
    visibilityEvents.push({
      tMs: performance.now() - sessionStartPerf,
      state: document.visibilityState,
    });
    if (document.hidden) {
      if (raf) cancelAnimationFrame(raf);
      setPhase('settling');
      game.classList.remove('is-flowing');
      target.blur();
      finish({ interrupted: true });
    }
  }
  document.addEventListener('visibilitychange', onVisibilityChange);

  async function start() {
    setPhase('loading');
    prompt.innerHTML = `
      <div class="tapgame__intro-card">
        <span>MONOBLEND SHOT CHALLENGE</span>
        <strong>HEATING MACHINE…</strong>
      </div>`;

    requestController?.abort();
    requestController = new AbortController();

    try {
      const res = await fetch('/api/game/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: 'tap' }),
        signal: requestController.signal,
      });
      const body = await res.json().catch(() => ({}));
      if (destroyed) return;
      if (!res.ok) {
        if (
          (body.error === 'email_verification_required' || body.error === 'contact_verification_required')
          && options.onVerifyContact
        ) {
          options.onVerifyContact();
          return;
        }
        if (body.error === 'phone_verification_required' && options.onVerifyPhone) {
          options.onVerifyPhone();
          return;
        }
        if (body.error === 'email_verification_or_claim_required' && options.onEmailOffer) {
          options.onEmailOffer();
          return;
        }
        setPhase('error');
        prompt.innerHTML = `
          <div class="tapgame__result-card tapgame__result-card--error">
            <span>RUN UNAVAILABLE</span>
            <strong>${escapeHtml(body.message || 'Could not start a new attempt.')}</strong>
          </div>`;
        return;
      }
      attempt = body;
      runCountdown();
    } catch (error) {
      if (destroyed || error.name === 'AbortError') return;
      setPhase('error');
      prompt.innerHTML = `
        <div class="tapgame__result-card tapgame__result-card--error">
          <span>CONNECTION LOST</span>
          <strong>CHECK YOUR SIGNAL</strong>
          <button type="button" class="tapgame__result-button" data-role="retry">TRY AGAIN</button>
        </div>`;
      prompt.querySelector('[data-role="retry"]')?.addEventListener('click', resetAndStart);
    }
  }

  function runCountdown() {
    setPhase('countdown');
    let n = SESSION.countdownSeconds;
    prompt.innerHTML = `
      <div class="tapgame__countdown">
        <small>EXTRACTION STARTS IN</small>
        <strong>${n}</strong>
      </div>`;

    clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      if (destroyed) {
        clearInterval(countdownTimer);
        return;
      }
      n -= 1;
      if (n <= 0) {
        clearInterval(countdownTimer);
        countdownTimer = null;
        beginPlay();
      } else {
        prompt.querySelector('strong').textContent = String(n);
      }
    }, 1000);
  }

  function beginPlay() {
    setPhase('playing');
    prompt.textContent = '';
    sessionStartPerf = performance.now();
    feedbackEl.textContent = 'GO · FIND 9 BAR';
    target.focus({ preventScroll: true });
    raf = requestAnimationFrame(loop);
  }

  function updateCombo(tMs) {
    if (lastTapMs === null || (tMs - lastTapMs >= 80 && tMs - lastTapMs <= 260)) {
      visualCombo += 1;
    } else if (tMs - lastTapMs > 260) {
      visualCombo = 1;
    }
    lastTapMs = tMs;
    bestCombo = Math.max(bestCombo, visualCombo);
    const nextCombo = `x${String(visualCombo).padStart(2, '0')}`;
    if (comboEl.textContent !== nextCombo) comboEl.textContent = nextCombo;

    if (visualCombo > 0 && visualCombo % 10 === 0) {
      feedbackEl.textContent = visualCombo >= 30 ? 'BARISTA MODE' : `${visualCombo} TAP STREAK`;
      navigator.vibrate?.(12);
    }
  }

  function spawnImpact(clientX, clientY) {
    if (reduceMotionQuery?.matches) return;
    const rect = game.getBoundingClientRect();
    const impact = impactPool.find((candidate) => !activeImpacts.has(candidate));
    if (!impact) return;
    impact.style.left = `${clamp(clientX - rect.left, 28, rect.width - 28)}px`;
    impact.style.top = `${clamp(clientY - rect.top, 28, rect.height - 28)}px`;
    activeImpacts.add(impact);
    impact.classList.add('is-active');
    const cleanup = () => removeImpact(impact);
    impact.addEventListener('animationend', cleanup, { once: true });
    impact.addEventListener('animationcancel', cleanup, { once: true });
    impactCleanupTimers.set(impact, setTimeout(cleanup, 700));
  }

  function animateButton() {
    target.classList.add('is-pressed');
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => target.classList.remove('is-pressed'), 60);
  }

  function recordTap(event, inputId, clientX, clientY) {
    if (phase !== 'playing') return;
    const tMs = performance.now() - sessionStartPerf;
    rawTaps.push(tMs);
    isTrustedFlags.push(event.isTrusted);
    pointerIds.push(inputId);
    updateCombo(tMs);
    animateButton();
    spawnImpact(clientX, clientY);
  }

  function onPointerDown(event) {
    if (phase !== 'playing') return;
    event.preventDefault();
    activePointers.add(event.pointerId);
    const inputId = activePointers.size === 1 ? 'primary' : `pointer-${event.pointerId}`;
    const tMs = performance.now() - sessionStartPerf;
    pointerDownAt.set(event.pointerId, tMs);
    recordTap(event, inputId, event.clientX, event.clientY);
  }

  function onPointerEnd(event) {
    activePointers.delete(event.pointerId);
    const downAt = pointerDownAt.get(event.pointerId);
    if (downAt !== undefined) {
      if (phase === 'playing') {
        pressDurationsMs.push(performance.now() - sessionStartPerf - downAt);
      }
      pointerDownAt.delete(event.pointerId);
    }
  }

  function onKeyDown(event) {
    if (![' ', 'Enter'].includes(event.key) || event.repeat || phase !== 'playing') return;
    event.preventDefault();
    const rect = target.getBoundingClientRect();
    recordTap(event, 'keyboard', rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  function onContextMenu(event) {
    event.preventDefault();
  }

  target.addEventListener('pointerdown', onPointerDown);
  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('pointerup', onPointerEnd);
  window.addEventListener('pointercancel', onPointerEnd);

  function gaugeAngle(value) {
    const start = (145 * Math.PI) / 180;
    const sweep = (250 * Math.PI) / 180;
    return start + (clamp(value, 0, MAX_PRESSURE_BAR) / MAX_PRESSURE_BAR) * sweep;
  }

  function drawGauge(pressure) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    if (!w || !h) return;
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(w, h) / 2 - 8;

    ctx.clearRect(0, 0, w, h);

    const bezel = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    bezel.addColorStop(0, '#f5f4ef');
    bezel.addColorStop(0.45, '#8e9290');
    bezel.addColorStop(0.72, '#353938');
    bezel.addColorStop(1, '#111413');
    ctx.fillStyle = bezel;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0e1110';
    ctx.beginPath();
    ctx.arc(cx, cy, r - 10, 0, Math.PI * 2);
    ctx.fill();

    const dial = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.26, 2, cx, cy, r - 12);
    dial.addColorStop(0, '#fbfaf1');
    dial.addColorStop(0.75, '#e5e0d1');
    dial.addColorStop(1, '#b7b1a4');
    ctx.fillStyle = dial;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 15, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineCap = 'butt';
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#467b62';
    ctx.beginPath();
    ctx.arc(cx, cy, r - 27, gaugeAngle(IDEAL_PRESSURE_MIN), gaugeAngle(IDEAL_PRESSURE_MAX));
    ctx.stroke();
    ctx.strokeStyle = '#9f3b31';
    ctx.beginPath();
    ctx.arc(cx, cy, r - 27, gaugeAngle(10.7), gaugeAngle(12));
    ctx.stroke();

    for (let value = 0; value <= 12; value += 0.5) {
      const angle = gaugeAngle(value);
      const major = Number.isInteger(value);
      const outer = r - 23;
      const inner = outer - (major ? 13 : 7);
      ctx.strokeStyle = '#252724';
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      ctx.stroke();

      if (major && value % 3 === 0) {
        const labelRadius = inner - 11;
        ctx.fillStyle = '#292b28';
        ctx.font = `800 ${Math.max(9, Math.round(r * 0.09))}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          String(value),
          cx + Math.cos(angle) * labelRadius,
          cy + Math.sin(angle) * labelRadius,
        );
      }
    }

    ctx.fillStyle = '#353832';
    ctx.textAlign = 'center';
    ctx.font = `900 ${Math.max(13, Math.round(r * 0.15))}px Georgia, serif`;
    ctx.fillText('bar', cx, cy + r * 0.5);

    displayedPressure += (pressure - displayedPressure) * 0.22;
    const needleAngle = gaugeAngle(displayedPressure);
    const needleLength = r - 40;

    ctx.save();
    ctx.translate(2, 3);
    ctx.strokeStyle = 'rgba(0,0,0,.3)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(needleAngle) * 12, cy - Math.sin(needleAngle) * 12);
    ctx.lineTo(cx + Math.cos(needleAngle) * needleLength, cy + Math.sin(needleAngle) * needleLength);
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = '#b8382e';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(needleAngle) * 12, cy - Math.sin(needleAngle) * 12);
    ctx.lineTo(cx + Math.cos(needleAngle) * needleLength, cy + Math.sin(needleAngle) * needleLength);
    ctx.stroke();

    const hub = ctx.createRadialGradient(cx - 3, cy - 3, 1, cx, cy, 11);
    hub.addColorStop(0, '#f0eee7');
    hub.addColorStop(0.5, '#777b79');
    hub.addColorStop(1, '#1b1e1c');
    ctx.fillStyle = hub;
    ctx.beginPath();
    ctx.arc(cx, cy, 11, 0, Math.PI * 2);
    ctx.fill();
  }

  function updateMachine(elapsedMs, pressure, metrics) {
    const remaining = Math.max(0, attempt.maxDurationMs - elapsedMs);
    const nextTime = (remaining / 1000).toFixed(1);
    const nextTapCount = String(rawTaps.length).padStart(2, '0');
    const nextZone = pressureStatus(pressure, elapsedMs);
    if (timeEl.textContent !== nextTime) timeEl.textContent = nextTime;
    if (tapCountEl.textContent !== nextTapCount) tapCountEl.textContent = nextTapCount;
    if (zoneEl.textContent !== nextZone) zoneEl.textContent = nextZone;

    const pressureBand = pressure < 5.5
      ? 'low'
      : pressure < IDEAL_PRESSURE_MIN
        ? 'building'
        : pressure <= IDEAL_PRESSURE_MAX
          ? 'ideal'
          : 'high';
    if (game.dataset.pressure !== pressureBand) game.dataset.pressure = pressureBand;

    const rhythmCount = rawTaps.length < 3 ? 0 : Math.round(metrics.rhythmStabilityScore * rhythmLights.length);
    rhythmLights.forEach((light, index) => light.classList.toggle('is-on', index < rhythmCount));

    const progress = clamp(elapsedMs / attempt.maxDurationMs, 0, 1);
    const flow = clamp((pressure - 2.8) / 6.2, 0, 1);
    const fill = clamp(progress * (0.38 + flow * 0.62), 0, 0.92);
    game.style.setProperty('--flow', flow.toFixed(2));
    game.style.setProperty('--cup-fill', fill.toFixed(2));
    game.classList.toggle('is-flowing', phase === 'playing' && flow > 0.08);
    const nextYield = `${(36 * fill).toFixed(1)}g OUT`;
    if (yieldEl.textContent !== nextYield) yieldEl.textContent = nextYield;
  }

  function loop(frameTime) {
    if (destroyed || phase !== 'playing') return;
    const elapsedMs = performance.now() - sessionStartPerf;
    const activeElapsed = Math.min(elapsedMs, attempt.maxDurationMs);
    if (!latestProgress || frameTime - lastAnalysisFrame >= ANALYSIS_INTERVAL_MS) {
      const { validTaps } = filterValidTaps(rawTaps);
      const series = computeTapSeries(validTaps, activeElapsed);
      latestPressure = series.at(-1)?.smoothedTps ?? 0;
      latestProgress = computeTapProgress({
        tapTimestampsMs: rawTaps,
        durationMs: activeElapsed,
      });
      lastAnalysisFrame = frameTime;
      const nextDiscount = String(latestProgress.scoring.discountPercent);
      if (discountEl.textContent !== nextDiscount) discountEl.textContent = nextDiscount;
      updateMachine(elapsedMs, latestPressure, latestProgress.metrics);
      drawGauge(latestPressure);
    }

    if (elapsedMs >= attempt.maxDurationMs) {
      setPhase('settling');
      game.classList.remove('is-flowing');
      target.blur();
      finish();
      return;
    }
    raf = requestAnimationFrame(loop);
  }

  async function finish({ interrupted = false } = {}) {
    const finishSequenceStartedAt = performance.now();
    feedbackEl.textContent = '';
    prompt.innerHTML = `
      <div class="tapgame__finish-card">
        <span>${interrupted ? 'SCREEN LEFT · SCORE LOCKED' : 'EXTRACTION COMPLETE'}</span>
        <div class="tapgame__finish-seal" aria-hidden="true">
          <i></i>
        </div>
        <strong>LOCKING YOUR SCORE</strong>
        <small>PLEASE LIFT YOUR FINGER</small>
      </div>`;

    requestController = new AbortController();
    try {
      const res = await fetch('/api/game/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          attemptId: attempt.attemptId,
          nonce: attempt.nonce,
          taps: rawTaps,
          isTrustedFlags,
          pointerIds,
          pressDurationsMs,
          visibilityEvents,
          clientElapsedMs: performance.now() - sessionStartPerf,
        }),
        signal: requestController.signal,
      });
      const result = await res.json().catch(() => ({}));
      const remainingSequenceMs = interrupted ? 0 : Math.max(
        0,
        MIN_FINISH_SEQUENCE_MS - (performance.now() - finishSequenceStartedAt),
      );
      if (remainingSequenceMs) {
        await new Promise((resolve) => setTimeout(resolve, remainingSequenceMs));
      }
      if (destroyed) return;
      setPhase('result');
      renderResult(result);
    } catch (error) {
      if (destroyed || error.name === 'AbortError') return;
      setPhase('error');
      prompt.innerHTML = `
        <div class="tapgame__result-card tapgame__result-card--error">
          <span>CONNECTION LOST</span>
          <strong>YOUR SHOT COULD NOT BE VERIFIED</strong>
        </div>`;
    }
  }

  function renderResult(result) {
    clearTimeout(resultActionTimer);
    if (!result.valid) {
      prompt.innerHTML = `
        <div class="tapgame__result-card tapgame__result-card--error">
          <span>SHOT NOT VERIFIED</span>
          <strong>${escapeHtml(result.message || "We couldn't verify this attempt.")}</strong>
          <div class="tapgame__result-actions">
            <button type="button" class="tapgame__result-button" data-role="again">PULL ANOTHER SHOT</button>
          </div>
        </div>`;
    } else {
      const averagePressure = Number(result.session?.averageScoringTps || 0);
      const rhythm = Math.round(Number(result.session?.rhythmStabilityScore || 0) * 100);
      const currentDiscount = Number(result.currentDiscountPercent ?? result.discountPercent) || 0;
      const bestDiscount = Number(result.bestDiscountPercent ?? result.discountPercent) || 0;
      const attemptsRemaining = Math.max(0, Number(result.attemptsRemainingToday) || 0);
      const bestAttemptNumber = Math.max(1, Number(result.bestAttemptNumber) || 1);
      latestPressure = averagePressure;
      drawGauge(latestPressure);
      navigator.vibrate?.([18, 45, 28]);

      if (result.contactVerificationRequired || result.emailVerificationRequired) {
        prompt.innerHTML = `
          <div class="tapgame__result-card">
            <span>YOUR BEST SHOT IS SAVED</span>
            <strong class="tapgame__result-reward">${bestDiscount}% OFF</strong>
            <div class="tapgame__result-actions">
              <button type="button" class="tapgame__result-button" data-role="verify-contact">GET YOUR DISCOUNT COUPON</button>
            </div>
          </div>`;
      } else if (result.phoneVerificationRequired) {
        prompt.innerHTML = `
          <div class="tapgame__result-card">
            <span>YOUR BEST SHOT IS SAVED</span>
            <strong class="tapgame__result-reward">${bestDiscount}% OFF</strong>
            <div class="tapgame__result-actions">
              <button type="button" class="tapgame__result-button" data-role="verify-phone">GET YOUR DISCOUNT COUPON</button>
            </div>
          </div>`;
      } else if (result.emailOfferAvailable) {
        prompt.innerHTML = `
          <div class="tapgame__result-card">
            <span>PHONE VERIFIED</span>
            <strong class="tapgame__result-reward">${bestDiscount}% OFF</strong>
            <div class="tapgame__token">ONE MORE SHOT COULD WIN A BIGGER DISCOUNT</div>
            <div class="tapgame__result-actions">
              <button type="button" class="tapgame__result-button" data-role="email-offer">CHOOSE YOUR NEXT MOVE</button>
            </div>
          </div>`;
      } else if (result.isPractice) {
        prompt.innerHTML = `
          <div class="tapgame__result-card">
            <span>PRACTICE SHOT</span>
            <strong class="tapgame__result-reward">${currentDiscount}% OFF</strong>
            <div class="tapgame__result-metrics">
              <span><b>${averagePressure.toFixed(1)}</b> AVG BAR</span>
              <span><b>${rhythm}%</b> RHYTHM</span>
              <span><b>${bestCombo}</b> BEST STREAK</span>
            </div>
            <div class="tapgame__result-actions">
              <button type="button" class="tapgame__result-button" data-role="again">PULL ANOTHER SHOT</button>
            </div>
          </div>`;
      } else if (result.rewardToken && result.couponCode) {
        prompt.innerHTML = `
          <div class="tapgame__result-card">
            <span>YOUR BEST RESULT</span>
            <strong class="tapgame__result-reward">${bestDiscount}% OFF</strong>
            <div class="tapgame__token">BEST OF ${result.attemptsUsed} SHOTS · SHOT ${bestAttemptNumber}</div>
            <div class="tapgame__result-actions">
              <button type="button" class="tapgame__result-button" data-role="show-coupon">CLAIM DISCOUNT COUPON</button>
            </div>
          </div>`;
      } else {
        const remainingLabel = attemptsRemaining === 1 ? '1 ATTEMPT LEFT' : `${attemptsRemaining} ATTEMPTS LEFT`;
        const bestLabel = result.isCurrentBest
          ? `NEW BEST · SHOT ${bestAttemptNumber}`
          : `THIS SHOT ${currentDiscount}% · BEST FROM SHOT ${bestAttemptNumber}`;
        prompt.innerHTML = `
          <div class="tapgame__result-card">
            <span>YOUR BEST RESULT</span>
            <strong class="tapgame__result-reward">${bestDiscount}% OFF</strong>
            <div class="tapgame__token">${bestLabel}</div>
            <div class="tapgame__result-actions">
              <button type="button" class="tapgame__result-button tapgame__result-button--again" data-role="again">
                <span>PLAY AGAIN</span>
                <small>${remainingLabel}</small>
              </button>
              <button type="button" class="tapgame__result-button" data-role="claim-now">CLAIM BEST COUPON NOW</button>
            </div>
          </div>`;
      }

      prompt.querySelector('[data-role="show-coupon"]')?.addEventListener('click', () => showTapCoupon(result));
      prompt.querySelector('[data-role="claim-now"]')?.addEventListener('click', () => claimBestTapCoupon(result));
      prompt.querySelector('[data-role="verify-contact"]')?.addEventListener('click', () => options.onVerifyContact?.());
      prompt.querySelector('[data-role="verify-phone"]')?.addEventListener('click', () => options.onVerifyPhone?.());
      prompt.querySelector('[data-role="email-offer"]')?.addEventListener('click', () => options.onEmailOffer?.(result.contact));
    }

    prompt.querySelector('[data-role="again"]')?.addEventListener('click', resetAndStart);
    const actions = prompt.querySelector('.tapgame__result-actions');
    if (actions) {
      actions.inert = true;
      resultActionTimer = setTimeout(() => {
        if (destroyed || !actions.isConnected) return;
        actions.inert = false;
        actions.classList.add('is-ready');
      }, RESULT_ACTION_GUARD_MS);
    }
  }

  async function claimBestTapCoupon(baseResult) {
    const buttons = prompt.querySelectorAll('button');
    buttons.forEach((button) => { button.disabled = true; });
    const claimButton = prompt.querySelector('[data-role="claim-now"]');
    if (claimButton) claimButton.textContent = 'PREPARING COUPON…';

    try {
      const res = await fetch('/api/game/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: 'tap' }),
      });
      const claimed = await res.json().catch(() => ({}));
      if (
        (claimed.error === 'email_verification_required' || claimed.error === 'contact_verification_required')
        && options.onVerifyContact
      ) {
        options.onVerifyContact();
        return;
      }
      if (claimed.error === 'phone_verification_required' && options.onVerifyPhone) {
        options.onVerifyPhone();
        return;
      }
      if (!res.ok || !claimed.valid) throw new Error(claimed.message || 'Could not prepare your coupon.');
      showTapCoupon({
        ...baseResult,
        ...claimed,
        bestDiscountPercent: claimed.discountPercent,
      });
    } catch (error) {
      prompt.innerHTML = `
        <div class="tapgame__result-card tapgame__result-card--error">
          <span>COUPON NOT READY</span>
          <strong>${escapeHtml(error.message || 'Please try again.')}</strong>
          <button type="button" class="tapgame__result-button" data-role="claim-again">TRY AGAIN</button>
        </div>`;
      prompt.querySelector('[data-role="claim-again"]')?.addEventListener('click', () => claimBestTapCoupon(baseResult));
    }
  }

  function showTapCoupon(result) {
    const bestDiscount = Number(result.bestDiscountPercent ?? result.discountPercent) || 0;
    const attemptsUsed = Math.max(1, Number(result.attemptsUsed) || 1);
    const bestAttemptNumber = Math.max(1, Number(result.bestAttemptNumber) || 1);
    const code = escapeHtml(result.couponCode);
    prompt.innerHTML = `
      <div class="tapgame__result-card">
        <span>YOUR BEST RESULT</span>
        <strong class="tapgame__result-reward">${bestDiscount}% OFF</strong>
        <div class="tapgame__token">
          BEST OF ${attemptsUsed} SHOTS · SHOT ${bestAttemptNumber}
        </div>
        <div class="tapgame__coupon-code" aria-label="Coupon code ${code}" data-clarity-mask="true">
          <span>${code.slice(0, 4)}</span>
          <span>${code.slice(4)}</span>
        </div>
        <div class="coupon-qr coupon-qr--tap" data-role="coupon-qr"><span>PREPARING QR…</span></div>
        <small class="tapgame__coupon-note">SHOW THIS CODE TO YOUR BARISTA</small>
        <button type="button" class="tapgame__result-button" data-role="done">DONE</button>
      </div>`;
    mountCouponQr(prompt, result.couponCode);
    prompt.querySelector('[data-role="done"]')?.addEventListener('click', () => renderResult({
      ...result,
      rewardToken: result.rewardToken,
      couponCode: result.couponCode,
    }));
  }

  function resetAndStart() {
    clearInterval(countdownTimer);
    clearTimeout(pressTimer);
    clearTimeout(resultActionTimer);
    if (raf) cancelAnimationFrame(raf);
    rawTaps.length = 0;
    isTrustedFlags.length = 0;
    pointerIds.length = 0;
    pressDurationsMs.length = 0;
    visibilityEvents.length = 0;
    pointerDownAt.clear();
    activePointers.clear();
    clearImpacts();
    displayedPressure = 0;
    latestPressure = 0;
    visualCombo = 0;
    lastTapMs = null;
    bestCombo = 0;
    lastAnalysisFrame = -Infinity;
    latestProgress = null;
    comboEl.textContent = 'x00';
    tapCountEl.textContent = '00';
    discountEl.textContent = '3';
    game.style.setProperty('--flow', '0');
    game.style.setProperty('--cup-fill', '0');
    game.classList.remove('is-flowing');
    rhythmLights.forEach((light) => light.classList.remove('is-on'));
    drawGauge(0);
    start();
  }

  resize();
  drawGauge(0);
  start();

  return {
    destroy() {
      destroyed = true;
      clearInterval(countdownTimer);
      clearTimeout(pressTimer);
      clearTimeout(resultActionTimer);
      requestController?.abort();
      if (raf) cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      target.removeEventListener('pointerdown', onPointerDown);
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
      clearImpacts();
      impactPool.forEach((impact) => impact.remove());
      panel?.classList.remove('overlay__panel--tap');
    },
  };
}
