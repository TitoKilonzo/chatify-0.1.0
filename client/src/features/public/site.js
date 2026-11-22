// Public contact details, used by the footer, the Contact page and the legal pages.
export const CONTACT = {
  email: 'info@chatify.com',
  phoneDisplay: '0743336009',
  // WhatsApp links use the international form without a leading plus sign or zero (Kenya: 254).
  whatsappNumber: '254743336009',
};

export const WHATSAPP_URL = `https://wa.me/${CONTACT.whatsappNumber}`;
export const TEL_URL = `tel:+${CONTACT.whatsappNumber}`;
export const MAILTO_URL = `mailto:${CONTACT.email}`;

/**
 * Site navigation. A "menu" entry renders as a dropdown in the header and as a labelled group in
 * the mobile panel and footer. Every target must be a real route (hash targets are section ids).
 */
export const SITE_NAV = [
  { type: 'link', label: 'Home', to: '/' },
  {
    type: 'menu',
    label: 'Features',
    items: [
      { label: 'All features', to: '/features' },
      { label: 'Direct messages', to: '/features#direct' },
      { label: 'Group chats', to: '/features#groups' },
      { label: 'File sharing', to: '/features#files' },
      { label: 'Security and privacy', to: '/features#security' },
    ],
  },
  { type: 'link', label: 'About', to: '/about' },
  {
    type: 'menu',
    label: 'Help',
    items: [
      { label: 'Get started', to: '/help#start' },
      { label: 'Install the app', to: '/help#install' },
      { label: 'Keyboard shortcuts', to: '/help#shortcuts' },
      { label: 'Questions and answers', to: '/help#faq' },
    ],
  },
  { type: 'link', label: 'Contact', to: '/contact' },
];

export const LEGAL_LINKS = [
  { label: 'Privacy policy', to: '/privacy' },
  { label: 'Terms of use', to: '/terms' },
];

/** True when a path (with optional hash) belongs to the current location. */
export function isActivePath(target, pathname) {
  const [targetPath] = target.split('#');
  return targetPath === '/' ? pathname === '/' : pathname === targetPath;
}
