import React from 'react';

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

  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  // Iniciales sin foto: degradé dorado intenso con letras blancas (identidad premium).
  // El text-shadow mantiene las letras legibles sobre el oro brillante.
  return (
    <div
      className={`
        ${sizes[size]} rounded-full flex items-center justify-center
        font-bold text-white ${src ? 'bg-neutral-800' : 'bg-gold-gradient [text-shadow:0_1px_2px_rgba(0,0,0,0.4)] ring-1 ring-gold-300/40'}
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
