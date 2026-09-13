-- Instrumento nuevo "Percusión" (pedido de Paul, 2026-09-13): entra al orden canónico de
-- la formación, justo después de Batería (misma familia rítmica). ESPEJO de
-- INSTRUMENT_ORDER en src/lib/lineup.js (el test de contrato contract.mirrors.test.js
-- exige que ambos literales coincidan). Sin cambios de datos: la ficha de cada miembro
-- (members.instruments) es texto libre validado por el cliente/EF; el orden solo define
-- cómo se agrupa y se lista la formación (resumen, correos, plan de canales).
CREATE OR REPLACE FUNCTION public._instrument_rank(p text)
RETURNS int LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT COALESCE(array_position(ARRAY['Voz','Coros','Guitarra Eléctrica','Guitarra Acústica','Piano','Teclado','Bajo','Batería','Percusión','Violín','Flauta','Saxofón','Trompeta'], p), 99);
$$;
