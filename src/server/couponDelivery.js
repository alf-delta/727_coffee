import { deliverCoupon } from './contactProviders.js';
import { revealContact } from './contactIdentity.js';
import { secondsUntilNextUTCMidnight } from './date.js';
import { kv } from './kv.js';

export async function deliverRewardToContact(contact, reward) {
  if (!contact || !reward?.couponId) {
    return { delivered: false, reason: 'contact_missing' };
  }

  const key = `coupon-delivery:${reward.couponId}`;
  const ttl = secondsUntilNextUTCMidnight();
  const reserved = await kv.set(key, { status: 'sending' }, { nx: true, ex: ttl });
  if (!reserved) {
    const existing = await kv.get(key);
    return {
      delivered: existing?.status === 'sent',
      alreadyHandled: true,
    };
  }

  try {
    const destination = revealContact(contact);
    const result = await deliverCoupon({ contact, destination, reward });
    await kv.set(
      key,
      { status: 'sent', sentAt: Date.now(), channel: contact.channel },
      { ex: ttl },
    );
    return { ...result, masked: contact.masked, channel: contact.channel };
  } catch (error) {
    await kv.del(key);
    console.error('[coupon-delivery]', error);
    return {
      delivered: false,
      reason: 'delivery_failed',
      masked: contact.masked,
      channel: contact.channel,
    };
  }
}
