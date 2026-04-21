import React, { useState, useMemo, useRef, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import {
  Plus, Search, Music, Download, Edit, Trash2, Clock, MoreVertical,
  Eye, ExternalLink, Filter, X, GripVertical, Music2, Save,
  LayoutGrid, List, FileDown, AlertTriangle, ChevronDown
} from 'lucide-react';
import { useAppStore, SONG_CATEGORIES, MUSICAL_KEYS, transposeSongStructure } from '../stores/appStore';
import { useAuthStore } from '../stores/authStore';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { ConfirmModal, SuccessModal, ErrorModal } from '../components/ui/ConfirmModal';

const sectionTypes = [
  { id: 'intro', label: 'Intro' },
  { id: 'verse', label: 'Verso' },
  { id: 'pre-chorus', label: 'Pre Coro' },
  { id: 'chorus', label: 'Coro' },
  { id: 'bridge', label: 'Puente' },
  { id: 'interlude', label: 'Interludio' },
  { id: 'coda', label: 'Coda' },
  { id: 'ending', label: 'Final' },
];

const categoryConfig = {
  adoraci: { label: 'Adoración', color: 'text-pink-400', bg: 'bg-pink-500/20' },
  intimidad: { label: 'Intimidad', color: 'text-purple-400', bg: 'bg-purple-500/20' },
  guerra: { label: 'Guerra', color: 'text-red-400', bg: 'bg-red-500/20' },
  rapida: { label: 'Rápida', color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
  lenta: { label: 'Lenta', color: 'text-blue-400', bg: 'bg-blue-500/20' },
  alabanza: { label: 'Alabanza', color: 'text-green-400', bg: 'bg-green-500/20' },
  humillacion: { label: 'Humillación', color: 'text-orange-400', bg: 'bg-orange-500/20' },
  pascua: { label: 'Pascua', color: 'text-cyan-400', bg: 'bg-cyan-500/20' },
  santa_cena: { label: 'Santa Cena', color: 'text-red-400', bg: 'bg-red-500/20' },
  testimonial: { label: 'Testimonial', color: 'text-teal-400', bg: 'bg-teal-500/20' },
  ofrenda: { label: 'Ofrenda', color: 'text-amber-400', bg: 'bg-amber-500/20' },
  coritos: { label: 'Coritos', color: 'text-yellow-300', bg: 'bg-yellow-500/20' },
  festivas: { label: 'Festivas', color: 'text-fuchsia-400', bg: 'bg-fuchsia-500/20' },
};

export const Repertorio = () => {
  const { songs, addSong, updateSong, deleteSong, members, getUnusedSongs } = useAppStore();
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

  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategories, setFilterCategories] = useState([]); // Multiselect
  const [showUnused, setShowUnused] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [viewingSong, setViewingSong] = useState(null);
  const [viewingKey, setViewingKey] = useState(null);
  const [editingSong, setEditingSong] = useState(null);
  const [viewMode, setViewMode] = useState('cards'); // 'cards' or 'table'
  const [exportKey, setExportKey] = useState('C'); // Key for PDF export
  const [exportModalSong, setExportModalSong] = useState(null);
  const [exportSongKey, setExportSongKey] = useState('C');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [newSectionIndex, setNewSectionIndex] = useState(null);
  const structureContainerRef = useRef(null);

  const [formData, setFormData] = useState({
    title: '',
    artist: '',
    key: 'C',
    categories: ['adoracion'],
    youtubeUrl: '',
    compass: '', // Compás (ej: 4/4, 3/4)
    bpm: '', // BPM (número hasta 3 dígitos)
    structure: [{ type: 'verse', label: 'Verso 1', content: '', chords: '' }]
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

  const unusedSongs = getUnusedSongs(4);

  const filteredSongs = useMemo(() => {
    let result = songs;

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      result = result.filter(s => {
        // Search in title and artist
        if (s.title.toLowerCase().includes(search) ||
            s.artist?.toLowerCase().includes(search)) {
          return true;
        }
        // Search in song structure (lyrics and chords)
        if (s.structure) {
          return s.structure.some(section =>
            section.content?.toLowerCase().includes(search) ||
            section.chords?.toLowerCase().includes(search)
          );
        }
        return false;
      });
    }

    // Multi-category filter - song must match ALL selected categories
    if (filterCategories.length > 0) {
      result = result.filter(s => {
        const songCats = s.categories || [];
        return filterCategories.every(cat => songCats.includes(cat));
      });
    }

    if (showUnused) {
      const unusedIds = new Set(unusedSongs.map(s => s.id));
      result = result.filter(s => unusedIds.has(s.id));
    }

    return result;
  }, [songs, searchTerm, filterCategories, showUnused, unusedSongs]);

  // Toggle category in filter
  const toggleFilterCategory = (catId) => {
    setFilterCategories(prev =>
      prev.includes(catId) ? prev.filter(c => c !== catId) : [...prev, catId]
    );
  };

  // Clear all category filters
  const clearCategoryFilters = () => {
    setFilterCategories([]);
  };

  // Toggle category in form (for song editing)
  const toggleFormCategory = (catId) => {
    setFormData(prev => ({
      ...prev,
      categories: prev.categories.includes(catId)
        ? prev.categories.filter(c => c !== catId)
        : [...prev.categories, catId]
    }));
  };

  const handleOpenModal = (song = null) => {
    if (song) {
      setEditingSong(song);
      setFormData({
        title: song.title,
        artist: song.artist || '',
        key: song.key || song.originalKey,
        categories: song.categories || (song.category ? [song.category] : ['adoracion']),
        youtubeUrl: song.youtubeUrl || '',
        compass: song.compass || '',
        bpm: song.bpm || '',
        structure: song.structure || [{ type: 'verse', label: 'Verso 1', content: '', chords: '' }]
      });
    } else {
      setEditingSong(null);
      setFormData({
        title: '',
        artist: '',
        key: 'C',
        categories: ['adoracion'],
        youtubeUrl: '',
        compass: '',
        bpm: '',
        structure: [{ type: 'intro', label: 'Intro', content: '', chords: '' }]
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingSong(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    const songData = {
      ...formData,
      originalKey: formData.key,
      lastUsed: editingSong?.lastUsed || null
    };

    if (editingSong) {
      updateSong(editingSong.id, songData);
    } else {
      addSong(songData);
    }
    handleCloseModal();
  };

  const handleDelete = (song) => {
    setConfirmModal({
      isOpen: true,
      title: 'Eliminar Canción',
      message: `¿Querés eliminar "${song.title}"? La canción se borra de todos los servicios donde esté cargada.`,
      type: 'danger',
      confirmText: 'Sí, eliminar',
      cancelText: 'Mejor no',
      icon: AlertTriangle,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, loading: true }));
        deleteSong(song.id);
        setConfirmModal(prev => ({ ...prev, loading: false, isOpen: false }));
        setSuccessModal({
          isOpen: true,
          title: 'Canción eliminada',
          message: `"${song.title}" fue eliminada del repertorio.`
        });
      }
    });
  };

  const handleViewSong = (song) => {
    setViewingSong(song);
    setViewingKey(song.originalKey || song.key);
    setIsViewerOpen(true);
  };

  // Helper to get default label for a section type
  const getDefaultSectionLabel = (type, existingSections, currentIndex = -1) => {
    const labels = {
      'intro': 'Intro',
      'verse': 'Verso',
      'pre-chorus': 'Pre Coro',
      'chorus': 'Coro',
      'bridge': 'Puente',
      'interlude': 'Interludio',
      'coda': 'Coda',
      'ending': 'Final'
    };

    const baseLabel = labels[type] || type;

    // Count existing sections of this type (excluding current section being edited)
    const count = existingSections.filter((s, i) =>
      i !== currentIndex && s.type === type
    ).length + 1;

    // Only add number for repeatable sections
    if (['verse', 'chorus', 'bridge'].includes(type)) {
      return `${baseLabel} ${count}`;
    }

    return baseLabel;
  };

  const addStructureSection = () => {
    setFormData(prev => {
      const newIndex = prev.structure.length;
      const newLabel = getDefaultSectionLabel('verse', prev.structure);
      return {
        ...prev,
        structure: [...prev.structure, { type: 'verse', label: newLabel, content: '', chords: '' }]
      };
    });
    // Scroll to the new section after render
    setNewSectionIndex(formData.structure.length);
  };

  // Effect to scroll to new section when index changes
  useEffect(() => {
    if (newSectionIndex !== null && structureContainerRef.current) {
      const sections = structureContainerRef.current.querySelectorAll('.structure-section');
      const newSection = sections[newSectionIndex];
      if (newSection) {
        // Small delay to ensure DOM is rendered
        setTimeout(() => {
          newSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Focus the chords input of the new section
          const chordsInput = newSection.querySelector('input[type="text"]');
          if (chordsInput) chordsInput.focus();
        }, 50);
      }
      setNewSectionIndex(null);
    }
  }, [newSectionIndex]);

  const removeStructureSection = (index) => {
    setFormData(prev => ({
      ...prev,
      structure: prev.structure.filter((_, i) => i !== index)
    }));
  };

  const updateStructureSection = (index, field, value) => {
    setFormData(prev => {
      const updatedSections = prev.structure.map((s, i) => {
        if (i === index) {
          const updated = { ...s, [field]: value };
          // When type changes, also update label to match the new type
          if (field === 'type') {
            updated.label = getDefaultSectionLabel(value, prev.structure, index);
          }
          return updated;
        }
        return s;
      });
      return { ...prev, structure: updatedSections };
    });
  };

  const generateSongPDF = async (song, key) => {
    const originalKey = song.originalKey || song.key;
    const transposedStructure = key !== originalKey
      ? transposeSongStructure(song.structure || [], originalKey, key)
      : song.structure;

    // Use white background for better printing
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Colors - optimized for white background
    const purple = [128, 0, 128];
    const darkPurple = [75, 0, 130];
    const black = [0, 0, 0];
    const darkGray = [64, 64, 64];
    const gray = [128, 128, 128];

    let y = 20;

    // Header - Title
    doc.setFontSize(24);
    doc.setTextColor(...black);
    doc.setFont('helvetica', 'bold');
    doc.text(song.title, 20, y);
    y += 8;

    // Artist
    doc.setFontSize(12);
    doc.setTextColor(...darkGray);
    doc.setFont('helvetica', 'normal');
    doc.text(song.artist || 'Artista desconocido', 20, y);
    y += 8;

    // Meta info
    doc.setFontSize(10);
    doc.setTextColor(...darkGray);

    const metaParts = [`Tono: ${key}`];
    if (key !== originalKey) {
      metaParts.push(`Original: ${originalKey}`);
    }
    if (song.compass) {
      metaParts.push(`Compás: ${song.compass}`);
    }
    if (song.bpm) {
      metaParts.push(`BPM: ${song.bpm}`);
    }
    const categories = song.categories || (song.category ? [song.category] : []);
    const catLabel = categories[0] ? categoryConfig[categories[0]]?.label : 'Sin categoría';
    metaParts.push(catLabel);

    doc.text(metaParts.join('  |  '), 20, y);
    y += 10;

    // Separator line
    doc.setDrawColor(...purple);
    doc.setLineWidth(0.5);
    doc.line(20, y, 190, y);
    y += 10;

    // Sections
    transposedStructure.forEach((section) => {
      // Check if we need a new page
      if (y > 260) {
        doc.addPage();
        y = 20;
      }

      // Section label
      doc.setFontSize(12);
      doc.setTextColor(...purple);
      doc.setFont('helvetica', 'bold');
      doc.text(section.label, 20, y);
      y += 7;

      // Chords
      if (section.chords) {
        doc.setFontSize(14);
        doc.setTextColor(...darkPurple);
        doc.setFont('courier', 'bold');

        // Split long chords into multiple lines if needed
        const maxWidth = 170;
        const words = section.chords.split(' ');
        let line = '';
        words.forEach((word) => {
          const testLine = line ? `${line} ${word}` : word;
          if (doc.getTextWidth(testLine) > maxWidth) {
            doc.text(line, 20, y);
            y += 6;
            line = word;
          } else {
            line = testLine;
          }
        });
        if (line) {
          doc.text(line, 20, y);
          y += 7;
        }
      }

      // Lyrics
      if (section.content) {
        doc.setFontSize(11);
        doc.setTextColor(...black);
        doc.setFont('helvetica', 'normal');

        // Word wrap lyrics
        const lines = doc.splitTextToSize(section.content, 170);
        lines.forEach((lineText) => {
          if (y > 275) {
            doc.addPage();
            y = 20;
          }
          doc.text(lineText, 20, y);
          y += 5;
        });
      }

      // Empty section (musical intro)
      if (!section.chords && !section.content && section.type === 'intro') {
        doc.setFontSize(10);
        doc.setTextColor(...gray);
        doc.setFont('helvetica', 'italic');
        doc.text('Silencio musical', 20, y);
        y += 5;
      }

      y += 8; // Space between sections
    });

    // Footer
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    y += 5;
    doc.setFontSize(8);
    doc.setTextColor(...gray);
    doc.setFont('helvetica', 'italic');
    doc.text('Generado por AdorAPP - La plataforma de Adoración CAF', 20, y);

    // Generate filename
    const fileName = `${song.title.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]/g, '').replace(/\s+/g, '_')}_${key}.pdf`;

    // Download - use save() directly which triggers browser download
    doc.save(fileName);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Repertorio de Canciones</h2>
          <p className="text-sm text-gray-400 mt-1">
            {filteredSongs.length} canciones
            {filterCategories.length > 0 && ` · ${filterCategories.length} filtro(s) activo(s)`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <div className="flex bg-neutral-900 rounded-lg p-1 border border-neutral-800">
              <button
                onClick={() => setViewMode('cards')}
                className={`p-2 rounded-md transition-colors ${viewMode === 'cards' ? 'bg-white text-black' : 'hover:bg-neutral-800 text-gray-400'}`}
                title="Vista de tarjetas"
              >
                <LayoutGrid size={18} />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-2 rounded-md transition-colors ${viewMode === 'table' ? 'bg-white text-black' : 'hover:bg-neutral-800 text-gray-400'}`}
                title="Vista de grilla"
              >
                <List size={18} />
              </button>
            </div>
            {/* Pastors, leaders and editors can add songs */}
            {(isPastor || isLeader || currentMember?.editor) && (
              <Button icon={Plus} onClick={() => handleOpenModal()}>
                Nueva Canción
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Search and Filters - Mobile optimized */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
          <input
            type="text"
            placeholder="Buscar por título o artista..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-neutral-900 border border-neutral-800 rounded-xl focus:outline-none focus:border-white transition-colors"
          />
        </div>
        <div className="flex flex-wrap sm:flex-nowrap gap-2 w-full sm:w-auto">
          {/* Category Multi-select Dropdown - Mobile friendly */}
          <div className="relative flex-1 sm:flex-none sm:w-48">
            <button
              onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
              className={`w-full flex items-center justify-between gap-2 px-4 py-3 bg-neutral-900 border rounded-xl transition-colors ${
                filterCategories.length > 0 ? 'border-purple-500 text-white' : 'border-neutral-800 text-gray-400 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2">
                <Filter size={18} />
                <span className="text-sm sm:text-base">
                  {filterCategories.length > 0 ? `${filterCategories.length} cat(s)` : 'Categorías'}
                </span>
              </div>
              <ChevronDown size={16} />
            </button>

            {showCategoryDropdown && (
              <>
                {/* Backdrop to close dropdown */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowCategoryDropdown(false)}
                />
                <div className="absolute top-full left-0 right-0 mt-2 bg-neutral-900 border border-neutral-700 rounded-xl shadow-xl z-50 max-h-64 sm:max-h-80 overflow-y-auto">
                  <div className="sticky top-0 p-2 border-b border-neutral-800 flex justify-between items-center bg-neutral-900">
                    <span className="text-xs text-gray-400">Seleccionar categorías</span>
                    {filterCategories.length > 0 && (
                      <button onClick={clearCategoryFilters} className="text-xs text-purple-400 hover:text-purple-300">
                        Limpiar
                      </button>
                    )}
                  </div>
                  <div className="p-2">
                    {SONG_CATEGORIES.map(cat => (
                      <button
                        key={cat.id}
                        onClick={() => toggleFilterCategory(cat.id)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-neutral-800 transition-colors text-left"
                      >
                        <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                          filterCategories.includes(cat.id)
                            ? 'bg-purple-500 border-purple-500'
                            : 'border-neutral-600'
                        }`}>
                          {filterCategories.includes(cat.id) && (
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <span className={`${cat.color} text-sm`}>{cat.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <Button
            variant={showUnused ? 'primary' : 'secondary'}
            icon={Clock}
            size="sm"
            onClick={() => setShowUnused(!showUnused)}
            className="px-3"
          >
            <span className="sm:hidden">Sin usar</span>
            <span className="hidden sm:inline">Sin usar {showUnused && `(${unusedSongs.length})`}</span>
          </Button>
        </div>
      </div>

      {/* Active category filters display */}
      {filterCategories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-400">Filtros activos:</span>
          {filterCategories.map(catId => {
            const cat = SONG_CATEGORIES.find(c => c.id === catId);
            return cat ? (
              <Badge
                key={catId}
                className={`${cat.bg} cursor-pointer hover:opacity-80`}
                onClick={() => toggleFilterCategory(catId)}
              >
                <span className={cat.color}>{cat.label}</span>
                <X size={12} className="ml-1" />
              </Badge>
            ) : null;
          })}
        </div>
      )}

      {/* Songs View - Cards or Table */}
      {viewMode === 'cards' ? (
        /* Cards View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSongs.map((song) => (
            <Card key={song.id} hover className="group">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                    <Music2 size={24} className="text-purple-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{song.title}</h3>
                    <p className="text-sm text-gray-400">{song.artist}</p>
                  </div>
                </div>
                <Badge variant="primary">Tono: {song.key}</Badge>
                  {song.compass && (
                    <Badge variant="secondary">Comp: {song.compass}</Badge>
                  )}
                  {song.bpm && (
                    <Badge variant="secondary">BPM: {song.bpm}</Badge>
                  )}
              </div>

              <div className="flex items-start gap-2 mb-3 flex-wrap">
                {(song.categories || (song.category ? [song.category] : [])).map((catId, idx) => (
                  <Badge key={`${catId}-${idx}`} className={categoryConfig[catId]?.bg} variant="default">
                    <span className={categoryConfig[catId]?.color}>
                      {categoryConfig[catId]?.label}
                    </span>
                  </Badge>
                ))}
                {song.youtubeUrl && (
                  <a
                    href={song.youtubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 rounded hover:bg-neutral-800 transition-colors"
                    title="Ver en YouTube"
                  >
                    <ExternalLink size={14} className="text-gray-400" />
                  </a>
                )}
              </div>

              {song.lastUsed && (
                <p className="text-xs text-gray-500 mb-3">
                  Última vez: {new Date(song.lastUsed).toLocaleDateString('es-ES')}
                </p>
              )}

              <div className="flex items-center gap-2 pt-3 border-t border-neutral-800">
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Eye}
                  onClick={() => handleViewSong(song)}
                >
                  Ver
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={FileDown}
                  onClick={() => {
                    setExportModalSong(song);
                    setExportSongKey(song.originalKey || song.key);
                  }}
                  title="Exportar a PDF"
                >
                  PDF
                </Button>
                {(isPastor || isLeader || currentMember?.editor) && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={Edit}
                      onClick={() => handleOpenModal(song)}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={Trash2}
                      onClick={() => handleDelete(song)}
                    >
                      Eliminar
                    </Button>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        /* Table View */
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-800">
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Canción</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Artista</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Categoría</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Tono</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Última vez</th>
                  <th className="text-right px-4 py-3 text-xs text-gray-400 font-medium uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredSongs.map((song) => (
                  <tr
                    key={song.id}
                    className="border-b border-neutral-800/50 hover:bg-neutral-800/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                          <Music2 size={16} className="text-purple-400" />
                        </div>
                        <span className="font-medium">{song.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">{song.artist || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(song.categories || (song.category ? [song.category] : [])).map((catId, idx) => (
                          <Badge key={`${catId}-${idx}`} className={categoryConfig[catId]?.bg} variant="default" size="sm">
                            <span className={categoryConfig[catId]?.color}>
                              {categoryConfig[catId]?.label}
                            </span>
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm"
                        value={exportKey}
                        onChange={(e) => setExportKey(e.target.value)}
                      >
                        {MUSICAL_KEYS.map(k => (
                          <option key={k} value={k}>{k}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {song.lastUsed ? new Date(song.lastUsed).toLocaleDateString('es-ES') : 'Nunca'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleViewSong(song)}
                          className="p-1.5 rounded hover:bg-neutral-800 transition-colors text-gray-400"
                          title="Ver canción"
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          onClick={() => {
                            setExportModalSong(song);
                            setExportSongKey(song.originalKey || song.key);
                          }}
                          className="p-1.5 rounded hover:bg-neutral-800 transition-colors text-gray-400"
                          title="Exportar PDF"
                        >
                          <FileDown size={14} />
                        </button>
                        {(isPastor || isLeader || currentMember?.editor) && (
                          <>
                            <button
                              onClick={() => handleOpenModal(song)}
                              className="p-1.5 rounded hover:bg-neutral-800 transition-colors text-gray-400"
                              title="Editar"
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              onClick={() => handleDelete(song)}
                              className="p-1.5 rounded hover:bg-neutral-800 transition-colors text-gray-400 hover:text-red-400"
                              title="Eliminar"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {filteredSongs.length === 0 && (
        <div className="text-center py-12">
          <Music size={48} className="mx-auto text-gray-600 mb-4" />
          <p className="text-gray-400">No se encontraron canciones</p>
          {(isPastor || isLeader || currentMember?.editor) && (
            <Button
              variant="secondary"
              icon={Plus}
              onClick={() => handleOpenModal()}
              className="mt-4"
            >
              Agregar primera canción
            </Button>
          )}
        </div>
      )}

      {/* Add/Edit Song Modal - Mobile optimized */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingSong ? 'Editar Canción' : 'Nueva Canción'}
        size="xl"
        footer={
          <div className="flex flex-row gap-3 w-full">
            <button
              type="button"
              onClick={handleCloseModal}
              className="flex-1 px-4 py-3 bg-neutral-800 hover:bg-neutral-700 text-gray-300 rounded-xl font-medium transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!formData.title.trim()}
              className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/50 disabled:opacity-50 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Save size={18} />
              {editingSong ? 'Guardar' : 'Crear'}
            </button>
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Título"
              placeholder="Nombre de la canción"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            />
            <Input
              label="Artista"
              placeholder="Nombre del artista"
              value={formData.artist}
              onChange={(e) => setFormData({ ...formData, artist: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="text-xs text-gray-400 font-medium uppercase tracking-wide block mb-1.5">
                Tono Original
              </label>
              <select
                className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2.5"
                value={formData.key}
                onChange={(e) => setFormData({ ...formData, key: e.target.value })}
              >
                {MUSICAL_KEYS.map(key => (
                  <option key={key} value={key}>{key}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 font-medium uppercase tracking-wide block mb-1.5">
                Compás
              </label>
              <input
                type="text"
                placeholder="4/4"
                maxLength={5}
                className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2.5 text-center"
                value={formData.compass}
                onChange={(e) => setFormData({ ...formData, compass: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 font-medium uppercase tracking-wide block mb-1.5">
                BPM
              </label>
              <input
                type="number"
                placeholder="120"
                min="0"
                max="999"
                maxLength={3}
                className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2.5 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                value={formData.bpm}
                onChange={(e) => setFormData({ ...formData, bpm: e.target.value.slice(0, 3) })}
              />
            </div>
            <div className="sm:col-span-1">
              <label className="text-xs text-gray-400 font-medium uppercase tracking-wide block mb-1.5">
                Categorías
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                  className="w-full flex items-center justify-between px-3 py-2.5 bg-neutral-900 border border-neutral-700 rounded-lg text-left"
                >
                  <span className={formData.categories.length === 0 ? 'text-gray-500' : 'text-white'}>
                    {formData.categories.length > 0
                      ? `${formData.categories.length} seleccionada(s) - ${formData.categories.slice(0, 2).map(c => SONG_CATEGORIES.find(sc => sc.id === c)?.label).join(', ')}${formData.categories.length > 2 ? '...' : ''}`
                      : 'Seleccionar...'}
                  </span>
                  <ChevronDown size={16} className="text-gray-400 shrink-0 ml-2" />
                </button>

                {showCategoryDropdown && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowCategoryDropdown(false)}
                    />
                    <div className="absolute top-full left-0 right-0 mt-1 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl z-50 max-h-56 sm:max-h-64 overflow-y-auto">
                      <div className="p-2">
                        {SONG_CATEGORIES.map(cat => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => toggleFormCategory(cat.id)}
                            className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-neutral-800 transition-colors text-left"
                          >
                            <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                              formData.categories.includes(cat.id)
                                ? 'bg-purple-500 border-purple-500'
                                : 'border-neutral-600'
                            }`}>
                              {formData.categories.includes(cat.id) && (
                                <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                            <span className={`${cat.color} text-sm`}>{cat.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
              {/* Selected categories display */}
              {formData.categories.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {formData.categories.map(catId => {
                    const cat = SONG_CATEGORIES.find(c => c.id === catId);
                    return cat ? (
                      <span
                        key={catId}
                        className={`text-xs px-2 py-0.5 rounded ${cat.bg} ${cat.color} flex items-center gap-1`}
                      >
                        {cat.label}
                        <button
                          type="button"
                          onClick={() => toggleFormCategory(catId)}
                          className="ml-1 hover:opacity-70"
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          </div>

          <Input
            label="YouTube URL"
            placeholder="https://youtube.com/..."
            value={formData.youtubeUrl}
            onChange={(e) => setFormData({ ...formData, youtubeUrl: e.target.value })}
          />

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                Estructura de la Canción
              </label>
              <Button variant="ghost" size="sm" icon={Plus} onClick={addStructureSection} type="button">
                Agregar Sección
              </Button>
            </div>
            <div className="space-y-3 max-h-80 sm:max-h-96 overflow-y-auto" ref={structureContainerRef}>
              {formData.structure.map((section, index) => (
                <div key={index} className="structure-section bg-neutral-800 rounded-xl p-4 transition-all duration-300 hover:ring-2 hover:ring-purple-500/30">
                  <div className="flex items-center gap-3 mb-3">
                    <GripVertical size={16} className="text-gray-500" />
                    <select
                      className="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2"
                      value={section.type}
                      onChange={(e) => updateStructureSection(index, 'type', e.target.value)}
                    >
                      {sectionTypes.map(type => (
                        <option key={type.id} value={type.id}>{type.label}</option>
                      ))}
                    </select>
                    <Input
                      placeholder="Nombre (opcional)"
                      value={section.label}
                      onChange={(e) => updateStructureSection(index, 'label', e.target.value)}
                      className="flex-1"
                    />
                    {formData.structure.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeStructureSection(index)}
                        className="p-2 text-gray-400 hover:text-red-400"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Acordes</label>
                      <input
                        type="text"
                        placeholder="Am G F C"
                        value={section.chords}
                        onChange={(e) => updateStructureSection(index, 'chords', e.target.value)}
                        className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Letra</label>
                      <textarea
                        placeholder="Letra de la canción..."
                        value={section.content}
                        onChange={(e) => updateStructureSection(index, 'content', e.target.value)}
                        className="w-full h-16 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm resize-none"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {/* Botón para agregar sección debajo de la última */}
            <div className="mt-2">
              <button
                type="button"
                onClick={addStructureSection}
                className="w-full py-2.5 border border-dashed border-neutral-700 rounded-xl text-gray-400 hover:text-white hover:border-neutral-600 transition-colors flex items-center justify-center gap-2 text-sm"
              >
                <Plus size={16} />
                Agregar Sección
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Song Viewer Modal */}
      <Modal
        isOpen={isViewerOpen}
        onClose={() => setIsViewerOpen(false)}
        title={viewingSong?.title}
        size="xl"
      >
        {viewingSong ? (() => {
          const originalKey = viewingSong.originalKey || viewingSong.key;
          const transposedStructure = viewingKey !== originalKey
            ? transposeSongStructure(viewingSong.structure || [], originalKey, viewingKey)
            : viewingSong.structure;

          return (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400">{viewingSong.artist}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <Badge variant="primary">Tono: {originalKey}</Badge>
                    {viewingSong.compass && (
                      <Badge variant="secondary">Compás: {viewingSong.compass}</Badge>
                    )}
                    {viewingSong.bpm && (
                      <Badge variant="secondary">BPM: {viewingSong.bpm}</Badge>
                    )}
                    {(viewingSong.categories || (viewingSong.category ? [viewingSong.category] : [])).map((catId, idx) => (
                      <Badge key={`${catId}-${idx}`} className={categoryConfig[catId]?.bg}>
                        {categoryConfig[catId]?.label}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2"
                    value={viewingKey}
                    onChange={(e) => setViewingKey(e.target.value)}
                  >
                    {MUSICAL_KEYS.map(key => (
                      <option key={key} value={key}>{key}</option>
                    ))}
                  </select>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={FileDown}
                    onClick={() => {
                      setExportModalSong(viewingSong);
                      setExportSongKey(viewingKey);
                    }}
                  >
                    Exportar PDF
                  </Button>
                  {viewingSong.youtubeUrl && (
                    <a
                      href={viewingSong.youtubeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30"
                    >
                      <ExternalLink size={20} />
                    </a>
                  )}
                </div>
              </div>

              {viewingKey !== originalKey && (
                <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-xl p-4">
                  <p className="text-yellow-400 text-sm">
                    Mostrando en tono transportado: <strong>{viewingKey}</strong>
                    <span className="text-gray-400 ml-2">(Original: {originalKey})</span>
                  </p>
                </div>
              )}

              <div className="space-y-4">
                {transposedStructure.map((section, index) => (
                  <div key={index} className="bg-neutral-800/50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="primary" size="sm">{section.label}</Badge>
                    </div>
                    {section.chords && (
                      <p className="text-purple-400 font-mono text-lg mb-3">{section.chords}</p>
                    )}
                    {section.content && (
                      <p className="text-gray-300 whitespace-pre-line leading-relaxed">
                        {section.content}
                      </p>
                    )}
                    {!section.chords && !section.content && section.type === 'intro' && (
                      <p className="text-gray-500 italic text-sm">Musical intro</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })() : null}
      </Modal>

      {/* Export PDF Modal */}
      <Modal
        isOpen={!!exportModalSong}
        onClose={() => setExportModalSong(null)}
        title={`Exportar: ${exportModalSong?.title || ''}`}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setExportModalSong(null)}>Cancelar</Button>
            <Button icon={FileDown} onClick={() => {
              if (exportModalSong) {
                const song = exportModalSong;
                const key = exportSongKey;
                setExportModalSong(null); // Close modal first
                setTimeout(() => {
                  try {
                    generateSongPDF(song, key);
                  } catch (err) {
                    console.error('Error generating PDF:', err);
                    setErrorModal({
                      isOpen: true,
                      title: 'Error',
                      message: 'No se pudo generar el PDF. Intenta de nuevo.'
                    });
                  }
                }, 100); // Small delay to let modal close first
              }
            }}>
              Descargar PDF
            </Button>
          </>
        }
      >
        {exportModalSong && (
          <div className="space-y-4">
            <div className="bg-neutral-800/50 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <Music2 size={20} className="text-purple-400" />
                </div>
                <div>
                  <h3 className="font-semibold">{exportModalSong.title}</h3>
                  <p className="text-sm text-gray-400">{exportModalSong.artist}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="primary">Tono: {exportSongKey}</Badge>
                {exportSongKey !== (exportModalSong.originalKey || exportModalSong.key) && (
                  <Badge variant="secondary">Original: {exportModalSong.originalKey || exportModalSong.key}</Badge>
                )}
                {exportModalSong.compass && (
                  <Badge variant="secondary">Compás: {exportModalSong.compass}</Badge>
                )}
                {exportModalSong.bpm && (
                  <Badge variant="secondary">BPM: {exportModalSong.bpm}</Badge>
                )}
                {(exportModalSong.categories || (exportModalSong.category ? [exportModalSong.category] : [])).map((catId, idx) => (
                  <Badge key={`${catId}-${idx}`} className={categoryConfig[catId]?.bg}>
                    {categoryConfig[catId]?.label}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-400 font-medium uppercase tracking-wide block mb-2">
                Tonalidad para exportar
              </label>
              <select
                className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3"
                value={exportSongKey}
                onChange={(e) => setExportSongKey(e.target.value)}
              >
                {MUSICAL_KEYS.map(key => (
                  <option key={key} value={key}>{key}</option>
                ))}
              </select>
              {exportSongKey !== (exportModalSong.originalKey || exportModalSong.key) && (
                <p className="text-xs text-yellow-400 mt-2">
                  La canción será transportada de {(exportModalSong.originalKey || exportModalSong.key)} a {exportSongKey}
                </p>
              )}
            </div>

            <div className="bg-neutral-800/30 rounded-xl p-4 text-sm text-gray-400">
              <p>El PDF incluirá:</p>
              <ul className="mt-2 space-y-1">
                <li>• Título y artista de la canción</li>
                <li>• Tonalidad seleccionada: <strong className="text-purple-400">{exportSongKey}</strong></li>
                <li>• Estructura con acordes transportados</li>
                <li>• Letra de cada sección</li>
                <li>• Categoría de la canción</li>
              </ul>
            </div>
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
