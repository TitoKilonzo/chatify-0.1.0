import { useState } from 'react';
import { Mail, MessageCircle, Phone, Send } from 'lucide-react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { useFormValues } from '../../hooks/useFormValues.js';
import { buildMailtoLink, CONTACT_TOPICS, validateContact } from '../../lib/contact.js';
import { PageHeader } from './PageHeader.jsx';
import { CONTACT, MAILTO_URL, TEL_URL, WHATSAPP_URL } from './site.js';
import styles from './Pages.module.css';

const CHANNELS = [
  { icon: Mail, label: 'Email', value: CONTACT.email, href: MAILTO_URL },
  { icon: Phone, label: 'Phone', value: CONTACT.phoneDisplay, href: TEL_URL },
  {
    icon: MessageCircle,
    label: 'WhatsApp',
    value: `Chat on ${CONTACT.phoneDisplay}`,
    href: WHATSAPP_URL,
    external: true,
  },
];

export function ContactPage() {
  usePageTitle('Contact');
  const [values, handleChange] = useFormValues({
    name: '',
    email: '',
    topic: CONTACT_TOPICS[0],
    message: '',
  });
  const [errors, setErrors] = useState({});
  const [opened, setOpened] = useState(false);

  function onChange(event) {
    const { name } = event.target;
    handleChange(event);
    setOpened(false);
    setErrors(({ [name]: _removed, ...rest }) => rest);
  }

  function onSubmit(event) {
    event.preventDefault();
    const found = validateContact(values);
    setErrors(found);
    const [firstInvalid] = Object.keys(found);
    if (firstInvalid) {
      event.currentTarget.elements.namedItem(firstInvalid)?.focus();
      return;
    }
    // Chatify has no contact endpoint: the message is handed to the visitor's own email app.
    window.location.href = buildMailtoLink(values);
    setOpened(true);
  }

  return (
    <>
      <PageHeader
        eyebrow="Contact"
        title="Talk to us"
        lead="Questions, problems or ideas. Choose the channel that suits you."
      />
      <div className={styles.container}>
        <div className={styles.contactGrid}>
          <div className={styles.channels}>
            {CHANNELS.map(({ icon: Icon, label, value, href, external }) => (
              <a
                key={label}
                href={href}
                className={styles.channel}
                {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                <span className={styles.cardIcon}>
                  <Icon size={20} aria-hidden="true" />
                </span>
                <span>
                  <span className={styles.channelLabel}>{label}</span>
                  <span className={styles.channelValue}>{value}</span>
                </span>
              </a>
            ))}
          </div>

          <form className={styles.form} onSubmit={onSubmit} noValidate>
            <h2 className={styles.subheading}>Send a message</h2>
            <p className={styles.muted}>
              Sending opens your email app with your message ready to go to {CONTACT.email}.
            </p>
            {opened ? (
              <Alert variant="success">
                Your email app should now be open. If nothing happened, write to {CONTACT.email}{' '}
                directly.
              </Alert>
            ) : null}
            <Input
              label="Your name"
              name="name"
              value={values.name}
              onChange={onChange}
              error={errors.name}
              autoComplete="name"
              required
            />
            <Input
              label="Your email"
              name="email"
              type="email"
              value={values.email}
              onChange={onChange}
              error={errors.email}
              autoComplete="email"
              required
            />
            <div>
              <label htmlFor="contact-topic" className={styles.fieldLabel}>
                Topic
              </label>
              <select
                id="contact-topic"
                name="topic"
                className={styles.select}
                value={values.topic}
                onChange={onChange}
              >
                {CONTACT_TOPICS.map((topic) => (
                  <option key={topic} value={topic}>
                    {topic}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="contact-message" className={styles.fieldLabel}>
                Message
              </label>
              <textarea
                id="contact-message"
                name="message"
                className={styles.textarea}
                value={values.message}
                onChange={onChange}
                aria-invalid={errors.message ? true : undefined}
                aria-describedby={errors.message ? 'contact-message-error' : undefined}
                required
              />
              {errors.message ? (
                <p id="contact-message-error" role="alert" className={styles.muted}>
                  {errors.message}
                </p>
              ) : null}
            </div>
            <Button type="submit" variant="primary" leadingIcon={Send}>
              Send message
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}
