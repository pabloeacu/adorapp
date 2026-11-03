import { useState } from 'react';
import { todayARTDateString } from '../lib/guests';

// Hoy en ART ('YYYY-MM-DD'), calculado UNA vez al montar (init perezoso → no viola
// react-hooks/purity, landmine #91). Se usa para filtrar invitados vencidos en los
// combos de selección. Queda fijo durante la vida del componente (se refresca al
// re-montar / recargar): suficiente para un plazo que es por DÍA.
export const useToday = () => {
  const [today] = useState(() => todayARTDateString());
  return today;
};
