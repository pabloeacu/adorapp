import React, { useEffect, useState } from 'react';
import { Sparkle } from '@phosphor-icons/react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useAppStore, INSTRUMENTS } from '../../stores/appStore';
import {
  withGuestSuffix, stripGuestSuffix, todayARTDateString, formatGuestUntil,
} from '../../lib/guests';

// Modal para CREAR o EDITAR un invitado (miembro temporal sin login).
// Campos reducidos: nombre + instrumento(s) (default Voz) + "Invitado hasta [fecha]".
// El nombre se guarda con el sufijo " -invitado-" (lo arma withGuestSuffix) → se ve
// así en todos los combos/órdenes/correos. Crear NO abre el modal de contraseña
// (no hay credenciales). Editar permite extender/acortar la invitación (cambiar la
// fecha) y tocar nombre/instrumentos; va por updateMember directo (el pastor exime
// el freeze de guest_until).
export function GuestModal({ isOpen, onClose, editingGuest, onDone }) {
  const addGuestMember = useAppStore((s) => s.addGuestMember);
  const updateMember = useAppStore((s) => s.updateMember);

  const isEditing = !!editingGuest;
  const [name, setName] = useState('');
  const [instruments, setInstruments] = useState(['Voz']);
  const [guestUntil, setGuestUntil] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Precarga al abrir. En creación: nombre vacío, Voz por defecto, fecha vacía
  // (el pastor elige). En edición: nombre sin el sufijo, sus instrumentos, su fecha.
  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setSaving(false);
    if (editingGuest) {
      setName(stripGuestSuffix(editingGuest.name));
      setInstruments(Array.isArray(editingGuest.instruments) ? editingGuest.instruments : []);
      setGuestUntil(editingGuest.guestUntil || '');
    } else {
      setName('');
      setInstruments(['Voz']);
      setGuestUntil('');
    }
  }, [isOpen, editingGuest]);

  const today = todayARTDateString();

  const toggleInstrument = (inst) => {
    setInstruments((prev) => (prev.includes(inst) ? prev.filter((i) => i !== inst) : [...prev, inst]));
  };

  const handleSubmit = async () => {
    if (saving) return;
    const cleanName = name.trim();
    if (!cleanName) { setError('Poné el nombre del invitado.'); return; }
    if (!guestUntil) { setError('Elegí hasta qué día dura la invitación.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(guestUntil)) { setError('La fecha de invitación no es válida.'); return; }
    // En creación no tiene sentido invitar para una fecha ya pasada.
    if (!isEditing && guestUntil < today) { setError('La fecha de invitación no puede ser anterior a hoy.'); return; }

    setSaving(true);
    setError('');
    const fullName = withGuestSuffix(cleanName);
    try {
      if (isEditing) {
        const res = await updateMember(editingGuest.id, {
          name: fullName,
          instruments,
          guestUntil,
        });
        if (!res) { setError('No se pudo guardar. Probá de nuevo.'); setSaving(false); return; }
        onDone?.({ name: fullName, isNew: false });
      } else {
        const member = await addGuestMember({
          name: fullName,
          instruments,
          guestUntil,
          areas: ['adoracion'],
        });
        if (!member) { setError('No se pudo crear el invitado. Probá de nuevo.'); setSaving(false); return; }
        onDone?.({ name: fullName, isNew: true });
      }
      onClose?.();
    } catch (e) {
      setError(e?.message || 'No se pudo guardar. Probá de nuevo.');
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Editar invitado' : 'Crear invitado'}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Guardando…' : (isEditing ? 'Guardar' : 'Crear invitado')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Explicación breve */}
        <div className="flex items-start gap-3 rounded-xl border border-gold-500/30 bg-gold-500/10 p-3">
          <Sparkle size={20} weight="duotone" className="text-gold-300 shrink-0 mt-0.5" />
          <p className="text-xs text-gray-300 leading-relaxed">
            Un invitado es alguien que participa por un tiempo (p. ej. un cantante de un evento) y
            <strong className="text-gold-200"> no necesita cuenta ni contraseña</strong>. Aparece en los combos
            con su nombre y <span className="text-gold-200">“-invitado-”</span>, y al vencer la fecha desaparece
            solo de todos lados (su registro no se borra).
          </p>
        </div>

        {/* Nombre */}
        <div>
          <label className="text-xs text-gray-400 font-medium uppercase tracking-wide block mb-2">Nombre</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Marcos Witt"
            className="w-full"
            autoFocus
          />
          {name.trim() && (
            <p className="text-xs text-gray-500 mt-1.5">
              Se va a ver como: <span className="text-gold-200">{withGuestSuffix(name.trim())}</span>
            </p>
          )}
        </div>

        {/* Hasta cuándo */}
        <div>
          <label className="text-xs text-gray-400 font-medium uppercase tracking-wide block mb-2">Invitado hasta</label>
          <input
            type="date"
            value={guestUntil}
            min={isEditing ? undefined : today}
            onChange={(e) => setGuestUntil(e.target.value)}
            className="w-full"
          />
          <p className="text-xs text-gray-500 mt-1.5">
            {isEditing
              ? 'Desde este día deja de aparecer en los combos. Podés adelantarla para darlo de baja antes.'
              : 'El último día (inclusive) en que aparece en los combos. Después desaparece solo.'}
            {guestUntil && ` · hasta el ${formatGuestUntil(guestUntil)}`}
          </p>
        </div>

        {/* Instrumentos */}
        <div>
          <label className="text-xs text-gray-400 font-medium uppercase tracking-wide block mb-2">
            Instrumento / voz (para la formación)
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {INSTRUMENTS.map((inst) => (
              <button
                key={inst}
                type="button"
                onClick={() => toggleInstrument(inst)}
                className={`p-3 rounded-xl text-sm transition-all border-2 ${
                  instruments.includes(inst)
                    ? 'border-gold-500 bg-gold-500/10'
                    : 'border-neutral-800 hover:border-neutral-700'
                }`}
              >
                {inst}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Para un cantante invitado, dejá <span className="text-gold-200">Voz</span> → vas a poder elegirlo como director.
          </p>
        </div>

        {error && (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>
        )}
      </div>
    </Modal>
  );
}
