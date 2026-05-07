import { useEffect } from 'react';
import Button from './Button';

export default function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className={`relative w-full ${sizes[size]} bg-surface-container-lowest rounded-2xl shadow-modal flex flex-col max-h-[90vh]`}>
        {/* Header */}
        <div className="flex items-center justify-between px-lg py-md border-b border-outline-variant/30">
          <h2 className="font-h2 text-h2 text-on-surface">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high transition-colors text-on-surface-variant"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-lg py-md custom-scrollbar">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-lg py-md border-t border-outline-variant/30 flex justify-end gap-sm">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
