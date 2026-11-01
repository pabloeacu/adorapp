// Reporte del evento (panel /eventos): PDF cinematográfico "con la onda" de The
// Chosen + planilla Excel. Las funciones de análisis son PURAS (testeables); los
// builders cargan jsPDF / exceljs por import() dinámico (chunk perezoso, no pesa
// en el primer paint). El cliente provee las imágenes YA en dataURL, así la lib no
// depende del DOM y se puede renderizar en node para QA.

export const EMAIL_LABEL = { sent: 'Enviado', pending: 'En cola', failed: 'Falló', bounced: 'Rebotó' };

const TZ = 'America/Argentina/Buenos_Aires';

// Fecha/hora en ART, legible. Acepta Date o ISO string.
export function fmtArt(value, withTime = true) {
  if (!value) return '';
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const opts = withTime
      ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ }
      : { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ };
    return d.toLocaleString('es-AR', opts);
  } catch { return ''; }
}

// Normaliza el nombre de iglesia (texto libre: lo escribieron de 15 formas) a un
// bucket canónico. Verificado contra la base el 2026-11-01 (CAF 339 personas, +
// un puñado de invitados de otras iglesias). Si aparece un nombre nuevo cae en
// "Otras" sin romper nada.
export function normalizeChurch(raw) {
  const folded = (raw == null ? '' : String(raw))
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // saca tildes
    .replace(/[^a-z0-9]/g, '');                        // deja solo letras/números
  if (!folded || folded === 'ninguna' || folded === 'local') return '(Sin dato)';
  if (/caf|avivam|avivar/.test(folded)) return 'CAF';
  if (/reydereyes/.test(folded)) return 'Rey de Reyes';
  if (/luzpara/.test(folded)) return 'Luz para nuestros caminos';
  if (/sembrandovida/.test(folded)) return 'Sembrando Vida';
  if (/manantial/.test(folded)) return 'Manantial de Bendiciones';
  if (/aguila/.test(folded)) return 'Águila y León';
  if (/selladosporelfuego/.test(folded)) return 'Sellados por el Fuego';
  return 'Otras';
}

const peopleOf = (r) => 1 + (r?.acompanantes || 0);

// Analítica del evento a partir de las reservas (ignora las canceladas). Todo por
// PERSONAS (titular + acompañantes), que es la unidad que le importa al pastor.
export function computeEventAnalytics(regs) {
  const active = (regs || []).filter((r) => r && r.status !== 'cancelled');
  const reservas = active.length;
  const personas = active.reduce((a, r) => a + peopleOf(r), 0);
  const ingresadas = active.filter((r) => r.checked_in_at);
  const reservasIngreso = ingresadas.length;
  const personasIngreso = ingresadas.reduce((a, r) => a + peopleOf(r), 0);

  const bucketByPeople = (keyOf) => {
    const m = new Map();
    for (const r of active) {
      const k = keyOf(r);
      m.set(k, (m.get(k) || 0) + peopleOf(r));
    }
    return [...m.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'es'));
  };

  const como = bucketByPeople((r) => (r.como_se_entero && r.como_se_entero.trim()) || '(Sin dato)');
  const iglesias = bucketByPeople((r) => normalizeChurch(r.iglesia));

  return {
    reservas,
    personas,
    reservasIngreso,
    personasIngreso,
    noVinieron: Math.max(0, personas - personasIngreso),
    asistenciaPct: personas ? Math.round((personasIngreso / personas) * 100) : 0,
    como,
    iglesias,
  };
}

// Una fila por PERSONA: el titular y, debajo, cada acompañante. Mismas columnas
// que exportaba el CSV histórico (ahora en xlsx y en el PDF).
function flattenPeople(regs, guestsByReg) {
  const rows = [];
  for (const r of regs || []) {
    if (!r) continue;
    const code = (r.ticket_token || '').slice(0, 6).toUpperCase();
    const cancelada = r.status === 'cancelled';
    rows.push({
      tipo: 'Titular',
      code,
      nombre: r.nombre || '',
      email: r.email || '',
      celular: r.celular || '',
      iglesia: r.iglesia || '',
      como: r.como_se_entero || '',
      acompanantes: r.acompanantes || 0,
      personasEnReserva: peopleOf(r),
      estadoCorreo: EMAIL_LABEL[r.email_status] || r.email_status || '',
      ingreso: r.checked_in_at ? fmtArt(r.checked_in_at) : '',
      ingresoBool: !!r.checked_in_at,
      fechaReserva: fmtArt(r.created_at),
      cancelada,
      titular: true,
    });
    for (const g of guestsByReg?.[r.id] || []) {
      rows.push({
        tipo: 'Acompañante',
        code,
        nombre: g.nombre || '',
        email: g.email || '',
        celular: g.celular || '',
        iglesia: '',
        como: '',
        acompanantes: '',
        personasEnReserva: '',
        estadoCorreo: '',
        ingreso: '',
        ingresoBool: false,
        fechaReserva: '',
        cancelada,
        titular: false,
      });
    }
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Excel (.xlsx) — misma info que el CSV histórico, con encabezado prolijo.
// ─────────────────────────────────────────────────────────────────────────────
export async function buildEventXlsxBlob(regs, guestsByReg) {
  const mod = await import('exceljs');
  const ExcelJS = mod.default || mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AdorApp';
  wb.created = new Date();
  const ws = wb.addWorksheet('Inscriptos', { views: [{ state: 'frozen', ySplit: 1 }] });

  const cols = [
    { header: 'Tipo', key: 'tipo', width: 16 },
    { header: 'Código reserva', key: 'code', width: 15 },
    { header: 'Nombre', key: 'nombre', width: 30 },
    { header: 'Email', key: 'email', width: 34 },
    { header: 'Celular', key: 'celular', width: 16 },
    { header: 'Iglesia', key: 'iglesia', width: 26 },
    { header: 'Cómo se enteró', key: 'como', width: 20 },
    { header: 'Acompañantes', key: 'acompanantes', width: 14 },
    { header: 'Personas en la reserva', key: 'personasEnReserva', width: 20 },
    { header: 'Estado correo', key: 'estadoCorreo', width: 14 },
    { header: 'Ingreso', key: 'ingreso', width: 18 },
    { header: 'Fecha reserva', key: 'fechaReserva', width: 18 },
    { header: 'Reserva cancelada', key: 'cancelada', width: 16 },
  ];
  ws.columns = cols;

  // Encabezado: negrita, blanco sobre dorado (marca AdorApp).
  const header = ws.getRow(1);
  header.height = 20;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF1A1A1A' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4AF37' } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFB8860B' } } };
  });

  // Nota: exceljs guarda los strings como texto (sharedStrings), así que un nombre
  // que empiece con "=" NO se ejecuta como fórmula en Excel (a diferencia del CSV).
  for (const p of flattenPeople(regs, guestsByReg)) {
    ws.addRow({
      tipo: p.tipo,
      code: p.code,
      nombre: p.nombre,
      email: p.email,
      celular: p.celular,
      iglesia: p.iglesia,
      como: p.como,
      acompanantes: p.acompanantes === '' ? '' : Number(p.acompanantes),
      personasEnReserva: p.personasEnReserva === '' ? '' : Number(p.personasEnReserva),
      estadoCorreo: p.estadoCorreo,
      ingreso: p.ingreso,
      fechaReserva: p.fechaReserva,
      cancelada: p.cancelada ? 'Sí' : 'No',
    });
  }

  ws.autoFilter = { from: 'A1', to: `M1` };
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF — tapa cinematográfica + tablero (oscuro) + listado completo (claro).
// ─────────────────────────────────────────────────────────────────────────────
export async function buildEventPdfBlob(ev, regs, guestsByReg, opts = {}) {
  const { jsPDF } = await import('jspdf');
  const { images = {}, generatedAt = new Date() } = opts;
  const a = computeEventAnalytics(regs);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = 297;
  const H = 210;
  const M = 14;

  // Paleta champagne-gold sobre obsidiana (marca) + páginas claras para el listado.
  const C = {
    obsidian: [13, 12, 10],
    panel: [26, 23, 18],
    gold: [212, 175, 55],
    goldLite: [242, 201, 76],
    goldHi: [255, 233, 168],
    cream: [245, 241, 232],
    muted: [150, 145, 135],
    track: [52, 47, 38],
    inkBg: [250, 249, 246],
    ink: [38, 34, 28],
    inkMuted: [120, 114, 104],
    rowAlt: [243, 239, 231],
    line: [224, 219, 208],
    green: [70, 150, 96],
    greenDim: [120, 170, 135],
  };

  const setFill = (c) => doc.setFillColor(c[0], c[1], c[2]);
  const setText = (c) => doc.setTextColor(c[0], c[1], c[2]);
  const setDraw = (c) => doc.setDrawColor(c[0], c[1], c[2]);

  // Recorta a maxW (mm) con "…", y además transcodifica a lo que helvetica
  // (WinAnsi/cp1252) sabe dibujar: saca emojis / comillas curvas / caracteres no
  // latinos del texto LIBRE del usuario (si no, jsPDF los muestra como basura).
  // El xlsx no necesita esto (es Unicode nativo).
  const clip = (text, maxW) => {
    let s = (text == null ? '' : String(text)).replace(/[^\u0000-ÿ–—…]/g, '');
    if (doc.getTextWidth(s) <= maxW) return s;        // entra tal cual
    if (doc.getTextWidth('…') > maxW) return '';       // ni la elipsis entra
    while (s.length > 1 && doc.getTextWidth(s + '…') > maxW) s = s.slice(0, -1);
    return s + '…';
  };

  const addImageSafe = (img, x, y, w, h) => {
    if (!img || !img.dataUrl) return false;
    try { doc.addImage(img.dataUrl, 'PNG', x, y, w, h, undefined, 'FAST'); return true; }
    catch { return false; }
  };

  // ── Página 1 · Tapa cinematográfica ──────────────────────────────────────
  setFill(C.obsidian); doc.rect(0, 0, W, H, 'F');
  // Marco dorado fino
  setDraw(C.gold); doc.setLineWidth(0.4); doc.rect(7, 7, W - 14, H - 14);

  // Logo Jóvenes centrado arriba
  if (images.joven) {
    const lw = 34;
    const lh = lw * (images.joven.ratio || 1);
    addImageSafe(images.joven, (W - lw) / 2, 22, lw, lh);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  setText(C.gold);
  doc.text('A V I V A M I E N T O   J Ó V E N E S   ·   P R E S E N T A', W / 2, 66, { align: 'center' });

  doc.setFontSize(46);
  setText(C.cream);
  doc.text('THE CHOSEN', W / 2, 92, { align: 'center' });
  doc.setFontSize(17);
  setText(C.goldLite);
  doc.setFont('helvetica', 'normal');
  doc.text('Temporada 6  ·  Episodio 1', W / 2, 104, { align: 'center' });

  setDraw(C.gold); doc.setLineWidth(0.5); doc.line(W / 2 - 40, 114, W / 2 + 40, 114);

  doc.setFontSize(13);
  setText(C.cream);
  doc.text('Reporte del evento', W / 2, 128, { align: 'center' });
  doc.setFontSize(11);
  setText(C.muted);
  if (ev?.fecha_texto) doc.text(String(ev.fecha_texto), W / 2, 137, { align: 'center' });
  if (ev?.lugar_texto) doc.text(String(ev.lugar_texto), W / 2, 144, { align: 'center' });

  // Pie de tapa: logo CAF arriba, línea "Generado…" debajo (sin encimarse)
  if (images.caf) {
    const cw = 26;
    const ch = cw * (images.caf.ratio || 0.35);
    addImageSafe(images.caf, W / 2 - cw / 2, H - 30, cw, ch);
  }
  doc.setFontSize(8.5);
  setText(C.muted);
  doc.text(`Generado el ${fmtArt(generatedAt)}  ·  AdorApp`, W / 2, H - 13, { align: 'center' });

  // ── Barras horizontales reutilizables (tablero oscuro) ────────────────────
  const drawBars = (x, y, w, items, { max, bar, rowH = 8.4, labelW = 42 } = {}) => {
    const maxV = max || Math.max(1, ...items.map((i) => i.value));
    const trackX = x + labelW;
    const trackW = w - labelW - 12;
    items.forEach((it, i) => {
      const yy = y + i * rowH;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); setText(C.cream);
      doc.text(clip(it.label, labelW - 2), x, yy + 3.3);
      setFill(C.track); doc.roundedRect(trackX, yy, trackW, 4.6, 1, 1, 'F');
      const bw = Math.max(1.4, (trackW * it.value) / maxV);
      setFill(bar || C.gold); doc.roundedRect(trackX, yy, bw, 4.6, 1, 1, 'F');
      doc.setFont('helvetica', 'bold'); setText(C.goldHi);
      doc.text(String(it.value), trackX + bw + 2, yy + 3.6);
    });
    return y + items.length * rowH;
  };

  // ── Página 2 · Tablero (oscuro) ───────────────────────────────────────────
  doc.addPage('a4', 'landscape');
  setFill(C.obsidian); doc.rect(0, 0, W, H, 'F');

  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); setText(C.goldLite);
  doc.text('El evento en números', M, 22);
  doc.setDrawColor(C.gold[0], C.gold[1], C.gold[2]); doc.setLineWidth(0.4);
  doc.line(M, 26, W - M, 26);

  // Tiles de números grandes
  const tiles = [
    { n: String(a.personas), l: 'Personas reservadas' },
    { n: String(a.reservas), l: 'Reservas (grupos)' },
    { n: String(a.personasIngreso), l: 'Personas que ingresaron' },
    { n: `${a.asistenciaPct}%`, l: 'Asistencia' },
  ];
  const gap = 6;
  const tileW = (W - 2 * M - gap * (tiles.length - 1)) / tiles.length;
  const tileY = 32;
  const tileH = 30;
  tiles.forEach((t, i) => {
    const x = M + i * (tileW + gap);
    setFill(C.panel); doc.roundedRect(x, tileY, tileW, tileH, 2.5, 2.5, 'F');
    setDraw(C.gold); doc.setLineWidth(0.3); doc.roundedRect(x, tileY, tileW, tileH, 2.5, 2.5, 'S');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(23); setText(C.cream);
    doc.text(t.n, x + tileW / 2, tileY + 15, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); setText(C.muted);
    doc.text(t.l, x + tileW / 2, tileY + 23, { align: 'center' });
  });

  // Dos columnas de gráficos: ¿cómo se enteraron? | de qué iglesia
  const colW = (W - 2 * M - 14) / 2;
  const chartsY = 76;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); setText(C.goldLite);
  doc.text('¿Cómo se enteraron?', M, chartsY);
  doc.text('¿De qué iglesia vinieron?', M + colW + 14, chartsY);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); setText(C.muted);
  doc.text('por personas', M, chartsY + 4.5);
  doc.text('por personas · agrupado (texto libre)', M + colW + 14, chartsY + 4.5);

  const comoMax = Math.max(1, ...a.como.map((i) => i.value), ...a.iglesias.map((i) => i.value));
  drawBars(M, chartsY + 9, colW, a.como.slice(0, 8), { max: comoMax, bar: C.gold, labelW: 40 });
  drawBars(M + colW + 14, chartsY + 9, colW, a.iglesias.slice(0, 8), { max: comoMax, bar: C.goldLite, labelW: 46 });

  // Barra de asistencia (ancho completo, abajo)
  const asY = 168;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); setText(C.goldLite);
  doc.text('Asistencia', M, asY);
  const barY = asY + 5;
  const barH = 9;
  const fullW = W - 2 * M;
  setFill(C.track); doc.roundedRect(M, barY, fullW, barH, 2, 2, 'F');
  const inW = a.personasIngreso > 0 ? Math.max(2, (fullW * a.personasIngreso) / a.personas) : 0;
  setFill(C.green); doc.roundedRect(M, barY, inW, barH, 2, 2, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); setText(C.cream);
  doc.text(`Ingresaron ${a.personasIngreso}`, M + 3, barY + barH + 7);
  setText(C.muted);
  doc.text(`No vinieron ${a.noVinieron}`, W - M - 3, barY + barH + 7, { align: 'right' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); setText(C.goldHi);
  doc.text(`${a.asistenciaPct}% de las ${a.personas} personas reservadas vinieron al evento`, W / 2, barY + barH + 7, { align: 'center' });

  // ── Páginas 3+ · Listado completo (claro) ─────────────────────────────────
  const peopleRows = flattenPeople(
    [...(regs || [])]
      .filter((r) => r && r.status !== 'cancelled')
      .sort((x, y) => new Date(x.created_at) - new Date(y.created_at)),
    guestsByReg,
  );

  // Columnas de la tabla (landscape, borde izq 10 → der 287)
  const COLS = [
    { k: 'idx', t: '#', x: 10, w: 9, align: 'left' },
    { k: 'nombre', t: 'Nombre', x: 19, w: 50 },
    { k: 'tipo', t: 'Tipo', x: 69, w: 24 },
    { k: 'code', t: 'Código', x: 93, w: 16 },
    { k: 'email', t: 'Email', x: 109, w: 64 },
    { k: 'celular', t: 'Celular', x: 173, w: 28 },
    { k: 'iglesia', t: 'Iglesia', x: 201, w: 36 },
    { k: 'como', t: 'Cómo se enteró', x: 237, w: 30 },
    { k: 'ingreso', t: 'Ingreso', x: 267, w: 20 },
  ];
  const rowH = 6.6;
  const topY = 26;
  const bottomY = H - 12;
  let page = 0;

  const newListPage = () => {
    doc.addPage('a4', 'landscape');
    page += 1;
    setFill(C.inkBg); doc.rect(0, 0, W, H, 'F');
    // Encabezado de página
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); setText(C.ink);
    doc.text(`Listado de personas (${peopleRows.length})`, 10, 15);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); setText(C.inkMuted);
    doc.text('Titulares y acompañantes · The Chosen T6', 10, 20);
    // Franja de columnas
    setFill(C.gold); doc.rect(10, topY - 5, W - 20, 6.5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); setText(C.ink);
    COLS.forEach((c) => doc.text(c.t, c.x, topY - 0.6));
    return topY + 7;
  };

  let y = newListPage();
  peopleRows.forEach((p, i) => {
    if (y + rowH > bottomY) {
      // pie de página
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); setText(C.inkMuted);
      doc.text(`The Chosen T6 · Reporte · pág. ${page}`, W / 2, H - 6, { align: 'center' });
      y = newListPage();
    }
    const rowTop = y - 4.2;
    if (p.titular) { setFill([248, 243, 229]); doc.rect(10, rowTop, W - 20, rowH, 'F'); }
    else if (i % 2 === 1) { setFill(C.rowAlt); doc.rect(10, rowTop, W - 20, rowH, 'F'); }

    doc.setFontSize(7.6);
    const vals = {
      idx: String(i + 1),
      nombre: p.nombre,
      tipo: p.tipo,
      code: p.code,
      email: p.email,
      celular: p.celular,
      iglesia: p.iglesia,
      como: p.como,
      ingreso: p.ingresoBool ? 'Sí' : (p.titular ? '—' : ''),
    };
    COLS.forEach((c) => {
      if (c.k === 'nombre') { doc.setFont('helvetica', p.titular ? 'bold' : 'normal'); setText(p.titular ? C.ink : C.inkMuted); }
      else if (c.k === 'ingreso') { doc.setFont('helvetica', 'bold'); setText(p.ingresoBool ? C.green : C.inkMuted); }
      else { doc.setFont('helvetica', 'normal'); setText(p.titular ? C.ink : C.inkMuted); }
      const text = clip(vals[c.k], c.w - 2);
      doc.text(text, c.x, y);
    });
    y += rowH;
  });
  // pie de la última página
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); setText(C.inkMuted);
  doc.text(`The Chosen T6 · Reporte · pág. ${page}`, W / 2, H - 6, { align: 'center' });

  return doc.output('blob');
}
