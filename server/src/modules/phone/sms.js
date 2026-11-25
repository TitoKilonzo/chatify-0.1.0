/*
 * SMS providers. A provider is { name, send(phone, message) } and throws when the message could not
 * be handed to the carrier. Adding another service (Twilio, for example) means adding one factory
 * here and one value to SMS_PROVIDER; nothing else in the app changes.
 */

export function createConsoleSms({ logger }) {
  return {
    name: 'console',
    async send(phone, message) {
      logger.warn({ phone, message }, 'SMS (console provider, not sent)');
    },
  };
}

/** Africa's Talking bulk SMS API. fetchImpl is injectable for tests. */
export function createAfricasTalkingSms({
  username,
  apiKey,
  senderId,
  fetchImpl = fetch,
  endpoint = 'https://api.africastalking.com/version1/messaging',
}) {
  return {
    name: 'africastalking',
    async send(phone, message) {
      const body = new URLSearchParams({ username, to: phone, message });
      if (senderId) {
        body.set('from', senderId);
      }
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          apiKey,
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new Error(`SMS provider answered ${response.status}`);
      }
      const data = await response.json().catch(() => null);
      const recipient = data?.SMSMessageData?.Recipients?.[0];
      // Statuses such as InvalidPhoneNumber or InsufficientBalance mean nothing was sent.
      if (recipient && !/^(Success|Sent|Queued)/i.test(recipient.status ?? '')) {
        throw new Error(`SMS not sent: ${recipient.status}`);
      }
    },
  };
}

export function createSmsProvider(env, logger) {
  switch (env.SMS_PROVIDER) {
    case 'console':
      return createConsoleSms({ logger });
    case 'africastalking':
      return createAfricasTalkingSms({
        username: env.AT_USERNAME,
        apiKey: env.AT_API_KEY,
        senderId: env.AT_SENDER_ID,
      });
    default:
      return null;
  }
}
