import React, { useEffect, useRef, useState, Children } from 'react';

interface SelectProps {
  value: string | number;
  onChange: (e: { target: { value: string } }) => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export function Select({ value, onChange, children, className = '', disabled }: SelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Parse <option> children into { value, label } pairs
  const options = Children.toArray(children).flatMap(child => {
    if (!React.isValidElement(child)) return [];
    if (child.type === 'option') {
      const props = child.props as { value: string; children: React.ReactNode };
      return [{ value: String(props.value ?? ''), label: String(props.children ?? '') }];
    }
    return [];
  });

  const current = options.find(o => String(o.value) === String(value));

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const pick = (val: string) => {
    onChange({ target: { value: val } });
    setOpen(false);
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(v => !v)}
        className={[
          'w-full flex items-center justify-between gap-2',
          'bg-[#1c1c1f] border rounded-lg px-3 py-2.5 text-sm text-left',
          'outline-none transition-colors',
          open
            ? 'border-[#ff732e]/60 ring-1 ring-[#ff732e]/20'
            : 'border-[#383840] hover:border-[#383840]',
          disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
        ].join(' ')}
      >
        <span className={current ? 'text-white' : 'text-[#5a5a62]'}>
          {current?.label ?? '—'}
        </span>
        {/* Chevron */}
        <svg
          className={`w-4 h-4 text-[#7a7a85] flex-shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
        >
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 py-1 bg-[#212126] border border-[#383840] rounded-xl shadow-2xl shadow-black/60 overflow-hidden">
          {options.map(opt => {
            const active = String(opt.value) === String(value);
            return (
              <button
                key={opt.value}
                type="button"
                onMouseDown={() => pick(opt.value)}
                className={[
                  'w-full px-3 py-2 text-sm text-left transition-colors',
                  active
                    ? 'bg-[#ff732e]/15 text-[#ff732e] font-medium'
                    : 'text-gray-300 hover:bg-[#383840] hover:text-white',
                ].join(' ')}
              >
                {active && (
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#ff732e] mr-2 mb-0.5" />
                )}
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
