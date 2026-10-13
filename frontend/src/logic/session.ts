import { reactive } from 'vue';
import { api, setCsrf, type Session } from './api';

// App-level session state; mirrors legacy App() ready/session flags in main.tsx.
export const sessionState = reactive<{ ready: boolean; session: Session | null }>({ ready: false, session: null });

export async function bootstrapSession() {
  try {
    const me = await api<Session>('/auth/me');
    setCsrf(me.csrf_token);
    sessionState.session = me;
  } catch {
    sessionState.session = null;
  }
  sessionState.ready = true;
}

export function clearSession() {
  sessionState.session = null;
  setCsrf('');
}
