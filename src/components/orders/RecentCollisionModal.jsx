import React from 'react';
import { CalendarClock } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { collisionWhenLabel } from '../../lib/songUsage';

// Aviso NO bloqueante de "choque" de agenda al armar un orden: la canción elegida
// YA está en un orden muy cercano (±4 días) de alguna banda. Cuida la relación
// entre líderes (que no se pisen sin querer al no mirar los órdenes ya publicados).
// Cartel ÁMBAR destacado. Dos salidas: elegir otra (recomendado) o agregarla igual.
// Cerrar = no hacer nada. Cada choque muestra QUÉ banda la tiene y CUÁNDO.
export function RecentCollisionModal({ isOpen, song, collisions = [], onKeep, onDismiss, onClose }) {
  const title = song?.title || 'Esta canción';
  const list = collisions.slice(0, 5);
  const extra = collisions.length - list.length;
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="¿La repetimos esta semana?" size="md"
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 w-full">
          <Button variant="secondary" onClick={onKeep} className="w-full sm:w-auto">
            Agregarla igual
          </Button>
          <Button variant="warning" onClick={onDismiss} className="w-full sm:w-auto">
            Elijo otra
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-amber-500/15 ring-1 ring-amber-500/40 rounded-full flex items-center justify-center">
            <CalendarClock size={30} className="text-amber-300" />
          </div>
        </div>
        <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/5">
          <p className="text-gray-200 text-center">
            <strong className="text-amber-200">«{title}»</strong> ya está en el orden de estos días:
          </p>
          <ul className="mt-3 space-y-1.5">
            {list.map((c) => (
              <li key={c.orderId} className="flex items-center justify-center gap-2 text-sm">
                <span className="text-gold-200 font-medium">{c.bandName || 'Otra banda'}</span>
                <span className="text-gray-500">·</span>
                <span className="text-amber-200">{collisionWhenLabel(c.dayDiff)}</span>
              </li>
            ))}
            {extra > 0 && (
              <li className="text-center text-xs text-gray-400">
                y en {extra} orden{extra === 1 ? '' : 'es'} más
              </li>
            )}
          </ul>
        </div>
        <p className="text-gray-400 text-sm text-center">
          Te recomendamos elegir otra para no repetir una canción que ya está en el
          calendario de estos días. Igual, la decisión es tuya.
        </p>
      </div>
    </Modal>
  );
}
