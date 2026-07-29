import { usingMemoryKv } from './kv.js';
import { BUSINESS_TIME_ZONE } from './config.js';

const localDevelopment = usingMemoryKv
  && process.env.NODE_ENV !== 'production'
  && !process.env.VERCEL
  && !process.env.RAILWAY_ENVIRONMENT;

function twilioAuthHeader() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error('sms_provider_not_configured');
  return `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`;
}

async function providerError(response, fallback) {
  const body = await response.json().catch(() => ({}));
  const error = new Error(body.message || body.error?.message || fallback);
  error.status = response.status;
  throw error;
}

async function sendResendEmail({ to, subject, text, html, idempotencyKey }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new Error('email_provider_not_configured');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({ from, to: [to], subject, text, html }),
  });
  if (!response.ok) await providerError(response, 'Email could not be sent.');
  return response.json();
}

export async function sendVerification({ channel, destination, code, challengeId }) {
  if (localDevelopment) return { mode: 'dev', devCode: code };

  if (channel === 'sms') {
    const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
    if (!serviceSid) throw new Error('sms_provider_not_configured');
    const response = await fetch(
      `https://verify.twilio.com/v2/Services/${encodeURIComponent(serviceSid)}/Verifications`,
      {
        method: 'POST',
        headers: {
          Authorization: twilioAuthHeader(),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: destination, Channel: 'sms' }),
      },
    );
    if (!response.ok) await providerError(response, 'Verification text could not be sent.');
    return { mode: 'twilio-verify' };
  }

  await sendResendEmail({
    to: destination,
    subject: `${code} is your Monoblend verification code`,
    text: `Your Monoblend verification code is ${code}. It expires in 10 minutes.`,
    html: `<p>Your Monoblend verification code is:</p><p style="font-size:32px;font-weight:700;letter-spacing:6px">${code}</p><p>It expires in 10 minutes.</p>`,
    idempotencyKey: `verify-${challengeId}`,
  });
  return { mode: 'local-code' };
}

export async function checkTwilioVerification({ destination, code }) {
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!serviceSid) throw new Error('sms_provider_not_configured');
  const response = await fetch(
    `https://verify.twilio.com/v2/Services/${encodeURIComponent(serviceSid)}/VerificationCheck`,
    {
      method: 'POST',
      headers: {
        Authorization: twilioAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: destination, Code: code }),
    },
  );
  if (!response.ok) await providerError(response, 'Verification code could not be checked.');
  const result = await response.json();
  return result.status === 'approved';
}

function couponMessage({ couponCode, discountPercent, expiresAt }) {
  const expires = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(expiresAt));
  return `Monoblend coupon: ${couponCode} — ${discountPercent}% off. Valid today until ${expires}. One use only.`;
}

export async function deliverCoupon({ contact, destination, reward }) {
  if (localDevelopment) return { delivered: true, mode: 'dev' };

  const message = couponMessage(reward);
  if (contact.channel === 'email') {
    await sendResendEmail({
      to: destination,
      subject: `Your ${reward.discountPercent}% Monoblend coupon`,
      text: message,
      html: `<p>Your Monoblend coupon:</p><p style="font-size:30px;font-weight:700;letter-spacing:4px">${reward.couponCode}</p><p>${reward.discountPercent}% off. Valid today. One use only.</p>`,
      idempotencyKey: `coupon-${reward.couponId}`,
    });
    return { delivered: true, mode: 'email' };
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  if (!accountSid) throw new Error('sms_provider_not_configured');
  const params = new URLSearchParams({
    To: destination,
    Body: message,
  });
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
    params.set('MessagingServiceSid', process.env.TWILIO_MESSAGING_SERVICE_SID);
  } else if (process.env.TWILIO_FROM_NUMBER) {
    params.set('From', process.env.TWILIO_FROM_NUMBER);
  } else {
    throw new Error('sms_delivery_not_configured');
  }
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: twilioAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    },
  );
  if (!response.ok) await providerError(response, 'Coupon text could not be sent.');
  return { delivered: true, mode: 'sms' };
}
