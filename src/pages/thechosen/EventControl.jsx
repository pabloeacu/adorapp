import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useEventShell } from './useEventShell';
import jsQR from '../../lib/vendor/jsqr';
import './fonts.css';
import './event.css';
import logoAvivamiento from '../../assets/thechosen/logo-avivamiento.png';

// Pantalla de "Control de acceso en la puerta" (Camino B). Para voluntarios SIN
// cuenta de AdorApp: entran con la LLAVE del enlace, abren la cámara en la propia
// página (lector QR jsQR) o tipean el código de 6, y marcan el ingreso. Los RPCs
// event_staff_* están gateados por la llave y solo devuelven nombre + válida/usada.

const KEY_LS = 'evt_staff_key';

// El QR codifica la URL .../thechosen/validar/<token>. Extraemos el token; si el
// voluntario tipea el código de 6, lo dejamos tal cual (el server normaliza hex).
function extractCode(text) {
  if (!text) return '';
  const m = String(text).match(/\/validar\/([0-9a-fA-F]{8,})/);
  return m ? m[1] : String(text).trim();
}
function keyFrom(text) {
  if (!text) return '';
  const m = String(text).match(/[?&]k=([^&\s]+)/);
  return (m ? decodeURIComponent(m[1]) : String(text).trim());
}
function fmtTime(iso) {
  try { return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}
function feedback(ok) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = ok ? 880 : 300; g.gain.value = 0.05; o.start();
    setTimeout(() => { try { o.stop(); ctx.close(); } catch { /* noop */ } }, ok ? 120 : 240);
  } catch { /* noop */ }
  try { if (navigator.vibrate) navigator.vibrate(ok ? 60 : [50, 40, 50]); } catch { /* noop */ }
}

export function EventControl() {
  useEventShell('Control de acceso · The Chosen');
  const [phase, setPhase] = useState('loading');   // loading | locked | ready
  const [ev, setEv] = useState(null);
  const [lockErr, setLockErr] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState('');
  const [count, setCount] = useState(0);
  const [camErr, setCamErr] = useState('');

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(0);
  const scanningRef = useRef(false);
  const lastRef = useRef({ code: '', at: 0 });
  const busyRef = useRef(false);
  const keyRef = useRef('');

  const storeKey = (k) => { try { localStorage.setItem(KEY_LS, k); } catch { /* noop */ } };

  const tryUnlock = useCallback(async (k) => {
    if (!k) { setPhase('locked'); return; }
    const { data, error } = await supabase.rpc('event_staff_auth', { p_key: k });
    if (error || !data?.ok) {
      setLockErr(data?.reason === 'demasiadas_solicitudes'
        ? 'Demasiados intentos. Esperá un momento y reintentá.'
        : 'El enlace de acceso no es válido o fue desactivado. Pedile el enlace al pastor del evento.');
      setPhase('locked');
      return;
    }
    keyRef.current = k; storeKey(k); setEv(data); setLockErr(''); setPhase('ready');
  }, []);

  useEffect(() => {
    let fromUrl = '';
    try {
      const u = new URL(window.location.href);
      fromUrl = u.searchParams.get('k') || '';
      // Sacar la llave de la barra/historial SIEMPRE (haya o no éxito el desbloqueo),
      // así nunca queda en la URL ni puede filtrarse a error_log por un error JS.
      if (u.searchParams.has('k')) { u.searchParams.delete('k'); window.history.replaceState({}, '', u.pathname); }
    } catch { /* noop */ }
    let stored = '';
    try { stored = localStorage.getItem(KEY_LS) || ''; } catch { /* noop */ }
    tryUnlock(fromUrl || stored);
  }, [tryUnlock]);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    const s = streamRef.current;
    if (s) { s.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
  }, []);

  const handleCode = useCallback(async (raw, viaCam) => {
    const code = extractCode(raw);
    if (!code || busyRef.current) return;
    const now = Date.now();
    if (viaCam && code === lastRef.current.code && now - lastRef.current.at < 4000) return;
    lastRef.current = { code, at: now };
    scanningRef.current = false;
    busyRef.current = true; setBusy(true);
    const { data, error } = await supabase.rpc('event_staff_lookup', { p_key: keyRef.current, p_code: code });
    busyRef.current = false; setBusy(false);
    if (error || !data?.ok) {
      setResult({ kind: 'err', title: 'No se pudo verificar', detail: data?.reason === 'demasiadas_solicitudes' ? 'Demasiados escaneos juntos. Probá de nuevo.' : 'Reintentá en un momento.' });
      feedback(false); return;
    }
    if (!data.found) { setResult({ kind: 'bad', title: 'Entrada no válida', detail: 'No encontramos esa entrada. Si la tipeaste, probá escaneando el QR.' }); feedback(false); return; }
    if (data.status === 'cancelled') { setResult({ kind: 'bad', title: 'Reserva cancelada', detail: 'Esta entrada fue cancelada.', nombre: data.nombre }); feedback(false); return; }
    if (data.checked_in_at) { setResult({ kind: 'used', title: 'Ya ingresó', nombre: data.nombre, personas: data.personas, code: data.code, at: data.checked_in_at }); feedback(false); return; }
    setResult({ kind: 'ok', title: 'Entrada válida', nombre: data.nombre, personas: data.personas, code: data.code });
    feedback(true);
  }, []);

  const nextScan = useCallback(() => {
    setResult(null); setManual(''); lastRef.current = { code: '', at: 0 }; scanningRef.current = true;
  }, []);

  const confirmEntry = useCallback(async () => {
    if (!result || result.kind !== 'ok' || busyRef.current) return;
    busyRef.current = true; setBusy(true);
    const { data, error } = await supabase.rpc('event_staff_checkin', { p_key: keyRef.current, p_code: result.code });
    busyRef.current = false; setBusy(false);
    if (error || !data?.ok) { setResult({ kind: 'err', title: 'No se pudo marcar', detail: 'Reintentá.' }); feedback(false); return; }
    setResult({ kind: 'done', title: data.already ? 'Ya había ingresado' : '✓ Ingreso marcado', nombre: data.nombre, personas: data.personas, at: data.checked_in_at });
    if (!data.already) setCount((c) => c + 1);
    feedback(true);
    setTimeout(() => nextScan(), 1700);
  }, [result, nextScan]);

  const startScanLoop = useCallback(() => {
    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      if (!scanningRef.current) return;
      const v = videoRef.current, c = canvasRef.current;
      if (!v || !c || v.readyState < 2) return;
      const w = v.videoWidth, h = v.videoHeight;
      if (!w || !h) return;
      c.width = w; c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(v, 0, 0, w, h);
      let img; try { img = ctx.getImageData(0, 0, w, h); } catch { return; }
      const r = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
      if (r && r.data) handleCode(r.data, true);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [handleCode]);

  useEffect(() => {
    if (phase !== 'ready') return undefined;
    let alive = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (!alive) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) { v.srcObject = stream; await v.play().catch(() => {}); }
        scanningRef.current = true;
        startScanLoop();
      } catch {
        setCamErr('No pudimos abrir la cámara. Dale permiso en el navegador, o usá el código de 6 dígitos.');
      }
    })();
    return () => { alive = false; stopCamera(); };
  }, [phase, startScanLoop, stopCamera]);

  const submitManual = (e) => { e.preventDefault(); if (manual.trim()) handleCode(manual.trim(), false); };

  // ---------- render ----------
  if (phase === 'loading') {
    return <div className="evt"><div className="evt-center"><p>Abriendo el control de acceso…</p></div></div>;
  }

  if (phase === 'locked') {
    return (
      <div className="evt">
        <div className="ctrl-lock">
          <img src={logoAvivamiento} alt="Avivamiento Jóvenes" width="64" height="64" />
          <h2>Control de acceso</h2>
          <p className="ctrl-sub">Pegá el enlace de acceso que te pasó el pastor del evento.</p>
          <form onSubmit={(e) => { e.preventDefault(); tryUnlock(keyFrom(keyInput)); }}>
            <input value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder="Pegá el enlace o la clave aquí" autoComplete="off" />
            <button className="cta" type="submit">Entrar</button>
          </form>
          {lockErr && <p className="err">{lockErr}</p>}
          <p className="ctrl-note">Solo para el equipo de puerta. No compartas este enlace.</p>
        </div>
      </div>
    );
  }

  const r = result;
  return (
    <div className="evt">
      <div className="ctrl">
        <header className="ctrl-head">
          <div>
            <div className="ctrl-k">Control de acceso</div>
            <div className="ctrl-t">{ev?.titulo || 'The Chosen'}</div>
          </div>
          <div className="ctrl-count"><span>{count}</span>ingresos</div>
        </header>

        <div className="ctrl-scanner">
          <video ref={videoRef} playsInline muted className="ctrl-video" />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <div className="ctrl-frame" aria-hidden="true" />
          {camErr
            ? <div className="ctrl-camerr">{camErr}</div>
            : <div className="ctrl-hint">Apuntá al código QR de la entrada</div>}
        </div>

        <form className="ctrl-manual" onSubmit={submitManual}>
          <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="…o escribí el código de 6 (ej. 33AD61)"
            inputMode="text" autoCapitalize="characters" autoComplete="off" maxLength={80} />
          <button type="submit" disabled={busy || !manual.trim()}>Buscar</button>
        </form>

        {r && (
          <div className="ctrl-sheet" role="dialog" aria-live="assertive">
            <div className={`ctrl-result ${r.kind}`}>
              <div className="ctrl-result-title">{r.title}</div>
              {r.nombre && <div className="ctrl-result-name">{r.nombre}</div>}
              {r.personas > 1 && <div className="ctrl-result-grp">Grupo de {r.personas} personas</div>}
              {r.at && <div className="ctrl-result-meta">{r.kind === 'used' ? 'Ingresó a las ' : ''}{fmtTime(r.at)}</div>}
              {r.detail && <div className="ctrl-result-meta">{r.detail}</div>}

              {r.kind === 'ok' && (
                <button className="ctrl-confirm" onClick={confirmEntry} disabled={busy}>
                  {busy ? 'Marcando…' : `Confirmar ingreso${r.personas > 1 ? ` · ${r.personas} personas` : ''}`}
                </button>
              )}
              {r.kind !== 'done' && (
                <button className="ctrl-next" onClick={nextScan} disabled={busy}>
                  {r.kind === 'ok' ? 'Cancelar' : 'Escanear siguiente'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
