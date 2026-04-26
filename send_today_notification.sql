-- =====================================================
-- NOTIFICACIÓN DEL DÍA DE HOY - 27 de Abril 2026
-- Ejecutar manualmente para disparar la primera notificación
-- =====================================================

-- Primero verificamos que la reflexión del día existe
SELECT
    day_of_year,
    date,
    quote,
    author
FROM daily_reflections
WHERE date = '2026-04-27';

-- Crear la notificación global para TODOS los usuarios
-- Título: Reflexión del Día
-- Mensaje: [frase] - [autor]
INSERT INTO notifications (
    title,
    message,
    type,
    is_global,
    created_at
)
SELECT
    'Reflexión del Día',
    dr.quote || ' — ' || dr.author,
    'reflection',
    true,
    NOW()
FROM daily_reflections dr
WHERE dr.date = '2026-04-27';

-- Verificar que se creó
SELECT id, title, message, is_global, created_at
FROM notifications
WHERE is_global = true
ORDER BY created_at DESC
LIMIT 1;
