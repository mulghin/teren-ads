import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useLayoutEffect,
  createContext,
  useContext,
  type ReactNode,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';

// ---------- Icons ----------
export type IconName =
  | 'dashboard' | 'broadcast' | 'grid' | 'list'
  | 'playlist' | 'schedule' | 'report' | 'logs'
  | 'settings' | 'search' | 'bell'
  | 'chevronDown' | 'chevronRight' | 'chevronLeft'
  | 'plus' | 'close' | 'filter'
  | 'upload' | 'download'
  | 'play' | 'pause' | 'skipNext' | 'skipPrev' | 'stop'
  | 'trash' | 'edit' | 'more' | 'restart' | 'check' | 'warn'
  | 'menu' | 'expand' | 'collapse' | 'sparkle' | 'mic' | 'globe'
  | 'users' | 'clock' | 'link' | 'drag' | 'shield' | 'megaphone' | 'return';

const ICONS: Record<IconName, ReactNode> = {
  dashboard: (<>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </>),
  broadcast: (<>
    <circle cx="12" cy="12" r="2" />
    <path d="M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7" />
    <path d="M5.5 18.5a9 9 0 0 1 0-13M18.5 5.5a9 9 0 0 1 0 13" />
  </>),
  grid: (<>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </>),
  list: (<>
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <circle cx="4" cy="6" r="1" />
    <circle cx="4" cy="12" r="1" />
    <circle cx="4" cy="18" r="1" />
  </>),
  playlist: (<>
    <path d="M3 6h13M3 12h13M3 18h9" />
    <path d="M18 18V9l4 2" />
  </>),
  schedule: (<>
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="M3 9h18" />
    <path d="M8 2v4M16 2v4" />
  </>),
  report: <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />,
  logs: (<>
    <path d="M4 6h16M4 12h16M4 18h10" />
    <circle cx="20" cy="18" r="1.2" fill="currentColor" stroke="none" />
  </>),
  settings: (<>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </>),
  search: (<>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>),
  bell: (<>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </>),
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  chevronLeft: <path d="m15 6-6 6 6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  filter: <path d="M3 6h18M7 12h10M10 18h4" />,
  upload: (<>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M17 8l-5-5-5 5" />
    <path d="M12 3v12" />
  </>),
  download: (<>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 10l5 5 5-5" />
    <path d="M12 15V3" />
  </>),
  play: <path d="M7 4v16l13-8z" fill="currentColor" stroke="none" />,
  pause: (<>
    <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
    <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
  </>),
  stop: <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none" />,
  skipNext: (<>
    <path d="M6 4l12 8-12 8z" fill="currentColor" stroke="none" />
    <rect x="18" y="4" width="2" height="16" fill="currentColor" stroke="none" />
  </>),
  skipPrev: (<>
    <path d="M18 4 6 12l12 8z" fill="currentColor" stroke="none" />
    <rect x="4" y="4" width="2" height="16" fill="currentColor" stroke="none" />
  </>),
  trash: (<>
    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
  </>),
  edit: (<>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z" />
  </>),
  more: (<>
    <circle cx="12" cy="5" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none" />
  </>),
  restart: (<>
    <path d="M21 12a9 9 0 1 1-3-6.7" />
    <path d="M21 4v5h-5" />
  </>),
  check: <path d="m5 12 5 5L20 7" />,
  warn: (<>
    <path d="M12 3 2 21h20z" />
    <path d="M12 10v5M12 18v.01" />
  </>),
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  expand: <path d="M5 9V5h4M19 9V5h-4M5 15v4h4M19 15v4h-4" />,
  collapse: <path d="M9 5v4H5M15 5v4h4M9 19v-4H5M15 19v-4h4" />,
  sparkle: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />,
  mic: (<>
    <rect x="9" y="3" width="6" height="12" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <path d="M12 18v3" />
  </>),
  globe: (<>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a13 13 0 0 1 0 18M12 3a13 13 0 0 0 0 18" />
  </>),
  users: (<>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2" />
    <circle cx="17" cy="6" r="2.5" />
    <path d="M22 18v-1a4 4 0 0 0-4-4h-1" />
  </>),
  clock: (<>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>),
  link: (<>
    <path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
    <path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
  </>),
  drag: (<>
    <circle cx="9"  cy="6"  r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="6"  r="1.2" fill="currentColor" stroke="none" />
    <circle cx="9"  cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="9"  cy="18" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="18" r="1.2" fill="currentColor" stroke="none" />
  </>),
  shield: <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" />,
  megaphone: (<>
    <path d="M3 11v2a1 1 0 0 0 1 1h3l4 4V6L7 10H4a1 1 0 0 0-1 1z" />
    <path d="M15 8a4 4 0 0 1 0 8" />
    <path d="M18 5a7 7 0 0 1 0 14" />
  </>),
  return: (<>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h11a5 5 0 0 1 5 5v6" />
  </>),
};

export function Icon({
  name, size = 16, className = '', stroke = 1.6,
}: { name: IconName; size?: number; className?: string; stroke?: number }) {
  const paths = ICONS[name];
  if (!paths) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
         className={className} style={{ flex: 'none' }}>
      {paths}
    </svg>
  );
}

// ---------- Button ----------
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

export function Button({
  variant = 'secondary',
  size,
  icon,
  iconRight,
  children,
  className = '',
  ...rest
}: {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconRight?: IconName;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const sz = size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : '';
  const iconOnly = icon && !children ? 'btn-icon' : '';
  return (
    <button className={`btn btn-${variant} ${sz} ${iconOnly} ${className}`} {...rest}>
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === 'sm' ? 14 : 16} />}
    </button>
  );
}

// ---------- Input ----------
export function Input({
  icon,
  className = '',
  ...rest
}: { icon?: IconName } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {icon && (
        <span style={{
          position: 'absolute', left: 12, top: '50%',
          transform: 'translateY(-50%)', color: 'var(--text-muted)',
          pointerEvents: 'none',
        }}>
          <Icon name={icon} size={15} />
        </span>
      )}
      <input className={`input ${icon ? 'input-with-icon' : ''} ${className}`} {...rest} />
    </div>
  );
}

// ---------- Badge ----------
export type BadgeTone = 'success' | 'warn' | 'error' | 'info' | 'accent' | 'neutral';

export function Badge({
  tone = 'neutral', dot = false, children,
}: { tone?: BadgeTone; dot?: boolean; children: ReactNode }) {
  return (
    <span className={`badge badge-${tone}`}>
      {dot && <span className="badge-dot" />}
      {children}
    </span>
  );
}

// ---------- Card ----------
export function Card({
  hover = false, padding = 16, className = '', style = {}, children, onClick,
}: {
  hover?: boolean;
  padding?: number | string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`card ${hover ? 'card-hover' : ''} ${className}`}
      style={{ padding, cursor: onClick ? 'pointer' : undefined, ...style }}
    >
      {children}
    </div>
  );
}

// ---------- Tabs ----------
export function Tabs<T extends string>({
  value, onChange, items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: string; count?: number }[];
}) {
  return (
    <div className="tabs">
      {items.map(i => (
        <button key={i.value}
                className={`tab ${value === i.value ? 'active' : ''}`}
                onClick={() => onChange(i.value)}>
          {i.label}
          {i.count !== undefined && (
            <span style={{ marginLeft: 8, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
              {i.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ---------- Sparkline ----------
export function Sparkline({
  data, w = 120, h = 32, color = 'var(--accent)', fill = true, showDot = true,
}: {
  data: number[]; w?: number; h?: number; color?: string; fill?: boolean; showDot?: boolean;
}) {
  if (!data.length) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = w / Math.max(1, data.length - 1);
  const pts = data.map((v, i) => [i * stepX, h - ((v - min) / range) * h] as [number, number]);
  const d = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const dFill = d + ` L${w},${h} L0,${h} Z`;
  return (
    <svg width={w} height={h} style={{ display: 'block', overflow: 'visible' }}>
      {fill && <path d={dFill} fill={color} opacity="0.13" />}
      <path d={d} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {showDot && pts.length > 0 && (
        <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.5" fill={color} />
      )}
    </svg>
  );
}

// ---------- BarChart ----------
export function BarChart({
  data, h = 140, color = 'var(--accent)', max,
}: {
  data: { day: string; v: number }[];
  h?: number;
  color?: string;
  max?: number;
}) {
  const m = max || Math.max(...data.map(d => d.v), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: h, width: '100%' }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: '100%',
            height: `${(d.v / m) * 100}%`,
            background: `linear-gradient(180deg, ${color}, ${color}66)`,
            borderRadius: '6px 6px 2px 2px',
            position: 'relative',
            minHeight: 4,
          }}>
            <span className="mono" style={{
              position: 'absolute', top: -20, left: '50%', transform: 'translateX(-50%)',
              fontSize: 10, color: 'var(--text-secondary)', whiteSpace: 'nowrap',
            }}>
              {d.v.toLocaleString('uk-UA')}
            </span>
          </div>
          <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>{d.day}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- AreaChart ----------
export function AreaChart({
  data, w = 720, h = 180, color = 'var(--accent)',
}: {
  data: number[]; w?: number; h?: number; color?: string;
}) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const stepX = w / Math.max(1, data.length - 1);
  const pts = data.map((v, i) => [i * stepX, h - (v / max) * (h - 12) - 2] as [number, number]);
  const d = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const dFill = d + ` L${w},${h} L0,${h} Z`;
  const gid = `areaGrad-${Math.random().toString(36).slice(2, 7)}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.45" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((t, i) => (
        <line key={i} x1="0" x2={w} y1={h * t} y2={h * t} stroke="rgba(255,255,255,0.04)" strokeDasharray="2 4" />
      ))}
      <path d={dFill} fill={`url(#${gid})`} />
      <path d={d} stroke={color} strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------- Modal ----------
export function Modal({
  open, onClose, title, subtitle, children, footer, width = 560,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div onClick={onClose} className="modal-overlay">
      <div onClick={e => e.stopPropagation()} className="modal-box" style={{ maxWidth: width }}>
        <div style={{
          padding: '20px 22px 14px',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16,
        }}>
          <div>
            {title && <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}>{title}</h3>}
            {subtitle && <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>{subtitle}</p>}
          </div>
          <Button variant="ghost" size="sm" icon="close" onClick={onClose} />
        </div>
        <div style={{ padding: '6px 22px 20px', overflow: 'auto' }}>{children}</div>
        {footer && (
          <div style={{
            padding: '14px 22px',
            borderTop: '1px solid var(--border)',
            display: 'flex', justifyContent: 'flex-end', gap: 8,
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Toast ----------
type Toast = {
  id: string;
  title: string;
  body?: string;
  tone?: 'success' | 'warn' | 'error' | 'info' | 'accent';
  icon?: IconName;
  duration?: number;
};
const ToastCtx = createContext<((t: Omit<Toast, 'id'>) => void) | null>(null);
export const useToast = () => {
  const fn = useContext(ToastCtx);
  return fn || (() => {});
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, ...t }]);
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), t.duration || 3800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 100,
        display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360,
      }}>
        {toasts.map(t => (
          <div key={t.id} className="glass"
               style={{
                 padding: '12px 14px', borderRadius: 12,
                 display: 'flex', gap: 10, alignItems: 'flex-start',
                 boxShadow: 'var(--shadow-md)',
                 animation: 'slide-in-right 0.22s ease',
                 borderLeft: `3px solid var(--${t.tone || 'accent'})`,
               }}>
            <Icon name={t.icon || 'check'} size={16} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{t.title}</div>
              {t.body && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{t.body}</div>}
            </div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------- Dropdown Select ----------
type Opt<V extends string | number> = { value: V; label: string; icon?: IconName };

export function DropdownSelect<V extends string | number>({
  value, onChange, options, size = 'md', width, disabled,
}: {
  value: V;
  onChange: (v: V) => void;
  options: Opt<V>[];
  size?: 'sm' | 'md';
  width?: number | string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // Position popup via button's rect so an `overflow: auto` ancestor (modal
  // body, card, etc.) can't clip it. Reposition on scroll/resize; close if
  // the trigger scrolls out of view.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const el = btnRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const curr = options.find(o => o.value === value) || options[0];
  const height = size === 'sm' ? 28 : 36;
  return (
    <div style={{ position: 'relative', width }}>
      <button ref={btnRef} type="button" className="input"
              disabled={disabled}
              onClick={() => !disabled && setOpen(v => !v)}
              style={{
                justifyContent: 'space-between',
                cursor: disabled ? 'not-allowed' : 'pointer',
                width: '100%', height,
                opacity: disabled ? 0.55 : 1,
              }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {curr?.icon && <Icon name={curr.icon} size={13} />}
          {curr?.label}
        </span>
        <Icon name="chevronDown" size={13} className={open ? 'dd-chevron-open' : ''} />
      </button>
      {open && rect && createPortal(
        <div ref={popRef} className="glass" style={{
          position: 'fixed', top: rect.top, left: rect.left, width: rect.width,
          borderRadius: 10, padding: 4, zIndex: 200,
          boxShadow: 'var(--shadow-md)',
          animation: 'fade-in 0.14s ease',
          minWidth: 160,
          maxHeight: '60vh', overflowY: 'auto',
        }}>
          {options.map(o => (
            <button key={String(o.value)}
                    type="button"
                    onClick={() => { onChange(o.value); setOpen(false); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      width: '100%', padding: '8px 10px',
                      borderRadius: 6,
                      fontSize: 13, color: 'var(--text)',
                      background: value === o.value ? 'var(--bg-hover)' : 'transparent',
                      border: 'none', cursor: 'pointer',
                      justifyContent: 'flex-start',
                    }}
                    onMouseEnter={e => { if (value !== o.value) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                    onMouseLeave={e => { if (value !== o.value) e.currentTarget.style.background = 'transparent'; }}>
              {o.icon && <Icon name={o.icon} size={13} />}
              <span style={{ flex: 1, textAlign: 'left' }}>{o.label}</span>
              {value === o.value && <Icon name="check" size={13} />}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

// ---------- EmptyState ----------
export function EmptyState({
  icon = 'sparkle', title, body, action,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div style={{
      padding: 48, textAlign: 'center',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 16,
        background: 'var(--accent-dim)', color: 'var(--accent)',
        display: 'grid', placeItems: 'center',
      }}>
        <Icon name={icon} size={22} />
      </div>
      <div style={{ fontSize: 15, fontWeight: 500 }}>{title}</div>
      {body && <div style={{ color: 'var(--text-secondary)', fontSize: 13, maxWidth: 360 }}>{body}</div>}
      {action}
    </div>
  );
}

// ---------- KPI Card ----------
export function KpiCard({
  label, value, delta, deltaTone = 'success', icon, sparkline, tone = 'neutral', sub,
}: {
  label: string;
  value: ReactNode;
  delta?: string;
  deltaTone?: BadgeTone;
  icon?: IconName;
  sparkline?: number[];
  tone?: 'neutral' | 'accent';
  sub?: string;
}) {
  return (
    <Card hover padding={18} style={{ position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div className="section-label">{label}</div>
        {icon && (
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: tone === 'accent' ? 'var(--accent-dim)' : 'rgba(255,255,255,0.04)',
            color: tone === 'accent' ? 'var(--accent)' : 'var(--text-secondary)',
            display: 'grid', placeItems: 'center',
          }}>
            <Icon name={icon} size={14} />
          </div>
        )}
      </div>
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <div className="tabular" style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em' }}>{value}</div>
        {delta && <Badge tone={deltaTone}>{delta}</Badge>}
      </div>
      {sub && <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>{sub}</div>}
      {sparkline && (
        <div style={{ marginTop: 12 }}>
          <Sparkline data={sparkline} w={220} h={32}
                     color={tone === 'accent' ? 'var(--accent)' : 'var(--text-secondary)'} />
        </div>
      )}
    </Card>
  );
}

// ---------- PageHeader ----------
export function PageHeader({
  title, subtitle, actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
      gap: 24, padding: '28px 0 20px', flexWrap: 'wrap',
    }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em' }}>{title}</h1>
        {subtitle && <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 14 }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  );
}

// ---------- StatusBadge ----------
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: BadgeTone; label: string }> = {
    online:  { tone: 'success', label: 'online' },
    main:    { tone: 'success', label: 'ефір' },
    warn:    { tone: 'warn',    label: 'warning' },
    error:   { tone: 'error',   label: 'error' },
    offline: { tone: 'neutral', label: 'offline' },
    stopped: { tone: 'neutral', label: 'стоп' },
    ad:      { tone: 'accent',  label: 'реклама' },
    filler:  { tone: 'info',    label: 'філер' },
  };
  const c = map[status] || { tone: 'neutral' as BadgeTone, label: status };
  return <Badge tone={c.tone} dot>{c.label}</Badge>;
}

// ---------- LiveDot ----------
export function LiveDot({
  tone = 'success', size = 8,
}: {
  tone?: 'success' | 'warn' | 'error' | 'muted';
  size?: number;
}) {
  const cls = tone === 'success' ? 'live-dot' : `live-dot ${tone}`;
  return <span className={cls} style={{ width: size, height: size }} />;
}

// ---------- Field (form label wrapper) ----------
export function Field({
  label, required, hint, children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        {label}{required && <span style={{ color: 'var(--accent)' }}> *</span>}
      </span>
      {children}
      {hint && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{hint}</span>}
    </label>
  );
}

// ---------- Toggle (switch) ----------
export function Toggle({
  label, value, onChange,
}: {
  label?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const pill = (
    <div
      role="switch" aria-checked={value}
      onClick={() => onChange(!value)}
      style={{
        width: 36, height: 20, borderRadius: 999,
        background: value ? 'var(--accent)' : 'var(--bg-elevated)',
        position: 'relative', transition: 'background 0.15s', flex: 'none',
        cursor: 'pointer',
      }}
    >
      <div style={{
        position: 'absolute', top: 2, left: value ? 18 : 2,
        width: 16, height: 16, borderRadius: 999,
        background: '#fff', transition: 'left 0.15s',
        boxShadow: '0 1px 2px rgba(0,0,0,0.35)',
      }} />
    </div>
  );
  if (!label) return pill;
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '4px 0' }}>
      {pill}
      <span style={{ fontSize: 13, color: 'var(--text)' }}>{label}</span>
    </label>
  );
}

// Re-export hooks
export { useState, useEffect, useRef, useMemo };
