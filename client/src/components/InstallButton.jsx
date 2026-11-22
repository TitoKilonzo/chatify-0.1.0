import { useState } from 'react';
import { Download } from 'lucide-react';
import { detectPlatform, promptInstall, useInstallState } from '../lib/pwa.js';
import { Button } from './ui/Button.jsx';
import { Dialog } from './ui/Dialog.jsx';
import styles from './InstallButton.module.css';

/** Steps shown when the browser cannot show its own install prompt. */
export function installInstructions(platform) {
  switch (platform.family) {
    case 'ios':
      return platform.safari
        ? [
            'Tap the Share button in the Safari toolbar.',
            'Scroll down and choose Add to Home Screen.',
            'Tap Add. Chatify now opens from your home screen like any other app.',
          ]
        : [
            'Open this page in Safari. Other iPhone and iPad browsers cannot add apps to the home screen.',
            'Tap the Share button, then choose Add to Home Screen.',
            'Tap Add.',
          ];
    case 'android':
      return [
        'Open the browser menu (the three dots).',
        'Choose Install app or Add to Home screen.',
        'Confirm. Chatify now opens from your home screen like any other app.',
      ];
    case 'safari':
      return [
        'In the menu bar, open the File menu.',
        'Choose Add to Dock.',
        'Confirm. Chatify now opens in its own window from the Dock.',
      ];
    case 'firefox':
      return [
        'Firefox on desktop cannot install web apps.',
        'Open Chatify in Chrome, Edge or Safari to install it, or keep using it in this tab.',
        'On Android, open the Firefox menu and choose Install.',
      ];
    default:
      return [
        'Look for the install icon at the right end of the address bar, or open the browser menu.',
        'Choose Install Chatify.',
        'Confirm. Chatify now opens in its own window, like any other app.',
      ];
  }
}

/**
 * Install App button. Uses the browser's native prompt when it is available and otherwise opens
 * a dialog with steps for the visitor's device. Renders nothing once the app is installed.
 */
export function InstallButton({ variant = 'ghost', size = 'md', className, onActivate }) {
  const { canPrompt, installed } = useInstallState();
  const [helpOpen, setHelpOpen] = useState(false);

  if (installed) {
    return null;
  }

  async function handleClick() {
    onActivate?.();
    if (canPrompt) {
      await promptInstall();
      return;
    }
    setHelpOpen(true);
  }

  const platform = detectPlatform(navigator.userAgent, navigator.maxTouchPoints);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        leadingIcon={Download}
        className={className}
        onClick={handleClick}
      >
        Install app
      </Button>
      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} title="Install Chatify" size="sm">
        <p className={styles.lead}>
          Install Chatify to open it from your home screen or desktop, in its own window.
        </p>
        <ol className={styles.steps}>
          {installInstructions(platform).map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </Dialog>
    </>
  );
}
