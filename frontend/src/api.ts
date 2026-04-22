const BASE = '/api';

// All requests are cookie-authenticated. credentials:'include' lets the
// session cookie ride along on same-origin fetches (and on cross-origin if
// the backend's CORS is configured with credentials:true + an explicit
// origin). Bearer-token auth is gone — replaced by session cookies.
async function req<T>(method: string, url: string, body?: any): Promise<T> {
  const res = await fetch(BASE + url, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    // 401 means the session is gone — surface a distinct error so the SPA
    // can redirect to /login instead of showing a generic failure toast.
    if (res.status === 401) throw new ApiError('unauthenticated', 401);
    const text = await res.text().catch(() => '');
    throw new ApiError(text || `HTTP ${res.status}`, res.status);
  }
  return res.json();
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface Me {
  username: string;
  name: string;
  role: 'admin' | 'operator' | 'viewer';
  active: boolean;
  created_at: string | null;
  last_login: string | null;
  login_fails: number;
  locked_until: string | null;
}

export const api = {
  // Auth
  getAuthStatus: () => req<{ needs_setup: boolean }>('GET', '/auth/status'),
  login: (username: string, password: string) =>
    req<{ ok: boolean; user: Me }>('POST', '/auth/login', { username, password }),
  logout: () => req<{ ok: boolean }>('POST', '/auth/logout'),
  me: () => req<Me>('GET', '/auth/me'),
  setup: (data: { username: string; password: string; name?: string }) =>
    req<{ ok: boolean; user: Me }>('POST', '/auth/setup', data),

  // Users (admin only)
  getUsers: () => req<Me[]>('GET', '/users'),
  createUser: (data: { username: string; password: string; name?: string; role: string }) =>
    req<any>('POST', '/users', data),
  updateUser: (username: string, data: any) =>
    req<any>('PUT', `/users/${encodeURIComponent(username)}`, data),
  deleteUser: (username: string) =>
    req<any>('DELETE', `/users/${encodeURIComponent(username)}`),
  unlockUser: (username: string) =>
    req<any>('POST', `/users/${encodeURIComponent(username)}/unlock`),
  getUserHistory: (username: string) =>
    req<any[]>('GET', `/users/${encodeURIComponent(username)}/history`),
  getIpBans: () => req<any[]>('GET', '/users/-/ip-bans'),
  unbanIp: (ip: string) => req<any>('POST', `/users/-/ip-bans/${encodeURIComponent(ip)}/unban`),

  // Regions
  getRegions: () => req<any[]>('GET', '/regions'),
  getRegion: (id: number) => req<any>('GET', `/regions/${id}`),
  createRegion: (data: any) => req<any>('POST', '/regions', data),
  updateRegion: (id: number, data: any) => req<any>('PUT', `/regions/${id}`, data),
  deleteRegion: (id: number) => req<any>('DELETE', `/regions/${id}`),
  triggerAd: (id: number, playlist_id: number, filler_playlist_id?: number) =>
    req<any>('POST', `/regions/${id}/trigger`, { playlist_id, filler_playlist_id }),
  returnToMain: (id: number) => req<any>('POST', `/regions/${id}/return`),
  startMain: (id: number) => req<any>('POST', `/regions/${id}/start`),
  stopRegion: (id: number) => req<any>('POST', `/regions/${id}/stop`),
  getRegionLogs: (id: number) => req<any[]>('GET', `/regions/${id}/logs`),
  getAssignments: (id: number) => req<any[]>('GET', `/regions/${id}/assignments`),
  addAssignment: (id: number, data: any) => req<any>('POST', `/regions/${id}/assignments`, data),
  deleteAssignment: (regionId: number, aid: number) => req<any>('DELETE', `/regions/${regionId}/assignments/${aid}`),

  // Playlists
  getPlaylists: (region_id?: number) => req<any[]>('GET', region_id ? `/playlists?region_id=${region_id}` : '/playlists'),
  getPlaylist: (id: number) => req<any>('GET', `/playlists/${id}`),
  createPlaylist: (data: any) => req<any>('POST', '/playlists', data),
  updatePlaylist: (id: number, data: any) => req<any>('PUT', `/playlists/${id}`, data),
  deletePlaylist: (id: number) => req<any>('DELETE', `/playlists/${id}`),
  deleteItem: (playlistId: number, itemId: number) => req<any>('DELETE', `/playlists/${playlistId}/items/${itemId}`),
  reorderItems: (playlistId: number, order: number[]) => req<any>('PUT', `/playlists/${playlistId}/items`, { order }),

  // Region time-window schedules
  getRegionSchedules: (regionId: number) => req<any[]>('GET', `/regions/${regionId}/time-schedules`),
  createRegionSchedule: (regionId: number, data: any) => req<any>('POST', `/regions/${regionId}/time-schedules`, data),
  updateRegionSchedule: (regionId: number, sid: number, data: any) => req<any>('PUT', `/regions/${regionId}/time-schedules/${sid}`, data),
  deleteRegionSchedule: (regionId: number, sid: number) => req<any>('DELETE', `/regions/${regionId}/time-schedules/${sid}`),

  // Settings
  getSettings: () => req<Record<string, string>>('GET', '/settings'),
  saveSettings: (data: any) => req<any>('PUT', '/settings', data),
  testTelegram: () => req<{ ok: boolean; error?: string }>('POST', '/settings/telegram/test'),

  // Schedules
  getSchedules: () => req<any[]>('GET', '/schedules'),
  createSchedule: (data: any) => req<any>('POST', '/schedules', data),
  updateSchedule: (id: number, data: any) => req<any>('PUT', `/schedules/${id}`, data),
  deleteSchedule: (id: number) => req<any>('DELETE', `/schedules/${id}`),

  // Item weight
  updateItemWeight: (playlistId: number, itemId: number, weight: number) =>
    req<any>('PUT', `/playlists/${playlistId}/items/${itemId}`, { weight }),

  // Reports
  getCampaignReport: (from?: string, to?: string, region_id?: number) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (region_id) params.set('region_id', String(region_id));
    return req<any>('GET', `/reports/campaigns?${params}`);
  },
  getRegionStats: (from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return req<any>('GET', `/reports/regions?${params}`);
  },
  getPlayLog: (params: { from?: string; to?: string; region_id?: number; playlist_id?: number }) => {
    const p = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined) p.set(k, String(v)); });
    return req<any[]>('GET', `/reports/plays?${p}`);
  },
  getMediaPlan: () => req<any[]>('GET', '/reports/mediaplan'),
  downloadMediaPlanXlsx: async () => {
    const res = await fetch(`${BASE}/reports/mediaplan/xlsx`, { credentials: 'include' });
    if (!res.ok) throw new ApiError(await res.text(), res.status);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'mediaplan.xlsx'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  // Status
  getStatus: () => req<any>('GET', '/status'),

  // Logs
  getLogs: (limit = 200) => req<any[]>('GET', `/logs?limit=${limit}`),
  getSystemLogs: (limit = 300) => req<any[]>('GET', `/logs/system?limit=${limit}`),
};

export async function uploadFiles(playlistId: number, files: File[]): Promise<any[]> {
  const form = new FormData();
  files.forEach(f => form.append('files', f));
  const res = await fetch(`${BASE}/playlists/${playlistId}/upload`, {
    method: 'POST',
    credentials: 'include',
    body: form, // no Content-Type — browser sets multipart boundary automatically
  });
  if (!res.ok) throw new ApiError(await res.text(), res.status);
  return res.json();
}
