import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';

const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const FeaturePage = lazy(() => import('./pages/FeaturePage').then((module) => ({ default: module.FeaturePage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })));
const AccountPage = lazy(() => import('./pages/AccountPage').then((module) => ({ default: module.AccountPage })));
const SpotifyCallbackPage = lazy(() => import('./pages/SpotifyCallbackPage').then((module) => ({ default: module.SpotifyCallbackPage })));

function PageFallback() {
  return <div className="module-loading">Loading...</div>;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Suspense fallback={<PageFallback />}><DashboardPage /></Suspense>} />
        <Route path="/login" element={<Suspense fallback={<PageFallback />}><LoginPage /></Suspense>} />
        <Route path="/account" element={<Suspense fallback={<PageFallback />}><AccountPage /></Suspense>} />
        <Route path="/callback" element={<Suspense fallback={<PageFallback />}><SpotifyCallbackPage /></Suspense>} />
        <Route path="/feature/:slug" element={<Suspense fallback={<PageFallback />}><FeaturePage /></Suspense>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
