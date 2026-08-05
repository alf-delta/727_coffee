import { createIcons, MapPin } from 'lucide';
import { inject } from '@vercel/analytics';
import { renderMenu } from './menu.js';
import { renderLegalDocument } from './legal.js';
import { mountContactVerification } from './verification.js';
import { initClarityConsent } from './clarity.js';
import { mountCouponQr } from './couponQr.js';
import { LEGAL_VERSION } from '../shared/legal.js';

createIcons({ icons: { MapPin } });

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[char]);
}

const checkerPath = location.pathname.replace(/\/+$/, '') || '/';
const isCouponDesk = checkerPath === '/checker'
  || new URLSearchParams(location.search).get('mode') === 'redeem';

if (!isCouponDesk) {
  inject();
  initClarityConsent();
}

if (isCouponDesk) {
  import('./couponRedeem.js').then(({ mountCouponDesk }) => {
    mountCouponDesk(document.body);
  });
} else {
  document.getElementById('year').textContent = String(new Date().getFullYear());

  const menuOverlay = document.getElementById('menu-overlay');
  const gameOverlay = document.getElementById('game-overlay');
  const legalOverlay = document.getElementById('legal-overlay');
  const menuContent = document.getElementById('menu-content');
  const gameRoot = document.getElementById('game-root');
  const legalContent = document.getElementById('legal-content');
  const homePage = document.querySelector('.page');
  const socialGallery = document.querySelector('.social-gallery');
  const socialViewport = document.querySelector('.social-gallery__viewport');
  const socialScroller = document.querySelector('.social-gallery__scroller');
  const socialTrack = document.querySelector('.social-gallery__track');
  const backToTopButton = document.querySelector('[data-action="back-to-top"]');
  const storyThread = document.querySelector('.thread');
  const storyFirstChapter = storyThread?.querySelector('.thread__chapter');
  const storyRevealElements = Array.from(document.querySelectorAll('[data-thread-reveal]'));
  const storyFrames = Array.from(document.querySelectorAll('.thread__frame'));

  const socialVideos = Array.from(document.querySelectorAll('.social-gallery video'));
  const socialCards = Array.from(document.querySelectorAll('.social-gallery__card'));
  const visibleSocialVideos = new Set();
  const socialVideoVisibility = new Map();
  const socialVideoReleaseTimers = new Map();
  let socialGalleryPaused = true;
  let socialGalleryInView = false;
  let overlayBlockingSocialGallery = false;
  let socialArcFrame = 0;
  let startSocialArc = () => {};

  let activeGame = null;
  let gameLobbyController = null;

  const loadAndPlaySocialVideo = (video) => {
    const releaseTimer = socialVideoReleaseTimers.get(video);
    if (releaseTimer) {
      clearTimeout(releaseTimer);
      socialVideoReleaseTimers.delete(video);
    }
    if (!video.getAttribute('src')) {
      const source = video.dataset.src;
      if (!source) return;
      video.setAttribute('src', source);
      video.load();
    }
    if (!socialGalleryPaused && visibleSocialVideos.has(video)) {
      video.play().catch(() => {});
    }
  };

  const scheduleSocialVideoRelease = (video) => {
    video.pause();
    if (socialVideoReleaseTimers.has(video)) return;
    const timer = window.setTimeout(() => {
      socialVideoReleaseTimers.delete(video);
      if (visibleSocialVideos.has(video) || !video.getAttribute('src')) return;
      video.removeAttribute('src');
      video.load();
    }, 3500);
    socialVideoReleaseTimers.set(video, timer);
  };

  const syncVisibleSocialVideos = () => {
    const nextVisible = new Set(
      [...socialVideoVisibility.entries()]
        .filter(([, ratio]) => ratio > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([video]) => video),
    );

    socialVideos.forEach((video) => {
      if (nextVisible.has(video)) {
        visibleSocialVideos.add(video);
        loadAndPlaySocialVideo(video);
      } else {
        visibleSocialVideos.delete(video);
        scheduleSocialVideoRelease(video);
      }
    });
  };

  const setSocialGalleryPaused = (paused) => {
    if (socialGalleryPaused === paused) return;
    socialGalleryPaused = paused;
    if (paused) {
      cancelAnimationFrame(socialArcFrame);
      socialArcFrame = 0;
      socialVideos.forEach((video) => video.pause());
      return;
    }

    visibleSocialVideos.forEach(loadAndPlaySocialVideo);
    startSocialArc();
  };

  const syncSocialGalleryState = () => {
    setSocialGalleryPaused(
      document.hidden || overlayBlockingSocialGallery || !socialGalleryInView,
    );
  };

  if (socialScroller && socialVideos.length) {
    if ('IntersectionObserver' in window) {
      const videoObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          const video = entry.target;
          socialVideoVisibility.set(video, entry.isIntersecting ? entry.intersectionRatio : 0);
        });
        syncVisibleSocialVideos();
      }, {
        root: socialScroller,
        rootMargin: '0px',
        threshold: [0, 0.01, 0.35, 0.65, 0.95],
      });

      socialVideos.forEach((video) => videoObserver.observe(video));
    } else {
      socialVideos.slice(0, 3).forEach((video) => {
        visibleSocialVideos.add(video);
        loadAndPlaySocialVideo(video);
      });
    }
  }

  if (socialViewport && socialScroller && socialTrack && socialCards.length) {
    const visibleSocialCards = new Set();
    let previousFrameTime = 0;
    let autoScrollPausedUntil = 0;
    let dragStartX = 0;
    let dragStartScrollLeft = 0;
    let draggedDistance = 0;
    let isMouseDragging = false;
    let loopPositionReady = false;
    let autoScrollPosition = socialScroller.scrollLeft;
    let cardGeometry = new WeakMap();
    const firstSet = socialTrack.querySelector('.social-gallery__set');
    const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const loopDurationMs = 42240;

    if ('IntersectionObserver' in window) {
      const cardObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) visibleSocialCards.add(entry.target);
          else visibleSocialCards.delete(entry.target);
        });
        startSocialArc();
      }, {
        root: socialScroller,
        rootMargin: '0px 35%',
        threshold: 0,
      });
      socialCards.forEach((card) => cardObserver.observe(card));
    } else {
      socialCards.forEach((card) => visibleSocialCards.add(card));
    }

    const pauseAutoScroll = (durationMs = 1800) => {
      autoScrollPausedUntil = performance.now() + durationMs;
    };

    const normalizeLoopPosition = (loopWidth) => {
      if (!loopWidth) return;
      if (!loopPositionReady) {
        socialScroller.scrollLeft = loopWidth;
        autoScrollPosition = loopWidth;
        loopPositionReady = true;
        return;
      }

      let shift = 0;
      if (socialScroller.scrollLeft < loopWidth * 0.15) {
        shift = loopWidth;
      } else if (socialScroller.scrollLeft >= loopWidth * 1.15) {
        shift = -loopWidth;
      }

      if (!shift) return;
      autoScrollPosition += shift;
      socialScroller.scrollLeft = autoScrollPosition;
      if (isMouseDragging) dragStartScrollLeft += shift;
    };

    const drawSocialArc = (frameTime) => {
      socialArcFrame = 0;
      if (socialGalleryPaused) return;

      const elapsedMs = previousFrameTime
        ? Math.min(1000, frameTime - previousFrameTime)
        : 0;
      previousFrameTime = frameTime;

      const loopWidth = firstSet?.offsetWidth || 0;
      normalizeLoopPosition(loopWidth);
      if (!prefersReducedMotion && loopWidth && frameTime >= autoScrollPausedUntil) {
        autoScrollPosition += (loopWidth / loopDurationMs) * elapsedMs;
        socialScroller.scrollLeft = autoScrollPosition;
        normalizeLoopPosition(loopWidth);
      } else {
        autoScrollPosition = socialScroller.scrollLeft;
      }

      const viewportWidth = socialScroller.clientWidth;
      const viewportCenter = viewportWidth / 2;

      visibleSocialCards.forEach((card) => {
        let geometry = cardGeometry.get(card);
        if (!geometry) {
          geometry = {
            left: card.parentElement.offsetLeft + card.offsetLeft,
            width: card.offsetWidth,
            height: card.offsetHeight,
          };
          cardGeometry.set(card, geometry);
        }
        const cardCenter = geometry.left - socialScroller.scrollLeft + (geometry.width / 2);
        const normalized = (cardCenter - viewportCenter) / (viewportWidth * 0.55);
        const clamped = Math.max(-1.15, Math.min(1.15, normalized));
        const distance = Math.min(1, Math.abs(clamped));
        const curve = distance ** 1.75;
        const arcDepth = Math.min(44, geometry.height * 0.16);
        const y = arcDepth * curve;
        const rotation = 7.5 * clamped;
        const scale = 1.055 - (0.11 * curve);

        card.style.setProperty('--arc-y', `${y.toFixed(2)}px`);
        card.style.setProperty('--arc-rotation', `${rotation.toFixed(2)}deg`);
        card.style.setProperty('--arc-scale', scale.toFixed(3));
        card.style.zIndex = String(20 - Math.round(distance * 10));
      });

      if (!prefersReducedMotion) {
        socialArcFrame = requestAnimationFrame(drawSocialArc);
      }
    };

    startSocialArc = () => {
      if (socialGalleryPaused) return;
      cancelAnimationFrame(socialArcFrame);
      previousFrameTime = 0;
      socialArcFrame = requestAnimationFrame(drawSocialArc);
    };

    socialScroller.addEventListener('scroll', () => {
      if (prefersReducedMotion) startSocialArc();
    }, { passive: true });
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

    window.addEventListener('resize', () => {
      cardGeometry = new WeakMap();
      loopPositionReady = false;
      startSocialArc();
    }, { passive: true });
  }

  if (socialGallery && 'IntersectionObserver' in window) {
    const socialSectionObserver = new IntersectionObserver(([entry]) => {
      socialGalleryInView = Boolean(entry?.isIntersecting);
      syncSocialGalleryState();
    }, { rootMargin: '15% 0px', threshold: 0 });
    socialSectionObserver.observe(socialGallery);
  } else {
    socialGalleryInView = true;
    syncSocialGalleryState();
  }

  if (storyThread && homePage) {
    const STORY_COVER_TRIGGER_VIEWPORT_RATIO = 0.18;
    let storyCoverFrame = 0;

    const syncStoryCoverState = () => {
      storyCoverFrame = 0;
      const storyTop = storyThread.getBoundingClientRect().top;
      const coverTrigger = window.innerHeight * STORY_COVER_TRIGGER_VIEWPORT_RATIO;
      homePage.classList.toggle('is-covered', storyTop <= coverTrigger);
    };

    const requestStoryCoverSync = () => {
      if (!storyCoverFrame) storyCoverFrame = requestAnimationFrame(syncStoryCoverState);
    };

    window.addEventListener('scroll', requestStoryCoverSync, { passive: true });
    window.addEventListener('resize', requestStoryCoverSync, { passive: true });
    syncStoryCoverState();
  }

  const prefersReducedStoryMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (storyThread && homePage) {
    const mobileStoryEntryQuery = matchMedia('(max-width: 600px)');
    const STORY_ENTRY_SWIPE_THRESHOLD_PX = 96;
    const STORY_ENTRY_DIRECTION_LOCK_PX = 10;
    const STORY_ENTRY_HOLD_MS = 50;
    let storyEntryTracking = false;
    let storyEntryDirection = null;
    let storyEntryStartX = 0;
    let storyEntryStartY = 0;
    let storyEntryAnimationFrame = 0;
    let storyEntryHoldUntil = 0;
    let storyEntryHoldTimer = 0;
    let storyEntryArmFrame = 0;
    let storyEntryLockedY = null;
    let storyEntryActiveTouches = 0;
    let storyEntryPhase = mobileStoryEntryQuery.matches && window.scrollY <= 8
      ? 'armed'
      : 'released';

    const syncStoryEntryArmed = () => {
      storyEntryArmFrame = 0;
      if (!mobileStoryEntryQuery.matches) {
        storyEntryPhase = 'released';
      } else if (storyEntryPhase === 'released' && window.scrollY <= 2) {
        storyEntryPhase = 'armed';
      }
      document.documentElement.classList.toggle('story-entry-armed', storyEntryPhase === 'armed');
    };

    const requestStoryEntryArmSync = () => {
      if (!storyEntryArmFrame) storyEntryArmFrame = requestAnimationFrame(syncStoryEntryArmed);
    };

    const releaseStoryEntryHold = () => {
      if (storyEntryHoldTimer) clearTimeout(storyEntryHoldTimer);
      const restoreY = storyEntryLockedY;
      storyEntryLockedY = null;
      storyEntryHoldUntil = 0;
      storyEntryHoldTimer = 0;
      storyEntryPhase = 'released';
      document.documentElement.classList.remove('story-entry-holding');
      if (restoreY !== null) window.scrollTo(0, restoreY);
      requestStoryEntryArmSync();
    };

    const releaseStoryEntryWhenReady = () => {
      const remainingMs = storyEntryHoldUntil - performance.now();
      if (remainingMs > 0 || storyEntryActiveTouches > 0) {
        storyEntryHoldTimer = window.setTimeout(
          releaseStoryEntryWhenReady,
          Math.max(32, remainingMs),
        );
        return;
      }
      releaseStoryEntryHold();
    };

    const startStoryEntryHold = (targetY) => {
      clearTimeout(storyEntryHoldTimer);
      storyEntryPhase = 'holding';
      storyEntryLockedY = targetY;
      storyEntryHoldUntil = performance.now() + STORY_ENTRY_HOLD_MS;
      window.scrollTo(0, targetY);
      document.documentElement.classList.add('story-entry-holding');
      storyEntryHoldTimer = window.setTimeout(releaseStoryEntryWhenReady, STORY_ENTRY_HOLD_MS);
    };

    const isStoryEntryHolding = () => {
      if (storyEntryPhase !== 'holding') return false;
      if (performance.now() >= storyEntryHoldUntil && storyEntryActiveTouches === 0) {
        releaseStoryEntryHold();
        return false;
      }
      return true;
    };

    const finishStoryEntryAnimation = (targetY) => {
      storyEntryAnimationFrame = 0;
      document.documentElement.classList.remove('story-entry-running');
      startStoryEntryHold(targetY);
    };

    const animateToStoryPreview = () => {
      if (storyEntryPhase !== 'armed') return;
      storyEntryPhase = 'animating';
      cancelAnimationFrame(storyEntryAnimationFrame);
      document.documentElement.classList.remove('story-entry-armed');
      const startY = window.scrollY;
      const entryViewportBottom = window.visualViewport
        ? window.visualViewport.height + window.visualViewport.offsetTop
        : window.innerHeight;
      const dividerPageY = window.scrollY + storyFirstChapter.getBoundingClientRect().top;
      const targetY = Math.max(0, dividerPageY - entryViewportBottom);

      if (prefersReducedStoryMotion || targetY <= startY) {
        window.scrollTo(0, targetY);
        finishStoryEntryAnimation(targetY);
        return;
      }

      const startedAt = performance.now();
      const durationMs = 780;
      document.documentElement.classList.add('story-entry-running');

      const drawStoryEntry = (frameTime) => {
        const progress = Math.min(1, (frameTime - startedAt) / durationMs);
        const easedProgress = 1 - ((1 - progress) ** 4);
        window.scrollTo(0, startY + ((targetY - startY) * easedProgress));

        if (progress < 1) {
          storyEntryAnimationFrame = requestAnimationFrame(drawStoryEntry);
        } else {
          window.scrollTo(0, targetY);
          finishStoryEntryAnimation(targetY);
        }
      };

      storyEntryAnimationFrame = requestAnimationFrame(drawStoryEntry);
    };

    document.addEventListener('touchstart', (event) => {
      storyEntryActiveTouches = event.touches.length;
      const touch = event.touches[0];
      storyEntryTracking = Boolean(
        touch
        && event.touches.length === 1
        && mobileStoryEntryQuery.matches
        && storyEntryPhase === 'armed',
      );
      storyEntryDirection = null;
      if (!storyEntryTracking) return;
      storyEntryStartX = touch.clientX;
      storyEntryStartY = touch.clientY;
    }, { passive: true });

    document.addEventListener('touchmove', (event) => {
      if (storyEntryAnimationFrame || isStoryEntryHolding()) {
        if (event.cancelable) event.preventDefault();
        return;
      }
      if (!storyEntryTracking || event.touches.length !== 1) return;

      const touch = event.touches[0];
      const deltaX = storyEntryStartX - touch.clientX;
      const deltaY = storyEntryStartY - touch.clientY;
      const absoluteX = Math.abs(deltaX);
      const absoluteY = Math.abs(deltaY);

      if (!storyEntryDirection && Math.max(absoluteX, absoluteY) >= STORY_ENTRY_DIRECTION_LOCK_PX) {
        storyEntryDirection = absoluteX > absoluteY ? 'horizontal' : 'vertical';
      }

      if (storyEntryDirection === 'horizontal') {
        storyEntryTracking = false;
        return;
      }
      if (storyEntryDirection !== 'vertical') return;

      if (event.cancelable) event.preventDefault();
      if (deltaY < 0 || deltaY < STORY_ENTRY_SWIPE_THRESHOLD_PX) return;

      storyEntryTracking = false;
      animateToStoryPreview();
    }, { passive: false });

    const stopStoryEntryTracking = (event) => {
      storyEntryActiveTouches = event.touches.length;
      storyEntryTracking = false;
      storyEntryDirection = null;
      if (
        storyEntryPhase === 'holding'
        && performance.now() >= storyEntryHoldUntil
        && storyEntryActiveTouches === 0
      ) {
        releaseStoryEntryHold();
      }
    };

    document.addEventListener('touchend', stopStoryEntryTracking, { passive: true });
    document.addEventListener('touchcancel', stopStoryEntryTracking, { passive: true });
    document.addEventListener('wheel', (event) => {
      if (isStoryEntryHolding() && event.cancelable) event.preventDefault();
    }, { passive: false });
    window.addEventListener('scroll', () => {
      if (storyEntryPhase === 'armed' && window.scrollY > 4) {
        animateToStoryPreview();
        return;
      }
      requestStoryEntryArmSync();
    }, { passive: true });
    window.addEventListener('resize', requestStoryEntryArmSync, { passive: true });
    mobileStoryEntryQuery.addEventListener?.('change', requestStoryEntryArmSync);
    syncStoryEntryArmed();
  }

  if (storyThread && !prefersReducedStoryMotion && 'IntersectionObserver' in window) {
    storyThread.classList.add('thread--motion-ready');

    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      });
    }, {
      rootMargin: '0px 0px -10% 0px',
      threshold: 0.08,
    });

    storyRevealElements.forEach((element) => revealObserver.observe(element));

    if (matchMedia('(min-width: 601px)').matches) {
      const visibleStoryFrames = new Set();
      let storyMotionFrame = 0;

      const drawStoryParallax = () => {
        storyMotionFrame = 0;
        const viewportCenter = window.innerHeight / 2;

        visibleStoryFrames.forEach((frame) => {
          const rect = frame.getBoundingClientRect();
          const frameCenter = rect.top + (rect.height / 2);
          const normalized = Math.max(-1, Math.min(1, (frameCenter - viewportCenter) / window.innerHeight));
          frame.style.setProperty('--thread-shift', `${(-normalized * 12).toFixed(2)}px`);
        });
      };

      const requestStoryParallax = () => {
        if (!storyMotionFrame) storyMotionFrame = requestAnimationFrame(drawStoryParallax);
      };

      const frameObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          entry.target.classList.toggle('is-parallax-active', entry.isIntersecting);
          if (entry.isIntersecting) {
            visibleStoryFrames.add(entry.target);
          } else {
            visibleStoryFrames.delete(entry.target);
          }
        });
        requestStoryParallax();
      }, { rootMargin: '20% 0px' });

      storyFrames.forEach((frame) => frameObserver.observe(frame));
      window.addEventListener('scroll', requestStoryParallax, { passive: true });
      window.addEventListener('resize', requestStoryParallax, { passive: true });
    }
  }

  backToTopButton?.addEventListener('click', () => {
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  });

  document.addEventListener('visibilitychange', () => {
    syncSocialGalleryState();
  });

  function openOverlay(overlay) {
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    overlayBlockingSocialGallery = true;
    syncSocialGalleryState();
  }

  function closeOverlay(overlay) {
    overlay.hidden = true;
    const allOverlaysClosed = menuOverlay.hidden && gameOverlay.hidden && legalOverlay.hidden;
    if (allOverlaysClosed) {
      document.body.style.overflow = '';
      overlayBlockingSocialGallery = false;
    }
    if (overlay === gameOverlay) {
      gameLobbyController?.abort();
      gameLobbyController = null;
      activeGame?.destroy?.();
      activeGame = null;
      gameRoot.innerHTML = '';
    }
    if (allOverlaysClosed) syncSocialGalleryState();
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
      activeGame = module.mount(gameRoot, {
        onVerifyContact: () => showContactVerification(game, 'email-coupon'),
        onVerifyPhone: () => showContactVerification(game, 'phone'),
        onEmailOffer: (contact) => showContactVerification(game, 'post-phone', contact),
      });
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

  function showContactVerification(game, initialStep = 'phone', contact = null) {
    activeGame?.destroy?.();
    activeGame = null;
    gameRoot.innerHTML = '';
    activeGame = mountContactVerification(gameRoot, {
      game,
      initialStep,
      contact,
      onPlay: () => {
        activeGame?.destroy?.();
        activeGame = null;
        mountSelectedGame(game);
      },
    });
  }

  function showDailyComplete(status) {
    const attempts = Number(status?.attemptsUsed) || 3;
    const coupon = status?.dailyCoupon;
    if (coupon?.couponCode) {
      const code = escapeHtml(coupon.couponCode);
      const discount = Math.max(0, Number(coupon.discountPercent) || 0);
      const redeemed = coupon.status === 'redeemed';
      gameRoot.innerHTML = `
        <section class="game-lobby game-lobby--daily-coupon" aria-live="polite">
          <header class="game-lobby__header">
            <span class="game-lobby__eyebrow">TODAY'S ARCADE IS WRAPPED</span>
            <strong>YOU'RE ALL SET FOR TODAY</strong>
            <span>${redeemed
              ? 'Your coupon has already been used. Here it is for your records.'
              : 'Done playing? No problem — your best discount is saved right here.'}</span>
          </header>
          <div class="daily-coupon${redeemed ? ' is-redeemed' : ''}" data-clarity-mask="true">
            <div class="daily-coupon__topline">
              <span>${redeemed ? 'COUPON USED' : "TODAY'S COUPON"}</span>
              <strong>${discount}% OFF</strong>
            </div>
            <button class="daily-coupon__code" type="button" data-role="copy-daily-coupon" aria-label="Coupon code ${code}. Tap to copy.">
              <span>${code.slice(0, 4)}</span><span>${code.slice(4)}</span>
            </button>
            ${redeemed ? '' : '<div class="coupon-qr" data-role="coupon-qr"><span>PREPARING QR…</span></div>'}
            <span class="daily-coupon__copy-hint" data-role="coupon-copy-hint">${redeemed ? 'REDEEMED TODAY' : 'TAP CODE TO COPY'}</span>
            <div class="daily-coupon__validity">
              <i aria-hidden="true"></i>
              <span>${redeemed ? 'ALREADY REDEEMED' : "VALID THROUGH TODAY'S CAFÉ SERVICE"}</span>
            </div>
            <p>${redeemed
              ? 'Thanks for stopping by. This code cannot be used again.'
              : 'Show this code to your barista before payment. It remains available here for the rest of today.'}</p>
          </div>
          <p class="daily-coupon__tomorrow"><strong>NEW DAY, NEW SHOT.</strong> Come back tomorrow to play again and unlock a new discount.</p>
        </section>`;

      if (!redeemed) mountCouponQr(gameRoot, coupon.couponCode);

      const copyButton = gameRoot.querySelector('[data-role="copy-daily-coupon"]');
      const copyHint = gameRoot.querySelector('[data-role="coupon-copy-hint"]');
      if (!redeemed) {
        copyButton?.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(coupon.couponCode);
            copyHint.textContent = 'COPIED — KEEP IT HANDY';
          } catch {
            copyHint.textContent = 'PRESS AND HOLD TO COPY';
          }
        });
      }
      return;
    }

    gameRoot.innerHTML = `
      <section class="game-lobby game-lobby--message" aria-live="polite">
        <span class="game-lobby__eyebrow">TODAY'S SET IS COMPLETE</span>
        <strong>COME BACK TOMORROW</strong>
        <span>You used all ${attempts} attempts. A fresh game choice unlocks tomorrow.</span>
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

  function showConsentGate() {
    gameRoot.innerHTML = `
      <section class="game-lobby game-lobby--consent">
        <header class="game-lobby__header">
          <span class="game-lobby__eyebrow">ONE QUICK CHECK</span>
          <strong>READY TO PLAY?</strong>
          <span>Confirm once on this device. We keep the rules short and the game fair.</span>
        </header>
        <form class="game-consent">
          <label class="game-consent__check">
            <input class="game-consent__input" type="checkbox" name="agreement" />
            <span class="game-consent__box" aria-hidden="true"></span>
            <span class="game-consent__label">I’m 13 or older and agree to the documents below.</span>
          </label>
          <div class="game-consent__links">
            <button type="button" data-action="open-legal" data-legal="terms">Terms &amp; Game Rules</button>
            <button type="button" data-action="open-legal" data-legal="privacy">Privacy Policy</button>
          </div>
          <p class="game-consent__note">No marketing subscription is required to play or receive a coupon.</p>
          <p class="game-consent__error" role="alert" hidden></p>
          <button class="game-consent__submit" type="submit">ENTER THE ARCADE →</button>
        </form>
      </section>`;

    const form = gameRoot.querySelector('.game-consent');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const checkbox = form.elements.agreement;
      const submit = form.querySelector('.game-consent__submit');
      const error = form.querySelector('.game-consent__error');
      if (!checkbox.checked) {
        error.textContent = 'Please check the box to continue.';
        error.hidden = false;
        checkbox.focus();
        return;
      }

      submit.disabled = true;
      submit.textContent = 'SAVING…';
      error.hidden = true;
      try {
        const response = await fetch('/api/consent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            version: LEGAL_VERSION,
            accepted: true,
            ageConfirmed: true,
          }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.accepted) {
          throw new Error(body.message || 'Could not save your confirmation.');
        }
        await openGame();
      } catch (err) {
        error.textContent = err.message || 'Could not save your confirmation. Please try again.';
        error.hidden = false;
        submit.disabled = false;
        submit.textContent = 'TRY AGAIN →';
      }
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
      if (status.consentRequired) {
        showConsentGate();
      } else if (status.contactVerificationRequired && status.selectedGame) {
        showContactVerification(status.selectedGame, 'email-coupon');
      } else if (status.couponClaimRequired && status.selectedGame) {
        showContactVerification(status.selectedGame, 'claim', status.contact);
      } else if (status.phoneVerificationRequired && status.selectedGame) {
        showContactVerification(status.selectedGame, 'phone');
      } else if (status.postPhoneActionRequired && status.selectedGame) {
        showContactVerification(status.selectedGame, 'post-phone', status.contact);
      } else if (status.exhausted) {
        showDailyComplete(status);
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

  const launchParams = new URLSearchParams(location.search);
  const requestedGame = launchParams.get('game');
  const requestedMenuTab = launchParams.get('menu');
  if (requestedGame === 'arcade') {
    openGame();
  } else if (requestedMenuTab === 'kitchen' || requestedMenuTab === 'drink') {
    renderMenu(menuContent, requestedMenuTab);
    openOverlay(menuOverlay);
  }

  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'open-menu') {
      renderMenu(menuContent);
      openOverlay(menuOverlay);
    } else if (action === 'open-legal') {
      const legalName = event.target.closest('[data-legal]')?.dataset.legal;
      renderLegalDocument(legalContent, legalName);
      openOverlay(legalOverlay);
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
    if (!legalOverlay.hidden) closeOverlay(legalOverlay);
    else if (!gameOverlay.hidden) closeOverlay(gameOverlay);
    else if (!menuOverlay.hidden) closeOverlay(menuOverlay);
  });
}
