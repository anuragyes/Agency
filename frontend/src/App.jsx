import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import HomePage from './pages/HomePage/HomePage';
import AuthPage from './pages/SignupLogin/SignupLogin';
import NotFound from './pages/NotFound/NotFound';
import AppRoot from './app/AppRoot';
import AppLayout from './app/layout/AppLayout';
import { AuthProvider } from './app/context/AuthContext';
import ProtectedRoute from './app/components/ProtectedRoute';

/* ── New Sociva app (src/app). Pages are lazy-loaded so the landing page stays fast. ── */
const Onboarding = lazy(() => import('./app/pages/Onboarding'));
const Dashboard = lazy(() => import('./app/pages/Dashboard'));
const SocialAccounts = lazy(() => import('./app/pages/SocialAccounts'));
const ContentStudio = lazy(() => import('./app/pages/ContentStudio'));
const ContentEditor = lazy(() => import('./app/pages/ContentEditor'));
const Calendar = lazy(() => import('./app/pages/Calendar'));
const Pipeline = lazy(() => import('./app/pages/Pipeline'));
const Repurposing = lazy(() => import('./app/pages/Repurposing'));
const CompetitorResearch = lazy(() => import('./app/pages/CompetitorResearch'));
const Trends = lazy(() => import('./app/pages/Trends'));
const Competitors = lazy(() => import('./app/pages/Competitors'));
const Hashtags = lazy(() => import('./app/pages/Hashtags'));
const Audience = lazy(() => import('./app/pages/Audience'));
const PostAnalyst = lazy(() => import('./app/pages/PostAnalyst'));
const Inbox = lazy(() => import('./app/pages/Inbox'));
const DMAutomation = lazy(() => import('./app/pages/DMAutomation'));
const Leads = lazy(() => import('./app/pages/Leads'));
const Analytics = lazy(() => import('./app/pages/Analytics'));
const Settings = lazy(() => import('./app/pages/Settings'));

/* Old first-version pages — still reachable under /legacy/* */
const ProductBrain = lazy(() => import('./pages/ProductBrain/ProductBrain'));
const InstagramStudio = lazy(() => import('./pages/InstagramStudio/InstagramStudio'));

/* Scroll to top on page change, or to the #section when a hash is present */
function ScrollManager() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
        return;
      }
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);

  return null;
}

const Loading = () => (
  <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', color: '#9a9db0', fontFamily: 'Inter, sans-serif' }}>Loading…</div>
);

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ScrollManager />
        <Suspense fallback={<Loading />}>
          <Routes>
            {/* Landing page */}
            <Route path="/" element={<HomePage />} />

            {/* Auth — same page, tab is driven by the URL */}
            <Route path="/login" element={<AuthPage mode="signin" />} />
            <Route path="/signup" element={<AuthPage mode="signup" />} />
            <Route path="/signinup" element={<Navigate to="/signup" replace />} />
            <Route path="/signin" element={<Navigate to="/login" replace />} />

            {/* Sociva app — Protected Routes */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppRoot />}>
                <Route path="/onboarding" element={<Onboarding />} />
                <Route path="/app" element={<AppLayout />}>
                  <Route index element={<Dashboard />} />
                  <Route path="accounts" element={<SocialAccounts />} />
                  <Route path="account" element={<Navigate to="/app/accounts" replace />} />
                  <Route path="studio" element={<ContentStudio />} />
                  <Route path="editor" element={<ContentEditor />} />
                  <Route path="editor/:id" element={<ContentEditor />} />
                  <Route path="calendar" element={<Calendar />} />
                  <Route path="pipeline" element={<Pipeline />} />
                  <Route path="repurpose" element={<Repurposing />} />
                  <Route path="research" element={<CompetitorResearch />} />
                  <Route path="trends" element={<Trends />} />
                  <Route path="competitors" element={<Competitors />} />
                  <Route path="hashtags" element={<Hashtags />} />
                  <Route path="audience" element={<Audience />} />
                  <Route path="analyst" element={<PostAnalyst />} />
                  <Route path="inbox" element={<Inbox />} />
                  <Route path="dm" element={<DMAutomation />} />
                  <Route path="leads" element={<Leads />} />
                  <Route path="analytics" element={<Analytics />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="*" element={<Navigate to="/app" replace />} />
                </Route>
              </Route>
            </Route>

            {/* Account shortcuts */}
            <Route path="/account" element={<Navigate to="/app/accounts" replace />} />
            <Route path="/accounts" element={<Navigate to="/app/accounts" replace />} />

            {/* Old onboarding URLs -> new app */}
            <Route path="/onboarding/product" element={<Navigate to="/onboarding" replace />} />
            <Route path="/onboarding/instagram" element={<Navigate to="/app/studio" replace />} />
            <Route path="/dashboard" element={<Navigate to="/app" replace />} />
            <Route path="/legacy/product" element={<ProductBrain />} />
            <Route path="/legacy/instagram" element={<InstagramStudio />} />

            {/* Anything else */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
