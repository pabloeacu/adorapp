// Single source of truth for the title shown in the top bar (desktop) and the
// mobile header. Keep both layouts in sync — Paul's parity rule: every page
// must look the same in name across every modality.

export const pageTitles = {
  '/': 'Inicio',
  '/ordenes': 'Órdenes',
  '/repertorio': 'Repertorio',
  '/bandas': 'Bandas',
  '/miembros': 'Miembros',
  '/solicitudes': 'Solicitudes',
  '/comunicaciones': 'Comunicaciones',
};

export const titleForPath = (pathname) => {
  // Dynamic route: /practica/:orderId → the Ensayómetro (personal practice).
  if (pathname.startsWith('/practica')) return 'Mi Ensayo';
  if (pathname.startsWith('/servicio')) return 'Servicio';
  return pageTitles[pathname] || 'AdorAPP';
};
