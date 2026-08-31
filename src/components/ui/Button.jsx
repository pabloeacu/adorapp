import React from 'react';

export const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  icon: Icon,
  iconPosition = 'left',
  ...props
}) => {
  const baseStyles = 'font-medium rounded-lg transition-all duration-200 flex items-center justify-center gap-2';

  const variants = {
    primary: 'bg-gold-gradient text-black font-semibold hover:brightness-110 active:scale-95 shadow-[0_2px_14px_-3px_rgba(212,175,55,0.45)]',
    secondary: 'bg-transparent border border-neutral-700 text-gray-200 hover:border-gold-500/50 hover:text-gold-200 hover:bg-gold-500/5 active:scale-95',
    ghost: 'bg-transparent text-gray-400 hover:text-gold-200 hover:bg-gold-500/5',
    danger: 'bg-red-600 text-white hover:bg-red-700 active:scale-95',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {Icon && iconPosition === 'left' && <Icon size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} />}
      {children}
      {Icon && iconPosition === 'right' && <Icon size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} />}
    </button>
  );
};
