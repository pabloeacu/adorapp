import React, { useState, useMemo, useEffect } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  Plus, Calendar, Music, Download, Clock, ChevronRight, Copy,
  MessageSquare, Eye, Edit, Trash2, Filter, Search, Check, X,
  User, Zap, AlertCircle, ChevronDown, FileDown, History, Award,
  FileText, Printer, Copy as CopyIcon
} from 'lucide-react';
// jspdf is loaded on demand inside generateOrderPDF / generateSongsPDF
// (~140 KB; no need at first paint).
import { useAppStore, MEETING_TYPES, MUSICAL_KEYS, transposeSongStructure } from '../stores/appStore';
import { useAuthStore } from '../stores/authStore';
import { supabase } from '../lib/supabase';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { ConfirmModal, SuccessModal, ErrorModal } from '../components/ui/ConfirmModal';
import { OrderHistoryTimeline } from '../components/OrderHistoryTimeline';

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
  useDocumentTitle('Órdenes');
  const { orders, bands, songs, members, addOrder, updateOrder, deleteOrder, cloneOrder, getUnusedByBand, getSongById, getBandById, getMemberById } = useAppStore();
  const { profile, user } = useAuthStore();

  // Buscar miembro por email (mismo método que Header.jsx)
  const currentMember = useMemo(() => {
    if (user?.email && members) {
      return members.find(m => m.email === user.email);
    }
    return null;
  }, [user, members]);

  // Usar el rol del member encontrado, fallback a profile.role
  const userRole = currentMember?.role || profile?.role;
  const isPastor = userRole === 'pastor';
  const isLeader = userRole === 'leader';

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

  // Confirmation modals
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'warning',
    onConfirm: null,
    loading: false
  });

  const [successModal, setSuccessModal] = useState({
    isOpen: false,
    title: '',
    message: ''
  });

  const [errorModal, setErrorModal] = useState({
    isOpen: false,
    title: '',
    message: ''
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

  const handleCloneOrder = (order) => {
    setConfirmModal({
      isOpen: true,
      title: 'Duplicar Orden',
      message: `¿Querés duplicar la orden del ${formatDate(order.date)}? Se creará una copia que podés editar después.`,
      type: 'success',
      confirmText: 'Sí, duplicar',
      cancelText: 'Mejor no',
      icon: CopyIcon,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, loading: true }));
        cloneOrder(order.id);
        setConfirmModal(prev => ({ ...prev, loading: false, isOpen: false }));
        setSuccessModal({
          isOpen: true,
          title: 'Orden duplicada',
          message: 'La nueva orden fue creada. Podés editarla cuando quieras.'
        });
      }
    });
  };

  const handleDeleteOrder = (order) => {
    setConfirmModal({
      isOpen: true,
      title: 'Eliminar Orden',
      message: `¿Querés eliminar la orden del ${formatDate(order.date)}? Esta acción no se puede deshacer.`,
      type: 'danger',
      confirmText: 'Sí, eliminar',
      cancelText: 'Mejor no',
      icon: AlertCircle,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, loading: true }));
        deleteOrder(order.id);
        setConfirmModal(prev => ({ ...prev, loading: false, isOpen: false }));
        setSuccessModal({
          isOpen: true,
          title: 'Orden eliminada',
          message: 'La orden fue eliminada correctamente.'
        });
      }
    });
  };

  const handleUpdateFeedback = (orderId, feedback) => {
    updateOrder(orderId, { feedback });
  };

  // Export order summary (without chords)
  const generateOrderPDF = async (order) => {
    const { jsPDF } = await import('jspdf');
    const band = getBandById(order.bandId);
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Colors - optimized for dark background
    const purple = [168, 85, 247];
    const white = [255, 255, 255];
    const lightGray = [200, 200, 200];
    const mediumGray = [153, 153, 153];
    const purpleLight = [200, 150, 255];

    // Helper function to add dark background to a page
    const addDarkBackground = () => {
      doc.setFillColor(26, 26, 26);
      doc.rect(0, 0, 210, 297, 'F');
    };

    // Initial dark background
    addDarkBackground();

    let y = 25;

    // Header - Title
    doc.setFontSize(28);
    doc.setTextColor(...purple);
    doc.setFont('helvetica', 'bold');
    doc.text('Orden de Servicio', 105, y, { align: 'center' });
    y += 12;

    // Date and time
    doc.setFontSize(18);
    doc.setTextColor(...white);
    doc.setFont('helvetica', 'normal');
    doc.text(formatDate(order.date), 105, y, { align: 'center' });
    y += 8;
    doc.setFontSize(14);
    doc.setTextColor(...lightGray);
    doc.text(order.time, 105, y, { align: 'center' });
    y += 15;

    // Meta info
    doc.setFontSize(12);
    doc.setTextColor(...white);
    doc.text(`${band?.name || 'Banda'}   •   ${getMeetingTypeLabel(order.meetingType)}   •   ${order.songs.length} canciones`, 105, y, { align: 'center' });
    y += 15;

    // Separator line
    doc.setDrawColor(...purple);
    doc.setLineWidth(0.5);
    doc.line(20, y, 190, y);
    y += 15;

    // Table header
    doc.setFontSize(10);
    doc.setTextColor(...mediumGray);
    doc.setFont('helvetica', 'bold');
    doc.text('#', 20, y);
    doc.text('Canción', 35, y);
    doc.text('Tono', 140, y, { align: 'center' });
    doc.text('Director', 165, y);
    y += 8;

    // Table separator
    doc.setDrawColor(60, 60, 60);
    doc.setLineWidth(0.2);
    doc.line(20, y, 190, y);
    y += 5;

    // Songs
    order.songs.forEach((songRef, index) => {
      // Check if we need a new page
      if (y > 260) {
        doc.addPage();
        addDarkBackground();
        y = 25;
      }

      const song = getSongById(songRef.songId);
      const director = getMemberById(songRef.directorId);
      const key = songRef.key || song?.originalKey || song?.key || 'C';

      // Number
      doc.setFontSize(12);
      doc.setTextColor(...purple);
      doc.setFont('helvetica', 'bold');
      doc.text(`${index + 1}`, 20, y);

      // Title and artist
      doc.setTextColor(...white);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.text(song?.title || 'Sin título', 35, y);
      if (song?.artist) {
        doc.setFontSize(9);
        doc.setTextColor(...mediumGray);
        doc.text(song.artist, 35, y + 5);
      }

      // Key badge
      doc.setFontSize(10);
      doc.setTextColor(...purple);
      doc.setFont('helvetica', 'bold');
      doc.text(key, 140, y + (song?.artist ? 3 : 0), { align: 'center' });

      // Director
      doc.setTextColor(...lightGray);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(director?.name || '-', 190, y + (song?.artist ? 3 : 0), { align: 'right' });

      // Move to next row
      y += song?.artist ? 12 : 10;

      // Row separator
      doc.setDrawColor(50, 50, 50);
      doc.setLineWidth(0.1);
      doc.line(20, y - 3, 190, y - 3);
    });

    // Feedback section
    if (order.feedback) {
      if (y > 230) {
        doc.addPage();
        addDarkBackground();
        y = 25;
      }
      y += 10;
      doc.setFontSize(12);
      doc.setTextColor(245, 158, 11); // Yellow
      doc.setFont('helvetica', 'bold');
      doc.text('Devolución del Pastor', 20, y);
      y += 8;
      doc.setFontSize(11);
      doc.setTextColor(...lightGray);
      doc.setFont('helvetica', 'normal');
      const feedbackLines = doc.splitTextToSize(order.feedback, 170);
      feedbackLines.forEach(line => {
        doc.text(line, 20, y);
        y += 6;
      });
    }

    // Footer
    if (y > 270) {
      doc.addPage();
      addDarkBackground();
      y = 20;
    }
    y += 10;
    doc.setFontSize(9);
    doc.setTextColor(...mediumGray);
    doc.setFont('helvetica', 'italic');
    doc.text('Generado por AdorAPP - La plataforma de Adoración CAF', 105, y, { align: 'center' });

    // Download the PDF
    const dateStr = new Date(order.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '-');
    const fileName = `${band?.name || 'Banda'} - Orden ${dateStr}.pdf`;
    doc.save(fileName);
  };

  // Print all songs with full content (one song per page with page break)
  const generateSongsPDF = async (order) => {
    const { jsPDF } = await import('jspdf');
    const band = getBandById(order.bandId);
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Colors - optimized for dark background
    const purple = [168, 85, 247];
    const white = [255, 255, 255];
    const lightGray = [200, 200, 200];
    const mediumGray = [153, 153, 153];
    const purpleLight = [200, 150, 255];

    // Helper function to add dark background to a page
    const addDarkBackground = () => {
      doc.setFillColor(26, 26, 26);
      doc.rect(0, 0, 210, 297, 'F');
    };

    // Process each song
    order.songs.forEach((songRef, index) => {
      // Add new page for each song (except first)
      if (index > 0) {
        doc.addPage();
      }
      addDarkBackground();

      const song = getSongById(songRef.songId);
      const director = getMemberById(songRef.directorId);
      const originalKey = song?.originalKey || song?.key || 'C';
      const key = songRef.key || originalKey;

      // Transpose structure if needed
      let structure = song?.structure || [];
      if (song?.structure && key !== originalKey) {
        structure = transposeSongStructure(song.structure, originalKey, key);
      }

      let y = 20;

      // Song number (large)
      doc.setFontSize(48);
      doc.setTextColor(...purple);
      doc.setFont('helvetica', 'bold');
      doc.text(`${index + 1}`, 20, y + 15);

      // Meta info on the right
      doc.setFontSize(10);
      doc.setTextColor(...mediumGray);
      const metaLines = [
        `Orden: ${formatDate(order.date)}`,
        `Banda: ${band?.name || 'N/A'}`,
        `Director: ${director?.name || '-'}`,
        `Tono: ${key}${key !== originalKey ? ` (Original: ${originalKey})` : ''}`
      ];
      metaLines.forEach((line, i) => {
        doc.text(line, 190, y + 5 + (i * 5), { align: 'right' });
      });

      // Separator
      y = 50;
      doc.setDrawColor(60, 60, 60);
      doc.setLineWidth(0.3);
      doc.line(20, y, 190, y);
      y += 12;

      // Song title
      doc.setFontSize(28);
      doc.setTextColor(...white);
      doc.setFont('helvetica', 'bold');
      doc.text(song?.title || 'Sin título', 20, y);
      y += 10;

      // Artist
      if (song?.artist) {
        doc.setFontSize(14);
        doc.setTextColor(...lightGray);
        doc.setFont('helvetica', 'normal');
        doc.text(song.artist, 20, y);
        y += 10;
      }

      // Add compass and BPM if available
      if (song?.compass || song?.bpm) {
        doc.setFontSize(11);
        doc.setTextColor(...purpleLight);
        const extraInfo = [];
        if (song.compass) extraInfo.push(`Compás: ${song.compass}`);
        if (song.bpm) extraInfo.push(`BPM: ${song.bpm}`);
        doc.text(extraInfo.join('   •   '), 20, y);
        y += 8;
      }

      y += 5;

      // Content background
      doc.setFillColor(31, 31, 31);
      doc.roundedRect(15, y, 180, 200, 5, 5, 'F');

      y += 15;

      // Sections
      structure.forEach((section) => {
        // Section label
        doc.setFontSize(14);
        doc.setTextColor(...purpleLight);
        doc.setFont('helvetica', 'bold');
        doc.text(section.label || 'Sección', 20, y);
        y += 8;

        // Chords
        if (section.chords) {
          doc.setFontSize(18);
          doc.setTextColor(...purple);
          doc.setFont('courier', 'bold');

          // Split long chords into multiple lines
          const maxWidth = 170;
          const words = section.chords.split(' ');
          let line = '';
          words.forEach((word) => {
            const testLine = line ? `${line} ${word}` : word;
            if (doc.getTextWidth(testLine) > maxWidth) {
              doc.text(line, 20, y);
              y += 8;
              line = word;
            } else {
              line = testLine;
            }
          });
          if (line) {
            doc.text(line, 20, y);
            y += 10;
          }
        }

        // Lyrics
        if (section.content) {
          doc.setFontSize(12);
          doc.setTextColor(...white);
          doc.setFont('helvetica', 'normal');

          const lines = doc.splitTextToSize(section.content, 170);
          lines.forEach((lineText) => {
            if (y > 250) {
              // Close current content box and add new page
              doc.addPage();
              addDarkBackground();
              y = 20;
            }
            doc.text(lineText, 20, y);
            y += 6;
          });
          y += 4;
        }

        // Empty section (musical intro)
        if (!section.chords && !section.content && section.type === 'intro') {
          doc.setFontSize(10);
          doc.setTextColor(...mediumGray);
          doc.setFont('helvetica', 'italic');
          doc.text('Silencio musical', 20, y);
          y += 6;
        }

        y += 8;
      });

      if (!structure.length || (structure.length === 1 && !structure[0].chords && !structure[0].content)) {
        doc.setFontSize(11);
        doc.setTextColor(...mediumGray);
        doc.setFont('helvetica', 'italic');
        doc.text('Sin contenido disponible', 20, y);
      }
    });

    // Download the PDF
    const dateStr = new Date(order.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '-');
    const fileName = `${band?.name || 'Banda'} - Orden ${dateStr} - Canciones.pdf`;
    doc.save(fileName);
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

    // Fetch key history asynchronously and update key/tooltip.
    // The .catch keeps a transient network failure from leaving the user with
    // a stale tooltip and no idea why — we just fall back to the song's own key.
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
      }).catch(err => {
        console.error('fetchKeyHistory failed:', err);
        // No UI change needed; the song stays on its current key. The tooltip
        // will simply not show "found"/"first time" indicators.
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
                    <Button variant="ghost" size="sm" icon={Copy} onClick={() => handleCloneOrder(order)}>
                      Repetir
                    </Button>
                  )}
                  {isPastor && (
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
                  className="w-full h-24 bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-white/40"
                  placeholder="Agregar comentarios sobre la ejecución del servicio..."
                  value={viewingOrder.feedback || ''}
                  onChange={(e) => handleUpdateFeedback(viewingOrder.id, e.target.value)}
                />
              </div>
            )}

            {/* Pastor-only history timeline. RLS enforces the gate; the
                component just renders empty for non-pastors so it's safe to
                always mount it. */}
            {isPastor && (
              <div className="pt-4 border-t border-neutral-800">
                <label className="text-xs text-gray-400 font-medium uppercase block mb-3">
                  Historial de cambios
                </label>
                <OrderHistoryTimeline orderId={viewingOrder.id} />
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        type={confirmModal.type}
        confirmText={confirmModal.confirmText}
        cancelText={confirmModal.cancelText}
        icon={confirmModal.icon}
        loading={confirmModal.loading}
      />

      {/* Success Modal */}
      <SuccessModal
        isOpen={successModal.isOpen}
        onClose={() => setSuccessModal(prev => ({ ...prev, isOpen: false }))}
        title={successModal.title}
        message={successModal.message}
      />

      {/* Error Modal */}
      <ErrorModal
        isOpen={errorModal.isOpen}
        onClose={() => setErrorModal(prev => ({ ...prev, isOpen: false }))}
        title={errorModal.title}
        message={errorModal.message}
      />
    </div>
  );
};
