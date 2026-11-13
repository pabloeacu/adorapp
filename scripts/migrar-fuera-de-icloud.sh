#!/usr/bin/env bash
# =============================================================================
# AdorAPP — Migración del proyecto FUERA de iCloud (Escritorio → ~/Developer)
# -----------------------------------------------------------------------------
# Por qué: el Escritorio está sincronizado con iCloud Drive. iCloud vigila cada
# cambio de archivo y en un proyecto con node_modules (decenas de miles de
# archivos) eso satura CPU, disco y memoria. ~/Developer es la carpeta que Apple
# reserva para desarrollo: iCloud NUNCA la sincroniza.
#
# Qué hace (por etapas; nada se borra hasta el final y solo si todo pasó):
#   0. Pre-vuelo: macOS, rutas, espacio en disco, archivos "en la nube" sin
#      descargar (placeholders .icloud) → los baja antes de copiar.
#   1. Repo: estado de git, HEAD vs origin/main, respaldo .bundle de TODO el repo.
#   2. Copia (rsync, dos pasadas) de TODO el árbol salvo lo regenerable
#      (node_modules, dist, .vite, coverage, .DS_Store). Conserva .git, .env*,
#      .vercel, presentation/, PDFs, docs, memoria, scripts viejos del wrapper.
#   3. Reinstala dependencias en destino (npm ci, como CI).
#   4. Auditoría triple: inventario idéntico, SHA-256 idéntico, git idéntico
#      (HEAD, estado, fsck) + lint + tests + build en verde desde la ruta nueva.
#   5. Memoria de Claude Code: duplica ~/.claude/projects/<slug viejo> →
#      <slug nuevo> y las entradas de ~/.claude.json (permisos, MCP, etc.).
#   6. Limpieza: basura regenerable en destino, .DS_Store, caché de npm,
#      informe de otros ocupantes grandes del disco (no se borran solos).
#   7. Borrado del origen: SOLO con --borrar-origen y SOLO si la auditoría pasó.
#      Mueve el origen a la Papelera (reversible) o, con --definitivo, lo borra.
#
# Uso (en Terminal, en tu Mac):
#   bash ~/Desktop/Adorapp/adorapp/scripts/migrar-fuera-de-icloud.sh            # etapas 0–6
#   bash ~/Developer/Adorapp/adorapp/scripts/migrar-fuera-de-icloud.sh --borrar-origen   # etapa 7
# Opciones: --origen RUTA  --destino RUTA  --saltar-build  --definitivo
# Es idempotente: se puede volver a correr; rsync solo copia lo que falte.
# =============================================================================
set -euo pipefail

ORIGEN="${HOME}/Desktop/Adorapp"
DESTINO="${HOME}/Developer/Adorapp"
BORRAR_ORIGEN=0; DEFINITIVO=0; SALTAR_BUILD=0
while [ $# -gt 0 ]; do
  case "$1" in
    --origen) ORIGEN="$2"; shift 2 ;;
    --destino) DESTINO="$2"; shift 2 ;;
    --borrar-origen) BORRAR_ORIGEN=1; shift ;;
    --definitivo) DEFINITIVO=1; shift ;;
    --saltar-build) SALTAR_BUILD=1; shift ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "Opción desconocida: $1"; exit 2 ;;
  esac
done

ORIGEN="${ORIGEN%/}"; DESTINO="${DESTINO%/}"
[ -n "$ORIGEN" ] && [ -n "$DESTINO" ] || { echo "Origen/destino vacíos"; exit 2; }
REPO_REL="adorapp"                       # el repo vive dentro del wrapper
SRC_REPO="${ORIGEN}/${REPO_REL}"; DST_REPO="${DESTINO}/${REPO_REL}"
FECHA="$(date +%Y%m%d-%H%M%S)"
RESPALDOS="${HOME}/Developer/_respaldos"
LOG="${RESPALDOS}/migracion-${FECHA}.log"
EXCLUDES=(--exclude node_modules --exclude dist --exclude dist-ssr --exclude .vite --exclude coverage --exclude .DS_Store --exclude '._*' --exclude '*.icloud')

ok()   { printf '  ✓ %s\n' "$*" | tee -a "$LOG"; }
info() { printf '  · %s\n' "$*" | tee -a "$LOG"; }
warn() { printf '  ⚠ %s\n' "$*" | tee -a "$LOG"; }
fail() { printf '\n  ✗ %s\n\n' "$*" | tee -a "$LOG"; exit 1; }
titulo() { printf '\n== %s ==\n' "$*" | tee -a "$LOG"; }

mkdir -p "$RESPALDOS"; : > "$LOG"
echo "AdorAPP · migración fuera de iCloud · $(date)" | tee -a "$LOG"
echo "Origen:  $ORIGEN" | tee -a "$LOG"; echo "Destino: $DESTINO" | tee -a "$LOG"; echo "Log:     $LOG" | tee -a "$LOG"

# ----------------------------------------------------------------------------- 7
if [ "$BORRAR_ORIGEN" = 1 ]; then
  titulo "7) Borrado del origen"
  [ -f "${DESTINO}/.migracion-ok" ] || fail "No existe ${DESTINO}/.migracion-ok: la auditoría no pasó (o no se corrió). No borro nada."
  [ -d "$ORIGEN" ] || { ok "El origen ya no existe. Nada que borrar."; exit 0; }
  case "$ORIGEN" in "$HOME"/Desktop/*|"$HOME"/Documents/*|"$HOME"/Developer/*) ;; *) fail "Por seguridad solo borro orígenes dentro de Desktop, Documents o Developer: $ORIGEN" ;; esac
  case "$(pwd)/" in "$ORIGEN"/*) fail "Estás parado DENTRO del origen. Hacé: cd ~ y volvé a correrlo." ;; esac
  # Re-verificación rápida antes de borrar: HEAD igual en origen y destino.
  if [ -d "$SRC_REPO/.git" ]; then
    [ "$(git -C "$SRC_REPO" rev-parse HEAD)" = "$(git -C "$DST_REPO" rev-parse HEAD)" ] || fail "HEAD difiere entre origen y destino. No borro."
  fi
  if [ "$DEFINITIVO" = 1 ]; then
    rm -rf "${ORIGEN:?}"; ok "Origen borrado definitivamente: $ORIGEN"
  else
    PAPELERA="${HOME}/.Trash/Adorapp-origen-${FECHA}"; mkdir -p "${HOME}/.Trash"
    mv "$ORIGEN" "$PAPELERA"; ok "Origen movido a la Papelera: $PAPELERA"
    info "Cuando confirmes que todo anda desde la ruta nueva, vaciá la Papelera para liberar el espacio."
  fi
  info "iCloud: al desaparecer del Escritorio, iCloud también lo saca de la nube (queda 30 días en 'Eliminados recientemente' de iCloud Drive)."
  exit 0
fi

# ----------------------------------------------------------------------------- 0
titulo "0) Pre-vuelo"
[ "$(uname -s)" = "Darwin" ] || fail "Este guion es para macOS."
[ -d "$ORIGEN" ] || fail "No existe el origen: $ORIGEN"
[ -d "$SRC_REPO/.git" ] || fail "No encuentro el repo git en $SRC_REPO"
command -v rsync >/dev/null || fail "Falta rsync."
{ command -v node >/dev/null && command -v npm >/dev/null; } || fail "Falta node/npm (instalá Node 24 antes de seguir)."
command -v shasum >/dev/null || fail "Falta shasum."
case "$DESTINO" in "$HOME"/Desktop/*|"$HOME"/Documents/*|*"Mobile Documents"*) fail "El destino sigue dentro de iCloud. Elegí otro (p. ej. ~/Developer/Adorapp)." ;; esac
case "$DESTINO" in "$ORIGEN"/*) fail "El destino no puede estar dentro del origen." ;; esac
mkdir -p "$DESTINO"
# Archivos evictados por iCloud ("Optimizar almacenamiento"): el contenido NO está en el disco.
PLACEHOLDERS="$(find "$ORIGEN" -name '*.icloud' -not -path '*/node_modules/*' 2>/dev/null || true)"
if [ -n "$PLACEHOLDERS" ]; then
  N="$(printf '%s\n' "$PLACEHOLDERS" | wc -l | tr -d ' ')"
  warn "$N archivo(s) están solo en la nube (placeholders .icloud). Los descargo antes de copiar…"
  printf '%s\n' "$PLACEHOLDERS" | while IFS= read -r p; do
    real="$(dirname "$p")/$(basename "$p" | sed -e 's/^\.//' -e 's/\.icloud$//')"
    brctl download "$real" >/dev/null 2>&1 || true
  done
  for _ in $(seq 1 60); do
    [ -z "$(find "$ORIGEN" -name '*.icloud' -not -path '*/node_modules/*' 2>/dev/null)" ] && break
    sleep 5
  done
  [ -z "$(find "$ORIGEN" -name '*.icloud' -not -path '*/node_modules/*' 2>/dev/null)" ] || fail "Siguen quedando archivos sin descargar de iCloud. Abrí Finder en el Escritorio, esperá a que terminen de bajar y volvé a correr."
  ok "Todos los archivos están completos en el disco."
else
  ok "No hay archivos pendientes de descarga de iCloud."
fi
NECESARIO_KB="$(find "$ORIGEN" -path '*/node_modules' -prune -o -type f -print0 2>/dev/null | xargs -0 stat -f '%z' 2>/dev/null | awk '{s+=$1} END{print int(s/1024)+1}')"
LIBRE_KB="$(df -k "$HOME" | awk 'NR==2{print $4}')"
info "Tamaño a copiar (sin node_modules): $((NECESARIO_KB/1024)) MB · libre en disco: $((LIBRE_KB/1024)) MB"
[ "$LIBRE_KB" -gt $((NECESARIO_KB * 2 + 2000000)) ] || fail "Poco espacio libre para copiar con margen (hacen falta ~$((NECESARIO_KB*2/1024+2000)) MB)."

# ----------------------------------------------------------------------------- 1
titulo "1) Estado del repositorio"
cd "$SRC_REPO"
git fetch -q origin main 2>&1 | tee -a "$LOG" || warn "No pude hacer fetch (¿sin internet?). Sigo con lo local."
RAMA="$(git rev-parse --abbrev-ref HEAD)"; HEAD_SHA="$(git rev-parse HEAD)"
info "Rama: $RAMA · HEAD: ${HEAD_SHA:0:12}"
SUCIO="$(git status --porcelain)"
if [ -n "$SUCIO" ]; then
  warn "Hay cambios sin commitear ($(printf '%s\n' "$SUCIO" | wc -l | tr -d ' ') archivo/s). Se copian tal cual y se verifican byte a byte; no se pierden."
  printf '%s\n' "$SUCIO" >> "$LOG"
else ok "Árbol de trabajo limpio."; fi
if git rev-parse --verify -q origin/main >/dev/null; then
  ADELANTE="$(git rev-list --count origin/main..HEAD)"; ATRAS="$(git rev-list --count HEAD..origin/main)"
  if [ "$ADELANTE" = 0 ]; then ok "No hay commits locales sin subir."; else warn "$ADELANTE commit(s) locales no están en origin/main (se conservan en la copia; subilos cuando quieras)."; fi
  if [ "$ATRAS" = 0 ]; then ok "HEAD está al día con origin/main."; else info "origin/main tiene $ATRAS commit(s) más nuevos; no hago pull automático (lo hacés desde la ruta nueva)."; fi
fi
if git fsck --no-dangling >/dev/null 2>&1; then ok "git fsck: repo íntegro."; else fail "git fsck encontró problemas en el repo de origen. No sigo: revisá 'git fsck' antes de migrar."; fi
BUNDLE="${RESPALDOS}/adorapp-${FECHA}.bundle"
if git bundle create -q "$BUNDLE" --all && git bundle verify -q "$BUNDLE" >/dev/null 2>&1; then ok "Respaldo completo del repo (todas las ramas): $BUNDLE"; else fail "No pude crear/verificar el respaldo .bundle del repo."; fi
cd "$HOME"

# ----------------------------------------------------------------------------- 2
titulo "2) Copia (rsync, dos pasadas)"
rsync -a --stats "${EXCLUDES[@]}" "$ORIGEN/" "$DESTINO/" 2>&1 | grep -E 'Number of (regular )?files|Total transferred' | tee -a "$LOG"
SEGUNDA="$(rsync -a --itemize-changes "${EXCLUDES[@]}" "$ORIGEN/" "$DESTINO/" | grep -v '^\.d' | grep -c '^[<>c]' || true)"
if [ "$SEGUNDA" = 0 ]; then ok "Segunda pasada sin diferencias: la copia está completa."; else fail "La segunda pasada todavía copió $SEGUNDA archivo(s): algo está cambiando en el origen (¿iCloud sincronizando?). Esperá y volvé a correr."; fi

# ----------------------------------------------------------------------------- 3
titulo "3) Dependencias en destino"
cd "$DST_REPO"
( npm ci --legacy-peer-deps --no-audit --no-fund 2>&1 | tail -3 ) | tee -a "$LOG"
if [ -d node_modules ]; then ok "node_modules reinstalado en la ruta nueva (fuera de iCloud)."; else fail "npm ci no dejó node_modules en destino."; fi

# ----------------------------------------------------------------------------- 4
titulo "4) Auditoría triple"
inventario() { ( cd "$1" && find . \( -name node_modules -o -name dist -o -name dist-ssr -o -name .vite -o -name coverage \) -prune -o \( -type f -o -type l \) -print | grep -v -e '/\.DS_Store$' -e '/\._' -e '\.icloud$' | LC_ALL=C sort ); }
inventario "$ORIGEN" > "${RESPALDOS}/inv-origen-${FECHA}.txt"
inventario "$DESTINO" > "${RESPALDOS}/inv-destino-${FECHA}.txt"
if diff -q "${RESPALDOS}/inv-origen-${FECHA}.txt" "${RESPALDOS}/inv-destino-${FECHA}.txt" >/dev/null; then
  ok "(a) Inventario idéntico: $(wc -l < "${RESPALDOS}/inv-origen-${FECHA}.txt" | tr -d ' ') archivos."
else
  diff "${RESPALDOS}/inv-origen-${FECHA}.txt" "${RESPALDOS}/inv-destino-${FECHA}.txt" | head -20 | tee -a "$LOG"
  fail "(a) El inventario difiere (ver arriba)."
fi
sumas() { ( cd "$1" && tr '\n' '\0' < "$2" | xargs -0 shasum -a 256 2>/dev/null | LC_ALL=C sort -k2 ); }
sumas "$ORIGEN" "${RESPALDOS}/inv-origen-${FECHA}.txt"  > "${RESPALDOS}/sha-origen-${FECHA}.txt"
sumas "$DESTINO" "${RESPALDOS}/inv-destino-${FECHA}.txt" > "${RESPALDOS}/sha-destino-${FECHA}.txt"
if diff -q "${RESPALDOS}/sha-origen-${FECHA}.txt" "${RESPALDOS}/sha-destino-${FECHA}.txt" >/dev/null; then
  ok "(b) SHA-256 idéntico en todos los archivos."
else
  diff "${RESPALDOS}/sha-origen-${FECHA}.txt" "${RESPALDOS}/sha-destino-${FECHA}.txt" | head -20 | tee -a "$LOG"
  fail "(b) Hay archivos cuyo contenido difiere (ver arriba)."
fi
[ "$(git -C "$DST_REPO" rev-parse HEAD)" = "$HEAD_SHA" ] || fail "(c) HEAD difiere en destino."
[ "$(git -C "$DST_REPO" status --porcelain)" = "$SUCIO" ] || fail "(c) El estado de git difiere en destino."
if git -C "$DST_REPO" fsck --no-dangling >/dev/null 2>&1; then ok "(c) git en destino: mismo HEAD (${HEAD_SHA:0:12}), mismo estado, fsck íntegro."; else fail "(c) git fsck falló en destino."; fi
for f in .env .env.local .vercel/project.json presentation; do
  if [ -e "$SRC_REPO/$f" ]; then
    if [ -e "$DST_REPO/$f" ]; then ok "    conservado: $f"; else fail "Falta $f en destino"; fi
  fi
done
cd "$DST_REPO"
if npm run lint >/dev/null 2>&1; then ok "(c) lint en verde desde la ruta nueva."; else fail "(c) lint falló en destino (revisá: cd $DST_REPO && npm run lint)."; fi
if npx vitest run >/dev/null 2>&1; then ok "(c) tests en verde desde la ruta nueva."; else fail "(c) tests fallaron en destino (revisá: cd $DST_REPO && npx vitest run)."; fi
if [ "$SALTAR_BUILD" = 1 ]; then info "(c) build salteado por --saltar-build."
else
  if [ -f .env ]; then set -a; . ./.env; set +a; fi
  if VITE_SUPABASE_URL="${VITE_SUPABASE_URL:-https://gvsoexomzfaimagnaqzm.supabase.co}" VITE_SUPABASE_ANON_KEY="${VITE_SUPABASE_ANON_KEY:-verificacion-local}" npm run build >/dev/null 2>&1; then
    ok "(c) build de producción en verde desde la ruta nueva."
  else
    fail "(c) build falló en destino (revisá: cd $DST_REPO && npm run build)."
  fi
  rm -rf "${DST_REPO:?}/dist"
fi
cd "$HOME"

# ----------------------------------------------------------------------------- 5
titulo "5) Memoria y configuración de Claude Code"
slug() { printf '%s' "$1" | sed 's#/#-#g'; }
for par in "$SRC_REPO|$DST_REPO" "$ORIGEN|$DESTINO"; do
  viejo="${par%%|*}"; nuevo="${par##*|}"
  SV="${HOME}/.claude/projects/$(slug "$viejo")"; SN="${HOME}/.claude/projects/$(slug "$nuevo")"
  if [ -d "$SV" ]; then
    mkdir -p "$SN"; rsync -a "$SV/" "$SN/"
    ok "Memoria/sesiones copiadas: $(basename "$SV") → $(basename "$SN") ($(find "$SV" -type f | wc -l | tr -d ' ') archivos)"
  fi
done
if [ -f "${HOME}/.claude.json" ] && command -v node >/dev/null; then
  cp "${HOME}/.claude.json" "${RESPALDOS}/claude.json-${FECHA}.bak"
  node - "$HOME/.claude.json" "$SRC_REPO" "$DST_REPO" "$ORIGEN" "$DESTINO" <<'NODE'
const fs = require('fs'); const [file, a, b, c, d] = process.argv.slice(2);
const j = JSON.parse(fs.readFileSync(file, 'utf8')); let n = 0;
if (j.projects) for (const [viejo, nuevo] of [[a, b], [c, d]]) {
  if (j.projects[viejo] && !j.projects[nuevo]) { j.projects[nuevo] = j.projects[viejo]; n++; }
}
fs.writeFileSync(file, JSON.stringify(j, null, 2)); console.log(`  ✓ ~/.claude.json: ${n} entrada(s) de proyecto duplicadas a la ruta nueva (permisos, MCP, preferencias). Respaldo guardado.`);
NODE
fi

# ----------------------------------------------------------------------------- 6
titulo "6) Limpieza y optimización"
find "${DESTINO:?}" -name '.DS_Store' -delete 2>/dev/null || true; ok ".DS_Store barridos en destino."
rm -rf "${DST_REPO:?}/dist" "${DST_REPO:?}/.vite" "${DST_REPO:?}/coverage" 2>/dev/null || true
find "${DST_REPO:?}" -maxdepth 1 -name '*.log' -delete 2>/dev/null || true
ok "Basura regenerable eliminada en destino (dist, .vite, coverage, logs)."
if npm cache verify >/dev/null 2>&1; then ok "Caché de npm verificada/compactada."; fi
info "Ocupantes grandes del disco (informativo, NO se borran solos):"
for d in "$SRC_REPO/node_modules" "$HOME/Library/Caches" "$HOME/Library/Developer/Xcode/DerivedData" "$HOME/Library/Caches/ms-playwright" "$HOME/.npm/_cacache" "$HOME/Library/Application Support/Code/Cache" "$HOME/Library/Containers/com.docker.docker"; do
  [ -d "$d" ] && printf '    %8s  %s\n' "$(du -sh "$d" 2>/dev/null | cut -f1)" "$d" | tee -a "$LOG"
done
command -v brew >/dev/null && info "Homebrew: 'brew cleanup' libera descargas viejas (seguro)."

touch "${DESTINO}/.migracion-ok"
titulo "LISTO"
ok "Migración verificada. El proyecto ahora vive en: $DST_REPO"
info "Siguiente: cerrá las ventanas/terminales abiertas sobre el Escritorio y abrí el proyecto desde la ruta nueva:"
info "    cd $DST_REPO && claude"
info "Y recién cuando confirmes que todo anda, borrá el origen:"
info "    bash $DST_REPO/scripts/migrar-fuera-de-icloud.sh --borrar-origen"
info "Log completo: $LOG"
