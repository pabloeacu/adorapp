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

  const getColorFromName = (name) => {
    const clean = (name ?? '').trim();
    if (!clean) return 'bg-neutral-700';
    const colors = [
      'bg-blue-600', 'bg-green-600', 'bg-purple-600',
      'bg-orange-600', 'bg-pink-600', 'bg-teal-600'
    ];
    const index = clean.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[index % colors.length];
  };

  return (
    <div
      className={`
        ${sizes[size]} rounded-full flex items-center justify-center
        font-semibold text-white ${getColorFromName(name)}
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
