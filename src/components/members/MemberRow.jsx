import { Avatar } from '../ui/Avatar';
import { Check, X, Edit, Trash2 } from 'lucide-react';
import { areaLabels } from '../../lib/areas';

// Fila de la vista de TABLA de /miembros (extraída VERBATIM de Miembros.jsx sin
// cambios de comportamiento). `ctx` trae roleConfig, el flag isPastor y los handlers
// de este componente; el cuerpo JSX es byte-idéntico. areaLabels se importa directo.
export function MemberRow({ member, ctx }) {
  const { roleConfig, isPastor, handleToggleActive, handleOpenModal, handleDelete } = ctx;

  return (
                  <tr
                    key={member.id}
                    className={`border-b border-neutral-800/50 hover:bg-neutral-800/30 transition-colors ${
                      !member.active ? 'opacity-60' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={member.name} size="sm" src={member.avatar_url || member.avatarUrl} />
                        <span className="font-medium">{member.name}</span>
                      </div>
                    </td>
                    {isPastor && (
                      <>
                        <td className="px-4 py-3 text-sm text-gray-400">{member.email || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-400">{member.phone || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-400 hidden md:table-cell">{member.pastor_area || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-400 hidden md:table-cell">{member.leader_of || '-'}</td>
                      </>
                    )}
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${roleConfig[member.role]?.color}`}>
                        {roleConfig[member.role]?.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {member.instruments?.slice(0, 2).map((inst) => (
                          <span key={inst} className="px-2 py-0.5 bg-neutral-800 rounded text-xs">
                            {inst}
                          </span>
                        ))}
                        {member.instruments?.length > 2 && (
                          <span className="px-2 py-0.5 bg-neutral-800 rounded text-xs text-gray-400">
                            +{member.instruments.length - 2}
                          </span>
                        )}
                        {areaLabels(member, { includeAdoracion: false }).map((label) => (
                          <span key={label} className="px-2 py-0.5 rounded text-xs bg-gold-500/10 text-gold-200 border border-gold-500/30">
                            {label}
                          </span>
                        ))}
                      </div>
                    </td>
                    {isPastor && (
                      <td className="px-4 py-3">
                        {member.active ? (
                          <span className="flex items-center gap-1 text-xs text-green-400">
                            <Check size={12} /> Activo
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <X size={12} /> Inactivo
                          </span>
                        )}
                      </td>
                    )}
                    {isPastor && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleToggleActive(member.id)}
                            className={`p-1.5 rounded hover:bg-neutral-800 transition-colors ${
                              member.active ? 'text-green-400' : 'text-gray-400'
                            }`}
                            title={member.active ? 'Desactivar' : 'Activar'}
                          >
                            {member.active ? <Check size={14} /> : <X size={14} />}
                          </button>
                          <button
                            onClick={() => handleOpenModal(member)}
                            className="p-1.5 rounded hover:bg-neutral-800 transition-colors text-gray-400"
                            title="Editar"
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(member.id, member.name)}
                            className="p-1.5 rounded hover:bg-neutral-800 transition-colors text-gray-400 hover:text-red-400"
                            title="Desactivar"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
  );
}
