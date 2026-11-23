// Política de contraseña del circuito de recuperación (pura, testeable).
// ESPEJO EXACTO de `passwordProblem` en supabase/functions/auth-password-reset/index.ts:
// si cambiás una regla acá, cambiala también allá (la frontera real es la EF).

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

// Reglas visibles en la pantalla (checklist). `test` devuelve true si se cumple.
export const PASSWORD_RULES = [
  { id: 'min', label: `Al menos ${PASSWORD_MIN} caracteres`, test: (p) => typeof p === 'string' && p.length >= PASSWORD_MIN },
  { id: 'letra', label: 'Al menos una letra', test: (p) => /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(p || '') },
  { id: 'numero', label: 'Al menos un número', test: (p) => /\d/.test(p || '') },
];

// Código del primer problema (o null si la contraseña es válida).
export const passwordProblem = (pw) => {
  if (typeof pw !== 'string' || pw.length < PASSWORD_MIN) return 'corta';
  if (pw.length > PASSWORD_MAX) return 'larga';
  if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(pw)) return 'sin_letra';
  if (!/\d/.test(pw)) return 'sin_numero';
  if (/^\s+$/.test(pw)) return 'corta';
  return null;
};

export const isPasswordValid = (pw) => passwordProblem(pw) === null;

// Mensajes amables por código (los de la EF y los locales).
export const PASSWORD_MESSAGES = {
  corta: `La contraseña tiene que tener al menos ${PASSWORD_MIN} caracteres.`,
  larga: `La contraseña no puede superar los ${PASSWORD_MAX} caracteres.`,
  sin_letra: 'La contraseña tiene que incluir al menos una letra.',
  sin_numero: 'La contraseña tiene que incluir al menos un número.',
  distinta: 'Las dos contraseñas no coinciden.',
};

export const passwordMessage = (code) => PASSWORD_MESSAGES[code] || 'Elegí una contraseña más segura.';
