import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/base.css';
import { App } from './app/App.jsx';
import { registerSessionExpiry } from './features/auth/useSession.js';
import { queryClient } from './lib/queryClient.js';

registerSessionExpiry(queryClient);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
