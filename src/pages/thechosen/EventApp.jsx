import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { withChunkRecovery } from '../../lib/chunkRecovery';

// Sitio PÚBLICO del evento (The Chosen). Isla 100% aislada: se monta por un
// early-return en App.jsx cuando la ruta empieza con /thechosen, ANTES de todo
// el arranque de la app (auth, stores, realtime, boot). No toca nada de AdorApp.
const EventLanding = lazy(withChunkRecovery(() => import('./EventLanding').then((m) => ({ default: m.EventLanding }))));
const EventTicket = lazy(withChunkRecovery(() => import('./EventTicket').then((m) => ({ default: m.EventTicket }))));
const EventValidate = lazy(withChunkRecovery(() => import('./EventValidate').then((m) => ({ default: m.EventValidate }))));
const EventControl = lazy(withChunkRecovery(() => import('./EventControl').then((m) => ({ default: m.EventControl }))));

const Blank = () => <div style={{ minHeight: '100vh', background: '#0a0806' }} />;

export function EventApp() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Blank />}>
        <Routes>
          <Route path="/thechosen" element={<EventLanding />} />
          <Route path="/thechosen/entrada/:token" element={<EventTicket />} />
          <Route path="/thechosen/validar/:token" element={<EventValidate />} />
          <Route path="/thechosen/control" element={<EventControl />} />
          <Route path="/thechosen/*" element={<Navigate to="/thechosen" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
