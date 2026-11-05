// Chargement différé de la bibliothèque xlsx (~900 Ko).
// Elle n'est téléchargée qu'au PREMIER export/import Excel, pas au démarrage de
// l'application — ce qui allège fortement le tout premier chargement. Le module
// est mis en cache après le premier appel (un seul téléchargement par session).
let _promise = null;
export function loadXLSX() {
  if (!_promise) _promise = import('xlsx');
  return _promise;
}
