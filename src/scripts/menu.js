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
    <button
      class="kitchen-menu__card"
      type="button"
      data-kitchen-section="${sectionIndex}"
      data-kitchen-item="${itemIndex}"
      aria-haspopup="dialog"
      aria-label="View ${escapeHtml(item.name)} details"
    >
      <div class="kitchen-menu__photo">
        <img src="${encodeAssetPath(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy" decoding="async" width="960" height="720" />
        <span class="kitchen-menu__card-action" aria-hidden="true">VIEW <span>↗</span></span>
      </div>
      <div class="kitchen-menu__card-copy">
        <div class="kitchen-menu__card-heading">
          <h4>${escapeHtml(item.name)}</h4>
          <strong>${formatPrice(item.price)}</strong>
        </div>
        ${description ? `<p>${escapeHtml(description)}</p>` : ''}
      </div>
    </button>`;
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
        <figure class="kitchen-detail__photo">
          <img data-kitchen-detail-image alt="" width="1200" height="900" />
        </figure>
        <div class="kitchen-detail__copy">
          <span class="kitchen-detail__category" data-kitchen-detail-category></span>
          <div class="kitchen-detail__heading">
            <h2 id="kitchen-detail-title" data-kitchen-detail-title></h2>
            <strong data-kitchen-detail-price></strong>
          </div>
          <span class="kitchen-detail__label">WHAT'S INSIDE</span>
          <p id="kitchen-detail-description" data-kitchen-detail-description></p>
        </div>
      </article>
    </div>`;
}

export function renderMenu(container, initialTab = 'drink') {
  const activeTab = initialTab === 'kitchen' ? 'kitchen' : 'drink';
  container.innerHTML = `
    <div class="menu">
      <div class="menu__tabs" role="tablist">
        <button class="menu__tab" role="tab" aria-selected="${activeTab === 'drink'}" data-tab="drink">${drinkMenu.title}</button>
        <button class="menu__tab" role="tab" aria-selected="${activeTab === 'kitchen'}" data-tab="kitchen">${kitchenMenu.title}</button>
      </div>
      <div data-panel="drink" ${activeTab === 'drink' ? '' : 'hidden'}>${renderSections(drinkMenu)}</div>
      <div class="kitchen-menu" data-panel="kitchen" ${activeTab === 'kitchen' ? '' : 'hidden'}>${renderKitchenMenu(kitchenMenu)}</div>
      ${renderKitchenDetail()}
    </div>`;

  const overlayPanel = container.closest('.overlay__panel');
  const detail = container.querySelector('[data-kitchen-detail]');
  const detailPanel = detail.querySelector('.kitchen-detail__panel');
  const detailClose = detail.querySelector('[data-kitchen-detail-close]');
  const detailImage = detail.querySelector('[data-kitchen-detail-image]');
  const detailCategory = detail.querySelector('[data-kitchen-detail-category]');
  const detailTitle = detail.querySelector('[data-kitchen-detail-title]');
  const detailPrice = detail.querySelector('[data-kitchen-detail-price]');
  const detailDescription = detail.querySelector('[data-kitchen-detail-description]');
  let detailTrigger = null;

  overlayPanel?.classList.remove('has-kitchen-detail-open');

  const closeKitchenDetail = () => {
    if (detail.hidden) return;
    detail.hidden = true;
    overlayPanel?.classList.remove('has-kitchen-detail-open');
    detailTrigger?.focus({ preventScroll: true });
    detailTrigger = null;
  };

  const openKitchenDetail = (trigger) => {
    const section = kitchenMenu.sections[Number(trigger.dataset.kitchenSection)];
    const item = section?.items[Number(trigger.dataset.kitchenItem)];
    if (!item) return;

    detailTrigger = trigger;
    detailImage.src = encodeAssetPath(item.image);
    detailImage.alt = `${item.name} at Monoblend`;
    detailCategory.textContent = section.name;
    detailTitle.textContent = item.name;
    detailPrice.textContent = formatPrice(item.price);
    detailDescription.textContent = item.desc?.replaceAll(' / ', ' · ') || '';
    detail.hidden = false;
    overlayPanel?.classList.add('has-kitchen-detail-open');
    detailPanel.scrollTop = 0;
    detailClose.focus({ preventScroll: true });
  };

  container.querySelectorAll('.kitchen-menu__card').forEach((card) => {
    card.addEventListener('click', () => openKitchenDetail(card));
  });

  detailClose.addEventListener('click', closeKitchenDetail);
  detail.addEventListener('click', (event) => {
    if (event.target === detail) closeKitchenDetail();
  });
  detail.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeKitchenDetail();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      detailClose.focus({ preventScroll: true });
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
    });
  });

}
