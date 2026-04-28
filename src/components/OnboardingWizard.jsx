// OnboardingWizard — first-login welcome flow for new members.
// Shows a 3-step modal that helps them complete their profile, then sets
// members.onboarded=true so they never see it again.
//
// Triggered from Layout.jsx when the current user's member row has
// onboarded=false. The pastor's first member (Paul) was migrated as
// onboarded=true so this flow only fires for newly-approved members.

import React, { useState } from 'react';
import { Camera, Phone, Calendar, Cross, Users2, Music, Check, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAppStore, INSTRUMENTS } from '../stores/appStore';
import { useAuthStore } from '../stores/authStore';

export function OnboardingWizard({ member, onClose }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [phone, setPhone] = useState(member.phone || '');
  const [birthdate, setBirthdate] = useState(member.birthdate || '');
  const [pastorArea, setPastorArea] = useState(member.pastor_area || '');
  const [instruments, setInstruments] = useState(member.instruments || []);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const reloadApp = useAppStore((s) => s.initialize);

  const toggleInstrument = (i) =>
    setInstruments((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));

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
    // refreshProfile already triggers appStore reinit, but we belt-and-suspenders.
    await refreshProfile();
    await reloadApp();
    setSaving(false);
    onClose();
  };

  const skip = async () => {
    setSaving(true);
    await supabase.from('members').update({ onboarded: true }).eq('id', member.id);
    await refreshProfile();
    setSaving(false);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
    >
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-lg max-h-[90dvh] overflow-y-auto">
        <div className="p-6 space-y-5">
          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? 'w-8 bg-white' : i < step ? 'w-4 bg-white/60' : 'w-4 bg-neutral-700'
                }`}
              />
            ))}
          </div>

          {step === 0 && (
            <>
              <div className="text-center space-y-2">
                <div className="text-5xl">👋</div>
                <h1 id="onboarding-title" className="text-2xl font-bold">
                  Bienvenido, {member.name.split(' ')[0]}
                </h1>
                <p className="text-gray-400">
                  Completemos tu perfil en menos de un minuto. Esto ayuda a que pastores y líderes te
                  encuentren para asignar canciones, bandas y servicios.
                </p>
              </div>

              <button
                onClick={() => setStep(1)}
                className="w-full py-3 bg-white text-black font-semibold rounded-xl hover:bg-gray-200 transition-colors flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-white/40"
              >
                Empezar <ArrowRight size={18} />
              </button>
              <button
                onClick={skip}
                disabled={saving}
                className="w-full text-sm text-gray-500 hover:text-gray-300"
              >
                Más tarde
              </button>
            </>
          )}

          {step === 1 && (
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
                <span className="text-xs uppercase text-gray-500 block mb-1 flex items-center gap-1">
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
                <span className="text-xs uppercase text-gray-500 block mb-1 flex items-center gap-1">
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
                  onClick={() => setStep(0)}
                  className="flex-1 py-2.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/40"
                >
                  Atrás
                </button>
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 py-2.5 bg-white text-black font-semibold rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-white/40"
                >
                  Siguiente
                </button>
              </div>
            </>
          )}

          {step === 2 && (
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
                  onClick={() => setStep(1)}
                  disabled={saving}
                  className="flex-1 py-2.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/40"
                >
                  Atrás
                </button>
                <button
                  onClick={finish}
                  disabled={saving}
                  className="flex-1 py-2.5 bg-white text-black font-semibold rounded-lg hover:bg-gray-200 disabled:opacity-50 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-white/40"
                >
                  {saving ? 'Guardando…' : (
                    <>
                      <Check size={16} /> Listo
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
