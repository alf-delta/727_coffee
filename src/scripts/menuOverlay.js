import { renderMenu } from './menu.js';

// The same menu renderer and styles as the home page, with a standalone host.
export function createPageScrollLock() {
  let scrollY = 0;
  let savedBodyStyle = null;
  let locked = false;
  function lock() {
    if (locked) return;
    locked = true;
    scrollY = window.scrollY;
    savedBodyStyle = document.body.getAttribute('style');
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
  }
  function unlock() {
    if (!locked) return;
    locked = false;
    if (savedBodyStyle === null) document.body.removeAttribute('style');
    else document.body.setAttribute('style', savedBodyStyle);
    // Avoid the landing's smooth anchor scrolling while restoring its position.
    const root = document.documentElement;
    const scrollBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, scrollY);
    root.style.scrollBehavior = scrollBehavior;
  }
  return { lock, unlock };
}

export function createMenuOverlay({ overlay, content, background }) {
  const closeButton = overlay.querySelector('[data-menu-close]');
  const scrollLock = createPageScrollLock();
  let trigger = null;

  function open(initialTab = 'drink', origin = document.activeElement) {
    if (!overlay.hidden) return;
    trigger = origin;
    scrollLock.lock();
    background.inert = true;
    renderMenu(content, initialTab);
    overlay.hidden = false;
    closeButton.focus({ preventScroll: true });
  }

  function close() {
    if (overlay.hidden) return;
    overlay.hidden = true;
    background.inert = false;
    scrollLock.unlock();
    trigger?.focus({ preventScroll: true });
    trigger = null;
  }

  closeButton.addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  overlay.addEventListener('keydown', (event) => {
    // Kitchen details manage their own Escape, arrow navigation and focus loop.
    if (!content.querySelector('[data-kitchen-detail]').hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') {
      const focusable = [...overlay.querySelectorAll('button, a[href], [tabindex="0"]')]
        .filter((element) => !element.disabled && element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  return { open, close };
}
