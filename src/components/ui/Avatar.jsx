import React from 'react';
import { getInitials } from '../../lib/initials';

export const Avatar = ({
  name,
  src,
  size = 'md',
  className = ''
}) => {
  const sizes = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-lg',
  };

  // "Moneda" del perfil: SIEMPRE idéntica en tamaño y forma, tenga foto o solo
  // iniciales. `shrink-0` evita que se ovale (se comprima de ancho) al lado de un
  // nombre largo en una fila flex; `rounded-full` + `overflow-hidden` garantizan el
  // círculo; el MISMO `ring` dorado va para foto e iniciales (sin él, la foto quedaba
  // 1px más chica/sin marco que las iniciales). Con foto: la imagen llena la moneda.
  // Sin foto: degradé dorado + iniciales blancas (identidad premium del reskin, el
  // text-shadow las mantiene legibles sobre el oro).
  return (
    <div
      className={`
        ${sizes[size]} shrink-0 rounded-full overflow-hidden flex items-center justify-center
        font-bold text-white ring-1 ring-gold-300/40
        ${src ? 'bg-neutral-800' : 'bg-gold-gradient [text-shadow:0_1px_2px_rgba(0,0,0,0.4)]'}
        ${className}
      `}
    >
      {src ? (
        <img
          src={src}
          alt={name}
          className="w-full h-full rounded-full object-cover"
        />
      ) : (
        getInitials(name)
      )}
    </div>
  );
};
