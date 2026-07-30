import {
  COMPANY_NAME,
  LEGAL_EFFECTIVE_DATE,
} from '../shared/legal.js';

const CONTACT_URL = 'https://www.instagram.com/monoblend.coffee/?hl=en';

function termsDocument() {
  return `
    <article class="legal-document">
      <header class="legal-document__header">
        <span>MONOBLEND COFFEE</span>
        <h2>TERMS &amp; GAME RULES</h2>
        <p>Effective ${LEGAL_EFFECTIVE_DATE}</p>
      </header>

      <section>
        <h3>1. Who operates the service</h3>
        <p>This website, its games, and its digital coupons are operated by ${COMPANY_NAME}, doing business as Monoblend Coffee.</p>
      </section>

      <section>
        <h3>2. Eligibility and acceptance</h3>
        <p>You must be at least 13 years old to use the games. By confirming the agreement screen, you accept these Terms &amp; Game Rules and the Privacy Policy.</p>
      </section>

      <section>
        <h3>3. Daily game rules</h3>
        <ul>
          <li>You may select one available game per promotional day.</li>
          <li>You receive up to three standard attempts for that selected game.</li>
          <li>A verified email address is required to receive a coupon and connects the daily limit across devices using that address.</li>
          <li>Verifying an email does not add attempts. Each player receives up to three attempts per day in one selected game.</li>
          <li>Your best server-verified result determines the discount offered for the set.</li>
          <li>Attempts that cannot be verified may be rejected or restored.</li>
          <li>Automated play, tampering, fabricated input, duplicate accounts, and other attempts to bypass limits are prohibited.</li>
        </ul>
      </section>

      <section>
        <h3>4. Coupons</h3>
        <p>Coupons are promotional, have no cash value, expire at the end of the promotional day in the café’s local time, and may be redeemed only once at a participating Monoblend Coffee location. The discount and expiration shown with the issued coupon control. Coupons may not be combined with other offers unless expressly stated.</p>
      </section>

      <section>
        <h3>5. Verification and availability</h3>
        <p>Game results and coupon eligibility are determined by Monoblend Coffee’s server records. We may deny or cancel a result affected by abuse, manipulation, service interruption, or a material technical error. Games and offers may be changed, paused, or ended when reasonably necessary.</p>
      </section>

      <section>
        <h3>6. Messages</h3>
        <p>If you request email verification, we may send the verification code and coupon you requested. Promotional messages require a separate optional consent and are not required to play or receive a coupon.</p>
      </section>

      <section>
        <h3>7. Contact</h3>
        <p>Questions may be sent through the official <a href="${CONTACT_URL}" target="_blank" rel="noopener noreferrer">Monoblend Coffee Instagram account</a>.</p>
      </section>
    </article>`;
}

function privacyDocument() {
  return `
    <article class="legal-document">
      <header class="legal-document__header">
        <span>GENERAL COFFEE GROUP LLC</span>
        <h2>PRIVACY POLICY</h2>
        <p>Effective ${LEGAL_EFFECTIVE_DATE}</p>
      </header>

      <section>
        <h3>1. Information we collect</h3>
        <p>We collect a device identifier stored in a cookie, game activity, attempts, scores, coupon status, and basic technical request information. If you provide an email address for verification or coupon delivery, we also process that information.</p>
      </section>

      <section>
        <h3>2. How we use information</h3>
        <p>We use information to operate the games, enforce daily limits, verify results, prevent abuse, issue and redeem coupons, provide requested messages, maintain security, and understand service performance.</p>
      </section>

      <section>
        <h3>3. Cookies</h3>
        <p>We use a necessary first-party cookie to recognize the device, remember daily game activity, and help prevent repeated claims. Blocking or deleting it may cause the service to treat the browser as a new device.</p>
      </section>

      <section>
        <h3>4. Service providers and sharing</h3>
        <p>We may use hosting, database, security, analytics, and email delivery providers to operate the service. They process information only for the services they provide to us. We do not sell email addresses or game activity.</p>
      </section>

      <section>
        <h3>5. Retention and security</h3>
        <p>We retain information only as long as reasonably needed for the purposes described above, fraud prevention, legal obligations, and dispute resolution. We use reasonable technical and organizational safeguards, but no online system is completely secure.</p>
      </section>

      <section>
        <h3>6. Your choices</h3>
        <p>Promotional messages are optional. You may request information about, correction of, or deletion of personal information, subject to applicable law and legitimate fraud-prevention or recordkeeping needs.</p>
      </section>

      <section>
        <h3>7. Children</h3>
        <p>The games are not intended for children under 13, and we do not knowingly collect personal information from children under 13.</p>
      </section>

      <section>
        <h3>8. Contact and updates</h3>
        <p>Questions or privacy requests may be sent through the official <a href="${CONTACT_URL}" target="_blank" rel="noopener noreferrer">Monoblend Coffee Instagram account</a>. We may update this policy and will request a new confirmation when a material update requires it.</p>
      </section>
    </article>`;
}

export function renderLegalDocument(container, documentName) {
  container.innerHTML = documentName === 'privacy'
    ? privacyDocument()
    : termsDocument();
  const panel = container.closest('.overlay__panel');
  if (panel) panel.scrollTop = 0;
}
