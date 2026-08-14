import { drinkMenu, kitchenMenu } from '../data/menu.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character]);
}

function renderSections(menu) {
  const sections = menu.sections
    .map(
      (section) => `
        <section class="menu__section">
          <h3 class="menu__section-title">${section.name}</h3>
          ${section.items.map((item) => renderItem(item)).join('')}
        </section>`,
    )
    .join('');

  const notes = menu.notes?.length
    ? `<div class="menu__notes">${menu.notes.map((n) => `<p>${n}</p>`).join('')}</div>`
    : '';

  return sections + notes;
}

function kitchenSectionId(index) {
  return `kitchen-section-${index}`;
}

function renderKitchenMenu(menu) {
  const sections = menu.sections
    .map((section, sectionIndex) => `
      <section class="kitchen-menu__section" id="${kitchenSectionId(sectionIndex)}">
        <div class="kitchen-menu__section-heading">
          <span>${String(sectionIndex + 1).padStart(2, '0')}</span>
          <h3>${section.name}</h3>
        </div>
        <div class="kitchen-menu__grid">
          ${section.items.map((item, itemIndex) => renderKitchenItem(item, sectionIndex, itemIndex)).join('')}
        </div>
      </section>`)
    .join('');

  const notes = menu.notes?.length
    ? `<div class="menu__notes kitchen-menu__notes">${menu.notes.map((note) => `<p>${note}</p>`).join('')}</div>`
    : '';

  return `
    <header class="kitchen-menu__intro">
      <span>MONOBLEND · ALL-DAY KITCHEN</span>
      <h2>Pick with your eyes.</h2>
      <p>Every dish, one clear photo. The full kitchen menu, made easy to scan.</p>
    </header>
    ${sections}
    ${notes}`;
}

function formatPrice(price) {
  if (Array.isArray(price)) return price.map((p) => `$${p}`).join(' / ');
  if (/^[\d.\s/]+$/.test(price)) return `$${price}`;
  return price; // free-text note, e.g. "See Pour Over Menu" — no $ prefix
}

function renderItem(item) {
  const price = formatPrice(item.price);
  const desc = item.desc || item.note;
  return `
    <div class="menu__item">
      <div class="menu__item-row">
        <span class="menu__item-name">${item.name}</span>
        <span class="menu__item-leader" aria-hidden="true"></span>
        <span class="menu__item-price">${price}</span>
      </div>
      ${desc ? `<p class="menu__item-desc">${desc}</p>` : ''}
    </div>`;
}

function encodeAssetPath(path) {
  return path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

function renderKitchenItem(item, sectionIndex, itemIndex) {
  const description = item.desc?.replaceAll(' / ', ' · ') || '';
  return `
    <article class="kitchen-menu__card">
      <button
        class="kitchen-menu__card-button"
        type="button"
        data-kitchen-section="${sectionIndex}"
        data-kitchen-item="${itemIndex}"
        aria-haspopup="dialog"
        aria-label="View ${escapeHtml(item.name)} details"
      ></button>
      <div class="kitchen-menu__photo">
        <img src="${encodeAssetPath(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy" decoding="async" width="960" height="720" />
      </div>
      <div class="kitchen-menu__card-copy">
        <div class="kitchen-menu__card-heading">
          <h4>${escapeHtml(item.name)}</h4>
          <strong>${formatPrice(item.price)}</strong>
        </div>
        ${description ? `<p>${escapeHtml(description)}</p>` : ''}
      </div>
    </article>`;
}

function renderKitchenDetail() {
  return `
    <div
      class="kitchen-detail"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kitchen-detail-title"
      aria-describedby="kitchen-detail-description"
      data-kitchen-detail
      hidden
    >
      <article class="kitchen-detail__panel" tabindex="-1">
        <button class="kitchen-detail__close" type="button" data-kitchen-detail-close aria-label="Close dish details">×</button>
        <div class="kitchen-detail__content" data-kitchen-detail-content>
          <figure class="kitchen-detail__photo">
            <img data-kitchen-detail-image alt="" width="1200" height="900" draggable="false" />
          </figure>
          <div class="kitchen-detail__copy">
            <span class="kitchen-detail__category" data-kitchen-detail-category></span>
            <div class="kitchen-detail__heading">
              <h2 id="kitchen-detail-title" data-kitchen-detail-title aria-live="polite"></h2>
              <strong data-kitchen-detail-price></strong>
            </div>
            <span class="kitchen-detail__label">WHAT'S INSIDE</span>
            <p id="kitchen-detail-description" data-kitchen-detail-description></p>
            <nav class="kitchen-detail__nav" aria-label="Browse kitchen dishes">
              <button type="button" data-kitchen-detail-prev aria-label="Previous dish">←</button>
              <span class="kitchen-detail__position">
                <strong data-kitchen-detail-position></strong>
                <small>SWIPE TO BROWSE</small>
              </span>
              <button type="button" data-kitchen-detail-next aria-label="Next dish">→</button>
            </nav>
          </div>
        </div>
      </article>
    </div>`;
}

export function renderMenu(container, initialTab = 'drink') {
  const activeTab = initialTab === 'kitchen' ? 'kitchen' : 'drink';
  container.scrollTop = 0;
  container.innerHTML = `
    <div class="menu">
      <div class="menu__viewport">
        <div class="menu__tabs" role="tablist">
          <button class="menu__tab" role="tab" aria-selected="${activeTab === 'drink'}" data-tab="drink">${drinkMenu.title}</button>
          <button class="menu__tab" role="tab" aria-selected="${activeTab === 'kitchen'}" data-tab="kitchen">${kitchenMenu.title}</button>
        </div>
        <div class="menu__body">
          <div data-panel="drink" ${activeTab === 'drink' ? '' : 'hidden'}>${renderSections(drinkMenu)}</div>
          <div class="kitchen-menu" data-panel="kitchen" ${activeTab === 'kitchen' ? '' : 'hidden'}>${renderKitchenMenu(kitchenMenu)}</div>
        </div>
      </div>
      ${renderKitchenDetail()}
    </div>`;

  const overlayPanel = container.closest('.overlay__panel');
  const menuViewport = container.querySelector('.menu__viewport');
  menuViewport.scrollTop = 0;
  const detail = container.querySelector('[data-kitchen-detail]');
  const detailPanel = detail.querySelector('.kitchen-detail__panel');
  const detailContent = detail.querySelector('[data-kitchen-detail-content]');
  const detailClose = detail.querySelector('[data-kitchen-detail-close]');
  const detailPrevious = detail.querySelector('[data-kitchen-detail-prev]');
  const detailNext = detail.querySelector('[data-kitchen-detail-next]');
  const detailImage = detail.querySelector('[data-kitchen-detail-image]');
  const detailCategory = detail.querySelector('[data-kitchen-detail-category]');
  const detailTitle = detail.querySelector('[data-kitchen-detail-title]');
  const detailPrice = detail.querySelector('[data-kitchen-detail-price]');
  const detailDescription = detail.querySelector('[data-kitchen-detail-description]');
  const detailPosition = detail.querySelector('[data-kitchen-detail-position]');
  const kitchenEntries = kitchenMenu.sections.flatMap((section, sectionIndex) => (
    section.items.map((item, itemIndex) => ({ item, itemIndex, section, sectionIndex }))
  ));
  const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SWIPE_DIRECTION_LOCK_PX = 10;
  const SWIPE_THRESHOLD_PX = 52;
  let detailTrigger = null;
  let detailIndex = -1;
  let detailChangeTimer = 0;
  let swipePointerId = null;
  let swipeStartX = 0;
  let swipeStartY = 0;
  let swipeCurrentX = 0;
  let swipeCurrentY = 0;
  let swipeDirection = null;

  overlayPanel?.classList.remove('has-kitchen-detail-open');

  const closeKitchenDetail = () => {
    if (detail.hidden) return;
    clearTimeout(detailChangeTimer);
    detail.hidden = true;
    overlayPanel?.classList.remove('has-kitchen-detail-open');
    detailTrigger?.focus({ preventScroll: true });
    detailTrigger = null;
    detailIndex = -1;
  };

  const normalizeKitchenIndex = (index) => (
    (index + kitchenEntries.length) % kitchenEntries.length
  );

  const showKitchenEntry = (index, movement = 0) => {
    const nextIndex = normalizeKitchenIndex(index);
    const { item, section } = kitchenEntries[nextIndex];
    detailIndex = nextIndex;

    detailImage.src = encodeAssetPath(item.image);
    detailImage.alt = `${item.name} at Monoblend`;
    detailCategory.textContent = section.name;
    detailTitle.textContent = item.name;
    detailPrice.textContent = formatPrice(item.price);
    detailDescription.textContent = item.desc?.replaceAll(' / ', ' · ') || '';
    detailPosition.textContent = `${String(nextIndex + 1).padStart(2, '0')} / ${String(kitchenEntries.length).padStart(2, '0')}`;
    detailPanel.scrollTop = 0;

    clearTimeout(detailChangeTimer);
    detailContent.classList.remove('is-entering-next', 'is-entering-previous');
    if (movement && !prefersReducedMotion) {
      detailContent.classList.add(movement > 0 ? 'is-entering-next' : 'is-entering-previous');
      detailChangeTimer = window.setTimeout(() => {
        detailContent.classList.remove('is-entering-next', 'is-entering-previous');
      }, 240);
    }
  };

  const moveKitchenDetail = (movement) => {
    if (detail.hidden || !movement) return;
    showKitchenEntry(detailIndex + movement, movement);
  };

  const openKitchenDetail = (trigger) => {
    const sectionIndex = Number(trigger.dataset.kitchenSection);
    const itemIndex = Number(trigger.dataset.kitchenItem);
    const selectedIndex = kitchenEntries.findIndex((entry) => (
      entry.sectionIndex === sectionIndex && entry.itemIndex === itemIndex
    ));
    if (selectedIndex < 0) return;

    detailTrigger = trigger;
    showKitchenEntry(selectedIndex);
    detail.hidden = false;
    overlayPanel?.classList.add('has-kitchen-detail-open');
    detailClose.focus({ preventScroll: true });
  };

  const resetKitchenSwipe = () => {
    swipePointerId = null;
    swipeDirection = null;
    detailContent.classList.remove('is-dragging');
    detailContent.style.removeProperty('transform');
    detailContent.style.removeProperty('opacity');
  };

  const finishKitchenSwipe = (cancelled = false) => {
    if (swipePointerId === null) return;
    const deltaX = swipeCurrentX - swipeStartX;
    const deltaY = swipeCurrentY - swipeStartY;
    const shouldMove = !cancelled
      && swipeDirection === 'horizontal'
      && Math.abs(deltaX) >= SWIPE_THRESHOLD_PX
      && Math.abs(deltaX) > Math.abs(deltaY);
    resetKitchenSwipe();
    if (shouldMove) moveKitchenDetail(deltaX < 0 ? 1 : -1);
  };

  container.querySelectorAll('.kitchen-menu__card-button').forEach((button) => {
    button.addEventListener('click', () => openKitchenDetail(button));
  });

  detailClose.addEventListener('click', closeKitchenDetail);
  detailPrevious.addEventListener('click', () => moveKitchenDetail(-1));
  detailNext.addEventListener('click', () => moveKitchenDetail(1));
  detailContent.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0 || event.target.closest('button')) return;
    swipePointerId = event.pointerId;
    swipeStartX = event.clientX;
    swipeStartY = event.clientY;
    swipeCurrentX = event.clientX;
    swipeCurrentY = event.clientY;
    swipeDirection = null;
    detailContent.setPointerCapture(event.pointerId);
  });
  detailContent.addEventListener('pointermove', (event) => {
    if (event.pointerId !== swipePointerId) return;
    swipeCurrentX = event.clientX;
    swipeCurrentY = event.clientY;
    const deltaX = swipeCurrentX - swipeStartX;
    const deltaY = swipeCurrentY - swipeStartY;

    if (!swipeDirection && Math.max(Math.abs(deltaX), Math.abs(deltaY)) >= SWIPE_DIRECTION_LOCK_PX) {
      swipeDirection = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
    }
    if (swipeDirection !== 'horizontal') return;

    if (event.cancelable) event.preventDefault();
    const dragX = Math.max(-86, Math.min(86, deltaX * 0.48));
    detailContent.classList.add('is-dragging');
    detailContent.style.transform = `translate3d(${dragX}px, 0, 0)`;
    detailContent.style.opacity = String(1 - (Math.min(86, Math.abs(dragX)) / 430));
  });
  detailContent.addEventListener('pointerup', (event) => {
    if (event.pointerId === swipePointerId) finishKitchenSwipe();
  });
  detailContent.addEventListener('pointercancel', (event) => {
    if (event.pointerId === swipePointerId) finishKitchenSwipe(true);
  });
  detail.addEventListener('click', (event) => {
    if (event.target === detail) closeKitchenDetail();
  });
  detail.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeKitchenDetail();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveKitchenDetail(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveKitchenDetail(1);
    } else if (event.key === 'Tab') {
      const focusable = [detailClose, detailPrevious, detailNext];
      const firstFocusable = focusable[0];
      const lastFocusable = focusable.at(-1);
      if (event.shiftKey && document.activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus({ preventScroll: true });
      }
    }
  });

  const tabs = container.querySelectorAll('.menu__tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      closeKitchenDetail();
      tabs.forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
      container.querySelectorAll('[data-panel]').forEach((panel) => {
        panel.hidden = panel.dataset.panel !== tab.dataset.tab;
      });
      menuViewport.scrollTop = 0;
    });
  });

}
