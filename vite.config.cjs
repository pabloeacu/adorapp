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
    // Identificador único del build: sha del commit en Vercel (o timestamp en local).
    // La app lo guarda en el teléfono y, si cambió, sabe que es la primera apertura
    // después de una publicación → pantalla "Actualizando a la nueva versión".
    'import.meta.env.VITE_BUILD_ID': JSON.stringify(
      (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 12) || `local-${Date.now()}`,
    ),
  },
  // Rutas de assets ABSOLUTAS (/assets/...). Con base relativo ('./') una carga
  // fresca de una ruta de 2+ segmentos (ej. /practica/:orderId, linkeada desde el
  // correo de recordatorio de ensayo) resolvía los assets contra /practica/ y
  // devolvía una página en blanco. El sitio se sirve en la raíz del dominio.
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        // Separar las librerías SIEMPRE-cargadas y ESTABLES en chunks propios con
        // caché larga. Antes iban dentro del bundle de entrada, que cambia de hash
        // en CADA publicación → el teléfono re-bajaba ~600 KB aunque las librerías no
        // hubieran cambiado (la lentitud del "Cargando AdorAPP…" que reportó Paul).
        // Ahora, tras una publicación que sólo toca código de la app, estos chunks
        // conservan su hash y se reusan de la caché.
        //
        // Sólo se agrupan libs siempre-cargadas: las perezosas (jspdf, docx,
        // html2canvas — cargadas con import() dinámico) NO se tocan, así vite las sigue
        // poniendo en su propio chunk que se baja recién al usarlas.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler|zustand)\//.test(id)) return 'react-vendor';
          if (id.includes('node_modules/@supabase')) return 'supabase';
          if (/node_modules\/(lucide-react|@phosphor-icons)\//.test(id)) return 'icons';
        }
      }
    }
  }
})
