// Orquestación del arranque de la app (App.jsx la ejecuta una sola vez).
//
//   1) restoreSession()  → sesión guardada en el dispositivo (local, instantánea).
//                          Deja la credencial cargada en el cliente de Supabase.
//   2) EN PARALELO:  bootProfile(user.id)  (ficha, 1 viaje)
//                    initializeApp()       (9 tablas, 1 viaje con Promise.all)
//      Ninguna depende de la otra y ambas salen ya autenticadas porque la
//      sesión se restauró ANTES de lanzarlas (eso es lo que evita el riesgo de
//      pedir datos sin credencial y cachear respuestas vacías).
//   3) Se espera a que vuelvan LAS DOS antes de mostrar nada (landmine #61:
//      el Inicio se pinta recién con todo fresco).
//
// Antes iba en serie (sesión → ficha → tablas): un viaje más al servidor.
// Sin sesión, igual se cargan las tablas (como siempre) y se va al login.
export async function runBoot({ restoreSession, bootProfile, initializeApp, onSession }) {
  const user = await restoreSession();
  onSession?.(user);
  await Promise.all([
    user ? bootProfile(user.id) : Promise.resolve(),
    initializeApp(),
  ]);
  return user;
}
