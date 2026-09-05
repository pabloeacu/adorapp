import React, { useState, useEffect } from 'react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, X, Trash2, Music2, Check } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { useCurrentRole, useCurrentMember } from '../../hooks/useCurrentMember';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { SelectMenu } from '../ui/SelectMenu';
import { SuccessModal, ErrorModal } from '../ui/ConfirmModal';
import {
  SCHEMA_SECTION_TYPES, sectionMeta, nextSchemaLocalId, computeSchemaTimeline, minToHhmm,
} from '../../lib/serviceSchema';

const TIME_MODES = [
  { value: 'none', label: 'Sin horario' },
  { value: 'duration', label: 'Duración (min)' },
  { value: 'startend', label: 'Inicio y fin' },
];

// Fila sortable (grip-only, render-prop) — mismo patrón que el editor de canciones.
function SortableRow({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="bg-neutral-800/70 border border-neutral-700 rounded-xl p-3">
      {children({ attributes, listeners })}
    </div>
  );
}

// Armador de "Esquema de reunión" de un orden. Secciones (repetibles) con
// observación + tiempo opcional; en "Adoración" se asignan canciones del orden.
// El pastor puede guardar como plantilla; el líder puede usar plantillas.
export const SchemaBuilderModal = ({ order, isOpen, onClose }) => {
  const role = useCurrentRole();
  const currentMember = useCurrentMember();
  const isPastor = role === 'pastor';
  const getServiceSchema = useAppStore((s) => s.getServiceSchema);
  const upsertServiceSchema = useAppStore((s) => s.upsertServiceSchema);
  const deleteServiceSchema = useAppStore((s) => s.deleteServiceSchema);
  const saveSchemaTemplate = useAppStore((s) => s.saveSchemaTemplate);
  const schemaTemplates = useAppStore((s) => s.schemaTemplates);
  const getSongById = useAppStore((s) => s.getSongById);
  useAppStore((s) => s.serviceSchemas); // suscripción para reflejar cambios

  const [sections, setSections] = useState([]);
  const [addType, setAddType] = useState('');
  const [tmplName, setTmplName] = useState('');
  const [showTmplInput, setShowTmplInput] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState({ isOpen: false, title: '', message: '' });
  const [success, setSuccess] = useState({ isOpen: false, title: '', message: '' });

  useEffect(() => {
    if (!isOpen || !order) return;
    const existing = getServiceSchema(order.id);
    setSections((existing?.sections || []).map((s) => ({ ...s, _localId: nextSchemaLocalId() })));
    setAddType(''); setTmplName(''); setShowTmplInput(false);
  }, [isOpen, order?.id, getServiceSchema]);

  const orderSongs = (order?.songs || []).map((ref) => ({ songId: ref.songId, title: getSongById(ref.songId)?.title || 'Canción' }));
  const timeline = computeSchemaTimeline(sections, order?.time);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    setSections((prev) => {
      const ids = prev.map((s) => s._localId);
      const oi = ids.indexOf(active.id); const ni = ids.indexOf(over.id);
      if (oi < 0 || ni < 0) return prev;
      return arrayMove(prev, oi, ni);
    });
  };

  const addSection = (typeId) => {
    if (!typeId) return;
    setSections((prev) => [...prev, { _localId: nextSchemaLocalId(), type: typeId, note: '', timeMode: 'none', durationMin: '', startTime: '', endTime: '', songIds: [] }]);
    setAddType('');
  };
  const patch = (localId, p) => setSections((prev) => prev.map((s) => (s._localId === localId ? { ...s, ...p } : s)));
  const remove = (localId) => setSections((prev) => prev.filter((s) => s._localId !== localId));
  const toggleSong = (localId, songId) => setSections((prev) => prev.map((s) => {
    if (s._localId !== localId) return s;
    const has = (s.songIds || []).includes(songId);
    return { ...s, songIds: has ? s.songIds.filter((x) => x !== songId) : [...(s.songIds || []), songId] };
  }));

  // Strip del _localId antes de persistir (landmine #22).
  const stripped = () => sections.map(({ _localId, ...rest }) => rest);
  const strippedForTemplate = () => sections.map(({ _localId, songIds, ...rest }) => rest); // plantilla: sin canciones

  const handleSave = async () => {
    if (submitting) return;
    setSubmitting(true);
    const res = await upsertServiceSchema({ orderId: order.id, sections: stripped(), createdBy: currentMember?.id });
    setSubmitting(false);
    if (res?.ok) { onClose(); setSuccess({ isOpen: true, title: 'Esquema guardado', message: 'El esquema quedó listo. Ahora aparece "Iniciar servicio" en este orden.' }); }
    else setError({ isOpen: true, title: 'No se pudo guardar', message: res?.error || 'Intentá de nuevo.' });
  };
  const handleSaveTemplate = async () => {
    const name = tmplName.trim();
    if (!name) { setError({ isOpen: true, title: 'Falta el nombre', message: 'Poné un nombre para la plantilla.' }); return; }
    const res = await saveSchemaTemplate({ name, sections: strippedForTemplate(), createdBy: currentMember?.id });
    if (res?.ok) { setShowTmplInput(false); setTmplName(''); setSuccess({ isOpen: true, title: 'Plantilla guardada', message: `"${name}" ya está disponible para usar en otros esquemas.` }); }
    else setError({ isOpen: true, title: 'No se pudo guardar la plantilla', message: res?.error || 'Intentá de nuevo.' });
  };
  const handleUseTemplate = (tId) => {
    const t = schemaTemplates.find((x) => x.id === tId);
    if (!t) return;
    setSections((t.sections || []).map((s) => ({ ...s, _localId: nextSchemaLocalId(), songIds: s.type === 'adoracion' ? [] : (s.songIds || []) })));
  };
  const handleDelete = async () => {
    setSubmitting(true);
    const res = await deleteServiceSchema(order.id);
    setSubmitting(false);
    if (res?.ok) { onClose(); }
    else setError({ isOpen: true, title: 'No se pudo quitar', message: res?.error || 'Intentá de nuevo.' });
  };

  const templateOptions = (schemaTemplates || []).map((t) => ({ value: t.id, label: t.name }));

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Esquema de reunión" size="xl"
        footer={(
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              {getServiceSchema(order?.id) && (
                <Button variant="ghost" icon={Trash2} onClick={handleDelete} disabled={submitting}>Quitar esquema</Button>
              )}
              {isPastor && sections.length > 0 && !showTmplInput && (
                <Button variant="ghost" onClick={() => setShowTmplInput(true)} disabled={submitting}>Guardar como plantilla</Button>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>Cancelar</Button>
              <Button variant="primary" onClick={handleSave} disabled={submitting || sections.length === 0}>
                {submitting ? 'Guardando…' : 'Guardar esquema'}
              </Button>
            </div>
          </div>
        )}>
        <div className="space-y-4">
          <p className="text-sm text-neutral-400">
            Armá el cronograma del servicio. Cada sección puede llevar una observación y, si querés,
            un tiempo. En <span className="text-gold-200">Adoración</span> elegís qué canciones del orden van en ese momento.
          </p>

          {/* Plantillas + guardar-como-plantilla */}
          {(isPastor || role === 'leader') && (
            <div className="flex flex-col sm:flex-row gap-2">
              {templateOptions.length > 0 && (
                <div className="flex-1">
                  <SelectMenu value="" onChange={handleUseTemplate} placeholder="Usar una plantilla…" options={templateOptions} />
                </div>
              )}
              {showTmplInput && (
                <div className="flex-1 flex items-center gap-2">
                  <input value={tmplName} onChange={(e) => setTmplName(e.target.value)} placeholder="Nombre de la plantilla"
                    className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 text-white text-sm" />
                  <Button variant="primary" size="sm" onClick={handleSaveTemplate}>Guardar</Button>
                  <Button variant="ghost" size="sm" onClick={() => { setShowTmplInput(false); setTmplName(''); }}>✕</Button>
                </div>
              )}
            </div>
          )}

          {/* Lista de secciones */}
          {sections.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-center text-sm text-neutral-500">
              Todavía no agregaste secciones. Empezá eligiendo una abajo.
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={sections.map((s) => s._localId)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2 max-h-[46vh] overflow-y-auto pr-1">
                  {sections.map((s, i) => {
                    const meta = sectionMeta(s.type);
                    const tl = timeline[i] || {};
                    const isAdor = s.type === 'adoracion';
                    return (
                      <SortableRow key={s._localId} id={s._localId}>
                        {({ attributes, listeners }) => (
                          <div className="flex items-start gap-2">
                            <button type="button" aria-label="Mover sección" {...attributes} {...listeners}
                              className="mt-1 cursor-grab active:cursor-grabbing text-neutral-500 hover:text-neutral-300 touch-none shrink-0">
                              <GripVertical size={16} />
                            </button>
                            <div className="min-w-0 flex-1 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-xs text-neutral-600 tabular-nums w-5 text-right shrink-0">{i + 1}.</span>
                                  <Badge variant={isAdor ? 'gold' : 'primary'} size="sm">{meta.label}</Badge>
                                  {(tl.startMin != null) && (
                                    <span className="text-[11px] text-neutral-500 shrink-0">
                                      {minToHhmm(tl.startMin)}{tl.endMin != null ? `–${minToHhmm(tl.endMin)}` : ''}
                                    </span>
                                  )}
                                </div>
                                <button type="button" onClick={() => remove(s._localId)} aria-label="Quitar" className="text-neutral-500 hover:text-red-400 shrink-0">
                                  <X size={16} />
                                </button>
                              </div>

                              <input value={s.note} onChange={(e) => patch(s._localId, { note: e.target.value })}
                                placeholder={meta.isCustom ? 'Escribí de qué se trata…' : 'Observación (opcional)'}
                                className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-sm text-white" />

                              {/* Tiempo */}
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="w-40">
                                  <SelectMenu value={s.timeMode || 'none'} onChange={(v) => patch(s._localId, { timeMode: v })} options={TIME_MODES} />
                                </div>
                                {s.timeMode === 'duration' && (
                                  <input type="number" min="1" max="240" value={s.durationMin}
                                    onChange={(e) => patch(s._localId, { durationMin: e.target.value })}
                                    placeholder="min" className="w-20 bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-1.5 text-sm text-white" />
                                )}
                                {s.timeMode === 'startend' && (
                                  <>
                                    <input type="time" value={s.startTime} onChange={(e) => patch(s._localId, { startTime: e.target.value })}
                                      className="bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-1.5 text-sm text-white" />
                                    <span className="text-neutral-500 text-sm">a</span>
                                    <input type="time" value={s.endTime} onChange={(e) => patch(s._localId, { endTime: e.target.value })}
                                      className="bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-1.5 text-sm text-white" />
                                  </>
                                )}
                              </div>

                              {/* Adoración: asignar canciones del orden */}
                              {isAdor && (
                                <div className="rounded-lg border border-gold-500/20 bg-gold-500/[0.04] p-2">
                                  <p className="text-[11px] text-gold-300/80 mb-1.5 flex items-center gap-1"><Music2 size={12} /> Canciones en este momento</p>
                                  {orderSongs.length === 0 ? (
                                    <p className="text-xs text-neutral-500">Este orden no tiene canciones cargadas.</p>
                                  ) : (
                                    <div className="flex flex-wrap gap-1.5">
                                      {orderSongs.map((os) => {
                                        const on = (s.songIds || []).includes(os.songId);
                                        return (
                                          <button key={os.songId} type="button" onClick={() => toggleSong(s._localId, os.songId)}
                                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs border transition-colors ${
                                              on ? 'bg-gold-500/20 border-gold-500/50 text-gold-200' : 'bg-neutral-900 border-neutral-700 text-neutral-300 hover:border-neutral-600'
                                            }`}>
                                            {on && <Check size={12} />}{os.title}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </SortableRow>
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {/* Agregar sección */}
          <div className="flex items-center gap-2 pt-1">
            <div className="flex-1">
              <SelectMenu value={addType} onChange={addSection} placeholder="+ Agregar sección…"
                options={SCHEMA_SECTION_TYPES.map((t) => ({ value: t.id, label: t.label }))} up />
            </div>
          </div>
        </div>
      </Modal>

      <SuccessModal isOpen={success.isOpen} onClose={() => setSuccess({ ...success, isOpen: false })} title={success.title} message={success.message} />
      <ErrorModal isOpen={error.isOpen} onClose={() => setError({ ...error, isOpen: false })} title={error.title} message={error.message} />
    </>
  );
};
