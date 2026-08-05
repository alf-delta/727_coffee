const CLARITY_PROJECT_ID = 'xx7a2cr69a';
const CONSENT_STORAGE_KEY = 'mb_clarity_consent_v1';

function readPreference() {
  try {
    return localStorage.getItem(CONSENT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function savePreference(value) {
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, value);
  } catch {
    // A blocked storage API must never prevent access to the site.
  }
}

function isClarityHost() {
  return location.hostname === '727.coffee' || location.hostname === 'www.727.coffee';
}

function ensureClarityQueue() {
  window.clarity = window.clarity || function clarityQueue() {
    (window.clarity.q = window.clarity.q || []).push(arguments);
  };
}

function setClarityConsent(analyticsStorage) {
  ensureClarityQueue();
  window.clarity('consentv2', {
    ad_Storage: 'denied',
    analytics_Storage: analyticsStorage,
  });
}

function loadClarity() {
  if (!isClarityHost() || document.querySelector('[data-monoblend-clarity]')) return;

  setClarityConsent('granted');
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.clarity.ms/tag/${CLARITY_PROJECT_ID}`;
  script.dataset.monoblendClarity = 'true';
  document.head.append(script);
}

function disableClarity() {
  if (typeof window.clarity !== 'function') return;
  setClarityConsent('denied');
  // Microsoft recommends the legacy denial call as well when revoking consent,
  // because it clears existing Clarity cookies from the current browser.
  window.clarity('consent', false);
}

function createConsentPanel() {
  const panel = document.createElement('aside');
  panel.className = 'privacy-consent';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-labelledby', 'privacy-consent-title');
  panel.innerHTML = `
    <button class="privacy-consent__close" type="button" data-clarity-action="close" aria-label="Close privacy choices">×</button>
    <span class="privacy-consent__eyebrow">OPTIONAL ANALYTICS</span>
    <strong id="privacy-consent-title">HELP US IMPROVE</strong>
    <p>Allow Microsoft Clarity to show us clicks, scrolling, and session replays so we can make the site better.</p>
    <div class="privacy-consent__actions">
      <button type="button" data-clarity-action="deny">NECESSARY ONLY</button>
      <button type="button" data-clarity-action="allow">ALLOW ANALYTICS</button>
    </div>
    <div class="privacy-consent__meta">
      <span>18+ · SENSITIVE FIELDS MASKED</span>
      <button class="privacy-consent__policy" type="button" data-action="open-legal" data-legal="privacy">PRIVACY POLICY</button>
    </div>`;
  document.body.append(panel);
  return panel;
}

export function initClarityConsent() {
  const panel = createConsentPanel();
  const openPanel = () => {
    panel.hidden = false;
    requestAnimationFrame(() => panel.classList.add('is-visible'));
  };
  const closePanel = () => {
    panel.classList.remove('is-visible');
    window.setTimeout(() => {
      panel.hidden = true;
    }, 180);
  };

  panel.addEventListener('click', (event) => {
    const clarityAction = event.target.closest('[data-clarity-action]')?.dataset.clarityAction;
    if (clarityAction === 'allow') {
      savePreference('granted');
      loadClarity();
      closePanel();
    } else if (clarityAction === 'deny') {
      savePreference('denied');
      disableClarity();
      closePanel();
    } else if (clarityAction === 'close') {
      closePanel();
    } else if (event.target.closest('[data-action="open-legal"]')) {
      closePanel();
    }
  });

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="privacy-choices"]')) openPanel();
  });

  const preference = readPreference();
  if (preference === 'granted') {
    loadClarity();
  } else if (preference !== 'denied') {
    window.setTimeout(openPanel, 500);
  }
}
