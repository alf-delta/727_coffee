import { drinkMenu, kitchenMenu } from '../data/menu.js';

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
          ${section.items.map((item) => renderKitchenItem(item)).join('')}
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

function renderKitchenItem(item) {
  const description = item.desc?.replaceAll(' / ', ' · ') || '';
  return `
    <article class="kitchen-menu__card">
      <div class="kitchen-menu__photo">
        <img src="${encodeAssetPath(item.image)}" alt="${item.name}" loading="lazy" decoding="async" width="960" height="720" />
      </div>
      <div class="kitchen-menu__card-copy">
        <div class="kitchen-menu__card-heading">
          <h4>${item.name}</h4>
          <strong>${formatPrice(item.price)}</strong>
        </div>
        ${description ? `<p>${description}</p>` : ''}
      </div>
    </article>`;
}

export function renderMenu(container) {
  container.innerHTML = `
    <div class="menu">
      <div class="menu__tabs" role="tablist">
        <button class="menu__tab" role="tab" aria-selected="true" data-tab="drink">${drinkMenu.title}</button>
        <button class="menu__tab" role="tab" aria-selected="false" data-tab="kitchen">${kitchenMenu.title}</button>
      </div>
      <div data-panel="drink">${renderSections(drinkMenu)}</div>
      <div class="kitchen-menu" data-panel="kitchen" hidden>${renderKitchenMenu(kitchenMenu)}</div>
    </div>`;

  const tabs = container.querySelectorAll('.menu__tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
      container.querySelectorAll('[data-panel]').forEach((panel) => {
        panel.hidden = panel.dataset.panel !== tab.dataset.tab;
      });
    });
  });

}
