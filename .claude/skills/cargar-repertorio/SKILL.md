---
name: cargar-repertorio
description: Carga masiva de canciones al repertorio de AdorAPP desde un Excel con columnas CANCION / AUTOR / TONALIDAD / LINK. Busca letra y acordes en lacuerda.net y cifraclub.com, estructura según el formato de secciones de la plataforma, sanitiza los acordes para que el transporte de tonalidad funcione, y carga vía Supabase MCP con las notificaciones push pausadas. Usar cuando Paul diga "cargá estas canciones al repertorio" o entregue un Excel de canciones.
---

# Carga masiva de repertorio AdorAPP

## Entrada esperada

Excel (o lista) con 4 columnas: **CANCION · AUTOR · TONALIDAD · LINK** (YouTube).
La TONALIDAD es la tonalidad ORIGINAL que la ficha debe declarar. El AUTOR
desambigua canciones homónimas — SIEMPRE priorizar el match de intérprete
(dos canciones con el mismo título y distinto autor son canciones DISTINTAS,
ambas pueden convivir en el repertorio).

## Formato de destino (tabla `public.songs`, proyecto `gvsoexomzfaimagnaqzm`)

```
title         → nombre exacto del Excel (trim, sin espacios líderes)
artist        → autor del Excel
original_key  → TONALIDAD del Excel (notación: C, C#, D... y menores Am, Bm, C#m...)
key           → igual a original_key
category      → 'adoracion'   (decisión de Paul 2026-06: todas entran así, él recategoriza)
categories    → ARRAY['adoracion']
youtube_url   → LINK del Excel
structure     → jsonb array de secciones (ver abajo)
compass, bpm  → NULL (Paul los completa después)
```

### Estructura de secciones

Array ordenado de `{type, label, chords, content}`:

- `type` ∈ `intro | verse | pre-chorus | chorus | bridge | interlude | coda | ending`
- `label`: "Intro", "Verso 1", "Pre Coro", "Coro 1", "Puente", "Interludio", "Coda", "Final".
  Numerar sólo si hay >1 del mismo tipo con contenido distinto.
- `chords`: UNA línea, tokens separados por espacio simple
- `content`: letra pura con `\n` entre líneas. NUNCA acordes intercalados en la letra.

### Regla de oro de los acordes (motor de transposición, appStore.js)

Cada token debe matchear `^([A-G])([#b]?)(sufijo)(/bajo)?$`:
- ✅ `Am` `F#m7` `Bb` `Gsus4` `Cmaj7` `D/F#` `Am7/G` `Baddb9`
- ✅ separadores sueltos `//` `|` `-` (pasan intactos, no transponen — usarlos SÓLO como separador visual)
- ❌ `(Am)` `Am(x2)` `[Intro]` `N.C.` pegados a acordes — el parser los ignora y ese
  acorde NO transpone (bug silencioso). Repeticiones se indican en la letra o se omiten.
- El transporte colapsa espacios múltiples a uno — no usar alineación por espacios.

### Deduplicación de secciones

Si la fuente repite una sección (coro tras cada verso), cargar UNA sola vez.
Dos coros con letra distinta = "Coro 1" y "Coro 2". Ninguna sección puede
faltar; ninguna puede repetirse.

### Transposición previa

Si la mejor fuente está en otro tono que el del Excel, transponer TODOS los
acordes al tono del Excel antes de cargar (aritmética de semitonos:
C=0 C#=1 D=2 D#=3 E=4 F=5 F#=6 G=7 G#=8 A=9 A#=10 B=11; menores relativos
Am=0 A#m=1 Bm=2 Cm=3 C#m=4 Dm=5 D#m=6 Em=7 Fm=8 F#m=9 Gm=10 G#m=11;
bemoles → sostenidos: Db=C# Eb=D# Gb=F# Ab=G# Bb=A#).

## Procedimiento

1. **Leer el Excel** y chequear duplicados contra la DB:
   `SELECT title, artist FROM songs WHERE unaccent(lower(title)) LIKE ...`
   Homónimos con distinto autor NO son duplicados — se cargan igual.
   Mismo título + mismo autor = saltear y avisar a Paul.

2. **PAUSAR el push de "Nueva canción"** (autorizado por Paul como parte del método):
   ```sql
   ALTER TABLE public.songs DISABLE TRIGGER notify_on_song_insert;
   ```

3. **Por cada canción**: buscar en `lacuerda.net` y `cifraclub.com`
   (WebFetch primero; browser si bloquea). Filtrar por intérprete del Excel
   y contexto cristiano. Elegir la mejor calificada, priorizando la que esté
   en la tonalidad original. Extraer secciones → mapear a los 8 tipos →
   dedupe → sanitizar cada token de acorde con la regex → transponer si hace
   falta → INSERT via `mcp apply execute_sql`:
   ```sql
   INSERT INTO public.songs (id, title, artist, original_key, key, category, categories, youtube_url, structure)
   VALUES (gen_random_uuid(), $título, $autor, $tono, $tono, 'adoracion', ARRAY['adoracion'], $link, $structure::jsonb);
   ```

4. **Verificación post-carga** (por lote): query de sanidad
   `SELECT title, jsonb_array_length(structure) FROM songs WHERE created_at > NOW() - INTERVAL '1 hour'`
   + validar cada token de cada chords con la regex + abrir 1-2 canciones en
   la plataforma y probar el transporte visualmente.

5. **REACTIVAR EL TRIGGER — OBLIGATORIO, NUNCA OLVIDAR**:
   ```sql
   ALTER TABLE public.songs ENABLE TRIGGER notify_on_song_insert;
   -- verificar:
   SELECT tgname, tgenabled FROM pg_trigger WHERE tgname='notify_on_song_insert';
   -- tgenabled debe ser 'O'
   ```

6. **Reporte a Paul**: tabla con canción · fuente elegida · tono fuente ·
   secciones cargadas · decisiones editoriales. Cierre narrativo.

## Landmines conocidas

- NUNCA usar `updateSong`-style partial updates vía converters (regla #8 CLAUDE.md).
  Para carga sólo INSERT.
- El INSERT via MCP corre como postgres: el audit trigger registra actor NULL — ok.
- lacuerda.net URLs: `https://acordes.lacuerda.net/<artista>/<cancion>/` (a veces `_2`, `_3` para versiones).
- cifraclub URLs: `https://www.cifraclub.com/<artista>/<cancion>/`.
- Los títulos existentes en DB pueden tener espacios líderes históricos — comparar con trim+unaccent+lower.
