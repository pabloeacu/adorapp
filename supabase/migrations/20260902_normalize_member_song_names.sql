-- Limpieza de nombres/títulos con espacios sucios (trim + colapso de espacios
-- internos). Origen: "Yessica  Santillán" (doble espacio) rompía las iniciales
-- del avatar (parts[1][0] = undefined → "YUNDEFINED"); además ~98 títulos de
-- canciones tenían espacios al inicio/fin que ensuciaban el orden alfabético,
-- la búsqueda y los PDFs. La prevención vive en el cliente (normalizeName en
-- los convertXToDB de appStore.js). Esta migración normaliza los datos ya
-- cargados. Idempotente: en una base limpia no toca nada.

UPDATE public.members
SET name = btrim(regexp_replace(name, '\s+', ' ', 'g'))
WHERE name <> btrim(regexp_replace(name, '\s+', ' ', 'g'));

UPDATE public.songs
SET title = btrim(regexp_replace(title, '\s+', ' ', 'g'))
WHERE title <> btrim(regexp_replace(title, '\s+', ' ', 'g'));

UPDATE public.bands
SET name = btrim(regexp_replace(name, '\s+', ' ', 'g'))
WHERE name <> btrim(regexp_replace(name, '\s+', ' ', 'g'));
