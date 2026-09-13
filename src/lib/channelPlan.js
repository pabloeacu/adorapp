// Plan de canales (micrófonos) para Sonido: color por instrumento + autonumerado desde
// la formación, con overrides editables guardados por orden. Lógica pura.

// Paleta aprobada (color por familia de instrumento, sobre fondo oscuro).
export const CHANNEL_COLORS = {
  'Voz': '#F4978E',
  'Coros': '#F6BE72',
  'Guitarra Eléctrica': '#7DB4F2',
  'Guitarra Acústica': '#8FD3A6',
  'Piano': '#C3A6E8',
  'Teclado': '#A79BE0',
  'Bajo': '#E8A45C',
  'Batería': '#EF7A7A',
  'Percusión': '#E68FB7',
  'Violín': '#79D2C3',
  'Flauta': '#B7D77E',
  'Saxofón': '#E0C05A',
  'Trompeta': '#E8925C',
};
const DEFAULT_COLOR = '#9AA6B2';

export const channelColor = (instrument) => CHANNEL_COLORS[instrument] || DEFAULT_COLOR;

// groups: [{ instrument, members: [{id, name}] }] en orden canónico (getOrderLineupGroups).
// savedPlan: { "<memberId>:<instrumento>": <nroCanal> } — overrides guardados.
// Devuelve filas ordenadas por canal, cada (miembro, instrumento) = una fila/canal.
export function buildChannelRows(groups, savedPlan) {
  const plan = savedPlan || {};
  let auto = 0;
  const rows = [];
  for (const g of groups || []) {
    for (const m of g.members || []) {
      auto += 1;
      const key = `${m.id}:${g.instrument}`;
      const override = plan[key];
      const channel = Number.isFinite(override) && override > 0 ? override : auto;
      rows.push({ key, memberId: m.id, name: m.name, instrument: g.instrument, color: channelColor(g.instrument), channel, auto });
    }
  }
  rows.sort((a, b) => a.channel - b.channel || a.auto - b.auto);
  return rows;
}

// Canales usados por más de una fila (para avisar de colisiones).
export function duplicateChannels(rows) {
  const count = new Map();
  (rows || []).forEach((r) => count.set(r.channel, (count.get(r.channel) || 0) + 1));
  return new Set([...count.entries()].filter(([, n]) => n > 1).map(([ch]) => ch));
}
