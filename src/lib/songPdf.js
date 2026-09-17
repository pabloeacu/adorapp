// Generador del PDF de una canción del Repertorio (extraído de Repertorio.jsx sin
// cambios de comportamiento). Carga jsPDF on-demand (~140 KB) dentro de la función.
// `ctx` trae `categoryConfig` (la tabla de categorías que vive en Repertorio.jsx,
// usada también por su JSX) para no duplicarla. `transposeSongStructure` se importa
// directo del motor puro (mismo símbolo que re-exporta el store). Una regresión acá
// produce cifrados mal transportados en el PDF (motor cubierto por transpose.test.js).
import { transposeSongStructure } from './transpose';

export const generateSongPdf = async (song, key, ctx) => {
  const { categoryConfig } = ctx;
    const { jsPDF } = await import('jspdf');
    const originalKey = song.originalKey || song.key;
    const transposedStructure = key !== originalKey
      ? transposeSongStructure(song.structure || [], originalKey, key)
      : (song.structure || []);

    // Use white background for better printing
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Colors - optimized for white background
    const purple = [128, 0, 128];
    const darkPurple = [75, 0, 130];
    const black = [0, 0, 0];
    const darkGray = [64, 64, 64];
    const gray = [128, 128, 128];

    let y = 20;

    // Header - Title
    doc.setFontSize(24);
    doc.setTextColor(...black);
    doc.setFont('helvetica', 'bold');
    doc.text(song.title, 20, y);
    y += 8;

    // Artist
    doc.setFontSize(12);
    doc.setTextColor(...darkGray);
    doc.setFont('helvetica', 'normal');
    doc.text(song.artist || 'Artista desconocido', 20, y);
    y += 8;

    // Meta info
    doc.setFontSize(10);
    doc.setTextColor(...darkGray);

    const metaParts = [`Tono: ${key}`];
    if (key !== originalKey) {
      metaParts.push(`Original: ${originalKey}`);
    }
    if (song.compass) {
      metaParts.push(`Compás: ${song.compass}`);
    }
    if (song.bpm) {
      metaParts.push(`BPM: ${song.bpm}`);
    }
    const categories = song.categories || (song.category ? [song.category] : []);
    const catLabel = categories[0] ? categoryConfig[categories[0]]?.label : 'Sin categoría';
    metaParts.push(catLabel);

    doc.text(metaParts.join('  |  '), 20, y);
    y += 10;

    // Separator line
    doc.setDrawColor(...purple);
    doc.setLineWidth(0.5);
    doc.line(20, y, 190, y);
    y += 10;

    // Sections
    transposedStructure.forEach((section) => {
      // Check if we need a new page
      if (y > 260) {
        doc.addPage();
        y = 20;
      }

      // Section label
      doc.setFontSize(12);
      doc.setTextColor(...purple);
      doc.setFont('helvetica', 'bold');
      doc.text(section.label, 20, y);
      y += 7;

      // Chords
      if (section.chords) {
        doc.setFontSize(14);
        doc.setTextColor(...darkPurple);
        doc.setFont('courier', 'bold');

        // Split long chords into multiple lines if needed
        const maxWidth = 170;
        const words = section.chords.split(' ');
        let line = '';
        words.forEach((word) => {
          const testLine = line ? `${line} ${word}` : word;
          if (doc.getTextWidth(testLine) > maxWidth) {
            doc.text(line, 20, y);
            y += 6;
            line = word;
          } else {
            line = testLine;
          }
        });
        if (line) {
          doc.text(line, 20, y);
          y += 7;
        }
      }

      // Lyrics
      if (section.content) {
        doc.setFontSize(11);
        doc.setTextColor(...black);
        doc.setFont('helvetica', 'normal');

        // Word wrap lyrics
        const lines = doc.splitTextToSize(section.content, 170);
        lines.forEach((lineText) => {
          if (y > 275) {
            doc.addPage();
            y = 20;
          }
          doc.text(lineText, 20, y);
          y += 5;
        });
      }

      // Empty section (musical intro)
      if (!section.chords && !section.content && section.type === 'intro') {
        doc.setFontSize(10);
        doc.setTextColor(...gray);
        doc.setFont('helvetica', 'italic');
        doc.text('Silencio musical', 20, y);
        y += 5;
      }

      y += 8; // Space between sections
    });

    // Footer
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    y += 5;
    doc.setFontSize(8);
    doc.setTextColor(...gray);
    doc.setFont('helvetica', 'italic');
    doc.text('Generado por AdorAPP - La plataforma de Adoración CAF', 20, y);

    // Generate filename
    const fileName = `${song.title.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]/g, '').replace(/\s+/g, '_')}_${key}.pdf`;

    // Download - use save() directly which triggers browser download
    doc.save(fileName);
  };
