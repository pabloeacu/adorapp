// Turnero de los avisos que se AUTO-muestran al abrir la app (el pop-up de única
// vez del tutorial y el recordatorio de instalar/activar notificaciones). Evita
// que se encimen dos <Modal> oscuros en la misma apertura: el PRIMERO que reclama
// el turno gana; los demás ceden hasta la próxima apertura. 100% en memoria (por
// carga), igual que los flags de sesión que ya usan esos componentes.
//
// Prioridad: el pop-up del tutorial reclama SÍNCRONO al montar (su efecto corre
// antes del timer async del recordatorio), así en la ventana del lanzamiento el
// recorrido tiene prioridad y el recordatorio aparece en el próximo ingreso.
let claimed = false;

export function claimStartupOverlay() {
  if (claimed) return false;
  claimed = true;
  return true;
}
