import React, { useState } from 'react';
import { Plus, Trash2, ListChecks } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { ConfirmModal, ErrorModal } from '../ui/ConfirmModal';
import { SchemaBuilderModal } from './SchemaBuilderModal';

// Gestor de plantillas de esquema — INDEPENDIENTE de cualquier orden. Solo pastor.
// Lista/borra plantillas y abre el armador en modo plantilla para crear una nueva.
export const TemplateManagerModal = ({ isOpen, onClose }) => {
  const schemaTemplates = useAppStore((s) => s.schemaTemplates);
  const deleteSchemaTemplate = useAppStore((s) => s.deleteSchemaTemplate);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [confirm, setConfirm] = useState({ isOpen: false, id: null, name: '' });
  const [error, setError] = useState({ isOpen: false, title: '', message: '' });

  const handleDelete = async () => {
    const res = await deleteSchemaTemplate(confirm.id);
    setConfirm({ isOpen: false, id: null, name: '' });
    if (!res?.ok) setError({ isOpen: true, title: 'No se pudo quitar', message: res?.error || 'Intentá de nuevo.' });
  };

  return (
    <>
      <Modal isOpen={isOpen && !builderOpen} onClose={onClose} title="Plantillas de esquema" size="md"
        footer={(
          <div className="flex justify-end">
            <Button variant="primary" size="sm" icon={Plus} onClick={() => setBuilderOpen(true)}>Crear plantilla</Button>
          </div>
        )}>
        <div className="space-y-2">
          <p className="text-sm text-neutral-400">Armá plantillas reutilizables. Después las importás en el esquema de cualquier orden.</p>
          {(schemaTemplates || []).length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-700 p-5 text-center text-sm text-neutral-500">
              Todavía no hay plantillas. Creá la primera.
            </div>
          ) : (
            <div className="space-y-1.5">
              {schemaTemplates.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 bg-neutral-800/60 border border-neutral-700 rounded-lg px-3 py-2">
                  <div className="min-w-0 flex items-center gap-2">
                    <ListChecks size={16} className="text-gold-300/70 shrink-0" />
                    <span className="text-sm text-white truncate">{t.name}</span>
                    <span className="text-xs text-neutral-500 shrink-0">· {(t.sections || []).length} secciones</span>
                  </div>
                  <button onClick={() => setConfirm({ isOpen: true, id: t.id, name: t.name })} aria-label="Quitar" className="shrink-0 text-neutral-500 hover:text-red-400 p-1">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      <SchemaBuilderModal mode="template" isOpen={builderOpen} onClose={() => setBuilderOpen(false)} />

      <ConfirmModal isOpen={confirm.isOpen} onClose={() => setConfirm({ isOpen: false, id: null, name: '' })}
        onConfirm={handleDelete} type="danger" confirmText="Quitar"
        title="Quitar plantilla" message={`¿Quitar la plantilla "${confirm.name}"? Los esquemas ya creados no se tocan.`} />
      <ErrorModal isOpen={error.isOpen} onClose={() => setError({ ...error, isOpen: false })} title={error.title} message={error.message} />
    </>
  );
};
