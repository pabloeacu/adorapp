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

// Component that auto-syncs on every route change and periodically
const RouteSync = ({ children }) => {
  const location = useLocation();
  const initializeApp = useAppStore((state) => state.initialize);
  const refreshProfile = useAuthStore((state) => state.refreshProfile);
  const user = useAuthStore((state) => state.user);

  // AUTO-SYNC on every route change - NEVER cache profile data
  useEffect(() => {
    const syncData = async () => {
      if (user) {
        // ALWAYS reload from Supabase - no cache
        await initializeApp();
        await refreshProfile();
      }
    };
    syncData();
  }, [location.pathname, user, initializeApp, refreshProfile]);

  // AUTO-SYNC every 30 seconds - keeps data fresh from database
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(async () => {
      await initializeApp();
      await refreshProfile();
    }, 30000); // Sync every 30 seconds

    return () => clearInterval(interval);
  }, [user, initializeApp, refreshProfile]);

  return children;
};

function App() {
  const [initialized, setInitialized] = useState(false);
  const initializeAuth = useAuthStore((state) => state.initialize);
  const initializeApp = useAppStore((state) => state.initialize);
  const setAutoRefresh = useAppStore((state) => state.setAutoRefresh);
  const authLoading = useAuthStore((state) => state.loading);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    const init = async () => {
      await initializeAuth();
      await initializeApp();

      // Enable auto-refresh every 5 minutes for PWA (runs in background)
      setAutoRefresh(5);

      setInitialized(true);
    };
    init();
  }, [initializeAuth, initializeApp, setAutoRefresh]);

  // Disable auto-refresh on logout
  useEffect(() => {
    if (!user) {
      setAutoRefresh(0);
    }
  }, [user, setAutoRefresh]);

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
