import React, { useState, useEffect } from 'react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X, Trash2, Music2, Check, MessageSquarePlus, Download } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { useCurrentRole, useCurrentMember } from '../../hooks/useCurrentMember';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { SelectMenu } from '../ui/SelectMenu';
import { SuccessModal, ErrorModal } from '../ui/ConfirmModal';
import {
  SCHEMA_SECTION_TYPES, sectionMeta, nextSchemaLocalId, sectionDurationMin,
} from '../../lib/serviceSchema';

function SortableRow({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="bg-neutral-800/60 border border-neutral-700/70 rounded-lg px-2.5 py-2">
      {children({ attributes, listeners })}
    </div>
  );
}

// Armador de esquema. Dos modos: mode='schema' (por orden — importa plantillas,
// asigna canciones en Adoración, guarda como plantilla) y mode='template' (crea
// una plantilla independiente — solo pastor, sin orden ni canciones). Minimalista:
// alias + tiempo inline por sección; la observación se activa con un botón.
export const SchemaBuilderModal = ({ order = null, isOpen, onClose, mode = 'schema' }) => {
  const isTemplateMode = mode === 'template';
  const role = useCurrentRole();
  const currentMember = useCurrentMember();
  const isPastor = role === 'pastor';
  const getServiceSchema = useAppStore((s) => s.getServiceSchema);
  const upsertServiceSchema = useAppStore((s) => s.upsertServiceSchema);
  const deleteServiceSchema = useAppStore((s) => s.deleteServiceSchema);
  const saveSchemaTemplate = useAppStore((s) => s.saveSchemaTemplate);
  const schemaTemplates = useAppStore((s) => s.schemaTemplates);
  const getSongById = useAppStore((s) => s.getSongById);
  useAppStore((s) => s.serviceSchemas);

  const [sections, setSections] = useState([]);
  const [notesShown, setNotesShown] = useState(() => new Set());
  const [tmplName, setTmplName] = useState('');
  const [showTmplInput, setShowTmplInput] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState({ isOpen: false, title: '', message: '' });
  const [success, setSuccess] = useState({ isOpen: false, title: '', message: '' });

  useEffect(() => {
    if (!isOpen) return;
    const existing = isTemplateMode ? null : getServiceSchema(order?.id);
    const src = (existing?.sections || []).map((s) => ({ ...s, _localId: nextSchemaLocalId() }));
    setSections(src);
    setNotesShown(new Set(src.filter((s) => s.note && s.note.trim()).map((s) => s._localId)));
    setTmplName(''); setShowTmplInput(false);
  }, [isOpen, order?.id, isTemplateMode, getServiceSchema]);

  const orderSongs = (order?.songs || []).map((ref) => ({ songId: ref.songId, title: getSongById(ref.songId)?.title || 'Canción' }));

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
    setSections((prev) => [...prev, { _localId: nextSchemaLocalId(), type: typeId, alias: '', note: '', timeMode: 'none', durationMin: '', startTime: '', endTime: '', songIds: [] }]);
  };
  const patch = (id, p) => setSections((prev) => prev.map((s) => (s._localId === id ? { ...s, ...p } : s)));
  const remove = (id) => setSections((prev) => prev.filter((s) => s._localId !== id));
  const toggleTime = (id, m) => setSections((prev) => prev.map((s) => (s._localId === id ? { ...s, timeMode: s.timeMode === m ? 'none' : m } : s)));
  const toggleSong = (id, songId) => setSections((prev) => prev.map((s) => {
    if (s._localId !== id) return s;
    const has = (s.songIds || []).includes(songId);
    return { ...s, songIds: has ? s.songIds.filter((x) => x !== songId) : [...(s.songIds || []), songId] };
  }));
  const toggleNote = (id) => setNotesShown((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const stripped = () => sections.map(({ _localId, ...rest }) => rest);
  const strippedForTemplate = () => sections.map(({ _localId, songIds, ...rest }) => rest);

  const handleSave = async () => {
    if (submitting || sections.length === 0) return;
    setSubmitting(true);
    if (isTemplateMode) {
      const name = tmplName.trim();
      if (!name) { setSubmitting(false); setError({ isOpen: true, title: 'Falta el nombre', message: 'Poné un nombre para la plantilla.' }); return; }
      const res = await saveSchemaTemplate({ name, sections: strippedForTemplate(), createdBy: currentMember?.id });
      setSubmitting(false);
      if (res?.ok) { onClose(); setSuccess({ isOpen: true, title: 'Plantilla guardada', message: `"${name}" ya está disponible para importar en cualquier esquema.` }); }
      else setError({ isOpen: true, title: 'No se pudo guardar', message: res?.error || 'Intentá de nuevo.' });
      return;
    }
    const res = await upsertServiceSchema({ orderId: order.id, sections: stripped(), createdBy: currentMember?.id });
    setSubmitting(false);
    if (res?.ok) { onClose(); setSuccess({ isOpen: true, title: 'Esquema guardado', message: 'Listo. Ahora aparece "Iniciar servicio" en este orden.' }); }
    else setError({ isOpen: true, title: 'No se pudo guardar', message: res?.error || 'Intentá de nuevo.' });
  };
  const handleSaveTemplate = async () => {
    const name = tmplName.trim();
    if (!name) { setError({ isOpen: true, title: 'Falta el nombre', message: 'Poné un nombre para la plantilla.' }); return; }
    const res = await saveSchemaTemplate({ name, sections: strippedForTemplate(), createdBy: currentMember?.id });
    if (res?.ok) { setShowTmplInput(false); setTmplName(''); setSuccess({ isOpen: true, title: 'Plantilla guardada', message: `"${name}" ya está disponible para importar.` }); }
    else setError({ isOpen: true, title: 'No se pudo guardar la plantilla', message: res?.error || 'Intentá de nuevo.' });
  };
  const handleImport = (tId) => {
    const t = schemaTemplates.find((x) => x.id === tId);
    if (!t) return;
    const imported = (t.sections || []).map((s) => ({ ...s, _localId: nextSchemaLocalId(), songIds: s.type === 'adoracion' ? [] : (s.songIds || []) }));
    setSections(imported);
    setNotesShown(new Set(imported.filter((s) => s.note && s.note.trim()).map((s) => s._localId)));
  };
  const handleDelete = async () => {
    setSubmitting(true);
    const res = await deleteServiceSchema(order.id);
    setSubmitting(false);
    if (res?.ok) onClose();
    else setError({ isOpen: true, title: 'No se pudo quitar', message: res?.error || 'Intentá de nuevo.' });
  };

  const templateOptions = (schemaTemplates || []).map((t) => ({ value: t.id, label: t.name }));
  const title = isTemplateMode ? 'Nueva plantilla de esquema' : 'Esquema de reunión';

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg"
        footer={(
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-1">
              {!isTemplateMode && getServiceSchema(order?.id) && (
                <Button variant="ghost" size="sm" icon={Trash2} onClick={handleDelete} disabled={submitting}>Quitar esquema</Button>
              )}
              {!isTemplateMode && isPastor && sections.length > 0 && !showTmplInput && (
                <Button variant="ghost" size="sm" onClick={() => setShowTmplInput(true)} disabled={submitting}>Guardar como plantilla</Button>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
              <Button variant="primary" size="sm" onClick={handleSave} disabled={submitting || sections.length === 0}>
                {submitting ? 'Guardando…' : (isTemplateMode ? 'Guardar plantilla' : 'Guardar esquema')}
              </Button>
            </div>
          </div>
        )}>
        <div className="space-y-3">
          <p className="text-sm text-neutral-400">
            {isTemplateMode
              ? 'Armá una plantilla reutilizable. Después la importás en el esquema de cualquier orden.'
              : 'Armá el cronograma del servicio. Cada sección puede llevar un alias, un tiempo y una observación.'}
          </p>

          {/* Nombre de la plantilla (modo plantilla) / importar (modo esquema) */}
          {isTemplateMode ? (
            <input value={tmplName} onChange={(e) => setTmplName(e.target.value)} placeholder="Nombre de la plantilla (ej: Reunión de Jóvenes)"
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white" />
          ) : (
            <div className="flex flex-col sm:flex-row gap-2">
              {templateOptions.length > 0 && (
                <div className="flex-1">
                  <SelectMenu value="" onChange={handleImport} placeholder="Importar esquema (plantilla)…" icon={Download} options={templateOptions} />
                </div>
              )}
              {showTmplInput && (
                <div className="flex-1 flex items-center gap-2">
                  <input value={tmplName} onChange={(e) => setTmplName(e.target.value)} placeholder="Nombre de la plantilla"
                    className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white" />
                  <Button variant="primary" size="sm" onClick={handleSaveTemplate}>Guardar</Button>
                  <Button variant="ghost" size="sm" onClick={() => { setShowTmplInput(false); setTmplName(''); }}>✕</Button>
                </div>
              )}
            </div>
          )}

          {sections.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-700 p-5 text-center text-sm text-neutral-500">
              Todavía no agregaste secciones. Empezá eligiendo una abajo.
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={sections.map((s) => s._localId)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1.5 max-h-[48vh] overflow-y-auto pr-1">
                  {sections.map((s, i) => {
                    const meta = sectionMeta(s.type);
                    const isAdor = s.type === 'adoracion';
                    const noteOn = notesShown.has(s._localId);
                    const dur = sectionDurationMin(s);
                    return (
                      <SortableRow key={s._localId} id={s._localId}>
                        {({ attributes, listeners }) => (
                          <div className="space-y-1.5">
                            {/* Fila principal: grip · nº · tipo · alias · nota · quitar */}
                            <div className="flex items-center gap-2">
                              <button type="button" aria-label="Mover" {...attributes} {...listeners}
                                className="cursor-grab active:cursor-grabbing text-neutral-600 hover:text-neutral-300 touch-none shrink-0">
                                <GripVertical size={15} />
                              </button>
                              <span className="text-[11px] text-neutral-600 tabular-nums shrink-0">{i + 1}.</span>
                              <Badge variant={isAdor ? 'gold' : 'primary'} size="sm">{meta.label}</Badge>
                              <input value={s.alias || ''} onChange={(e) => patch(s._localId, { alias: e.target.value })}
                                placeholder={meta.isCustom ? 'nombre…' : 'alias (opcional)'}
                                className="flex-1 min-w-0 bg-transparent border-0 border-b border-transparent focus:border-neutral-600 focus:outline-none text-sm text-white placeholder:text-neutral-600 px-1 py-0.5" />
                              <button type="button" onClick={() => toggleNote(s._localId)} aria-label="Observación"
                                className={`shrink-0 p-1 rounded ${noteOn ? 'text-gold-300' : 'text-neutral-600 hover:text-neutral-300'}`}>
                                <MessageSquarePlus size={15} />
                              </button>
                              <button type="button" onClick={() => remove(s._localId)} aria-label="Quitar" className="shrink-0 p-1 text-neutral-600 hover:text-red-400">
                                <X size={15} />
                              </button>
                            </div>

                            {/* Fila de tiempo: Duración / Horario (inline, sin combo) */}
                            <div className="flex items-center flex-wrap gap-1.5 pl-6">
                              <button type="button" onClick={() => toggleTime(s._localId, 'duration')}
                                className={`rounded-full px-2.5 py-0.5 text-[11px] border transition-colors ${s.timeMode === 'duration' ? 'bg-gold-500/20 border-gold-500/50 text-gold-200' : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:text-neutral-200'}`}>
                                Duración
                              </button>
                              <button type="button" onClick={() => toggleTime(s._localId, 'horario')}
                                className={`rounded-full px-2.5 py-0.5 text-[11px] border transition-colors ${s.timeMode === 'horario' ? 'bg-gold-500/20 border-gold-500/50 text-gold-200' : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:text-neutral-200'}`}>
                                Horario
                              </button>
                              {s.timeMode === 'duration' && (
                                <span className="inline-flex items-center gap-1">
                                  <input type="number" min="1" max="240" value={s.durationMin} onChange={(e) => patch(s._localId, { durationMin: e.target.value })}
                                    className="w-16 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-white" />
                                  <span className="text-[11px] text-neutral-500">min</span>
                                </span>
                              )}
                              {s.timeMode === 'horario' && (
                                <span className="inline-flex items-center gap-1">
                                  <input type="time" value={s.startTime} onChange={(e) => patch(s._localId, { startTime: e.target.value })}
                                    className="bg-neutral-900 border border-neutral-700 rounded px-1.5 py-1 text-xs text-white" />
                                  <span className="text-[11px] text-neutral-500">a</span>
                                  <input type="time" value={s.endTime} onChange={(e) => patch(s._localId, { endTime: e.target.value })}
                                    className="bg-neutral-900 border border-neutral-700 rounded px-1.5 py-1 text-xs text-white" />
                                  {dur != null && <span className="text-[11px] text-gold-300/70">· {dur} min</span>}
                                </span>
                              )}
                            </div>

                            {/* Observación (bajo demanda) */}
                            {noteOn && (
                              <div className="pl-6">
                                <input value={s.note || ''} onChange={(e) => patch(s._localId, { note: e.target.value })}
                                  placeholder="Observación / frase para la pantalla…" autoFocus
                                  className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-sm text-white" />
                              </div>
                            )}

                            {/* Adoración: canciones del orden (solo modo esquema) */}
                            {isAdor && !isTemplateMode && (
                              <div className="ml-6 rounded-lg border border-gold-500/20 bg-gold-500/[0.04] p-2">
                                <p className="text-[11px] text-gold-300/80 mb-1 flex items-center gap-1"><Music2 size={11} /> Canciones en este momento</p>
                                {orderSongs.length === 0 ? (
                                  <p className="text-xs text-neutral-500">Este orden no tiene canciones.</p>
                                ) : (
                                  <div className="flex flex-wrap gap-1">
                                    {orderSongs.map((os) => {
                                      const on = (s.songIds || []).includes(os.songId);
                                      return (
                                        <button key={os.songId} type="button" onClick={() => toggleSong(s._localId, os.songId)}
                                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] border transition-colors ${on ? 'bg-gold-500/20 border-gold-500/50 text-gold-200' : 'bg-neutral-900 border-neutral-700 text-neutral-300 hover:border-neutral-600'}`}>
                                          {on && <Check size={11} />}{os.title}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </SortableRow>
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}

          <SelectMenu value="" onChange={addSection} placeholder="+ Agregar sección…"
            options={SCHEMA_SECTION_TYPES.map((t) => ({ value: t.id, label: t.label }))} />
        </div>
      </Modal>

      <SuccessModal isOpen={success.isOpen} onClose={() => setSuccess({ ...success, isOpen: false })} title={success.title} message={success.message} />
      <ErrorModal isOpen={error.isOpen} onClose={() => setError({ ...error, isOpen: false })} title={error.title} message={error.message} />
    </>
  );
};
