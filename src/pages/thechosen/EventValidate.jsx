import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useEventShell } from './useEventShell';
import './fonts.css';
import './event.css';

function fmt(iso) {
  try { return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}

const ICON = {
  ok: <svg viewBox="0 0 24 24" width="38" fill="none" stroke="#f0cd72" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>,
  used: <svg viewBox="0 0 24 24" width="38" fill="none" stroke="#9ad8a6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>,
  bad: <svg viewBox="0 0 24 24" width="38" fill="none" stroke="#e4b7b7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>,
};

export function EventValidate() {
  const { token } = useParams();
  useEventShell('Validar entrada · The Chosen');
  const [s, setS] = useState({ loading: true, data: null });

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase.rpc('event_ticket', { p_token: token });
      if (alive) setS({ loading: false, data: error ? null : data });
    })();
    return () => { alive = false; };
  }, [token]);

  let kind = 'bad', title = 'Entrada no válida', detail = 'No encontramos esta entrada.';
  const t = s.data;
  if (t) {
    if (t.status === 'cancelled') { kind = 'bad'; title = 'Reserva cancelada'; detail = 'Esta entrada fue cancelada.'; }
    else if (t.checked_in_at) { kind = 'used'; title = 'Ya ingresó'; detail = `Registrado el ${fmt(t.checked_in_at)}.`; }
    else { kind = 'ok'; title = 'Entrada válida'; detail = 'Listo para ingresar. El check-in lo confirma el equipo en la puerta.'; }
  }

  return (
    <div className="evt">
      <div className="validate">
        <div className="validate-card">
          {s.loading ? (
            <p className="vmsg">Verificando…</p>
          ) : (
            <>
              <div className={`validate-icon ${kind}`}>{ICON[kind]}</div>
              <h2 style={{ color: kind === 'bad' ? 'var(--danger)' : kind === 'used' ? '#9ad8a6' : 'var(--gold-bright)' }}>{title}</h2>
              {t && t.nombre && <div className="vname">{t.nombre}</div>}
              {t && t.personas > 1 && <div className="vgrupo">Grupo de {t.personas} personas</div>}
              {t && t.code && <div className="vcode">{t.code}</div>}
              <p className="vmsg">{detail}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
