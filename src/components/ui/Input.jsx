import React, { useId } from 'react';

/**
 * Reusable Input with proper a11y wiring:
 *   - the visible <label> uses htmlFor pointing at the input id
 *   - if `error` is provided, the message is rendered with role="alert"
 *     and connected to the input via aria-describedby + aria-invalid
 *
 * The id is derived from React.useId() unless the caller passes one
 * explicitly, so multiple instances on the same screen never collide.
 */
export const Input = ({
  label,
  icon: Icon,
  error,
  id,
  className = '',
  containerClassName = '',
  ...props
}) => {
  const generatedId = useId();
  const inputId = id || generatedId;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className={`flex flex-col gap-1.5 ${containerClassName}`}>
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs text-gray-400 font-medium uppercase tracking-wide"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
            <Icon size={18} />
          </div>
        )}
        <input
          id={inputId}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={errorId}
          className={`w-full ${Icon ? 'pl-10' : ''} ${error ? 'border-red-500' : ''} ${className}`}
          {...props}
        />
      </div>
      {error && (
        <span id={errorId} role="alert" className="text-xs text-red-500">
          {error}
        </span>
      )}
    </div>
  );
};
