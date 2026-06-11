import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../api';
import { useSocket } from '../hooks/useSocket';
import { PageHeader, Badge } from '../components/ui';

type CoverageRegion = {
  id: number;
  name: string;
  slug: string;
  icecast_mount: string;
  transmitter_ip: string | null;
  lat: number;
  lng: number;
  enabled: boolean;
  live: { id: number; mode: string } | null;
  transmitter: {
    region_id: number;
    ip: string;
    online: boolean;
    latency_ms: number | null;
    checked_at: number;
  } | null;
};

type TransmitterStatus = CoverageRegion['transmitter'];

const UKRAINE_CENTER: [number, number] = [49.0, 31.5];

function towerIcon(online: boolean): L.DivIcon {
  const colour = online ? '#22c55e' : '#ef4444';
  const wavesOpacity = online ? 0.85 : 0;
  // SVG tower with three radiating arcs. The arcs animate via the
  // `tower-pulse` keyframes in index.css when .online.
  const html = `
    <div class="tower-marker ${online ? 'online' : 'offline'}">
      <svg viewBox="0 0 64 64" width="48" height="48" xmlns="http://www.w3.org/2000/svg">
        <g fill="none" stroke="${colour}" stroke-width="2.5" stroke-linecap="round" opacity="${wavesOpacity}">
          <path class="wave wave-1" d="M22 18 Q14 28 22 42" />
          <path class="wave wave-1" d="M42 18 Q50 28 42 42" />
          <path class="wave wave-2" d="M16 12 Q4 30 16 48" />
          <path class="wave wave-2" d="M48 12 Q60 30 48 48" />
          <path class="wave wave-3" d="M10 6 Q-6 30 10 54" />
          <path class="wave wave-3" d="M54 6 Q70 30 54 54" />
        </g>
        <g fill="${colour}" stroke="${colour}" stroke-width="1.5" stroke-linejoin="round">
          <circle cx="32" cy="20" r="3" />
          <path d="M32 22 L24 56 L40 56 Z" fill-opacity="0.15" />
          <line x1="32" y1="22" x2="24" y2="56" />
          <line x1="32" y1="22" x2="40" y2="56" />
          <line x1="27" y1="38" x2="37" y2="38" />
          <line x1="25" y1="48" x2="39" y2="48" />
        </g>
      </svg>
    </div>
  `;
  return L.divIcon({
    html,
    className: 'tower-marker-wrap',
    iconSize: [48, 48],
    iconAnchor: [24, 48],
    popupAnchor: [0, -48],
  });
}

function popupHtml(r: CoverageRegion): string {
  const t = r.transmitter;
  const ago = t ? Math.round((Date.now() - t.checked_at) / 1000) : null;
  const status = t?.online ? 'на зв\'язку' : (t ? 'немає відповіді' : 'не перевірено');
  const latency = t?.latency_ms != null ? `${t.latency_ms.toFixed(1)} мс` : '—';
  const live = r.live?.mode || (r.enabled ? 'idle' : 'disabled');
  return `
    <div class="tower-popup">
      <div class="tower-popup__name">${escapeHtml(r.name)}</div>
      <div class="tower-popup__row"><span>Mount</span><code>${escapeHtml(r.icecast_mount)}</code></div>
      <div class="tower-popup__row"><span>IP</span><code>${escapeHtml(r.transmitter_ip || '—')}</code></div>
      <div class="tower-popup__row"><span>Сигнал</span>
        <strong style="color:${t?.online ? '#22c55e' : '#ef4444'}">${escapeHtml(status)}</strong>
      </div>
      <div class="tower-popup__row"><span>Затримка</span>${escapeHtml(latency)}</div>
      <div class="tower-popup__row"><span>Перевірено</span>${ago != null ? `${ago}с тому` : '—'}</div>
      <div class="tower-popup__row"><span>Ефір</span>${escapeHtml(live)}</div>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!));
}

export default function MapPage() {
  const [regions, setRegions] = useState<CoverageRegion[]>([]);
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<Map<number, L.Marker>>(new Map());
  const { socket } = useSocket();

  useEffect(() => {
    api.getCoverageMap().then(setRegions);
  }, []);

  // Live transmitter status updates
  useEffect(() => {
    if (!socket) return;
    const handler = (status: TransmitterStatus) => {
      if (!status) return;
      setRegions(prev => prev.map(r => r.id === status.region_id ? { ...r, transmitter: status } : r));
    };
    socket.on('transmitter:status', handler);
    return () => { socket.off('transmitter:status', handler); };
  }, [socket]);

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: UKRAINE_CENTER,
      zoom: 6,
      minZoom: 5,
      maxZoom: 12,
      zoomControl: true,
      attributionControl: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Sync markers with regions
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers = markersRef.current;

    const seen = new Set<number>();
    for (const r of regions) {
      seen.add(r.id);
      const online = !!r.transmitter?.online;
      const existing = markers.get(r.id);
      if (existing) {
        existing.setLatLng([r.lat, r.lng]);
        existing.setIcon(towerIcon(online));
        existing.setPopupContent(popupHtml(r));
      } else {
        const marker = L.marker([r.lat, r.lng], { icon: towerIcon(online) })
          .bindPopup(popupHtml(r), { className: 'tower-popup-wrap', closeButton: true })
          .addTo(map);
        markers.set(r.id, marker);
      }
    }
    // Remove stale markers
    for (const [id, marker] of markers) {
      if (!seen.has(id)) {
        map.removeLayer(marker);
        markers.delete(id);
      }
    }
  }, [regions]);

  const summary = useMemo(() => {
    const total = regions.length;
    const online = regions.filter(r => r.transmitter?.online).length;
    const offline = regions.filter(r => r.transmitter && !r.transmitter.online).length;
    const unknown = total - online - offline;
    return { total, online, offline, unknown };
  }, [regions]);

  return (
    <div className="page">
      <PageHeader
        title="Мапа"
        subtitle={
          <span style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Badge tone="success" dot>{summary.online} онлайн</Badge>
            {summary.offline > 0 && <Badge tone="error" dot>{summary.offline} оффлайн</Badge>}
            {summary.unknown > 0 && <Badge tone="neutral">{summary.unknown} не перевірено</Badge>}
          </span>
        }
      />

      {regions.length === 0 ? (
        <div className="card" style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
          Жодний регіон ще не має координат. Зайдіть у налаштування регіону, додайте lat/lng і IP передавача — і вежа з'явиться на мапі.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div ref={containerRef} style={{ width: '100%', height: 'calc(100vh - 220px)', minHeight: 420 }} />
        </div>
      )}
    </div>
  );
}
