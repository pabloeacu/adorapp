import { useEffect, useState } from 'react';
import { nextBoundary, nextArtMidnight } from '../lib/bannerLifetime';

// Reloj de los banners con vencimiento. Devuelve `now` (epoch ms) y agenda UNA re-evaluación
// en el próximo límite de las ventanas recibidas (o en la próxima medianoche ART, para que
// "hoy" cambie solo). Sin setInterval: un solo setTimeout por límite, capado a 2^31−1 ms.
export const useLifetimeTick = (windows) => {
  const [now, setNow] = useState(() => Date.now());
  const key = (windows || []).map((w) => (w ? `${w.start}-${w.end}` : '')).join('|');
  useEffect(() => {
    const at = Date.now();
    const next = Math.min(nextBoundary(windows || [], at) ?? Infinity, nextArtMidnight(at));
    const delay = Math.min(Math.max(0, next - at) + 250, 2 ** 31 - 1);
    const timer = setTimeout(() => setNow(Date.now()), delay);
    return () => clearTimeout(timer);
    // `key` resume las ventanas (evita re-agendar por identidad de arrays nuevos).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, now]);
  return now;
};
