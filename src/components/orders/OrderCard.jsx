import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Music, Clock, Copy, MessageSquare, Eye, Trash2, FileText, Printer, Edit, Link2 } from 'lucide-react';
import { CalendarDots, UsersThree } from '@phosphor-icons/react';

// Tarjeta de un orden en la lista de Órdenes (extraída VERBATIM de Ordenes.jsx sin
// cambios de comportamiento). `ctx` trae los helpers, flags de rol y handlers que
// vivían en el componente Ordenes; el cuerpo JSX es byte-idéntico al original.
export function OrderCard({ order, ctx }) {
  const {
    getBandById, getSongById, getOrderParticipants,
    statusConfig, formatDate, isCustomLineup, numberOrderSongs,
    isPastor, isLeader,
    handleViewOrder, runPdfExport, generateOrderPDF, generateSongsPDF,
    handleOpenModal, handleCloneOrder, handleDeleteOrder,
  } = ctx;
  const band = getBandById(order.bandId);

  return (
            <Card key={order.id} className="hover:border-neutral-700 transition-all">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
                    order.status === 'completed' ? 'bg-green-500/20' :
                    order.status === 'cancelled' ? 'bg-red-500/20' :
                    'bg-gold-gradient-soft ring-1 ring-gold-500/40'
                  }`}>
                    <CalendarDots size={26} weight="duotone" className={
                      order.status === 'completed' ? 'text-green-400' :
                      order.status === 'cancelled' ? 'text-red-400' :
                      'text-gold-100'
                    } />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={statusConfig[order.status]?.bg}>
                        <span className={statusConfig[order.status]?.color}>
                          {statusConfig[order.status]?.label}
                        </span>
                      </Badge>
                      <Badge variant="primary">{band?.name || 'Banda eliminada'}</Badge>
                    </div>
                    <h3 className="text-lg font-semibold">{formatDate(order.date)}</h3>
                    {/* En el celu se abrevia a ícono + número (evita que "canciones"
                        y "en la formación" se corten en dos líneas); en compu se
                        muestran las palabras. El title da el tooltip en escritorio. */}
                    <div className="flex items-center gap-3 text-sm text-gray-400 mt-1">
                      <span className="flex items-center gap-1">
                        <Clock size={14} /> {order.time}
                      </span>
                      <span className="flex items-center gap-1 tabular-nums" title={`${order.songs.length} ${order.songs.length === 1 ? 'canción' : 'canciones'}`}>
                        <Music size={14} /> {order.songs.length}<span className="hidden md:inline">&nbsp;{order.songs.length === 1 ? 'canción' : 'canciones'}</span>
                      </span>
                      {isCustomLineup(order) && (
                        <span className="flex items-center gap-1 text-gold-300 tabular-nums" data-testid="card-lineup-pill" title={`${getOrderParticipants(order).length} en la formación`}>
                          <UsersThree size={14} weight="duotone" /> {getOrderParticipants(order).length}<span className="hidden md:inline">&nbsp;en la formación</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* flex-wrap so every action (incl. Imprimir = canciones con
                    acordes) stays reachable on mobile; the row used to overflow
                    the card off-screen to the right and hide Imprimir/Repetir. */}
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="ghost" size="sm" icon={Eye} onClick={() => handleViewOrder(order)}>
                    Ver
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={FileText}
                    onClick={() => runPdfExport(generateOrderPDF(order))}
                    title="Exportar orden de servicio (resumen sin acordes)"
                  >
                    Exportar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Printer}
                    onClick={() => runPdfExport(generateSongsPDF(order))}
                    title="Imprimir canciones con acordes (una canción por página)"
                  >
                    Imprimir
                  </Button>
                  {(isPastor || isLeader) && (
                    <Button variant="ghost" size="sm" icon={Edit} onClick={() => handleOpenModal(order)}>
                      Editar
                    </Button>
                  )}
                  {(isPastor || isLeader) && (
                    <Button variant="ghost" size="sm" icon={Copy} onClick={() => handleCloneOrder(order)}>
                      Repetir
                    </Button>
                  )}
                  {(isPastor || isLeader) && (
                    <Button variant="ghost" size="sm" icon={Trash2} onClick={() => handleDeleteOrder(order)}>
                      Eliminar
                    </Button>
                  )}
                </div>
              </div>

              {/* Songs Preview */}
              <div className="border-t border-neutral-800 pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <Music size={16} className="text-gray-400" />
                  <span className="text-sm font-medium">Repertorio</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {/* Se itera order.songs directo (numerado) — NO el songDetails filtrado —
                      para que el número y el tono queden alineados aunque falte una canción
                      en el store (antes se desalineaban). */}
                  {numberOrderSongs(order.songs).slice(0, 5).map((meta, index) => {
                    const song = getSongById(meta.songRef.songId);
                    return (
                      <div
                        key={`${meta.songRef.songId}-${index}`}
                        className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800/50 rounded-lg"
                      >
                        <span className="h-5 min-w-5 px-1 rounded-full bg-neutral-700 flex items-center justify-center text-xs">
                          {meta.displayNumber}
                        </span>
                        <span className="text-sm">{song?.title || 'Canción'}</span>
                        {meta.hasLinkedBelow && <Link2 size={12} className="text-gold-400" aria-label="enganchada debajo" />}
                        <Badge size="sm" variant="primary">{meta.songRef.key}</Badge>
                      </div>
                    );
                  })}
                  {order.songs.length > 5 && (
                    <div className="px-3 py-1.5 bg-neutral-800/50 rounded-lg text-sm text-gray-400">
                      +{order.songs.length - 5} más
                    </div>
                  )}
                </div>
              </div>

              {/* Feedback for Pastors */}
              {isPastor && order.feedback && (
                <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                  <div className="flex items-center gap-2 text-yellow-400 text-sm mb-1">
                    <MessageSquare size={14} />
                    Devolución del Pastor
                  </div>
                  <p className="text-gray-300 text-sm">{order.feedback}</p>
                </div>
              )}
            </Card>
  );
}
