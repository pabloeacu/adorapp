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
//
// SIN sesión no se pide NADA (ni ficha ni tablas): la pantalla de login no usa
// datos del ministerio y la base los deniega por RLS a un anónimo (401 /
// "42501 permission denied for view members_directory"), así que el pedido
// sólo servía para ensuciar la consola con errores esperados y encima dejaba
// el store en estado de error. Quien ENTRA carga los datos recién autenticado
// (App.jsx fuerza el refresco cuando cambia el usuario). Landmine #62(a): nunca
// pedir datos sin credencial — una respuesta de anónimo no debe cachearse.
export async function runBoot({ restoreSession, bootProfile, initializeApp, onSession }) {
  const user = await restoreSession();
  onSession?.(user);
  if (!user) return null;
  await Promise.all([
    bootProfile(user.id),
    initializeApp(),
  ]);
  return user;
}
