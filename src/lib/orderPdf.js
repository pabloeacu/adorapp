// Generadores de PDF de un orden — extraídos de Ordenes.jsx SIN cambios de
// comportamiento. Funciones puras que reciben el `order` y un `ctx` con los
// getters/helpers del componente (getBandById/getSongById/getMemberById/
// getOrderParticipants/formatDate/getMeetingTypeLabel/parseLocalDate/isPastor).
// jsPDF se carga por import() dinámico adentro (chunk perezoso, no al primer paint).
import { numberOrderSongs } from './orderNumbering';
import { isCustomLineup, lineupSummaryText } from './lineup';
import { transposeSongStructure } from './transpose';

export const generateOrderPdf = async (order, ctx) => {
  const { jsPDF } = await import('jspdf');
  const band = ctx.getBandById(order.bandId);
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  // Colors - optimized for dark background
  const purple = [168, 85, 247];
  const white = [255, 255, 255];
  const lightGray = [200, 200, 200];
  const mediumGray = [153, 153, 153];
  const gold = [212, 175, 55];

  // Helper function to add dark background to a page
  const addDarkBackground = () => {
    doc.setFillColor(26, 26, 26);
    doc.rect(0, 0, 210, 297, 'F');
  };

  // Initial dark background
  addDarkBackground();

  let y = 25;

  // Header - Title
  doc.setFontSize(28);
  doc.setTextColor(...purple);
  doc.setFont('helvetica', 'bold');
  doc.text('Orden de Servicio', 105, y, { align: 'center' });
  y += 12;

  // Date and time
  doc.setFontSize(18);
  doc.setTextColor(...white);
  doc.setFont('helvetica', 'normal');
  doc.text(ctx.formatDate(order.date), 105, y, { align: 'center' });
  y += 8;
  doc.setFontSize(14);
  doc.setTextColor(...lightGray);
  doc.text(order.time, 105, y, { align: 'center' });
  y += 15;

  // Meta info
  doc.setFontSize(12);
  doc.setTextColor(...white);
  doc.text(`${band?.name || 'Banda'}   •   ${ctx.getMeetingTypeLabel(order.meetingType)}   •   ${order.songs.length} canciones`, 105, y, { align: 'center' });
  y += 8;
  // Formación del servicio (solo si el orden la tiene definida)
  if (order.lineup) {
    const participants = ctx.getOrderParticipants(order);
    if (participants.length > 0) {
      const text = `Formación${isCustomLineup(order) ? '' : ' (toda la banda)'}: ${lineupSummaryText(order, participants)}`;
      doc.setFontSize(10);
      doc.setTextColor(...lightGray);
      doc.splitTextToSize(text, 170).forEach((line) => { doc.text(line, 105, y, { align: 'center' }); y += 5; });
    }
  }
  y += 7;

  // Separator line
  doc.setDrawColor(...purple);
  doc.setLineWidth(0.5);
  doc.line(20, y, 190, y);
  y += 15;

  // Table header
  doc.setFontSize(10);
  doc.setTextColor(...mediumGray);
  doc.setFont('helvetica', 'bold');
  doc.text('#', 20, y);
  doc.text('Canción', 35, y);
  doc.text('Tono', 140, y, { align: 'center' });
  doc.text('Director', 165, y);
  y += 8;

  // Table separator
  doc.setDrawColor(60, 60, 60);
  doc.setLineWidth(0.2);
  doc.line(20, y, 190, y);
  y += 5;

  // Songs — numeradas con incisos para las enganchadas (2.a / 2.b).
  const numbered = numberOrderSongs(order.songs);
  order.songs.forEach((songRef, index) => {
    // Check if we need a new page
    if (y > 260) {
      doc.addPage();
      addDarkBackground();
      y = 25;
    }

    const song = ctx.getSongById(songRef.songId);
    const director = ctx.getMemberById(songRef.directorId);
    const key = songRef.key || song?.originalKey || song?.key || 'C';

    // Number (inciso 2.a/2.b para enganchadas)
    doc.setFontSize(12);
    doc.setTextColor(...purple);
    doc.setFont('helvetica', 'bold');
    doc.text(numbered[index].displayNumber, 20, y);

    // Title
    doc.setTextColor(...white);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const titleText = song?.title || 'Sin título';
    doc.text(titleText, 35, y);
    // Marcadores en la misma fila del encabezado: MINISTRACIÓN / ENGANCHADA / cadenita dorada.
    let markerX = 35 + doc.getTextWidth(titleText) + 3;
    if (songRef.ministracion) {
      doc.setFontSize(8); doc.setTextColor(...purple); doc.setFont('helvetica', 'bold');
      doc.text('MINISTRACIÓN', markerX, y);
      markerX += doc.getTextWidth('MINISTRACIÓN') + 3;
    }
    if (numbered[index].isEnganchada) {
      doc.setFontSize(8); doc.setTextColor(...gold); doc.setFont('helvetica', 'bold');
      doc.text('ENGANCHADA', markerX, y);
      markerX += doc.getTextWidth('ENGANCHADA') + 3;
    }
    if (numbered[index].hasLinkedBelow) {
      // Cadenita dorada: dos eslabones (elipses) chiquitos que señalan la enganchada debajo.
      doc.setDrawColor(...gold); doc.setLineWidth(0.4);
      doc.ellipse(markerX + 1.3, y - 1.2, 1.5, 1.0, 'S');
      doc.ellipse(markerX + 3.6, y - 1.2, 1.5, 1.0, 'S');
    }
    // Reset para el artista.
    doc.setTextColor(...white);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    if (song?.artist) {
      doc.setFontSize(9);
      doc.setTextColor(...mediumGray);
      doc.text(song.artist, 35, y + 5);
    }

    // Key badge
    doc.setFontSize(10);
    doc.setTextColor(...purple);
    doc.setFont('helvetica', 'bold');
    doc.text(key, 140, y + (song?.artist ? 3 : 0), { align: 'center' });

    // Director
    doc.setTextColor(...lightGray);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(director?.name || '-', 190, y + (song?.artist ? 3 : 0), { align: 'right' });

    // Move to next row
    y += song?.artist ? 12 : 10;

    // Row separator
    doc.setDrawColor(50, 50, 50);
    doc.setLineWidth(0.1);
    doc.line(20, y - 3, 190, y - 3);
  });

  // Feedback section — SOLO para el pastor (en pantalla ya estaba reservado con ctx.isPastor;
  // el PDF lo filtraba a cualquier rol: auditoría de roles 2026-09-12).
  if (order.feedback && ctx.isPastor) {
    if (y > 230) {
      doc.addPage();
      addDarkBackground();
      y = 25;
    }
    y += 10;
    doc.setFontSize(12);
    doc.setTextColor(245, 158, 11); // Yellow
    doc.setFont('helvetica', 'bold');
    doc.text('Devolución del Pastor', 20, y);
    y += 8;
    doc.setFontSize(11);
    doc.setTextColor(...lightGray);
    doc.setFont('helvetica', 'normal');
    const feedbackLines = doc.splitTextToSize(order.feedback, 170);
    feedbackLines.forEach(line => {
      doc.text(line, 20, y);
      y += 6;
    });
  }

  // Footer
  if (y > 270) {
    doc.addPage();
    addDarkBackground();
    y = 20;
  }
  y += 10;
  doc.setFontSize(9);
  doc.setTextColor(...mediumGray);
  doc.setFont('helvetica', 'italic');
  doc.text('Generado por AdorAPP - La plataforma de Adoración CAF', 105, y, { align: 'center' });

  // Download the PDF
  const dateStr = ctx.parseLocalDate(order.date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '-');
  const fileName = `${band?.name || 'Banda'} - Orden ${dateStr}.pdf`;
  doc.save(fileName);
};

// Print all songs with full content (one song per page with page break)
export const generateSongsPdf = async (order, ctx) => {
  const { jsPDF } = await import('jspdf');
  const band = ctx.getBandById(order.bandId);
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  // Colors - optimized for dark background
  const purple = [168, 85, 247];
  const white = [255, 255, 255];
  const lightGray = [200, 200, 200];
  const mediumGray = [153, 153, 153];
  const purpleLight = [200, 150, 255];
  const gold = [212, 175, 55];

  // Helper function to add dark background to a page
  const addDarkBackground = () => {
    doc.setFillColor(26, 26, 26);
    doc.rect(0, 0, 210, 297, 'F');
  };

  // Process each song
  // Numeración con incisos para las enganchadas (2.a / 2.b).
  const numbered = numberOrderSongs(order.songs);
  order.songs.forEach((songRef, index) => {
    // Add new page for each song (except first)
    if (index > 0) {
      doc.addPage();
    }
    addDarkBackground();

    const song = ctx.getSongById(songRef.songId);
    const director = ctx.getMemberById(songRef.directorId);
    const originalKey = song?.originalKey || song?.key || 'C';
    const key = songRef.key || originalKey;

    // Transpose structure if needed
    let structure = song?.structure || [];
    if (song?.structure && key !== originalKey) {
      structure = transposeSongStructure(song.structure, originalKey, key);
    }

    let y = 20;

    // Song number (large) — inciso 2.a/2.b para enganchadas
    doc.setFontSize(numbered[index].displayNumber.includes('.') ? 36 : 48);
    doc.setTextColor(...purple);
    doc.setFont('helvetica', 'bold');
    doc.text(numbered[index].displayNumber, 20, y + 15);
    // Etiqueta "Enganchada" debajo del número (o "sigue enganchada" si es la madre).
    if (numbered[index].isEnganchada) {
      doc.setFontSize(9); doc.setTextColor(...gold); doc.setFont('helvetica', 'bold');
      doc.text('ENGANCHADA', 20, y + 22);
    } else if (numbered[index].hasLinkedBelow) {
      doc.setFontSize(8); doc.setTextColor(...gold); doc.setFont('helvetica', 'normal');
      doc.text('sigue enganchada', 20, y + 22);
    }

    // Meta info on the right
    doc.setFontSize(10);
    doc.setTextColor(...mediumGray);
    const metaLines = [
      `Orden: ${ctx.formatDate(order.date)}`,
      `Banda: ${band?.name || 'N/A'}`,
      `Director: ${director?.name || '-'}`,
      `Tono: ${key}${key !== originalKey ? ` (Original: ${originalKey})` : ''}`
    ];
    metaLines.forEach((line, i) => {
      doc.text(line, 190, y + 5 + (i * 5), { align: 'right' });
    });

    // Separator
    y = 50;
    doc.setDrawColor(60, 60, 60);
    doc.setLineWidth(0.3);
    doc.line(20, y, 190, y);
    y += 12;

    // Song title
    doc.setFontSize(28);
    doc.setTextColor(...white);
    doc.setFont('helvetica', 'bold');
    doc.text(song?.title || 'Sin título', 20, y);
    y += 10;

    // Artist
    if (song?.artist) {
      doc.setFontSize(14);
      doc.setTextColor(...lightGray);
      doc.setFont('helvetica', 'normal');
      doc.text(song.artist, 20, y);
      y += 10;
    }

    // Add compass and BPM if available
    if (song?.compass || song?.bpm) {
      doc.setFontSize(11);
      doc.setTextColor(...purpleLight);
      const extraInfo = [];
      if (song.compass) extraInfo.push(`Compás: ${song.compass}`);
      if (song.bpm) extraInfo.push(`BPM: ${song.bpm}`);
      doc.text(extraInfo.join('   •   '), 20, y);
      y += 8;
    }

    y += 5;

    // Content background
    doc.setFillColor(31, 31, 31);
    doc.roundedRect(15, y, 180, 200, 5, 5, 'F');

    y += 15;

    // Sections
    structure.forEach((section) => {
      // Section label
      doc.setFontSize(14);
      doc.setTextColor(...purpleLight);
      doc.setFont('helvetica', 'bold');
      doc.text(section.label || 'Sección', 20, y);
      y += 8;

      // Chords
      if (section.chords) {
        doc.setFontSize(18);
        doc.setTextColor(...purple);
        doc.setFont('courier', 'bold');

        // Split long chords into multiple lines
        const maxWidth = 170;
        const words = section.chords.split(' ');
        let line = '';
        words.forEach((word) => {
          const testLine = line ? `${line} ${word}` : word;
          if (doc.getTextWidth(testLine) > maxWidth) {
            doc.text(line, 20, y);
            y += 8;
            line = word;
          } else {
            line = testLine;
          }
        });
        if (line) {
          doc.text(line, 20, y);
          y += 10;
        }
      }

      // Lyrics
      if (section.content) {
        doc.setFontSize(12);
        doc.setTextColor(...white);
        doc.setFont('helvetica', 'normal');

        const lines = doc.splitTextToSize(section.content, 170);
        lines.forEach((lineText) => {
          if (y > 250) {
            // Close current content box and add new page
            doc.addPage();
            addDarkBackground();
            y = 20;
          }
          doc.text(lineText, 20, y);
          y += 6;
        });
        y += 4;
      }

      // Empty section (musical intro)
      if (!section.chords && !section.content && section.type === 'intro') {
        doc.setFontSize(10);
        doc.setTextColor(...mediumGray);
        doc.setFont('helvetica', 'italic');
        doc.text('Silencio musical', 20, y);
        y += 6;
      }

      y += 8;
    });

    if (!structure.length || (structure.length === 1 && !structure[0].chords && !structure[0].content)) {
      doc.setFontSize(11);
      doc.setTextColor(...mediumGray);
      doc.setFont('helvetica', 'italic');
      doc.text('Sin contenido disponible', 20, y);
    }
  });

  // Download the PDF
  const dateStr = ctx.parseLocalDate(order.date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '-');
  const fileName = `${band?.name || 'Banda'} - Orden ${dateStr} - Canciones.pdf`;
  doc.save(fileName);
};
