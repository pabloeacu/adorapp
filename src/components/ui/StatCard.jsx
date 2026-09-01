import React from 'react';
import { IconBadge } from './IconBadge';

// Tarjeta de estadística premium: barra dorada metálica arriba, número grande,
// sub-label dorado opcional, e ícono Phosphor duotono en badge dorado. Presentacional
// puro — quien la use decide si la envuelve en un <Link> (el Dashboard lo hace).
export const StatCard = ({ label, value, icon, sub, interactive = false }) => (
  <div
    className={`relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900 p-5 transition-all duration-200 h-full ${
      interactive ? 'hover-relief hover:border-gold-500/50 hover:bg-neutral-800/40 cursor-pointer' : ''
    }`}
  >
    {/* barra dorada metálica superior */}
    <div className="bg-gold-gradient absolute inset-x-0 top-0 h-0.5" />
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</p>
        <p className="mt-1.5 text-3xl font-extrabold text-white tabular-nums leading-none">{value}</p>
        {sub && <p className="mt-2 text-xs font-medium text-gold-300">{sub}</p>}
      </div>
      <IconBadge icon={icon} />
    </div>
  </div>
);
