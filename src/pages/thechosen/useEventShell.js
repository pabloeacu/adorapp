import { useEffect } from 'react';

// Pone la página del evento en modo oscuro a pantalla completa (y restaura al salir).
export function useEventShell(title) {
  useEffect(() => {
    document.documentElement.classList.add('evt-active');
    document.body.classList.add('evt-active');
    const prev = document.title;
    if (title) document.title = title;
    return () => {
      document.documentElement.classList.remove('evt-active');
      document.body.classList.remove('evt-active');
      document.title = prev;
    };
  }, [title]);
}
