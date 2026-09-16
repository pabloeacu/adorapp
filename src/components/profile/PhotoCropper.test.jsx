import React, { createRef } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PhotoCropper } from './PhotoCropper';

// Imagen 1x1 transparente (basta para montar; el recorte a canvas se prueba en
// vivo en Chromium — jsdom no tiene canvas real).
const PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('PhotoCropper', () => {
  it('monta con la vista previa, dos sliders y controles', () => {
    render(<PhotoCropper previewUrl={PX} />);
    const img = screen.getByAltText('Vista previa');
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe(PX);
    // La imagen se centra con translate(-50%,-50%) ANTES del zoom/rotación/pan:
    // es el pipeline canónico que el guardado reproduce (landmine #2). Si esto
    // cambia, el recorte deja de coincidir con la vista previa.
    expect(img.style.transform.startsWith('translate(-50%, -50%)')).toBe(true);
    expect(document.querySelectorAll('input[type="range"]').length).toBe(2);
    expect(screen.getByText('Restablecer')).toBeTruthy();
  });

  it('expone getCroppedBlob y resetTransform por ref', () => {
    const ref = createRef();
    render(<PhotoCropper ref={ref} previewUrl={PX} />);
    expect(typeof ref.current.getCroppedBlob).toBe('function');
    expect(typeof ref.current.resetTransform).toBe('function');
  });

  it('sin previewUrl no renderiza la imagen pero sí los controles', () => {
    render(<PhotoCropper previewUrl={null} />);
    expect(screen.queryByAltText('Vista previa')).toBeNull();
    expect(document.querySelectorAll('input[type="range"]').length).toBe(2);
  });

  it('getCroppedBlob devuelve null si no hay previewUrl', async () => {
    const ref = createRef();
    render(<PhotoCropper ref={ref} previewUrl={null} />);
    await expect(ref.current.getCroppedBlob()).resolves.toBeNull();
  });
});
