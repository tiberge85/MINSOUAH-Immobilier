import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import Badge from '../components/ui/Badge';
import Icon from '../components/Icon';

const statusColor = {
  'Payé':     'text-green-700 bg-green-100',
  'Impayé':   'text-error bg-error-container',
  'En retard':'text-amber-700 bg-amber-100',
};
const statusIcon = {
  'Payé': 'check_circle', 'Impayé': 'cancel', 'En retard': 'schedule',
};

export default function TenantPortal() {
  const { state } = useApp();
  const { tenants, contracts, payments, tickets } = state;
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState(null);

  const tenant = tenants.find(t => t.id === selectedId);
  const contract = tenant ? contracts.find(c => c.tenant === tenant.name) : null;
  const tenantPayments = contract
    ? payments.filter(p => p.contractId === contract.id).sort((a, b) => b.id - a.id)
    : [];
  const tenantTickets = tenant
    ? tickets.filter(t => t.property === (contract?.propertyName || tenant.property))
    : [];

  if (!selectedId) {
    return (
      <div className="px-margin pt-gutter pb-xl max-w-5xl mx-auto">
        <div className="flex items-center gap-md mb-lg">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-surface-container border border-outline-variant text-on-surface-variant transition-colors"
          >
            <Icon name="arrow_back" size={18} />
          </button>
          <div>
            <h1 className="font-h2 text-h2 text-on-surface font-bold">Portail Locataires</h1>
            <p className="text-body-sm text-on-surface-variant">Sélectionnez un locataire pour accéder à son espace</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
          {tenants.map(t => {
            const c = contracts.find(ct => ct.tenant === t.name);
            const unpaid = c ? payments.filter(p => p.contractId === c.id && p.status !== 'Payé').length : 0;
            return (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20 hover:border-primary/40 hover:shadow-modal transition-all text-left group"
              >
                <div className="flex items-center gap-md mb-md">
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0 ${t.color}`}>
                    {t.initials}
                  </div>
                  <div>
                    <h3 className="font-label-md text-label-md text-on-surface font-bold">{t.name}</h3>
                    <p className="text-body-sm text-on-surface-variant">{t.property}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Badge label={t.status} />
                  {unpaid > 0 && (
                    <span className="text-label-sm text-error flex items-center gap-1">
                      <Icon name="warning" size={13} />
                      {unpaid} impayé(s)
                    </span>
                  )}
                </div>
                <div className="mt-md pt-md border-t border-outline-variant/20 flex gap-md text-body-sm text-on-surface-variant">
                  <span className="flex items-center gap-1">
                    <Icon name="mail" size={14} />
                    {t.email}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const paidCount = tenantPayments.filter(p => p.status === 'Payé').length;
  const totalPaid = tenantPayments.filter(p => p.status === 'Payé').reduce((s, p) => s + p.amount, 0);

  return (
    <div className="px-margin pt-gutter pb-xl max-w-5xl mx-auto flex flex-col gap-gutter">
      {/* Header */}
      <div className="flex items-center gap-md">
        <button
          onClick={() => setSelectedId(null)}
          className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-surface-container border border-outline-variant text-on-surface-variant transition-colors"
        >
          <Icon name="arrow_back" size={18} />
        </button>
        <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold flex-shrink-0 ${tenant.color}`}>
          {tenant.initials}
        </div>
        <div>
          <h1 className="font-h2 text-h2 text-on-surface font-bold">{tenant.name}</h1>
          <p className="text-body-sm text-on-surface-variant">Portail Locataire • {tenant.property}</p>
        </div>
        <Badge label={tenant.status} className="ml-auto" />
      </div>

      {/* Contact + Contract info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
        {/* Contact */}
        <div className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20">
          <h2 className="font-h3 text-h3 text-on-surface mb-md flex items-center gap-2">
            <Icon name="person" className="text-primary" />
            Informations de Contact
          </h2>
          <div className="flex flex-col gap-sm">
            {[
              { icon: 'mail', label: 'Email', value: tenant.email },
              { icon: 'phone', label: 'Téléphone', value: tenant.phone },
              { icon: 'calendar_today', label: 'Locataire depuis', value: tenant.since },
              { icon: 'apartment', label: 'Propriété', value: tenant.property },
            ].map(row => (
              <div key={row.label} className="flex items-center gap-sm bg-surface-container rounded-xl p-sm">
                <Icon name={row.icon} className="text-primary flex-shrink-0" size={18} />
                <div>
                  <p className="text-label-sm text-on-surface-variant">{row.label}</p>
                  <p className="text-body-sm text-on-surface font-medium">{row.value || '—'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Contract */}
        {contract ? (
          <div className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20">
            <h2 className="font-h3 text-h3 text-on-surface mb-md flex items-center gap-2">
              <Icon name="description" className="text-primary" />
              Bail en Cours
            </h2>
            <div className="flex flex-col gap-sm">
              {[
                { icon: 'home', label: 'Bien loué', value: contract.propertyName },
                { icon: 'payments', label: 'Loyer mensuel', value: `${contract.rent?.toLocaleString('fr-FR')} FCFA/mois` },
                { icon: 'event', label: 'Fin du bail', value: contract.endDate },
                { icon: 'info', label: 'Statut contrat', value: contract.status },
              ].map(row => (
                <div key={row.label} className="flex items-center gap-sm bg-surface-container rounded-xl p-sm">
                  <Icon name={row.icon} className="text-primary flex-shrink-0" size={18} />
                  <div>
                    <p className="text-label-sm text-on-surface-variant">{row.label}</p>
                    <p className="text-body-sm text-on-surface font-medium">{row.value || '—'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20 flex items-center justify-center text-on-surface-variant">
            <div className="text-center">
              <Icon name="description" size={40} className="opacity-30 mb-sm" />
              <p>Aucun contrat actif</p>
            </div>
          </div>
        )}
      </div>

      {/* Payment stats */}
      <div className="grid grid-cols-3 gap-md">
        {[
          { label: 'Paiements effectués', value: paidCount, icon: 'check_circle', color: 'bg-green-100 text-green-700' },
          { label: 'Total versé', value: `${totalPaid.toLocaleString('fr-FR')} FCFA`, icon: 'payments', color: 'bg-primary/10 text-primary' },
          { label: 'Impayés en cours', value: tenantPayments.filter(p => p.status !== 'Payé').length, icon: 'warning', color: 'bg-error/10 text-error' },
        ].map(s => (
          <div key={s.label} className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20 flex items-center gap-md">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${s.color}`}>
              <Icon name={s.icon} size={18} />
            </div>
            <div>
              <p className="text-on-surface-variant text-label-sm uppercase tracking-wider">{s.label}</p>
              <p className="font-h3 text-h3 text-on-surface font-bold">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Payment history */}
      <div className="bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant/20 overflow-hidden">
        <div className="px-md py-md border-b border-outline-variant/20">
          <h3 className="font-h3 text-h3 text-on-surface">Historique des Paiements</h3>
        </div>
        {tenantPayments.length === 0 ? (
          <div className="text-center py-xl text-on-surface-variant">
            <Icon name="payments" size={40} className="opacity-30 mb-sm" />
            <p>Aucun paiement enregistré</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-secondary text-on-primary">
                <tr>
                  <th className="px-md py-3 text-label-sm uppercase tracking-wider">Mois</th>
                  <th className="px-md py-3 text-label-sm uppercase tracking-wider text-right">Montant</th>
                  <th className="px-md py-3 text-label-sm uppercase tracking-wider">Échéance</th>
                  <th className="px-md py-3 text-label-sm uppercase tracking-wider">Payé le</th>
                  <th className="px-md py-3 text-label-sm uppercase tracking-wider">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {tenantPayments.map(p => (
                  <tr key={p.id} className="hover:bg-surface-container-low transition-colors">
                    <td className="px-md py-4 text-body-sm text-on-surface font-medium">{p.month}</td>
                    <td className={`px-md py-4 text-right font-label-md ${p.status === 'Payé' ? 'text-green-700' : 'text-error'}`}>
                      {p.amount.toLocaleString('fr-FR')} FCFA
                    </td>
                    <td className="px-md py-4 text-body-sm text-on-surface">{p.dueDate}</td>
                    <td className="px-md py-4 text-body-sm text-on-surface">{p.paidDate || '—'}</td>
                    <td className="px-md py-4">
                      <span className={`inline-flex items-center gap-1 px-sm py-0.5 rounded-full text-label-sm font-label-sm ${statusColor[p.status] || ''}`}>
                        <Icon name={statusIcon[p.status] || 'info'} size={12} />
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Maintenance tickets */}
      {tenantTickets.length > 0 && (
        <div className="bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant/20 overflow-hidden">
          <div className="px-md py-md border-b border-outline-variant/20">
            <h3 className="font-h3 text-h3 text-on-surface flex items-center gap-2">
              <Icon name="engineering" className="text-primary" />
              Tickets Maintenance
            </h3>
          </div>
          <div className="divide-y divide-outline-variant/20">
            {tenantTickets.map(t => (
              <div key={t.id} className="px-md py-md flex items-start justify-between gap-md">
                <div>
                  <div className="flex items-center gap-sm mb-xs">
                    <Badge label={t.priority} />
                    <span className="text-label-sm text-on-surface-variant">{t.id}</span>
                  </div>
                  <p className="text-label-md font-label-md text-on-surface">{t.title}</p>
                  <p className="text-body-sm text-on-surface-variant mt-0.5">{t.description}</p>
                  <p className="text-label-sm text-on-surface-variant mt-1">Signalé le {t.reportedAt}</p>
                </div>
                <Badge label={t.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
