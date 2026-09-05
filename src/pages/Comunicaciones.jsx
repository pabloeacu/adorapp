// AdorAPP - Centro de Avivamiento Familiar
// Communications Page - Send messages to members
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Send, X, Check, Loader2, AlertCircle, Mail, ChevronLeft, Save, Bell, Bold, Italic, Underline, Smile } from 'lucide-react';
import { EnvelopeSimple, MicrophoneStage, UsersThree, IdentificationBadge, UsersFour } from '@phosphor-icons/react';
import { useAuthStore } from '../stores/authStore';
import { useAppStore } from '../stores/appStore';
import { callAdminFunction, supabase } from '../lib/supabase';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';

// Variables que cada plantilla de correo rellena en el momento del envío. Se
// muestran como ayuda; el pastor edita la COPIA, no las variables ni las URLs
// (esas las arma el sistema — si las tocara, se romperían los enlaces).
const TEMPLATE_VARS = {
  'registro-pendiente': ['nombre'],
  'registro-aprobado': ['nombre', 'email', 'password', 'url_login', 'url_manual'],
  'nuevo-orden': ['nombre', 'fecha', 'banda_sufijo', 'url'],
  'recordatorio-ensayo': ['nombre', 'fecha', 'url'],
};
// Emojis curados para la barra de formato del mensaje (contexto del ministerio).
const MESSAGE_EMOJIS = [
  '🙏', '🙌', '👏', '❤️', '✨', '🔥', '🎉', '🎊',
  '🎶', '🎵', '🎸', '🎤', '🥁', '🎹', '😊', '😄',
  '🤗', '💪', '🌟', '⛪', '📅', '⏰', '✅', '➡️',
];

// Campos de copia editables por el pastor (no exponemos slug, cta_url, from_label…).
const EDITABLE_FIELDS = [
  { key: 'asunto', label: 'Asunto', type: 'text' },
  { key: 'titulo', label: 'Título', type: 'text' },
  { key: 'cuerpo_html', label: 'Cuerpo', type: 'textarea', hint: 'Podés usar {{variables}} y saltos con <br>.' },
  { key: 'cta_text', label: 'Texto del botón', type: 'text', hint: 'Dejalo vacío si el correo no lleva botón.' },
  { key: 'firma', label: 'Firma', type: 'text' },
];

export const Comunicaciones = () => {
  useDocumentTitle('Comunicaciones');
  const { profile } = useAuthStore();
  const { bands, members, bandTemporaryMembers, getEffectiveBandMemberIds } = useAppStore();
  const isPastor = profile?.role === 'pastor';

  // Form state
  const [recipientType, setRecipientType] = useState(''); // 'bands' | 'users' | 'roles' | 'all'
  const [selectedBands, setSelectedBands] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [selectedRoles, setSelectedRoles] = useState([]);
  const [subject, setSubject] = useState('');
  // Mensaje con formato (negrita/cursiva/subrayado/emoji). El editor contentEditable
  // NO es controlado por React (re-render rompería el cursor): la fuente de verdad
  // vive en el DOM (editorRef) y estos estados son espejos para validar/contar.
  // El HTML se sanitiza SIEMPRE server-side (admin-send-communication) — acá solo UX.
  const editorRef = useRef(null);
  const emojiPickerRef = useRef(null); // panel de emojis (para cerrar por click afuera)
  const emojiButtonRef = useRef(null); // botón que abre/cierra el panel
  const [messagePlain, setMessagePlain] = useState('');
  const [fmtState, setFmtState] = useState({ bold: false, italic: false, underline: false });
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const MESSAGE_MAX = 1000;
  const overLimit = messagePlain.length > MESSAGE_MAX;
  const [isSending, setIsSending] = useState(false);
  // Canales de envío: campanita (push) y/o correo. Al menos uno.
  const [channels, setChannels] = useState({ push: true, mail: false });

  // --- Editor de mensaje: helpers -------------------------------------------
  const syncFromEditor = () => {
    const el = editorRef.current;
    if (!el) return;
    // Si quedó "vacío decorativo" (<br> o <div><br></div> tras borrar todo),
    // limpiarlo para que el placeholder CSS (:empty) reaparezca.
    if (el.innerText.trim() === '' && el.innerHTML !== '') {
      el.innerHTML = '';
    }
    setMessagePlain(el.innerText);
  };

  const refreshToolbarState = () => {
    try {
      setFmtState({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
      });
    } catch { /* queryCommandState puede tirar en algunos contextos; irrelevante */ }
  };

  // Si el foco/cursor no está dentro del editor, enfocarlo con el cursor al final
  // (así los botones de la barra y los emojis siempre actúan en un lugar sensato).
  const ensureEditorFocus = () => {
    const el = editorRef.current;
    if (!el) return;
    const sel = window.getSelection();
    const inside = sel && sel.anchorNode && el.contains(sel.anchorNode);
    el.focus();
    if (!inside) {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  };

  const applyFormat = (command) => {
    ensureEditorFocus();
    document.execCommand(command);
    syncFromEditor();
    refreshToolbarState();
  };

  const insertEmoji = (emoji) => {
    ensureEditorFocus();
    const current = editorRef.current?.innerText ?? '';
    if (current.length + emoji.length > MESSAGE_MAX) return;
    document.execCommand('insertText', false, emoji);
    syncFromEditor();
  };

  const handleEditorKeyDown = (e) => {
    const plain = editorRef.current?.innerText ?? '';
    if (plain.length < MESSAGE_MAX) return;
    // Al tope: bloquear teclas que agregan contenido, salvo que haya selección
    // (reemplazar selección no agranda) o modificadores (atajos como Cmd+A/C/B).
    const sel = window.getSelection();
    const hasSelection = sel && !sel.isCollapsed && editorRef.current?.contains(sel.anchorNode);
    const addsContent = e.key.length === 1 || e.key === 'Enter';
    if (addsContent && !hasSelection && !e.metaKey && !e.ctrlKey) e.preventDefault();
  };

  // Pegar SIEMPRE como texto plano: evita que entre HTML basura (Word, webs) y
  // mantiene el formato bajo control de la barra. Truncado al espacio disponible.
  const handleEditorPaste = (e) => {
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') ?? '';
    const current = editorRef.current?.innerText ?? '';
    const room = Math.max(0, MESSAGE_MAX - current.length);
    if (room === 0) return;
    document.execCommand('insertText', false, text.slice(0, room));
    syncFromEditor();
  };

  // Soltar (drag&drop) SIEMPRE como texto plano: el default del navegador insertaría
  // HTML/imagen crudos (esquivaría el pegado-como-texto y el tope), y esa basura
  // saldría literal en el correo. preventDefault corta el default y reinsertamos
  // solo el texto, truncado al espacio disponible (mismo criterio que el pegado).
  const handleEditorDrop = (e) => {
    e.preventDefault();
    const text = e.dataTransfer?.getData('text/plain') ?? '';
    if (!text) return;
    ensureEditorFocus();
    const current = editorRef.current?.innerText ?? '';
    const room = Math.max(0, MESSAGE_MAX - current.length);
    if (room === 0) return;
    document.execCommand('insertText', false, text.slice(0, room));
    syncFromEditor();
  };

  // Cerrar el picker de emojis al tocar fuera, SIN tragarse ese toque (el overlay
  // bloqueante anterior se comía el primer click sobre la barra/editor). Un listener
  // a nivel documento cierra el panel y deja pasar el click a su destino real.
  useEffect(() => {
    if (!showEmojiPicker) return;
    const onDocPointerDown = (e) => {
      if (emojiPickerRef.current?.contains(e.target)) return;
      if (emojiButtonRef.current?.contains(e.target)) return;
      setShowEmojiPicker(false);
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    return () => document.removeEventListener('pointerdown', onDocPointerDown);
  }, [showEmojiPicker]);

  // Modal states
  const [showSuccess, setShowSuccess] = useState(false);
  const [sentSummary, setSentSummary] = useState(''); // resumen por canal del último envío
  const [showError, setShowError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Recipient selection modals
  const [showBandSelector, setShowBandSelector] = useState(false);
  const [showUserSelector, setShowUserSelector] = useState(false);

  // --- Email templates (Plantillas de correo) ---
  const [view, setView] = useState('enviar'); // 'enviar' | 'plantillas'
  const [templates, setTemplates] = useState([]);
  const [tplLoading, setTplLoading] = useState(false);
  const [tplError, setTplError] = useState('');
  const [editingTpl, setEditingTpl] = useState(null); // fila en edición (draft)
  const [tplSaving, setTplSaving] = useState(false);
  const [tplSavedSlug, setTplSavedSlug] = useState('');

  const loadTemplates = useCallback(async () => {
    setTplLoading(true);
    setTplError('');
    const { data, error } = await supabase
      .from('email_templates')
      .select('slug, descripcion, asunto, titulo, kicker, cuerpo_html, cta_text, cta_url, firma, activo')
      .neq('slug', 'comunicacion') // plantilla de sistema (la usa el envío multicanal), no editable acá
      .order('descripcion');
    if (error) {
      setTplError('No se pudieron cargar las plantillas: ' + error.message);
      setTemplates([]);
    } else {
      setTemplates(data || []);
    }
    setTplLoading(false);
  }, []);

  useEffect(() => {
    if (view === 'plantillas' && templates.length === 0) loadTemplates();
  }, [view, templates.length, loadTemplates]);

  const saveTemplate = async () => {
    if (!editingTpl) return;
    setTplSaving(true);
    setTplError('');
    const { slug, asunto, titulo, cuerpo_html, cta_text, firma, activo } = editingTpl;
    // Solo la copia editable; nunca slug/cta_url/variables.
    const { error } = await supabase
      .from('email_templates')
      .update({ asunto, titulo, cuerpo_html, cta_text, firma, activo })
      .eq('slug', slug);
    setTplSaving(false);
    if (error) {
      setTplError('No se pudo guardar: ' + error.message);
      return;
    }
    setTemplates(prev => prev.map(t => (t.slug === slug ? { ...t, asunto, titulo, cuerpo_html, cta_text, firma, activo } : t)));
    setTplSavedSlug(slug);
    setEditingTpl(null);
    setTimeout(() => setTplSavedSlug(''), 2500);
  };

  // Active members with user accounts (can receive notifications)
  const activeMembers = useMemo(
    () => members.filter(m => m.active === true),
    [members]
  );

  const membersWithAccounts = useMemo(
    () => activeMembers.filter(m => m.userId),
    [activeMembers]
  );

  const activeBands = useMemo(
    () => bands.filter(b => b.active === true),
    [bands]
  );

  // Get members by selected bands (efectivos = permanentes ∪ temporales vigentes)
  const membersInSelectedBands = useMemo(() => {
    if (selectedBands.length === 0) return [];

    // Union de IDs efectivos de todas las bandas elegidas.
    const bandMemberIds = new Set();
    selectedBands.forEach(bandId => {
      getEffectiveBandMemberIds(bandId).forEach(id => bandMemberIds.add(id));
    });

    // Filter active members that are in those bands AND have user accounts
    return membersWithAccounts.filter(m => bandMemberIds.has(m.id));
  }, [selectedBands, bands, bandTemporaryMembers, membersWithAccounts, getEffectiveBandMemberIds]);

  // Toggle band selection
  const toggleBand = (bandId) => {
    setSelectedBands(prev =>
      prev.includes(bandId)
        ? prev.filter(id => id !== bandId)
        : [...prev, bandId]
    );
  };

  const toggleUser = (userId) => {
    setSelectedUsers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  // Reset form
  const resetForm = () => {
    setRecipientType('');
    setSelectedBands([]);
    setSelectedUsers([]);
    setSelectedRoles([]);
    setSubject('');
    setMessagePlain('');
    setShowEmojiPicker(false);
    setFmtState({ bold: false, italic: false, underline: false });
    if (editorRef.current) editorRef.current.innerHTML = '';
  };

  // Get recipient IDs based on selection
  const getRecipientIds = () => {
    const recipientIds = new Set();

    if (recipientType === 'all') {
      // All active members with user accounts
      membersWithAccounts.forEach(m => {
        if (m.userId) recipientIds.add(m.userId);
      });
    } else if (recipientType === 'bands') {
      // Members from selected bands
      membersInSelectedBands.forEach(m => {
        if (m.userId) recipientIds.add(m.userId);
      });
    } else if (recipientType === 'users') {
      // Selected users (these are userIds)
      selectedUsers.forEach(uid => recipientIds.add(uid));
    } else if (recipientType === 'roles') {
      // Members with selected roles and user accounts
      selectedRoles.forEach(role => {
        membersWithAccounts
          .filter(m => m.role === role)
          .forEach(m => {
            if (m.userId) recipientIds.add(m.userId);
          });
      });
    }

    return Array.from(recipientIds);
  };

  // Send communication
  const handleSend = async () => {
    // Validation
    if (!subject.trim()) {
      setErrorMessage('El asunto es obligatorio');
      setShowError(true);
      return;
    }
    // Fuente de verdad del mensaje: el DOM del editor (los estados son espejo).
    const msgHtml = editorRef.current?.innerHTML ?? '';
    const msgPlain = editorRef.current?.innerText ?? messagePlain;
    if (!msgPlain.trim()) {
      setErrorMessage('El mensaje es obligatorio');
      setShowError(true);
      return;
    }
    if (!recipientType) {
      setErrorMessage('Debes seleccionar al menos un tipo de destinatario');
      setShowError(true);
      return;
    }
    if (!channels.push && !channels.mail) {
      setErrorMessage('Elegí al menos un canal: campanita o correo.');
      setShowError(true);
      return;
    }

    const recipientIds = getRecipientIds();
    if (recipientIds.length === 0) {
      setErrorMessage('No hay destinatarios disponibles. Verificá que los miembros tengan cuentas de usuario.');
      setShowError(true);
      return;
    }

    setIsSending(true);

    // The edge function does the parent insert, fan-out (campanita) and/or email
    // enqueue per channel, rolling back if the push fan-out fails — atomic from the
    // client's perspective. The pastor's identity is taken from the JWT server-side.
    // Se envía el HTML del editor; el servidor lo sanitiza (solo negrita/cursiva/
    // subrayado/saltos/emoji) y deriva el texto plano para campanita y registro.
    const { data, error } = await callAdminFunction('admin-send-communication', {
      recipientType,
      recipientIds,
      subject: subject.trim(),
      message: msgHtml,
      format: 'rich', // el servidor sanitiza el HTML del editor (whitelist strong/em/u/br)
      channels: { push: channels.push, mail: channels.mail },
    });

    setIsSending(false);

    if (error) {
      console.error('Error sending communication:', error);
      setErrorMessage('No se pudo enviar la comunicación: ' + error);
      setShowError(true);
      return;
    }

    // Resumen por canal para el modal de éxito.
    const parts = [];
    if (channels.push) parts.push(`${data?.pushCount ?? recipientIds.length} por campanita`);
    if (channels.mail) parts.push(`${data?.mailQueued ?? 0} por correo`);
    setSentSummary(parts.join(' · '));
    setShowSuccess(true);
    resetForm();
    // Push fan-out is handled by the AFTER INSERT trigger on
    // communication_notifications (see migration 20260428_push_triggers.sql).
  };

  // If not a pastor, show access denied
  if (!isPastor) {
    return (
      <div className="p-6">
        <Card className="max-w-md mx-auto mt-8">
          <div className="text-center py-8">
            <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Acceso Denegado</h3>
            <p className="text-gray-400">Solo los pastores pueden acceder a esta sección.</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Comunicaciones</h1>
        <p className="text-gray-400 text-sm mt-1">
          Enviá mensajes a los miembros de la plataforma
        </p>
      </div>

      {/* Toggle: Enviar mensaje / Plantillas de correo */}
      <div className="flex gap-2 mb-6 p-1 bg-neutral-800/60 rounded-xl w-full max-w-sm">
        <button
          onClick={() => setView('enviar')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            view === 'enviar' ? 'bg-gold-gradient text-black shadow-[0_2px_14px_-3px_rgba(212,175,55,0.45)]' : 'text-gray-400 hover:text-gold-200'
          }`}
        >
          <Send size={16} /> Enviar
        </button>
        <button
          onClick={() => setView('plantillas')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            view === 'plantillas' ? 'bg-gold-gradient text-black shadow-[0_2px_14px_-3px_rgba(212,175,55,0.45)]' : 'text-gray-400 hover:text-gold-200'
          }`}
        >
          <Mail size={16} /> Plantillas de correo
        </button>
      </div>

      {view === 'enviar' && (
      <Card className="p-6">
        <div className="space-y-6">
          {/* Recipient Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-3">
              Destinatarios
            </label>
            <div className="grid grid-cols-2 gap-3">
              {/* Bandas */}
              <button
                onClick={() => {
                  setRecipientType('bands');
                  setShowBandSelector(true);
                }}
                className={`p-4 rounded-xl border-2 transition-all text-left ${
                  recipientType === 'bands'
                    ? 'border-gold-500 bg-gold-500/10'
                    : 'border-neutral-700 hover:border-gold-500/40'
                }`}
              >
                <MicrophoneStage size={24} weight="duotone" className={recipientType === 'bands' ? 'text-gold-100' : 'text-gray-500'} />
                <p className="font-medium text-white mt-2">Bandas</p>
                <p className="text-xs text-gray-400 mt-1">
                  {selectedBands.length > 0
                    ? `${selectedBands.length} banda(s) seleccionada(s)`
                    : 'Seleccionar bandas'}
                </p>
              </button>

              {/* Usuarios específicos */}
              <button
                onClick={() => {
                  setRecipientType('users');
                  setShowUserSelector(true);
                }}
                className={`p-4 rounded-xl border-2 transition-all text-left ${
                  recipientType === 'users'
                    ? 'border-gold-500 bg-gold-500/10'
                    : 'border-neutral-700 hover:border-gold-500/40'
                }`}
              >
                <UsersThree size={24} weight="duotone" className={recipientType === 'users' ? 'text-gold-100' : 'text-gray-500'} />
                <p className="font-medium text-white mt-2">Usuarios</p>
                <p className="text-xs text-gray-400 mt-1">
                  {selectedUsers.length > 0
                    ? `${selectedUsers.length} usuario(s) seleccionado(s)`
                    : 'Seleccionar usuarios'}
                </p>
              </button>

              {/* Roles */}
              <button
                onClick={() => {
                  setRecipientType('roles');
                  setSelectedRoles(
                    selectedRoles.length === 0 ? ['pastor', 'leader', 'member'] : []
                  );
                }}
                className={`p-4 rounded-xl border-2 transition-all text-left ${
                  recipientType === 'roles'
                    ? 'border-gold-500 bg-gold-500/10'
                    : 'border-neutral-700 hover:border-gold-500/40'
                }`}
              >
                <IdentificationBadge size={24} weight="duotone" className={recipientType === 'roles' ? 'text-gold-100' : 'text-gray-500'} />
                <p className="font-medium text-white mt-2">Por Rol</p>
                <p className="text-xs text-gray-400 mt-1">
                  Pastores, líderes o miembros
                </p>
              </button>

              {/* Todos */}
              <button
                onClick={() => setRecipientType('all')}
                className={`p-4 rounded-xl border-2 transition-all text-left ${
                  recipientType === 'all'
                    ? 'border-gold-500 bg-gold-500/10'
                    : 'border-neutral-700 hover:border-gold-500/40'
                }`}
              >
                <UsersFour size={24} weight="duotone" className={recipientType === 'all' ? 'text-gold-100' : 'text-gray-500'} />
                <p className="font-medium text-white mt-2">Todos</p>
                <p className="text-xs text-gray-400 mt-1">
                  {membersWithAccounts.length} miembro(s) con cuenta
                </p>
              </button>
            </div>
          </div>

          {/* Role Multi-select (when roles selected) */}
          {recipientType === 'roles' && (
            <div className="bg-neutral-800/50 rounded-xl p-4">
              <p className="text-sm text-gray-400 mb-3">Seleccionar roles:</p>
              <div className="flex flex-wrap gap-3">
                {['pastor', 'leader', 'member'].map(role => (
                  <button
                    key={role}
                    onClick={() => {
                      setSelectedRoles(prev =>
                        prev.includes(role)
                          ? prev.filter(r => r !== role)
                          : [...prev, role]
                      );
                    }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      selectedRoles.includes(role)
                        ? 'bg-gold-gradient text-black font-semibold'
                        : 'bg-neutral-700 text-gray-300 hover:bg-neutral-600'
                    }`}
                  >
                    {role === 'pastor' ? 'Pastores' : role === 'leader' ? 'Líderes' : 'Miembros'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Asunto *
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Ej: Reunión de líderes este sábado"
              className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 transition-colors"
              maxLength={100}
            />
          </div>

          {/* Message — editor con barra de formato (negrita/cursiva/subrayado/emoji).
              El HTML resultante se sanitiza SIEMPRE en el servidor (whitelist
              strong/em/u/br); las plantillas de correo no se tocan. */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Mensaje *
            </label>
            <div className="rounded-xl border border-neutral-700 bg-neutral-800 focus-within:ring-2 focus-within:ring-gold-500/40 transition-colors overflow-hidden">
              {/* Barra de formato */}
              <div className="relative flex items-center gap-1 px-2 py-1.5 border-b border-neutral-700/70 bg-neutral-900/40">
                <button
                  type="button"
                  title="Negrita"
                  aria-label="Negrita"
                  aria-pressed={fmtState.bold}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyFormat('bold')}
                  className={`p-2 rounded-lg transition-colors ${fmtState.bold ? 'bg-gold-500/20 text-gold-200' : 'text-gray-400 hover:text-white hover:bg-neutral-700/60'}`}
                >
                  <Bold size={16} />
                </button>
                <button
                  type="button"
                  title="Cursiva"
                  aria-label="Cursiva"
                  aria-pressed={fmtState.italic}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyFormat('italic')}
                  className={`p-2 rounded-lg transition-colors ${fmtState.italic ? 'bg-gold-500/20 text-gold-200' : 'text-gray-400 hover:text-white hover:bg-neutral-700/60'}`}
                >
                  <Italic size={16} />
                </button>
                <button
                  type="button"
                  title="Subrayado"
                  aria-label="Subrayado"
                  aria-pressed={fmtState.underline}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyFormat('underline')}
                  className={`p-2 rounded-lg transition-colors ${fmtState.underline ? 'bg-gold-500/20 text-gold-200' : 'text-gray-400 hover:text-white hover:bg-neutral-700/60'}`}
                >
                  <Underline size={16} />
                </button>
                <div className="w-px h-5 bg-neutral-700 mx-1" />
                <button
                  ref={emojiButtonRef}
                  type="button"
                  title="Emojis"
                  aria-label="Emojis"
                  aria-pressed={showEmojiPicker}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setShowEmojiPicker(v => !v)}
                  className={`p-2 rounded-lg transition-colors ${showEmojiPicker ? 'bg-gold-500/20 text-gold-200' : 'text-gray-400 hover:text-white hover:bg-neutral-700/60'}`}
                >
                  <Smile size={16} />
                </button>
                {showEmojiPicker && (
                  <div
                    ref={emojiPickerRef}
                    className="absolute left-2 top-full mt-1 z-20 grid grid-cols-8 gap-1 p-2 bg-neutral-900 border border-neutral-700 rounded-xl shadow-xl"
                  >
                    {MESSAGE_EMOJIS.map((emo) => (
                      <button
                        key={emo}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => insertEmoji(emo)}
                        className="w-9 h-9 flex items-center justify-center text-lg rounded-lg hover:bg-neutral-700/70 transition-colors"
                      >
                        {emo}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Editor (contentEditable, no controlado — ver comentario en el estado) */}
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                role="textbox"
                aria-multiline="true"
                aria-label="Mensaje"
                data-placeholder="Escribí tu mensaje aquí..."
                onInput={syncFromEditor}
                onKeyDown={handleEditorKeyDown}
                onPaste={handleEditorPaste}
                onDrop={handleEditorDrop}
                onKeyUp={refreshToolbarState}
                onMouseUp={refreshToolbarState}
                onFocus={refreshToolbarState}
                className="w-full min-h-[9rem] max-h-72 overflow-y-auto px-4 py-3 text-white focus:outline-none break-words empty:before:content-[attr(data-placeholder)] empty:before:text-gray-500 empty:before:pointer-events-none"
              />
            </div>
            <p className={`text-xs mt-1 text-right ${overLimit ? 'text-red-400' : 'text-gray-500'}`}>
              {overLimit && <span className="font-medium">Máximo {MESSAGE_MAX} caracteres — </span>}
              {messagePlain.length}/{MESSAGE_MAX} caracteres
            </p>
          </div>

          {/* Canales de envío — campanita (push) y/o correo */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Canales de envío *
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setChannels(c => ({ ...c, push: !c.push }))}
                className={`flex items-center gap-3 p-4 rounded-xl border transition-colors ${
                  channels.push ? 'border-gold-500 bg-gold-500/10' : 'border-neutral-700 bg-neutral-800/40 hover:border-neutral-600'
                }`}
              >
                <Bell size={20} className={channels.push ? 'text-gold-300' : 'text-gray-400'} />
                <div className="text-left min-w-0">
                  <p className={`text-sm font-medium ${channels.push ? 'text-white' : 'text-gray-300'}`}>Campanita</p>
                  <p className="text-xs text-gray-500">Aviso dentro de la app</p>
                </div>
                {channels.push && <Check size={16} className="text-gold-300 ml-auto shrink-0" />}
              </button>
              <button
                type="button"
                onClick={() => setChannels(c => ({ ...c, mail: !c.mail }))}
                className={`flex items-center gap-3 p-4 rounded-xl border transition-colors ${
                  channels.mail ? 'border-gold-500 bg-gold-500/10' : 'border-neutral-700 bg-neutral-800/40 hover:border-neutral-600'
                }`}
              >
                <Mail size={20} className={channels.mail ? 'text-gold-300' : 'text-gray-400'} />
                <div className="text-left min-w-0">
                  <p className={`text-sm font-medium ${channels.mail ? 'text-white' : 'text-gray-300'}`}>Correo</p>
                  <p className="text-xs text-gray-500">Email con el formato de AdorAPP</p>
                </div>
                {channels.mail && <Check size={16} className="text-gold-300 ml-auto shrink-0" />}
              </button>
            </div>
          </div>

          {/* Summary — conteo por canal */}
          {(() => {
            const idSet = new Set(getRecipientIds());
            const mailCount = activeMembers.filter(m => m.userId && idSet.has(m.userId) && m.email && m.email.trim()).length;
            const total = idSet.size;
            return (
              <div className="bg-neutral-800/50 rounded-xl p-4 space-y-1">
                {channels.push && (
                  <p className="text-sm text-gray-400">
                    🔔 Campanita: <span className="text-white font-medium">{total}</span> destinatario(s).
                  </p>
                )}
                {channels.mail && (
                  <p className="text-sm text-gray-400">
                    ✉️ Correo: <span className="text-white font-medium">{mailCount}</span> destinatario(s) con email.
                    {total > mailCount && (
                      <span className="text-amber-400/90"> · {total - mailCount} sin email (no reciben correo)</span>
                    )}
                  </p>
                )}
                {!channels.push && !channels.mail && (
                  <p className="text-sm text-amber-400/90">Elegí al menos un canal para poder enviar.</p>
                )}
              </div>
            );
          })()}

          {/* Send Button */}
          <Button
            onClick={handleSend}
            disabled={isSending || !recipientType || !subject.trim() || !messagePlain.trim() || overLimit || (!channels.push && !channels.mail)}
            className="w-full"
            size="lg"
          >
            {isSending ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send size={18} />
                Enviar Comunicación
              </>
            )}
          </Button>
        </div>
      </Card>
      )}

      {/* Plantillas de correo — editor de la copia (solo pastores) */}
      {view === 'plantillas' && (
        <Card className="p-6">
          {tplLoading ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <Loader2 size={20} className="animate-spin mr-2" /> Cargando plantillas…
            </div>
          ) : tplError ? (
            <div className="text-center py-8">
              <AlertCircle size={40} className="mx-auto text-red-400 mb-3" />
              <p className="text-gray-300">{tplError}</p>
              <Button onClick={loadTemplates} variant="secondary" className="mt-4">Reintentar</Button>
            </div>
          ) : editingTpl ? (
            <div className="space-y-5">
              <button
                onClick={() => setEditingTpl(null)}
                className="flex items-center gap-1 text-sm text-gray-400 hover:text-white"
              >
                <ChevronLeft size={16} /> Volver a la lista
              </button>
              <div>
                <h3 className="text-lg font-semibold text-white">{editingTpl.descripcion}</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Variables disponibles:{' '}
                  {(TEMPLATE_VARS[editingTpl.slug] || []).map(v => (
                    <code key={v} className="text-gold-300 bg-gold-500/10 rounded px-1 mx-0.5">{`{{${v}}}`}</code>
                  ))}
                </p>
              </div>

              {EDITABLE_FIELDS.map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-gray-300 mb-1">{f.label}</label>
                  {f.type === 'textarea' ? (
                    <textarea
                      value={editingTpl[f.key] || ''}
                      onChange={(e) => setEditingTpl(t => ({ ...t, [f.key]: e.target.value }))}
                      rows={5}
                      className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-gold-500/40 transition-colors resize-y"
                    />
                  ) : (
                    <input
                      type="text"
                      value={editingTpl[f.key] || ''}
                      onChange={(e) => setEditingTpl(t => ({ ...t, [f.key]: e.target.value }))}
                      className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-gold-500/40 transition-colors"
                    />
                  )}
                  {f.hint && <p className="text-xs text-gray-500 mt-1">{f.hint}</p>}
                </div>
              ))}

              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={!!editingTpl.activo}
                  onChange={(e) => setEditingTpl(t => ({ ...t, activo: e.target.checked }))}
                  className="w-4 h-4 accent-gold-500"
                />
                <span className="text-sm text-gray-300">Plantilla activa (si la desactivás, ese correo no se envía)</span>
              </label>

              <div className="flex gap-3 pt-2">
                <Button onClick={saveTemplate} disabled={tplSaving} className="flex-1">
                  {tplSaving ? <><Loader2 size={18} className="animate-spin" /> Guardando…</> : <><Save size={18} /> Guardar</>}
                </Button>
                <Button onClick={() => setEditingTpl(null)} variant="secondary" disabled={tplSaving}>Cancelar</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-400 mb-2">
                Editá el texto de los correos automáticos que la plataforma envía a los usuarios.
              </p>
              {templates.map(t => (
                <div key={t.slug} className="flex items-center gap-3 p-4 bg-neutral-800/60 rounded-xl">
                  <EnvelopeSimple size={20} weight="duotone" className="text-gold-300 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-white font-medium truncate">{t.descripcion}</p>
                      {!t.activo && (
                        <span className="text-[10px] uppercase tracking-wide bg-red-500/20 text-red-300 rounded px-1.5 py-0.5">Inactiva</span>
                      )}
                      {tplSavedSlug === t.slug && (
                        <span className="flex items-center gap-1 text-[11px] text-green-400"><Check size={12} /> Guardada</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{t.asunto}</p>
                  </div>
                  <Button onClick={() => setEditingTpl({ ...t })} variant="secondary" size="sm">Editar</Button>
                </div>
              ))}
              {templates.length === 0 && (
                <EmptyState
                  icon={EnvelopeSimple}
                  title="No hay plantillas"
                  subtitle="Todavía no hay plantillas de correo para editar."
                  annotation="Actualizá para verlas"
                />
              )}
            </div>
          )}
        </Card>
      )}

      {/* Band Selector Modal */}
      {showBandSelector && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowBandSelector(false)}
        >
          <div
            className="bg-neutral-900 rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-neutral-800">
              <h3 className="text-lg font-semibold text-white">Seleccionar Bandas</h3>
              <button
                onClick={() => setShowBandSelector(false)}
                className="p-2 rounded-full hover:bg-neutral-800"
              >
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <div className="space-y-2">
                {activeBands.map(band => (
                  <button
                    key={band.id}
                    onClick={() => toggleBand(band.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                      selectedBands.includes(band.id)
                        ? 'bg-gold-500/15 border-2 border-gold-500'
                        : 'bg-neutral-800 hover:bg-neutral-700 border-2 border-transparent'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                      selectedBands.includes(band.id)
                        ? 'bg-gold-500 border-gold-500'
                        : 'border-neutral-600'
                    }`}>
                      {selectedBands.includes(band.id) && (
                        <Check size={14} className="text-black" />
                      )}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-white font-medium">{band.name}</p>
                      <p className="text-xs text-gray-400">
                        {membersWithAccounts.filter(m => getEffectiveBandMemberIds(band.id).has(m.id)).length} miembros con cuenta
                      </p>
                    </div>
                  </button>
                ))}
                {activeBands.length === 0 && (
                  <EmptyState
                    icon={MicrophoneStage}
                    title="No hay bandas activas"
                    subtitle="Cuando actives una banda, va a aparecer acá para elegir."
                    annotation="Creá una banda primero"
                  />
                )}
              </div>
            </div>
            <div className="p-4 border-t border-neutral-800">
              <Button
                onClick={() => setShowBandSelector(false)}
                className="w-full"
              >
                Aceptar ({selectedBands.length} seleccionada(s))
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* User Selector Modal - Only shows members with user accounts */}
      {showUserSelector && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowUserSelector(false)}
        >
          <div
            className="bg-neutral-900 rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-neutral-800">
              <h3 className="text-lg font-semibold text-white">Seleccionar Usuarios</h3>
              <button
                onClick={() => setShowUserSelector(false)}
                className="p-2 rounded-full hover:bg-neutral-800"
              >
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <div className="space-y-2">
                {membersWithAccounts.map(member => (
                  <button
                    key={member.id}
                    onClick={() => {
                      if (member.userId) {
                        toggleUser(member.userId);
                      }
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                      selectedUsers.includes(member.userId)
                        ? 'bg-gold-500/15 border-2 border-gold-500'
                        : 'bg-neutral-800 hover:bg-neutral-700 border-2 border-transparent'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                      selectedUsers.includes(member.userId)
                        ? 'bg-gold-500 border-gold-500'
                        : 'border-neutral-600'
                    }`}>
                      {selectedUsers.includes(member.userId) && (
                        <Check size={14} className="text-black" />
                      )}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-white font-medium">{member.name}</p>
                      <p className="text-xs text-gray-400 capitalize">
                        {member.role === 'pastor' ? 'Pastor' : member.role === 'leader' ? 'Líder' : 'Miembro'}
                      </p>
                    </div>
                  </button>
                ))}
                {membersWithAccounts.length === 0 && (
                  <EmptyState
                    icon={UsersThree}
                    title="Sin usuarios con cuenta"
                    subtitle="Ningún miembro activo tiene cuenta de usuario todavía."
                    annotation="Invitá miembros primero"
                  />
                )}
              </div>
            </div>
            <div className="p-4 border-t border-neutral-800">
              <Button
                onClick={() => setShowUserSelector(false)}
                className="w-full"
              >
                Aceptar ({selectedUsers.length} seleccionado(s))
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccess && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowSuccess(false)}
        >
          <div
            className="bg-neutral-900 rounded-2xl w-full max-w-sm p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check size={32} className="text-green-400" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">¡Comunicación Enviada!</h3>
            <p className="text-gray-400 mb-6">
              {sentSummary ? `Enviada: ${sentSummary}.` : 'La comunicación ha sido enviada.'}
            </p>
            <Button onClick={() => setShowSuccess(false)} className="w-full">
              Aceptar
            </Button>
          </div>
        </div>
      )}

      {/* Error Modal */}
      {showError && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowError(false)}
        >
          <div
            className="bg-neutral-900 rounded-2xl w-full max-w-sm p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle size={32} className="text-red-400" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Error</h3>
            <p className="text-gray-400 mb-6">{errorMessage}</p>
            <Button onClick={() => setShowError(false)} className="w-full" variant="secondary">
              Aceptar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
