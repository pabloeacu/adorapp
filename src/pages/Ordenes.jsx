import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  Plus, Music, Clock, Copy, Activity,
  MessageSquare, Eye, Trash2, Search, Check, X,
  User, Zap, AlertCircle, ChevronDown, FileDown, History, Award,
  FileText, Printer, Copy as CopyIcon,
  Edit, CheckCircle, XCircle, RotateCcw, Target, ChevronRight, ListChecks, Play, CalendarClock, SlidersHorizontal, Ban
} from 'lucide-react';
import {
  CalendarDots,
  CalendarBlank,
  MusicNotes as MusicNotesDuo,
  MagnifyingGlass,
  UsersThree,
} from '@phosphor-icons/react';
// jspdf is loaded on demand inside generateOrderPDF / generateSongsPDF
// (~140 KB; no need at first paint).
import { useAppStore, MEETING_TYPES, MUSICAL_KEYS, transposeSongStructure } from '../stores/appStore';
import { useCurrentRole, useCurrentMember } from '../hooks/useCurrentMember';
import { memberAreas } from '../lib/areas';
import { ChannelPlanModal } from '../components/orders/ChannelPlanModal';
import { supabase } from '../lib/supabase';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { ConfirmModal, SuccessModal, ErrorModal } from '../components/ui/ConfirmModal';
import { EmptyState } from '../components/ui/EmptyState';
import { OrderHistoryTimeline } from '../components/OrderHistoryTimeline';
import { OrderCalendar } from '../components/OrderCalendar';
import { RepertoireInsightsModal } from '../components/RepertoireInsightsModal';
import { SchemaBuilderModal } from '../components/schema/SchemaBuilderModal';
import { TemplateManagerModal } from '../components/schema/TemplateManagerModal';
import { suggestDirectorForSong } from '../lib/orders';
import { SelectMenu } from '../components/ui/SelectMenu';
import { LineupEditor } from '../components/orders/LineupEditor';
import { LineupSummary } from '../components/orders/LineupSummary';
import { LineupModal } from '../components/orders/LineupModal';
import { RehearsalActionModal } from '../components/orders/RehearsalActionModal';
import { CollapsibleSection } from '../components/ui/CollapsibleSection';
import { buildLineup, lineupSummaryText, isCustomLineup } from '../lib/lineup';

// Parsear 'YYYY-MM-DD' como fecha LOCAL (no UTC). `new Date('2026-09-11')` se
// interpreta en UTC y, en ART (-3), muestra el día ANTERIOR (jueves 10 en vez de
// viernes 11). Mismo patrón local ya usado en PrepBanner/Practica (landmine TZ).
const parseLocalDate = (dateStr) => {
  const s = String(dateStr || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : new Date(dateStr);
};
// Hoy en formato YYYY-MM-DD (zona local del dispositivo = ART para el ministerio).
const localTodayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Each song row in the order editor is wrapped in this so it can be dragged
// to reorder. The grip handle is the only drag surface, so accidental drags
// while clicking selects/buttons are impossible.
function SortableSongRow({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="flex items-stretch">
      <button
        type="button"
        aria-label="Mover canción"
        {...attributes}
        {...listeners}
        className="px-2 cursor-grab active:cursor-grabbing text-gray-500 hover:text-gray-300 touch-none focus:outline-none focus:ring-2 focus:ring-gold-500/40 rounded"
      >
        ⋮⋮
      </button>
      <div className="flex-1">{children}</div>
    </div>
  );
}

const statusConfig = {
  scheduled: { label: 'Programado', color: 'text-blue-400', bg: 'bg-blue-500/20' },
  completed: { label: 'Completado', color: 'text-green-400', bg: 'bg-green-500/20' },
  cancelled: { label: 'Cancelado', color: 'text-red-400', bg: 'bg-red-500/20' },
};

export const Ordenes = () => {
  useDocumentTitle('Órdenes');
  const { orders, bands, songs, members, bandTemporaryMembers, addOrder, updateOrder, deleteOrder, cloneOrder, getUnusedByBand, getSongById, getBandById, getMemberById, getEffectiveBandMemberIds, getServiceSchema, getOrderParticipants } = useAppStore();
  const userRole = useCurrentRole();
  const isPastor = userRole === 'pastor';
  const isLeader = userRole === 'leader';
  const currentMember = useCurrentMember();
  const isSonido = memberAreas(currentMember).includes('sonido');

  const [schemaModal, setSchemaModal] = useState({ isOpen: false, order: null });
  const [channelPlanOrder, setChannelPlanOrder] = useState(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showInsights, setShowInsights] = useState(false); // Radiografía del repertorio (solo lectura)
  const [editingOrder, setEditingOrder] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [viewingOrder, setViewingOrder] = useState(null);
  const [filterStatus, setFilterStatus] = useState('scheduled');
  const [filterBand, setFilterBand] = useState('all');
  const [showUnused, setShowUnused] = useState(false);
  const [selectedBandForUnused, setSelectedBandForUnused] = useState(null);
  const [songSearchTerm, setSongSearchTerm] = useState('');
  const [showSongDropdown, setShowSongDropdown] = useState(false);
  const [songDropdownPosition, setSongDropdownPosition] = useState('bottom');

  // Key history feature
  const [keyHistoryLoading, setKeyHistoryLoading] = useState(false);
  const [keyHistoryTooltip, setKeyHistoryTooltip] = useState(null);

  // Formación del servicio: paso 2 del alta ('form' → 'lineup'), borrador y
  // modal de edición desde el detalle. Ver docs/PLAN_formacion_orden.md.
  const [formStep, setFormStep] = useState('form');
  const [lineupDraft, setLineupDraft] = useState({ mode: 'all', members: [] });
  const [lineupSaving, setLineupSaving] = useState(false);
  const [lineupModal, setLineupModal] = useState({ isOpen: false, order: null });
  const [rehearsalModal, setRehearsalModal] = useState({ isOpen: false, order: null, mode: null });
  const [rehearsalReasonOpen, setRehearsalReasonOpen] = useState(false);

  const [formData, setFormData] = useState({
    date: '',
    time: '20:00',
    bandId: null,
    meetingType: 'culto_general',
    songs: [],
    feedback: '',
    rehearsalEnabled: false,
    rehearsalDate: '',
    rehearsalTime: '18:00'
  });

  // Members eligible to direct the songs in THIS order: must be in the
  // selected band, active, and have Voz as instrument. When no band is
  // chosen yet the list is empty — the song-search input is also blocked
  // (see the search input below) so this can't be reached needing directors.
  const singers = useMemo(() => {
    if (!formData.bandId) return [];
    // Elegibles = miembros EFECTIVOS (permanentes ∪ temporales vigentes) activos
    // con 'Voz'. Un temporal vigente cuenta como director/voz (decisión de producto).
    const bandMemberIds = getEffectiveBandMemberIds(formData.bandId);
    return members.filter(m =>
      m.active &&
      bandMemberIds.has(m.id) &&
      m.instruments?.includes('Voz')
    );
  }, [members, bands, bandTemporaryMembers, formData.bandId, getEffectiveBandMemberIds]);

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

  const [sortBy, setSortBy] = useState('date_desc');
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'calendar'
  const [searchParams, setSearchParams] = useSearchParams();

  const filteredOrders = useMemo(() => {
    const list = orders.filter(order => {
      const matchesStatus = filterStatus === 'all' || order.status === filterStatus;
      const matchesBand = filterBand === 'all' || order.bandId === filterBand;
      return matchesStatus && matchesBand;
    });
    const byDateDesc = (a, b) => new Date(b.date) - new Date(a.date);
    const byDateAsc = (a, b) => new Date(a.date) - new Date(b.date);
    const byBand = (a, b) => {
      const an = getBandById(a.bandId)?.name || '';
      const bn = getBandById(b.bandId)?.name || '';
      return an.localeCompare(bn, 'es') || byDateDesc(a, b);
    };
    const cmp =
      sortBy === 'date_asc' ? byDateAsc :
      sortBy === 'band' ? byBand :
      byDateDesc;
    return [...list].sort(cmp);
  }, [orders, filterStatus, filterBand, sortBy, getBandById]);

  const unusedSongs = selectedBandForUnused ? getUnusedByBand(selectedBandForUnused, 4) : [];

  // Filtered songs for dropdown search.
  // Defensive null-guards: any NULL on title/artist/key (legacy data) would
  // crash the whole Ordenes page with "Cannot read properties of null".
  const filteredSongsForDropdown = useMemo(() => {
    if (!songSearchTerm.trim()) return songs.slice(0, 10);
    const search = songSearchTerm.toLowerCase();
    return songs.filter(song =>
      (song.title || '').toLowerCase().includes(search) ||
      (song.artist || '').toLowerCase().includes(search) ||
      (song.key || '').toLowerCase().includes(search)
    ).slice(0, 15);
  }, [songs, songSearchTerm]);

  const handleOpenModal = (order = null) => {
    if (order) {
      // Editar: precargar los datos de la orden existente.
      setEditingOrder(order);
      setFormData({
        date: order.date || '',
        time: order.time || '20:00',
        bandId: order.bandId || null,
        meetingType: order.meetingType || 'culto_general',
        songs: order.songs ? order.songs.map(s => ({ ...s })) : [],
        feedback: order.feedback || '',
        rehearsalEnabled: !!order.rehearsalDate,
        rehearsalDate: order.rehearsalDate || '',
        rehearsalTime: order.rehearsalTime || '18:00'
      });
    } else {
      setEditingOrder(null);
      setFormData({
        date: '',
        time: '20:00',
        bandId: null,
        meetingType: 'culto_general',
        songs: [],
        feedback: '',
        rehearsalEnabled: false,
        rehearsalDate: '',
        rehearsalTime: '18:00'
      });
    }
    // Blanquear el buscador de canciones para no arrastrar lo tipeado en una
    // apertura anterior (el search vive fuera de formData).
    setSongSearchTerm('');
    setShowSongDropdown(false);
    setKeyHistoryTooltip(null);
    setFormStep('form');
    setLineupDraft({ mode: 'all', members: [] });
    setLineupSaving(false);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingOrder(null);
    setShowUnused(false);
    setSelectedBandForUnused(null);
    setSongSearchTerm('');
    setShowSongDropdown(false);
    setKeyHistoryTooltip(null);
    setFormStep('form');
    setLineupSaving(false);
  };

  // Cerrar el modal de alta/edición. En el paso "Formación" el orden todavía NO
  // está guardado → se confirma antes de descartar (también cubre el gesto
  // "atrás" del celular, que el <Modal> traduce a onClose).
  const handleRequestClose = () => {
    if (formStep === 'lineup' && !editingOrder) {
      setConfirmModal({
        isOpen: true,
        title: 'El orden todavía no se guardó',
        message: 'Si salís ahora se pierde lo que armaste. ¿Salir sin guardar?',
        type: 'warning',
        confirmText: 'Salir sin guardar',
        cancelText: 'Seguir editando',
        loading: false,
        onConfirm: () => { setConfirmModal(prev => ({ ...prev, isOpen: false })); handleCloseModal(); },
      });
      return;
    }
    handleCloseModal();
  };

  // Pastor/leader can change an order's status from the detail view. Routes
  // through updateOrder (merge-safe) and patches the open detail snapshot.
  const handleChangeStatus = async (order, status) => {
    await updateOrder(order.id, { status });
    setViewingOrder(prev => (prev && prev.id === order.id ? { ...prev, status } : prev));
  };

  // Deep link from the dashboard "Hoy tenés ensayo" card: /ordenes?order=<id>
  // opens that order's detail. Wait until orders are loaded to resolve it.
  useEffect(() => {
    const orderId = searchParams.get('order');
    if (!orderId) return;
    const target = orders.find(o => o.id === orderId);
    if (!target) return;
    // Syncing an external URL param into local modal state — legitimate effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setViewingOrder(target);
    setIsDetailOpen(true);
    searchParams.delete('order');
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, orders, setSearchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.date || !formData.bandId) return;

    // Un orden no se puede guardar sin repertorio: al menos una canción.
    if (!formData.songs || formData.songs.length === 0) {
      setErrorModal({
        isOpen: true,
        title: 'Falta el repertorio',
        message: 'No podés guardar un orden sin canciones. Agregá al menos una.',
      });
      return;
    }

    // Rehearsal is optional. Only attach date+time when the switch is on and a
    // date was picked; otherwise both stay null (no rehearsal for this order).
    const rehearsalDate = formData.rehearsalEnabled && formData.rehearsalDate
      ? formData.rehearsalDate
      : null;
    const rehearsalTime = rehearsalDate ? (formData.rehearsalTime || null) : null;
    const orderPayload = { ...formData, rehearsalDate, rehearsalTime };

    // Crear: ANTES de grabar, el paso "Formación" (decisión de producto: el mail
    // "nuevo orden" se dispara en el INSERT, así que la formación tiene que
    // viajar en el mismo guardado). Editar: se guarda directo (la formación se
    // edita desde el detalle del orden).
    if (!editingOrder && formStep === 'form') {
      setFormStep('lineup');
      return;
    }
    if (lineupSaving) return; // anti doble toque
    setLineupSaving(true);

    let orderId;
    if (editingOrder) {
      // Editar: updateOrder mergea el partial con el snapshot del store antes
      // del converter (sin DATA-LOSS). rehearsal_reminder_sent NO se toca (lo
      // maneja el cron).
      await updateOrder(editingOrder.id, orderPayload);
      orderId = editingOrder.id;
    } else {
      // Crear: addOrder corre PRIMERO para tener el order.id real y satisfacer
      // el FK song_key_history.order_id (ver incidente histórico).
      const newOrder = await addOrder({ ...orderPayload, lineup: buildLineup(lineupDraft.mode, lineupDraft.members) });
      if (!newOrder?.id) {
        // La base rechazó el alta (p. ej. la formación quedó inválida): NO se
        // miente con un cierre silencioso (landmine #32).
        setLineupSaving(false);
        setErrorModal({
          isOpen: true,
          title: 'No se pudo guardar el orden',
          message: useAppStore.getState().error || 'Intentá de nuevo. Si el problema sigue, avisale al pastor.',
        });
        return;
      }
      orderId = newOrder.id;
    }

    // saveKeyHistory es upsert (onConflict member_id,song_id) → idempotente,
    // así que editar no duplica historial.
    await Promise.all(
      formData.songs
        .filter(s => s.directorId)
        .map(s => saveKeyHistory(s.directorId, s.songId, s.key, orderId))
    );

    const created = !editingOrder;
    const n = lineupDraft.mode === 'custom' ? lineupDraft.members.length : null;
    handleCloseModal();
    if (created) {
      setSuccessModal({
        isOpen: true,
        title: 'Orden guardado',
        message: n == null
          ? 'Se avisó a toda la banda. Participan todos: todos reciben los avisos de ensamble y ensayo.'
          : `Se avisó a toda la banda con la formación (${n} ${n === 1 ? 'integrante' : 'integrantes'}). Los avisos de ensamble y ensayo llegan solo a quienes participan.`,
      });
    }
  };

  const handleViewOrder = (order) => {
    setViewingOrder(order);
    setIsDetailOpen(true);
  };

  const handleCloneOrder = (order) => {
    setConfirmModal({
      isOpen: true,
      title: 'Duplicar Orden',
      message: `¿Querés duplicar el orden del ${formatDate(order.date)}? Se creará una copia que podés editar después.`,
      type: 'success',
      confirmText: 'Sí, duplicar',
      cancelText: 'Mejor no',
      icon: CopyIcon,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, loading: true }));
        // Esperar el resultado real (landmine #32): cloneOrder devuelve el
        // nuevo orden o null si la base rechaza. Sin await mostraba "duplicado"
        // aunque fallara.
        const res = await cloneOrder(order.id);
        setConfirmModal(prev => ({ ...prev, loading: false, isOpen: false }));
        if (res) {
          setSuccessModal({
            isOpen: true,
            title: 'Orden duplicado',
            message: 'El nuevo orden fue creado. Podés editarlo cuando quieras.'
          });
        } else {
          setErrorModal({
            isOpen: true,
            title: 'No se pudo duplicar',
            message: 'Hubo un problema al duplicar el orden. Intentá de nuevo.'
          });
        }
      }
    });
  };

  const handleDeleteOrder = (order) => {
    setConfirmModal({
      isOpen: true,
      title: 'Eliminar Orden',
      message: `¿Querés eliminar el orden del ${formatDate(order.date)}? Esta acción no se puede deshacer.`,
      type: 'danger',
      confirmText: 'Sí, eliminar',
      cancelText: 'Mejor no',
      icon: AlertCircle,
      onConfirm: async () => {
        // Esperar el resultado real: deleteOrder es async y devuelve true/false.
        // Antes se llamaba fire-and-forget y SIEMPRE se mostraba "eliminada",
        // aunque el borrado fallara (p. ej. FK) → el usuario veía "no pasa nada".
        setConfirmModal(prev => ({ ...prev, loading: true }));
        const ok = await deleteOrder(order.id);
        setConfirmModal(prev => ({ ...prev, loading: false, isOpen: false }));
        if (ok) {
          setSuccessModal({
            isOpen: true,
            title: 'Orden eliminado',
            message: 'El orden fue eliminado correctamente.'
          });
        } else {
          setErrorModal({
            isOpen: true,
            title: 'No se pudo eliminar',
            message: 'Hubo un problema al eliminar el orden. Intentá de nuevo.'
          });
        }
      }
    });
  };

  const handleUpdateFeedback = (orderId, feedback) => {
    updateOrder(orderId, { feedback });
  };

  // Export order summary (without chords)
  // Surface PDF-generation failures instead of letting the async rejection die
  // silently (same class of bug fixed in the Repertorio export).
  const runPdfExport = (promise) => {
    Promise.resolve(promise).catch((err) => {
      console.error('Error generating PDF:', err);
      setErrorModal({
        isOpen: true,
        title: 'Error',
        message: 'No se pudo generar el PDF. Intentá de nuevo.'
      });
    });
  };

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
    y += 8;
    // Formación del servicio (solo si el orden la tiene definida)
    if (order.lineup) {
      const participants = getOrderParticipants(order);
      if (participants.length > 0) {
        const text = `Formación${isCustomLineup(order) ? '' : ' (toda la banda)'}: ${lineupSummaryText(order, participants)}`;
        doc.setFontSize(10);
        doc.setTextColor(...lightGray);
        doc.splitTextToSize(text, 170).forEach((line) => { doc.text(line, 105, y, { align: 'center' }); y += 5; });
      }
    }
    y += 7;

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
    const dateStr = parseLocalDate(order.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '-');
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
    const dateStr = parseLocalDate(order.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '-');
    const fileName = `${band?.name || 'Banda'} - Orden ${dateStr} - Canciones.pdf`;
    doc.save(fileName);
  };

  const addSongToOrder = async (song) => {
    const singerIds = new Set(singers.map((s) => s.id));
    const suggestedDirectorId = suggestDirectorForSong({
      singerIds,
      orders,
      songId: song.id,
      bandId: formData.bandId,
    });
    const defaultKey = song.key || song.originalKey || 'C';
    const newIndex = formData.songs.length;

    setFormData(prev => ({
      ...prev,
      songs: [...prev.songs, {
        songId: song.id,
        directorId: suggestedDirectorId,
        key: defaultKey,
        _pendingHistory: true,
        _suggestedDirector: !!suggestedDirectorId,
        // Stable client-side id used by drag-and-drop. Survives reorders.
        _localId: typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${song.id}-${Date.now()}-${Math.random()}`,
      }]
    }));
    setShowUnused(false);

    // If we pre-filled a director, fetch their saved key in the background so
    // the row matches what handleDirectorChange would do for a manual pick.
    if (suggestedDirectorId) {
      fetchKeyHistory(suggestedDirectorId, song.id).then(result => {
        if (result.found) {
          setFormData(prev => ({
            ...prev,
            songs: prev.songs.map((s, i) =>
              i === newIndex ? { ...s, key: result.key } : s
            )
          }));
        }
      }).catch(() => {});
    }
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
      fetchKeyHistory(directorId, songId, index).then(result => {
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

  // Drag-and-drop reorder of songs inside an order. Pointer for mouse/touch
  // and Keyboard for screen-reader / keyboard users (Enter starts drag,
  // arrows move, Enter again drops).
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleSongDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setFormData((prev) => {
      const ids = prev.songs.map((s, i) => s._localId || `${s.songId}-${i}`);
      const oldIndex = ids.indexOf(active.id);
      const newIndex = ids.indexOf(over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return { ...prev, songs: arrayMove(prev.songs, oldIndex, newIndex) };
    });
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
    return parseLocalDate(dateStr).toLocaleDateString('es-ES', {
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
  // rowIndex: la fila que disparó la consulta (el tooltip se muestra SOLO ahí, se
  // auto-cierra a los 6 s y no captura taps — antes salía en todas las filas con
  // director y tapaba el selector de director en el celular).
  const keyHistoryTimerRef = useRef(null);
  const showKeyHistoryTooltip = (tip) => {
    if (keyHistoryTimerRef.current) clearTimeout(keyHistoryTimerRef.current);
    setKeyHistoryTooltip(tip);
    keyHistoryTimerRef.current = setTimeout(() => setKeyHistoryTooltip(null), 6000);
  };
  useEffect(() => () => { if (keyHistoryTimerRef.current) clearTimeout(keyHistoryTimerRef.current); }, []);

  const fetchKeyHistory = async (directorId, songId, rowIndex = null) => {
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
          ? parseLocalDate(order.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
          : 'fecha no disponible';

        showKeyHistoryTooltip({
          rowIndex,
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
      showKeyHistoryTooltip({
        rowIndex,
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
            {orders.length} órdenes · {orders.filter(o => o.status === 'scheduled').length} programados
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div role="tablist" aria-label="Modo de visualización" className="flex bg-neutral-900 border border-neutral-800 rounded-xl p-1">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'list'}
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                viewMode === 'list' ? 'bg-gold-500/15 text-gold-200 ring-1 ring-gold-500/30' : 'text-gray-400 hover:text-gold-200'
              }`}
            >
              Lista
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'calendar'}
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                viewMode === 'calendar' ? 'bg-gold-500/15 text-gold-200 ring-1 ring-gold-500/30' : 'text-gray-400 hover:text-gold-200'
              }`}
            >
              Calendario
            </button>
          </div>
          {(isPastor || isLeader) && (
            <div className="flex flex-wrap items-center gap-2">
              {isPastor && (
                <Button variant="secondary" icon={ListChecks} onClick={() => setShowTemplates(true)}>
                  Plantillas
                </Button>
              )}
              <Button variant="secondary" icon={Activity} onClick={() => setShowInsights(true)}>
                Radiografía
              </Button>
              <Button icon={Plus} onClick={() => handleOpenModal()}>
                Nuevo Orden
              </Button>
            </div>
          )}
        </div>
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
        <select
          aria-label="Ordenar órdenes"
          className="px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-xl"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="date_desc">Ordenar: fecha ↓</option>
          <option value="date_asc">Ordenar: fecha ↑</option>
          <option value="band">Ordenar: banda</option>
        </select>
      </div>

      {viewMode === 'calendar' && (
        <OrderCalendar
          orders={filteredOrders}
          getBandById={getBandById}
          onSelectOrder={(o) => {
            setViewingOrder(o);
            setIsDetailOpen(true);
          }}
        />
      )}

      {/* Orders List */}
      {viewMode === 'list' && (
      <div className="space-y-4">
        {filteredOrders.map((order) => {
          const band = getBandById(order.bandId);
          const songDetails = order.songs.map(s => getSongById(s.songId)).filter(Boolean);

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
      )}

      {filteredOrders.length === 0 && viewMode === 'list' && (
        <EmptyState
          icon={CalendarBlank}
          title={filterStatus !== 'all' ? 'No hay órdenes con este filtro' : 'Todavía no hay órdenes'}
          subtitle={filterStatus !== 'all'
            ? 'Probá cambiar el estado o la banda para ver otros órdenes.'
            : 'Armá el primer orden del ministerio y empezá a planificar los encuentros.'}
          annotation={(isPastor || isLeader) ? 'Creá el primero acá' : undefined}
        >
          {(isPastor || isLeader) && (
            <Button variant="secondary" icon={Plus} onClick={() => handleOpenModal()}>
              Crear primer orden
            </Button>
          )}
        </EmptyState>
      )}

      {/* Create Order Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleRequestClose}
        title={editingOrder ? 'Editar Orden de Servicio' : formStep === 'lineup' ? 'Formación del servicio' : 'Nuevo Orden de Servicio'}
        size="xl"
        footer={
          formStep === 'lineup' && !editingOrder ? (
            <>
              <Button variant="ghost" onClick={() => setFormStep('form')} disabled={lineupSaving} data-testid="lineup-back">Volver</Button>
              <Button
                onClick={handleSubmit}
                disabled={lineupSaving || (lineupDraft.mode === 'custom' && lineupDraft.members.length === 0)}
                data-testid="lineup-save"
              >
                {lineupSaving ? 'Guardando…' : 'Guardar orden'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={handleRequestClose}>Cancelar</Button>
              <Button onClick={handleSubmit} disabled={!formData.date || !formData.bandId} data-testid="order-submit">
                {editingOrder ? 'Guardar cambios' : 'Continuar'}
              </Button>
            </>
          )
        }
      >
        {formStep === 'lineup' && !editingOrder ? (
          <div className="space-y-5" data-testid="lineup-step">
            {/* Resumen del orden que se va a guardar */}
            <div className="rounded-2xl border border-gold-500/25 bg-gradient-to-br from-gold-600/[0.22] via-neutral-900 to-gold-300/[0.08] p-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-gold-500/15 ring-1 ring-gold-500/25 text-gold-300 shrink-0"><UsersThree size={22} weight="duotone" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-wide text-gold-300/80 font-medium">Paso 2 de 2 · Formación</p>
                  <p className="font-semibold mt-0.5">{formData.date ? formatDate(formData.date) : ''} · {formData.time} · {getBandById(formData.bandId)?.name || 'Banda'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formData.songs.length} {formData.songs.length === 1 ? 'canción' : 'canciones'}
                    {formData.rehearsalEnabled && formData.rehearsalDate ? ` · ensamble ${formatDate(formData.rehearsalDate)}${formData.rehearsalTime ? ` ${formData.rehearsalTime}` : ''}` : ''}
                  </p>
                  <p className="text-xs text-gray-500 mt-1.5">¿Quiénes tocan este servicio? Los avisos de ensamble y la alarma de ensayo llegan solo a los que participan. El orden y sus canciones los ve toda la banda igual.</p>
                </div>
              </div>
            </div>
            <LineupEditor
              bandId={formData.bandId}
              songs={formData.songs}
              orderDate={formData.date}
              value={lineupDraft}
              onChange={setLineupDraft}
            />
          </div>
        ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
              <SelectMenu
                value={formData.bandId || ''}
                placeholder="Seleccionar banda"
                options={bands.map((band) => ({ value: band.id, label: band.name }))}
                onChange={(v) => {
                  const bandId = v || null;
                  const band = getBandById(bandId);
                  // When the band changes, drop any director assignments that
                  // don't belong to the new band — those members aren't
                  // singers of this band anymore. The key reverts to the
                  // song's default; the user can pick a valid director next.
                  // Efectivos = permanentes ∪ temporales vigentes.
                  const newBandMemberIds = getEffectiveBandMemberIds(bandId);
                  const songsAfterBandSwap = formData.songs.map((s) => (
                    s.directorId && !newBandMemberIds.has(s.directorId)
                      ? { ...s, directorId: null, _suggestedDirector: false }
                      : s
                  ));
                  setFormData({
                    ...formData,
                    bandId,
                    meetingType: band?.meetingType || 'culto_general',
                    songs: songsAfterBandSwap,
                  });
                  setSelectedBandForUnused(bandId);
                  // Cambió la banda → la formación en borrador ya no aplica
                  // (sus integrantes son de la banda anterior). Se reinicia a
                  // "todos" para no guardar/mostrar una selección fantasma.
                  setLineupDraft({ mode: 'all', members: [] });
                }}
              />
            </div>
          </div>

          {/* Rehearsal scheduling (optional) */}
          <div className="rounded-xl border border-neutral-800 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">Programar ensamble</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  El encuentro de toda la banda. Avisamos 2 h antes y lo mostramos en el calendario y en el inicio.
                </p>
              </div>
              {/* Switch: <label> + checkbox oculto (sr-only peer) + spans track/knob.
                  Antes era un <button>, que en iOS Safari tomaba forma nativa
                  (-webkit-appearance: push-button) y se veía ovalado/comprimido.
                  Un <span> con tamaños fijos en px es inmune a eso; shrink-0 +
                  el texto en flex-1 min-w-0 evitan que el track se comprima. */}
              <label className="relative shrink-0 inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  aria-label="Programar ensamble"
                  checked={formData.rehearsalEnabled}
                  onChange={() => setFormData({ ...formData, rehearsalEnabled: !formData.rehearsalEnabled })}
                />
                <span className="block w-[52px] h-8 rounded-full bg-neutral-700 transition-colors peer-checked:bg-green-500 peer-focus-visible:ring-2 peer-focus-visible:ring-gold-500/40" />
                <span className="pointer-events-none absolute top-[2px] left-[2px] h-7 w-7 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
              </label>
            </div>
            {formData.rehearsalEnabled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <Input
                  label="Día del ensamble"
                  type="date"
                  value={formData.rehearsalDate}
                  onChange={(e) => setFormData({ ...formData, rehearsalDate: e.target.value })}
                />
                <Input
                  label="Hora del ensamble"
                  type="time"
                  value={formData.rehearsalTime}
                  onChange={(e) => setFormData({ ...formData, rehearsalTime: e.target.value })}
                />
              </div>
            )}
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
              <div className="mb-4 p-4 bg-gold-500/[0.06] border border-gold-500/30 rounded-xl">
                <div className="flex items-center gap-2 text-gold-300 text-sm mb-3">
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
                      <span className="text-gold-300">+</span>
                    </button>
                  ))}
                  {unusedSongs.length === 0 && (
                    <EmptyState
                      className="w-full !py-8"
                      icon={MusicNotesDuo}
                      title="Sin canciones para sugerir"
                      subtitle="Esta banda usó todo su repertorio en las últimas 4 semanas."
                      annotation="Buscala más abajo"
                    />
                  )}
                </div>
              </div>
            )}

            {/* All Songs — drag the ⋮⋮ handle to reorder. */}
            <DndContext
              sensors={dndSensors}
              collisionDetection={closestCenter}
              onDragEnd={handleSongDragEnd}
            >
              <SortableContext
                items={formData.songs.map((s, i) => s._localId || `${s.songId}-${i}`)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {formData.songs.map((songRef, index) => {
                    const song = getSongById(songRef.songId);
                    const rowId = songRef._localId || `${songRef.songId}-${index}`;
                    return (
                      <SortableSongRow key={rowId} id={rowId}>
                        <div className="flex flex-wrap items-center gap-3 p-3 bg-neutral-800 rounded-xl">
                    <span className="w-6 h-6 rounded-full bg-neutral-700 flex items-center justify-center text-xs shrink-0">
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0 basis-32">
                      <p className="font-medium truncate">{song?.title}</p>
                      <p className="text-xs text-gray-400 truncate">{song?.artist}</p>
                    </div>
                    {/* Director selector - filtered to singers only */}
                    <div className="relative shrink-0 w-44" title={songRef._suggestedDirector ? 'Director sugerido por historial' : undefined}>
                      <SelectMenu
                        value={songRef.directorId || ''}
                        placeholder="Director"
                        icon={User}
                        options={[{ value: '', label: 'Sin director' }, ...singers.map((member) => ({ value: member.id, label: member.name }))]}
                        onChange={(v) => {
                          const newDirectorId = v || null;
                          // Clear the "suggested" flag once the user makes a manual choice
                          setFormData(prev => ({
                            ...prev,
                            songs: prev.songs.map((s, i) =>
                              i === index ? { ...s, _suggestedDirector: false } : s
                            )
                          }));
                          handleDirectorChange(index, newDirectorId, songRef.songId);
                        }}
                      />
                      {songRef._suggestedDirector && (
                        <span
                          className="absolute -top-1.5 -right-1.5 text-[9px] bg-gold-gradient text-black rounded-full px-1.5 py-0.5 leading-none pointer-events-none"
                          aria-label="Sugerencia automática"
                        >
                          ★
                        </span>
                      )}
                    </div>
                    {/* Key selector with history lookup icon */}
                    <div className="relative flex items-center shrink-0">
                      <SelectMenu
                        className="w-24 font-mono"
                        value={songRef.key}
                        placeholder="Tono"
                        options={MUSICAL_KEYS.map((key) => ({ value: key, label: key }))}
                        onChange={(v) => handleKeyChange(index, v)}
                      />
                      {songRef.directorId && (
                        <button
                          type="button"
                          onClick={() => fetchKeyHistory(songRef.directorId, songRef.songId, index)}
                          className={`ml-1 p-1 transition-colors ${keyHistoryLoading ? 'animate-spin' : ''} ${
                            keyHistoryTooltip?.found === true
                              ? 'text-green-400 hover:text-green-300'
                              : keyHistoryTooltip?.isFirstTime === true
                              ? 'text-yellow-400 hover:text-yellow-300'
                              : 'text-gray-400 hover:text-gold-300'
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
                      {/* Tooltip for key history.
                          Anchored to the right (right-0) and wrapping (no
                          whitespace-nowrap) so the long "primera vez" message no
                          longer overflows off-screen on mobile — the key column
                          sits at the right edge, so the tooltip grows leftward,
                          inward, and wraps to a few lines within max-w. */}
                      {keyHistoryTooltip && keyHistoryTooltip.rowIndex === index && songRef.directorId && (
                        <div className="pointer-events-none absolute bottom-full mb-2 right-0 px-3 py-2 bg-neutral-700 text-xs rounded-lg shadow-lg z-50 max-w-[13rem] w-max">
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
                          <div className="absolute top-full right-3 border-4 border-transparent border-t-neutral-700"></div>
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
                      </SortableSongRow>
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>

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
                  className={`w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 flex items-center gap-2 transition-colors ${
                    formData.bandId
                      ? 'cursor-pointer hover:border-neutral-600'
                      : 'cursor-not-allowed opacity-60'
                  }`}
                  onClick={() => {
                    // Block adding songs until a band is chosen: the director
                    // dropdown derives its options from the band, so without
                    // a band the song row would offer an empty director list.
                    if (!formData.bandId) {
                      setErrorModal({
                        isOpen: true,
                        title: 'Elegí la banda primero',
                        message: 'Para agregar canciones necesitamos saber qué banda va a tocar — así sólo te ofrecemos como directores a quienes integran esa banda.',
                      });
                      return;
                    }
                    setShowSongDropdown(!showSongDropdown);
                  }}
                >
                  <Search size={16} className="text-gray-500" />
                  <input
                    type="text"
                    placeholder={formData.bandId ? 'Buscar canción por nombre, artista o tonalidad...' : 'Primero elegí la banda…'}
                    value={songSearchTerm}
                    disabled={!formData.bandId}
                    onChange={(e) => {
                      setSongSearchTerm(e.target.value);
                      setShowSongDropdown(true);
                    }}
                    onFocus={() => {
                      if (!formData.bandId) {
                        setErrorModal({
                          isOpen: true,
                          title: 'Elegí la banda primero',
                          message: 'Para agregar canciones necesitamos saber qué banda va a tocar — así sólo te ofrecemos como directores a quienes integran esa banda.',
                        });
                        return;
                      }
                      setShowSongDropdown(true);
                    }}
                    className="flex-1 bg-transparent outline-none text-sm disabled:cursor-not-allowed"
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
                            <Music size={16} className="text-gold-300" />
                            <div className="text-left">
                              <p className="font-medium text-sm">{song.title}</p>
                              <p className="text-xs text-gray-400">{song.artist}</p>
                            </div>
                          </div>
                          <Badge size="sm" variant="primary">{song.key}</Badge>
                        </button>
                      ))
                    ) : (
                      <EmptyState
                        className="!py-8"
                        icon={MagnifyingGlass}
                        title="No se encontraron canciones"
                        subtitle="Probá con otro nombre, artista o tonalidad."
                        annotation="Revisá el repertorio"
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        )}
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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-xl font-semibold">{formatDate(viewingOrder.date)}</h3>
                <p className="text-gray-400">{viewingOrder.time}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" icon={FileDown} onClick={() => runPdfExport(generateOrderPDF(viewingOrder))}>
                  Exportar PDF
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Printer}
                  onClick={() => runPdfExport(generateSongsPDF(viewingOrder))}
                  title="Imprimir canciones con acordes (una canción por página)"
                >
                  Imprimir
                </Button>
                {(isPastor || isLeader) && (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Edit}
                    onClick={() => { setIsDetailOpen(false); handleOpenModal(viewingOrder); }}
                  >
                    Editar
                  </Button>
                )}
                {(isPastor || isLeader) && (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={ListChecks}
                    onClick={() => { setIsDetailOpen(false); setSchemaModal({ isOpen: true, order: viewingOrder }); }}
                  >
                    {getServiceSchema(viewingOrder.id) ? 'Editar esquema' : 'Crear esquema'}
                  </Button>
                )}
                {(isPastor || isLeader || isSonido) && (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={SlidersHorizontal}
                    onClick={() => { setIsDetailOpen(false); setChannelPlanOrder(viewingOrder); }}
                  >
                    Plan de canales
                  </Button>
                )}
              </div>
            </div>

            {/* Ensayómetro: acceso al ensayo personal (glosario: el "ensamble"
                es el encuentro de la banda; el "ensayo" es la práctica personal
                previa). Solo tiene sentido para órdenes aún programados. */}
            {viewingOrder.status === 'scheduled' && (
              <Link
                to={`/practica/${viewingOrder.id}`}
                className="flex items-center gap-3 rounded-xl p-4 bg-gold-gradient text-black shadow-lg hover:brightness-105 transition-all"
              >
                <div className="p-2 rounded-lg bg-black/10 shrink-0">
                  <Target size={22} className="text-black" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">Practicar este orden</p>
                  <p className="text-sm text-black/80 truncate">
                    Tu ensayo personal: pasadas, letra, estructura y arreglos de cada canción
                  </p>
                </div>
                <ChevronRight size={20} className="shrink-0 text-black/70" />
              </Link>
            )}

            {/* Iniciar servicio: sólo si el orden tiene esquema. La RLS (ss_select) lo
                entrega a pastor/líder, a la banda del orden y a los observadores de área
                (can_open_service_presenter), así que si está en el store, este usuario
                puede verlo → el botón aparece solo para quien corresponde. */}
            {getServiceSchema(viewingOrder.id) && (
              <Link
                to={`/servicio/${viewingOrder.id}`}
                className="flex items-center gap-3 rounded-xl p-4 bg-neutral-900 border border-gold-500/40 text-gold-200 hover:bg-gold-500/10 transition-all"
              >
                <div className="p-2 rounded-lg bg-gold-500/15 shrink-0">
                  <Play size={22} className="text-gold-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">Iniciar servicio</p>
                  <p className="text-sm text-gold-300/70 truncate">El esquema de la reunión, paso a paso, con tiempos y letras</p>
                </div>
                <ChevronRight size={20} className="shrink-0 text-gold-300/70" />
              </Link>
            )}

            {/* Las DOS instancias del orden, APILADAS y COLAPSABLES en formato horizontal (tipo
                "Practicar este orden"): "Día de servicio" y "Día de ensamble". Cada una se
                despliega con sus opciones → mismo ancho y misma altura al colapsar, prolijo. */}
            <div className="space-y-2.5">
              {/* DÍA DE SERVICIO */}
              <CollapsibleSection
                testId="detail-service"
                className="border-gold-500/25 bg-gold-500/[0.04]"
                header={(
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="p-2 rounded-lg bg-gold-500/15 text-gold-200 shrink-0"><CalendarDots size={18} weight="duotone" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] uppercase tracking-wide text-gold-300/80 font-medium">Día de servicio</p>
                      <p className="text-sm font-medium first-letter:uppercase">{formatDate(viewingOrder.date)}{viewingOrder.time ? ` · ${viewingOrder.time}` : ''}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <Badge className={statusConfig[viewingOrder.status]?.bg}>
                          <span className={statusConfig[viewingOrder.status]?.color}>{statusConfig[viewingOrder.status]?.label}</span>
                        </Badge>
                        <span className="text-xs text-gray-400 truncate">{getBandById(viewingOrder.bandId)?.name || 'Banda eliminada'} · {getMeetingTypeLabel(viewingOrder.meetingType)}</span>
                      </div>
                    </div>
                  </div>
                )}
              >
                {(isPastor || isLeader) ? (
                  <div className="flex flex-wrap gap-2">
                    {viewingOrder.status !== 'completed' && (
                      <Button variant="secondary" size="sm" icon={CheckCircle} onClick={() => handleChangeStatus(viewingOrder, 'completed')}>Marcar realizado</Button>
                    )}
                    {viewingOrder.status !== 'cancelled' && (
                      <Button variant="secondary" size="sm" icon={XCircle} onClick={() => handleChangeStatus(viewingOrder, 'cancelled')}>Cancelar servicio</Button>
                    )}
                    {viewingOrder.status !== 'scheduled' && (
                      <Button variant="secondary" size="sm" icon={RotateCcw} onClick={() => handleChangeStatus(viewingOrder, 'scheduled')}>Reabrir</Button>
                    )}
                  </div>
                ) : null}
              </CollapsibleSection>

              {/* DÍA DE ENSAMBLE: estado (activo / suspendido) + Suspender/Reactivar (ensamble de
                  hoy/futuro) / Reprogramar (también si ya pasó) para pastor/líder de su banda con el
                  orden programado. No se muestra activo en un orden cancelado (cancelar arrastra). */}
              {viewingOrder.rehearsalDate && viewingOrder.status !== 'cancelled' ? (() => {
                const suspended = viewingOrder.rehearsalSuspended;
                const isManager = isPastor
                  || (isLeader && getBandById(viewingOrder.bandId)?.members?.includes(currentMember?.id));
                const isPast = viewingOrder.rehearsalDate < localTodayStr();
                // Espeja las RPCs: Suspender/Reactivar exigen ensamble de hoy o futuro; Reprogramar
                // solo exige que la fecha NUEVA no sea pasada → un ensamble que YA PASÓ (orden aún
                // programado) conserva su opción de reprogramarlo. Así el card siempre se despliega
                // con las opciones propias del ensamble para pastor/líder de la banda.
                const canManage = isManager && viewingOrder.status === 'scheduled';
                const canToggle = canManage && !isPast;
                const hasContent = canManage || (suspended && viewingOrder.rehearsalSuspendedReason);
                return (
                  <CollapsibleSection
                    testId="detail-rehearsal"
                    className={suspended ? 'border-rose-500/40 bg-rose-500/[0.07]' : 'border-amber-500/30 bg-amber-500/[0.07]'}
                    header={(
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`p-2 rounded-lg shrink-0 ${suspended ? 'bg-rose-500/15 text-rose-300' : 'bg-amber-500/15 text-amber-300'}`}>
                          {suspended ? <Ban size={18} /> : <CalendarClock size={18} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-[11px] uppercase tracking-wide font-medium ${suspended ? 'text-rose-300/90' : 'text-amber-300/80'}`}>
                            {suspended ? 'Ensamble suspendido' : 'Día de ensamble'}
                          </p>
                          <p className={`text-sm font-medium first-letter:uppercase ${suspended ? 'line-through text-gray-400' : ''}`}>
                            {formatDate(viewingOrder.rehearsalDate)}{viewingOrder.rehearsalTime ? ` · ${viewingOrder.rehearsalTime}` : ''}
                          </p>
                        </div>
                      </div>
                    )}
                  >
                    {hasContent ? (
                      <div className="space-y-2.5">
                        {suspended && viewingOrder.rehearsalSuspendedReason && (
                          <div>
                            <button type="button" className="text-xs text-rose-300 underline" onClick={() => setRehearsalReasonOpen((v) => !v)}>
                              {rehearsalReasonOpen ? 'Ocultar motivo' : 'Ver motivo'}
                            </button>
                            {rehearsalReasonOpen && (
                              <p className="mt-1 text-sm text-gray-300 whitespace-pre-wrap">{viewingOrder.rehearsalSuspendedReason}</p>
                            )}
                          </div>
                        )}
                        {canManage && (
                          <div className="space-y-2">
                            {isPast && (
                              <p className="text-xs text-gray-400" data-testid="detail-rehearsal-past">
                                Este ensamble ya pasó. Si hace falta, podés reprogramarlo para otro día.
                              </p>
                            )}
                            <div className="flex flex-wrap gap-2">
                              {canToggle && (suspended ? (
                                <Button variant="secondary" size="sm" icon={RotateCcw} onClick={() => setRehearsalModal({ isOpen: true, order: viewingOrder, mode: 'resume' })}>Reactivar</Button>
                              ) : (
                                <Button variant="secondary" size="sm" icon={Ban} onClick={() => setRehearsalModal({ isOpen: true, order: viewingOrder, mode: 'suspend' })}>Suspender</Button>
                              ))}
                              <Button variant="secondary" size="sm" icon={CalendarClock} onClick={() => setRehearsalModal({ isOpen: true, order: viewingOrder, mode: 'reschedule' })}>Reprogramar</Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </CollapsibleSection>
                );
              })() : (
                <CollapsibleSection
                  testId="detail-rehearsal-empty"
                  header={(
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="p-2 rounded-lg bg-white/[0.04] text-gray-500 shrink-0"><CalendarClock size={18} /></div>
                      <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">Día de ensamble</p>
                        <p className="text-sm text-gray-400">
                          {viewingOrder.status === 'cancelled'
                            ? 'El servicio está cancelado.'
                            : `Sin ensamble programado${(isPastor || isLeader) ? ' · programalo desde “Editar”.' : '.'}`}
                        </p>
                      </div>
                    </div>
                  )}
                />
              )}
            </div>

            {/* Formación del servicio (colapsable) */}
            <CollapsibleSection icon={UsersThree} title="Formación" count={getOrderParticipants(viewingOrder).length} testId="detail-lineup">
              {(isPastor || isLeader) && getBandById(viewingOrder.bandId) && (
                <div className="mb-3">
                  <Button variant="secondary" size="sm" icon={UsersThree} onClick={() => setLineupModal({ isOpen: true, order: viewingOrder })} data-testid="detail-lineup-edit">
                    {isCustomLineup(viewingOrder) ? 'Editar formación' : 'Definir formación'}
                  </Button>
                </div>
              )}
              <LineupSummary order={viewingOrder} />
            </CollapsibleSection>

            {/* Canciones (colapsable, abierta por defecto: es el corazón del orden) */}
            <CollapsibleSection icon={Music} title="Canciones" count={viewingOrder.songs.length} defaultOpen>
              <div className="space-y-3">
                {viewingOrder.songs.map((songRef, index) => {
                  const song = getSongById(songRef.songId);
                  const director = getMemberById(songRef.directorId);
                  return (
                    <div key={index} className="flex items-center gap-4 p-3 bg-neutral-800/50 rounded-xl">
                      <span className="w-8 h-8 rounded-full bg-gold-500/15 text-gold-300 flex items-center justify-center font-medium">
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
            </CollapsibleSection>

            {isPastor && (
              <CollapsibleSection title="Devolución del Pastor" defaultOpen={!!viewingOrder.feedback}>
                <textarea
                  className="w-full h-24 bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-gold-500/40"
                  placeholder="Agregar comentarios sobre la ejecución del servicio..."
                  value={viewingOrder.feedback || ''}
                  onChange={(e) => handleUpdateFeedback(viewingOrder.id, e.target.value)}
                />
              </CollapsibleSection>
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

      {/* Formación: edición desde el detalle (líder/pastor). `viewingOrder` es una
          foto, no el store → se parchea al guardar (como handleChangeStatus). */}
      <LineupModal
        isOpen={lineupModal.isOpen}
        order={lineupModal.order}
        onClose={() => setLineupModal({ isOpen: false, order: null })}
        onSaved={(fresh) => setViewingOrder((prev) => (prev && prev.id === fresh.id ? { ...prev, lineup: fresh.lineup } : prev))}
      />

      <RehearsalActionModal
        order={rehearsalModal.order}
        mode={rehearsalModal.mode}
        isOpen={rehearsalModal.isOpen}
        onClose={() => setRehearsalModal({ isOpen: false, order: null, mode: null })}
        onDone={({ mode, reason, date, time }) => {
          setRehearsalReasonOpen(false);
          setViewingOrder((prev) => {
            if (!prev || !rehearsalModal.order || prev.id !== rehearsalModal.order.id) return prev;
            if (mode === 'suspend') return { ...prev, rehearsalSuspended: true, rehearsalSuspendedReason: reason, rehearsalSuspendedAt: new Date().toISOString() };
            if (mode === 'resume') return { ...prev, rehearsalSuspended: false, rehearsalSuspendedReason: null, rehearsalSuspendedAt: null };
            if (mode === 'reschedule') return { ...prev, rehearsalDate: date, rehearsalTime: time, rehearsalSuspended: false, rehearsalSuspendedReason: null, rehearsalSuspendedAt: null };
            return prev;
          });
        }}
      />

      {/* Radiografía del repertorio (solo lectura) */}
      <RepertoireInsightsModal isOpen={showInsights} onClose={() => setShowInsights(false)} />

      {schemaModal.order && (
        <SchemaBuilderModal
          order={schemaModal.order}
          isOpen={schemaModal.isOpen}
          onClose={() => setSchemaModal({ isOpen: false, order: null })}
        />
      )}

      {channelPlanOrder && (
        <ChannelPlanModal
          order={channelPlanOrder}
          isOpen={!!channelPlanOrder}
          onClose={() => setChannelPlanOrder(null)}
          canEdit={isPastor || isLeader || isSonido}
        />
      )}

      {isPastor && (
        <TemplateManagerModal isOpen={showTemplates} onClose={() => setShowTemplates(false)} />
      )}
    </div>
  );
};
