import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/appStore';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { GoldWave } from '../ui/GoldWave';

// Encabezado premium de "Mi Adorapp" — SIEMPRE presente (personalización fija que
// pidió Paul). No hace ningún fetch bloqueante y está construido para NUNCA lanzar
// (corre bajo el ErrorBoundary raíz): todo con optional chaining y fallbacks. El
// único I/O es el versículo del día, que se carga aparte y, si falla, simplemente
// no se muestra — el saludo queda intacto.

const ROLE_LABELS = { pastor: 'Pastor', leader: 'Líder', member: 'Miembro' };

const timeGreeting = (hour) => {
  if (typeof hour !== 'number') return '¡Bienvenido/a de nuevo!';
  if (hour >= 6 && hour < 12) return '☀️ Buen día · que sea un gran día en el ministerio';
  if (hour >= 12 && hour < 20) return '🌤️ Buenas tardes · gracias por tu servicio';
  return '🌙 Buenas noches · descansá, el Rey cuida a los suyos';
};

export const GreetingHeader = ({ member, role, todayART, artHour, profileName }) => {
  const fetchDailyDevotional = useAppStore((s) => s.fetchDailyDevotional);
  const [devo, setDevo] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await fetchDailyDevotional?.();
        if (alive) setDevo(d || null);
      } catch {
        if (alive) setDevo(null);
      }
    })();
    return () => { alive = false; };
  }, [fetchDailyDevotional]);

  const rawName = (member?.name || profileName || '').trim();
  const firstName = rawName.split(/\s+/)[0] || '';

  // Cumpleaños PROPIO: comparar mes+día en ART (dato del propio usuario, seguro).
  const bdayMMDD = member?.birthdate ? String(member.birthdate).slice(5, 10) : null;
  const todayMMDD = (todayART || '').slice(5, 10);
  const isBirthday = !!bdayMMDD && bdayMMDD === todayMMDD;

  const blessing = <span className="text-gold-300">¡Bendiciones!</span>;
  let greeting;
  if (isBirthday) {
    greeting = <>¡Feliz cumpleaños{firstName ? `, ${firstName}` : ''}! 🎂 {blessing}</>;
  } else if (firstName) {
    greeting = <>Hola, {firstName}! {blessing}</>;
  } else {
    greeting = <>¡Hola! {blessing}</>;
  }

  const roleLabel = ROLE_LABELS[role] || null;
  const instrument = Array.isArray(member?.instruments) && member.instruments.length
    ? member.instruments[0]
    : null;
  const roleInstrument = [instrument, roleLabel].filter(Boolean).join(' · ');

  return (
    <div className="relative overflow-hidden rounded-2xl p-5 border border-gold-500/25 bg-gradient-to-br from-gold-600/[0.32] via-neutral-900 to-gold-300/[0.12]">
      <div className="gold-radial-glow pointer-events-none absolute -left-10 -top-10 h-52 w-52 rounded-full" aria-hidden="true" />
      <GoldWave className="absolute -top-3 right-0 w-3/5 h-28" opacity={0.4} flip />
      <div className="relative flex items-center gap-4">
        <Avatar name={rawName} src={member?.avatarUrl} size="xl" />
        <div className="min-w-0 flex-1">
          <p className="text-xl sm:text-2xl font-bold text-white leading-tight">{greeting}</p>
          <p className="text-sm text-gray-400 mt-1">{timeGreeting(artHour)}</p>
          {roleInstrument && (
            <div className="mt-2">
              <Badge variant="default" size="sm">{roleInstrument}</Badge>
            </div>
          )}
        </div>
      </div>

      {devo?.verse && (
        <div className="relative mt-4 pt-4 border-t border-gold-500/15">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gold-300/80 mb-1.5">
            Versículo del día
          </p>
          <p className="text-sm text-gray-200 italic leading-relaxed">“{devo.verse}”</p>
          {devo.reference && (
            <p className="text-xs text-gray-500 mt-1.5">{devo.reference} · RV1960</p>
          )}
        </div>
      )}
    </div>
  );
};
