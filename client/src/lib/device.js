/** A short, human label for a browser user agent: "Chrome on Windows". Never throws. */
export function describeDevice(userAgent) {
  const ua = typeof userAgent === 'string' ? userAgent : '';
  if (!ua) {
    return { label: 'Unknown device', mobile: false };
  }
  let browser = 'Browser';
  if (/Edg\//.test(ua)) {
    browser = 'Edge';
  } else if (/OPR\/|Opera/.test(ua)) {
    browser = 'Opera';
  } else if (/Firefox\//.test(ua)) {
    browser = 'Firefox';
  } else if (/Chrome\/|CriOS\//.test(ua)) {
    browser = 'Chrome';
  } else if (/Safari\//.test(ua)) {
    browser = 'Safari';
  }
  let system = '';
  if (/Android/.test(ua)) {
    system = 'Android';
  } else if (/iPhone|iPad|iPod/.test(ua)) {
    system = 'iOS';
  } else if (/Windows/.test(ua)) {
    system = 'Windows';
  } else if (/Mac OS X|Macintosh/.test(ua)) {
    system = 'macOS';
  } else if (/CrOS/.test(ua)) {
    system = 'ChromeOS';
  } else if (/Linux/.test(ua)) {
    system = 'Linux';
  }
  const mobile = /Android|iPhone|iPad|iPod|Mobile/.test(ua);
  return { label: system ? `${browser} on ${system}` : browser, mobile };
}
