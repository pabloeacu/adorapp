import React, { useState, useEffect } from 'react';
import { DeviceMobile, BellRinging } from '@phosphor-icons/react';
import { Share, Plus } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { GoldWave } from './ui/GoldWave';
import { isInstalled, getPlatform, canPromptInstall, triggerInstall } from '../lib/installPrompt';
import { notificationPermission, isCurrentlySubscribed, subscribePush, isPushSupported } from '../lib/push';
import {
  decideNudge, copyForNudge, readNudgeState, recordNudgeShown, isMobileDevice,
} from '../lib/engagementNudge';

// Cartel recordatorio (cada 10 días, solo teléfono) que estimula a instalar la app
// y activar notificaciones — de a una consigna por vez (instalar primero), con copy
// rotativo A/B. Toda la lógica de "qué mostrar" vive en src/lib/engagementNudge.js
// (con tests). Acá solo pintamos el cartel y disparamos los flujos que YA existen
// (instalar: installPrompt; notificaciones: push). 100% cliente.

// Una sola aparición por apertura de la app (no en cada cambio de sección).
let SHOWN_THIS_SESSION = false;

export const EngagementNudge = ({ member }) => {
  const [nudge, setNudge] = useState(null); // { type, variant, denied } | null
  const [busy, setBusy] = useState(false);
  const [showSteps, setShowSteps] = useState(false); // instrucciones iPhone / instalar manual
  const [error, setError] = useState(null);

  useEffect(() => {
    const memberId = member?.id;
    if (!memberId) return;
    if (member?.onboarded === false) return; // los nuevos ven el asistente de bienvenida
    if (SHOWN_THIS_SESSION) return;

    let cancelled = false;
    // Aparición amable: medio segundo después de entrar, nunca de golpe.
    const t = setTimeout(async () => {
      try {
        const isMobile = isMobileDevice();
        const installed = isInstalled();
        const supported = isPushSupported();
        const perm = supported ? notificationPermission() : 'granted';
        const subscribed = supported ? await isCurrentlySubscribed() : true;
        const notifEnabled = perm === 'granted' && subscribed;
        const notifDenied = perm === 'denied';
        const { lastShownAt, shownCount } = readNudgeState();
        const decision = decideNudge({
          isMobile, isInstalled: installed, notifEnabled, notifDenied,
          lastShownAt, shownCount, now: Date.now(),
        });
        if (cancelled || !decision.show) return;
        SHOWN_THIS_SESSION = true;
        recordNudgeShown(Date.now()); // sella el reloj de 10 días + avanza la rotación
        setNudge(decision);
      } catch { /* si algo falla, no molestamos: se re-evalúa en la próxima apertura */ }
    }, 500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [member?.id, member?.onboarded]);

  if (!nudge) return null;
  const copy = copyForNudge(nudge);
  if (!copy) return null;
  const close = () => setNudge(null);
  const isInstall = nudge.type === 'install';
  const Icon = isInstall ? DeviceMobile : BellRinging;
  const platform = getPlatform();

  const onInstall = async () => {
    setError(null);
    // iPhone o sin instalador nativo disponible → mostramos los pasos manuales.
    if (platform === 'ios' || !canPromptInstall()) { setShowSteps(true); return; }
    setBusy(true);
    try {
      const outcome = await triggerInstall();
      if (outcome === 'accepted') close();
      else if (outcome === 'unavailable') setShowSteps(true);
      // 'dismissed' → dejamos el cartel; puede reintentar o cerrar.
    } catch { setShowSteps(true); }
    setBusy(false);
  };

  const onEnableNotif = async () => {
    setError(null); setBusy(true);
    try {
      await subscribePush(member.id); // lanza si el permiso se deniega / falla
      close();
    } catch {
      setError('No se pudieron activar desde acá. Podés hacerlo desde los ajustes del navegador.');
    }
    setBusy(false);
  };

  // Acción principal según consigna. En "notif bloqueadas" no hay botón de acción
  // (no se puede re-preguntar): solo el texto con instrucciones + "Entendido".
  const showActionButton = !(nudge.type === 'notif' && nudge.denied);
  const actionLabel = isInstall
    ? (busy ? 'Abriendo instalador…' : 'Instalar la app')
    : (busy ? 'Activando…' : 'Activar notificaciones');

  return (
    <Modal isOpen title="" onClose={close}>
      <div className="relative overflow-hidden -m-1 text-center">
        <GoldWave className="pointer-events-none absolute inset-x-0 bottom-0 opacity-60" />
        <div className="relative px-2 pt-2 pb-1">
          {/* Medallón dorado con ícono duotono */}
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gold-gradient-soft ring-[1.5px] ring-gold-500/50 shadow-[0_0_28px_-6px_rgba(242,201,76,0.5)]">
            <Icon size={34} weight="duotone" className="text-gold-100" />
          </div>

          <h2 className="mt-4 text-xl font-bold text-white text-balance">{copy.title}</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-gray-300">{copy.body}</p>

          {/* Pasos manuales (iPhone o instalar a mano) */}
          {isInstall && showSteps && (
            <div className="mx-auto mt-4 max-w-xs space-y-2 rounded-xl border border-gold-500/20 bg-neutral-900/60 p-3 text-left text-sm text-gray-300">
              {platform === 'ios' ? (
                <>
                  <p>1. Tocá <Share size={15} className="inline text-gold-300" /> <span className="font-semibold text-white">Compartir</span> abajo en la barra.</p>
                  <p>2. Elegí <Plus size={15} className="inline text-gold-300" /> <span className="font-semibold text-white">Agregar a inicio</span>.</p>
                </>
              ) : (
                <p>Abrí el menú del navegador (⋮) y elegí <span className="font-semibold text-white">“Instalar app”</span> o <span className="font-semibold text-white">“Agregar a inicio”</span>.</p>
              )}
            </div>
          )}

          {error && <p className="mt-3 text-sm text-amber-300">{error}</p>}

          <div className="mt-5 flex flex-col gap-2">
            {showActionButton && !showSteps && (
              <Button variant="primary" icon={Icon} onClick={isInstall ? onInstall : onEnableNotif} disabled={busy}>
                {actionLabel}
              </Button>
            )}
            <Button variant="ghost" onClick={close}>
              {showActionButton && !showSteps ? 'Quizás después' : 'Entendido'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default EngagementNudge;
