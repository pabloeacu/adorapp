// Single source of truth for "the member row representing the logged-in user".
// Resolved by email since members.user_id is sometimes null for legacy rows;
// once everything migrates to id == auth.uid this can switch to a direct
// lookup, but the email path keeps both pre- and post-migration data working.

import { useMemo } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useAppStore } from '../stores/appStore';

export function useCurrentMember() {
  const user = useAuthStore((s) => s.user);
  const members = useAppStore((s) => s.members);
  return useMemo(() => {
    if (!user?.email) return null;
    return members.find((m) => m.email === user.email) || null;
  }, [user, members]);
}

/**
 * Effective role: prefer the `members` row's role (it's the source of truth
 * once the wizard runs). Falls back to authStore.profile.role for the moment
 * between session-restore and the appStore being ready.
 */
export function useCurrentRole() {
  const member = useCurrentMember();
  const profile = useAuthStore((s) => s.profile);
  return member?.role || profile?.role || 'member';
}
