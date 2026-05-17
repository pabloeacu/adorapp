import React, { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { PageLoader } from './components/ui/PageLoader';
import { useAuthStore } from './stores/authStore';
import { useAppStore } from './stores/appStore';
import { useCurrentRole } from './hooks/useCurrentMember';

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

const RouteFallback = () => <PageLoader />;

// Guards a route so plain members get redirected. Pastors and leaders pass through.
// Used for /miembros: members shouldn't even land on it via URL — bandas/orders
// still show member names via their own components, that's where they discover
// who's who.
const MembersOnlyRoles = ({ children }) => {
  const role = useCurrentRole();
  if (role === 'member') return <Navigate to="/" replace />;
  return children;
};

// Auto-sync strategy:
//   - On route change: re-fetch, but throttled — if the realtime layer ran <15s
//     ago, skip; the data is already fresh and re-spamming the DB on every tap
//     causes flickering on slow networks.
//   - On window focus / tab visibility change: same throttle. Realtime sync
//     handles in-session changes, so the focus refresh is just a safety net
//     for the case where the WS was dropped while the app was suspended.
//   - Live data updates flow through src/lib/realtimeSync.js (postgres_changes
//     on members/bands/songs/orders, mounted from Layout).
const REFRESH_THROTTLE_MS = 15_000;
let lastRefreshAt = 0;

const RouteSync = ({ children }) => {
  const location = useLocation();
  const initializeApp = useAppStore((state) => state.initialize);
  const refreshProfile = useAuthStore((state) => state.refreshProfile);
  const user = useAuthStore((state) => state.user);

  const refreshIfStale = useCallback(() => {
    const now = Date.now();
    if (now - lastRefreshAt < REFRESH_THROTTLE_MS) return;
    lastRefreshAt = now;
    initializeApp();
    refreshProfile();
  }, [initializeApp, refreshProfile]);

  useEffect(() => {
    if (!user) return;
    refreshIfStale();
  }, [location.pathname, user, refreshIfStale]);

  useEffect(() => {
    if (!user) return;
    const onFocus = () => {
      if (document.visibilityState === 'visible') refreshIfStale();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [user, refreshIfStale]);

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
    return <PageLoader fullscreen label="Cargando AdorAPP..." />;
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
              <Route path="miembros" element={<MembersOnlyRoles><Miembros /></MembersOnlyRoles>} />
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
