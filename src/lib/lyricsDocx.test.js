import { describe, it, expect, beforeEach, vi } from 'vitest';

// Export de letras a Word (.docx) para Multimedia. Verificamos la ESTRUCTURA que
// se arma (título, numeración por canción SALTEANDO las que no están, etiquetas
// de sección, líneas de letra, fallback "sin letra") y el nombre de archivo —
// mockeando la librería `docx` (registra los Paragraph que se crean) y las
// piezas de descarga del DOM.

// Registro de los Paragraph creados (sus opts), para inspeccionar la estructura.
const paras = vi.hoisted(() => ({ list: [] }));
vi.mock('docx', () => {
  // El módulo hace `new Paragraph(...)`, así que deben ser funciones new-ables
  // (una arrow / vi.fn(arrow) NO es constructor). Registramos vía el array `paras`.
  function Paragraph(opts) { paras.list.push(opts); return { __p: opts }; }
  function TextRun(opts) { return typeof opts === 'string' ? { text: opts } : opts; }
  function Document(opts) { return { __doc: opts }; }
  const Packer = { toBlob: vi.fn(async () => ({ size: 1, type: 'application/vnd' })) };
  const HeadingLevel = { TITLE: 'Title', HEADING_1: 'Heading1' };
  return { Document, Packer, Paragraph, TextRun, HeadingLevel };
});

import { downloadOrderLyricsDocx } from './lyricsDocx';

// Texto plano de un Paragraph (viene como `text` directo o como children[TextRun]).
const textOf = (p) => p.text ?? (Array.isArray(p.children) ? p.children.map((c) => c.text ?? '').join('') : '');
const texts = () => paras.list.map(textOf);

let capturedAnchor;

beforeEach(() => {
  paras.list.length = 0;
  capturedAnchor = null;
  // Stubs de descarga que jsdom no implementa.
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:fake');
  globalThis.URL.revokeObjectURL = vi.fn();
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag) => {
    const el = realCreate(tag);
    if (tag === 'a') { el.click = vi.fn(); capturedAnchor = el; }
    return el;
  });
});

const songs = {
  s1: { title: 'Océanos', structure: [
    { label: 'Verso 1', content: 'Me llamas\r\nsobre las aguas' },
    { label: 'Coro', content: 'Y llamaré tu nombre' },
  ] },
  s2: { title: 'Sin Letra', structure: [] },
};
const getSongById = (id) => songs[id];
const order = { date: '2026-09-20', songs: [{ songId: 's1' }, { songId: 'no-existe' }, { songId: 's2' }] };

describe('downloadOrderLyricsDocx', () => {
  it('arma título + numera SALTEANDO las canciones no encontradas', async () => {
    await downloadOrderLyricsDocx(order, getSongById, 'Culto General');
    const t = texts();
    expect(t[0]).toBe('Letras — Culto General'); // título
    expect(t).toContain('1. Océanos');
    // la 2da canción encontrada es "2." aunque en el medio hubo una no-encontrada:
    expect(t).toContain('2. Sin Letra');
    // la no-encontrada no aparece:
    expect(t.some((x) => x.includes('no-existe'))).toBe(false);
  });

  it('incluye etiquetas de sección (en negrita) y las líneas de letra (parte por saltos, sin \\r)', async () => {
    await downloadOrderLyricsDocx(order, getSongById, 'Culto General');
    const t = texts();
    expect(t).toContain('Verso 1');
    expect(t).toContain('Coro');
    expect(t).toContain('Me llamas');
    expect(t).toContain('sobre las aguas'); // la línea 2 se separó por \n
    // la etiqueta de sección va en un TextRun bold:
    const labelPara = paras.list.find((p) => Array.isArray(p.children) && p.children[0]?.text === 'Verso 1');
    expect(labelPara.children[0].bold).toBe(true);
  });

  it('canción sin estructura → muestra "(Sin letra cargada)"', async () => {
    await downloadOrderLyricsDocx(order, getSongById, 'Culto General');
    expect(texts()).toContain('(Sin letra cargada)');
  });

  it('el nombre de archivo lleva la etiqueta saneada + DD-MM y termina en .docx', async () => {
    await downloadOrderLyricsDocx(order, getSongById, 'Culto/General:*');
    expect(capturedAnchor.download).toBe('Letras - CultoGeneral 20-09.docx'); // caracteres ilegales removidos
  });

  it('sin canciones válidas: solo el título (no rompe)', async () => {
    await downloadOrderLyricsDocx({ date: '2026-01-05', songs: [] }, getSongById, 'Vacío');
    expect(texts()).toEqual(['Letras — Vacío']);
    expect(capturedAnchor.download).toBe('Letras - Vacío 05-01.docx');
  });
});
