// Lógica pura de los banners de las áreas observadoras (Multimedia / Sonido) en el
// inicio. Decide, según los órdenes programados y la fecha de hoy (ART), QUÉ mensaje
// mostrar por área y a qué orden apuntar el atajo. Sin dependencias de React/DOM →
// testeable en aislamiento.

const dayOf = (o) => String(o.date).slice(0, 10);
const rehearsalOf = (o) => (o.rehearsalDate ? String(o.rehearsalDate).slice(0, 10) : null);

const scheduledSorted = (orders) =>
  (orders || [])
    .filter((o) => o && o.status === 'scheduled' && o.date)
    .slice()
    .sort((a, b) =>
      dayOf(a).localeCompare(dayOf(b)) || String(a.time || '').localeCompare(String(b.time || ''))
    );

// Un orden "cambió" si el trigger le selló content_changed_at (contentChangedAt) DESPUÉS
// de crearse, dentro de la ventana reciente (changedSinceART = hoy − 7 días), y sigue
// vigente (fecha >= hoy). Es el nudge "¡Ojo! Hubo cambios, ¿ya los viste?".
const recentlyChanged = (o, todayART, changedSinceART) =>
  !!o.contentChangedAt &&
  String(o.contentChangedAt).slice(0, 10) >= changedSinceART &&
  (!o.createdAt || String(o.contentChangedAt) > String(o.createdAt)) &&
  dayOf(o) >= todayART;

// Devuelve { state, order } para un área observadora, o null si no hay nada relevante.
// Prioridad: cambios recientes > servicio hoy > ensamble hoy (solo Sonido) > próximo orden.
export function pickObserverFocus(area, orders, todayART, changedSinceART) {
  if (area !== 'sonido' && area !== 'multimedia') return null;
  const sched = scheduledSorted(orders);

  // El nudge de cambios manda: el orden cambiado más próximo.
  const changed = sched.find((o) => recentlyChanged(o, todayART, changedSinceART));
  if (changed) return { state: 'changed', order: changed };

  const serviceToday = sched.find((o) => dayOf(o) === todayART);
  const nextFuture = sched.find((o) => dayOf(o) > todayART);

  if (serviceToday) return { state: 'service', order: serviceToday };
  if (area === 'sonido') {
    const ensambleToday = sched.find((o) => rehearsalOf(o) === todayART);
    if (ensambleToday) return { state: 'ensamble', order: ensambleToday };
  }
  if (nextFuture) return { state: 'new', order: nextFuture };
  return null;
}

// El texto de "cambios" es el MISMO para ambas áreas (cada una con su logo/color).
const CHANGED = {
  title: '¡Ojo! Hubo cambios en el orden.',
  message: '¿Ya los viste? Revisá el orden y la formación para no quedarte afuera de ningún ajuste.',
};

const CONTENT = {
  sonido: {
    changed: CHANGED,
    ensamble: {
      title: '¡Hoy hay ensamble!',
      message: '¿Ya está listo el operador? Mirá la banda y el repertorio del orden.',
    },
    service: {
      title: '¡Hoy hay servicio!',
      message: '¿Está todo listo? Repasá el orden y la formación para afinar los detalles de la mezcla.',
    },
    new: {
      title: '¡Hay un orden nuevo!',
      message: 'Accedé a él para prepararte para tu servicio.',
    },
  },
  multimedia: {
    changed: CHANGED,
    service: {
      title: '¡Hoy hay servicio!',
      message: '¿Está todo listo? Repasá el orden y la formación para saber dónde apuntar las cámaras y pasar las letras como un reloj suizo.',
    },
    new: {
      title: '¡Hay un orden nuevo!',
      message: 'Accedé a él para prepararte para tu servicio. ¿Hay letras por copiar?',
    },
  },
};

export function observerBannerContent(area, state) {
  return (CONTENT[area] && CONTENT[area][state]) || null;
}
