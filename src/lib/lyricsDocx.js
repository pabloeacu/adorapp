// Exporta las letras de un orden a un documento de Word (.docx): cada canción con su
// título y sus secciones (con la etiqueta de cada sección), SIN acordes — pensado para
// que Multimedia lo copie/pegue en las diapositivas o su software de letras.
// La librería `docx` se carga on-demand (lazy import) para no engordar el bundle inicial.

const parseLocalDate = (d) => new Date(`${String(d).slice(0, 10)}T00:00:00`);

function fileNameFor(order, meetingLabel) {
  const d = order?.date ? parseLocalDate(order.date) : new Date();
  const stamp = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const base = `Letras - ${(meetingLabel || 'Orden').replace(/[\\/:*?"<>|]/g, '')} ${stamp}`;
  return `${base}.docx`;
}

export async function downloadOrderLyricsDocx(order, getSongById, meetingLabel) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');
  const songRefs = Array.isArray(order?.songs) ? order.songs : [];

  const children = [
    new Paragraph({ text: `Letras — ${meetingLabel || 'Orden'}`, heading: HeadingLevel.TITLE }),
  ];

  let n = 0;
  songRefs.forEach((ref) => {
    const song = getSongById?.(ref.songId);
    if (!song) return;
    n += 1;
    children.push(new Paragraph({
      text: `${n}. ${song.title || 'Canción'}`,
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 280, after: 80 },
    }));

    const structure = Array.isArray(song.structure) ? song.structure : [];
    if (!structure.length) {
      children.push(new Paragraph({ children: [new TextRun({ text: '(Sin letra cargada)', italics: true, color: '888888' })] }));
      return;
    }

    structure.forEach((sec) => {
      if (sec?.label) {
        children.push(new Paragraph({
          children: [new TextRun({ text: String(sec.label), bold: true })],
          spacing: { before: 140, after: 20 },
        }));
      }
      const content = String(sec?.content || '').replace(/\r/g, '');
      content.split('\n').forEach((line) => {
        children.push(new Paragraph({ children: [new TextRun(line)] }));
      });
    });
  });

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileNameFor(order, meetingLabel);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
