// OnboardingWizard — first-login welcome flow for new members.
//
// 4-step structure (Paul's spec):
//   0. Bienvenida
//   1. Tour visual con WizardSpotlight (señala los íconos del bottom-nav)
//   2. Datos personales — sub-pasos: contacto + instrumentos
//   3. Activá las notificaciones (botón grande + "Más tarde")
//
// Triggered from Layout.jsx when the current user's member row has
// onboarded=false. The pastor's first member (Paul) was migrated as
// onboarded=true so this flow only fires for newly-approved members.

import React, { useState } from 'react';
import { Phone, Calendar, Cross, Music, Check, ArrowRight, Bell } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAppStore, INSTRUMENTS } from '../stores/appStore';
import { useAuthStore } from '../stores/authStore';
import { WizardSpotlight } from './WizardSpotlight';
import { subscribePush, isPushSupported } from '../lib/push';

const TOUR_STOPS = [
  {
    selector: "[data-tour='nav-ordenes']",
    title: 'Tus órdenes',
    body: 'Acá vas a ver la lista de canciones de cada reunión. Tocá el ícono y entrás al detalle.',
  },
  {
    selector: "[data-tour='nav-repertorio']",
    title: 'Tu repertorio',
    body: 'Acá está todo el repertorio del ministerio: cada canción con tono, letra y acordes.',
  },
  // Last stop has no selector — it's a tip card centered on screen, since the
  // print buttons live inside an order detail and aren't reachable from here.
  {
    selector: null,
    title: 'Imprimir órdenes',
    body: 'Cuando entrás a una orden, vas a ver los íconos de impresión arriba a la derecha.',
  },
];

export function OnboardingWizard({ member, onClose }) {
  const [step, setStep] = useState(0);
  const [tourIndex, setTourIndex] = useState(0);
  const [dataSubStep, setDataSubStep] = useState(0); // 0 = contacto, 1 = instrumentos
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [phone, setPhone] = useState(member.phone || '');
  const [birthdate, setBirthdate] = useState(member.birthdate || '');
  const [pastorArea, setPastorArea] = useState(member.pastor_area || '');
  const [instruments, setInstruments] = useState(member.instruments || []);

  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState(null);
  const [pushDone, setPushDone] = useState(false);

  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const reloadApp = useAppStore((s) => s.initialize);

  const toggleInstrument = (i) =>
    setInstruments((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));

  // Persist all collected data and mark onboarded=true. Used by the final
  // step (whether they activate notifications or skip).
  const finish = async () => {
    setSaving(true);
    setError(null);
    const { error: err } = await supabase
      .from('members')
      .update({
        phone: phone.trim() || null,
        birthdate: birthdate || null,
        pastor_area: pastorArea.trim() || null,
        instruments,
        onboarded: true,
      })
      .eq('id', member.id);
    if (err) {
      setError('No pudimos guardar. Intentá de nuevo.');
      setSaving(false);
      return;
    }
    await refreshProfile();
    await reloadApp();
    setSaving(false);
    onClose();
  };

  // "Más tarde" from the welcome screen — skip everything, mark onboarded.
  const skipAll = async () => {
    setSaving(true);
    await supabase.from('members').update({ onboarded: true }).eq('id', member.id);
    await refreshProfile();
    setSaving(false);
    onClose();
  };

  // ---------------- STEP 1: Tour ----------------
  if (step === 1) {
    const stop = TOUR_STOPS[tourIndex];
    const isLast = tourIndex === TOUR_STOPS.length - 1;
    return (
      <WizardSpotlight
        targetSelector={stop.selector}
        title={stop.title}
        body={stop.body}
        stepIndex={tourIndex}
        stepCount={TOUR_STOPS.length}
        nextLabel={isLast ? 'Continuar' : 'Siguiente'}
        onNext={() => {
          if (isLast) {
            setStep(2);
          } else {
            setTourIndex(tourIndex + 1);
          }
        }}
        onSkip={() => setStep(2)}
      />
    );
  }

  // ---------------- STEP 0, 2, 3: regular modal ----------------
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
    >
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-lg max-h-[90dvh] overflow-y-auto">
        <div className="p-6 space-y-5">
          {/* Step indicator (4 segments) */}
          <div className="flex items-center justify-center gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? 'w-8 bg-white' : i < step ? 'w-4 bg-white/60' : 'w-4 bg-neutral-700'
                }`}
              />
            ))}
          </div>

          {/* ---------- STEP 0: Bienvenida ---------- */}
          {step === 0 && (
            <>
              <div className="text-center space-y-2">
                <div className="text-5xl">👋</div>
                <h1 id="onboarding-title" className="text-2xl font-bold">
                  Bienvenido, {member.name.split(' ')[0]}
                </h1>
                <p className="text-gray-400">
                  En menos de un minuto te mostramos cómo se mueve la app y completamos tu perfil.
                </p>
              </div>

              <button
                onClick={() => setStep(1)}
                className="w-full py-3 bg-white text-black font-semibold rounded-xl hover:bg-gray-200 transition-colors flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-white/40"
              >
                Empezar <ArrowRight size={18} />
              </button>
              <button
                onClick={skipAll}
                disabled={saving}
                className="w-full text-sm text-gray-500 hover:text-gray-300"
              >
                Más tarde
              </button>
            </>
          )}

          {/* ---------- STEP 2: Datos personales (sub-pasos) ---------- */}
          {step === 2 && dataSubStep === 0 && (
            <>
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Phone size={20} /> Datos de contacto
              </h2>
              <p className="text-sm text-gray-400">
                Solo los pastores y líderes ven esto. Te van a usar para coordinar ensayos.
              </p>

              <label className="block">
                <span className="text-xs uppercase text-gray-500 block mb-1">Teléfono</span>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+54 11 1234-5678"
                  className="w-full px-4 py-2.5 bg-neutral-800 border border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white"
                />
              </label>

              <label className="block">
                <span className="text-xs uppercase text-gray-500 mb-1 flex items-center gap-1">
                  <Calendar size={12} /> Fecha de nacimiento
                </span>
                <input
                  type="date"
                  value={birthdate}
                  onChange={(e) => setBirthdate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-neutral-800 border border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white"
                />
              </label>

              <label className="block">
                <span className="text-xs uppercase text-gray-500 mb-1 flex items-center gap-1">
                  <Cross size={12} /> Pastor de área
                </span>
                <input
                  type="text"
                  value={pastorArea}
                  onChange={(e) => setPastorArea(e.target.value)}
                  placeholder="Nombre de tu pastor"
                  className="w-full px-4 py-2.5 bg-neutral-800 border border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white"
                />
              </label>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 py-2.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/40"
                >
                  Atrás
                </button>
                <button
                  onClick={() => setDataSubStep(1)}
                  className="flex-1 py-2.5 bg-white text-black font-semibold rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-white/40"
                >
                  Siguiente
                </button>
              </div>
            </>
          )}

          {step === 2 && dataSubStep === 1 && (
            <>
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Music size={20} /> Tus instrumentos
              </h2>
              <p className="text-sm text-gray-400">
                Marcá los que tocás o cantás. Los líderes los usan para armar la banda.
              </p>

              <div className="grid grid-cols-3 gap-2">
                {INSTRUMENTS.map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleInstrument(i)}
                    className={`p-2.5 rounded-lg text-sm border-2 transition-all focus:outline-none focus:ring-2 focus:ring-white/40 ${
                      instruments.includes(i)
                        ? 'border-white bg-white/10 text-white'
                        : 'border-neutral-800 hover:border-neutral-700 text-gray-300'
                    }`}
                  >
                    {i}
                  </button>
                ))}
              </div>

              {error && <p className="text-sm text-red-400 text-center">{error}</p>}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setDataSubStep(0)}
                  className="flex-1 py-2.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/40"
                >
                  Atrás
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="flex-1 py-2.5 bg-white text-black font-semibold rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-white/40"
                >
                  Siguiente
                </button>
              </div>
            </>
          )}

          {/* ---------- STEP 3: Activá las notificaciones ---------- */}
          {step === 3 && (
            <>
              <div className="text-center space-y-3">
                <div className="w-16 h-16 mx-auto bg-blue-500/20 rounded-full flex items-center justify-center">
                  <Bell size={32} className="text-blue-400" />
                </div>
                <h2 className="text-xl font-bold">¿Activás las notificaciones?</h2>
                <p className="text-sm text-gray-400">
                  Si las activás, te mantenemos al tanto de todas las novedades del área: nuevas
                  canciones, comunicaciones, devocional, reflexión y mensajes — directo a tu celu.
                </p>
              </div>

              {pushDone && (
                <p className="text-sm text-green-400 text-center flex items-center justify-center gap-2">
                  <Check size={16} /> Activadas
                </p>
              )}
              {pushError && <p className="text-sm text-red-400 text-center">{pushError}</p>}

              {!pushDone && (
                <button
                  onClick={async () => {
                    setPushBusy(true);
                    setPushError(null);
                    try {
                      if (!isPushSupported()) {
                        throw new Error('Tu navegador no soporta notificaciones push');
                      }
                      await subscribePush(member.id);
                      setPushDone(true);
                      // Auto-finish after a short success beat.
                      setTimeout(() => finish(), 600);
                    } catch (e) {
                      setPushError(e?.message || 'No se pudo activar');
                      setPushBusy(false);
                    }
                  }}
                  disabled={pushBusy || saving}
                  className="w-full py-3.5 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
                >
                  <Bell size={18} />
                  {pushBusy ? 'Activando…' : 'Activar notificaciones'}
                </button>
              )}

              <button
                onClick={finish}
                disabled={pushBusy || saving}
                className="w-full text-sm text-gray-500 hover:text-gray-300"
              >
                {saving ? 'Guardando…' : 'Más tarde'}
              </button>
              <p className="text-xs text-gray-600 text-center">
                Podés activarlas o desactivarlas más adelante desde tu perfil.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
