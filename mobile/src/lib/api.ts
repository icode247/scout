import type { Session } from '@supabase/supabase-js';

import type { ApiErrorBody } from './types';

const apiRoot = (process.env.EXPO_PUBLIC_API_URL?.trim() || 'https://applyscout.app').replace(/\/$/, '');

export class ScoutApiError extends Error {
  status: number;
  code?: string;
  reason?: string;

  constructor(message: string, status: number, body?: ApiErrorBody) {
    super(message);
    this.name = 'ScoutApiError';
    this.status = status;
    this.code = body?.code;
    this.reason = body?.reason;
  }
}

export async function scoutApi<T>(session: Session | null, path: string, init: RequestInit = {}) {
  if (!session?.access_token) throw new ScoutApiError('Your session has expired. Sign in again.', 401);
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${session.access_token}`);
  headers.set('x-scout-client', 'mobile');
  if (init.body && !(init.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const response = await fetch(`${apiRoot}${path.startsWith('/') ? path : `/${path}`}`, {
    ...init,
    headers,
  });
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    const errorBody = typeof body === 'object' && body ? body as ApiErrorBody : undefined;
    throw new ScoutApiError(errorBody?.error || `Scout request failed (${response.status})`, response.status, errorBody);
  }
  return body as T;
}

export function publicScoutUrl(path: string) {
  return `${apiRoot}${path.startsWith('/') ? path : `/${path}`}`;
}

