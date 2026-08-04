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
        <h3>7. Optional behavior analytics</h3>
        <p>Microsoft Clarity behavior analytics runs only after a separate, voluntary permission from a visitor who confirms they are at least 18 years old. Declining analytics does not affect access to the website, games, attempts, or coupons.</p>
      </section>

      <section>
        <h3>8. Contact</h3>
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
        <p>We collect a device identifier stored in a cookie, game activity, attempts, scores, coupon status, and basic technical request information. If you provide an email address for verification, coupon delivery, or optional marketing, we also process that information. If you separately allow behavior analytics, we collect the website usage information described below.</p>
      </section>

      <section>
        <h3>2. How we use information</h3>
        <p>We use information to operate the games, enforce daily limits, verify results, prevent abuse, issue and redeem coupons, provide requested messages, maintain security, and understand service performance. If you separately opt in, we also use your email address to send occasional Monoblend Coffee news and promotional offers.</p>
      </section>

      <section>
        <h3>3. Cookies</h3>
        <p>We use a necessary first-party cookie to recognize the device, remember daily game activity, and help prevent repeated claims. We also use local browser storage to remember your analytics choice. Blocking or deleting necessary storage may cause the service to treat the browser as a new device or ask for your choice again.</p>
        <p>Microsoft Clarity cookies and similar analytics storage are optional and are enabled only after you select “Allow Analytics.” We keep advertising storage denied.</p>
      </section>

      <section>
        <h3>4. Microsoft Clarity behavior analytics</h3>
        <p>With your permission, we use Microsoft Clarity to understand how visitors use the website through behavioral metrics, heatmaps, and session replay. Clarity may process page interactions such as clicks, scrolling, navigation, device and browser information, approximate location, and related usage data. We use this information to improve navigation, design, performance, and technical reliability—not to determine game results, coupon eligibility, or advertising.</p>
        <p>Contact verification and coupon areas are explicitly masked, and Clarity does not run on the staff coupon checker. Microsoft may process analytics information as our service provider under the <a href="https://privacy.microsoft.com/en-us/privacystatement" target="_blank" rel="noopener noreferrer">Microsoft Privacy Statement</a>.</p>
      </section>

      <section>
        <h3>5. Service providers and sharing</h3>
        <p>We may use hosting, database, security, analytics, and email delivery providers to operate the service. They process information only for the services they provide to us. We do not sell email addresses, game activity, or Clarity analytics data.</p>
      </section>

      <section>
        <h3>6. Retention and security</h3>
        <p>We retain information only as long as reasonably needed for the purposes described above, fraud prevention, legal obligations, and dispute resolution. Analytics information is subject to Microsoft Clarity’s applicable retention settings. Marketing subscription records are retained until you unsubscribe or request deletion, subject to records needed to honor that choice. We use reasonable technical and organizational safeguards, but no online system is completely secure.</p>
      </section>

      <section>
        <h3>7. Your choices</h3>
        <p>Behavior analytics is optional. You can allow, decline, or change this choice at any time through “Privacy Choices” in the website footer; declining does not affect games or coupons. Promotional messages are also optional and do not affect game or coupon eligibility. Every marketing email will provide a way to unsubscribe. You may request information about, correction of, or deletion of personal information, subject to applicable law and legitimate fraud-prevention or recordkeeping needs.</p>
      </section>

      <section>
        <h3>8. Children</h3>
        <p>The games are not intended for children under 13, and we do not knowingly collect personal information from children under 13. Microsoft Clarity is not loaded unless a visitor separately confirms they are at least 18 years old and allows analytics.</p>
      </section>

      <section>
        <h3>9. Contact and updates</h3>
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
