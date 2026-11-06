// Chargement différé de pptxgenjs (génération PowerPoint) — seulement au clic.
let _p = null;
export function loadPptx() {
  if (!_p) _p = import('pptxgenjs').then(m => m.default || m);
  return _p;
}
