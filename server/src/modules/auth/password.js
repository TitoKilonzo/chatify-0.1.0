import argon2 from 'argon2';

// OWASP-recommended argon2id parameters (19 MiB memory, 2 iterations, 1 lane).
const DEFAULT_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

/**
 * Password hashing with argon2id. Options can be lowered in tests; verification reads the
 * parameters stored inside each hash, so existing hashes keep working if defaults change.
 */
export function createPasswordHasher(options = {}) {
  const hashOptions = { ...DEFAULT_OPTIONS, ...options };
  let dummyHash;

  async function hash(password) {
    return argon2.hash(password, hashOptions);
  }

  async function verify(passwordHash, password) {
    try {
      return await argon2.verify(passwordHash, password);
    } catch {
      // A malformed stored hash must never authenticate anyone.
      return false;
    }
  }

  /**
   * Spend the same time as a real verification. Used when the account does not exist so response
   * timing does not reveal which identifiers are registered.
   */
  async function verifyDummy(password) {
    dummyHash ??= hash('timing-equalisation-placeholder');
    await verify(await dummyHash, password);
  }

  return { hash, verify, verifyDummy };
}
