import React, { useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { useAuthStore } from './stores/authStore';
import { useAppStore } from './stores/appStore';

// Lazy-loaded route components. Each compiles into its own chunk, so a user
// who only ever opens Login / Dashboard does not download the Repertorio
// editor, the PDF generator, or the photo cropper at first paint.
//
// `.then(m => ({ default: m.Foo }))` is needed because the page modules use
// named exports rather than default ones.
const lazyPage = (importer, name) =>
  lazy(() => importer().then(m => ({ default: m[name] })));

const Login = lazyPage(() => import('./pages/Login'), 'Login');
const Dashboard = lazyPage(() => import('./pages/Dashboard'), 'Dashboard');
const Ordenes = lazyPage(() => import('./pages/Ordenes'), 'Ordenes');
const Repertorio = lazyPage(() => import('./pages/Repertorio'), 'Repertorio');
const Bandas = lazyPage(() => import('./pages/Bandas'), 'Bandas');
const Miembros = lazyPage(() => import('./pages/Miembros'), 'Miembros');
const Solicitudes = lazyPage(() => import('./pages/Solicitudes'), 'Solicitudes');
const Comunicaciones = lazyPage(() => import('./pages/Comunicaciones'), 'Comunicaciones');

const RouteFallback = () => (
  <div
    role="status"
    aria-live="polite"
    className="min-h-[40vh] flex items-center justify-center"
  >
    <span className="sr-only">Cargando…</span>
    <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-white animate-spin" />
  </div>
);

// Auto-sync strategy:
//   - On route change: re-fetch (kept; cheap and gives fresh data on user navigation).
//   - On window focus / tab visibility change: re-fetch (catches changes made in
//     other tabs or after returning from background without spamming the DB).
//   - Realtime subscriptions on individual tables handle live changes.
const RouteSync = ({ children }) => {
  const location = useLocation();
  const initializeApp = useAppStore((state) => state.initialize);
  const refreshProfile = useAuthStore((state) => state.refreshProfile);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    if (!user) return;
    initializeApp();
    refreshProfile();
  }, [location.pathname, user, initializeApp, refreshProfile]);

  useEffect(() => {
    if (!user) return;
    const onFocus = () => {
      if (document.visibilityState === 'visible') {
        initializeApp();
        refreshProfile();
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [user, initializeApp, refreshProfile]);

  return children;
};

function App() {
  const [initialized, setInitialized] = useState(false);
  const initializeAuth = useAuthStore((state) => state.initialize);
  const initializeApp = useAppStore((state) => state.initialize);
  const authLoading = useAuthStore((state) => state.loading);

  useEffect(() => {
    const init = async () => {
      await initializeAuth();
      await initializeApp();
      setInitialized(true);
    };
    init();
  }, [initializeAuth, initializeApp]);

  if (!initialized || authLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <img
            src="/logo.png"
            alt="AdorAPP Logo"
            className="w-16 h-16 rounded-2xl mx-auto mb-4 object-contain animate-pulse"
          />
          <p className="text-gray-500">Cargando AdorAPP...</p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <RouteSync>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="ordenes" element={<Ordenes />} />
              <Route path="repertorio" element={<Repertorio />} />
              <Route path="bandas" element={<Bandas />} />
              <Route path="miembros" element={<Miembros />} />
              <Route path="solicitudes" element={<Solicitudes />} />
              <Route path="comunicaciones" element={<Comunicaciones />} />
            </Route>
          </Routes>
        </Suspense>
      </RouteSync>
    </BrowserRouter>
  );
}

export default App;
