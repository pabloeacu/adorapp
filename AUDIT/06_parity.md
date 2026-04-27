# 06 — Paridad mobile / desktop

Tailwind breakpoint `lg` (1024px) bifurca el render: arriba se monta `<Sidebar>` + `<Header>` + `<Outlet>`; abajo solo `<MobileNav>` (que es un componente self-contained de 1242 líneas con su propio header, profile sheet, photo cropper, drawer de notificaciones y bottom tab bar). Es una decisión deliberada del agente anterior.

**Buenas:** las dos vistas muestran las mismas secciones (Dashboard / Órdenes / Repertorio / Bandas / Miembros / + Solicitudes y Comunicaciones para pastor). El breakpoint funciona, las ventanas intermedias (768-1023) caen en mobile sin romperse.

**Malas:** los dos archivos casi-idénticos generan drift (cualquier fix tiene que replicarse), y hay accidentes de UX que no son decisión de diseño sino consecuencia de la duplicación.

---

## Matriz por ruta

| Ruta | Desktop opera | Mobile opera | Gap real |
|---|---|---|---|
| `/` (Dashboard) | Stats grid 4-col, listas 2-col | Stats 2-col, listas 1-col, member list truncada | Decisión OK |
| `/ordenes` | Tabla con sort + filtros, modal full | Cards filtrables, sin sort por columna | ⚠️ Sort no portado a mobile |
| `/repertorio` | Tabla 6-col + cards toggle, transposición inline | Solo cards, sin tabla | OK (vista distinta, mismas ops) |
| `/bandas` | Cards con member count visible | Drawer con miembros | OK |
| `/miembros` | Tabla 8-col con instruments visibles + cards toggle | Cards (instruments truncados a 2 + "+N") | OK |
| `/solicitudes` | Tabla + acciones inline | Cards | OK |
| `/comunicaciones` | Form con multi-select expandido | Form con multi-select compacto | ⚠️ Multi-select cramped |
| `/login` | Form estándar | Form estándar | ⚠️ Checkbox sin `<label htmlFor>` |

---

## Hallazgos por severidad

### 🔴 Crítico

**MP1 · Cropper de foto duplicado y matemáticamente divergente** (Header.jsx:830-1000 ↔ MobileNav.jsx:316-475)
Las dos implementaciones del canvas crop tienen variables ligeramente distintas (Header usa `canvasSize=400`, MobileNav usa `canvasSize=400` también pero con `previewMaxHeight=280`). El usuario sube una foto desde mobile y el sidebar de desktop la ve cropeada en una posición distinta de cómo la vió al recortarla. Ya documentado en `03_code_quality.md` como C1.
*Fix:* `usePhotoCropper()` hook compartido.

**MP2 · `inputmode` y `autocomplete` faltan en formularios** (`Login.jsx:107-128`, `Login.jsx:386`, varios)
Sin `inputmode="email"` el iOS te muestra teclado normal en vez del con @. Sin `autocomplete="current-password"` el password manager no autocompleta. Sin `inputmode="tel"` los celulares no muestran teclado numérico para teléfonos.
*Fix:* lista corta — 12 inputs en total. 30 min.

### 🟠 Alto

**MP3 · Sort por columna no funciona en mobile** (`Ordenes.jsx`, `Miembros.jsx`)
La tabla en desktop tiene `<th>` clickeables para ordenar por fecha/nombre. En mobile la lista de cards no expone el sort. Es funcionalidad faltante.
*Fix:* dropdown "Ordenar por…" arriba de las cards.

**MP4 · Modal puede pasar el viewport en mobile con teclado abierto** (`Modal.jsx:37`)
`max-h-[calc(100vh-160px)]` no contempla `100dvh` (dynamic viewport) ni el alto del soft keyboard. En iOS landscape con keyboard abierto, el botón "Guardar" queda debajo del teclado.
*Fix:* `max-h-[calc(100dvh-160px)]` + `paddingBottom: env(safe-area-inset-bottom)`. 10 min.

**MP5 · Bottom tab bar tap targets cramped** (`MobileNav.jsx:1219`)
`h-16` (64 px) entre 5-7 tabs deja ~50 px por tab incluyendo padding del icono. Apple HIG y WCAG sugieren ≥44 px **del área tappable real**, y acá el área visual del icono+label es ~32 px.
*Fix:* `h-20` y/o agrandar el padding interno del NavLink. 5 min.

**MP6 · Tablas con scroll horizontal en mobile** (`Miembros.jsx:621`, `Repertorio.jsx:732`, `Solicitudes.jsx:410`)
Las tablas usan `overflow-x-auto` que funciona pero es UX malo en mobile (scroll horizontal en pantallas táctiles es desagradable).
*Fix:* agregar `lg:` al `<table>` y mostrar siempre cards en mobile (algunas ya lo hacen — completar las que faltan).

### 🟡 Medio

**MP7 · No hay título visible de la página en mobile** (`MobileNav.jsx`)
Header desktop tiene `pageTitles` y muestra el título de la página ("Repertorio", "Órdenes", etc.). Mobile solo muestra logo + bell + perfil, sin título. El user en una ruta deep no sabe dónde está.
*Fix:* agregar `<h1>` sticky después del header en mobile, leyendo de `pageTitles`. 30 min.

**MP8 · Safe area inset no se aplica al footer del Modal** (`Modal.jsx`)
El padding-bottom usa una clase utility opcional. Si el Modal queda contra el borde inferior y el dispositivo tiene home indicator (iPhone X+), el botón se solapa con la barra del sistema.
*Fix:* `style={{ paddingBottom: 'env(safe-area-inset-bottom, 1rem)' }}` directo en el footer. 5 min.

**MP9 · No hay `enterkeyhint` en inputs**
El botón "Enter" del teclado mobile dice "Go" por default; podríamos decir "Buscar" en search inputs y "Enviar" en form submits.
*Fix:* `enterkeyhint="search"` / `"send"` / `"done"` en cada input. 15 min.

### 🔵 Bajo

**MP10 · Animations sin `prefers-reduced-motion`** (`index.css`)
Los `.animate-fade-in` / `.animate-slide-up` corren para todos. Usuarios con sensibilidad vestibular tienen ajuste del sistema que esto ignora.
*Fix:* `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }`. 5 min.

---

## Top 3 unificaciones recomendadas

1. **Hook `usePhotoCropper`** (resuelve MP1 + duplicación). 2 horas. *Descrito en 03.*
2. **Hook `useNotifications`** (resuelve duplicación de carga de campanita). 2 horas. *Descrito en 03.*
3. **Componente `<PageTitleBar>`** + integración en `MobileNav.jsx` y `Header.jsx`. 30 minutos. Resuelve MP7 + reduce duplicación de `pageTitles`.
