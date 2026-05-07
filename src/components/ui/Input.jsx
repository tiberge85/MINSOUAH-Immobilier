import Icon from '../Icon';

export default function Input({
  label,
  placeholder,
  value,
  onChange,
  type = 'text',
  icon,
  className = '',
  error,
  required = false,
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label className="text-label-md font-label-md text-on-surface-variant">
          {label}
          {required && <span className="text-error ml-1">*</span>}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">
            {icon}
          </span>
        )}
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={`
            w-full bg-surface-container-lowest border border-outline-variant rounded-lg
            py-sm text-body-sm text-on-surface placeholder:text-outline
            focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20
            transition-all duration-200
            ${icon ? 'pl-10 pr-md' : 'px-md'}
            ${error ? 'border-error focus:ring-error/20' : ''}
          `}
        />
      </div>
      {error && <p className="text-label-sm text-error">{error}</p>}
    </div>
  );
}

export function Select({ label, value, onChange, options = [], className = '', required = false }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label className="text-label-md font-label-md text-on-surface-variant">
          {label}
          {required && <span className="text-error ml-1">*</span>}
        </label>
      )}
      <select
        value={value}
        onChange={onChange}
        className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-md py-sm text-body-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
