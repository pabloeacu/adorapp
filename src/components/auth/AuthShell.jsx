import React from 'react';

// Marco visual de las pantallas de acceso SIN sesión (recuperar / restablecer
// contraseña): mismo lenguaje que Login.jsx (fondo obsidiana, halo dorado, logos,
// card con hairline). Login conserva su propio markup; esto evita duplicarlo en las
// pantallas nuevas.
export const AuthShell = ({ title, children, footer, testId }) => (
  <div className="relative min-h-screen bg-black flex items-center justify-center p-4 overflow-hidden" data-testid={testId}>
    <div
      className="gold-radial-glow pointer-events-none absolute left-1/2 top-1/3 h-[32rem] w-[32rem] -translate-x-1/2 -translate-y-1/2 rounded-full"
      aria-hidden="true"
    />
    <div className="relative w-full max-w-md">
      <div className="text-center mb-8">
        <img src="/adoracion-caf-logo.png" alt="Adoración CAF" className="w-28 mx-auto mb-4 object-contain" />
        <img src="/adorapp-logo.png" alt="AdorAPP" className="w-52 mx-auto object-contain mix-blend-lighten" />
        <p className="text-gray-500 mt-4">La plataforma de Adoración CAF</p>
      </div>

      <div className="relative overflow-hidden bg-neutral-900 border border-gold-500/20 rounded-2xl p-8 shadow-[0_0_40px_-12px_rgba(212,175,55,0.25)]">
        <div className="gold-hairline absolute inset-x-0 top-0 h-px" aria-hidden="true" />
        <div className="gold-radial-glow pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full" aria-hidden="true" />
        {title && <h2 className="relative text-xl font-semibold mb-6 text-center">{title}</h2>}
        <div className="relative">{children}</div>
      </div>

      {footer}
      <p className="text-xs text-gray-400 text-center mt-6">© 2026 Centro de Avivamiento Familiar</p>
    </div>
  </div>
);

// Campo de texto con ícono a la izquierda (mismo estilo que los de Login).
export const AuthField = ({ icon: Icon, right, className = '', ...props }) => (
  <div className="relative">
    {Icon && <Icon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />}
    <input
      {...props}
      className={`w-full ${Icon ? 'pl-12' : 'pl-4'} ${right ? 'pr-12' : 'pr-4'} py-3 bg-neutral-800 border border-neutral-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 transition-colors disabled:opacity-60 ${className}`}
    />
    {right}
  </div>
);

export const AuthPrimaryButton = ({ children, ...props }) => (
  <button
    type="submit"
    {...props}
    className="w-full py-3 bg-gold-gradient text-black font-semibold rounded-xl hover:brightness-110 shadow-[0_2px_14px_-3px_rgba(212,175,55,0.45)] transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
  >
    {children}
  </button>
);

export const AuthSecondaryButton = ({ children, className = '', ...props }) => (
  <button
    type="button"
    {...props}
    className={`w-full py-3 border border-neutral-700 text-gray-300 font-medium rounded-xl hover:bg-gold-500/5 hover:border-gold-500/50 hover:text-gold-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50 ${className}`}
  >
    {children}
  </button>
);
