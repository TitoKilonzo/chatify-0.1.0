import { lazy } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from '../components/ErrorBoundary.jsx';
import { GuestOnly, RequireAuth } from '../features/auth/guards.jsx';
import { LoginPage } from '../features/auth/LoginPage.jsx';
import { RegisterPage } from '../features/auth/RegisterPage.jsx';
import { ChatLayout } from '../features/chat/ChatLayout.jsx';
import { ConversationPane } from '../features/chat/ConversationPane.jsx';
import { EmptyPane } from '../features/chat/EmptyPane.jsx';
import { SettingsPage } from '../features/profile/SettingsPage.jsx';
import { CallsPage } from '../features/calls/CallsPage.jsx';
import { HomePage } from '../features/public/HomePage.jsx';
import { PublicLayout } from '../features/public/PublicLayout.jsx';
import { queryClient } from '../lib/queryClient.js';
import { AppShell } from './AppShell.jsx';
import { NotFoundPage } from './NotFoundPage.jsx';

// Public pages other than Home load on demand so signed-in users do not download them.
const AboutPage = lazy(() =>
  import('../features/public/AboutPage.jsx').then((m) => ({ default: m.AboutPage })),
);
const FeaturesPage = lazy(() =>
  import('../features/public/FeaturesPage.jsx').then((m) => ({ default: m.FeaturesPage })),
);
const HelpPage = lazy(() =>
  import('../features/public/HelpPage.jsx').then((m) => ({ default: m.HelpPage })),
);
const ContactPage = lazy(() =>
  import('../features/public/ContactPage.jsx').then((m) => ({ default: m.ContactPage })),
);
const PrivacyPage = lazy(() =>
  import('../features/public/PrivacyPage.jsx').then((m) => ({ default: m.PrivacyPage })),
);
const TermsPage = lazy(() =>
  import('../features/public/TermsPage.jsx').then((m) => ({ default: m.TermsPage })),
);

export function App() {
  return (
    <ErrorBoundary onReset={() => window.location.reload()}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/features" element={<FeaturesPage />} />
              <Route path="/help" element={<HelpPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>

            <Route element={<GuestOnly />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
            </Route>

            <Route element={<RequireAuth />}>
              <Route element={<AppShell />}>
                <Route path="/chats" element={<ChatLayout scope="all" />}>
                  <Route index element={<EmptyPane />} />
                  <Route path=":conversationId" element={<ConversationPane />} />
                </Route>
                <Route path="/groups" element={<ChatLayout scope="groups" />}>
                  <Route index element={<EmptyPane />} />
                  <Route path=":conversationId" element={<ConversationPane />} />
                </Route>
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/calls" element={<CallsPage />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
