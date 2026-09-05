-- Hardening: fijar search_path de enforce_member_auth_link().
--
-- El advisor de seguridad `function_search_path_mutable` marcaba esta función
-- (trigger BEFORE INSERT/UPDATE en members que exige user_id para pastor/leader)
-- por no tener search_path fijo. Es el patrón estándar del repo para todas las
-- funciones. La función no accede a ninguna tabla ni llama a otras funciones
-- (solo lee NEW y hace RAISE), así que fijar el search_path es puro hardening,
-- CERO impacto de comportamiento.
ALTER FUNCTION public.enforce_member_auth_link() SET search_path = 'public', 'pg_temp';
