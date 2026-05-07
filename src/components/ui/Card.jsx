export default function Card({ children, className = '', onClick }) {
  return (
    <div
      onClick={onClick}
      className={`
        bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant/20
        ${onClick ? 'cursor-pointer hover:shadow-modal transition-shadow duration-300' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
}

export function StatCard({ label, value, sub, subColor = 'text-green-600', icon, iconBg }) {
  return (
    <div className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20 flex items-start justify-between">
      <div>
        <p className="text-on-surface-variant text-label-sm font-label-sm uppercase tracking-wider mb-base">
          {label}
        </p>
        <h3 className="font-h1 text-h1 text-on-surface font-bold">{value}</h3>
        {sub && (
          <p className={`text-label-sm font-label-sm mt-2 flex items-center gap-1 ${subColor}`}>
            {sub}
          </p>
        )}
      </div>
      {icon && (
        <div className={`p-3 rounded-lg ${iconBg || 'bg-primary-container/10'}`}>
          <span className="material-symbols-outlined text-primary">{icon}</span>
        </div>
      )}
    </div>
  );
}
