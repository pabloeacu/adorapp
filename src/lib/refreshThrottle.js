// Freno del auto-refresco de datos (lo usa RouteSync en App.jsx).
//
// Regla: se vuelve a pedir todo si pasaron más de REFRESH_THROTTLE_MS desde la
// última carga **o** si los datos que hay en memoria son de OTRO usuario (o de
// nadie). Lo segundo es lo que hace que entrar a la app cargue los datos al
// instante: el arranque sin sesión ya no pide nada (src/lib/boot.js), así que
// cuando aparece el usuario hay que traer todo aunque la ventana de throttle
// siga abierta. Lo mismo tras cerrar sesión, que vacía el store: `invalidate()`
// borra la marca para que el próximo ingreso cargue de nuevo.
export const REFRESH_THROTTLE_MS = 15_000;

const NOBODY = Symbol('sin-carga');

let lastRefreshAt = 0;
let lastRefreshUserId = NOBODY;

// Marca "ya cargué todo para este usuario, recién". userId null = sin sesión.
export const markRefreshed = (userId = null) => {
  lastRefreshAt = Date.now();
  lastRefreshUserId = userId;
};

// Olvida la marca: lo que haya en memoria no sirve (logout / reset del store).
export const invalidateRefresh = () => {
  lastRefreshAt = 0;
  lastRefreshUserId = NOBODY;
};

export const shouldRefresh = (userId = null, now = Date.now()) => {
  if (userId !== lastRefreshUserId) return true;
  return now - lastRefreshAt >= REFRESH_THROTTLE_MS;
};
