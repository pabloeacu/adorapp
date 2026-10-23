import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { qrSvg } from '../../lib/qr';
import { useEventShell } from './useEventShell';
import './fonts.css';
import './event.css';
import heroDesktop from '../../assets/thechosen/hero-desktop.webp';

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
    (async () => {
      const { data, error } = await supabase.rpc('event_ticket', { p_token: token });
      if (!alive) return;
      if (error || !data) setState({ loading: false, data: null, error: true });
      else setState({ loading: false, data, error: false });
    })();
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
          <div className="ticket-hero">
            <img src={heroDesktop} alt="The Chosen — Temporada 6" />
          </div>
          <div className="ticket-body">
            <div className="ticket-kicker">Tu entrada</div>
            <div className="ticket-name">{t.nombre}</div>
            <div className="ticket-grupo">{grupo}</div>

            {cancelled ? (
              <div className="ticket-status bad">Esta reserva fue cancelada</div>
            ) : (
              <>
                <div className="qr-panel" dangerouslySetInnerHTML={{ __html: qrMarkup }} />
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
        <div className="ticket-foot">Organiza <b>Avivamiento Jóvenes</b> · Powered by <b>AdorApp</b></div>
      </div>
    </div>
  );
}
