// Recuperación de "chunks viejos" después de una publicación.
//
// Vite emite cada página como un archivo con hash en el nombre (assets/Bandas-abc123.js).
// Cuando se publica una versión nueva, los hashes cambian y Vercel deja de servir los
// viejos. Un teléfono que ya tenía la app abierta con la versión anterior y toca una
// sección que todavía no había descargado pide el archivo viejo → 404 → el `import()`
// rechaza ("Importing a module script failed." en Safari, "Failed to fetch dynamically
// imported module" en Chrome) y, sin este módulo, el ErrorBoundary raíz mostraba
// "Algo salió mal" (12 filas en error_log el 12/09/2026, 4 usuarios, 6 episodios).
//
// Qué hace: detecta ese error y recarga la página UNA sola vez. La recarga trae el
// index.html nuevo con los hashes nuevos, y como el VITE_BUILD_ID cambió, la primera
// carga muestra sola la pantalla "Actualizando a la nueva versión" (updateProgress,
// modo 'build'). Además se marca 'reloading' para que la barra arranque desde ahí.
//
// Anti-loop: la marca en sessionStorage (con vencimiento) impide recargar dos veces
// seguidas. Si tras la recarga el chunk sigue fallando (sin red, archivo realmente
// roto), el error llega al ErrorBoundary, que muestra la pantalla amable con el
// botón "Actualizar la app".

import { markUpdateStep } from './updateProgress';

const RETRY_KEY = 'adorapp:chunk-retry';
const RETRY_TTL_MS = 60_000;

const PATTERNS = [
  /importing a module script failed/i,          // Safari / iOS
  /failed to fetch dynamically imported module/i, // Chrome / Edge
  /error loading dynamically imported module/i,   // Firefox
  /loading (css )?chunk [\w-]+ failed/i,          // webpack-style (por si acaso)
  /unable to preload css/i,                       // vite:preloadError (CSS)
];

export const isChunkLoadError = (err) => {
  const msg = String(err?.message || err || '');
  return PATTERNS.some((re) => re.test(msg));
};

const readRetry = () => {
  try {
    const raw = sessionStorage.getItem(RETRY_KEY);
    if (!raw) return 0;
    const at = Number(raw);
    return Number.isFinite(at) ? at : 0;
  } catch { return 0; }
};

// ¿Ya recargamos hace poco por este mismo motivo? (evita el loop infinito)
export const recentlyRetried = (now = Date.now()) => { const at = readRetry(); return at > 0 && now - at < RETRY_TTL_MS; };

export const clearRetryMark = () => { try { sessionStorage.removeItem(RETRY_KEY); } catch { /* noop */ } };

// Marca "ya reintentamos" sin recargar: la usa el botón "Actualizar la app" para que la
// recarga manual cuente como el único reintento (si la versión nueva sigue rota, la
// pantalla vuelve enseguida en vez de recargar dos veces).
export const markRetryNow = (now = Date.now()) => { try { sessionStorage.setItem(RETRY_KEY, String(now)); } catch { /* noop */ } };

// Mientras la recarga ya disparada no se concreta (milisegundos), cualquier otro fallo de
// carga perezosa es irrelevante: se deja pendiente en vez de mostrar/reportar un error.
// (Vite, con `vite:preloadError` cancelado, resuelve el import con `undefined` → el
// `m[name]` de lazyPage tiraría un TypeError falso y se registraría en error_log.)
let reloadPending = false;
export const isReloadPending = () => reloadPending;
export const _resetReloadPendingForTests = () => { reloadPending = false; };

// Intenta recuperarse: si no se recargó hace poco, marca y recarga. Devuelve true si
// disparó la recarga (el llamador debe quedarse esperando: la página se va a ir).
export const recoverFromStaleChunk = ({ reload = () => window.location.reload(), now = Date.now() } = {}) => {
  if (typeof window === 'undefined') return false;
  if (reloadPending) return true;
  if (recentlyRetried(now)) return false;
  markRetryNow(now);
  reloadPending = true;
  // La recarga que viene ES la versión nueva: que la pantalla de carga lo diga.
  try { markUpdateStep('reloading'); } catch { /* noop */ }
  try { reload(); } catch { /* noop */ }
  return true;
};

// Promesa que nunca resuelve: mantiene el <Suspense> en "Cargando…" mientras la página
// se recarga, en vez de mostrar un error durante los milisegundos previos.
const forever = () => new Promise(() => {});

// Envuelve el importer de un React.lazy: si el chunk falla por versión vieja, recarga una
// vez (y deja el loader puesto). Si ya se recargó y sigue fallando, propaga el error.
export const withChunkRecovery = (importer) => () => importer().catch((err) => {
  if (reloadPending) return forever();
  if (isChunkLoadError(err) && recoverFromStaleChunk()) return forever();
  throw err;
});

// Vite dispara `vite:preloadError` cuando falla la precarga de las dependencias (CSS/JS)
// de un import dinámico; por defecto luego lanza el error. Acá lo interceptamos.
let installed = false;
export const installChunkRecovery = () => {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('vite:preloadError', (event) => {
    if (recoverFromStaleChunk()) event.preventDefault?.();
  });
};
