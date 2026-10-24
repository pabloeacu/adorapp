import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { qrSvg } from '../../lib/qr';
import { useEventShell } from './useEventShell';
import './fonts.css';
import './event.css';
import heroDesktop from '../../assets/thechosen/hero-desktop.webp';
import fishVortex from '../../assets/thechosen/fish-vortex.png';
import logoAvivamiento from '../../assets/thechosen/logo-avivamiento.png';
import logoCaf from '../../assets/thechosen/logo-caf-white.png';

function formatCheckedIn(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

export function EventTicket() {
  const { token } = useParams();
  useEventShell('Tu entrada · The Chosen');
  const [state, setState] = useState({ loading: true, data: null, error: false });

  useEffect(() => {
    let alive = true;
    // Carga con red de seguridad: si una llamada se cuelga (red lenta tras
    // reservar), reintenta una vez; nunca queda en "Cargando…" para siempre.
    const fetchTicket = async (attempt = 0) => {
      const timeout = new Promise((resolve) => setTimeout(() => resolve({ __timeout: true }), 7000));
      let res;
      try {
        res = await Promise.race([supabase.rpc('event_ticket', { p_token: token }), timeout]);
      } catch {
        res = { error: true };
      }
      if (!alive) return;
      if (res?.__timeout || res?.error) {
        if (attempt < 2) return fetchTicket(attempt + 1);
        return setState({ loading: false, data: null, error: true });
      }
      if (!res.data) return setState({ loading: false, data: null, error: true });
      setState({ loading: false, data: res.data, error: false });
    };
    fetchTicket();
    return () => { alive = false; };
  }, [token]);

  const qrMarkup = useMemo(() => {
    if (!token) return '';
    const url = `${window.location.origin}/thechosen/validar/${token}`;
    return qrSvg(url, { fg: '#0a0806', bg: '#ffffff', margin: 3, ecl: 'M' });
  }, [token]);

  if (state.loading) {
    return <div className="evt"><div className="evt-center"><p>Cargando tu entrada…</p></div></div>;
  }

  if (!state.data || state.error) {
    return (
      <div className="evt">
        <div className="evt-center">
          <h2>No encontramos esta entrada</h2>
          <p>El enlace puede estar incompleto. Revisá el correo que te enviamos y volvé a tocar el botón de tu entrada.</p>
          <Link className="back" to="/thechosen">Volver a la reserva</Link>
        </div>
      </div>
    );
  }

  const t = state.data;
  const grupo = t.personas > 1 ? `Grupo de ${t.personas} personas` : 'Entrada personal';
  const cancelled = t.status === 'cancelled';
  const used = !!t.checked_in_at;

  return (
    <div className="evt">
      <div className="ticket-page">
        <div className="ticket">
          <div className="ticket-band">
            <img src={heroDesktop} alt="The Chosen — Temporada 6" />
            <div className="band-lbl">
              <div className="k">The Chosen</div>
              <div className="t">Temporada 6<small>Episodio 1 · Acceso anticipado</small></div>
            </div>
          </div>
          <div className="ticket-body">
            <div className="ticket-kicker">Tu entrada</div>
            <div className="ticket-name">{t.nombre}</div>
            <div className="ticket-grupo">{grupo}</div>

            {cancelled ? (
              <div className="ticket-status bad">Esta reserva fue cancelada</div>
            ) : (
              <>
                <div className="ticket-seal">
                  <img className="seal-broche" src={logoAvivamiento} alt="Avivamiento Jóvenes" />
                  <span className="seal-glow" aria-hidden="true"></span>
                  <img className="seal-vortex" src={fishVortex} alt="" aria-hidden="true" />
                  <div className="qr-tile" dangerouslySetInnerHTML={{ __html: qrMarkup }} />
                </div>
                <div className="ticket-code">{t.code}<small>Mostrá este código en la puerta</small></div>
                {used
                  ? <div className="ticket-status used">✓ Ingreso registrado · {formatCheckedIn(t.checked_in_at)}</div>
                  : <div className="ticket-status ok">Entrada válida</div>}
              </>
            )}

            <div className="ticket-meta">
              <div><div className="t">Cuándo</div><div className="v">{t.fecha}</div></div>
              <div><div className="t">Dónde</div><div className="v">{t.lugar}</div></div>
              <div><div className="t">Entrada</div><div className="v" style={{ color: 'var(--gold-bright)' }}>100% gratuita · Cortesía de Come and See</div></div>
            </div>

            <p className="ticket-note">Guardá esta entrada en tu teléfono. En la puerta escaneamos el QR o te buscamos por tu código. ¡Nos vemos el 31! 🙌</p>
          </div>
        </div>
        <div className="ticket-foot">
          <div className="ticket-org">Organiza <b>Avivamiento Jóvenes</b></div>
          <img className="ticket-caf" src={logoCaf} alt="Centro de Avivamiento Familiar" />
          <div className="ticket-pw">Powered by <b>AdorApp</b></div>
        </div>
      </div>
    </div>
  );
}
