import React, { useRef, useState } from 'react';
import { Play, ArrowRight } from 'lucide-react';
import {
  TUTORIAL_VIDEO_URL,
  TUTORIAL_POSTER_URL,
  TUTORIAL_COPY,
} from '../lib/tutorial';

// Mini-página PÚBLICA del video institucional. Isla aislada (early-return de App,
// como /thechosen): no bootea la app autenticada, no usa stores, es el destino
// del botón del correo y un link compartible. On-demand: preload="none" + poster.
export function Tutorial() {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  const startPlay = () => {
    const v = videoRef.current;
    if (!v) return;
    v.play().then(() => setPlaying(true)).catch(() => setPlaying(true));
  };

  return (
    <div
      className="min-h-screen bg-black text-white flex flex-col items-center"
      style={{
        paddingTop: 'calc(2rem + env(safe-area-inset-top, 0px))',
        paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))',
        backgroundImage:
          'radial-gradient(60% 40% at 50% 0%, rgba(212,175,55,0.14), transparent 70%)',
      }}
    >
      <div className="w-full max-w-md px-6 flex flex-col items-center text-center">
        {/* Marca */}
        <img
          src="/adorapp-logo.png"
          alt="AdorAPP"
          className="h-14 w-auto mb-2"
          style={{ mixBlendMode: 'lighten' }}
        />
        <p className="text-xs uppercase tracking-[0.2em] text-gold-500/80 mb-6">
          La plataforma de Adoración CAF
        </p>

        {/* Copy */}
        <h1 className="text-2xl sm:text-3xl font-semibold text-gold-gradient leading-tight text-balance">
          {TUTORIAL_COPY.title}
        </h1>
        <p className="text-sm text-gray-300 mt-3 leading-relaxed">
          {TUTORIAL_COPY.body}
        </p>

        {/* Marco de celular con el video (9:16, encaja exacto) */}
        <div className="relative w-full max-w-[300px] aspect-[9/16] mt-7 rounded-[2.2rem] border-[7px] border-neutral-800 bg-black overflow-hidden shadow-2xl ring-1 ring-gold-500/30">
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover bg-black"
            poster={TUTORIAL_POSTER_URL}
            preload="none"
            playsInline
            controls={playing}
            onPlay={() => setPlaying(true)}
          >
            <source src={TUTORIAL_VIDEO_URL} type="video/mp4" />
          </video>
          {!playing && (
            <button
              type="button"
              onClick={startPlay}
              className="absolute inset-0 grid place-items-center bg-black/25 hover:bg-black/10 transition-colors"
              aria-label="Reproducir el video"
            >
              <span className="w-[72px] h-[72px] rounded-full bg-gold-gradient grid place-items-center shadow-lg">
                <Play size={30} className="text-black translate-x-0.5" fill="currentColor" />
              </span>
            </button>
          )}
        </div>

        {/* Entrada a la app */}
        <a
          href="/"
          className="group mt-8 inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gold-200 transition-colors"
        >
          Entrar a AdorAPP
          <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
        </a>
      </div>
    </div>
  );
}

export default Tutorial;
