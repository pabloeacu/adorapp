// Motor de la campanita: UNA sola fuente para los dos paneles de notificación
// (Header en escritorio y MobileNav en celular).
//
// Hasta ahora esta lógica —carga, mezcla por fecha, realtime, estado de leído,
// caché por usuario— vivía DUPLICADA palabra por palabra en los dos archivos, y
// el landmine #34 obligaba a acordarse de tocar los dos. Ahora es este hook: lo
// que se cambie acá vale para las dos pantallas.
//
// Reglas de producto que NO hay que romper (landmine #34):
//   (a) todo lo que entra al panel lleva `createdAt` y pasa por
//       `sortNotificationsByDateDesc` — las comunicaciones NO van al fondo;
//   (b) tocar un aviso NO lo marca leído (un roce accidental lo borraba): el
//       descarte es sólo por la ✕ de cada card o "Marcar todas". Eso vive en el
//       render de cada panel; este hook sólo expone `markAsRead`/`markAllAsRead`.
//
// El estado de leído se guarda por usuario: las comunicaciones tienen su propia
// columna `is_read`; el resto va a `notifications_read` (así se sincroniza entre
// el celular y la compu). localStorage es sólo caché optimista para que la
// campanita no parpadee entre el montaje y la primera respuesta de la base.
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { sortNotificationsByDateDesc } from '../lib/notifications';

export const iconForNotificationType = (t) => ({
  devotional: 'cross',
  reflection: 'sunset',
  song: 'music',
  band: 'users',
  member: 'heart',
  request: 'file',
  order: 'calendar',
  birthday: 'cake',
}[t] || 'cross');

const timeLabel = (iso) =>
  new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

/**
 * @param {object} opts
 * @param {string} opts.channelKey sufijo del canal de realtime ('desktop' | 'mobile').
 *   Los dos paneles se montan a la vez sobre el MISMO cliente de Supabase, así que
 *   necesitan nombres de canal distintos.
 */
export function useNotificationsPanel({ channelKey }) {
  const user = useAuthStore((s) => s.user);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [readNotificationIds, setReadNotificationIds] = useState([]);

  // Ids leídos del usuario actual. La verdad está en `notifications_read`
  // (sirve en todos sus dispositivos); localStorage es caché anti-parpadeo.
  useEffect(() => {
    if (!user?.id) return;
    const userKey = `readNotificationIds_${user.id}`;

    // 1. Hidratar desde la caché al instante. Depende de user?.id (que llega
    // después del primer render), así que no puede ser estado inicial perezoso.
    const cached = JSON.parse(localStorage.getItem(userKey) || '[]');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReadNotificationIds(cached);
    // Migración de la clave global vieja (legacy).
    const oldKey = localStorage.getItem('readNotificationIds');
    if (oldKey && !localStorage.getItem(userKey)) {
      localStorage.setItem(userKey, oldKey);
      localStorage.removeItem('readNotificationIds');
    }

    // 2. Reemplazar por la verdad de la base apenas llegue.
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('notifications_read')
        .select('notification_id')
        .eq('user_id', user.id);
      if (cancelled) return;
      if (error) {
        console.error('Error fetching notifications_read:', error);
        return;
      }
      const dbIds = (data || []).map((r) => r.notification_id);
      // Unión con la caché para que una marca optimista de esta sesión que
      // todavía no volvió del servidor no desaparezca por un instante.
      const merged = Array.from(new Set([...cached, ...dbIds]));
      setReadNotificationIds(merged);
      localStorage.setItem(userKey, JSON.stringify(merged));
    })();

    return () => { cancelled = true; };
  }, [user?.id]);

  // Carga + realtime. `notifications` trae los avisos globales y los personales
  // (los emiten triggers y crons de la base); las comunicaciones viven en su
  // propia tabla porque llevan remitente + asunto + cuerpo.
  useEffect(() => {
    const loadNotifications = async () => {
      try {
        const notifs = [];
        const nowIso = new Date().toISOString();

        let q = supabase
          .from('notifications')
          .select('id, title, message, type, user_id, is_global, created_at, expires_at')
          .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
          .order('created_at', { ascending: false })
          .limit(20);
        q = user?.id
          ? q.or(`is_global.eq.true,user_id.eq.${user.id}`)
          : q.eq('is_global', true);
        const { data: notifRows, error: notifErr } = await q;
        if (notifErr) console.error('Error fetching notifications:', notifErr);

        (notifRows || []).forEach((n) => {
          notifs.push({
            id: n.id,
            type: n.type,
            title: n.title,
            message: n.message,
            icon: iconForNotificationType(n.type),
            createdAt: n.created_at,
            time: timeLabel(n.created_at),
          });
        });

        // Comunicaciones (otra forma: remitente + asunto + vista previa + cuerpo).
        if (user?.id) {
          const { data: commNotifs } = await supabase
            .from('communication_notifications')
            .select('id, communication_id, sender_name, sender_photo, subject, preview, full_message, is_read, created_at')
            .eq('recipient_id', user.id)
            .eq('is_read', false)
            .order('created_at', { ascending: false })
            .limit(10);

          (commNotifs || []).forEach((cn) => {
            notifs.push({
              id: cn.id,
              type: 'communication',
              communicationId: cn.communication_id,
              senderName: cn.sender_name,
              senderPhoto: cn.sender_photo,
              subject: cn.subject,
              preview: cn.preview,
              fullMessage: cn.full_message,
              message: cn.subject,
              icon: 'send',
              createdAt: cn.created_at,
              time: timeLabel(cn.created_at),
            });
          });
        }

        // TODAS las fuentes mezcladas por fecha real (lo más nuevo arriba);
        // sin esto las comunicaciones quedaban al fondo por el push tardío.
        setNotifications(sortNotificationsByDateDesc(notifs));
        const unread = notifs.filter((n) => !readNotificationIds.includes(n.id)).length;
        setUnreadCount(unread);
      } catch (err) {
        console.error('Error loading notifications:', err);
      }
    };

    // Carga inmediata y después fresco por Realtime + una consulta lenta de
    // respaldo cada 2 minutos.
    loadNotifications();
    const interval = setInterval(loadNotifications, 2 * 60 * 1000);

    const channel = supabase
      .channel(`bell-${user?.id || 'anon'}-${channelKey}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        () => loadNotifications()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'communication_notifications', filter: `recipient_id=eq.${user?.id}` },
        () => loadNotifications()
      )
      // También UPDATE: si marca una comunicación como leída en otro dispositivo,
      // `is_read=true` queda en la base y esta campanita la saca al instante en
      // vez de esperar los 2 minutos de la consulta de respaldo.
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'communication_notifications', filter: `recipient_id=eq.${user?.id}` },
        () => loadNotifications()
      )
      // Ídem `notifications_read`: si marca un aviso global en otro dispositivo,
      // acá llega el INSERT y el contador baja solo.
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications_read', filter: `user_id=eq.${user?.id}` },
        (payload) => {
          const newId = payload?.new?.notification_id;
          if (!newId) return;
          setReadNotificationIds((prev) => {
            if (prev.includes(newId)) return prev;
            const next = [...prev, newId];
            const userKey = `readNotificationIds_${user?.id}`;
            try { localStorage.setItem(userKey, JSON.stringify(next)); } catch { /* ignore quota */ }
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [readNotificationIds, user?.id, channelKey]);

  // Descartar un aviso (por usuario).
  const markAsRead = async (notificationId) => {
    if (!user?.id) return;
    const userKey = `readNotificationIds_${user.id}`;
    const newReadIds = [...readNotificationIds, notificationId];
    // Optimista: estado + caché al instante, sin esperar la ida y vuelta.
    setReadNotificationIds(newReadIds);
    localStorage.setItem(userKey, JSON.stringify(newReadIds));
    setUnreadCount((prev) => Math.max(0, prev - 1));

    const notif = notifications.find((n) => n.id === notificationId);

    if (notif?.type === 'communication') {
      // Las comunicaciones llevan su propio is_read (una fila por destinatario).
      await supabase
        .from('communication_notifications')
        .update({ is_read: true })
        .eq('id', notificationId)
        .eq('recipient_id', user.id);
    } else {
      // El resto guarda el "leído" en notifications_read, así se sincroniza
      // entre dispositivos. ON CONFLICT DO NOTHING por la PK (user, notif).
      await supabase
        .from('notifications_read')
        .upsert(
          { user_id: user.id, notification_id: notificationId },
          { onConflict: 'user_id,notification_id', ignoreDuplicates: true }
        );
    }
  };

  // Marcar como leído todo lo que se ve.
  const markAllAsRead = async () => {
    if (!user?.id) return;
    const userKey = `readNotificationIds_${user.id}`;
    const allIds = notifications.map((n) => n.id);
    setReadNotificationIds(allIds);
    localStorage.setItem(userKey, JSON.stringify(allIds));
    setUnreadCount(0);

    // Separadas por tipo: las comunicaciones marcan is_read en su propia fila,
    // el resto va por notifications_read.
    const commIds = notifications.filter((n) => n.type === 'communication').map((n) => n.id);
    const globalIds = notifications.filter((n) => n.type !== 'communication').map((n) => n.id);

    if (commIds.length > 0) {
      await supabase
        .from('communication_notifications')
        .update({ is_read: true })
        .in('id', commIds)
        .eq('recipient_id', user.id);
    }
    if (globalIds.length > 0) {
      await supabase
        .from('notifications_read')
        .upsert(
          globalIds.map((id) => ({ user_id: user.id, notification_id: id })),
          { onConflict: 'user_id,notification_id', ignoreDuplicates: true }
        );
    }
  };

  return { notifications, unreadCount, readNotificationIds, markAsRead, markAllAsRead };
}
