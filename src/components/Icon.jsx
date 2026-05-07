export default function Icon({ name, filled = false, className = '', size = 24 }) {
  return (
    <span
      className={`material-symbols-outlined select-none ${filled ? 'icon-filled' : ''} ${className}`}
      style={{ fontSize: size }}
    >
      {name}
    </span>
  );
}
