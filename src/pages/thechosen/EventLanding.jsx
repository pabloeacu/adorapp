import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useEventShell } from './useEventShell';
import './fonts.css';
import './event.css';
import heroDesktop from '../../assets/thechosen/hero-desktop.webp';
import heroMobile from '../../assets/thechosen/hero-mobile.webp';
import fishVortex from '../../assets/thechosen/fish-vortex.png';
import logoAvivamiento from '../../assets/thechosen/logo-avivamiento.png';
import logoCaf from '../../assets/thechosen/logo-caf-white.png';
import eventSong from '../../assets/thechosen/thechosen-opening.mp3';

const TARGET = new Date('2026-10-31T19:30:00-03:00').getTime();
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Mensajes de error del servidor -> texto amable para la gente.
const ERR_MAP = {
  inscripciones_cerradas: 'Las inscripciones ya están cerradas. ¡Gracias por tu interés!',
  cupo_completo: '¡Se agotaron los lugares! Escribinos y te avisamos si se libera alguno.',
  email_invalido: 'Revisá el email: parece que tiene un error.',
  nombre_invalido: 'Escribí tu nombre y apellido.',
  celular_invalido: 'Revisá el número de celular.',
  demasiados_acompanantes: 'Son demasiados acompañantes para una sola reserva.',
  demasiadas_solicitudes: 'Estamos recibiendo muchas reservas. Probá de nuevo en un minuto.',
  evento_inexistente: 'No pudimos encontrar el evento. Probá de nuevo más tarde.',
};
function friendlyError(err) {
  const raw = (err?.message || '').toLowerCase();
  if (err?.code === 'PT429' || raw.includes('too many') || raw.includes('demasiadas')) return ERR_MAP.demasiadas_solicitudes;
  for (const key of Object.keys(ERR_MAP)) if (raw.includes(key)) return ERR_MAP[key];
  return 'No pudimos procesar tu reserva ahora. Probá de nuevo en un momento.';
}

function useCountdown() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  const diff = TARGET - now;
  if (diff <= 0) return { today: true };
  return {
    today: false,
    d: Math.floor(diff / 864e5),
    h: String(Math.floor((diff % 864e5) / 36e5)).padStart(2, '0'),
    m: String(Math.floor((diff % 36e5) / 6e4)).padStart(2, '0'),
  };
}

// Música de fondo (opening de The Chosen). Intenta arrancar sola; si el navegador
// bloquea el autoplay con sonido (lo hacen todos sin un gesto del usuario), arranca
// en el PRIMER toque/scroll. Botón de parlantito para silenciar/retomar; recuerda
// la elección en localStorage.
function EventMusic() {
  const ref = useRef(null);
  const [on, setOn] = useState(false);
  const wantRef = useRef(true);

  useEffect(() => {
    try { if (localStorage.getItem('evt_music') === 'off') wantRef.current = false; } catch { /* modo privado */ }
    const a = ref.current;
    if (!a) return;
    a.volume = 0.5;
    const start = () => { if (wantRef.current) a.play().catch(() => {}); };
    start();
    const onFirst = () => { if (wantRef.current && a.paused) start(); };
    const evs = ['pointerdown', 'touchstart', 'keydown'];
    evs.forEach((e) => window.addEventListener(e, onFirst, { passive: true }));
    const onPlay = () => setOn(true);
    const onPause = () => setOn(false);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    return () => {
      evs.forEach((e) => window.removeEventListener(e, onFirst));
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      try { a.pause(); } catch { /* noop */ }
    };
  }, []);

  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) {
      wantRef.current = true;
      try { localStorage.setItem('evt_music', 'on'); } catch { /* noop */ }
      a.play().catch(() => {});
    } else {
      wantRef.current = false;
      try { localStorage.setItem('evt_music', 'off'); } catch { /* noop */ }
      a.pause();
    }
  };

  return (
    <>
      <audio ref={ref} src={eventSong} loop preload="auto" />
      <button type="button" className={`music-btn${on ? ' on' : ''}`} onClick={toggle}
        aria-label={on ? 'Silenciar música' : 'Reproducir música'} aria-pressed={on}>
        {on ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 6a9 9 0 0 1 0 12" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="M22 9l-6 6M16 9l6 6" />
          </svg>
        )}
      </button>
    </>
  );
}

const ACOMP_OPTIONS = [
  { v: '0', label: 'Voy solo/a' },
  { v: '1', label: '1 acompañante' },
  { v: '2', label: '2 acompañantes' },
  { v: '3', label: '3 acompañantes' },
  { v: '4', label: '4 acompañantes' },
  { v: '5', label: '5 acompañantes' },
  { v: '6plus', label: '6 o más' },
];

export function EventLanding() {
  const navigate = useNavigate();
  const cd = useCountdown();
  const [form, setForm] = useState({ nombre: '', email: '', celu: '', iglesia: '', como: '' });
  const [acomp, setAcomp] = useState('0');
  const [guests, setGuests] = useState([]);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const formTopRef = useRef(null);
  useEventShell('The Chosen · Temporada 6 — Reservá tu entrada');

  const numGuests = acomp === '6plus' ? 6 : parseInt(acomp, 10) || 0;

  // Redimensiona la lista de acompañantes preservando lo ya cargado.
  useEffect(() => {
    setGuests((prev) => {
      const next = [];
      for (let i = 0; i < numGuests; i++) next.push(prev[i] || { nombre: '', email: '', celu: '' });
      return next;
    });
  }, [numGuests]);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setGuest = (i, k, v) => setGuests((gs) => gs.map((g, idx) => (idx === i ? { ...g, [k]: v } : g)));

  const validate = () => {
    const e = {};
    if (form.nombre.trim().length < 2) e.nombre = true;
    if (!EMAIL_RE.test(form.email.trim())) e.email = true;
    if (form.celu.replace(/\D/g, '').length < 6) e.celu = true;
    guests.forEach((g, i) => { if (g.nombre.trim().length < 2) e[`g${i}`] = true; });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSubmit = async (ev) => {
    ev.preventDefault();
    setSubmitError('');
    if (!validate()) {
      setSubmitError('Revisá los campos marcados para completar tu reserva.');
      formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setSubmitting(true);
    const payload = {
      event_slug: 'thechosen',
      nombre: form.nombre.trim(),
      email: form.email.trim(),
      celular: form.celu.trim(),
      iglesia: form.iglesia.trim(),
      como_se_entero: form.como,
      acompanantes: guests.map((g) => ({
        nombre: g.nombre.trim(),
        email: g.email.trim(),
        celular: g.celu.trim(),
      })),
    };
    const { data, error } = await supabase.rpc('event_register', { p_payload: payload });
    if (error || !data?.ok || !data?.token) {
      setSubmitting(false);
      setSubmitError(friendlyError(error));
      formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    navigate(`/thechosen/entrada/${data.token}`);
  };

  return (
    <div className="evt">
      <div className="decor" aria-hidden="true">
        <img className="vortex vortex-top" src={fishVortex} alt="" />
      </div>

      <div className="wrap">
        <div className="presenta fade">
          <img src={logoAvivamiento} alt="Avivamiento Jóvenes" width="76" height="76" />
          <span>presenta</span>
        </div>

        <picture className="hero fade">
          <source media="(max-width:719px)" srcSet={heroMobile} />
          <img src={heroDesktop} width="1920" height="1080"
            alt="The Chosen — Temporada 6. Evento de acceso anticipado, Episodio 1. Presentado por Come and See." />
        </picture>

        <section className="hook">
          <p className="kicker fade d1">La hora ha llegado</p>
          <h1 className="fade d1">Su mayor Pasión<br />siempre <em>fuiste vos</em>.</h1>
          <p className="sub fade d2">Viví el estreno del <b style={{ color: 'var(--cream)' }}>Episodio 1 de la Temporada 6</b> en pantalla grande —semanas antes de que llegue al streaming—. Una noche para encontrarte con el amor que lo cambió todo.</p>

          <div className={`count fade d2${cd.today ? ' today' : ''}`} aria-label="Cuenta regresiva">
            {cd.today ? (
              <div className="cell"><div className="n">¡Es hoy!</div></div>
            ) : (
              <>
                <div className="cell"><div className="n">{cd.d}</div><div className="l">Días</div></div>
                <div className="cell"><div className="n">{cd.h}</div><div className="l">Horas</div></div>
                <div className="cell"><div className="n">{cd.m}</div><div className="l">Min</div></div>
              </>
            )}
          </div>
        </section>

        <div className="rule"></div>

        <section className="facts fade d3" aria-label="Datos del evento">
          <div className="fact">
            <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="4.5" width="18" height="17" rx="2.5" /><path d="M3 9h18M8 2.5v4M16 2.5v4" /></svg>
            <div><div className="t">Cuándo</div><div className="v">Sábado 31 de octubre · 19:30 hs<small>Día de la Reforma Protestante</small></div></div>
          </div>
          <div className="fact">
            <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" /><circle cx="12" cy="10" r="2.6" /></svg>
            <div><div className="t">Dónde</div><div className="v">Auditorio CAF<small>San Lorenzo 2738, San Martín</small></div></div>
          </div>
          <div className="fact free">
            <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M3 9.5 12 4l9 5.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5Z" /><path d="M8.5 13.5h7M8.5 16.5h4" /></svg>
            <div><div className="t">Entrada</div><div className="v">100% gratuita<small>Cortesía de Come and See · Cupo por orden de reserva</small></div></div>
          </div>
        </section>

        <p className="lead fade d3">Elegí a quién querés traer. Reservás <b>una entrada para todo tu grupo</b>, y te la enviamos a tu correo con tu código para entrar. <b>Sin costo, sin letra chica.</b></p>

        <div className="form-region">
          <img className="vortex vortex-form" src={fishVortex} alt="" aria-hidden="true" />
          <section className="formwrap" ref={formTopRef}>
            <form onSubmit={onSubmit} noValidate>
              <h2>Reservá tu entrada</h2>
              <p className="note">Te la mandamos a tu correo en minutos.</p>

              <div className="field">
                <label htmlFor="nombre">Nombre y apellido <span className="req">*</span></label>
                <input id="nombre" type="text" placeholder="Tu nombre completo" className={errors.nombre ? 'bad' : ''}
                  value={form.nombre} onChange={(e) => setField('nombre', e.target.value)} />
              </div>
              <div className="row2">
                <div className="field">
                  <label htmlFor="email">Email <span className="req">*</span></label>
                  <input id="email" type="email" inputMode="email" placeholder="tucorreo@mail.com" className={errors.email ? 'bad' : ''}
                    value={form.email} onChange={(e) => setField('email', e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="celu">Celular <span className="req">*</span></label>
                  <input id="celu" type="tel" inputMode="tel" placeholder="11 2345 6789" className={errors.celu ? 'bad' : ''}
                    value={form.celu} onChange={(e) => setField('celu', e.target.value)} />
                </div>
              </div>
              <div className="row2">
                <div className="field">
                  <label htmlFor="iglesia">Iglesia</label>
                  <input id="iglesia" type="text" placeholder="¿A qué iglesia vas?"
                    value={form.iglesia} onChange={(e) => setField('iglesia', e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="como">¿Cómo te enteraste?</label>
                  <select id="como" value={form.como} onChange={(e) => setField('como', e.target.value)}>
                    <option value="">Elegí una opción…</option>
                    <option>Instagram</option>
                    <option>WhatsApp</option>
                    <option>Un amigo o familiar</option>
                    <option>En la iglesia</option>
                    <option>Facebook</option>
                    <option>Otro</option>
                  </select>
                </div>
              </div>

              <div className="field">
                <label htmlFor="acomp">¿Cuántos te acompañan?</label>
                <select id="acomp" value={acomp} onChange={(e) => setAcomp(e.target.value)}>
                  {ACOMP_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                </select>
              </div>

              <div className="guests">
                {guests.map((g, i) => (
                  <div className="guest-card" key={i}>
                    <div className="gh">Acompañante {i + 1}</div>
                    <div className="field">
                      <label>Nombre y apellido <span className="req">*</span></label>
                      <input type="text" placeholder="Nombre del acompañante" className={errors[`g${i}`] ? 'bad' : ''}
                        value={g.nombre} onChange={(e) => setGuest(i, 'nombre', e.target.value)} />
                    </div>
                    <div className="row2">
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>Email</label>
                        <input type="email" inputMode="email" placeholder="correo@mail.com"
                          value={g.email} onChange={(e) => setGuest(i, 'email', e.target.value)} />
                      </div>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>Celular</label>
                        <input type="tel" inputMode="tel" placeholder="11 2345 6789"
                          value={g.celu} onChange={(e) => setGuest(i, 'celu', e.target.value)} />
                      </div>
                    </div>
                  </div>
                ))}
                {acomp === '6plus' && (
                  <p className="fineprint" style={{ textAlign: 'left', marginTop: 12 }}>
                    ¿Vienen más de 6? Cargá los primeros 6 acá y escribinos para sumar al resto. 🙌
                  </p>
                )}
              </div>

              {submitError && <p className="err">{submitError}</p>}

              <button className="cta" type="submit" disabled={submitting}>
                {submitting ? 'Reservando…' : 'Reservar mi entrada gratis'}
                <small>Recibís tu entrada con QR en el correo</small>
              </button>
              <p className="fineprint">Al reservar aceptás recibir tu entrada por correo. Usamos tus datos solo para este evento.</p>
            </form>
          </section>
        </div>

        <footer className="foot">
          <div className="orgs">
            <img className="caf" src={logoCaf} alt="Centro de Avivamiento Familiar" />
          </div>
          <div className="org-line">Organiza <b>Avivamiento Jóvenes</b> · Centro de Avivamiento Familiar</div>
          <div className="courtesy">Evento sin fines de lucro · Entrada cortesía de <b style={{ color: 'var(--muted)' }}>Come and See</b></div>
          <div className="powered">Powered by <b>AdorApp</b></div>
        </footer>
      </div>
      <EventMusic />
    </div>
  );
}
