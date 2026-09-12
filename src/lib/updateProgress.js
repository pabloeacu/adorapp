// Progreso de "Actualizando a la nueva versión" — estado compartido entre el
// registro del service worker (que detecta e instala la versión nueva), la
// pantalla de carga (que lo muestra) y el arranque de App (que lo completa).
//
// Cada avance corresponde a un hecho real (no a un temporizador):
//   found → downloading → installed → activating → reloading   (antes de recargar)
//   booting → session → data → done                            (después de recargar)
//
// La recarga la dispara el SW al tomar control; para que la segunda carga sepa
// que es una actualización, el paso 'reloading' se persiste en sessionStorage
// (sobrevive a la recarga, muere al cerrar la app) con vencimiento corto.
//
// SEGUNDO DISPARADOR (el caso real de cada publicación): `public/sw.js` casi
// nunca cambia, así que el SW no recarga. Lo que sí pasa en la primera apertura
// después de un deploy es que el teléfono baja el código nuevo. Lo detectamos
// comparando el VITE_BUILD_ID guardado en localStorage con el del bundle que
// acaba de cargar: si difieren, esta carga es "la nueva versión" y se muestra
// la misma pantalla (modo 'build': booting → session → data → done).

const KEY = 'adorapp:update';
const BUILD_KEY = 'adorapp:build';
const TTL_MS = 90_000;
const BUILD_ID = import.meta.env.VITE_BUILD_ID || '';

// Escala de la barra en modo 'build' (sin fase de service worker previa).
const BUILD_PCT = { booting: 22, session: 58, data: 86, done: 100 };

export const UPDATE_STEPS = {
  found:       { pct: 12,  caption: 'Nueva versión encontrada' },
  downloading: { pct: 30,  caption: 'Descargando…' },
  installed:   { pct: 45,  caption: 'Instalando…' },
  activating:  { pct: 55,  caption: 'Activando…' },
  reloading:   { pct: 62,  caption: 'Reiniciando…' },
  booting:     { pct: 72,  caption: 'Cargando la nueva versión…' },
  session:     { pct: 84,  caption: 'Validando tu sesión…' },
  data:        { pct: 95,  caption: 'Cargando tus datos…' },
  done:        { pct: 100, caption: 'Ya tenés la última versión' },
};

const ORDER = Object.keys(UPDATE_STEPS);

let state = { active: false, step: null, mode: null };
const listeners = new Set();

// % de la barra para un paso según el modo ('sw' = 9 pasos; 'build' = 4 pasos).
export const pctOf = (step, mode) => (mode === 'build' ? (BUILD_PCT[step] ?? UPDATE_STEPS[step]?.pct ?? 0) : (UPDATE_STEPS[step]?.pct ?? 0));

const readPersisted = () => {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.at || Date.now() - parsed.at > TTL_MS) { sessionStorage.removeItem(KEY); return null; }
    return parsed;
  } catch { return null; }
};

// Al cargar el módulo: si venimos de una recarga por actualización, arrancamos
// directamente en 'booting' (la barra continúa desde donde iba).
// La marca se consume acá mismo: si esta carga fallara (sin red, error), la
// próxima apertura arranca normal en vez de repetir "Actualizando".
if (typeof window !== 'undefined') {
  if (readPersisted()) {
    state = { active: true, step: 'booting', mode: 'sw' };
    try { sessionStorage.removeItem(KEY); } catch { /* noop */ }
  } else if (BUILD_ID) {
    // Primera apertura después de una publicación: el build guardado difiere del
    // actual. Sin build guardado (primera vez en este teléfono) no se muestra nada.
    try {
      const stored = localStorage.getItem(BUILD_KEY);
      if (stored && stored !== BUILD_ID) state = { active: true, step: 'booting', mode: 'build' };
    } catch { /* noop */ }
  }
  // Se guarda ya mismo: si esta carga fallara, la próxima arranca normal.
  if (BUILD_ID) { try { localStorage.setItem(BUILD_KEY, BUILD_ID); } catch { /* noop */ } }
}

const emit = () => { for (const fn of listeners) { try { fn(state); } catch { /* noop */ } } };

export const getUpdateState = () => state;

export const subscribeUpdate = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

// Avanza al paso indicado (nunca retrocede: si llega tarde un evento del SW,
// no se pisa un paso posterior).
export const markUpdateStep = (step) => {
  if (!UPDATE_STEPS[step]) return;
  if (state.active && state.step && ORDER.indexOf(step) < ORDER.indexOf(state.step)) return;
  state = { active: true, step, mode: state.mode || 'sw' };
  if (step === 'reloading') {
    try { sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), step })); } catch { /* noop */ }
  }
  emit();
};

export const finishUpdate = () => {
  try { sessionStorage.removeItem(KEY); } catch { /* noop */ }
  state = { active: false, step: null, mode: null };
  emit();
};

export const isPreReloadStep = (step) => ORDER.indexOf(step) <= ORDER.indexOf('reloading');
