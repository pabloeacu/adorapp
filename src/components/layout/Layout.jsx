import React from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileNav } from './MobileNav';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

export const Layout = () => {
  const user = useAuthStore((state) => state.user);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-black text-white">
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

      {/* Main Content */}
      <div className="lg:left-64 pt-14 lg:pt-0 pb-20 lg:pb-0 min-h-screen">
        {/* Desktop Content Wrapper */}
        <div className="hidden lg:block h-screen pt-16">
          <main className="p-6 h-[calc(100vh-64px)] overflow-y-auto">
            <Outlet />
          </main>
        </div>

        {/* Mobile Content Wrapper */}
        <div className="lg:hidden min-h-[calc(100vh-56px-56px)]">
          <main className="p-4 pb-2">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Mobile Bottom Safe Area Spacer */}
      <div className="lg:hidden h-safe-area-bottom" />
    </div>
  );
};
