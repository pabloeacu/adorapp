// Cartel recordatorio (cada 10 días) que estimula, por insistencia amable, a que
// la app quede funcional en el teléfono: instalarla y activar las notificaciones.
//
// Reglas (pedido de Paul):
//   - SOLO en teléfono/mobile (nunca en la compu).
//   - De a UNA consigna por vez, INSTALAR primero: si no está instalada → cartel de
//     instalar; si está instalada pero sin notificaciones → cartel de notificaciones;
//     si tiene ambas → nada.
//   - Cada 10 días (reloj por dispositivo). Si ese día no abrieron la app, aparece en
//     la próxima apertura. No invasivo: nunca más de un cartel cada 10 días.
//   - Copy ROTATIVO: dos variantes por consigna; cada aparición alterna A ↔ B.
//   - Notificaciones BLOQUEADAS: no se puede re-preguntar → texto con instrucciones
//     (sin botón que no funcionaría).
//
// 100% cliente: detección en vivo (standalone / permiso de notificaciones) + reloj en
// localStorage. La "instalación" y la "activación" reusan los flujos existentes.

export const NUDGE_CADENCE_MS = 10 * 24 * 60 * 60 * 1000; // 10 días
const KEY = 'adorapp:nudge';

// Copy con buena onda, dos variantes por consigna (rotan cada 10 días).
export const NUDGE_COPY = {
  install: [
    { title: 'Llevá AdorAPP con vos', body: 'Llevá AdorAPP en tu bolsillo 📲 — instalala en tu inicio y tenés el ministerio a un toque, sin buscar el navegador.' },
    { title: 'Sumala a tu inicio', body: '¿La sumamos a tu inicio? Instalá AdorAPP y entrá directo, más rápido y sin vueltas.' },
  ],
  notif: [
    { title: 'Activá las notificaciones', body: 'Activá las notificaciones 🔔 y enterate al instante: órdenes nuevas, ensambles, cambios y avisos del ministerio. No te pierdas nada de lo que se viene.' },
    { title: 'No te pierdas ningún aviso', body: 'Que no se te escape ningún aviso ✨ — activá las notificaciones y recibí en vivo todo lo del ministerio.' },
  ],
};

// Cuando el permiso está BLOQUEADO: el botón "Activar" no puede volver a preguntar.
// Mostramos cómo reactivarlas desde los ajustes (sin botón de acción).
export const NOTIF_BLOCKED_COPY = {
  title: 'Reactivá las notificaciones',
  body: 'Las tenés bloqueadas en este dispositivo. Para volver a recibirlas: tocá el candado 🔒 junto a la dirección (o el menú del navegador) → Notificaciones → Permitir.',
};

// ¿Es un teléfono/tablet (mobile) y NO una compu? La compu tiene puntero fino (mouse);
// el teléfono, puntero grueso (dedo). Decisión de Paul: solo en teléfono.
export const isMobileDevice = () => {
  try {
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
    if (/Android|iPhone|iPod|iPad/i.test(ua)) return true;
    const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
    const touch = typeof navigator !== 'undefined' && (navigator.maxTouchPoints || 0) > 0;
    return !!(coarse && touch);
  } catch { return false; }
};

// Fallback en memoria del reloj para cuando localStorage no está disponible (modo
// privado / cuota llena) — justo el público del cartel de instalar. No sobrevive a
// una recarga (imposible sin storage), pero degrada con gracia: dentro de la vida
// del módulo el reloj se respeta igual, así el cartel no se repite en cada lectura.
let memState = { lastShownAt: 0, shownCount: 0 };

// Estado del reloj (por dispositivo). Sin datos = nunca se mostró.
export const readNudgeState = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw) return { lastShownAt: Number(raw.lastShownAt) || 0, shownCount: Number(raw.shownCount) || 0 };
  } catch { /* sin storage → cae al fallback en memoria */ }
  return { ...memState };
};

// Registra que se mostró un cartel: sella el reloj (para los próximos 10 días) y
// avanza el contador (para rotar A ↔ B la próxima vez).
export const recordNudgeShown = (now) => {
  const next = { lastShownAt: now, shownCount: (readNudgeState().shownCount || 0) + 1 };
  memState = next; // siempre queda el reloj en memoria (fallback si el storage falla)
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* sin storage: queda el fallback en memoria, se re-evalúa la próxima carga */ }
};

/**
 * Decide qué cartel mostrar (PURO). El caller pasa el estado en vivo.
 * @returns {{ show: boolean, type: 'install'|'notif'|null, variant: 0|1, denied: boolean }}
 */
export const decideNudge = ({
  isMobile,
  isInstalled,
  notifEnabled,      // true = permiso 'granted' Y con suscripción activa
  notifDenied,       // true = permiso 'denied' (bloqueado)
  lastShownAt,
  shownCount,
  now,
  cadenceMs = NUDGE_CADENCE_MS,
}) => {
  const none = { show: false, type: null, variant: 0, denied: false };
  if (!isMobile) return none;

  // Prioridad: instalar primero; después notificaciones.
  let type = null;
  if (!isInstalled) type = 'install';
  else if (!notifEnabled) type = 'notif';
  if (!type) return none;

  // Reloj de 10 días (no invasivo): si se mostró hace menos, no repetimos.
  if (lastShownAt && now - lastShownAt < cadenceMs) return { ...none, type };

  return {
    show: true,
    type,
    variant: (Number(shownCount) || 0) % 2, // 0 → A, 1 → B (rota cada aparición)
    denied: type === 'notif' && !!notifDenied,
  };
};

// Copy final para un resultado de decideNudge (resuelve rotación + bloqueado).
export const copyForNudge = ({ type, variant, denied }) => {
  if (type === 'notif' && denied) return NOTIF_BLOCKED_COPY;
  const list = NUDGE_COPY[type];
  if (!list) return null;
  return list[variant % list.length];
};
