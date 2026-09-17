import { describe, it, expect } from 'vitest';
import { titleForPath, pageTitles } from './pageTitles';

// El título que se muestra en la barra superior (desktop) y el header móvil.
// Fuente única compartida por Header y MobileNav (regla de paridad de Paul).
describe('titleForPath', () => {
  it('mapea las rutas fijas', () => {
    expect(titleForPath('/')).toBe('Inicio');
    expect(titleForPath('/ordenes')).toBe('Órdenes');
    expect(titleForPath('/repertorio')).toBe('Repertorio');
    expect(titleForPath('/miembros')).toBe('Miembros');
    expect(titleForPath('/comunicaciones')).toBe('Comunicaciones');
    expect(titleForPath('/salud')).toBe('Salud del sistema');
  });

  it('resuelve las rutas dinámicas por prefijo', () => {
    expect(titleForPath('/practica/abc123')).toBe('Mi Ensayo');
    expect(titleForPath('/servicio/xyz')).toBe('Servicio');
  });

  it('cae al fallback en una ruta desconocida', () => {
    expect(titleForPath('/no-existe')).toBe('AdorAPP');
  });

  it('toda entrada de pageTitles es un string no vacío', () => {
    Object.values(pageTitles).forEach((v) => expect(typeof v === 'string' && v.length > 0).toBe(true));
  });
});
