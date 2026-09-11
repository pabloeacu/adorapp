import React from 'react';
import { Clock } from 'lucide-react';
import { UsersThree } from '@phosphor-icons/react';
import { useAppStore } from '../../stores/appStore';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { isCustomLineup } from '../../lib/lineup';

/**
 * Vista de la formación de un orden (detalle, presentador). Agrupa por
 * instrumento en el orden canónico; "Participan todos" muestra la banda efectiva.
 * `compact` → una sola línea de chips (para tarjetas).
 */
export const LineupSummary = ({ order, compact = false }) => {
  const getOrderLineupGroups = useAppStore((s) => s.getOrderLineupGroups);
  const getOrderParticipants = useAppStore((s) => s.getOrderParticipants);
  useAppStore((s) => s.members); useAppStore((s) => s.bandTemporaryMembers); useAppStore((s) => s.bands);

  if (!order) return null;
  const custom = isCustomLineup(order);
  const participants = getOrderParticipants(order);
  const { groups, noInstrument } = getOrderLineupGroups(order);

  if (participants.length === 0) {
    return <p className="text-sm text-gray-500">Sin integrantes en la banda de este orden.</p>;
  }

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-1.5" data-testid="lineup-summary-compact">
        <Badge variant={custom ? 'gold' : 'primary'} size="sm">
          <span className="inline-flex items-center gap-1"><UsersThree size={12} weight="duotone" /> {custom ? `${participants.length} en la formación` : `Toda la banda (${participants.length})`}</span>
        </Badge>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="lineup-summary">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={custom ? 'gold' : 'primary'} size="md">
          <span className="inline-flex items-center gap-1.5"><UsersThree size={14} weight="duotone" /> {custom ? `Participan ${participants.length} de la banda` : `Participa toda la banda (${participants.length})`}</span>
        </Badge>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {groups.map((g) => (
          <div key={g.instrument} className="rounded-xl bg-neutral-800/50 p-3">
            <p className="text-[11px] uppercase tracking-wide text-gold-300/80 font-medium mb-1.5">{g.instrument}</p>
            <div className="flex flex-wrap gap-2">
              {g.members.map((m) => (
                <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 pl-1 pr-3 py-1 text-xs text-gray-200 ring-1 ring-neutral-700/60">
                  <Avatar name={m.name} src={m.avatarUrl} size="sm" className="!w-6 !h-6 !text-[10px]" />
                  {m.name}
                  {m.temporary && <Clock size={11} className="text-gold-300" />}
                </span>
              ))}
            </div>
          </div>
        ))}
        {noInstrument.length > 0 && (
          <div className="rounded-xl bg-neutral-800/50 p-3">
            <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium mb-1.5">También participan</p>
            <div className="flex flex-wrap gap-2">
              {noInstrument.map((m) => (
                <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 pl-1 pr-3 py-1 text-xs text-gray-200 ring-1 ring-neutral-700/60">
                  <Avatar name={m.name} src={m.avatarUrl} size="sm" className="!w-6 !h-6 !text-[10px]" />
                  {m.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
