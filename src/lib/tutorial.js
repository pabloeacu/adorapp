// Tutorial / video institucional — fuente única de URL, copy y "visto por persona".
// El video vive en Supabase Storage (bucket público `tutoriales`), se sirve por
// streaming con range requests y NO entra al bundle: preload="none" + poster →
// cero bytes hasta que alguien toca play (100% on-demand, no relentiza la app).
import { supabase } from './supabase';

// Clave del anuncio de única vez (reutilizable para futuros: subir a _v2, etc.).
export const TUTORIAL_KEY = 'institutional_video_v1';

const SB_PUBLIC =
  'https://gvsoexomzfaimagnaqzm.supabase.co/storage/v1/object/public/tutoriales';
export const TUTORIAL_VIDEO_URL = `${SB_PUBLIC}/institucional-v1.mp4`;
export const TUTORIAL_POSTER_URL = `${SB_PUBLIC}/institucional-poster-v1.png`;

// Copy (tono "Excelencia / valor" aprobado por Paul; el posicionamiento
// —la mejor y gratis para ellos— queda ENTRE LÍNEAS, nunca literal).
export const TUTORIAL_COPY = {
  title: 'Conocé AdorAPP a fondo',
  body:
    'Tenés en las manos una herramienta hecha a medida del ministerio, con decenas de recursos esperándote. Grabamos un recorrido —institucional y tutorial— para que la aproveches al máximo y no te quede ninguna función sin descubrir. Diez minutos que valen oro.',
  foot: 'Después lo tenés siempre a mano en la claqueta, arriba.',
};

const LS_KEY = `adorapp:${TUTORIAL_KEY}`;

// Fast-path local (por dispositivo): evita el parpadeo y cubre el modo privado.
export function hasSeenTutorialLocal() {
  try {
    return localStorage.getItem(LS_KEY) === '1';
  } catch {
    return false;
  }
}
export function markTutorialSeenLocal() {
  try {
    localStorage.setItem(LS_KEY, '1');
  } catch {
    /* storage bloqueado: el flag de sesión ya evita repetir en esta carga */
  }
}

// ¿Esta PERSONA ya lo descartó? (tabla announcement_dismissals, dueño-only,
// sincroniza entre el celu y la compu). Devuelve true / false, o null si no se
// pudo saber (sin sesión / error) → el llamador cae al fast-path local.
export async function fetchTutorialSeen() {
  try {
    const { data, error } = await supabase
      .from('announcement_dismissals')
      .select('key')
      .eq('key', TUTORIAL_KEY)
      .maybeSingle();
    if (error) return null;
    return !!data;
  } catch {
    return null;
  }
}

// Marca "visto" para siempre: local + fila por persona (el DEFAULT auth.uid()
// del server pone el user_id; la RLS WITH CHECK lo verifica). Best-effort: si
// la escritura remota falla, el fast-path local ya evita que reaparezca acá.
export async function recordTutorialSeen() {
  markTutorialSeenLocal();
  try {
    await supabase
      .from('announcement_dismissals')
      .upsert({ key: TUTORIAL_KEY }, { onConflict: 'user_id,key' });
  } catch {
    /* no crítico */
  }
}
