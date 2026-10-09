import { officeOffers, getOfficeOfferItems } from '../data/officeOffers.js';
import { createMenuOverlay, createPageScrollLock } from './menuOverlay.js';

const page = document.getElementById('office-page');
const menu = createMenuOverlay({
  overlay: document.getElementById('menu-overlay'),
  content: document.getElementById('menu-content'),
  background: page,
});
const dialog = document.querySelector('.offer-dialog');
const offerScrollLock = createPageScrollLock();
let offerTrigger = null;

function itemImage(item) {
  const image = document.createElement('img');
  image.src = item.image.split('/').map((segment) => encodeURIComponent(segment)).join('/');
  image.alt = item.name;
  image.width = 960;
  image.height = 720;
  image.loading = 'lazy';
  image.decoding = 'async';
  return image;
}

Object.entries(officeOffers).forEach(([id, offer]) => {
  const items = getOfficeOfferItems(offer);
  const list = document.querySelector(`[data-offer-items="${id}"]`);
  const photo = document.querySelector(`[data-offer-photo="${id}"]`);
  if (!list || !items.length) return;
  document.getElementById(`${id}-time`).textContent = offer.time.toUpperCase();
  document.querySelector(`[data-offer-price="${id}"]`).textContent = `$${offer.price}`;
  document.querySelector(`[data-offer-summary="${id}"]`).textContent = offer.summary;
  list.replaceChildren();
  offer.cardItems.forEach((label) => {
    const entry = document.createElement('li');
    entry.textContent = label;
    list.append(entry);
  });
  list.hidden = false;
  if (photo) {
    photo.append(itemImage(items[0]));
    photo.hidden = false;
  }
});

function openOffer(id, trigger) {
  if (!Object.hasOwn(officeOffers, id) || dialog.open) return;
  const offer = officeOffers[id];
  offerTrigger = trigger;
  dialog.querySelector('[data-offer-time]').textContent = offer.time;
  dialog.querySelector('#offer-dialog-title').textContent = offer.title;
  const price = dialog.querySelector('[data-offer-detail-price]');
  price.textContent = offer.price ? `$${offer.price} · DISH + ANY COFFEE` : '';
  price.hidden = !offer.price;
  dialog.querySelector('#offer-dialog-conditions').textContent = offer.conditions;
  const details = dialog.querySelector('[data-offer-detail-items]');
  details.replaceChildren();
  getOfficeOfferItems(offer).forEach((item) => {
    const row = document.createElement('article');
    row.className = 'offer-dialog__item';
    row.append(itemImage(item));
    const copy = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = item.name;
    const description = document.createElement('p');
    description.textContent = item.desc?.replaceAll(' / ', ' · ') || '';
    copy.append(title, description);
    row.append(copy);
    details.append(row);
  });
  offerScrollLock.lock();
  dialog.showModal();
  dialog.scrollTop = 0;
}

document.querySelectorAll('[data-offer]').forEach((button) => {
  button.addEventListener('click', () => openOffer(button.dataset.offer, button));
});
document.querySelectorAll('[data-open-menu]').forEach((button) => {
  button.addEventListener('click', () => menu.open(button.dataset.openMenu, button));
});
dialog.querySelector('[data-offer-close]').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => {
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right
    || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
});
dialog.addEventListener('close', () => {
  offerScrollLock.unlock();
  offerTrigger?.focus({ preventScroll: true });
});
dialog.querySelector('[data-offer-menu]').addEventListener('click', () => {
  const trigger = offerTrigger;
  dialog.close();
  // Wait for the dialog's close event to restore scroll before the menu locks it.
  dialog.addEventListener('close', () => menu.open('kitchen', trigger), { once: true });
});

const linkedOffer = location.hash.slice(1);
if (Object.hasOwn(officeOffers, linkedOffer)) {
  openOffer(linkedOffer, document.querySelector(`[data-offer="${linkedOffer}"]`));
}

// Analytics blockers must not disable menu or offer interactions.
import('@vercel/analytics').then(({ inject }) => inject()).catch(() => {});
