import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Avatar } from '../ui/Avatar';
import { Key, Edit, Trash2, Mail, Phone, Cross, Users2, Calendar, Clock, Smartphone, Bell, BellOff, Check, X } from 'lucide-react';
import { areaLabels } from '../../lib/areas';
import { formatDateLocalShort as formatDateLocal } from '../../lib/dates';

// Tarjeta de un miembro en la grilla de /miembros (extraída VERBATIM de Miembros.jsx
// sin cambios de comportamiento). `ctx` trae los helpers de rol/actividad, el flag
// isPastor y los handlers que viven en el componente Miembros; el cuerpo JSX es
// byte-idéntico al original. areaLabels y formatDateLocal se importan directo (ya
// eran imports de librería en Miembros).
export function MemberCard({ member, ctx }) {
  const {
    roleConfig, fmtLastSeen, activityMap, isPastor,
    handleResetPassword, handleOpenModal, handlePermanentlyDelete, handleToggleActive,
  } = ctx;

  return (
            <Card
              key={member.id}
              className={`group transition-all ${
                !member.active ? 'opacity-60 border-dashed' : ''
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Avatar name={member.name} size="lg" src={member.avatar_url || member.avatarUrl} />
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{member.name}</h3>
                      {!member.active && (
                        <Badge variant="danger" size="sm">Inactivo</Badge>
                      )}
                    </div>
                    <span className={`text-xs font-medium ${roleConfig[member.role]?.color}`}>
                      {roleConfig[member.role]?.label}
                    </span>
                  </div>
                </div>

                {isPastor && (
                  <div className="flex items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleResetPassword(member)}
                      className="p-2 rounded-lg hover:bg-neutral-800 transition-colors"
                      title="Restablecer contraseña"
                    >
                      <Key size={16} className="text-gold-300" />
                    </button>
                    <button
                      onClick={() => handleOpenModal(member)}
                      className="p-2 rounded-lg hover:bg-neutral-800 transition-colors"
                      title="Editar"
                    >
                      <Edit size={16} className="text-gray-400" />
                    </button>
                    <button
                      onClick={() => handlePermanentlyDelete(member.id, member.name)}
                      className="p-2 rounded-lg hover:bg-neutral-800 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 size={16} className="text-gray-400 hover:text-red-400" />
                    </button>
                  </div>
                )}
              </div>

              {/* Personal contact + private fields: pastors only. Leaders &
                  members never see email/phone/pastor-area/leader-of/birthdate
                  on the listing — they get just name, role and instruments. */}
              {isPastor && (
                <div className="space-y-2 text-sm">
                  {member.email && (
                    <div className="flex items-center gap-2 text-gray-400">
                      <Mail size={14} />
                      <span className="truncate">{member.email}</span>
                    </div>
                  )}
                  {member.phone && (
                    <div className="flex items-center gap-2 text-gray-400">
                      <Phone size={14} />
                      <span>{member.phone}</span>
                    </div>
                  )}
                  {member.pastor_area && (
                    <div className="flex items-center gap-2 text-gray-400">
                      <Cross size={14} />
                      <span>{member.pastor_area}</span>
                    </div>
                  )}
                  {member.leader_of && (
                    <div className="flex items-center gap-2 text-gray-400">
                      <Users2 size={14} />
                      <span>{member.leader_of}</span>
                    </div>
                  )}
                  {member.birthdate && (
                    <div className="flex items-center gap-2 text-gray-400">
                      <Calendar size={14} />
                      <span>{formatDateLocal(member.birthdate)}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-1.5 mt-3">
                {member.instruments?.map((inst) => (
                  <span
                    key={inst}
                    className="px-2 py-0.5 bg-neutral-800 rounded text-xs text-gray-300"
                  >
                    {inst}
                  </span>
                ))}
              </div>

              {areaLabels(member).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {areaLabels(member).map((label) => (
                    <span
                      key={label}
                      className="px-2 py-0.5 rounded text-xs bg-gold-500/10 text-gold-200 border border-gold-500/30"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              )}

              {/* Actividad (solo pastor): última conexión + app instalada + notificaciones */}
              {isPastor && (() => {
                const act = activityMap[member.id];
                const seen = fmtLastSeen(act?.lastSeenAt);
                const inactivo = seen && seen.days >= 14; // resaltar ≥ 2 semanas sin conectarse
                return (
                  <div className="mt-4 pt-3 border-t border-neutral-800/60 flex items-center justify-between gap-2 text-xs">
                    <span className="flex min-w-0 items-center gap-1.5 text-gray-400" title="Última vez que abrió la app">
                      <Clock size={13} className="shrink-0 text-gray-500" />
                      {seen ? (
                        <span className="truncate">
                          {seen.fecha}
                          <span className={`ml-1 ${inactivo ? 'text-amber-400' : 'text-gray-500'}`}>· {seen.rel}</span>
                        </span>
                      ) : (
                        <span className="text-gray-600">Sin registro aún</span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-2.5">
                      <span title={act?.appInstalledAt ? 'App instalada en el celular' : 'App no instalada'}>
                        <Smartphone size={15} className={act?.appInstalledAt ? 'text-gold-300' : 'text-gray-600'} />
                      </span>
                      <span title={act?.notificationsOn ? 'Notificaciones activadas' : 'Notificaciones desactivadas'}>
                        {act?.notificationsOn
                          ? <Bell size={15} className="text-gold-300" />
                          : <BellOff size={15} className="text-gray-600" />}
                      </span>
                    </span>
                  </div>
                );
              })()}

              {isPastor && (
                <div className="mt-4 pt-4 border-t border-neutral-800">
                  <button
                    onClick={() => handleToggleActive(member.id)}
                    className={`text-xs flex items-center gap-1.5 transition-colors ${
                      member.active ? 'text-green-400 hover:text-green-300' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {member.active ? (
                      <>
                        <Check size={14} />
                        Activo - Click para desactivar
                      </>
                    ) : (
                      <>
                        <X size={14} />
                        Inactivo - Click para activar
                      </>
                    )}
                  </button>
                </div>
              )}
            </Card>
  );
}
