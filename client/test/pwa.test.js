import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { installInstructions } from '../src/components/InstallButton.jsx';
import { buildMailtoLink, CONTACT_TOPICS, validateContact } from '../src/lib/contact.js';
import { detectPlatform } from '../src/lib/pwa.js';
import { isActivePath, SITE_NAV, TEL_URL, WHATSAPP_URL } from '../src/features/public/site.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...parts) => readFileSync(path.join(here, '..', ...parts), 'utf8');

describe('detectPlatform', () => {
  it('identifies iPhone Safari and iPhone Chrome', () => {
    const safari =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    const chrome =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1';
    expect(detectPlatform(safari)).toEqual({ family: 'ios', safari: true });
    expect(detectPlatform(chrome)).toEqual({ family: 'ios', safari: false });
  });

  it('treats a touch-capable Mac user agent as an iPad', () => {
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5).family).toBe('ios');
  });

  it('identifies Android, Firefox, desktop Safari and Chromium', () => {
    expect(
      detectPlatform('Mozilla/5.0 (Linux; Android 14) Chrome/120.0 Mobile Safari/537.36').family,
    ).toBe('android');
    expect(
      detectPlatform('Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0')
        .family,
    ).toBe('firefox');
    expect(
      detectPlatform(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
      ).family,
    ).toBe('safari');
    expect(
      detectPlatform(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36 Edg/120.0',
      ).family,
    ).toBe('desktop');
  });
});

describe('installInstructions', () => {
  it('gives steps for every platform family', () => {
    for (const family of ['ios', 'android', 'safari', 'firefox', 'desktop']) {
      expect(installInstructions({ family, safari: true }).length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('contact form', () => {
  const valid = {
    name: 'Amina',
    email: 'amina@example.com',
    topic: CONTACT_TOPICS[1],
    message: 'Hello there',
  };

  it('accepts a complete form', () => {
    expect(validateContact(valid)).toEqual({});
  });

  it('reports each invalid field', () => {
    const errors = validateContact({ name: ' ', email: 'nope', topic: 'x', message: '' });
    expect(Object.keys(errors).sort()).toEqual(['email', 'message', 'name', 'topic']);
  });

  it('builds a mailto link addressed to the public email with encoded content', () => {
    const link = buildMailtoLink(valid);
    expect(link.startsWith('mailto:info@chatify.com?')).toBe(true);
    const params = new URL(link).searchParams;
    expect(params.get('subject')).toBe('Account help - Amina');
    expect(params.get('body')).toContain('Hello there');
    expect(params.get('body')).toContain('amina@example.com');
  });
});

describe('site contact details and navigation', () => {
  it('uses the published phone number for tel and WhatsApp links', () => {
    expect(TEL_URL).toBe('tel:+254743336009');
    expect(WHATSAPP_URL).toBe('https://wa.me/254743336009');
  });

  it('matches active paths ignoring hashes', () => {
    expect(isActivePath('/features#files', '/features')).toBe(true);
    expect(isActivePath('/', '/about')).toBe(false);
    expect(isActivePath('/', '/')).toBe(true);
  });

  it('only links to routes that exist', () => {
    const routes = readFileSync(path.join(here, '..', 'src', 'app', 'App.jsx'), 'utf8');
    const targets = SITE_NAV.flatMap((entry) =>
      entry.type === 'menu' ? entry.items.map((item) => item.to) : [entry.to],
    );
    for (const target of targets) {
      const [route] = target.split('#');
      expect(routes).toContain(`path="${route}"`);
    }
  });

  it('points every hash link at an id defined on its page', () => {
    const pages = { '/features': 'FeaturesPage', '/help': 'HelpPage' };
    for (const entry of SITE_NAV.filter((item) => item.type === 'menu')) {
      for (const item of entry.items) {
        const [route, hash] = item.to.split('#');
        if (!hash) continue;
        const source = read('src', 'features', 'public', `${pages[route]}.jsx`);
        expect(source).toMatch(new RegExp(`id[=:] ?["']${hash}["']`));
      }
    }
  });
});

describe('web app manifest', () => {
  const manifest = JSON.parse(read('public', 'manifest.webmanifest'));
  const tokens = read('src', 'styles', 'tokens.css');
  const token = (name) =>
    tokens.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`))[1].toLowerCase();

  it('is installable: name, start url, standalone display and sized icons', () => {
    expect(manifest.name).toBe('Chatify');
    expect(manifest.start_url).toBe('/chats');
    expect(manifest.display).toBe('standalone');
    const sizes = manifest.icons.map((icon) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
  });

  it('uses the design token colors', () => {
    expect(manifest.theme_color.toLowerCase()).toBe(token('cocoa'));
    expect(manifest.background_color.toLowerCase()).toBe(token('oat'));
  });

  it('only references icon files that exist', () => {
    for (const icon of manifest.icons) {
      expect(() => readFileSync(path.join(here, '..', 'public', icon.src))).not.toThrow();
    }
  });
});
