import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { uniqueViolation } from '../../db/errors.js';
import { AppError, conflict, tooManyRequests, validationFailed } from '../../utils/errors.js';
import { normalizePhone } from './phone-number.js';

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const MAX_CODES_PER_HOUR = 3;
export const RESEND_GAP_MS = 60 * 1000;

const NAME_MAX = 60;

/**
 * Sign in or link a number with a one-time code sent by SMS. Codes are six digits, valid for ten
 * minutes, stored only as an HMAC, limited to five guesses, and requested at most three times an
 * hour per number. A person who has never signed in with the number is asked for a display name
 * before the account is created.
 */
export function createPhoneService({
  phoneRepository,
  usersRepository,
  authService,
  hasher,
  sms,
  secret,
  defaultCountryCode,
  logger,
  now = () => new Date(),
}) {
  const hashCode = (phone, code) =>
    createHmac('sha256', secret).update(`phone:${phone}:${code}`).digest('hex');

  function parse(input) {
    const phone = normalizePhone(input, defaultCountryCode);
    if (!phone) {
      throw validationFailed([{ path: 'phone', message: 'Enter a valid phone number' }]);
    }
    return phone;
  }

  function requireEnabled() {
    if (!sms) {
      throw new AppError(503, 'PHONE_DISABLED', 'Phone sign-in is not set up on this server');
    }
  }

  async function sendCode(phone, purpose, userId = null) {
    requireEnabled();
    const current = now();
    const latest = await phoneRepository.latest(phone, purpose, current);
    if (latest && current.getTime() - latest.createdAt.getTime() < RESEND_GAP_MS) {
      throw tooManyRequests('CODE_TOO_SOON', 'Wait a minute before asking for another code');
    }
    const hourAgo = new Date(current.getTime() - 60 * 60 * 1000);
    if ((await phoneRepository.countSince(phone, hourAgo)) >= MAX_CODES_PER_HOUR) {
      throw tooManyRequests('CODE_LIMIT', 'Too many codes requested. Try again later.');
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await phoneRepository.create({
      phone,
      purpose,
      userId,
      codeHash: hashCode(phone, code),
      expiresAt: new Date(current.getTime() + CODE_TTL_MS),
    });
    try {
      await sms.send(phone, `Your Chatify code is ${code}. It expires in 10 minutes.`);
    } catch (err) {
      await phoneRepository.deleteForPhone(phone);
      logger.error({ err, provider: sms.name }, 'sending SMS failed');
      throw new AppError(502, 'SMS_FAILED', 'We could not send the text message. Try again soon.');
    }
  }

  /** True when the code matches. A wrong guess counts against the code. */
  async function checkCode(phone, purpose, code) {
    const row = await phoneRepository.latest(phone, purpose, now());
    if (!row || row.attempts >= MAX_ATTEMPTS) {
      return null;
    }
    const expected = Buffer.from(row.codeHash);
    const given = Buffer.from(hashCode(phone, String(code)));
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      await phoneRepository.addAttempt(row.id);
      return null;
    }
    return row;
  }

  const badCode = () =>
    new AppError(400, 'INVALID_CODE', 'That code is not right, or it has expired');

  async function createAccount(phone, displayName) {
    const name = String(displayName ?? '').trim();
    if (name.length < 1 || name.length > NAME_MAX) {
      throw validationFailed([{ path: 'displayName', message: 'Enter your name' }]);
    }
    const passwordHash = await hasher.hash(randomBytes(32).toString('base64url'));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const tag = randomBytes(5).toString('hex');
      try {
        return await usersRepository.create({
          displayName: name,
          username: `user_${tag}`,
          // Internal address: never shown, never used to sign in.
          email: `phone-${tag}@accounts.chatify.invalid`,
          passwordHash,
          phone,
          phoneVerifiedAt: now(),
        });
      } catch (err) {
        const violation = uniqueViolation(err);
        if (violation?.column === 'phone') {
          throw conflict('PHONE_TAKEN', 'That number was just registered. Sign in instead.');
        }
        if (!violation) {
          throw err;
        }
      }
    }
    throw new AppError(500, 'ACCOUNT_FAILED', 'Could not create the account');
  }

  return {
    get enabled() {
      return Boolean(sms);
    },

    async requestLoginCode(phoneInput) {
      await sendCode(parse(phoneInput), 'login');
    },

    /**
     * Returns { needsProfile: true } when the number is new and no name was given (the code stays
     * valid), otherwise a session.
     */
    async verifyLogin({ phone: phoneInput, code, displayName }, { userAgent } = {}) {
      requireEnabled();
      const phone = parse(phoneInput);
      const row = await checkCode(phone, 'login', code);
      if (!row) {
        throw badCode();
      }
      let user = await usersRepository.findByPhone(phone);
      if (!user) {
        if (!displayName) {
          return { needsProfile: true };
        }
        user = await createAccount(phone, displayName);
      }
      await phoneRepository.deleteForPhone(phone);
      return { session: await authService.startSession(user, { userAgent }) };
    },

    async requestLinkCode(userId, phoneInput) {
      const phone = parse(phoneInput);
      if (await usersRepository.findByPhone(phone)) {
        throw conflict('PHONE_TAKEN', 'That number is already used by an account');
      }
      await sendCode(phone, 'link', userId);
    },

    async verifyLink(userId, { phone: phoneInput, code }) {
      requireEnabled();
      const phone = parse(phoneInput);
      const row = await checkCode(phone, 'link', code);
      if (!row || row.userId !== userId) {
        throw badCode();
      }
      try {
        const user = await usersRepository.update(userId, { phone, phoneVerifiedAt: now() });
        await phoneRepository.deleteForPhone(phone);
        return user;
      } catch (err) {
        if (uniqueViolation(err)?.column === 'phone') {
          throw conflict('PHONE_TAKEN', 'That number is already used by an account');
        }
        throw err;
      }
    },

    async unlink(userId) {
      await usersRepository.update(userId, { phone: null, phoneVerifiedAt: null });
    },

    cleanup: () => phoneRepository.deleteExpired(now()),
  };
}
