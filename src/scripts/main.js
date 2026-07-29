import { renderMenu } from './menu.js';

const isCouponDesk = new URLSearchParams(location.search).get('mode') === 'redeem';

if (isCouponDesk) {
  import('./couponRedeem.js').then(({ mountCouponDesk }) => {
    mountCouponDesk(document.body);
  });
} else {
  document.getElementById('year').textContent = String(new Date().getFullYear());

  const menuOverlay = document.getElementById('menu-overlay');
  const gameOverlay = document.getElementById('game-overlay');
  const menuContent = document.getElementById('menu-content');
  const gameRoot = document.getElementById('game-root');
  const socialViewport = document.querySelector('.social-gallery__viewport');
  const socialScroller = document.querySelector('.social-gallery__scroller');
  const socialTrack = document.querySelector('.social-gallery__track');
  const socialVideos = document.querySelectorAll('.social-gallery video');
  const socialCards = document.querySelectorAll('.social-gallery__card');

  let activeGame = null;
  let gameLobbyController = null;

  if (socialScroller && socialVideos.length) {
    const videoObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const video = entry.target;
        if (entry.isIntersecting) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      });
    }, {
      root: socialScroller,
      rootMargin: '0px 18%',
      threshold: 0.01,
    });

    socialVideos.forEach((video) => videoObserver.observe(video));
  }

  if (socialViewport && socialScroller && socialTrack && socialCards.length) {
    let arcFrame = 0;
    let previousFrameTime = 0;
    let autoScrollPausedUntil = 0;
    let dragStartX = 0;
    let dragStartScrollLeft = 0;
    let draggedDistance = 0;
    let isMouseDragging = false;
    const firstSet = socialTrack.querySelector('.social-gallery__set');
    const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const loopDurationMs = prefersReducedMotion ? 120000 : 52800;

    const pauseAutoScroll = (durationMs = 1800) => {
      autoScrollPausedUntil = performance.now() + durationMs;
    };

    const drawSocialArc = (frameTime) => {
      const elapsedMs = previousFrameTime
        ? Math.min(50, frameTime - previousFrameTime)
        : 0;
      previousFrameTime = frameTime;

      const loopWidth = firstSet?.offsetWidth || 0;
      if (loopWidth && frameTime >= autoScrollPausedUntil) {
        socialScroller.scrollLeft += (loopWidth / loopDurationMs) * elapsedMs;
        if (socialScroller.scrollLeft >= loopWidth) {
          socialScroller.scrollLeft -= loopWidth;
        }
      }

      const viewportRect = socialViewport.getBoundingClientRect();
      const trackRect = socialTrack.getBoundingClientRect();
      const viewportCenter = viewportRect.width / 2;
      const trackOffset = trackRect.left - viewportRect.left;

      socialCards.forEach((card) => {
        const setOffset = card.parentElement.offsetLeft;
        const cardCenter = trackOffset + setOffset + card.offsetLeft + (card.offsetWidth / 2);
        const normalized = (cardCenter - viewportCenter) / (viewportRect.width * 0.55);
        const clamped = Math.max(-1.15, Math.min(1.15, normalized));
        const distance = Math.min(1, Math.abs(clamped));
        const curve = distance ** 1.75;
        const y = 44 * curve;
        const rotation = 7.5 * clamped;
        const scale = 1.055 - (0.11 * curve);

        card.style.setProperty('--arc-y', `${y.toFixed(2)}px`);
        card.style.setProperty('--arc-rotation', `${rotation.toFixed(2)}deg`);
        card.style.setProperty('--arc-scale', scale.toFixed(3));
        card.style.setProperty('--arc-saturation', (1 - (0.13 * curve)).toFixed(3));
        card.style.setProperty('--arc-brightness', (1 - (0.06 * curve)).toFixed(3));
        card.style.setProperty('--arc-shadow-y', `${(15 + (9 * curve)).toFixed(2)}px`);
        card.style.setProperty('--arc-shadow-blur', `${(30 + (9 * curve)).toFixed(2)}px`);
        card.style.zIndex = String(20 - Math.round(distance * 10));
      });

      arcFrame = requestAnimationFrame(drawSocialArc);
    };

    const startSocialArc = () => {
      cancelAnimationFrame(arcFrame);
      previousFrameTime = 0;
      arcFrame = requestAnimationFrame(drawSocialArc);
    };

    socialScroller.addEventListener('touchstart', () => pauseAutoScroll(), { passive: true });
    socialScroller.addEventListener('wheel', () => pauseAutoScroll(), { passive: true });
    socialScroller.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      pauseAutoScroll();
      socialScroller.scrollBy({
        left: event.key === 'ArrowRight' ? socialScroller.clientWidth * 0.7 : -socialScroller.clientWidth * 0.7,
        behavior: 'smooth',
      });
    });

    socialScroller.addEventListener('pointerdown', (event) => {
      pauseAutoScroll();
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      isMouseDragging = true;
      draggedDistance = 0;
      dragStartX = event.clientX;
      dragStartScrollLeft = socialScroller.scrollLeft;
      socialScroller.classList.add('is-dragging');
      socialScroller.setPointerCapture(event.pointerId);
    });

    socialScroller.addEventListener('pointermove', (event) => {
      if (!isMouseDragging) return;
      const delta = event.clientX - dragStartX;
      draggedDistance = Math.max(draggedDistance, Math.abs(delta));
      socialScroller.scrollLeft = dragStartScrollLeft - delta;
      pauseAutoScroll();
    });

    const stopMouseDrag = (event) => {
      if (!isMouseDragging) return;
      isMouseDragging = false;
      socialScroller.classList.remove('is-dragging');
      if (socialScroller.hasPointerCapture(event.pointerId)) {
        socialScroller.releasePointerCapture(event.pointerId);
      }
      pauseAutoScroll();
    };

    socialScroller.addEventListener('pointerup', stopMouseDrag);
    socialScroller.addEventListener('pointercancel', stopMouseDrag);
    socialScroller.addEventListener('click', (event) => {
      if (draggedDistance <= 6) return;
      event.preventDefault();
      event.stopPropagation();
      draggedDistance = 0;
    }, true);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        cancelAnimationFrame(arcFrame);
      } else {
        startSocialArc();
      }
    });

    startSocialArc();
  }

  function openOverlay(overlay) {
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeOverlay(overlay) {
    overlay.hidden = true;
    if (menuOverlay.hidden && gameOverlay.hidden) {
      document.body.style.overflow = '';
    }
    if (overlay === gameOverlay) {
      gameLobbyController?.abort();
      gameLobbyController = null;
      activeGame?.destroy?.();
      activeGame = null;
      gameRoot.innerHTML = '';
    }
  }

  async function mountSelectedGame(game) {
    if (game !== 'flappy' && game !== 'tap') return;

    gameRoot.innerHTML = `
      <section class="game-lobby game-lobby--loading" aria-live="polite">
        <span class="game-lobby__eyebrow">MONOBLEND ARCADE</span>
        <strong>LOADING YOUR GAME…</strong>
      </section>`;

    try {
      const module = game === 'tap'
        ? await import('./game/tapClient.js')
        : await import('./game/flappyClient.js');
      gameRoot.innerHTML = '';
      activeGame = module.mount(gameRoot);
    } catch (err) {
      gameRoot.innerHTML = `
        <section class="game-lobby game-lobby--message" role="alert">
          <span class="game-lobby__eyebrow">CONNECTION LOST</span>
          <strong>COULD NOT LOAD THE GAME</strong>
          <span>Please close this screen and try again.</span>
        </section>`;
      console.error(err);
    }
  }

  function showDailyComplete() {
    gameRoot.innerHTML = `
      <section class="game-lobby game-lobby--message" aria-live="polite">
        <span class="game-lobby__eyebrow">TODAY'S SET IS COMPLETE</span>
        <strong>COME BACK TOMORROW</strong>
        <span>You used all 3 attempts. A fresh game choice unlocks tomorrow.</span>
      </section>`;
  }

  function showGameChoice() {
    gameRoot.innerHTML = `
      <section class="game-lobby">
        <header class="game-lobby__header">
          <span class="game-lobby__eyebrow">MONOBLEND ARCADE</span>
          <strong>CHOOSE YOUR GAME</strong>
          <span>Pick carefully: one game, 3 attempts, locked for today.</span>
        </header>
        <div class="game-lobby__choices">
          <button class="game-choice game-choice--flappy" type="button" data-game-choice="flappy">
            <span class="game-choice__number">01</span>
            <span class="game-choice__tag">FLIGHT</span>
            <strong>FLY THE CUP</strong>
            <span>Tap through the coffee gates and keep your streak alive.</span>
            <b>CHOOSE FLAPPY →</b>
          </button>
          <button class="game-choice game-choice--tap" type="button" data-game-choice="tap">
            <span class="game-choice__number">02</span>
            <span class="game-choice__tag">PRESSURE</span>
            <strong>FIND 9 BAR</strong>
            <span>Build pressure with a steady rhythm and stop on target.</span>
            <b>CHOOSE TAP →</b>
          </button>
        </div>
        <p class="game-lobby__rule">YOUR BEST VERIFIED RUN SETS THE DISCOUNT</p>
      </section>`;

    gameRoot.querySelectorAll('[data-game-choice]').forEach((button) => {
      button.addEventListener('click', () => {
        gameRoot.querySelectorAll('[data-game-choice]').forEach((choice) => {
          choice.disabled = true;
        });
        mountSelectedGame(button.dataset.gameChoice);
      });
    });
  }

  async function openGame() {
    openOverlay(gameOverlay);
    if (activeGame || gameLobbyController) return;

    gameRoot.innerHTML = `
      <section class="game-lobby game-lobby--loading" aria-live="polite">
        <span class="game-lobby__eyebrow">MONOBLEND ARCADE</span>
        <strong>CHECKING TODAY'S RUNS…</strong>
      </section>`;

    const controller = new AbortController();
    gameLobbyController = controller;
    try {
      const response = await fetch('/api/game/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });
      const status = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(status.message || 'Could not check today’s attempts.');
      if (status.exhausted) {
        showDailyComplete();
      } else if (status.selectedGame === 'flappy' || status.selectedGame === 'tap') {
        await mountSelectedGame(status.selectedGame);
      } else {
        showGameChoice();
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      gameRoot.innerHTML = `
        <section class="game-lobby game-lobby--message" role="alert">
          <span class="game-lobby__eyebrow">ARCADE UNAVAILABLE</span>
          <strong>PLEASE TRY AGAIN</strong>
          <span>We could not check today's attempts.</span>
        </section>`;
      console.error(err);
    } finally {
      if (gameLobbyController === controller) gameLobbyController = null;
    }
  }

  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'open-menu') {
      renderMenu(menuContent);
      openOverlay(menuOverlay);
    } else if (action === 'open-game') {
      openGame();
    } else if (action === 'close-overlay') {
      closeOverlay(event.target.closest('.overlay'));
    } else if (event.target.classList.contains('overlay')) {
      closeOverlay(event.target);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!gameOverlay.hidden) closeOverlay(gameOverlay);
    else if (!menuOverlay.hidden) closeOverlay(menuOverlay);
  });
}
