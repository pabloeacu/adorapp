const { defineConfig } = require('vite')
const react = require('@vitejs/plugin-react')

module.exports = defineConfig({
  plugins: [react()],
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
