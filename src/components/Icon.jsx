// Icône Material Symbols (police à ligatures).
// Décorative par défaut : aria-hidden évite que les lecteurs d'écran lisent le
// nom de la ligature (« visibility », « menu »…). Passer `label` quand l'icône
// porte seule un sens qui n'est écrit nulle part ailleurs.
export default function Icon({ name, filled = false, className = '', size = 24, label }) {
  return (
    <span
      className={`material-symbols-outlined select-none ${filled ? 'icon-filled' : ''} ${className}`}
      style={{ fontSize: size }}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {name}
    </span>
  );
}
