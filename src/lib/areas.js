// Registro de ÁREAS de ministerio — ESPEJO de los helpers SQL de la migración
// 20260911_multi_area_observers.sql (_area_email_slugs / _area_formation_slugs /
// _area_presenter_slugs / _area_label). Fuente única en el cliente.
//
// Para sumar un área nueva (intercesión, danza, anfitriones…): agregala a AREAS con su
// label + orden, decidí sus capacidades abajo, y editá el literal del helper SQL
// correspondiente. Cada área nueva se aborda individualmente (landmine #58).
//
// OJO: 'adoracion' es la etiqueta de los músicos/líderes; NO es un área "observadora"
// (no recibe correos por área ni abre el presentador por área — los músicos ya reciben
// todo por pertenecer a la banda). No confundir con `pastor_area` (el pastor que cubre
// a la persona, texto libre e independiente).

export const AREAS = [
  { slug: 'adoracion', label: 'Adoración', order: 10 },
  { slug: 'multimedia', label: 'Multimedia', order: 20 },
  { slug: 'sonido', label: 'Sonido', order: 30 },
];

const BY_SLUG = Object.fromEntries(AREAS.map((a) => [a.slug, a]));

// Capacidades por área (espejo exacto de los helpers SQL).
export const EMAIL_AREAS = ['multimedia', 'sonido']; // reciben mail de TODOS los órdenes
export const FORMATION_AREAS = ['multimedia', 'sonido']; // reciben el aviso de cambio SOLO de formación
export const PRESENTER_AREAS = ['multimedia', 'sonido']; // pueden abrir el presentador

// Áreas seleccionables en el formulario (todas las conocidas y activas).
export const SELECTABLE_AREAS = AREAS;

export function areaLabel(slug) {
  if (!slug) return '';
  return BY_SLUG[slug]?.label || slug.charAt(0).toUpperCase() + slug.slice(1);
}

// Normaliza las áreas de un miembro a un array limpio.
export function memberAreas(member) {
  const arr = Array.isArray(member?.areas) ? member.areas : [];
  return arr.filter(Boolean);
}

// Etiquetas ordenadas de las áreas del miembro (para badges).
// includeAdoracion=false devuelve solo las áreas observadoras (Multimedia/Sonido).
export function areaLabels(member, { includeAdoracion = true } = {}) {
  const set = new Set(memberAreas(member));
  return AREAS
    .filter((a) => set.has(a.slug) && (includeAdoracion || a.slug !== 'adoracion'))
    .map((a) => a.label);
}

// Etiquetas de las áreas OBSERVADORAS (no-Adoración) del miembro.
export function observerAreaLabels(member) {
  return areaLabels(member, { includeAdoracion: false });
}

const overlaps = (member, slugs) => {
  const set = new Set(memberAreas(member));
  return slugs.some((s) => set.has(s));
};

// Espejo de can_open_service_presenter(): el miembro tiene un área que abre el presentador.
export const canOpenPresenter = (member) => overlaps(member, PRESENTER_AREAS);

// El miembro es observador de un área (Multimedia/Sonido), no solo Adoración.
export const isAreaObserver = (member) => overlaps(member, PRESENTER_AREAS);
