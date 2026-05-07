const statusStyles = {
  Actif: 'bg-green-100 text-green-800',
  Loué: 'bg-green-100 text-green-800',
  Perçu: 'bg-green-100 text-green-800',
  Payé: 'bg-green-100 text-green-800',
  Disponible: 'bg-surface-container-highest text-on-surface',
  'En cours': 'bg-blue-100 text-blue-800',
  'En attente': 'bg-amber-100 text-amber-800',
  Expirant: 'bg-amber-100 text-amber-800',
  Brouillon: 'bg-slate-200 text-slate-700',
  Résilié: 'bg-red-100 text-red-800',
  Maintenance: 'bg-red-100 text-red-800',
  Résolu: 'bg-teal-100 text-teal-800',
  Urgent: 'bg-error-container text-on-error-container',
  Moyen: 'bg-amber-100 text-amber-800',
  Bas: 'bg-surface-container-highest text-on-surface-variant',
  Inactif: 'bg-slate-200 text-slate-600',
};

const typeStyles = {
  Loyer: 'bg-tertiary/10 text-tertiary',
  Réparations: 'bg-error/10 text-error',
  Taxes: 'bg-secondary-container text-on-secondary-container',
  Plomberie: 'bg-blue-100 text-blue-800',
  HVAC: 'bg-orange-100 text-orange-800',
  Électricité: 'bg-yellow-100 text-yellow-800',
  Autre: 'bg-surface-container-highest text-on-surface-variant',
};

export default function Badge({ label, variant = 'status' }) {
  const styles = variant === 'type' ? typeStyles : statusStyles;
  const cls = styles[label] || 'bg-surface-container-highest text-on-surface-variant';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-label-sm font-label-sm font-bold ${cls}`}>
      {label}
    </span>
  );
}
