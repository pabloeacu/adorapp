import React, { useMemo } from 'react';
import { Sparkles, Music2 } from 'lucide-react';
import { Pulse } from '@phosphor-icons/react';
import { useAppStore } from '../stores/appStore';
import { Modal } from './ui/Modal';
import { IconBadge } from './ui/IconBadge';
import { computeRepertoireInsights } from '../lib/repertoireInsights';

// Radiografía del repertorio — modal de SOLO LECTURA. No escribe nada: calcula en
// memoria desde las canciones y órdenes del store (helper puro repertoireInsights).
export const RepertoireInsightsModal = ({ isOpen, onClose }) => {
  const songs = useAppStore((s) => s.songs);
  const orders = useAppStore((s) => s.orders);

  // Sólo se calcula cuando el modal está abierto (evita trabajo con el modal cerrado).
  const r = useMemo(
    () => (isOpen ? computeRepertoireInsights(songs, orders) : null),
    [isOpen, songs, orders]
  );

  // Se monta SIEMPRE el <Modal> compartido (como el resto de la app) para que su
  // integración con el historial/back gesture quede balanceada (landmine #20).
  const climasConCanciones = r ? r.clima.filter((c) => c.count > 0).length : 0;
  const maxCount = r && r.clima.length ? r.clima[0].count || 1 : 1;
  const thinHistory = r ? r.historyWeeks > 0 && r.historyWeeks <= 8 : false;
  const tiles = r ? [
    { label: 'En rotación', val: r.buckets.saludable, cls: 'text-green-300 border-green-500/25 bg-green-500/10' },
    { label: 'Sobreutilizadas', val: r.buckets.sobreutilizada, cls: 'text-amber-300 border-amber-500/25 bg-amber-500/10' },
    { label: 'En riesgo de olvido', val: r.buckets.enRiesgo, cls: 'text-orange-300 border-orange-500/25 bg-orange-500/10' },
    { label: 'Dormidas', val: r.buckets.dormida, cls: 'text-gray-300 border-gray-500/25 bg-gray-500/10' },
    { label: 'Sin estrenar', val: r.buckets.sinEstrenar, cls: 'text-gold-300 border-gold-500/25 bg-gold-500/10' },
  ] : [];
  // Sugerencias: climas nunca sonados o hace mucho, para balancear el próximo orden.
  const gaps = r ? r.climaGaps.filter((g) => !g.everPlayed || g.weeksSince >= 4).slice(0, 5) : [];
  const rescate = r ? r.lists.sinEstrenar.slice(0, 8) : [];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Radiografía del repertorio" size="lg">
      {r && (
      <div className="space-y-6">
        {/* Resumen */}
        <div className="flex items-center gap-4">
          <IconBadge icon={Pulse} size="md" />
          <div className="min-w-0">
            <p className="text-2xl font-semibold text-white leading-tight">
              {r.total} <span className="text-base font-normal text-gray-400">canciones activas</span>
            </p>
            <p className="text-sm text-gray-500">
              en {climasConCanciones} climas
              {r.playedOrders > 0 && ` · ${r.playedOrders} ${r.playedOrders === 1 ? 'orden' : 'órdenes'} de historia`}
            </p>
          </div>
        </div>

        {/* Balance por clima */}
        <section>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold text-gray-200">Balance por clima</h3>
            <span className="text-xs text-gray-500">cuántas sirven para cada uno</span>
          </div>
          <div className="space-y-1.5">
            {r.clima.map((c) => (
              <div key={c.key} className="flex items-center gap-3">
                <span className="w-24 shrink-0 truncate text-sm text-gray-300" title={c.label}>{c.label}</span>
                <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-neutral-700/50">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-gold-400 to-gold-600"
                    style={{ width: `${c.count ? Math.max(4, (c.count / maxCount) * 100) : 0}%` }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right text-xs tabular-nums text-gray-400">
                  {c.count} · {c.pct}%
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-600">Una canción puede servir para varios climas, por eso no suma 100%.</p>
        </section>

        {/* Rotación */}
        <section>
          <h3 className="mb-3 text-sm font-semibold text-gray-200">Rotación y uso</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {tiles.map((t) => (
              <div key={t.label} className={`rounded-xl border px-3 py-2.5 ${t.cls}`}>
                <p className="text-xl font-semibold tabular-nums leading-none">{t.val}</p>
                <p className="mt-1 text-xs opacity-80">{t.label}</p>
              </div>
            ))}
          </div>
          {thinHistory && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-gray-500">
              <Sparkles size={13} className="mt-0.5 shrink-0 text-gold-300" />
              Con {r.historyWeeks} {r.historyWeeks === 1 ? 'semana' : 'semanas'} de historia, la rotación recién arranca — estos números se afinan solos a medida que cargás órdenes.
            </p>
          )}
        </section>

        {/* Rescate — canciones sin estrenar */}
        {rescate.length > 0 && (
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-200">
              <Music2 size={15} className="text-gold-300" /> Para rescatar
            </h3>
            <p className="mb-2 text-xs text-gray-500">
              {r.buckets.sinEstrenar} {r.buckets.sinEstrenar === 1 ? 'canción sin estrenar' : 'canciones sin estrenar'}. Algunas joyas esperando:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {rescate.map((s) => (
                <span key={s.id} className="rounded-lg bg-neutral-700/50 px-2.5 py-1 text-xs text-gray-300">{s.title}</span>
              ))}
            </div>
          </section>
        )}

        {/* Sugerencias de balance */}
        {gaps.length > 0 && (
          <section className="rounded-xl border border-gold-500/20 bg-gold-500/5 p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gold-200">
              <Sparkles size={15} /> Para balancear el próximo orden
            </h3>
            <ul className="space-y-1.5">
              {gaps.map((g) => (
                <li key={g.key} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-gray-200">{g.label}</span>
                  <span className="shrink-0 text-xs text-gray-400">
                    {g.everPlayed ? `hace ${g.weeksSince} ${g.weeksSince === 1 ? 'semana' : 'semanas'}` : 'todavía no sonó'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      )}
    </Modal>
  );
};
