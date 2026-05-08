import { useRef, useEffect, useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import Icon from './Icon';

/**
 * Canvas-based signature pad supporting mouse and touch input.
 * Exposes getDataURL() and clear() via ref.
 */
const SignaturePad = forwardRef(function SignaturePad({ label, subtitle, required, onChange }, ref) {
  const canvasRef    = useRef(null);
  const drawing      = useRef(false);
  const lastPos      = useRef(null);
  const strokes      = useRef([]);   // for undo
  const [signed, setSigned] = useState(false);

  useImperativeHandle(ref, () => ({
    getDataURL: () => (signed ? canvasRef.current?.toDataURL('image/png') : null),
    clear:      () => clearPad(),
    isSigned:   () => signed,
  }));

  /* ── Canvas setup ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle  = '#1c1b19';
    ctx.lineWidth    = 2;
    ctx.lineCap      = 'round';
    ctx.lineJoin     = 'round';
    ctx.fillStyle    = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  /* ── Coordinate helper (normalised to canvas resolution) ── */
  const getPos = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const src    = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * scaleX,
      y: (src.clientY - rect.top)  * scaleY,
    };
  }, []);

  /* ── Drawing handlers ── */
  const onDown = useCallback((e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Save state before stroke for undo
    strokes.current.push(canvas.toDataURL());
    drawing.current = true;
    lastPos.current = getPos(e);
  }, [getPos]);

  const onMove = useCallback((e) => {
    e.preventDefault();
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
    if (!signed) { setSigned(true); onChange?.(true); }
  }, [getPos, signed, onChange]);

  const onUp = useCallback(() => { drawing.current = false; }, []);

  const clearPad = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    strokes.current = [];
    setSigned(false);
    onChange?.(false);
  }, [onChange]);

  const undo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || strokes.current.length === 0) return;
    const prev = strokes.current.pop();
    const img  = new Image();
    img.onload = () => {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = prev;
    if (strokes.current.length === 0) { setSigned(false); onChange?.(false); }
  }, [onChange]);

  return (
    <div className="flex flex-col gap-2">
      {label && (
        <div>
          <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">
            {label}{required && <span className="text-error ml-0.5">*</span>}
          </p>
          {subtitle && <p className="text-xs text-on-surface-variant mt-0.5">{subtitle}</p>}
        </div>
      )}

      <div
        className={`relative rounded-xl overflow-hidden border-2 transition-colors ${
          signed ? 'border-primary/40' : 'border-dashed border-outline-variant'
        }`}
        style={{ touchAction: 'none', background: '#fff' }}
      >
        <canvas
          ref={canvasRef}
          width={480}
          height={150}
          className="w-full cursor-crosshair block"
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onMouseLeave={onUp}
          onTouchStart={onDown}
          onTouchMove={onMove}
          onTouchEnd={onUp}
        />

        {/* Placeholder text */}
        {!signed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-1">
            <Icon name="draw" size={22} className="text-outline/40" />
            <p className="text-xs text-outline/50 font-medium">Signez ici avec la souris ou le doigt</p>
          </div>
        )}

        {/* Signed badge */}
        {signed && (
          <div className="absolute top-2 right-2 flex items-center gap-1 bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-[10px] font-bold pointer-events-none">
            <Icon name="check_circle" size={11} />Signé
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className={`text-xs ${signed ? 'text-green-600 font-semibold' : 'text-on-surface-variant'}`}>
          {signed ? '✓ Signature enregistrée' : 'Aucune signature'}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={undo}
            disabled={strokes.current.length === 0}
            className="text-xs text-on-surface-variant hover:text-on-surface transition-colors disabled:opacity-30 flex items-center gap-0.5"
          >
            <Icon name="undo" size={13} /> Annuler
          </button>
          <span className="text-outline-variant">·</span>
          <button
            type="button"
            onClick={clearPad}
            className="text-xs text-on-surface-variant hover:text-error transition-colors flex items-center gap-0.5"
          >
            <Icon name="delete" size={13} /> Effacer
          </button>
        </div>
      </div>
    </div>
  );
});

export default SignaturePad;
