import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Ticket, Users, RefreshCw, Search, CheckCircle2, Clock,
  Mail, Download, Lock, Unlock, Send, Pencil, X, QrCode,
} from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { supabase } from '../lib/supabase';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { PageLoader } from '../components/ui/PageLoader';

const SLUG = 'thechosen';
const TZ = 'America/Argentina/Buenos_Aires';
const fmtDate = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: TZ }); }
  catch { return '—'; }
};
const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const EMAIL_CHIP = {
  sent: 'bg-green-500/15 text-green-300',
  pending: 'bg-amber-500/15 text-amber-300',
  failed: 'bg-red-500/15 text-red-300',
  bounced: 'bg-red-500/15 text-red-300',
};
const EMAIL_LABEL = { sent: 'Enviado', pending: 'En cola', failed: 'Falló', bounced: 'Rebotó' };

export function Eventos() {
  useDocumentTitle('Eventos');
  const [loading, setLoading] = useState(true);
  const [ev, setEv] = useState(null);
  const [regs, setRegs] = useState([]);
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [editEmail, setEditEmail] = useState('');
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    const [{ data: evs }, { data: rows }] = await Promise.all([
      supabase.from('event_events').select('*').eq('slug', SLUG).maybeSingle().then((r) => ({ data: r.data })),
      supabase.from('event_registrations').select('*').eq('event_slug', SLUG).order('created_at', { ascending: false }),
    ]);
    setEv(evs || null);
    setRegs(rows || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 3500); };

  const stats = useMemo(() => {
    const active = regs.filter((r) => r.status !== 'cancelled');
    const personas = active.reduce((a, r) => a + 1 + (r.acompanantes || 0), 0);
    const ingresados = active.filter((r) => r.checked_in_at).reduce((a, r) => a + 1 + (r.acompanantes || 0), 0);
    return { reservas: active.length, personas, ingresados };
  }, [regs]);

  const filtered = useMemo(() => {
    const nq = norm(q.trim());
    if (!nq) return regs;
    return regs.filter((r) =>
      norm(r.nombre).includes(nq) || norm(r.email).includes(nq) ||
      norm(r.ticket_token?.slice(0, 6)).includes(nq) || norm(r.celular).includes(nq));
  }, [regs, q]);

  const toggleOpen = async () => {
    if (!ev) return;
    setBusyId('toggle');
    const { data, error } = await supabase.rpc('event_set_open', { p_slug: SLUG, p_open: !ev.registration_open });
    setBusyId(null);
    if (error || !data?.ok) { flash('No se pudo cambiar el estado.'); return; }
    setEv((e) => ({ ...e, registration_open: !e.registration_open }));
    flash(data.open ? 'Inscripciones ABIERTAS.' : 'Inscripciones CERRADAS.');
  };

  const checkIn = async (r) => {
    setBusyId(r.id);
    const { data, error } = await supabase.rpc('event_check_in', { p_token: r.ticket_token });
    setBusyId(null);
    if (error || !data?.ok) { flash('No se pudo registrar el ingreso.'); return; }
    setRegs((rs) => rs.map((x) => (x.id === r.id ? { ...x, checked_in_at: data.checked_in_at || new Date().toISOString() } : x)));
    flash(data.already ? `${r.nombre} ya había ingresado.` : `✓ Ingreso de ${r.nombre} registrado.`);
  };

  const resend = async (r, newEmail) => {
    setBusyId(r.id);
    const { data, error } = await supabase.rpc('event_resend', { p_id: r.id, p_new_email: newEmail || null });
    setBusyId(null);
    setEditId(null);
    if (error || !data?.ok) { flash('No se pudo reenviar el correo.'); return; }
    setRegs((rs) => rs.map((x) => (x.id === r.id ? { ...x, email: data.email, email_status: 'pending' } : x)));
    flash(`Correo reencolado a ${data.email}.`);
  };

  const exportCsv = () => {
    const head = ['Nombre', 'Email', 'Celular', 'Iglesia', 'Como se entero', 'Acompanantes', 'Personas', 'Codigo', 'Estado correo', 'Ingreso', 'Fecha reserva'];
    const rows = regs.map((r) => [
      r.nombre, r.email, r.celular, r.iglesia || '', r.como_se_entero || '',
      r.acompanantes || 0, 1 + (r.acompanantes || 0), (r.ticket_token || '').slice(0, 6).toUpperCase(),
      EMAIL_LABEL[r.email_status] || r.email_status, r.checked_in_at ? fmtDate(r.checked_in_at) : '', fmtDate(r.created_at),
    ]);
    const csv = [head, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `inscriptos-thechosen-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (loading) return <PageLoader />;

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-4 pb-20">
      <div className="flex items-center gap-3 mb-5">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-neutral-800 ring-1 ring-gold-500/25">
          <Ticket className="h-5 w-5 text-gold-300" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-gray-100">Evento · The Chosen</h1>
          <p className="text-sm text-gray-400">{ev?.titulo || 'Reservas del evento'}</p>
        </div>
      </div>

      {/* Conteos */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Card padding="md" className="text-center">
          <Users className="h-5 w-5 text-gold-300 mx-auto mb-1" />
          <div className="text-2xl font-bold text-gray-100">{stats.personas}</div>
          <div className="text-xs text-gray-400">personas</div>
        </Card>
        <Card padding="md" className="text-center">
          <Ticket className="h-5 w-5 text-gold-300 mx-auto mb-1" />
          <div className="text-2xl font-bold text-gray-100">{stats.reservas}</div>
          <div className="text-xs text-gray-400">reservas</div>
        </Card>
        <Card padding="md" className="text-center">
          <CheckCircle2 className="h-5 w-5 text-green-400 mx-auto mb-1" />
          <div className="text-2xl font-bold text-gray-100">{stats.ingresados}</div>
          <div className="text-xs text-gray-400">ingresaron</div>
        </Card>
      </div>

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg ${ev?.registration_open ? 'bg-green-500/15 text-green-300' : 'bg-red-500/15 text-red-300'}`}>
          {ev?.registration_open ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          {ev?.registration_open ? 'Inscripciones abiertas' : 'Inscripciones cerradas'}
        </div>
        <Button variant="secondary" onClick={toggleOpen} disabled={busyId === 'toggle'}>
          {ev?.registration_open ? 'Cerrar inscripciones' : 'Abrir inscripciones'}
        </Button>
        <Button variant="secondary" onClick={load}><RefreshCw className="h-4 w-4 mr-1" />Actualizar</Button>
        <Button variant="secondary" onClick={exportCsv}><Download className="h-4 w-4 mr-1" />Exportar</Button>
      </div>

      {/* Buscador / check-in */}
      <div className="relative mb-4">
        <Search className="h-4 w-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre, email, código o celular (para check-in en la puerta)…"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-neutral-900 border border-neutral-700 text-gray-100 text-sm focus:outline-none focus:border-gold-500/50"
        />
      </div>

      {toast && <div className="mb-3 text-sm text-center text-gold-200 bg-gold-500/10 border border-gold-500/25 rounded-lg py-2 px-3">{toast}</div>}

      {/* Lista */}
      {filtered.length === 0 ? (
        <Card padding="lg" className="text-center text-gray-400">
          {regs.length === 0 ? 'Todavía no hay reservas.' : 'Sin resultados para tu búsqueda.'}
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const personas = 1 + (r.acompanantes || 0);
            const used = !!r.checked_in_at;
            const cancelled = r.status === 'cancelled';
            return (
              <Card key={r.id} padding="md" className={cancelled ? 'opacity-60' : ''}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-100">{r.nombre}</span>
                      <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-gold-300">{(r.ticket_token || '').slice(0, 6).toUpperCase()}</span>
                      {personas > 1 && <span className="text-xs text-gray-400 inline-flex items-center gap-1"><Users className="h-3 w-3" />{personas} personas</span>}
                      {cancelled && <span className="text-xs text-red-300">cancelada</span>}
                    </div>
                    <div className="mt-1 text-sm text-gray-400 flex items-center gap-2 flex-wrap">
                      {editId === r.id ? (
                        <span className="inline-flex items-center gap-1">
                          <input value={editEmail} onChange={(e) => setEditEmail(e.target.value)}
                            className="px-2 py-1 rounded bg-neutral-900 border border-neutral-700 text-gray-100 text-sm" />
                          <button className="text-green-400" onClick={() => resend(r, editEmail.trim())} title="Guardar y reenviar"><Send className="h-4 w-4" /></button>
                          <button className="text-gray-500" onClick={() => setEditId(null)}><X className="h-4 w-4" /></button>
                        </span>
                      ) : (
                        <>
                          <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{r.email}</span>
                          <button className="text-gray-500 hover:text-gold-300" onClick={() => { setEditId(r.id); setEditEmail(r.email); }} title="Editar correo"><Pencil className="h-3.5 w-3.5" /></button>
                        </>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                      <span className={`px-1.5 py-0.5 rounded ${EMAIL_CHIP[r.email_status] || 'bg-neutral-800 text-gray-400'}`}>{EMAIL_LABEL[r.email_status] || r.email_status}</span>
                      <span>{r.celular}</span>
                      {r.iglesia && <span>· {r.iglesia}</span>}
                      <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{fmtDate(r.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!cancelled && (
                      used ? (
                        <span className="text-xs text-green-300 inline-flex items-center gap-1"><CheckCircle2 className="h-4 w-4" />Ingresó {fmtDate(r.checked_in_at)}</span>
                      ) : (
                        <Button variant="secondary" onClick={() => checkIn(r)} disabled={busyId === r.id}>
                          <QrCode className="h-4 w-4 mr-1" />Marcar ingreso
                        </Button>
                      )
                    )}
                    {!cancelled && editId !== r.id && (
                      <Button variant="ghost" onClick={() => resend(r)} disabled={busyId === r.id} title="Reenviar correo">
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
