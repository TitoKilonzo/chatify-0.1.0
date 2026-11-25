/**
 * Normalise a typed phone number to E.164 (+ and 8 to 15 digits), or return null. Numbers with a
 * leading 0 are national numbers and get the default country code; anything else must already
 * carry its country code.
 */
export function normalizePhone(input, defaultCountryCode = '254') {
  const cleaned = String(input ?? '').replace(/[\s().-]/g, '');
  let digits;
  if (cleaned.startsWith('+')) {
    digits = cleaned.slice(1);
  } else if (cleaned.startsWith('00')) {
    digits = cleaned.slice(2);
  } else if (cleaned.startsWith('0')) {
    digits = `${defaultCountryCode}${cleaned.slice(1)}`;
  } else {
    digits = cleaned;
  }
  if (!/^[1-9]\d{7,14}$/.test(digits)) {
    return null;
  }
  return `+${digits}`;
}

/** +254712345678 -> +254 *** *** 678, for showing a number without exposing all of it. */
export function maskPhone(phone) {
  return `${phone.slice(0, 4)} *** *** ${phone.slice(-3)}`;
}
