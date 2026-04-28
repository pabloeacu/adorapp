import React from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileNav } from './MobileNav';
import { CommandPalette } from '../CommandPalette';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

export const Layout = () => {
  const user = useAuthStore((state) => state.user);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="w-full h-full min-h-screen min-h [-webkit-fill-available] bg-black text-white flex flex-col">
      {/* Global ⌘K / Ctrl+K palette — mounted once at the layout root */}
      <CommandPalette />

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
          className="lg:hidden flex-1 overflow-y-auto overflow-x-hidden pb-16"
          style={{ paddingTop: 'calc(56px + env(safe-area-inset-top, 0px))' }}
        >
          <main className="p-4">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
};
