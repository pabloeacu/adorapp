import React, { useState, useMemo } from 'react';
import {
  Plus, Search, Music, Download, Edit, Trash2, Clock, MoreVertical,
  Eye, ExternalLink, Filter, X, GripVertical, Music2, Save,
  LayoutGrid, List, FileDown
} from 'lucide-react';
import { useAppStore, SONG_CATEGORIES, MUSICAL_KEYS, transposeSongStructure } from '../stores/appStore';
import { useAuthStore } from '../stores/authStore';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';

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
};

export const Repertorio = () => {
  const { songs, addSong, updateSong, deleteSong, getUnusedSongs } = useAppStore();
  const { profile } = useAuthStore();
  const isPastor = profile?.role === 'pastor';
  const isLeader = profile?.role === 'leader';

  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
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

  const [formData, setFormData] = useState({
    title: '',
    artist: '',
    key: 'C',
    category: 'adoracion',
    youtubeUrl: '',
    structure: [{ type: 'verse', label: 'Verso 1', content: '', chords: '' }]
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

    if (filterCategory !== 'all') {
      result = result.filter(s => s.category === filterCategory);
    }

    if (showUnused) {
      const unusedIds = new Set(unusedSongs.map(s => s.id));
      result = result.filter(s => unusedIds.has(s.id));
    }

    return result;
  }, [songs, searchTerm, filterCategory, showUnused, unusedSongs]);

  const handleOpenModal = (song = null) => {
    if (song) {
      setEditingSong(song);
      setFormData({
        title: song.title,
        artist: song.artist || '',
        key: song.key || song.originalKey,
        category: song.category || 'adoracion',
        youtubeUrl: song.youtubeUrl || '',
        structure: song.structure || [{ type: 'verse', label: 'Verso 1', content: '', chords: '' }]
      });
    } else {
      setEditingSong(null);
      setFormData({
        title: '',
        artist: '',
        key: 'C',
        category: 'adoracion',
        youtubeUrl: '',
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

  const handleDelete = (songId) => {
    if (window.confirm('¿Estás seguro de eliminar esta canción?')) {
      deleteSong(songId);
    }
  };

  const handleViewSong = (song) => {
    setViewingSong(song);
    setViewingKey(song.originalKey || song.key);
    setIsViewerOpen(true);
  };

  const addStructureSection = () => {
    setFormData(prev => ({
      ...prev,
      structure: [...prev.structure, { type: 'verse', label: 'Verso 2', content: '', chords: '' }]
    }));
  };

  const removeStructureSection = (index) => {
    setFormData(prev => ({
      ...prev,
      structure: prev.structure.filter((_, i) => i !== index)
    }));
  };

  const updateStructureSection = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      structure: prev.structure.map((s, i) =>
        i === index ? { ...s, [field]: value } : s
      )
    }));
  };

  const generateSongPDF = (song, key) => {
    const originalKey = song.originalKey || song.key;
    const transposedStructure = key !== originalKey
      ? transposeSongStructure(song.structure || [], originalKey, key)
      : song.structure;

    const printWindow = window.open('', '_blank');
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${song.title} - AdorAPP</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; background: #1a1a1a; color: #fff; padding: 40px; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
          .header h1 { font-size: 28px; margin-bottom: 8px; }
          .header .artist { color: #888; font-size: 16px; }
          .meta { display: flex; justify-content: center; gap: 20px; margin-top: 15px; }
          .meta span { background: #333; padding: 6px 16px; border-radius: 20px; font-size: 14px; }
          .section { margin-bottom: 20px; padding: 20px; background: #252525; border-radius: 12px; }
          .section-label { color: #a855f7; font-size: 14px; font-weight: 600; margin-bottom: 10px; }
          .chords { color: #a855f7; font-size: 22px; font-family: monospace; margin-bottom: 10px; }
          .lyrics { color: #ccc; font-size: 16px; line-height: 1.8; white-space: pre-wrap; }
          .footer { text-align: center; margin-top: 40px; color: #555; font-size: 12px; }
          @media print { body { background: #fff; color: #000; } .section { background: #f5f5f5; } .chords { color: #7c3aed; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${song.title}</h1>
          <div class="artist">${song.artist || 'Artista desconocido'}</div>
          <div class="meta">
            <span>Tono: ${key}</span>
            ${key !== originalKey ? `<span>Original: ${originalKey}</span>` : ''}
            <span>${categoryConfig[song.category]?.label || 'Sin categoría'}</span>
          </div>
        </div>
        ${transposedStructure.map((section, i) => `
          <div class="section">
            <div class="section-label">${section.label}</div>
            ${section.chords ? `<div class="chords">${section.chords}</div>` : ''}
            ${section.content ? `<div class="lyrics">${section.content}</div>` : ''}
            ${!section.chords && !section.content ? `<div class="lyrics" style="color:#666;font-style:italic">Silencio musical</div>` : ''}
          </div>
        `).join('')}
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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Repertorio de Canciones</h2>
          <p className="text-sm text-gray-400 mt-1">
            {filteredSongs.length} canciones {filterCategory !== 'all' && `· ${categoryConfig[filterCategory]?.label}`}
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
            {(isPastor || isLeader) && (
              <Button icon={Plus} onClick={() => handleOpenModal()}>
                Nueva Canción
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
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
        <div className="flex gap-2">
          <select
            className="px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-xl focus:outline-none focus:border-white"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <option value="all">Todas las categorías</option>
            {SONG_CATEGORIES.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.label}</option>
            ))}
          </select>
          <Button
            variant={showUnused ? 'primary' : 'secondary'}
            icon={Clock}
            onClick={() => setShowUnused(!showUnused)}
          >
            Sin usar {showUnused && `(${unusedSongs.length})`}
          </Button>
        </div>
      </div>

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
              </div>

              <div className="flex items-center gap-2 mb-3">
                <Badge className={categoryConfig[song.category]?.bg} variant="default">
                  <span className={categoryConfig[song.category]?.color}>
                    {categoryConfig[song.category]?.label}
                  </span>
                </Badge>
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
                {(isPastor || isLeader) && (
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
                      onClick={() => handleDelete(song.id)}
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
                      <Badge className={categoryConfig[song.category]?.bg} variant="default" size="sm">
                        <span className={categoryConfig[song.category]?.color}>
                          {categoryConfig[song.category]?.label}
                        </span>
                      </Badge>
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
                        {(isPastor || isLeader) && (
                          <>
                            <button
                              onClick={() => handleOpenModal(song)}
                              className="p-1.5 rounded hover:bg-neutral-800 transition-colors text-gray-400"
                              title="Editar"
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              onClick={() => handleDelete(song.id)}
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
          <Button
            variant="secondary"
            icon={Plus}
            onClick={() => handleOpenModal()}
            className="mt-4"
          >
            Agregar primera canción
          </Button>
        </div>
      )}

      {/* Add/Edit Song Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingSong ? 'Editar Canción' : 'Nueva Canción'}
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={handleCloseModal}>Cancelar</Button>
            <Button icon={Save} onClick={handleSubmit} disabled={!formData.title.trim()}>
              {editingSong ? 'Guardar Cambios' : 'Crear Canción'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
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

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-gray-400 font-medium uppercase tracking-wide block mb-1.5">
                Tono Original
              </label>
              <select
                className="w-full"
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
                Categoría
              </label>
              <select
                className="w-full"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              >
                {SONG_CATEGORIES.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.label}</option>
                ))}
              </select>
            </div>
            <Input
              label="YouTube URL"
              placeholder="https://youtube.com/..."
              value={formData.youtubeUrl}
              onChange={(e) => setFormData({ ...formData, youtubeUrl: e.target.value })}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                Estructura de la Canción
              </label>
              <Button variant="ghost" size="sm" icon={Plus} onClick={addStructureSection}>
                Agregar Sección
              </Button>
            </div>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {formData.structure.map((section, index) => (
                <div key={index} className="bg-neutral-800 rounded-xl p-4">
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
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="primary">Tono Original: {originalKey}</Badge>
                    <Badge className={categoryConfig[viewingSong.category]?.bg}>
                      {categoryConfig[viewingSong.category]?.label}
                    </Badge>
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
                generateSongPDF(exportModalSong, exportSongKey);
                setExportModalSong(null);
              }
            }}>
              Generar PDF
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
              <div className="flex gap-2">
                <Badge variant="primary">Original: {exportModalSong.originalKey || exportModalSong.key}</Badge>
                <Badge className={categoryConfig[exportModalSong.category]?.bg}>
                  {categoryConfig[exportModalSong.category]?.label}
                </Badge>
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
    </div>
  );
};
