import React, { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { Modal } from './ui/Modal';
import {
  TUTORIAL_VIDEO_URL,
  TUTORIAL_POSTER_URL,
  TUTORIAL_COPY,
  hasSeenTutorialLocal,
  markTutorialSeenLocal,
  fetchTutorialSeen,
  recordTutorialSeen,
} from '../lib/tutorial';
import { claimStartupOverlay } from '../lib/startupOverlays';

// Un solo auto-show por carga (aunque el member cambie o re-renderice) y
// anti-encimado con el asistente de bienvenida (mismo patrón que landmine #107):
// a quien arranca la sesión SIN onboarding no le mostramos el tutorial en ESTA
// sesión (lo verá en el próximo ingreso; no se sella nada, no se pierde).
let autoShownThisSession = false;
const ONBOARDING_THIS_SESSION = new Set();

/**
 * Reproductor del video institucional + pop-up de "única vez".
 * - La claqueta (Header / MobileNav) despacha el evento global `openTutorial`
 *   → abre en modo simple (ver nada más, no descarta el de única vez).
 * - Auto-show de única vez por PERSONA (tabla announcement_dismissals), con
 *   fast-path local para no parpadear. Al cerrarlo, queda marcado "visto".
 * - El video es on-demand: preload="none" + poster → no baja un byte hasta el play.
 */
export const TutorialVideoModal = ({ member }) => {
  const [open, setOpen] = useState(false);
  const [announce, setAnnounce] = useState(false); // apertura de "única vez"
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef(null);

  // Apertura manual desde la claqueta (igual que openCommandPalette).
  useEffect(() => {
    const openPlain = () => {
      setAnnounce(false);
      setPlaying(false);
      setOpen(true);
    };
    window.addEventListener('openTutorial', openPlain);
    return () => window.removeEventListener('openTutorial', openPlain);
  }, []);

  // Auto-show de ÚNICA VEZ por persona.
  useEffect(() => {
    if (!member?.id) return;
    if (member.onboarded === false) {
      ONBOARDING_THIS_SESSION.add(member.id);
      return;
    }
    if (ONBOARDING_THIS_SESSION.has(member.id)) return;
    if (autoShownThisSession) return;
    if (hasSeenTutorialLocal()) return;
    autoShownThisSession = true; // una sola evaluación por carga
    // Turnero compartido con el recordatorio de instalar (EngagementNudge):
    // reclamamos SÍNCRONO al montar para tener prioridad (el recordatorio decide
    // recién tras un timer de 500ms). Si otro aviso ya tomó el turno, cedemos.
    if (!claimStartupOverlay()) return;

    let cancelled = false;
    (async () => {
      const seen = await fetchTutorialSeen();
      if (cancelled) return;
      if (seen) {
        markTutorialSeenLocal(); // ya lo vio en otro dispositivo → no reaparece acá
        return;
      }
      setAnnounce(true);
      setPlaying(false);
      setOpen(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [member?.id, member?.onboarded]);

  const handleClose = () => {
    try {
      videoRef.current?.pause();
    } catch {
      /* noop */
    }
    setOpen(false);
    setPlaying(false);
    // Solo el pop-up de única vez marca "visto" al cerrarse; abrir desde la
    // claqueta para rever NO descarta nada.
    if (announce) recordTutorialSeen();
  };

  const startPlay = () => {
    const v = videoRef.current;
    if (!v) return;
    // Mostramos los controles nativos pase lo que pase (fallback para darle play).
    setPlaying(true);
    // iOS WebKit puede tirar InvalidStateError de forma SÍNCRONA si el media no
    // está listo → el try atrapa el throw sincrónico; el .catch, el rechazo async.
    // Nunca debe propagar un error no capturado (se registraría como error serio).
    let p = null;
    try {
      p = v.play();
    } catch {
      /* noop: controles nativos quedan disponibles */
    }
    if (p && typeof p.catch === 'function') p.catch(() => {});
  };

  return (
    <Modal isOpen={open} onClose={handleClose} title="Tutorial institucional" size="md">
      <div className="flex flex-col items-center gap-4 py-1">
        {announce && (
          <div className="text-center max-w-sm">
            <h3 className="text-xl font-semibold text-gold-gradient">
              {TUTORIAL_COPY.title}
            </h3>
            <p className="text-sm text-gray-300 mt-2 leading-relaxed">
              {TUTORIAL_COPY.body}
            </p>
          </div>
        )}

        {/* Marco de celular: el video es 9:16, encaja exacto (sin recorte). */}
        <div className="relative w-full max-w-[300px] max-h-[58dvh] aspect-[9/16] rounded-[2rem] border-[6px] border-neutral-800 bg-black overflow-hidden shadow-2xl ring-1 ring-gold-500/30">
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
              className="absolute inset-0 grid place-items-center bg-black/30 hover:bg-black/15 transition-colors"
              aria-label="Reproducir el video"
            >
              <span className="w-16 h-16 rounded-full bg-gold-gradient grid place-items-center shadow-lg">
                <Play size={28} className="text-black translate-x-0.5" fill="currentColor" />
              </span>
            </button>
          )}
        </div>

        {announce && (
          <p className="text-xs text-gray-500 text-center">{TUTORIAL_COPY.foot}</p>
        )}
      </div>
    </Modal>
  );
};
