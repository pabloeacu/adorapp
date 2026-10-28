import React from 'react';
import { Repeat, Search } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

// Aviso NO bloqueante de repetición al armar un orden: cuando el líder elige una
// canción muy usada (más de 5 veces en los últimos `days` días en toda la iglesia),
// se le ofrece reevaluar. Dos salidas: agregarla igual (la decisión es suya) o
// abrir el navegador de canciones sin usar para buscar otra. Cerrar = no hacer nada.
export function OveruseWarningModal({ isOpen, song, uses, days = 120, onKeep, onBrowse, onClose }) {
  const title = song?.title || 'Esta canción';
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="¿La repetimos?" size="md"
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 w-full">
          <Button variant="secondary" onClick={onKeep} className="w-full sm:w-auto">
            Agregarla igual
          </Button>
          <Button onClick={onBrowse} className="w-full sm:w-auto">
            <span className="inline-flex items-center gap-2"><Search size={16} /> Ver canciones sin usar</span>
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-gold-500/15 ring-1 ring-gold-500/30 rounded-full flex items-center justify-center">
            <Repeat size={30} className="text-gold-300" />
          </div>
        </div>
        <div className="text-center p-4 rounded-xl border border-gold-500/25 bg-neutral-800/30">
          <p className="text-gray-200">
            <strong className="text-gold-200">«{title}»</strong> ya sonó{' '}
            <strong className="text-gold-200">{uses} {uses === 1 ? 'vez' : 'veces'}</strong>{' '}
            en los últimos {days} días en los distintos servicios.
          </p>
          <p className="text-gray-400 text-sm mt-2">
            Repetirla está perfecto si es a propósito. Si no, quizás quieras darle lugar
            a otra y mantener el repertorio fresco.
          </p>
        </div>
      </div>
    </Modal>
  );
}
