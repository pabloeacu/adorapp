// Monthly calendar view for orders. No external date lib — the math is short
// enough to do directly. Renders a 6-row grid (max possible) so the layout
// doesn't reflow as the user pages between months.

import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const WEEKDAYS_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// Treat order.date as a local-day key. Slicing the YYYY-MM-DD prefix avoids
// the off-by-one that comes from Date(...).toISOString() drifting across UTC.
function dayKey(dateLike) {
  if (!dateLike) return '';
  const s = String(dateLike);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfMonth(year, month) {
  return new Date(year, month, 1);
}

// Monday-first weekday: 0..6 where 0=Mon, 6=Sun.
function weekdayMonFirst(date) {
  return (date.getDay() + 6) % 7;
}

const STATUS_COLOR = {
  scheduled: 'bg-blue-500/30 text-blue-200 border-blue-500/40',
  completed: 'bg-green-500/30 text-green-200 border-green-500/40',
  cancelled: 'bg-red-500/30 text-red-200 border-red-500/40 line-through',
};

export function OrderCalendar({ orders, getBandById, onSelectOrder }) {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => ({
    year: today.getFullYear(),
    month: today.getMonth(),
  }));

  // Bucket orders by their YYYY-MM-DD key once per render.
  const byDay = useMemo(() => {
    const map = new Map();
    orders.forEach((o) => {
      const k = dayKey(o.date);
      if (!k) return;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(o);
    });
    // Sort orders within a day by time so the column reads top-to-bottom.
    map.forEach((list) =>
      list.sort((a, b) => (a.time || '').localeCompare(b.time || ''))
    );
    return map;
  }, [orders]);

  // Build the 6×7 grid: pad with prev-month tail and next-month head so each
  // cell has a real date. Hidden cells get a muted style.
  const cells = useMemo(() => {
    const first = startOfMonth(cursor.year, cursor.month);
    const padBefore = weekdayMonFirst(first);
    const start = new Date(cursor.year, cursor.month, 1 - padBefore);
    const out = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      out.push(d);
    }
    return out;
  }, [cursor]);

  const goPrev = () =>
    setCursor((c) =>
      c.month === 0
        ? { year: c.year - 1, month: 11 }
        : { year: c.year, month: c.month - 1 }
    );
  const goNext = () =>
    setCursor((c) =>
      c.month === 11
        ? { year: c.year + 1, month: 0 }
        : { year: c.year, month: c.month + 1 }
    );
  const goToday = () =>
    setCursor({ year: today.getFullYear(), month: today.getMonth() });

  const todayKey = dayKey(today);

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrev}
            aria-label="Mes anterior"
            className="p-2 rounded-lg hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-white/40"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="Mes siguiente"
            className="p-2 rounded-lg hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-white/40"
          >
            <ChevronRight size={18} />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="px-3 py-1.5 text-xs rounded-lg border border-neutral-700 hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-white/40"
          >
            Hoy
          </button>
        </div>
        <h3 className="text-lg font-semibold capitalize">
          {MONTHS_ES[cursor.month]} {cursor.year}
        </h3>
      </div>

      <div className="grid grid-cols-7 gap-1 text-[11px] text-gray-500 uppercase tracking-wide mb-1">
        {WEEKDAYS_ES.map((w) => (
          <div key={w} className="px-2 py-1">{w}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          const k = dayKey(d);
          const inMonth = d.getMonth() === cursor.month;
          const isToday = k === todayKey;
          const dayOrders = byDay.get(k) || [];
          return (
            <div
              key={i}
              className={`min-h-[88px] border rounded-lg p-1.5 flex flex-col gap-1 ${
                inMonth
                  ? 'border-neutral-800 bg-neutral-900'
                  : 'border-neutral-900 bg-neutral-950 opacity-50'
              } ${isToday ? 'ring-1 ring-white/40' : ''}`}
            >
              <div className={`text-[11px] ${isToday ? 'text-white font-semibold' : 'text-gray-400'}`}>
                {d.getDate()}
              </div>
              {dayOrders.slice(0, 3).map((o) => {
                const band = getBandById(o.bandId);
                const cls = STATUS_COLOR[o.status] || STATUS_COLOR.scheduled;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => onSelectOrder?.(o)}
                    title={`${band?.name || 'Banda'} · ${o.time || ''}`}
                    className={`text-left text-[10px] px-1.5 py-0.5 rounded border truncate ${cls} hover:brightness-125 focus:outline-none focus:ring-2 focus:ring-white/40`}
                  >
                    {o.time ? `${o.time.slice(0, 5)} ` : ''}
                    {band?.name || 'Banda'}
                  </button>
                );
              })}
              {dayOrders.length > 3 && (
                <div className="text-[10px] text-gray-500">
                  +{dayOrders.length - 3} más
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
