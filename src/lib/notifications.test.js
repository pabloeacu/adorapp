import { describe, it, expect } from 'vitest';
import { sortNotificationsByDateDesc } from './notifications';

describe('sortNotificationsByDateDesc', () => {
  it('mezcla comunicaciones y notificaciones por fecha, lo más nuevo arriba', () => {
    const items = [
      { id: 'n1', type: 'song', createdAt: '2026-08-06T10:00:00Z' },
      { id: 'n2', type: 'devotional', createdAt: '2026-08-06T06:00:00Z' },
      // Comunicación MÁS NUEVA que todo: antes quedaba al fondo por el push tardío
      { id: 'c1', type: 'communication', createdAt: '2026-08-06T12:00:00Z' },
      { id: 'c2', type: 'communication', createdAt: '2026-08-05T20:00:00Z' },
    ];
    expect(sortNotificationsByDateDesc(items).map(i => i.id)).toEqual(['c1', 'n1', 'n2', 'c2']);
  });

  it('no muta el array original y tolera items sin fecha (van al final)', () => {
    const items = [
      { id: 'sin-fecha' },
      { id: 'nuevo', createdAt: '2026-08-06T12:00:00Z' },
    ];
    const sorted = sortNotificationsByDateDesc(items);
    expect(sorted.map(i => i.id)).toEqual(['nuevo', 'sin-fecha']);
    expect(items[0].id).toBe('sin-fecha');
  });
});
