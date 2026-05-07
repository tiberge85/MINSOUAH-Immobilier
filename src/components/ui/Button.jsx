import Icon from '../Icon';

const variants = {
  primary: 'bg-primary text-on-primary hover:opacity-90 shadow-sm',
  secondary: 'border border-outline text-on-surface hover:bg-surface-container-high',
  ghost: 'text-on-surface-variant hover:bg-surface-container-high',
  danger: 'bg-error text-on-error hover:opacity-90',
  gold: 'bg-primary-container text-on-primary-container hover:brightness-95',
};

const sizes = {
  sm: 'px-sm py-xs text-label-sm gap-1',
  md: 'px-md py-sm text-label-md gap-xs',
  lg: 'px-lg py-sm text-label-md gap-xs',
};

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  iconFilled = false,
  className = '',
  onClick,
  disabled = false,
  type = 'button',
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`
        inline-flex items-center justify-center font-label-md rounded-lg
        transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant]} ${sizes[size]} ${className}
      `}
    >
      {icon && <Icon name={icon} filled={iconFilled} size={18} />}
      {children}
    </button>
  );
}
