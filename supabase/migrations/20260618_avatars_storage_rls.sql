-- =====================================================
-- FIX: Avatars Storage Bucket RLS Policies
-- =====================================================
-- El bucket `avatars` (storage.objects) tenía RLS habilitado
-- pero CERO políticas, así que Postgres rechazaba todo INSERT
-- de usuarios autenticados: nadie podía guardar su foto de perfil.
-- Síntoma reportado por Leandro: "no puedo guardar la foto".
--
-- Esta migración agrega las políticas mínimas para que cualquier
-- usuario autenticado del ministerio pueda subir/actualizar/borrar
-- avatares, y que las fotos sean legibles públicamente (el bucket
-- ya es público; la app usa getPublicUrl).
-- =====================================================

-- Limpieza idempotente (por si quedaron políticas a medio crear)
DROP POLICY IF EXISTS "avatars_public_read"        ON storage.objects;
DROP POLICY IF EXISTS "avatars_authenticated_insert" ON storage.objects;
DROP POLICY IF EXISTS "avatars_authenticated_update" ON storage.objects;
DROP POLICY IF EXISTS "avatars_authenticated_delete" ON storage.objects;

-- Lectura pública: las fotos de perfil son visibles para todos
-- (bucket ya marcado como public). Scope acotado al bucket avatars.
CREATE POLICY "avatars_public_read" ON storage.objects
    FOR SELECT
    USING (bucket_id = 'avatars');

-- Subida: cualquier usuario autenticado del ministerio puede subir
-- al bucket avatars.
CREATE POLICY "avatars_authenticated_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'avatars');

-- Actualización: necesaria para el upsert del cliente.
CREATE POLICY "avatars_authenticated_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'avatars')
    WITH CHECK (bucket_id = 'avatars');

-- Borrado: limpieza de avatares viejos.
CREATE POLICY "avatars_authenticated_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'avatars');

-- Verificación
DO $$
BEGIN
    IF (SELECT count(*) FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname LIKE 'avatars_%') < 4 THEN
        RAISE WARNING 'Las políticas del bucket avatars no se crearon completas';
    END IF;
END $$;

SELECT 'avatars storage RLS policies created successfully!' as status;
