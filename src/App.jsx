import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Ordenes } from './pages/Ordenes';
import { Repertorio } from './pages/Repertorio';
import { Bandas } from './pages/Bandas';
import { Miembros } from './pages/Miembros';
import { useAuthStore } from './stores/authStore';
import { useAppStore } from './stores/appStore';

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
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="ordenes" element={<Ordenes />} />
          <Route path="repertorio" element={<Repertorio />} />
          <Route path="bandas" element={<Bandas />} />
          <Route path="miembros" element={<Miembros />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
