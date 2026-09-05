// "Esquema de reunión" — tipos de sección + frases por defecto + helpers de tiempo.
// Fuente única compartida por el armador (RequestSchemaModal) y el presentador
// (IniciarServicio). Las frases las puede ajustar el pastor en la observación.

// isSong: la sección "Adoración" muestra canciones (no frase). isCustom: "Otro"
// usa la observación como contenido.
export const SCHEMA_SECTION_TYPES = [
  { id: 'video_intro',          label: 'Video intro',                phrase: '¡Arrancamos! Prepará el corazón.' },
  { id: 'apertura',             label: 'Apertura',                   phrase: 'Abrimos en Su presencia. ¡Bienvenidos!' },
  { id: 'host',                 label: 'Host',                       phrase: 'El host da la bienvenida.' },
  { id: 'video_bisagra',        label: 'Video bisagra',              phrase: 'Video de transición. Atentos a lo que sigue.' },
  { id: 'obra_teatro',          label: 'Obra de teatro',             phrase: 'A disfrutar la interpretación.' },
  { id: 'coreografia',          label: 'Coreografía',                phrase: 'Esta es otra expresión de adoración. ¡Qué bendición! A disfrutar.' },
  { id: 'adoracion',            label: 'Adoración',                  phrase: '', isSong: true },
  { id: 'anuncios',             label: 'Anuncios',                   phrase: 'Momento de anuncios. Escuchemos con atención.' },
  { id: 'llamada_primera_vez',  label: 'Llamada de primera vez',     phrase: 'Acompañamos en oración a los que vienen por primera vez.' },
  { id: 'ofrenda',              label: 'Ofrenda',                    phrase: 'Momento de la ofrenda. Damos con alegría.' },
  { id: 'predicacion_capsula',  label: 'Predicación · Cápsula',      phrase: 'Cápsula de enseñanza. Preparamos el corazón.' },
  { id: 'predicacion_mensaje',  label: 'Predicación · Mensaje general', phrase: 'A prestar atención. Comer de Cristo es nuestra prioridad.' },
  { id: 'santa_cena',           label: 'Santa Cena',                 phrase: 'Santa Cena. Recordamos con reverencia.' },
  { id: 'ministracion_final',   label: 'Ministración final',         phrase: 'Ministración final. Nos rendimos a Su presencia.' },
  { id: 'otro',                 label: 'Otro',                       phrase: '', isCustom: true },
];

export const sectionMeta = (typeId) =>
  SCHEMA_SECTION_TYPES.find((t) => t.id === typeId) || { id: typeId, label: 'Sección', phrase: '' };

// Un id local estable para el drag-and-drop; SE DEBE stripear antes de persistir.
let _localCounter = 0;
export const nextSchemaLocalId = () => `sch-${_localCounter++}-${Math.floor(Math.random() * 1e6)}`;

// "hh:mm" → minutos desde medianoche (o null).
export const hhmmToMin = (s) => {
  if (!s || typeof s !== 'string' || !/^\d{1,2}:\d{2}$/.test(s)) return null;
  const [h, m] = s.split(':').map(Number);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
};
export const minToHhmm = (min) => {
  if (min == null || !Number.isFinite(min)) return '';
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

// Calcula, para cada sección, su ventana efectiva {startMin, endMin, durationMin}
// según su modo de tiempo. 'startend' fija inicio+fin; 'duration' encadena
// (inicio = fin de la sección anterior CON fin conocido, o el arranque del servicio);
// 'none' no aporta tiempo (no rompe la cadena, se saltea). `serviceStartHhmm` es
// la hora del orden (arranque por defecto). Devuelve un array paralelo a sections.
export const computeSchemaTimeline = (sections, serviceStartHhmm) => {
  let cursor = hhmmToMin(serviceStartHhmm); // puede ser null
  return (sections || []).map((s) => {
    const mode = s.timeMode || 'none';
    if (mode === 'startend') {
      const startMin = hhmmToMin(s.startTime);
      const endMin = hhmmToMin(s.endTime);
      if (endMin != null) cursor = endMin;
      const durationMin = startMin != null && endMin != null && endMin >= startMin ? endMin - startMin : null;
      return { startMin, endMin, durationMin };
    }
    if (mode === 'duration') {
      const dur = Number(s.durationMin);
      const valid = Number.isFinite(dur) && dur > 0;
      const startMin = cursor;
      const endMin = valid && startMin != null ? startMin + dur : null;
      if (endMin != null) cursor = endMin;
      return { startMin, endMin, durationMin: valid ? dur : null };
    }
    return { startMin: null, endMin: null, durationMin: null }; // 'none'
  });
};
