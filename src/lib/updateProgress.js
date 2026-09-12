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

const KEY = 'adorapp:update';
const TTL_MS = 90_000;

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

let state = { active: false, step: null };
const listeners = new Set();

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
if (typeof window !== 'undefined' && readPersisted()) {
  state = { active: true, step: 'booting' };
  try { sessionStorage.removeItem(KEY); } catch { /* noop */ }
}

const emit = () => { for (const fn of listeners) { try { fn(state); } catch { /* noop */ } } };

export const getUpdateState = () => state;

export const subscribeUpdate = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

// Avanza al paso indicado (nunca retrocede: si llega tarde un evento del SW,
// no se pisa un paso posterior).
export const markUpdateStep = (step) => {
  if (!UPDATE_STEPS[step]) return;
  if (state.active && state.step && ORDER.indexOf(step) < ORDER.indexOf(state.step)) return;
  state = { active: true, step };
  if (step === 'reloading') {
    try { sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), step })); } catch { /* noop */ }
  }
  emit();
};

export const finishUpdate = () => {
  try { sessionStorage.removeItem(KEY); } catch { /* noop */ }
  state = { active: false, step: null };
  emit();
};

export const isPreReloadStep = (step) => ORDER.indexOf(step) <= ORDER.indexOf('reloading');
