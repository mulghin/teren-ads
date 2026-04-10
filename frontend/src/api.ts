const BASE = '/api';

async function req<T>(method: string, url: string, body?: any): Promise<T> {
  const res = await fetch(BASE + url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const api = {
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

  // Schedules
  getSchedules: () => req<any[]>('GET', '/schedules'),
  createSchedule: (data: any) => req<any>('POST', '/schedules', data),
  updateSchedule: (id: number, data: any) => req<any>('PUT', `/schedules/${id}`, data),
  deleteSchedule: (id: number) => req<any>('DELETE', `/schedules/${id}`),

  // Logs
  getLogs: (limit = 200) => req<any[]>('GET', `/logs?limit=${limit}`),
  getSystemLogs: (limit = 300) => req<any[]>('GET', `/logs/system?limit=${limit}`),
};

export async function uploadFiles(playlistId: number, files: File[]): Promise<any[]> {
  const form = new FormData();
  files.forEach(f => form.append('files', f));
  const res = await fetch(`${BASE}/playlists/${playlistId}/upload`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
