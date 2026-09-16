import { forwardRef, useImperativeHandle, useRef, useState, useEffect, useCallback } from 'react';
import { ZoomOut, RotateCcw, Move } from 'lucide-react';

// Recortador de foto de perfil COMPARTIDO por el Header (escritorio) y el
// MobileNav (celular). Antes cada uno tenía su propia copia (~40% duplicado) y,
// peor, matemática DISTINTA: el móvil se corrigió en el PR #30 midiendo el
// tamaño real renderizado (`offsetWidth/Height`), pero el de escritorio seguía
// adivinando el tamaño con constantes → el recorte guardado NO coincidía con la
// vista previa para imágenes anchas (backlog "aplicar el mismo fix en la compu").
//
// Este componente concentra: el estado del transform (zoom/rotación/pan), el
// arrastre por Pointer Events (mouse/touch/pen), los controles y — lo importante
// — el pipeline de recorte a canvas, que reproduce EXACTAMENTE lo que se ve en la
// vista previa (mide el `<img>` real, nunca constantes). Cada pantalla lo mete en
// su propio "chrome" (Modal en escritorio, overlay full-screen en celular) y hace
// su propia subida/persistencia, que difieren por diseño.
//
// Landmines respetados:
//   #1  el guardado dibuja desde `previewUrl`, NUNCA desde un <input file> (que
//       se desmonta al abrir el recortador).
//   #2  el guardado mide `cropImgRef.current.offsetWidth/Height` (tamaño real,
//       no afectado por el transform) y replica el MISMO pipeline del preview.
//   #21 la superficie de arrastre lleva `touch-action: none` (es un gesto de pan
//       propio, no un sheet scrolleable).
//
// El componente expone `getCroppedBlob()` por ref para que el botón "Guardar"
// (que vive en el chrome de cada pantalla) obtenga el Blob y luego lo suba.

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export const PhotoCropper = forwardRef(function PhotoCropper(
  {
    previewUrl,
    // Geometría por pantalla (se conserva la de cada superficie para no cambiar
    // el encuadre por defecto): alto del escenario, alto máx. de la imagen y
    // diámetro del círculo guía, en px de preview. `canvasSize` es la salida.
    stageHeight = 300,
    imgMaxHeight = 280,
    circleSize = 256,
    canvasSize = 400,
    // Formato de salida (se conserva el de cada superficie: escritorio jpeg,
    // celular png).
    outputType = 'image/jpeg',
    outputQuality = 0.9,
    // Estilos por pantalla (defaults = escritorio, para paridad exacta con el
    // recortador previo del Header; MobileNav pasa los suyos).
    accentClass = 'accent-gold-500',
    radiusClass = 'rounded-xl',
    borderOpacity = 0.6,
    maskOpacity = 0.5,
  },
  ref
) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const cropImgRef = useRef(null);

  // Nueva imagen → transform limpio (antes lo reseteaba cada pantalla en su
  // handleFileSelect; ahora es responsabilidad del componente).
  useEffect(() => {
    setZoom(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
    setIsDragging(false);
  }, [previewUrl]);

  const handlePointerDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handlePointerMove = useCallback(
    (e) => {
      if (isDragging) {
        setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
      }
    },
    [isDragging, dragStart]
  );

  const handlePointerUp = useCallback(() => setIsDragging(false), []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
      document.addEventListener('pointercancel', handlePointerUp);
      return () => {
        document.removeEventListener('pointermove', handlePointerMove);
        document.removeEventListener('pointerup', handlePointerUp);
        document.removeEventListener('pointercancel', handlePointerUp);
      };
    }
  }, [isDragging, handlePointerMove, handlePointerUp]);

  const resetTransform = useCallback(() => {
    setZoom(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  }, []);

  // Produce el Blob del recorte circular reproduciendo EXACTO lo que ve el
  // usuario. Lee el tamaño renderizado real del <img> (landmine #2).
  const getCroppedBlob = useCallback(async () => {
    if (!previewUrl) return null;

    const img = await loadImage(previewUrl);

    const canvas = document.createElement('canvas');
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const ctx = canvas.getContext('2d');

    // Tamaño real renderizado del preview (object-fit: contain, sin transform).
    const imgEl = cropImgRef.current;
    let baseW, baseH;
    if (imgEl && imgEl.offsetWidth) {
      baseW = imgEl.offsetWidth;
      baseH = imgEl.offsetHeight;
    } else {
      // Fallback (no debería pasar con el recortador abierto): reconstruye el
      // object-fit contain contra la MISMA caja que limita el preview
      // (ancho ≤ canvasSize, alto ≤ imgMaxHeight), NO contra el círculo — así el
      // recorte de emergencia también coincide con lo que se vería.
      const scale = Math.min(canvasSize / img.width, imgMaxHeight / img.height);
      baseW = img.width * scale;
      baseH = img.height * scale;
    }

    const k = canvasSize / circleSize; // px de preview → px de canvas

    // Recorte circular + mismo pipeline que el CSS del preview:
    // center → scale(k) → scale(zoom) → rotate → translate(px/zoom, py/zoom),
    // dibujando la imagen centrada.
    ctx.save();
    ctx.beginPath();
    ctx.arc(canvasSize / 2, canvasSize / 2, canvasSize / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(canvasSize / 2, canvasSize / 2);
    ctx.scale(k, k);
    ctx.scale(zoom, zoom);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(position.x / zoom, position.y / zoom);
    ctx.drawImage(img, -baseW / 2, -baseH / 2, baseW, baseH);
    ctx.restore();

    return new Promise((resolve) => {
      canvas.toBlob(resolve, outputType, outputQuality);
    });
  }, [previewUrl, canvasSize, circleSize, imgMaxHeight, zoom, rotation, position, outputType, outputQuality]);

  useImperativeHandle(ref, () => ({ getCroppedBlob, resetTransform }), [getCroppedBlob, resetTransform]);

  return (
    <div className="space-y-4">
      {/* Vista previa: imagen completa + círculo guía */}
      <div
        className="relative flex items-center justify-center"
        style={{ height: `${stageHeight}px`, width: '100%', maxWidth: `${canvasSize}px`, marginInline: 'auto' }}
      >
        <div className={`absolute inset-0 ${radiusClass} bg-neutral-900`} />

        {/* Superficie de arrastre — llena el escenario para que el centrado
            absoluto de la imagen quede centrado en el escenario. */}
        <div
          className="relative w-full h-full cursor-move"
          onPointerDown={handlePointerDown}
          style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
        >
          {previewUrl && (
            <img
              ref={cropImgRef}
              src={previewUrl}
              alt="Vista previa"
              className="absolute select-none"
              draggable={false}
              style={{
                left: '50%',
                top: '50%',
                maxHeight: `${imgMaxHeight}px`,
                maxWidth: '100%',
                objectFit: 'contain',
                transformOrigin: 'center center',
                transform: `translate(-50%, -50%) scale(${zoom}) rotate(${rotation}deg) translate(${position.x / zoom}px, ${position.y / zoom}px)`,
                transition: isDragging ? 'none' : 'transform 0.2s ease',
              }}
            />
          )}
        </div>

        {/* Círculo guía (semitransparente, oscurece afuera) */}
        <div
          className="absolute pointer-events-none"
          style={{
            width: `${circleSize}px`,
            height: `${circleSize}px`,
            borderRadius: '50%',
            border: `3px solid rgba(255, 255, 255, ${borderOpacity})`,
            boxShadow: `0 0 0 9999px rgba(0, 0, 0, ${maskOpacity})`,
            zIndex: 10,
          }}
        />
        <div className="absolute pointer-events-none" style={{ width: `${circleSize}px`, height: `${circleSize}px`, zIndex: 11 }}>
          <div className="absolute -top-[3px] -left-[3px] w-6 h-6 border-t-4 border-l-4 border-white rounded-tl-full" />
          <div className="absolute -top-[3px] -right-[3px] w-6 h-6 border-t-4 border-r-4 border-white rounded-tr-full" />
          <div className="absolute -bottom-[3px] -left-[3px] w-6 h-6 border-b-4 border-l-4 border-white rounded-bl-full" />
          <div className="absolute -bottom-[3px] -right-[3px] w-6 h-6 border-b-4 border-r-4 border-white rounded-br-full" />
        </div>

        {isDragging && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 z-20">
            <Move size={12} />
            Soltá para posicionar
          </div>
        )}
      </div>

      {/* Controles */}
      <div className={`space-y-4 p-4 bg-neutral-800/50 ${radiusClass}`}>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-neutral-400">
              <ZoomOut size={16} />
              <span className="text-xs">Zoom</span>
            </div>
            <span className="text-xs text-white font-medium">{Math.round(zoom * 100)}%</span>
          </div>
          <input
            type="range"
            min="0.5"
            max="2.5"
            step="0.05"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className={`w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer ${accentClass}`}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-neutral-400">
              <RotateCcw size={16} />
              <span className="text-xs">Rotación</span>
            </div>
            <span className="text-xs text-white font-medium">{rotation}°</span>
          </div>
          <input
            type="range"
            min="-180"
            max="180"
            step="5"
            value={rotation}
            onChange={(e) => setRotation(parseInt(e.target.value))}
            className={`w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer ${accentClass}`}
          />
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={resetTransform}
            className="flex-1 px-3 py-2 bg-neutral-700 hover:bg-neutral-600 rounded-lg text-sm text-neutral-300 transition-colors flex items-center justify-center gap-1.5"
          >
            <RotateCcw size={14} />
            Restablecer
          </button>
          <button
            onClick={() => setRotation((prev) => prev + 90)}
            className="flex-1 px-3 py-2 bg-neutral-700 hover:bg-neutral-600 rounded-lg text-sm text-neutral-300 transition-colors"
          >
            +90°
          </button>
          <button
            onClick={() => setRotation((prev) => prev - 90)}
            className="flex-1 px-3 py-2 bg-neutral-700 hover:bg-neutral-600 rounded-lg text-sm text-neutral-300 transition-colors"
          >
            -90°
          </button>
        </div>
      </div>

      <p className="text-xs text-neutral-500 text-center">
        Arrastrá la imagen para posicionarla dentro del círculo. Ajustá el zoom y rotación.
      </p>
    </div>
  );
});
