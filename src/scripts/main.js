import { renderMenu } from './menu.js';

const isCouponDesk = new URLSearchParams(location.search).get('mode') === 'redeem';

if (isCouponDesk) {
  import('./couponRedeem.js').then(({ mountCouponDesk }) => {
    mountCouponDesk(document.body);
  });
} else {
  document.getElementById('year').textContent = String(new Date().getFullYear());

  function readCookie(name) {
    const match = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(document.cookie);
    return match ? decodeURIComponent(match[1]) : null;
  }

  const menuOverlay = document.getElementById('menu-overlay');
  const gameOverlay = document.getElementById('game-overlay');
  const menuContent = document.getElementById('menu-content');
  const gameRoot = document.getElementById('game-root');
  const socialViewport = document.querySelector('.social-gallery__viewport');
  const socialTrack = document.querySelector('.social-gallery__track');
  const socialVideos = document.querySelectorAll('.social-gallery video');
  const socialCards = document.querySelectorAll('.social-gallery__card');

  let activeGame = null;

  if (socialViewport && socialVideos.length) {
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
      root: socialViewport,
      rootMargin: '0px 18%',
      threshold: 0.01,
    });

    socialVideos.forEach((video) => videoObserver.observe(video));
  }

  if (socialViewport && socialTrack && socialCards.length) {
    let arcFrame = 0;

    const drawSocialArc = () => {
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
      arcFrame = requestAnimationFrame(drawSocialArc);
    };

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
    if (overlay === gameOverlay && activeGame) {
      activeGame.destroy?.();
      activeGame = null;
      gameRoot.innerHTML = '';
    }
  }

  function resolveVariant() {
    // ?variant=flappy|tap forces (and persists) a variant — lets a visitor or
    // tester deliberately switch games without clearing cookies by hand. The
    // A/B assignment is otherwise sticky by design (same visitor should keep
    // seeing the same game), so this is the intended escape hatch, not a bug.
    const override = new URLSearchParams(location.search).get('variant');
    if (override === 'flappy' || override === 'tap') {
      document.cookie = `mb_variant=${override}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
      return override;
    }
    return readCookie('mb_variant') || 'flappy';
  }

  async function openGame() {
    openOverlay(gameOverlay);
    if (activeGame) return;

    const variant = resolveVariant();
    gameRoot.innerHTML = '<p class="menu__item-desc">Loading…</p>';

    try {
      const module = variant === 'tap'
        ? await import('./game/tapClient.js')
        : await import('./game/flappyClient.js');
      gameRoot.innerHTML = '';
      activeGame = module.mount(gameRoot);
    } catch (err) {
      gameRoot.innerHTML = '<p class="menu__item-desc">Could not load the game — please try again.</p>';
      console.error(err);
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
