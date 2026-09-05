import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileNav } from './MobileNav';
import { CommandPalette } from '../CommandPalette';
import { OnboardingWizard } from '../OnboardingWizard';
import { UpdateBanner } from '../UpdateBanner';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useCurrentMember } from '../../hooks/useCurrentMember';
import { startRealtimeSync, stopRealtimeSync } from '../../lib/realtimeSync';
import { supabase } from '../../lib/supabase';
import { isInstalled } from '../../lib/installPrompt';

export const Layout = () => {
  const user = useAuthStore((state) => state.user);
  const [wizardDismissed, setWizardDismissed] = useState(false);
  const currentMember = useCurrentMember();

  // Realtime sync for members/bands/songs/orders. Mounted only while the
  // user is logged in (Layout itself only renders post-auth). Stops on logout
  // via the cleanup return.
  useEffect(() => {
    if (!user) return;
    startRealtimeSync();
    return () => stopRealtimeSync();
  }, [user]);

  // Registra la actividad del miembro para la ficha del pastor: "última conexión"
  // (cada apertura de la app) y "app instalada" (si corre en modo standalone).
  // Va por la RPC record_member_activity (SECURITY DEFINER): actualiza SOLO la
  // propia fila en member_activity (set-once del app_installed_at server-side),
  // sin tocar members (así no contamina su audit ni churnea updated_at).
  // Throttled a 1 vez por día por miembro. isInstalled() se re-evalúa cada vez,
  // así que si un día abren la app ya instalada, ese día se registra.
  useEffect(() => {
    const memberId = currentMember?.id;
    if (!memberId) return;
    let cancelled = false;
    (async () => {
      try {
        const key = `adorapp_activity_${memberId}`;
        const today = new Date().toISOString().slice(0, 10);
        let last = null;
        try { last = localStorage.getItem(key); } catch { /* bloqueado → registrar igual */ }
        if (last === today) return; // ya registrado hoy
        const { error } = await supabase.rpc('record_member_activity', { p_installed: isInstalled() });
        if (!cancelled && !error) {
          try { localStorage.setItem(key, today); } catch { /* no crítico */ }
        }
      } catch { /* no crítico: la actividad no debe romper la app */ }
    })();
    return () => { cancelled = true; };
  }, [currentMember?.id]);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="w-full h-full min-h-screen min-h [-webkit-fill-available] bg-black text-white flex flex-col">
      {/* Global ⌘K / Ctrl+K palette — mounted once at the layout root */}
      <CommandPalette />

      {/* New-build available toast (driven by the service worker) */}
      <UpdateBanner />

      {/* Welcome wizard for newly-approved members */}
      {currentMember && currentMember.onboarded === false && !wizardDismissed && (
        <OnboardingWizard
          member={currentMember}
          onClose={() => setWizardDismissed(true)}
        />
      )}

      {/* Mobile Navigation */}
      <MobileNav />

      {/* Desktop Sidebar */}
      <div className="hidden lg:block fixed inset-y-0 left-0 z-30">
        <Sidebar />
      </div>

      {/* Desktop Header */}
      <div className="hidden lg:block fixed top-0 right-0 left-64 z-20">
        <Header />
      </div>

      {/* Main Content - Full height mobile */}
      <div className="flex-1 lg:pl-64 flex flex-col lg:pt-0 overflow-hidden">
        {/* Desktop Content */}
        <div className="hidden lg:block h-screen pt-16">
          <main className="p-6 h-[calc(100vh-64px)] overflow-y-auto">
            <Outlet />
          </main>
        </div>

        {/* Mobile Content - Full screen */}
        <div
          className="lg:hidden flex-1 overflow-y-auto overflow-x-hidden"
          style={{
            paddingTop: 'calc(56px + env(safe-area-inset-top, 0px))',
            // Clear the fixed bottom nav (h-20 = 80px) plus the gesture-bar
            // safe area, so the last items scroll fully into view instead of
            // sitting hidden behind the bar. pb-16 (64px) ignored the safe
            // area and cut off the last row on phones with a gesture bar.
            paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 0px))',
          }}
        >
          <main className="p-4">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
};
