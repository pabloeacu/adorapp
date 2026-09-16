import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { notifTypeBg, NotifIcon, NotifIconBadge } from './notificationVisual';

// Estos tests fijan el CONTRATO de color/ícono que antes vivía duplicado en
// Header.jsx y MobileNav.jsx. Cualquier cambio que altere el color de un tipo
// real o el default por pantalla se pone rojo acá (no-regresión).

describe('notifTypeBg', () => {
  it('cada tipo mapeado devuelve su color exacto (idéntico en compu y celu)', () => {
    expect(notifTypeBg('song')).toBe('bg-purple-500/20');
    expect(notifTypeBg('band')).toBe('bg-blue-500/20');
    expect(notifTypeBg('member')).toBe('bg-green-500/20');
    expect(notifTypeBg('order')).toBe('bg-emerald-500/20');
    expect(notifTypeBg('request')).toBe('bg-yellow-500/20');
    expect(notifTypeBg('devotional')).toBe('bg-amber-500/20');
    expect(notifTypeBg('reflection')).toBe('bg-indigo-500/20');
    expect(notifTypeBg('communication')).toBe('bg-blue-500/20');
  });

  it('el DEFAULT (tipo no mapeado: reminder/alert/birthday/…) respeta el fallback por pantalla', () => {
    // compu: verde (default de Header); celu: azul (default de MobileNav)
    expect(notifTypeBg('reminder')).toBe('bg-green-500/20');
    expect(notifTypeBg('alert', 'bg-green-500/20')).toBe('bg-green-500/20');
    expect(notifTypeBg('alert', 'bg-blue-500/20')).toBe('bg-blue-500/20');
    expect(notifTypeBg('birthday', 'bg-blue-500/20')).toBe('bg-blue-500/20');
  });

  it('una clave del prototipo (toString/constructor) cae al fallback, no a la función heredada', () => {
    expect(notifTypeBg('toString')).toBe('bg-green-500/20');
    expect(notifTypeBg('constructor', 'bg-blue-500/20')).toBe('bg-blue-500/20');
  });
});

describe('NotifIcon', () => {
  it('devuelve un ícono para cada clave conocida y null para una desconocida', () => {
    for (const icon of ['music', 'users', 'heart', 'cross', 'sunset', 'calendar', 'file', 'cake', 'send']) {
      const { container, unmount } = render(<span>{NotifIcon({ icon })}</span>);
      expect(container.querySelector('svg')).toBeTruthy();
      unmount();
    }
    const { container } = render(<span>{NotifIcon({ icon: 'inexistente' })}</span>);
    expect(container.querySelector('svg')).toBeNull();
  });
});

describe('NotifIconBadge', () => {
  it('aplica el color del tipo y el radio pasado por prop', () => {
    const { container } = render(<NotifIconBadge type="song" icon="music" radiusClass="rounded-lg" />);
    const badge = container.firstChild;
    expect(badge.className).toContain('bg-purple-500/20');
    expect(badge.className).toContain('rounded-lg');
    expect(badge.querySelector('svg')).toBeTruthy();
  });
  it('usa el fallbackBg por pantalla para un tipo no mapeado', () => {
    const { container } = render(<NotifIconBadge type="reminder" icon="calendar" radiusClass="rounded-xl" fallbackBg="bg-blue-500/20" />);
    expect(container.firstChild.className).toContain('bg-blue-500/20');
    expect(container.firstChild.className).toContain('rounded-xl');
  });
});
