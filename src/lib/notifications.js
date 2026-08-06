// Orden del panel de notificaciones: TODAS las fuentes mezcladas (globales,
// personales y comunicaciones) por fecha real, lo más nuevo arriba.
//
// Bug histórico: el panel armaba el array con las notificaciones generales
// primero y las comunicaciones DESPUÉS (push al final), así que una
// comunicación recién llegada aparecía abajo de todo aunque fuera lo más
// nuevo. Cada ítem debe llevar `createdAt` (ISO) y pasar por acá.

export const sortNotificationsByDateDesc = (items) =>
  [...items].sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });
