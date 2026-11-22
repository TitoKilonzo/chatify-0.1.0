import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from '../components/ErrorBoundary.jsx';
import { GuestOnly, RequireAuth } from '../features/auth/guards.jsx';
import { LoginPage } from '../features/auth/LoginPage.jsx';
import { RegisterPage } from '../features/auth/RegisterPage.jsx';
import { ChatLayout } from '../features/chat/ChatLayout.jsx';
import { ConversationPane } from '../features/chat/ConversationPane.jsx';
import { EmptyPane } from '../features/chat/EmptyPane.jsx';
import { SettingsPage } from '../features/profile/SettingsPage.jsx';
import { queryClient } from '../lib/queryClient.js';
import { AppShell } from './AppShell.jsx';
import { NotFoundPage } from './NotFoundPage.jsx';

export function App() {
  return (
    <ErrorBoundary onReset={() => window.location.reload()}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/chats" replace />} />

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
              </Route>
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
