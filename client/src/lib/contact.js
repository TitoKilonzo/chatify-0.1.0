import { CONTACT } from '../features/public/site.js';

export const CONTACT_TOPICS = [
  'General question',
  'Account help',
  'Report a problem',
  'Feedback or suggestion',
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MESSAGE_MAX = 2000;

/** Returns { field: message } for every invalid field, empty when the form can be sent. */
export function validateContact({ name, email, topic, message }) {
  const errors = {};
  if (!name.trim()) {
    errors.name = 'Your name is required';
  } else if (name.trim().length > 80) {
    errors.name = 'Name must be at most 80 characters';
  }
  if (!EMAIL_PATTERN.test(email.trim())) {
    errors.email = 'Enter a valid email address';
  }
  if (!CONTACT_TOPICS.includes(topic)) {
    errors.topic = 'Choose a topic';
  }
  if (!message.trim()) {
    errors.message = 'A message is required';
  } else if (message.trim().length > MESSAGE_MAX) {
    errors.message = `Message must be at most ${MESSAGE_MAX} characters`;
  }
  return errors;
}

/**
 * Build a mailto link that opens the visitor's own email app with the message ready to send.
 * There is no server endpoint for contact messages, so nothing is stored or sent by Chatify.
 */
export function buildMailtoLink({ name, email, topic, message }) {
  const subject = `${topic} - ${name.trim()}`;
  const body = `${message.trim()}\n\n--\n${name.trim()}\n${email.trim()}`;
  return `mailto:${CONTACT.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
