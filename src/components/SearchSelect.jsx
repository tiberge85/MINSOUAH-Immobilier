import { useState, useEffect, useRef } from 'react';
import Icon from './Icon';

/**
 * Dropdown with text search.
 * options: [{ value, label }]
 * onChange(value): called with the selected option's value string
 */
export default function SearchSelect({ value, onChange, options = [], placeholder = '— Rechercher —', className }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const filtered = options.filter(o =>
    !q || o.label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
           .includes(q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))
  );
  const selected = options.find(o => o.value === value);

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <input
          value={open ? q : (selected?.label || '')}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => { setQ(''); setOpen(true); }}
          placeholder={placeholder}
          className={className || 'form-input pr-8'}
          autoComplete="off"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant">
          <Icon name={open ? 'expand_less' : 'expand_more'} size={16} />
        </span>
      </div>
      {open && (
        <div className="absolute z-30 w-full bg-surface border border-outline-variant/40 rounded-xl shadow-xl mt-1 max-h-52 overflow-y-auto">
          {filtered.length === 0
            ? <p className="px-3 py-2.5 text-sm text-on-surface-variant italic">Aucun résultat</p>
            : filtered.map(o => (
              <button key={o.value} type="button"
                onMouseDown={() => { onChange(o.value); setOpen(false); setQ(''); }}
                className={`w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-primary/8 ${o.value === value ? 'text-primary font-semibold bg-primary/5' : 'text-on-surface'}`}>
                {o.label}
              </button>
            ))
          }
        </div>
      )}
    </div>
  );
}
