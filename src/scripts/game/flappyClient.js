import {
  GRAVITY,
  FLAP_VELOCITY,
  VELOCITY_CAPS,
  ROTATION,
  CHARACTER,
  CHARACTER_RADIUS_VW,
  OBSTACLE_WIDTH_VW,
  GAP,
  BASE_WORLD_SPEED_VW_PER_SEC,
  SESSION,
  FIXED_STEP_MS,
  MAX_CATCHUP_STEPS,
  filterValidFlaps,
  generateObstacleSequence,
  getDifficultyStage,
  getWorldSpeedMultiplier,
  clamp,
} from '../../shared/flappyPhysics.js';
import { computeFlappyResult } from '../../shared/flappyScoring.js';

const COLORS = {
  ink: '#211a3a',
  inkSoft: '#352653',
  skyTop: '#29204d',
  skyMid: '#5b3568',
  skyLow: '#c65d6f',
  peach: '#f58b72',
  cream: '#fff0c7',
  paper: '#f3eed8',
  paperShade: '#d6ceb0',
  gold: '#ffd166',
  mint: '#75d6b6',
  berry: '#d94f70',
  coffee: '#6d3b3b',
  coffeeLight: '#995157',
  olive: '#69724a',
  oliveDark: '#40472f',
  shadow: '#171329',
};

const VIRTUAL_WIDTH = 360;
const FINISH_CELEBRATION_MS = 1700;
const STAR_FIELD = [
  [19, 49, 2], [47, 94, 1], [72, 35, 1], [104, 68, 2], [137, 26, 1],
  [166, 106, 1], [198, 45, 2], [232, 81, 1], [267, 27, 1], [301, 61, 2],
  [338, 104, 1], [351, 34, 1], [119, 121, 1], [286, 128, 1],
];

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/**
 * Live renderer for Flying Syrnik. The server still owns the authoritative
 * replay and reward, while this loop mirrors the shared tuning constants.
 */
export function mount(container, options = {}) {
  container.innerHTML = `
    <div class="game" data-phase="loading">
      <div class="game__hud" aria-label="Flight stats">
        <span class="game__hud-chip">
          <small>ZONE</small>
          <strong data-hud="stage">TAKEOFF</strong>
        </span>
        <span class="game__score" aria-label="Gates passed">
          <small>GATES</small>
          <strong data-hud="score">00</strong>
        </span>
        <span class="game__hud-chip game__hud-chip--reward">
          <small>REWARD</small>
          <strong data-hud="discount">3%</strong>
        </span>
      </div>
      <canvas
        class="game__canvas"
        role="img"
        aria-label="Flying coffee cup game. Tap to fly through the gates."
        tabindex="0"
      ></canvas>
      <div class="game__overlay-text" data-role="prompt" aria-live="polite">
        <div class="game__start-card">
          <span class="game__eyebrow">MONOBLEND ARCADE</span>
          <strong>LOADING RUN…</strong>
        </div>
      </div>
      <div class="game__controls" aria-hidden="true">
        <span>TAP</span>
        <i>TO FLY</i>
      </div>
    </div>`;

  const game = container.querySelector('.game');
  const canvas = container.querySelector('canvas');
  const hudStage = container.querySelector('[data-hud="stage"]');
  const hudScore = container.querySelector('[data-hud="score"]');
  const hudDiscount = container.querySelector('[data-hud="discount"]');
  const prompt = container.querySelector('[data-role="prompt"]');
  const ctx = canvas.getContext('2d', { alpha: false });

  let destroyed = false;
  let phase = 'loading';
  let attempt = null;
  let sessionStartPerf = 0;
  let raf = null;
  let countdownTimer = null;
  let couponTimer = null;
  let requestController = null;
  let attemptRequestPerf = 0;

  const rawTaps = [];
  const isTrustedFlags = [];
  const pointerIds = [];
  const visibilityEvents = [];
  const activePointers = new Set();
  const validFlapTimes = [];

  let obstacles = [];
  let y = 0.5;
  let velocity = 0;
  let renderRotation = 0;
  let worldDistance = 0;
  let passedObstacles = 0;
  let cleanPasses = 0;
  let perfectPasses = 0;
  let cleanStreak = 0;
  let longestCleanStreak = 0;
  let lastTs = null;
  let accumulatorMs = 0;
  let simulatedTimeMs = 0;
  let nextValidFlapIndex = 0;

  function setPhase(nextPhase) {
    phase = nextPhase;
    game.dataset.phase = nextPhase;
  }

  function resize() {
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    if (!cssWidth || !cssHeight) return;
    canvas.width = VIRTUAL_WIDTH;
    canvas.height = clamp(Math.round(VIRTUAL_WIDTH * cssHeight / cssWidth), 480, 720);
    ctx.imageSmoothingEnabled = false;
    draw(simulatedTimeMs);
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  function onVisibilityChange() {
    if (phase !== 'playing') return;
    visibilityEvents.push({
      tMs: performance.now() - sessionStartPerf,
      state: document.visibilityState,
    });
  }
  document.addEventListener('visibilitychange', onVisibilityChange);

  async function start() {
    setPhase('loading');
    prompt.removeAttribute('data-pos');
    prompt.innerHTML = `
      <div class="game__start-card">
        <span class="game__eyebrow">MONOBLEND ARCADE</span>
        <strong>LOADING RUN…</strong>
      </div>`;

    requestController?.abort();
    requestController = new AbortController();
    attemptRequestPerf = performance.now();

    try {
      const res = await fetch('/api/game/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: 'flappy' }),
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
          <div class="game__result-card game__result-card--error">
            <span class="game__eyebrow">RUN UNAVAILABLE</span>
            <strong>${escapeHtml(body.message || 'Could not start a new attempt.')}</strong>
          </div>`;
        return;
      }
      attempt = body;
      obstacles = generateObstacleSequence(attempt.seed, attempt.maxDurationMs / 1000);
      runCountdown();
    } catch (error) {
      if (destroyed || error.name === 'AbortError') return;
      setPhase('error');
      prompt.innerHTML = `
        <div class="game__result-card game__result-card--error">
          <span class="game__eyebrow">CONNECTION LOST</span>
          <strong>CHECK YOUR SIGNAL AND TRY AGAIN</strong>
          <button type="button" class="game__pixel-button" data-role="retry">RETRY</button>
        </div>`;
      prompt.querySelector('[data-role="retry"]')?.addEventListener('click', resetAndStart);
    }
  }

  function runCountdown() {
    setPhase('countdown');
    prompt.dataset.pos = 'top';
    let n = SESSION.countdownSeconds;
    prompt.innerHTML = `<span class="game__countdown">${n}</span>`;
    raf = requestAnimationFrame(loop);

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
        setPhase('ready');
        prompt.removeAttribute('data-pos');
        prompt.innerHTML = `
          <div class="game__start-card">
            <span class="game__eyebrow">NIGHT SHIFT</span>
            <strong>TAP TO TAKE OFF</strong>
            <span class="game__start-hint">FLY THROUGH THE COFFEE GATES</span>
          </div>`;
        canvas.focus({ preventScroll: true });
      } else {
        prompt.innerHTML = `<span class="game__countdown">${n}</span>`;
      }
    }, 1000);
  }

  function recordInput(event, inputId) {
    // Inputs live on the same fixed-step timeline as the renderer and server
    // replay, so dropped display frames cannot alter the flight trajectory.
    const tMs = simulatedTimeMs;
    rawTaps.push(tMs);
    isTrustedFlags.push(event.isTrusted);
    pointerIds.push(inputId);
    return tMs;
  }

  function activate(event, inputId) {
    if (destroyed) return;
    if (phase === 'ready') {
      sessionStartPerf = performance.now();
      setPhase('playing');
      prompt.textContent = '';
      rawTaps.push(0);
      isTrustedFlags.push(event.isTrusted);
      pointerIds.push(inputId);
      validFlapTimes.push(0);
      lastTs = null;
      accumulatorMs = 0;
      simulatedTimeMs = 0;
      return;
    }
    if (phase !== 'playing') return;

    const t = recordInput(event, inputId);
    const validFlaps = filterValidFlaps(rawTaps, pointerIds);
    if (validFlaps.length > validFlapTimes.length) {
      validFlapTimes.push(validFlaps.at(-1));
    }
  }

  function onPointerDown(event) {
    event.preventDefault();
    activePointers.add(event.pointerId);
    // Browsers may allocate a new pointerId for every sequential touch.
    // Normalize single-touch play while still exposing simultaneous multi-touch.
    const inputId = activePointers.size === 1 ? 'primary' : `pointer-${event.pointerId}`;
    activate(event, inputId);
  }

  function onPointerEnd(event) {
    activePointers.delete(event.pointerId);
  }

  function onKeyDown(event) {
    if (![' ', 'ArrowUp', 'w', 'W'].includes(event.key) || event.repeat) return;
    event.preventDefault();
    activate(event, 'keyboard');
  }

  function onContextMenu(event) {
    event.preventDefault();
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerEnd);
  window.addEventListener('pointercancel', onPointerEnd);
  canvas.addEventListener('keydown', onKeyDown);
  canvas.addEventListener('contextmenu', onContextMenu);

  function movingGapCenter(obstacle, elapsedSeconds) {
    if (obstacle.type !== 'moving_fork') return obstacle.gapCenter;
    const offset = Math.sin(2 * Math.PI * obstacle.movingSpeedHz * elapsedSeconds) * obstacle.movingAmplitude;
    return clamp(obstacle.gapCenter + offset, obstacle.gapPct / 2, 1 - obstacle.gapPct / 2);
  }

  function step(simTimeMs, dt) {
    while (
      nextValidFlapIndex < validFlapTimes.length
      && validFlapTimes[nextValidFlapIndex] <= simTimeMs
    ) {
      velocity = FLAP_VELOCITY;
      nextValidFlapIndex += 1;
    }

    const stage = getDifficultyStage(passedObstacles);
    const gravity = Math.min(GRAVITY.initial * stage.speedMultiplier, GRAVITY.maximum);
    velocity += gravity * dt;
    velocity = clamp(velocity, VELOCITY_CAPS.maxRise, VELOCITY_CAPS.maxFall);
    y += velocity * dt;

    const targetRotationDeg = velocity < 0
      ? clamp((velocity / VELOCITY_CAPS.maxRise) * ROTATION.maxUpDeg, ROTATION.maxUpDeg, 0)
      : clamp((velocity / VELOCITY_CAPS.maxFall) * ROTATION.maxDownDeg, 0, ROTATION.maxDownDeg);
    renderRotation += (targetRotationDeg - renderRotation) * (1 - Math.exp(-dt / ROTATION.responseSeconds));

    if (y < 0 || y > 1) {
      return { collided: true };
    }

    const speedMultiplier = getWorldSpeedMultiplier(stage, cleanStreak);
    worldDistance += BASE_WORLD_SPEED_VW_PER_SEC * speedMultiplier * dt;
    const characterX = worldDistance;

    for (const obstacle of obstacles) {
      if (obstacle.scored && obstacle.type !== 'double_gate') continue;
      const left = obstacle.x - OBSTACLE_WIDTH_VW / 2 - CHARACTER_RADIUS_VW;
      const right = obstacle.x + OBSTACLE_WIDTH_VW / 2 + CHARACTER_RADIUS_VW;

      if (characterX >= left && characterX <= right && obstacle.type !== 'steam_pulse') {
        const center = movingGapCenter(obstacle, simTimeMs / 1000);
        const halfGap = (obstacle.gapPct / 2) * (1 + GAP.hitboxPaddingPct);
        if (y - CHARACTER_RADIUS_VW < center - halfGap || y + CHARACTER_RADIUS_VW > center + halfGap) {
          return { collided: true };
        }
      }

      if (characterX > obstacle.x + OBSTACLE_WIDTH_VW / 2 + CHARACTER_RADIUS_VW) {
        obstacle.scored = true;
        passedObstacles += 1;
        const normalizedOffset = Math.abs(y - obstacle.gapCenter) / obstacle.gapPct;
        if (normalizedOffset <= 0.1) {
          perfectPasses += 1;
          cleanPasses += 1;
          cleanStreak += 1;
        } else if (normalizedOffset <= 0.22) {
          cleanPasses += 1;
          cleanStreak += 1;
        } else {
          cleanStreak = 0;
        }
        longestCleanStreak = Math.max(longestCleanStreak, cleanStreak);
      }
    }
    return { collided: false };
  }

  function pixelRect(x, top, width, height, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(top), Math.round(width), Math.round(height));
  }

  function drawPixelSun(w, h) {
    const cx = Math.round(w * 0.76);
    const cy = Math.round(h * 0.24);
    const rows = [10, 18, 24, 28, 28, 24, 18, 10];
    rows.forEach((rowWidth, index) => {
      pixelRect(cx - rowWidth / 2, cy - 16 + index * 4, rowWidth, 4, index < 2 ? COLORS.cream : COLORS.gold);
    });
  }

  function drawCloud(x, top, color) {
    pixelRect(x + 8, top, 26, 4, color);
    pixelRect(x + 2, top + 4, 40, 6, color);
    pixelRect(x + 12, top - 4, 14, 4, color);
  }

  function drawSky(w, h, camX) {
    pixelRect(0, 0, w, h * 0.28, COLORS.skyTop);
    pixelRect(0, h * 0.28, w, h * 0.24, COLORS.skyMid);
    pixelRect(0, h * 0.52, w, h * 0.22, COLORS.skyLow);
    pixelRect(0, h * 0.74, w, h * 0.26, COLORS.peach);

    for (const [starX, starY, size] of STAR_FIELD) {
      const x = ((starX - camX * 19) % (w + 16) + w + 16) % (w + 16) - 8;
      pixelRect(x, starY, size, size, size === 2 ? COLORS.gold : COLORS.cream);
      if (size === 2) {
        pixelRect(x - 2, starY + 1, 1, 1, COLORS.cream);
        pixelRect(x + 3, starY + 1, 1, 1, COLORS.cream);
      }
    }

    drawPixelSun(w, h);
    const cloudOffset = (camX * 28) % (w + 90);
    drawCloud(w - cloudOffset, h * 0.2, '#8d5274');
    drawCloud(w * 0.28 - cloudOffset * 0.55, h * 0.36, '#b65d75');

    const mountainBase = Math.round(h * 0.78);
    const mountainOffset = Math.round((camX * 32) % 120);
    for (let x = -120 - mountainOffset; x < w + 140; x += 120) {
      pixelRect(x, mountainBase - 18, 120, h - mountainBase + 18, '#4c315e');
      pixelRect(x + 18, mountainBase - 34, 84, 16, '#4c315e');
      pixelRect(x + 34, mountainBase - 50, 52, 16, '#4c315e');
      pixelRect(x + 48, mountainBase - 62, 24, 12, '#4c315e');
    }

    const cityBase = Math.round(h * 0.92);
    const cityOffset = Math.round((camX * 62) % 88);
    for (let x = -88 - cityOffset, index = 0; x < w + 88; x += 44, index += 1) {
      const buildingHeight = 38 + (index % 3) * 13;
      pixelRect(x, cityBase - buildingHeight, 36, buildingHeight + h - cityBase, COLORS.inkSoft);
      pixelRect(x + 5, cityBase - buildingHeight + 8, 5, 5, COLORS.gold);
      pixelRect(x + 20, cityBase - buildingHeight + 20, 5, 5, index % 2 ? COLORS.mint : COLORS.berry);
    }
    pixelRect(0, cityBase, w, h - cityBase, COLORS.shadow);
    pixelRect(0, cityBase, w, 4, COLORS.mint);
  }

  function drawTower(centerX, top, bottom, width, gapEdge, type) {
    const height = bottom - top;
    if (height <= 0) return;

    const x = Math.round(centerX - width / 2);
    const towerWidth = Math.round(width);
    const outline = type === 'moving_fork' ? '#2a183d' : COLORS.ink;
    const body = type === 'moving_fork' ? '#b14375' : COLORS.coffee;
    const light = type === 'moving_fork' ? '#eb6b82' : COLORS.coffeeLight;

    pixelRect(x - 3, top, towerWidth + 6, height, outline);
    pixelRect(x, top, towerWidth, height, body);
    pixelRect(x + 4, top, 4, height, light);

    for (let row = Math.ceil(top / 14) * 14; row < bottom; row += 14) {
      pixelRect(x, row, towerWidth, 2, outline);
      const offset = (Math.floor(row / 14) % 2) * 8;
      for (let brickX = x + offset; brickX < x + towerWidth; brickX += 16) {
        pixelRect(brickX, row, 2, Math.min(14, bottom - row), outline);
      }
    }

    const capHeight = 14;
    const capTop = gapEdge === 'bottom' ? bottom - capHeight : top;
    pixelRect(x - 8, capTop - 3, towerWidth + 16, capHeight + 6, outline);
    pixelRect(x - 5, capTop, towerWidth + 10, capHeight, type === 'double_gate' ? COLORS.gold : light);
    pixelRect(x - 5, gapEdge === 'bottom' ? capTop + capHeight - 4 : capTop, towerWidth + 10, 4, COLORS.cream);
  }

  function drawSteamGate(screenX, center, halfGap, barWidth, h, simTimeMs) {
    const drift = Math.round((simTimeMs / 90) % 12);
    const cloudColor = 'rgba(255, 240, 199, 0.52)';
    const shadowColor = 'rgba(117, 214, 182, 0.35)';
    for (let i = 0; i < 5; i += 1) {
      const x = screenX - barWidth - 12 + ((i * 11 + drift) % 42);
      const yTop = center - halfGap - 12 - i * 15;
      const yBottom = center + halfGap + 6 + i * 15;
      pixelRect(x, yTop, 18, 8, cloudColor);
      pixelRect(x + 6, yTop - 5, 9, 5, shadowColor);
      pixelRect(x - 2, yBottom, 20, 8, cloudColor);
      pixelRect(x + 3, yBottom + 8, 11, 5, shadowColor);
    }
    pixelRect(screenX - 2, 0, 4, Math.max(0, center - halfGap), 'rgba(255, 209, 102, 0.25)');
    pixelRect(screenX - 2, center + halfGap, 4, Math.max(0, h - center - halfGap), 'rgba(255, 209, 102, 0.25)');
  }

  function drawObstacles(w, h, simTimeMs) {
    const cameraX = worldDistance;
    const characterOffset = CHARACTER.horizontalPositionPercent;

    for (const obstacle of obstacles) {
      // Keep the visual gate aligned with the shared world-space collision.
      const screenX = (obstacle.x - cameraX + characterOffset) * w;
      if (screenX < -70 || screenX > w + 70) continue;

      const center = movingGapCenter(obstacle, simTimeMs / 1000) * h;
      const halfGap = (obstacle.gapPct / 2) * h;
      const barWidth = Math.max(24, OBSTACLE_WIDTH_VW * w);

      if (obstacle.type === 'steam_pulse') {
        drawSteamGate(screenX, center, halfGap, barWidth, h, simTimeMs);
        continue;
      }

      drawTower(screenX, 0, Math.max(0, center - halfGap), barWidth, 'bottom', obstacle.type);
      drawTower(screenX, center + halfGap, h, barWidth, 'top', obstacle.type);

      if (obstacle.type === 'moving_fork') {
        pixelRect(screenX - 10, center - 2, 20, 4, COLORS.mint);
      }
    }
  }

  function drawCupSteam(originX, originY, rotationRad, simTimeMs, pixelSize) {
    const streams = [
      { rimOffset: -4.5, phase: 0, bend: 48, lift: 19, wave: 2.2 },
      { rimOffset: 0, phase: 0.31, bend: 58, lift: 22, wave: 2.8 },
      { rimOffset: 4.5, phase: 0.62, bend: 66, lift: 18, wave: 2.4 },
    ];
    const cycle = simTimeMs / 1200;

    for (const stream of streams) {
      // Place every strand at a separate point on the rotated cup rim.
      const streamOriginX = originX + Math.cos(rotationRad) * stream.rimOffset * pixelSize;
      const streamOriginY = originY + Math.sin(rotationRad) * stream.rimOffset * pixelSize;

      for (let i = 0; i < 8; i += 1) {
        const progress = (cycle + stream.phase + i / 8) % 1;
        const bend = progress ** 1.55;
        const sway = Math.sin(progress * Math.PI * 2 + simTimeMs / 230 + stream.phase * 5) * stream.wave;
        const x = streamOriginX - progress * 4 - bend * stream.bend + sway;
        const top = streamOriginY - progress * stream.lift;
        const size = Math.max(pixelSize, Math.round((1.7 - progress * 0.55) * pixelSize));
        const alpha = Math.max(0.28, 0.96 * (1 - progress * 0.68));

        // A darker backing pixel and a bright core make each strand read cleanly.
        const snappedX = Math.round(x / pixelSize) * pixelSize;
        const snappedY = Math.round(top / pixelSize) * pixelSize;
        pixelRect(
          snappedX - 1,
          snappedY + 1,
          size + 2,
          size + 2,
          `rgba(172, 165, 139, ${alpha * 0.58})`,
        );
        pixelRect(snappedX, snappedY, size, size, `rgba(255, 250, 229, ${alpha})`);
      }
    }
  }

  function drawCharacter(w, h, simTimeMs) {
    const x = CHARACTER.horizontalPositionPercent * w;
    const characterY = y * h;
    const scale = Math.max(2, Math.round(w / 180));
    const bob = phase === 'playing' ? 0 : Math.round(Math.sin(simTimeMs / 260) * 3);
    const p = scale;
    const steppedRotation = Math.round(renderRotation / 6) * 6;
    const rotationRad = (steppedRotation * Math.PI) / 180;

    // Steam starts at the rotated rim, then bends left against the direction
    // of flight. It stays in screen space so it never rotates with the cup.
    const rimDistance = 12 * p;
    const steamOriginX = x + Math.sin(rotationRad) * rimDistance;
    const steamOriginY = characterY + bob - Math.cos(rotationRad) * rimDistance;
    drawCupSteam(steamOriginX, steamOriginY, rotationRad, simTimeMs, p);

    ctx.save();
    ctx.translate(Math.round(x), Math.round(characterY + bob));
    ctx.rotate(rotationRad);

    // Wide rolled rim with visible coffee, matching the reference cup.
    pixelRect(-11 * p, -14 * p, 22 * p, 4 * p, COLORS.ink);
    pixelRect(-10 * p, -13 * p, 20 * p, 2 * p, COLORS.paper);
    pixelRect(-8 * p, -11 * p, 16 * p, 1 * p, COLORS.coffee);

    // Stepped trapezoid: wide at the top, narrower at the base.
    pixelRect(-9 * p, -10 * p, 18 * p, 5 * p, COLORS.ink);
    pixelRect(-8 * p, -5 * p, 16 * p, 5 * p, COLORS.ink);
    pixelRect(-7 * p, 0, 14 * p, 5 * p, COLORS.ink);
    pixelRect(-6 * p, 5 * p, 12 * p, 5 * p, COLORS.ink);

    pixelRect(-8 * p, -10 * p, 16 * p, 5 * p, COLORS.paper);
    pixelRect(-7 * p, -5 * p, 14 * p, 5 * p, COLORS.paper);
    pixelRect(-6 * p, 0, 12 * p, 5 * p, COLORS.paper);
    pixelRect(-5 * p, 5 * p, 10 * p, 4 * p, COLORS.paper);

    // Subtle paper shading keeps the cream cup dimensional.
    pixelRect(-8 * p, -9 * p, 2 * p, 4 * p, COLORS.paperShade);
    pixelRect(-7 * p, -5 * p, 2 * p, 5 * p, COLORS.paperShade);
    pixelRect(-6 * p, 0, 1 * p, 5 * p, COLORS.paperShade);
    pixelRect(5 * p, -9 * p, 2 * p, 3 * p, '#fff8e8');

    // Compact "ONE" mark above the olive coffee-bean pattern.
    ctx.fillStyle = COLORS.ink;
    ctx.font = `900 ${3 * p}px "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ONE', 0, -6.8 * p);

    // Green bean belt from the real Monoblend takeaway cup.
    pixelRect(-5 * p, -2 * p, 4 * p, 3 * p, COLORS.olive);
    pixelRect(-4 * p, -2 * p, 1 * p, 3 * p, COLORS.oliveDark);
    pixelRect(0, -2 * p, 4 * p, 3 * p, COLORS.olive);
    pixelRect(2 * p, -2 * p, 1 * p, 3 * p, COLORS.oliveDark);
    pixelRect(-4 * p, 2 * p, 4 * p, 3 * p, COLORS.oliveDark);
    pixelRect(-2 * p, 2 * p, 1 * p, 3 * p, COLORS.paperShade);
    pixelRect(1 * p, 2 * p, 4 * p, 3 * p, COLORS.olive);
    pixelRect(3 * p, 2 * p, 1 * p, 3 * p, COLORS.oliveDark);

    ctx.fillStyle = COLORS.inkSoft;
    ctx.font = `700 ${2 * p}px Arial, sans-serif`;
    ctx.fillText('mono', 0, 7.2 * p);

    // Rolled paper base.
    pixelRect(-6 * p, 9 * p, 12 * p, 2 * p, COLORS.ink);
    pixelRect(-5 * p, 9 * p, 10 * p, 1 * p, COLORS.paperShade);

    ctx.restore();
  }

  function draw(simTimeMs) {
    if (!canvas.width || !canvas.height) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.imageSmoothingEnabled = false;
    drawSky(w, h, worldDistance);
    drawObstacles(w, h, simTimeMs);
    drawCharacter(w, h, simTimeMs);

    if (phase === 'playing' && cleanStreak >= 3) {
      pixelRect(12, h - 41, 92, 24, COLORS.ink);
      ctx.fillStyle = COLORS.gold;
      ctx.font = 'bold 10px monospace';
      ctx.textBaseline = 'middle';
      ctx.fillText(`COMBO x${cleanStreak}`, 20, h - 29);
    }
  }

  function drawFireworks(elapsedMs) {
    const w = canvas.width;
    const h = canvas.height;
    const bursts = [
      { start: 0, x: 0.24, y: 0.28, color: COLORS.gold, alternate: COLORS.cream },
      { start: 280, x: 0.73, y: 0.22, color: COLORS.mint, alternate: COLORS.cream },
      { start: 560, x: 0.48, y: 0.42, color: COLORS.berry, alternate: COLORS.peach },
      { start: 900, x: 0.82, y: 0.48, color: COLORS.gold, alternate: COLORS.mint },
      { start: 1120, x: 0.18, y: 0.51, color: COLORS.peach, alternate: COLORS.cream },
    ];

    for (const burst of bursts) {
      const age = elapsedMs - burst.start;
      if (age < 0 || age > 720) continue;
      const progress = age / 720;
      const radius = 10 + progress * Math.min(w, h) * 0.17;
      const fall = progress * progress * 28;
      const particleSize = progress < 0.45 ? 4 : 3;

      for (let ray = 0; ray < 16; ray += 1) {
        const angle = (Math.PI * 2 * ray) / 16 + burst.start * 0.001;
        const color = ray % 2 ? burst.color : burst.alternate;
        for (let trail = 0; trail < 3; trail += 1) {
          const trailRadius = radius - trail * 8;
          if (trailRadius < 4) continue;
          const x = burst.x * w + Math.cos(angle) * trailRadius;
          const top = burst.y * h + Math.sin(angle) * trailRadius + fall;
          pixelRect(
            x,
            top,
            Math.max(2, particleSize - trail),
            Math.max(2, particleSize - trail),
            color,
          );
        }
      }

      if (progress < 0.18) {
        const flashSize = 14 - progress * 40;
        pixelRect(
          burst.x * w - flashSize / 2,
          burst.y * h - flashSize / 2,
          flashSize,
          flashSize,
          COLORS.cream,
        );
      }
    }
  }

  function playFinishCelebration() {
    return new Promise((resolve) => {
      const startedAt = performance.now();
      const animate = (now) => {
        if (destroyed) {
          resolve();
          return;
        }
        const elapsed = now - startedAt;
        draw(simulatedTimeMs);
        drawFireworks(elapsed);
        if (elapsed < FINISH_CELEBRATION_MS) {
          raf = requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };
      raf = requestAnimationFrame(animate);
    });
  }

  function updateHud() {
    const scoring = computeFlappyResult({ passedObstacles });
    const stage = getDifficultyStage(passedObstacles);
    hudStage.textContent = stage.label;
    hudScore.textContent = String(passedObstacles).padStart(2, '0');
    hudDiscount.textContent = `${scoring.discountPercent}%`;
  }

  function loop(ts) {
    if (destroyed || !['playing', 'ready', 'countdown'].includes(phase)) return;

    if (phase === 'ready' || phase === 'countdown') {
      simulatedTimeMs += 16;
      draw(simulatedTimeMs);
      raf = requestAnimationFrame(loop);
      return;
    }

    if (lastTs === null) lastTs = ts;
    const frameMs = Math.min(FIXED_STEP_MS * MAX_CATCHUP_STEPS, Math.max(0, ts - lastTs));
    lastTs = ts;
    accumulatorMs += frameMs;

    let outcome = { collided: false };
    let steps = 0;
    while (accumulatorMs >= FIXED_STEP_MS && steps < MAX_CATCHUP_STEPS && !outcome.collided) {
      outcome = step(simulatedTimeMs, FIXED_STEP_MS / 1000);
      simulatedTimeMs += FIXED_STEP_MS;
      accumulatorMs -= FIXED_STEP_MS;
      steps += 1;
    }

    draw(simulatedTimeMs);
    updateHud();

    const realElapsedMs = performance.now() - sessionStartPerf;
    if (outcome.collided || realElapsedMs >= attempt.maxDurationMs) {
      finish();
      return;
    }
    raf = requestAnimationFrame(loop);
  }

  async function finish() {
    if (phase !== 'playing') return;
    setPhase('celebrating');
    const scoring = computeFlappyResult({ passedObstacles });
    prompt.dataset.pos = 'top';
    prompt.innerHTML = `
      <div class="game__finish-callout">
        <span>FLIGHT COMPLETE</span>
        <strong>${passedObstacles} GATES · ${scoring.discountPercent}% OFF</strong>
      </div>`;
    navigator.vibrate?.([30, 40, 30, 80, 45]);

    const finishedClientElapsedMs = performance.now() - attemptRequestPerf;
    requestController = new AbortController();
    const resultPromise = fetch('/api/game/finish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attemptId: attempt.attemptId,
        nonce: attempt.nonce,
        taps: rawTaps,
        isTrustedFlags,
        pointerIds,
        visibilityEvents,
        // Captured before the celebration so presentation time cannot affect
        // verification of the actual run.
        clientElapsedMs: finishedClientElapsedMs,
        clientClaimedResult: { passedObstacles },
      }),
      signal: requestController.signal,
    })
      .then(async (res) => ({ result: await res.json().catch(() => ({})) }))
      .catch((error) => ({ error }));

    try {
      await playFinishCelebration();
      if (destroyed) return;
      const submission = await resultPromise;
      if (submission.error) throw submission.error;
      const result = submission.result;
      if (destroyed) return;
      setPhase('result');
      renderResult(result);
    } catch (error) {
      if (destroyed || error.name === 'AbortError') return;
      setPhase('error');
      prompt.removeAttribute('data-pos');
      prompt.innerHTML = `
        <div class="game__result-card game__result-card--error">
          <span class="game__eyebrow">CONNECTION LOST</span>
          <strong>YOUR RUN COULD NOT BE VERIFIED</strong>
        </div>`;
    }
  }

  function renderResult(result) {
    prompt.removeAttribute('data-pos');
    if (!result.valid) {
      const debug = result.debug?.triggeredRules?.length
        ? `<div class="game__debug-reason">
            <span>DEV DIAGNOSTIC · RISK ${Number(result.debug.riskScore) || 0}</span>
            <code>${result.debug.triggeredRules.map(escapeHtml).join(' · ')}</code>
          </div>`
        : '';
      prompt.innerHTML = `
        <div class="game__result-card game__result-card--error">
          <span class="game__eyebrow">RUN NOT VERIFIED</span>
          <strong>${escapeHtml(result.message || "We couldn't verify this attempt.")}</strong>
          ${debug}
          <button type="button" class="game__pixel-button" data-role="again">TRY AGAIN</button>
        </div>`;
    } else {
      const currentDiscount = Number(result.currentDiscountPercent ?? result.discountPercent) || 0;
      const bestDiscount = Number(result.bestDiscountPercent ?? result.discountPercent) || 0;
      const attemptsRemaining = Math.max(0, Number(result.attemptsRemainingToday) || 0);
      const bestAttemptNumber = Math.max(1, Number(result.bestAttemptNumber) || 1);

      if (result.contactVerificationRequired || result.emailVerificationRequired) {
        prompt.innerHTML = `
          <div class="game__result-card">
            <span class="game__eyebrow">YOUR BEST RUN IS SAVED</span>
            <strong class="game__reward">${bestDiscount}% OFF</strong>
            <button type="button" class="game__pixel-button game__pixel-button--claim" data-role="verify-contact">GET YOUR DISCOUNT COUPON</button>
          </div>`;
      } else if (result.phoneVerificationRequired) {
        prompt.innerHTML = `
          <div class="game__result-card">
            <span class="game__eyebrow">YOUR BEST RUN IS SAVED</span>
            <strong class="game__reward">${bestDiscount}% OFF</strong>
            <button type="button" class="game__pixel-button game__pixel-button--claim" data-role="verify-phone">GET YOUR DISCOUNT COUPON</button>
          </div>`;
      } else if (result.emailOfferAvailable) {
        prompt.innerHTML = `
          <div class="game__result-card">
            <span class="game__eyebrow">PHONE VERIFIED</span>
            <strong class="game__reward">${bestDiscount}% OFF</strong>
            <span class="game__result-score">ONE MORE RUN COULD WIN A BIGGER DISCOUNT</span>
            <button type="button" class="game__pixel-button game__pixel-button--claim" data-role="email-offer">CHOOSE YOUR NEXT MOVE</button>
          </div>`;
      } else if (result.isPractice) {
        prompt.innerHTML = `
          <div class="game__result-card">
            <span class="game__eyebrow">PRACTICE SCORE</span>
            <strong class="game__reward">${currentDiscount}% OFF</strong>
            <span class="game__result-score">${passedObstacles} GATES PASSED</span>
            <button type="button" class="game__pixel-button game__pixel-button--secondary" data-role="again">FLY AGAIN</button>
          </div>`;
      } else if (result.rewardToken && result.couponCode) {
        prompt.innerHTML = `
          <div class="game__result-card">
            <span class="game__eyebrow">YOUR BEST RESULT</span>
            <strong class="game__reward">${bestDiscount}% OFF</strong>
            <span class="game__result-score">BEST OF ${result.attemptsUsed} RUNS · RUN ${bestAttemptNumber}</span>
            <button type="button" class="game__pixel-button game__pixel-button--claim" data-role="claim">CLAIM DISCOUNT COUPON</button>
          </div>`;
      } else {
        const remainingLabel = attemptsRemaining === 1 ? '1 ATTEMPT LEFT' : `${attemptsRemaining} ATTEMPTS LEFT`;
        const bestLabel = result.isCurrentBest
          ? `NEW BEST · RUN ${bestAttemptNumber}`
          : `THIS RUN ${currentDiscount}% · BEST FROM RUN ${bestAttemptNumber}`;
        prompt.innerHTML = `
          <div class="game__result-card">
            <span class="game__eyebrow">YOUR BEST RESULT</span>
            <strong class="game__reward">${bestDiscount}% OFF</strong>
            <span class="game__result-score">${bestLabel}</span>
            <div class="game__result-actions">
              <button type="button" class="game__pixel-button game__pixel-button--again" data-role="again">
                <span>PLAY AGAIN</span>
                <small>${remainingLabel}</small>
              </button>
              <button type="button" class="game__pixel-button game__pixel-button--secondary" data-role="claim-now">CLAIM BEST COUPON NOW</button>
            </div>
          </div>`;
      }

      prompt.querySelector('[data-role="claim"]')?.addEventListener('click', () => showCoupon(result));
      prompt.querySelector('[data-role="claim-now"]')?.addEventListener('click', () => claimBestCoupon(result));
      prompt.querySelector('[data-role="verify-contact"]')?.addEventListener('click', () => options.onVerifyContact?.());
      prompt.querySelector('[data-role="verify-phone"]')?.addEventListener('click', () => options.onVerifyPhone?.());
      prompt.querySelector('[data-role="email-offer"]')?.addEventListener('click', () => options.onEmailOffer?.(result.contact));
    }

    prompt.querySelector('[data-role="again"]')?.addEventListener('click', resetAndStart);
  }

  async function claimBestCoupon(baseResult) {
    const buttons = prompt.querySelectorAll('button');
    buttons.forEach((button) => { button.disabled = true; });
    const claimButton = prompt.querySelector('[data-role="claim-now"]');
    if (claimButton) claimButton.textContent = 'PREPARING COUPON…';

    try {
      const res = await fetch('/api/game/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: 'flappy' }),
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
      showCoupon({
        ...baseResult,
        ...claimed,
        bestDiscountPercent: claimed.discountPercent,
      });
    } catch (error) {
      prompt.innerHTML = `
        <div class="game__result-card game__result-card--error">
          <span class="game__eyebrow">COUPON NOT READY</span>
          <strong>${escapeHtml(error.message || 'Please try again.')}</strong>
          <button type="button" class="game__pixel-button" data-role="claim-again">TRY AGAIN</button>
        </div>`;
      prompt.querySelector('[data-role="claim-again"]')?.addEventListener('click', () => claimBestCoupon(baseResult));
    }
  }

  function showCoupon(result) {
    clearInterval(couponTimer);
    const code = escapeHtml(result.couponCode);
    const bestDiscount = Number(result.bestDiscountPercent ?? result.discountPercent) || 0;
    const attemptsUsed = Math.max(1, Number(result.attemptsUsed) || 1);
    const bestAttemptNumber = Math.max(1, Number(result.bestAttemptNumber) || 1);
    prompt.innerHTML = `
      <div class="game__result-card game__coupon-card" data-clarity-mask="true">
        <span class="game__eyebrow">YOUR BEST RESULT</span>
        <strong class="game__reward">${bestDiscount}% OFF</strong>
        <span class="game__result-score">BEST OF ${attemptsUsed} RUNS · RUN ${bestAttemptNumber}</span>
        <span class="game__coupon-note">SHOW THIS CODE TO YOUR BARISTA BEFORE PAYMENT</span>
        <div class="game__coupon-code" aria-label="Coupon code">${code.slice(0, 4)} <span>${code.slice(4)}</span></div>
        <div class="game__coupon-meta">
          <span>EXPIRES IN</span>
          <strong data-role="coupon-time">20:00</strong>
        </div>
        <p class="game__coupon-help">Staff will verify the code at the counter. It cannot be used again after redemption.</p>
        <button type="button" class="game__pixel-button game__pixel-button--secondary" data-role="close-coupon">DONE</button>
      </div>`;

    let statusCheckTick = 0;
    const updateCoupon = async () => {
      const remainingMs = Number(result.couponExpiresAt) - Date.now();
      const timeEl = prompt.querySelector('[data-role="coupon-time"]');
      if (!timeEl) {
        clearInterval(couponTimer);
        return;
      }
      if (remainingMs <= 0) {
        clearInterval(couponTimer);
        timeEl.textContent = '00:00';
        prompt.querySelector('.game__coupon-card')?.classList.add('is-expired');
        return;
      }
      const totalSeconds = Math.ceil(remainingMs / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = String(totalSeconds % 60).padStart(2, '0');
      timeEl.textContent = `${minutes}:${seconds}`;

      statusCheckTick += 1;
      if (statusCheckTick % 3 !== 0) return;
      try {
        const res = await fetch('/api/coupon/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: result.rewardToken }),
        });
        const status = await res.json();
        if (status.status === 'redeemed') {
          clearInterval(couponTimer);
          prompt.innerHTML = `
            <div class="game__result-card game__coupon-card is-redeemed" data-clarity-mask="true">
              <span class="game__eyebrow">COUPON REDEEMED</span>
              <strong class="game__reward">${bestDiscount}% OFF</strong>
              <span class="game__coupon-note">DISCOUNT APPLIED TO THE ORDER</span>
              <button type="button" class="game__pixel-button game__pixel-button--secondary" data-role="again">FLY AGAIN</button>
            </div>`;
          prompt.querySelector('[data-role="again"]')?.addEventListener('click', resetAndStart);
        }
      } catch {
        // The visible countdown still works offline; staff verification stays authoritative.
      }
    };

    updateCoupon();
    couponTimer = setInterval(updateCoupon, 1000);
    prompt.querySelector('[data-role="close-coupon"]')?.addEventListener('click', () => {
      clearInterval(couponTimer);
      closeCouponToResult(result);
    });
  }

  function closeCouponToResult(result) {
    const bestDiscount = Number(result.bestDiscountPercent ?? result.discountPercent) || 0;
    const attemptsUsed = Math.max(1, Number(result.attemptsUsed) || 1);
    const bestAttemptNumber = Math.max(1, Number(result.bestAttemptNumber) || 1);
    prompt.innerHTML = `
      <div class="game__result-card">
        <span class="game__eyebrow">YOUR BEST RESULT</span>
        <strong class="game__reward">${bestDiscount}% OFF</strong>
        <span class="game__result-score">BEST OF ${attemptsUsed} RUNS · RUN ${bestAttemptNumber}</span>
        <span class="game__result-score">CODE ${escapeHtml(result.couponCode.slice(0, 4))} ${escapeHtml(result.couponCode.slice(4))}</span>
        <div class="game__result-actions">
          <button type="button" class="game__pixel-button game__pixel-button--claim" data-role="claim">SHOW COUPON</button>
          <button type="button" class="game__pixel-button game__pixel-button--secondary" data-role="again">FLY AGAIN</button>
        </div>
      </div>`;
    prompt.querySelector('[data-role="claim"]')?.addEventListener('click', () => showCoupon(result));
    prompt.querySelector('[data-role="again"]')?.addEventListener('click', resetAndStart);
  }

  function resetAndStart() {
    clearInterval(countdownTimer);
    clearInterval(couponTimer);
    countdownTimer = null;
    if (raf) cancelAnimationFrame(raf);
    obstacles = [];
    y = 0.5;
    velocity = 0;
    renderRotation = 0;
    worldDistance = 0;
    passedObstacles = 0;
    cleanPasses = 0;
    perfectPasses = 0;
    cleanStreak = 0;
    longestCleanStreak = 0;
    rawTaps.length = 0;
    isTrustedFlags.length = 0;
    pointerIds.length = 0;
    validFlapTimes.length = 0;
    visibilityEvents.length = 0;
    activePointers.clear();
    lastTs = null;
    accumulatorMs = 0;
    simulatedTimeMs = 0;
    nextValidFlapIndex = 0;
    hudStage.textContent = 'TAKEOFF';
    hudScore.textContent = '00';
    hudDiscount.textContent = '3%';
    start();
  }

  resize();
  start();

  return {
    destroy() {
      destroyed = true;
      clearInterval(countdownTimer);
      clearInterval(couponTimer);
      requestController?.abort();
      if (raf) cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
    },
  };
}
