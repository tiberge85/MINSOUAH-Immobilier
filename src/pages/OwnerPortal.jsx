import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import Badge from '../components/ui/Badge';
import Icon from '../components/Icon';

export default function OwnerPortal() {
  const { state } = useApp();
  const { owners, properties, contracts, payments, tickets } = state;
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState(null);

  const owner = owners.find(o => o.id === selectedId);
  const ownerProperties = owner
    ? properties.filter(p => p.owner === owner.name)
    : [];
  const ownerContracts = ownerProperties.length
    ? contracts.filter(c => ownerProperties.some(p => p.name === c.propertyName))
    : [];
  const ownerPayments = ownerContracts.length
    ? payments.filter(p => ownerContracts.some(c => c.id === p.contractId))
    : [];
  const ownerTickets = ownerProperties.length
    ? tickets.filter(t => ownerProperties.some(p => p.name === t.property))
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
            <h1 className="font-h2 text-h2 text-on-surface font-bold">Portail Propriétaires</h1>
            <p className="text-body-sm text-on-surface-variant">Sélectionnez un propriétaire pour accéder à son tableau de bord</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
          {owners.map(o => {
            const ownedProps = properties.filter(p => p.owner === o.name);
            const activeContracts = contracts.filter(c =>
              ownedProps.some(p => p.name === c.propertyName) && c.status === 'Actif'
            ).length;
            return (
              <button
                key={o.id}
                onClick={() => setSelectedId(o.id)}
                className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20 hover:border-primary/40 hover:shadow-modal transition-all text-left group"
              >
                <div className="flex items-center gap-md mb-md">
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0 ${o.color}`}>
                    {o.initials}
                  </div>
                  <div>
                    <h3 className="font-label-md text-label-md text-on-surface font-bold">{o.name}</h3>
                    <p className="text-body-sm text-on-surface-variant">{ownedProps.length} bien(s) — {activeContracts} contrat(s) actif(s)</p>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-sm border-t border-outline-variant/20">
                  <span className="text-label-sm text-on-surface-variant flex items-center gap-1">
                    <Icon name="payments" size={14} />
                    {o.revenue?.toLocaleString('fr-FR')} FCFA/mois
                  </span>
                  <Badge label={o.status} />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const totalRevenue = ownerContracts.filter(c => c.status === 'Actif').reduce((s, c) => s + (c.rent || 0), 0);
  const collectedThisMonth = ownerPayments.filter(p => p.status === 'Payé' && p.month === 'Novembre 2024').reduce((s, p) => s + p.amount, 0);
  const pendingAmount = ownerPayments.filter(p => p.status !== 'Payé').reduce((s, p) => s + p.amount, 0);

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
        <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold flex-shrink-0 ${owner.color}`}>
          {owner.initials}
        </div>
        <div>
          <h1 className="font-h2 text-h2 text-on-surface font-bold">{owner.name}</h1>
          <p className="text-body-sm text-on-surface-variant">Portail Propriétaire — {ownerProperties.length} bien(s)</p>
        </div>
        <Badge label={owner.status} className="ml-auto" />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-md">
        {[
          { label: 'Biens', value: ownerProperties.length, icon: 'apartment', color: 'bg-primary/10 text-primary' },
          { label: 'Revenus mensuels', value: `${totalRevenue.toLocaleString('fr-FR')} FCFA`, icon: 'trending_up', color: 'bg-green-100 text-green-700' },
          { label: 'Encaissé ce mois', value: `${collectedThisMonth.toLocaleString('fr-FR')} FCFA`, icon: 'check_circle', color: 'bg-tertiary/10 text-tertiary' },
          { label: 'Impayés', value: `${pendingAmount.toLocaleString('fr-FR')} FCFA`, icon: 'warning', color: pendingAmount > 0 ? 'bg-error/10 text-error' : 'bg-green-100 text-green-700' },
        ].map(s => (
          <div key={s.label} className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-sm ${s.color}`}>
              <Icon name={s.icon} size={18} />
            </div>
            <p className="text-on-surface-variant text-label-sm uppercase tracking-wider">{s.label}</p>
            <p className="font-h3 text-h3 text-on-surface font-bold mt-0.5">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Properties */}
      <div className="bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant/20 overflow-hidden">
        <div className="px-md py-md border-b border-outline-variant/20">
          <h3 className="font-h3 text-h3 text-on-surface flex items-center gap-2">
            <Icon name="domain" className="text-primary" />
            Mes Biens Immobiliers
          </h3>
        </div>
        {ownerProperties.length === 0 ? (
          <div className="text-center py-xl text-on-surface-variant">
            <Icon name="apartment" size={40} className="opacity-30 mb-sm" />
            <p>Aucun bien enregistré</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-md p-md">
            {ownerProperties.map(prop => {
              const propContract = contracts.find(c => c.propertyName === prop.name && c.status === 'Actif');
              const openTickets = tickets.filter(t => t.property === prop.name && t.status !== 'Résolu').length;
              return (
                <div key={prop.id} className="bg-surface-container rounded-xl overflow-hidden border border-outline-variant/20">
                  {prop.image && (
                    <img src={prop.image} alt={prop.name} className="w-full h-36 object-cover" />
                  )}
                  <div className="p-md">
                    <div className="flex justify-between items-start mb-sm">
                      <div>
                        <h4 className="font-label-md text-label-md text-on-surface font-bold">{prop.name}</h4>
                        <p className="text-body-sm text-on-surface-variant">{prop.address}</p>
                      </div>
                      <Badge label={prop.status} />
                    </div>
                    <div className="grid grid-cols-2 gap-sm text-body-sm mt-sm">
                      <div className="flex items-center gap-xs text-on-surface-variant">
                        <Icon name="straighten" size={14} />
                        {prop.surface} m²
                      </div>
                      <div className="flex items-center gap-xs text-on-surface-variant">
                        <Icon name="meeting_room" size={14} />
                        {prop.rooms > 0 ? `${prop.rooms} pièces` : 'Commerce'}
                      </div>
                      <div className="flex items-center gap-xs text-primary font-medium">
                        <Icon name="payments" size={14} />
                        {prop.rent?.toLocaleString('fr-FR')} FCFA/mois
                      </div>
                      {openTickets > 0 && (
                        <div className="flex items-center gap-xs text-error font-medium">
                          <Icon name="engineering" size={14} />
                          {openTickets} ticket(s) ouvert(s)
                        </div>
                      )}
                    </div>
                    {propContract && (
                      <div className="mt-sm pt-sm border-t border-outline-variant/20 text-body-sm text-on-surface-variant">
                        Locataire : <span className="text-on-surface font-medium">{propContract.tenant}</span>
                        {propContract.endDate !== '—' && ` — Bail jusqu'au ${propContract.endDate}`}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent payments */}
      {ownerPayments.length > 0 && (
        <div className="bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant/20 overflow-hidden">
          <div className="px-md py-md border-b border-outline-variant/20">
            <h3 className="font-h3 text-h3 text-on-surface flex items-center gap-2">
              <Icon name="payments" className="text-primary" />
              Paiements Récents
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-secondary text-on-primary">
                <tr>
                  <th className="px-md py-3 text-label-sm uppercase tracking-wider">Propriété</th>
                  <th className="px-md py-3 text-label-sm uppercase tracking-wider">Locataire</th>
                  <th className="px-md py-3 text-label-sm uppercase tracking-wider">Mois</th>
                  <th className="px-md py-3 text-label-sm uppercase tracking-wider text-right">Montant</th>
                  <th className="px-md py-3 text-label-sm uppercase tracking-wider">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {ownerPayments.slice(0, 8).map(p => (
                  <tr key={p.id} className="hover:bg-surface-container-low transition-colors">
                    <td className="px-md py-3 text-body-sm text-on-surface">{p.propertyName}</td>
                    <td className="px-md py-3 text-body-sm text-on-surface">{p.tenantName}</td>
                    <td className="px-md py-3 text-body-sm text-on-surface-variant">{p.month}</td>
                    <td className={`px-md py-3 text-right font-label-md ${p.status === 'Payé' ? 'text-green-700' : 'text-error'}`}>
                      {p.amount.toLocaleString('fr-FR')} FCFA
                    </td>
                    <td className="px-md py-3">
                      <span className={`inline-flex items-center gap-1 px-xs py-0.5 rounded-full text-label-sm ${
                        p.status === 'Payé' ? 'bg-green-100 text-green-700' :
                        p.status === 'En retard' ? 'bg-amber-100 text-amber-700' : 'bg-error-container text-error'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Maintenance tickets */}
      {ownerTickets.length > 0 && (
        <div className="bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant/20 overflow-hidden">
          <div className="px-md py-md border-b border-outline-variant/20">
            <h3 className="font-h3 text-h3 text-on-surface flex items-center gap-2">
              <Icon name="engineering" className="text-primary" />
              Tickets Maintenance ({ownerTickets.filter(t => t.status !== 'Résolu').length} ouverts)
            </h3>
          </div>
          <div className="divide-y divide-outline-variant/20">
            {ownerTickets.map(t => (
              <div key={t.id} className="px-md py-sm flex items-center justify-between gap-md">
                <div className="flex items-center gap-sm">
                  <Badge label={t.priority} />
                  <div>
                    <p className="text-label-md font-label-md text-on-surface">{t.title}</p>
                    <p className="text-body-sm text-on-surface-variant">{t.property} — {t.unit}</p>
                  </div>
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
