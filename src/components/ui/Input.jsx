import { useId } from 'react';
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
  id: idProp,
  ...rest
}) {
  const autoId = useId();
  const id = idProp || autoId;
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label htmlFor={id} className="text-label-md font-label-md text-on-surface-variant">
          {label}
          {required && <span className="text-error ml-1">*</span>}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span aria-hidden="true" className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">
            {icon}
          </span>
        )}
        <input
          id={id}
          type={type}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          {...rest}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={`
            w-full bg-surface-container-lowest border border-outline-variant rounded-lg
            py-sm text-body-sm text-on-surface placeholder:text-on-surface-variant/80
            focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20
            transition-all duration-200
            ${icon ? 'pl-10 pr-md' : 'px-md'}
            ${error ? 'border-error focus:ring-error/20' : ''}
          `}
        />
      </div>
      {error && <p id={`${id}-err`} className="text-label-sm text-error">{error}</p>}
    </div>
  );
}

export function Select({ label, value, onChange, options = [], className = '', required = false, id: idProp }) {
  const autoId = useId();
  const id = idProp || autoId;
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label htmlFor={id} className="text-label-md font-label-md text-on-surface-variant">
          {label}
          {required && <span className="text-error ml-1">*</span>}
        </label>
      )}
      <select
        id={id}
        required={required}
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
