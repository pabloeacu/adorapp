import { Music, Users2, Heart, Cross, Sunset, Calendar, FileText, Cake, Send } from 'lucide-react';

// Fuente ÚNICA del color de fondo por tipo de notificación y del ícono, que
// estaba duplicado VERBATIM en Header.jsx (escritorio) y MobileNav.jsx (celular)
// — justo el bloque que el landmine #34 avisa "cualquier cambio va en los dos".
//
// Nota: los dos mapas de color coincidían para TODOS los tipos mapeados
// (song/band/member/order/request/devotional/reflection/communication); solo
// diferían en el DEFAULT para un tipo NO mapeado (p. ej. reminder/alert/birthday/
// collaboration/activity): Header caía a verde, MobileNav a azul. Por eso el
// fallback es un parámetro por pantalla → la salida queda EXACTAMENTE igual que
// antes en ambas. El radio del contenedor también se pasa por prop porque difiere
// a propósito (rounded-lg en compu, rounded-xl en celu).

const TYPE_BG = {
  song: 'bg-purple-500/20',
  band: 'bg-blue-500/20',
  member: 'bg-green-500/20',
  order: 'bg-emerald-500/20',
  request: 'bg-yellow-500/20',
  devotional: 'bg-amber-500/20',
  reflection: 'bg-indigo-500/20',
  communication: 'bg-blue-500/20',
};

export function notifTypeBg(type, fallbackBg = 'bg-green-500/20') {
  // Object.hasOwn: un `type` que fuese clave del prototipo (p. ej. 'toString')
  // no debe devolver la función heredada — cae al fallback, como el ternario viejo.
  return Object.hasOwn(TYPE_BG, type) ? TYPE_BG[type] : fallbackBg;
}

const ICONS = {
  music: <Music size={18} className="text-purple-400" />,
  users: <Users2 size={18} className="text-blue-400" />,
  heart: <Heart size={18} className="text-green-400" />,
  cross: <Cross size={18} className="text-amber-400" />,
  sunset: <Sunset size={18} className="text-indigo-400" />,
  calendar: <Calendar size={18} className="text-emerald-400" />,
  file: <FileText size={18} className="text-yellow-400" />,
  cake: <Cake size={18} className="text-pink-400" />,
  send: <Send size={18} className="text-blue-400" />,
};

// El ícono de la notificación según `notif.icon`. Devuelve null para un ícono
// desconocido (igual que antes: ninguna de las condiciones matcheaba).
export function NotifIcon({ icon }) {
  return Object.hasOwn(ICONS, icon) ? ICONS[icon] : null;
}

// Medalla completa (contenedor coloreado + ícono). `radiusClass` y `fallbackBg`
// los pasa cada pantalla para conservar exactamente su radio y su color por
// defecto (compu: rounded-lg + verde; celu: rounded-xl + azul).
export function NotifIconBadge({ type, icon, radiusClass = 'rounded-lg', fallbackBg = 'bg-green-500/20' }) {
  return (
    <div className={`p-2 ${radiusClass} ${notifTypeBg(type, fallbackBg)}`}>
      <NotifIcon icon={icon} />
    </div>
  );
}
