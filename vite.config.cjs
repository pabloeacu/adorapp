const { defineConfig } = require('vite')
const react = require('@vitejs/plugin-react')

// Fecha del build en hora Argentina (DD/MM). La muestra la pantalla de
// "Actualizando a la nueva versión" para saber qué versión tiene cada usuario.
const buildDate = (() => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires', day: 'numeric', month: 'numeric',
  }).formatToParts(new Date())
  const get = (t) => String(parts.find((p) => p.type === t)?.value || '').padStart(2, '0')
  return `${get('day')}/${get('month')}`
})()

module.exports = defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_BUILD_DATE': JSON.stringify(buildDate),
  },
  // Rutas de assets ABSOLUTAS (/assets/...). Con base relativo ('./') una carga
  // fresca de una ruta de 2+ segmentos (ej. /practica/:orderId, linkeada desde el
  // correo de recordatorio de ensayo) resolvía los assets contra /practica/ y
  // devolvía una página en blanco. El sitio se sirve en la raíz del dominio.
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
})
