// Días de reunión: etiquetas y orden calendario (semana empezando en lunes).
//
// Plural español correcto: los días terminados en "s" (lunes, martes,
// miércoles, jueves, viernes) son INVARIANTES en plural ("los martes",
// nunca "los martess"). Solo sábado y domingo agregan la "s".
// Bug histórico: la tarjeta de Bandas hacía `${label}s` a ciegas → "Martess".

export const dayLabels = {
  domingo: 'Domingo',
  lunes: 'Lunes',
  martes: 'Martes',
  miercoles: 'Miércoles',
  jueves: 'Jueves',
  viernes: 'Viernes',
  sabado: 'Sábado',
};

export const dayPluralLabels = {
  domingo: 'Domingos',
  lunes: 'Lunes',
  martes: 'Martes',
  miercoles: 'Miércoles',
  jueves: 'Jueves',
  viernes: 'Viernes',
  sabado: 'Sábados',
};

// Semana litúrgica/laboral: lunes primero, domingo último. Con las bandas
// reales del ministerio esto rinde: martes, jueves, sábado, domingo.
const DAY_ORDER = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

const dayIndex = (day) => {
  const i = DAY_ORDER.indexOf(day);
  return i === -1 ? DAY_ORDER.length : i; // día desconocido/vacío → al final
};

// Orden de las tarjetas de Bandas: por día de la semana; a igual día, por
// horario; a igual horario, alfabético por nombre (estable y predecible).
export const compareBandsByCalendar = (a, b) => {
  const byDay = dayIndex(a.meetingDay) - dayIndex(b.meetingDay);
  if (byDay !== 0) return byDay;
  const byTime = String(a.meetingTime || '').localeCompare(String(b.meetingTime || ''));
  if (byTime !== 0) return byTime;
  return String(a.name || '').localeCompare(String(b.name || ''), 'es');
};
