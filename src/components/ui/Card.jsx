import React from 'react';

export const Card = ({
  children,
  className = '',
  hover = false,
  padding = 'md',
  ...props
}) => {
  const paddingSizes = {
    none: '',
    sm: 'p-4',
    md: 'p-5',
    lg: 'p-6',
  };

  return (
    <div
      className={`
        bg-neutral-900 border border-neutral-800 rounded-xl
        ${hover ? 'hover:border-neutral-700 hover:bg-neutral-800/50 transition-all duration-200 cursor-pointer' : ''}
        ${paddingSizes[padding]}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
};
