import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/base.css';
import { App } from './app/App.jsx';
import { registerSessionExpiry } from './features/auth/useSession.js';
import { queryClient } from './lib/queryClient.js';
import { applyThemeColor, registerServiceWorker } from './lib/pwa.js';

// After a deploy, a tab that is still open may request a page chunk that no longer exists. The
// server answers 404 for it, Vite reports the failure here, and one reload fetches the new build.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  try {
    if (sessionStorage.getItem('chatify:chunk-reload') === '1') {
      return;
    }
    sessionStorage.setItem('chatify:chunk-reload', '1');
  } catch {
    // Storage can be blocked; reload once anyway.
  }
  window.location.reload();
});

registerSessionExpiry(queryClient);
applyThemeColor();
registerServiceWorker();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
