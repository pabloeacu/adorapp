import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Ordenes } from './pages/Ordenes';
import { Repertorio } from './pages/Repertorio';
import { Bandas } from './pages/Bandas';
import { Miembros } from './pages/Miembros';
import { Solicitudes } from './pages/Solicitudes';
import { Comunicaciones } from './pages/Comunicaciones';
import { useAuthStore } from './stores/authStore';
import { useAppStore } from './stores/appStore';

// Auto-sync strategy:
//   - On route change: re-fetch (kept; cheap and gives fresh data on user navigation).
//   - On window focus / tab visibility change: re-fetch (catches changes made in
//     other tabs or after returning from background without spamming the DB).
//   - Realtime subscriptions on individual tables handle live changes (see Header
//     and MobileNav for the bell, and the appStore subscriptions below for the
//     CRUD tables). The previous 30-second polling interval is gone — Realtime
//     covers it without burning egress quota.
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

  // Show loading spinner while initializing
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
      </RouteSync>
    </BrowserRouter>
  );
}

export default App;
