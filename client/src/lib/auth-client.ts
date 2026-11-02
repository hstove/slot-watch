import { createAuthClient } from 'better-auth/react';
import { slotsApiUrl } from '@/lib/slots-api';

/**
 * better-auth client. The API is on another origin (api.slotwatch.dev), so the
 * session cookie only rides along with `credentials: 'include'`.
 */
export const authClient = createAuthClient({
  baseURL: slotsApiUrl,
  fetchOptions: { credentials: 'include' },
});
