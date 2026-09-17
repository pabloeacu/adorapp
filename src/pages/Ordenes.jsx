import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  Plus, Music, Clock, Copy, Activity,
  MessageSquare, Eye, Trash2, Search, Check, X,
  User, Zap, AlertCircle, FileDown, History, Award,
  FileText, Printer, Copy as CopyIcon,
  Edit, CheckCircle, XCircle, RotateCcw, Target, ChevronRight, ListChecks, Play, CalendarClock, SlidersHorizontal, Ban,
  Link2, Unlink
} from 'lucide-react';
import {
  CalendarDots,
  CalendarBlank,
  MusicNotes as MusicNotesDuo,
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
import { OrderCard } from '../components/orders/OrderCard';
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
import { isChunkLoadError, recoverFromStaleChunk } from '../lib/chunkRecovery';
import { CollapsibleSection } from '../components/ui/CollapsibleSection';
import { buildLineup, lineupSummaryText, isCustomLineup, directorIdsOf, pendingChoiceIds } from '../lib/lineup';
import { numberOrderSongs, addEnganchadaAfter, unlinkEnganchada, normalizeEnganchadas, moveOrderSongs } from '../lib/orderNumbering';
import { generateOrderPdf, generateSongsPdf } from '../lib/orderPdf';

// Id estable por-fila para el drag-and-drop Y para matchear escrituras asíncronas
// (fetchKeyHistory) a la canción correcta AUNQUE se inserte una enganchada en el
// medio y corra los índices. Se stripea al guardar (stripSongRefs). No es la clave
// del negocio, solo del cliente.
const genLocalId = () => (typeof crypto !== 'undefined' && crypto.randomUUID)
  ? crypto.randomUUID()
  : `lid-${Date.now()}-${Math.random()}`;

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
  const { orders, bands, songs, members, bandTemporaryMembers, addOrder, updateOrder, deleteOrder, cloneOrder, getUnusedByBand, getSongById, getBandById, getMemberById, getBandMembers, getEffectiveBandMemberIds, getServiceSchema, getOrderParticipants } = useAppStore();
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

  // Key history feature
  const [keyHistoryLoading, setKeyHistoryLoading] = useState(false);
  const [keyHistoryTooltip, setKeyHistoryTooltip] = useState(null);

  // Devolución del Pastor: borrador LOCAL + autoguardado con debounce. Antes se
  // escribía en la base POR CADA TECLA (a ciegas, sin await, sin avisar si fallaba,
  // y sin mostrar lo tipeado porque el textarea estaba atado a viewingOrder.feedback).
  const [feedbackDraft, setFeedbackDraft] = useState('');
  const [feedbackSaveState, setFeedbackSaveState] = useState('idle'); // idle|saving|saved|error
  const feedbackTimer = useRef(null);
  // Guardado pendiente {orderId, feedback} en un ref: así el flush no depende de que
  // viewingOrder siga cargado (el gesto "atrás" puede cerrar el detalle sin blur).
  const pendingFeedback = useRef(null);
  // Guarda la devolución UNA vez (no por tecla), espera el resultado y avisa si falló.
  // `feedback` no es campo de contenido → updateOrder no da falso choque de concurrencia
  // (re-aplica sobre lo fresco). Patchea viewingOrder para que el PDF y la vista lean el
  // valor recién guardado. (Definido ANTES de los efectos que lo usan — no-use-before-define.)
  const saveFeedback = async (orderId, feedback) => {
    setFeedbackSaveState('saving');
    const res = await updateOrder(orderId, { feedback });
    setFeedbackSaveState(res ? 'saved' : 'error');
    if (res) setViewingOrder(prev => (prev && prev.id === orderId ? { ...prev, feedback } : prev));
  };
  const handleFeedbackChange = (orderId, value) => {
    setFeedbackDraft(value);              // se muestra al instante
    setFeedbackSaveState('saving');
    pendingFeedback.current = { orderId, feedback: value };
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => {
      feedbackTimer.current = null;
      const p = pendingFeedback.current; pendingFeedback.current = null;
      if (p) saveFeedback(p.orderId, p.feedback);
    }, 700);
  };
  const flushFeedback = () => {
    if (feedbackTimer.current) { clearTimeout(feedbackTimer.current); feedbackTimer.current = null; }
    const p = pendingFeedback.current; pendingFeedback.current = null;
    if (p) saveFeedback(p.orderId, p.feedback); // persiste ya lo que quedó pendiente
  };
  // Sincroniza el borrador al abrir/cambiar de orden (por id, no por cada patch de viewingOrder).
  useEffect(() => {
    setFeedbackDraft(viewingOrder?.feedback || '');
    setFeedbackSaveState('idle');
  }, [viewingOrder?.id]);
  // Al cerrar el detalle (incluido el gesto "atrás", que no dispara onBlur) o desmontar,
  // persistir cualquier borrador pendiente para no perder ni una tecla.
  useEffect(() => {
    if (!isDetailOpen) flushFeedback();
  }, [isDetailOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { flushFeedback(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
  // Opciones del selector de canciones (el buscador vive dentro de la hoja del SelectMenu,
  // indistinto a tildes vía src/lib/searchText.js: título, artista y tonalidad).
  const songPickerOptions = useMemo(
    () => songs.map((song) => ({ value: song.id, label: song.title || '', sublabel: song.artist || '', badge: song.key || '' })),
    [songs]
  );

  const handleOpenModal = (order = null) => {
    if (order) {
      // Editar: precargar los datos de la orden existente.
      setEditingOrder(order);
      setFormData({
        date: order.date || '',
        time: order.time || '20:00',
        bandId: order.bandId || null,
        meetingType: order.meetingType || 'culto_general',
        // Al editar, cada canción recibe un _localId estable (las órdenes guardadas
        // NO lo traen: stripSongRefs lo quita) → así el DnD y las escrituras async
        // (fetchKeyHistory) matchean la fila correcta aunque se inserte una enganchada.
        songs: order.songs ? order.songs.map(s => ({ ...s, _localId: s._localId || genLocalId() })) : [],
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
    // El buscador de canciones vive dentro del SelectMenu (se blanquea al abrirse).
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
    e?.preventDefault?.();
    if (!formData.date || !formData.bandId) return;

    // La hora del servicio es obligatoria (la base también la exige: NOT NULL).
    if (!formData.time || !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(formData.time)) {
      setErrorModal({
        isOpen: true,
        title: 'Falta la hora',
        message: 'Indicá la hora de inicio del servicio: los avisos y el banner de ministración dependen de ella.',
      });
      return;
    }

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

    // OBLIGATORIO antes de crear (pedido de Paul): cada integrante con
    // instrumentos en su ficha debe tener AL MENOS uno elegido (puede elegir más
    // de uno). Bloquea el guardado — no es una advertencia salteable. Solo aplica
    // a la creación con formación custom.
    if (!editingOrder && lineupDraft.mode === 'custom') {
      const membersById = new Map((getBandMembers(formData.bandId) || []).map((m) => [m.id, m]));
      const pendingCount = pendingChoiceIds(lineupDraft.members, membersById, directorIdsOf(formData.songs)).size;
      if (pendingCount > 0) {
        setErrorModal({
          isOpen: true,
          title: 'Falta elegir el instrumento',
          message: `Antes de guardar el orden, elegí con qué toca cada integrante marcado en ámbar (${pendingCount === 1 ? 'falta 1' : `faltan ${pendingCount}`}). Tiene que ser al menos uno — podés elegir más de uno si toca varios.`,
        });
        return;
      }
    }

    setLineupSaving(true);

    let orderId;
    if (editingOrder) {
      // Editar: updateOrder mergea el partial con el snapshot del store antes
      // del converter (sin DATA-LOSS). rehearsal_reminder_sent NO se toca (lo
      // maneja el cron). Además, guarda de concurrencia: si otra persona cambió
      // el contenido mientras editabas, NO se pisa — se avisa y se cierra tu
      // edición para que la reapliques sobre la versión actual.
      const res = await updateOrder(editingOrder.id, orderPayload, editingOrder.contentChangedAt);
      if (res && res.__conflict) {
        setLineupSaving(false);
        handleCloseModal();
        setErrorModal({
          isOpen: true,
          title: 'Otra persona editó este orden',
          message: 'Mientras lo tenías abierto, alguien más cambió este orden. Lo actualizamos a la última versión y cerramos tu edición para que no se pierda nada. Volvé a abrirlo y aplicá tus cambios sobre lo que ya está guardado.',
        });
        return;
      }
      if (!res) {
        setLineupSaving(false);
        setErrorModal({
          isOpen: true,
          title: 'No se pudo guardar el orden',
          message: useAppStore.getState().error || 'Intentá de nuevo. Si el problema sigue, avisale al pastor.',
        });
        return;
      }
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

  // Export order summary (without chords)
  // Surface PDF-generation failures instead of letting the async rejection die
  // silently (same class of bug fixed in the Repertorio export).
  const runPdfExport = (promise) => {
    Promise.resolve(promise).catch((err) => {
      // jsPDF se carga por import() dinámico: tras una publicación el chunk viejo ya no
      // existe → recargar una vez (versión nueva) en vez de "No se pudo generar el PDF".
      if (isChunkLoadError(err) && recoverFromStaleChunk()) return;
      console.error('Error generating PDF:', err);
      setErrorModal({
        isOpen: true,
        title: 'Error',
        message: 'No se pudo generar el PDF. Intentá de nuevo.'
      });
    });
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
    // Stable client-side id: sirve al drag-and-drop Y para que la escritura async
    // del historial de tono caiga en ESTA fila aunque se inserte una enganchada
    // en el medio (que corre los índices) antes de que resuelva el fetch.
    const localId = genLocalId();

    setFormData(prev => ({
      ...prev,
      songs: [...prev.songs, {
        songId: song.id,
        directorId: suggestedDirectorId,
        key: defaultKey,
        _pendingHistory: true,
        _suggestedDirector: !!suggestedDirectorId,
        _localId: localId,
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
            songs: prev.songs.map((s) =>
              s._localId === localId ? { ...s, key: result.key } : s
            )
          }));
        }
      }).catch(() => {});
    }
  };

  // Agrega una canción ENGANCHADA justo debajo de `afterIndex` (mismo trato que una
  // canción normal —director sugerido, tono, historial— con la marca `enganchada:true`).
  // La marca sobrevive a stripSongRefs (sin `_`) y se numera como inciso (2.a/2.b).
  const addEnganchadaToOrder = async (afterIndex, song) => {
    const singerIds = new Set(singers.map((s) => s.id));
    const suggestedDirectorId = suggestDirectorForSong({ singerIds, orders, songId: song.id, bandId: formData.bandId });
    const defaultKey = song.key || song.originalKey || 'C';
    const localId = genLocalId();
    const newRef = {
      songId: song.id,
      directorId: suggestedDirectorId,
      key: defaultKey,
      _pendingHistory: true,
      _suggestedDirector: !!suggestedDirectorId,
      _localId: localId,
      enganchada: true,
    };
    setFormData(prev => ({ ...prev, songs: addEnganchadaAfter(prev.songs, afterIndex, newRef) }));
    setShowUnused(false);
    if (suggestedDirectorId) {
      // Matchear por _localId (no por índice) porque la inserción corre las posiciones.
      fetchKeyHistory(suggestedDirectorId, song.id).then(result => {
        if (result.found) {
          setFormData(prev => ({
            ...prev,
            songs: prev.songs.map((s) => (s._localId === localId ? { ...s, key: result.key } : s)),
          }));
        }
      }).catch(() => {});
    }
  };

  // Handle director change - fetch key history and update.
  // `localId` = _localId de la fila: la escritura ASYNC del tono matchea por _localId
  // (no por índice) para no caer en la fila equivocada si se insertó una enganchada
  // en el medio mientras el fetch estaba en vuelo. Fallback a índice por defensa.
  const handleDirectorChange = (index, directorId, songId, localId) => {
    const matchRow = (s, i) => (localId ? s._localId === localId : i === index);
    // Update directorId immediately (síncrono → el índice es válido en este instante).
    setFormData(prev => {
      const newSongs = prev.songs.map((s, i) =>
        matchRow(s, i) ? { ...s, directorId } : s
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
              matchRow(s, i) ? { ...s, key: result.key } : s
            )
          }));
        } else {
          // First time - use original key from song
          const originalKey = song?.key || song?.originalKey || 'C';
          setFormData(prev => ({
            ...prev,
            songs: prev.songs.map((s, i) =>
              matchRow(s, i) ? { ...s, key: originalKey } : s
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
      // Arrastrar una canción MADRE mueve todo su grupo (ella + sus enganchadas)
      // y nunca parte el grupo de otra; una enganchada sola viaja libre y se
      // engancha a la que le quede arriba. `moveOrderSongs` también normaliza
      // (una enganchada no puede quedar arriba de todo). Ver src/lib/orderNumbering.js.
      return { ...prev, songs: moveOrderSongs(prev.songs, oldIndex, newIndex) };
    });
  };

  const removeSongFromOrder = (index) => {
    setFormData(prev => ({
      ...prev,
      // Quitar una canción puede dejar una enganchada arriba de todo → normalizar.
      songs: normalizeEnganchadas(prev.songs.filter((_, i) => i !== index)),
    }));
    setKeyHistoryTooltip(null);
  };

  // Quita el enganche de una canción (vuelve a tener número propio) — para corregir.
  const unlinkSongInOrder = (index) => {
    setFormData(prev => ({ ...prev, songs: unlinkEnganchada(prev.songs, index) }));
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
    return parseLocalDate(dateStr).toLocaleDateString('es-AR', {
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

  // Los generadores de PDF viven en src/lib/orderPdf.js (funciones puras que reciben el
  // `order` y un `ctx` con los getters/helpers de acá). Wrappers finos que arman el ctx,
  // para que los call-sites (runPdfExport(generateOrderPDF(order))) no cambien.
  const pdfCtx = () => ({
    getBandById, getSongById, getMemberById, getOrderParticipants,
    formatDate, getMeetingTypeLabel, parseLocalDate, isPastor,
  });
  const generateOrderPDF = (order) => generateOrderPdf(order, pdfCtx());
  const generateSongsPDF = (order) => generateSongsPdf(order, pdfCtx());

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
          ? parseLocalDate(order.date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
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

  // Dependencias que la tarjeta de orden (OrderCard, extraída a components/orders)
  // necesita: helpers, flags de rol y handlers que viven en este componente.
  const orderCardCtx = {
    getBandById, getSongById, getOrderParticipants,
    statusConfig, formatDate, isCustomLineup, numberOrderSongs,
    isPastor, isLeader,
    handleViewOrder, runPdfExport, generateOrderPDF, generateSongsPDF,
    handleOpenModal, handleCloneOrder, handleDeleteOrder,
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
        {filteredOrders.map((order) => (
          <OrderCard key={order.id} order={order} ctx={orderCardCtx} />
        ))}
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
                  {numberOrderSongs(formData.songs).map((meta, index) => {
                    const songRef = meta.songRef;
                    const song = getSongById(songRef.songId);
                    const rowId = songRef._localId || `${songRef.songId}-${index}`;
                    return (
                      <SortableSongRow key={rowId} id={rowId}>
                        <div className={`flex flex-wrap items-center gap-3 p-3 rounded-xl ${meta.isEnganchada ? 'bg-neutral-800/60 border-l-2 border-gold-500/50' : 'bg-neutral-800'}`}>
                    <span className={`h-6 min-w-6 px-1.5 rounded-full flex items-center justify-center text-xs shrink-0 font-medium ${meta.isEnganchada ? 'bg-gold-500/15 text-gold-300' : 'bg-neutral-700'}`}>
                      {meta.displayNumber}
                    </span>
                    <div className="flex-1 min-w-0 basis-32">
                      <p className="font-medium truncate flex items-center gap-1.5">
                        <span className="truncate">{song?.title}</span>
                        {meta.hasLinkedBelow && <Link2 size={13} className="shrink-0 text-gold-400" aria-label="Tiene una canción enganchada debajo" />}
                      </p>
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-xs text-gray-400 truncate">{song?.artist}</p>
                        {meta.isEnganchada && <span className="shrink-0 text-[10px] font-semibold text-gold-300 uppercase tracking-wide">enganchada</span>}
                      </div>
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
                          handleDirectorChange(index, newDirectorId, songRef.songId, songRef._localId);
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
                    {/* Enganchar: agrega una canción ligada JUSTO DEBAJO de esta (inciso 2.a/2.b). */}
                    <SelectMenu
                      searchable
                      value=""
                      menuWidth={320}
                      options={songPickerOptions}
                      icon={Link2}
                      iconOnly
                      triggerTitle="Enganchar una canción debajo de esta"
                      triggerClassName="p-2 text-gold-400/80 hover:text-gold-300 shrink-0"
                      searchPlaceholder="Buscar canción para enganchar…"
                      emptyText="No se encontraron canciones."
                      testId={`enganchar-${index}`}
                      onChange={(id) => { const s = songs.find((x) => x.id === id); if (s) addEnganchadaToOrder(index, s); }}
                    />
                    {meta.isEnganchada && (
                      <button
                        type="button"
                        onClick={() => unlinkSongInOrder(index)}
                        title="Quitar el enganche (que vuelva a tener número propio)"
                        aria-label="Quitar el enganche"
                        className="p-2 text-gray-400 hover:text-gold-300 shrink-0"
                      >
                        <Unlink size={16} />
                      </button>
                    )}
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
            <div className="mt-4">
              <label className="text-xs text-gray-400 block mb-2">Agregar canción del repertorio</label>
              <div>
                {/* Buscador de canciones con el MISMO método que Banda/Director/Tono (SelectMenu
                    con buscador adentro de la hoja): en el celular la lista scrollea en la hoja
                    inferior, no queda atrapada dentro del modal. Sin banda, explica por qué. */}
                <SelectMenu
                  icon={Search}
                  value=""
                  placeholder={formData.bandId ? 'Buscar canción por nombre, artista o tonalidad...' : 'Primero elegí la banda…'}
                  searchable
                  searchPlaceholder="Buscar canción por nombre, artista o tonalidad..."
                  emptyText="No se encontraron canciones. Probá con otro nombre, artista o tonalidad."
                  testId="order-song-picker"
                  beforeOpen={() => {
                    // Block adding songs until a band is chosen: the director
                    // dropdown derives its options from the band, so without
                    // a band the song row would offer an empty director list.
                    if (!formData.bandId) {
                      setErrorModal({
                        isOpen: true,
                        title: 'Elegí la banda primero',
                        message: 'Para agregar canciones necesitamos saber qué banda va a tocar — así sólo te ofrecemos como directores a quienes integran esa banda.',
                      });
                      return false;
                    }
                    return true;
                  }}
                  options={songPickerOptions}
                  onChange={(id) => { const song = songs.find((x) => x.id === id); if (song) addSongToOrder(song); }}
                />
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
            {viewingOrder.status === 'scheduled' && (isPastor || (currentMember?.id && getEffectiveBandMemberIds(viewingOrder.bandId).has(currentMember.id))) && (
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
                {numberOrderSongs(viewingOrder.songs).map((meta, index) => {
                  const songRef = meta.songRef;
                  const song = getSongById(songRef.songId);
                  const director = getMemberById(songRef.directorId);
                  return (
                    <div key={index} className={`flex items-center gap-4 p-3 rounded-xl ${meta.isEnganchada ? 'bg-neutral-800/40 border-l-2 border-gold-500/50 ml-3' : 'bg-neutral-800/50'}`}>
                      <span className="h-8 min-w-8 px-2 rounded-full bg-gold-500/15 text-gold-300 flex items-center justify-center font-medium shrink-0">
                        {meta.displayNumber}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium flex items-center gap-1.5">
                          <span className="truncate">{song?.title}</span>
                          {meta.hasLinkedBelow && <Link2 size={15} className="shrink-0 text-gold-400" aria-label="Tiene una canción enganchada debajo" />}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-400">
                          <Badge size="sm" variant="primary">Tono: {songRef.key}</Badge>
                          {meta.isEnganchada && <Badge size="sm" variant="secondary">Enganchada</Badge>}
                          {songRef.ministracion && <Badge size="sm" variant="warning">Ministración</Badge>}
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
                  value={feedbackDraft}
                  onChange={(e) => handleFeedbackChange(viewingOrder.id, e.target.value)}
                  onBlur={() => flushFeedback()}
                />
                <div className="mt-1 h-4 text-xs flex items-center gap-1" aria-live="polite">
                  {feedbackSaveState === 'saving' && (<span className="flex items-center gap-1 text-gray-400"><Clock size={12} className="animate-pulse" /> Guardando…</span>)}
                  {feedbackSaveState === 'saved' && (<span className="flex items-center gap-1 text-green-400"><CheckCircle size={12} /> Guardado</span>)}
                  {feedbackSaveState === 'error' && (<span className="flex items-center gap-1 text-red-400"><AlertCircle size={12} /> No se pudo guardar. Reintentá.</span>)}
                </div>
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
