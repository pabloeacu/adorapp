import React, { useState, useMemo, useEffect } from 'react';
import {
  Plus, Calendar, Music, Download, Clock, ChevronRight, Copy,
  MessageSquare, Eye, Edit, Trash2, Filter, Search, Check, X,
  User, Zap, AlertCircle, ChevronDown, FileDown, History, Award,
  FileText, Printer
} from 'lucide-react';
import { useAppStore, MEETING_TYPES, MUSICAL_KEYS, transposeSongStructure } from '../stores/appStore';
import { useAuthStore } from '../stores/authStore';
import { supabase } from '../lib/supabase';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';

const dayLabels = {
  domingo: 'Domingo', lunes: 'Lunes', martes: 'Martes',
  miercoles: 'Miércoles', jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado'
};

const statusConfig = {
  scheduled: { label: 'Programado', color: 'text-blue-400', bg: 'bg-blue-500/20' },
  completed: { label: 'Completado', color: 'text-green-400', bg: 'bg-green-500/20' },
  cancelled: { label: 'Cancelado', color: 'text-red-400', bg: 'bg-red-500/20' },
};

export const Ordenes = () => {
  const { orders, bands, songs, members, addOrder, updateOrder, deleteOrder, cloneOrder, getUnusedByBand, getSongById, getBandById, getMemberById } = useAppStore();
  const { profile } = useAuthStore();
  const isPastor = profile?.role === 'pastor';
  const isLeader = profile?.role === 'leader';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [viewingOrder, setViewingOrder] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterBand, setFilterBand] = useState('all');
  const [showUnused, setShowUnused] = useState(false);
  const [selectedBandForUnused, setSelectedBandForUnused] = useState(null);
  const [songSearchTerm, setSongSearchTerm] = useState('');
  const [showSongDropdown, setShowSongDropdown] = useState(false);
  const [songDropdownPosition, setSongDropdownPosition] = useState('bottom');

  // Key history feature
  const [keyHistoryLoading, setKeyHistoryLoading] = useState(false);
  const [keyHistoryTooltip, setKeyHistoryTooltip] = useState(null);

  // Members who can be directors (only active members with "Voz" instrument)
  const singers = useMemo(() => {
    return members.filter(m => m.active && m.instruments?.includes('Voz'));
  }, [members]);

  const [formData, setFormData] = useState({
    date: '',
    time: '20:00',
    bandId: null,
    meetingType: 'culto_general',
    songs: [],
    feedback: ''
  });

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchesStatus = filterStatus === 'all' || order.status === filterStatus;
      const matchesBand = filterBand === 'all' || order.bandId === filterBand;
      return matchesStatus && matchesBand;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [orders, filterStatus, filterBand]);

  const unusedSongs = selectedBandForUnused ? getUnusedByBand(selectedBandForUnused, 4) : [];

  // Filtered songs for dropdown search
  const filteredSongsForDropdown = useMemo(() => {
    if (!songSearchTerm.trim()) return songs.slice(0, 10);
    const search = songSearchTerm.toLowerCase();
    return songs.filter(song =>
      song.title.toLowerCase().includes(search) ||
      song.artist.toLowerCase().includes(search) ||
      song.key.toLowerCase().includes(search)
    ).slice(0, 15);
  }, [songs, songSearchTerm]);

  const handleOpenModal = () => {
    setFormData({
      date: '',
      time: '20:00',
      bandId: null,
      meetingType: 'culto_general',
      songs: [],
      feedback: ''
    });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setShowUnused(false);
    setSelectedBandForUnused(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.date || !formData.bandId) return;

    // Save key history for all songs with directors
    const orderId = crypto.randomUUID(); // Generate ID for history tracking

    // Save key history for each song with a director
    await Promise.all(
      formData.songs
        .filter(s => s.directorId)
        .map(s => saveKeyHistory(s.directorId, s.songId, s.key, orderId))
    );

    addOrder(formData);
    handleCloseModal();
  };

  const handleViewOrder = (order) => {
    setViewingOrder(order);
    setIsDetailOpen(true);
  };

  const handleCloneOrder = (orderId) => {
    if (window.confirm('¿Deseas duplicar esta orden?')) {
      cloneOrder(orderId);
    }
  };

  const handleDeleteOrder = (orderId) => {
    if (window.confirm('¿Estás seguro de eliminar esta orden?')) {
      deleteOrder(orderId);
    }
  };

  const handleUpdateFeedback = (orderId, feedback) => {
    updateOrder(orderId, { feedback });
  };

  // Export order summary (without chords)
  const generateOrderPDF = (order) => {
    const band = getBandById(order.bandId);
    const printWindow = window.open('', '_blank');

    const songsHtml = order.songs.map((songRef, index) => {
      const song = getSongById(songRef.songId);
      const director = getMemberById(songRef.directorId);
      const originalKey = song?.originalKey || song?.key || songRef.key;
      const key = songRef.key || originalKey;

      return `
        <tr>
          <td style="padding:12px;border-bottom:1px solid #333;text-align:center">${index + 1}</td>
          <td style="padding:12px;border-bottom:1px solid #333">
            <strong>${song?.title || 'Sin título'}</strong>
            <div style="color:#888;font-size:12px">${song?.artist || ''}</div>
          </td>
          <td style="padding:12px;border-bottom:1px solid #333;text-align:center">
            <span style="background:#333;border:1px solid #555;color:#a855f7;padding:6px 12px;border-radius:6px;font-weight:bold">${key}</span>
          </td>
          <td style="padding:12px;border-bottom:1px solid #333">${director?.name || '-'}</td>
        </tr>
      `;
    }).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Orden de Servicio - ${formatDate(order.date)} - AdorAPP</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; background: #1a1a1a; color: #fff; padding: 30px; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
          .header h1 { font-size: 24px; margin-bottom: 8px; color: #a855f7; }
          .header .date { font-size: 18px; color: #ccc; }
          .meta { display: flex; justify-content: center; gap: 15px; margin-top: 15px; flex-wrap: wrap; }
          .meta span { background: #333; padding: 6px 14px; border-radius: 20px; font-size: 13px; }
          table { width: 100%; border-collapse: collapse; margin-top: 25px; }
          th { background: #252525; padding: 12px; text-align: left; font-size: 12px; color: #888; text-transform: uppercase; }
          td { vertical-align: middle; }
          .footer { text-align: center; margin-top: 40px; color: #555; font-size: 11px; }
          .feedback-box { margin-top: 20px; background: #252525; padding: 15px; border-radius: 10px; }
          .feedback-box h3 { color: #f59e0b; font-size: 14px; margin-bottom: 8px; }
          @media print { body { background: #fff; color: #000; } th { background: #eee; color: #333; } td { border-bottom: 1px solid #ddd; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Orden de Servicio</h1>
          <div class="date">${formatDate(order.date)} - ${order.time}</div>
          <div class="meta">
            <span>${band?.name || 'Banda'}</span>
            <span>${getMeetingTypeLabel(order.meetingType)}</span>
            <span>${order.songs.length} canciones</span>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width:50px;text-align:center">#</th>
              <th>Canción</th>
              <th style="width:100px;text-align:center">Tono</th>
              <th style="width:150px">Director</th>
            </tr>
          </thead>
          <tbody>
            ${songsHtml}
          </tbody>
        </table>

        ${order.feedback ? `
          <div class="feedback-box">
            <h3>Devolución del Pastor</h3>
            <p style="color:#ccc;font-size:14px">${order.feedback}</p>
          </div>
        ` : ''}

        <div class="footer">
          Generado por AdorAPP - La plataforma de Adoración CAF
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.print();
  };

  // Print all songs with full content (one song per page with page break)
  const generateSongsPDF = (order) => {
    const band = getBandById(order.bandId);

    const songsHtml = order.songs.map((songRef, index) => {
      const song = getSongById(songRef.songId);
      const director = getMemberById(songRef.directorId);
      const originalKey = song?.originalKey || song?.key || 'C';
      const key = songRef.key || originalKey;

      // Transpose structure if needed
      let structure = song?.structure || [];
      if (song?.structure && key !== originalKey) {
        structure = transposeSongStructure(song.structure, originalKey, key);
      }

      // Build chords display
      const chordsHtml = structure.map((section, sIdx) => `
        <div style="margin-bottom:16px">
          <div style="color:#a855f7;font-weight:bold;font-size:12px;text-transform:uppercase;margin-bottom:8px">${section.label || 'Sección'}</div>
          <div style="font-family:monospace;font-size:14px;line-height:1.8;white-space:pre-wrap">${section.chords || ''}</div>
        </div>
      `).join('');

      return `
        <div class="song-page">
          <div class="song-header">
            <div class="song-number">#${index + 1}</div>
            <div class="song-meta">
              <div class="meta-item"><span class="meta-label">Orden:</span> ${formatDate(order.date)}</div>
              <div class="meta-item"><span class="meta-label">Banda:</span> ${band?.name || 'N/A'}</div>
              <div class="meta-item"><span class="meta-label">Director:</span> ${director?.name || '-'}</div>
              <div class="meta-item"><span class="meta-label">Tonalidad:</span> <span class="key-badge">${key}</span></div>
            </div>
          </div>
          <h1 class="song-title">${song?.title || 'Sin título'}</h1>
          ${song?.artist ? `<p class="song-artist">${song.artist}</p>` : ''}
          <div class="song-content">
            ${chordsHtml || '<p style="color:#888">Sin acordes disponibles</p>'}
          </div>
        </div>
      `;
    }).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Canciones - Orden ${formatDate(order.date)} - AdorAPP</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; background: #1a1a1a; color: #fff; }
          .song-page {
            min-height: 100vh;
            padding: 40px;
            page-break-after: always;
            display: flex;
            flex-direction: column;
          }
          .song-page:last-child { page-break-after: auto; }
          .song-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 2px solid #333;
          }
          .song-number {
            font-size: 48px;
            font-weight: bold;
            color: #a855f7;
            line-height: 1;
          }
          .song-meta {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            justify-content: flex-end;
          }
          .meta-item {
            background: #252525;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 13px;
          }
          .meta-label {
            color: #888;
            margin-right: 6px;
          }
          .key-badge {
            background: #a855f7;
            color: white;
            padding: 2px 8px;
            border-radius: 4px;
            font-weight: bold;
          }
          .song-title {
            font-size: 32px;
            margin-bottom: 8px;
          }
          .song-artist {
            color: #888;
            font-size: 16px;
            margin-bottom: 30px;
          }
          .song-content {
            flex: 1;
            background: #1f1f1f;
            padding: 25px;
            border-radius: 12px;
          }
          @media print {
            body { background: #fff; color: #000; }
            .song-page { min-height: 100vh; page-break-after: always; }
            .song-number { color: #7c3aed; }
            .key-badge { background: #7c3aed; color: white; }
            .meta-item { background: #f3f4f6; }
            .song-content { background: #fafafa; }
          }
          @page { margin: 0; }
        </style>
      </head>
      <body>
        ${songsHtml}
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.print();
  };

  const addSongToOrder = async (song) => {
    // Start with the original key of the song
    let defaultKey = song.key || song.originalKey || 'C';

    // Try to find key history for no director (fallback to original key)
    // The actual key history will be fetched when a director is selected
    setFormData(prev => ({
      ...prev,
      songs: [...prev.songs, {
        songId: song.id,
        directorId: null,
        key: defaultKey,
        _pendingHistory: true // Flag to indicate we should check history when director is set
      }]
    }));
    setShowUnused(false);
  };

  // Handle director change - fetch key history and update
  const handleDirectorChange = (index, directorId, songId) => {
    // Update directorId immediately
    setFormData(prev => {
      const newSongs = prev.songs.map((s, i) =>
        i === index ? { ...s, directorId } : s
      );
      return { ...prev, songs: newSongs };
    });

    // Fetch key history asynchronously and update key/tooltip
    if (directorId && songId) {
      fetchKeyHistory(directorId, songId).then(result => {
        const song = getSongById(songId);

        if (result.found) {
          // Found history - use the saved key
          setFormData(prev => ({
            ...prev,
            songs: prev.songs.map((s, i) =>
              i === index ? { ...s, key: result.key } : s
            )
          }));
        } else {
          // First time - use original key from song
          const originalKey = song?.key || song?.originalKey || 'C';
          setFormData(prev => ({
            ...prev,
            songs: prev.songs.map((s, i) =>
              i === index ? { ...s, key: originalKey } : s
            )
          }));
        }
      });
    } else {
      // Director cleared - reset tooltip
      setKeyHistoryTooltip(null);
    }
  };

  // Handle key change - save to history when a song is saved
  const handleKeyChange = (index, newKey) => {
    updateSongInOrder(index, 'key', newKey);
  };

  const removeSongFromOrder = (index) => {
    setFormData(prev => ({
      ...prev,
      songs: prev.songs.filter((_, i) => i !== index)
    }));
    setKeyHistoryTooltip(null);
  };

  const updateSongInOrder = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      songs: prev.songs.map((s, i) =>
        i === index ? { ...s, [field]: value } : s
      )
    }));
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getMeetingTypeLabel = (typeId) => {
    const type = MEETING_TYPES.find(t => t.id === typeId);
    return type?.label || typeId;
  };

  // Fetch key history for a director-song combination from database
  const fetchKeyHistory = async (directorId, songId) => {
    if (!directorId || !songId) return { found: false, key: null };

    setKeyHistoryLoading(true);
    setKeyHistoryTooltip(null);

    try {
      // Query the song_key_history table
      const { data, error } = await supabase
        .from('song_key_history')
        .select('*')
        .eq('member_id', directorId)
        .eq('song_id', songId)
        .order('order_date', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error fetching key history:', error);
        setKeyHistoryLoading(false);
        return { found: false, key: null };
      }

      if (data) {
        // Get the order info for the tooltip
        const order = orders.find(o => o.id === data.order_id);
        const formattedDate = order
          ? new Date(order.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
          : 'fecha no disponible';

        setKeyHistoryTooltip({
          key: data.key,
          orderBand: order ? getBandById(order.bandId)?.name : '',
          orderDate: formattedDate,
          found: true,
          isFirstTime: false
        });
        setKeyHistoryLoading(false);
        return { found: true, key: data.key, date: formattedDate };
      }

      // No history found - it's the first time
      setKeyHistoryTooltip({
        found: false,
        isFirstTime: true,
        message: 'Esta es la primera vez que el director la va a cantar. Guardaremos el registro de su tonalidad.'
      });
      setKeyHistoryLoading(false);
      return { found: false, key: null };
    } catch (err) {
      console.error('Error in fetchKeyHistory:', err);
      setKeyHistoryLoading(false);
      return { found: false, key: null };
    }
  };

  // Save key selection to history
  const saveKeyHistory = async (directorId, songId, key, orderId) => {
    if (!directorId || !songId || !key) return;

    try {
      // Upsert: insert or update if exists
      const { error } = await supabase
        .from('song_key_history')
        .upsert({
          member_id: directorId,
          song_id: songId,
          key: key,
          order_id: orderId,
          order_date: new Date().toISOString().split('T')[0],
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'member_id,song_id'
        });

      if (error) {
        console.error('Error saving key history:', error);
      }
    } catch (err) {
      console.error('Error in saveKeyHistory:', err);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Órdenes de Servicio</h2>
          <p className="text-sm text-gray-400 mt-1">
            {orders.length} órdenes · {orders.filter(o => o.status === 'scheduled').length} programadas
          </p>
        </div>
        {(isPastor || isLeader) && (
          <Button icon={Plus} onClick={handleOpenModal}>
            Nueva Orden
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <select
          className="px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-xl"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="all">Todos los estados</option>
          <option value="scheduled">Programados</option>
          <option value="completed">Completados</option>
          <option value="cancelled">Cancelados</option>
        </select>
        <select
          className="px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-xl"
          value={filterBand}
          onChange={(e) => setFilterBand(e.target.value)}
        >
          <option value="all">Todas las bandas</option>
          {bands.map(band => (
            <option key={band.id} value={band.id}>{band.name}</option>
          ))}
        </select>
      </div>

      {/* Orders List */}
      <div className="space-y-4">
        {filteredOrders.map((order) => {
          const band = getBandById(order.bandId);
          const songDetails = order.songs.map(s => getSongById(s.songId)).filter(Boolean);

          return (
            <Card key={order.id} className="hover:border-neutral-700 transition-all">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
                    order.status === 'completed' ? 'bg-green-500/20' :
                    order.status === 'cancelled' ? 'bg-red-500/20' :
                    'bg-gradient-to-br from-blue-500 to-purple-500'
                  }`}>
                    <Calendar size={24} className={
                      order.status === 'completed' ? 'text-green-400' :
                      order.status === 'cancelled' ? 'text-red-400' :
                      'text-white'
                    } />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={statusConfig[order.status]?.bg}>
                        <span className={statusConfig[order.status]?.color}>
                          {statusConfig[order.status]?.label}
                        </span>
                      </Badge>
                      <Badge variant="primary">{band?.name}</Badge>
                    </div>
                    <h3 className="text-lg font-semibold">{formatDate(order.date)}</h3>
                    <div className="flex items-center gap-3 text-sm text-gray-400 mt-1">
                      <span className="flex items-center gap-1">
                        <Clock size={14} /> {order.time}
                      </span>
                      <span className="flex items-center gap-1">
                        <Music size={14} /> {order.songs.length} canciones
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" icon={Eye} onClick={() => handleViewOrder(order)}>
                    Ver
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={FileText}
                    onClick={() => generateOrderPDF(order)}
                    title="Exportar orden de servicio (resumen sin acordes)"
                  >
                    Exportar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Printer}
                    onClick={() => generateSongsPDF(order)}
                    title="Imprimir canciones con acordes (una canción por página)"
                  >
                    Imprimir
                  </Button>
                  {(isPastor || isLeader) && (
                    <Button variant="ghost" size="sm" icon={Copy} onClick={() => handleCloneOrder(order.id)}>
                      Repetir
                    </Button>
                  )}
                  {isPastor && (
                    <Button variant="ghost" size="sm" icon={Trash2} onClick={() => handleDeleteOrder(order.id)}>
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
                  {songDetails.slice(0, 5).map((song, index) => (
                    <div
                      key={song.id}
                      className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800/50 rounded-lg"
                    >
                      <span className="w-5 h-5 rounded-full bg-neutral-700 flex items-center justify-center text-xs">
                        {index + 1}
                      </span>
                      <span className="text-sm">{song.title}</span>
                      <Badge size="sm" variant="primary">{order.songs[index]?.key}</Badge>
                    </div>
                  ))}
                  {songDetails.length > 5 && (
                    <div className="px-3 py-1.5 bg-neutral-800/50 rounded-lg text-sm text-gray-400">
                      +{songDetails.length - 5} más
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
        })}
      </div>

      {filteredOrders.length === 0 && (
        <div className="text-center py-12">
          <Calendar size={48} className="mx-auto text-gray-600 mb-4" />
          <p className="text-gray-400">No hay órdenes {filterStatus !== 'all' ? 'con este filtro' : ''}</p>
          {(isPastor || isLeader) && (
            <Button variant="secondary" icon={Plus} onClick={handleOpenModal} className="mt-4">
              Crear primera orden
            </Button>
          )}
        </div>
      )}

      {/* Create Order Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title="Nueva Orden de Servicio"
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={handleCloseModal}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={!formData.date || !formData.bandId}>
              Crear Orden
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <Input
              label="Fecha"
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            />
            <Input
              label="Hora"
              type="time"
              value={formData.time}
              onChange={(e) => setFormData({ ...formData, time: e.target.value })}
            />
            <div>
              <label className="text-xs text-gray-400 font-medium uppercase tracking-wide block mb-1.5">
                Banda
              </label>
              <select
                className="w-full"
                value={formData.bandId || ''}
                onChange={(e) => {
                  const bandId = e.target.value || null;
                  const band = getBandById(bandId);
                  setFormData({
                    ...formData,
                    bandId,
                    meetingType: band?.meetingType || 'culto_general'
                  });
                  setSelectedBandForUnused(bandId);
                }}
              >
                <option value="">Seleccionar banda</option>
                {bands.map(band => (
                  <option key={band.id} value={band.id}>{band.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Add Songs Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                Canciones ({formData.songs.length})
              </label>
              <Button
                variant="ghost"
                size="sm"
                icon={Zap}
                onClick={() => setShowUnused(!showUnused)}
              >
                Sugerir sin usar
              </Button>
            </div>

            {/* Unused Songs Suggestion */}
            {showUnused && formData.bandId && (
              <div className="mb-4 p-4 bg-purple-500/10 border border-purple-500/30 rounded-xl">
                <div className="flex items-center gap-2 text-purple-400 text-sm mb-3">
                  <Zap size={14} />
                  Canciones sin usar en las últimas 4 semanas
                </div>
                <div className="flex flex-wrap gap-2">
                  {unusedSongs.slice(0, 6).map(song => (
                    <button
                      key={song.id}
                      onClick={() => addSongToOrder(song)}
                      className="flex items-center gap-2 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-sm transition-colors"
                    >
                      <Music size={14} />
                      {song.title}
                      <Badge size="sm" variant="primary">{song.key}</Badge>
                      <span className="text-green-400">+</span>
                    </button>
                  ))}
                  {unusedSongs.length === 0 && (
                    <p className="text-gray-400 text-sm">No hay canciones sin usar</p>
                  )}
                </div>
              </div>
            )}

            {/* All Songs */}
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {formData.songs.map((songRef, index) => {
                const song = getSongById(songRef.songId);
                return (
                  <div key={index} className="flex items-center gap-3 p-3 bg-neutral-800 rounded-xl">
                    <span className="w-6 h-6 rounded-full bg-neutral-700 flex items-center justify-center text-xs shrink-0">
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{song?.title}</p>
                      <p className="text-xs text-gray-400 truncate">{song?.artist}</p>
                    </div>
                    {/* Director selector - filtered to singers only */}
                    <select
                      className="bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-1.5 text-sm w-40 shrink-0"
                      value={songRef.directorId || ''}
                      onChange={(e) => {
                        const newDirectorId = e.target.value || null;
                        handleDirectorChange(index, newDirectorId, songRef.songId);
                      }}
                    >
                      <option value="">Director</option>
                      {singers.map(member => (
                        <option key={member.id} value={member.id}>{member.name}</option>
                      ))}
                    </select>
                    {/* Key selector with history lookup icon */}
                    <div className="relative flex items-center shrink-0">
                      <select
                        className="bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-1.5 text-sm w-20 text-center font-mono"
                        value={songRef.key}
                        onChange={(e) => handleKeyChange(index, e.target.value)}
                        title="Tonalidad"
                      >
                        {MUSICAL_KEYS.map(key => (
                          <option key={key} value={key}>{key}</option>
                        ))}
                      </select>
                      {songRef.directorId && (
                        <button
                          type="button"
                          onClick={() => fetchKeyHistory(songRef.directorId, songRef.songId)}
                          className={`ml-1 p-1 transition-colors ${keyHistoryLoading ? 'animate-spin' : ''} ${
                            keyHistoryTooltip?.found === true
                              ? 'text-green-400 hover:text-green-300'
                              : keyHistoryTooltip?.isFirstTime === true
                              ? 'text-yellow-400 hover:text-yellow-300'
                              : 'text-gray-400 hover:text-purple-400'
                          }`}
                          title={keyHistoryTooltip?.found === true
                            ? `Tonalidad de ${keyHistoryTooltip.orderDate}`
                            : keyHistoryTooltip?.isFirstTime === true
                            ? keyHistoryTooltip.message
                            : 'Buscar última tonalidad del director'
                          }
                          disabled={keyHistoryLoading}
                        >
                          {keyHistoryLoading ? (
                            <Clock size={14} className="animate-pulse" />
                          ) : keyHistoryTooltip?.found === true ? (
                            // Found history - show green checkmark
                            <Check size={14} />
                          ) : keyHistoryTooltip?.isFirstTime === true ? (
                            // First time - show medal/award icon
                            <Award size={14} />
                          ) : (
                            // No tooltip yet - show history icon
                            <History size={14} />
                          )}
                        </button>
                      )}
                      {/* Tooltip for key history */}
                      {keyHistoryTooltip && songRef.directorId && (
                        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-3 py-2 bg-neutral-700 text-xs rounded-lg shadow-lg whitespace-nowrap z-50 max-w-xs">
                          {keyHistoryTooltip.found === true ? (
                            // Found history tooltip
                            <>
                              <p className="text-green-400 font-mono">Tonalidad de {keyHistoryTooltip.orderDate}</p>
                              <p className="text-gray-400 font-mono">{keyHistoryTooltip.key}</p>
                              {keyHistoryTooltip.orderBand && (
                                <p className="text-gray-500 text-[10px]">Banda {keyHistoryTooltip.orderBand}</p>
                              )}
                            </>
                          ) : keyHistoryTooltip.isFirstTime === true ? (
                            // First time tooltip
                            <p className="text-yellow-400 text-center">
                              {keyHistoryTooltip.message}
                            </p>
                          ) : null}
                          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-700"></div>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => removeSongFromOrder(index)}
                      className="p-2 text-gray-400 hover:text-red-400 shrink-0"
                    >
                      <X size={16} />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Add from Repertoire - Searchable Dropdown */}
            <div className="mt-4 relative">
              <label className="text-xs text-gray-400 block mb-2">Agregar canción del repertorio</label>
              <div
                className="relative"
                ref={(el) => {
                  if (el) {
                    const rect = el.getBoundingClientRect();
                    const spaceBelow = window.innerHeight - rect.bottom;
                    setSongDropdownPosition(spaceBelow < 300 ? 'top' : 'bottom');
                  }
                }}
              >
                <div
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 flex items-center gap-2 cursor-pointer hover:border-neutral-600 transition-colors"
                  onClick={() => setShowSongDropdown(!showSongDropdown)}
                >
                  <Search size={16} className="text-gray-500" />
                  <input
                    type="text"
                    placeholder="Buscar canción por nombre, artista o tonalidad..."
                    value={songSearchTerm}
                    onChange={(e) => {
                      setSongSearchTerm(e.target.value);
                      setShowSongDropdown(true);
                    }}
                    onFocus={() => setShowSongDropdown(true)}
                    className="flex-1 bg-transparent outline-none text-sm"
                  />
                  <ChevronDown size={16} className="text-gray-500" />
                </div>

                {showSongDropdown && (
                  <div className={`absolute z-50 w-full bg-neutral-800 border border-neutral-700 rounded-xl shadow-2xl max-h-72 overflow-y-auto ${
                    songDropdownPosition === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
                  }`}>
                    {filteredSongsForDropdown.length > 0 ? (
                      filteredSongsForDropdown.map(song => (
                        <button
                          key={song.id}
                          onClick={() => {
                            addSongToOrder(song);
                            setSongSearchTerm('');
                            setShowSongDropdown(false);
                          }}
                          className="w-full px-4 py-3 flex items-center justify-between hover:bg-neutral-700 transition-colors border-b border-neutral-800 last:border-0"
                        >
                          <div className="flex items-center gap-3">
                            <Music size={16} className="text-purple-400" />
                            <div className="text-left">
                              <p className="font-medium text-sm">{song.title}</p>
                              <p className="text-xs text-gray-400">{song.artist}</p>
                            </div>
                          </div>
                          <Badge size="sm" variant="primary">{song.key}</Badge>
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-6 text-center text-gray-400 text-sm">
                        <Music size={24} className="mx-auto mb-2 text-gray-600" />
                        No se encontraron canciones
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* Order Detail Modal */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title="Detalle de Orden"
        size="lg"
      >
        {viewingOrder && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold">{formatDate(viewingOrder.date)}</h3>
                <p className="text-gray-400">{viewingOrder.time}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" icon={FileDown} onClick={() => generateOrderPDF(viewingOrder)}>
                  Exportar PDF
                </Button>
                <Badge className={statusConfig[viewingOrder.status]?.bg}>
                  <span className={statusConfig[viewingOrder.status]?.color}>
                    {statusConfig[viewingOrder.status]?.label}
                  </span>
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Card className="p-4">
                <p className="text-xs text-gray-400 uppercase mb-1">Banda</p>
                <p className="font-medium">{getBandById(viewingOrder.bandId)?.name}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-gray-400 uppercase mb-1">Tipo de Reunión</p>
                <p className="font-medium">{getMeetingTypeLabel(viewingOrder.meetingType)}</p>
              </Card>
            </div>

            <div>
              <h4 className="text-sm font-medium text-gray-400 mb-3">Canciones</h4>
              <div className="space-y-3">
                {viewingOrder.songs.map((songRef, index) => {
                  const song = getSongById(songRef.songId);
                  const director = getMemberById(songRef.directorId);
                  return (
                    <div key={index} className="flex items-center gap-4 p-3 bg-neutral-800/50 rounded-xl">
                      <span className="w-8 h-8 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center font-medium">
                        {index + 1}
                      </span>
                      <div className="flex-1">
                        <p className="font-medium">{song?.title}</p>
                        <div className="flex items-center gap-2 text-sm text-gray-400">
                          <Badge size="sm" variant="primary">Tono: {songRef.key}</Badge>
                          {director && (
                            <span className="flex items-center gap-1">
                              <User size={12} /> {director.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {isPastor && (
              <div>
                <label className="text-xs text-gray-400 font-medium uppercase block mb-2">
                  Devolución del Pastor
                </label>
                <textarea
                  className="w-full h-24 bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 resize-none"
                  placeholder="Agregar comentarios sobre la ejecución del servicio..."
                  value={viewingOrder.feedback || ''}
                  onChange={(e) => handleUpdateFeedback(viewingOrder.id, e.target.value)}
                />
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
