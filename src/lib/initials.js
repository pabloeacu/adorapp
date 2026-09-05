// Iniciales robustas a espacios sucios, para avatares con foto ausente.
// Antes la lógica vivía en Avatar.jsx y hacía name.split(' ')[1][0]; con un
// doble espacio ("Yessica  Santillán") parts[1] era '' y parts[1][0] daba
// undefined → el avatar mostraba "YUNDEFINED". Acá colapsamos cualquier
// whitespace (trim + split(/\s+/) + filter) y tomamos la 1ª letra de las 2
// primeras palabras reales.
export const getInitials = (name) => {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};
