const COND_LABEL  = { NEUF: 'Neuf', BON: 'Bon', USAGE: 'Usé', MAUVAIS: 'Mauvais', HS: 'Hors service' };
const COND_COLOR  = { NEUF: '#d1fae5;color:#065f46', BON: '#dcfce7;color:#14532d', USAGE: '#fef3c7;color:#92400e', MAUVAIS: '#ffedd5;color:#9a3412', HS: '#fee2e2;color:#991b1b' };
const SEV_LABEL   = { MINOR: 'Mineur', MODERATE: 'Modéré', MAJOR: 'Majeur' };
const SEV_COLOR   = { MINOR: '#fef3c7;color:#92400e', MODERATE: '#ffedd5;color:#9a3412', MAJOR: '#fee2e2;color:#991b1b' };
const CAT_LABEL   = { ENTREE: 'Entrée / Hall', SALON: 'Salon / Séjour', CUISINE: 'Cuisine', CHAMBRE: 'Chambre(s)', BAIN: 'Salle de bain / WC', EXTERIEUR: 'Extérieur / Garage', AUTRE: 'Autre' };
const STATUS_LABEL = { DRAFT: 'Brouillon', IN_PROGRESS: 'En cours', PENDING_SIGNATURE: 'Att. signature', COMPLETED: 'Complété' };
const fmt = (n) => Number(n || 0).toLocaleString('fr-CI') + ' FCFA';

export function generateEDLHtml(insp) {
  const totalCost = (insp.damages || []).reduce((s, d) => s + (d.cost || 0), 0);
  const grouped   = (insp.items || []).reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  const inventaireHTML = Object.entries(grouped).map(([cat, items]) => `
    <h3 style="color:#555;font-size:1em;margin:20px 0 6px;border-bottom:1px solid #eee;padding-bottom:4px">${CAT_LABEL[cat] || cat}</h3>
    <table>
      <tr>
        <th style="width:35%">Élément</th>
        <th style="width:15%">État</th>
        <th style="width:15%">Valeur estimée</th>
        <th>Observations</th>
        <th style="width:15%">Photos</th>
      </tr>
      ${items.map(item => `
        <tr>
          <td><strong>${item.label}</strong></td>
          <td><span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:0.8em;font-weight:bold;background:${COND_COLOR[item.condition] || '#f5f5f5;color:#333'}">${COND_LABEL[item.condition] || item.condition}</span></td>
          <td style="font-weight:bold;color:#555">${item.price ? fmt(item.price) : '—'}</td>
          <td style="color:#666;font-size:0.9em">${item.notes || '—'}</td>
          <td>${(item.photos || []).length > 0
            ? `<div style="display:flex;flex-wrap:wrap;gap:4px">${(item.photos || []).map(p => `<img src="${p.data}" style="width:60px;height:48px;object-fit:cover;border-radius:4px;border:1px solid #ddd">`).join('')}</div>`
            : '<span style="color:#bbb;font-size:0.85em">—</span>'
          }</td>
        </tr>`).join('')}
    </table>`).join('');

  const totalInventaire = (insp.items || []).reduce((s, i) => s + (Number(i.price) || 0), 0);

  const damagesHTML = (insp.damages || []).length > 0 ? `
    <h2>Dommages constatés</h2>
    <table>
      <tr><th>Élément concerné</th><th>Description</th><th>Gravité</th><th>Coût estimé</th></tr>
      ${(insp.damages || []).map(d => `
        <tr>
          <td>${d.itemLabel || '—'}</td>
          <td>${d.description}</td>
          <td><span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:0.8em;font-weight:bold;background:${SEV_COLOR[d.severity] || '#f5f5f5;color:#333'}">${SEV_LABEL[d.severity] || d.severity}</span></td>
          <td style="font-weight:bold;color:${d.cost > 0 ? '#dc2626' : '#333'}">${d.cost > 0 ? fmt(d.cost) : '—'}</td>
        </tr>`).join('')}
      <tr style="background:#fef9ee;font-weight:bold">
        <td colspan="3">Total estimé des dommages</td>
        <td style="color:#dc2626">${totalCost > 0 ? fmt(totalCost) : '—'}</td>
      </tr>
    </table>` : '';

  const sigHTML = (sig, label, name) => `
    <div style="border:1px solid #ddd;border-radius:8px;padding:12px;flex:1">
      <p style="margin:0 0 6px;font-weight:bold;color:#333">${label}</p>
      <p style="margin:0 0 8px;color:#666;font-size:0.9em">${name || '—'}</p>
      ${sig
        ? `<img src="${sig.data}" style="max-height:70px;border:1px solid #eee;border-radius:4px;display:block">
           <p style="margin:6px 0 0;font-size:0.8em;color:#999">Signé le ${new Date(sig.signedAt).toLocaleDateString('fr-FR')}</p>`
        : '<p style="color:#bbb;font-style:italic">Non signé</p>'}
    </div>`;

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
  <title>État des lieux ${insp.ref}</title>
  <style>
    body{font-family:Arial,sans-serif;padding:32px;max-width:820px;margin:auto;color:#222;font-size:14px}
    h1{color:#785a00;border-bottom:3px solid #785a00;padding-bottom:10px;margin-bottom:4px}
    h2{color:#444;font-size:1.05em;margin:24px 0 8px;text-transform:uppercase;letter-spacing:.05em;border-left:3px solid #785a00;padding-left:8px}
    table{width:100%;border-collapse:collapse;margin:8px 0}
    th{background:#f8f4ed;padding:7px 10px;text-align:left;font-size:0.85em;border:1px solid #ddd;color:#555}
    td{padding:7px 10px;border:1px solid #ddd;vertical-align:top}
    tr:nth-child(even){background:#fafafa}
    .header-badges{display:flex;gap:8px;margin:8px 0 16px;flex-wrap:wrap}
    .badge{display:inline-block;padding:3px 10px;border-radius:12px;font-size:0.8em;font-weight:bold}
    .sig-row{display:flex;gap:16px;margin-top:8px}
    .footer{margin-top:40px;padding-top:12px;border-top:1px solid #eee;color:#999;font-size:0.8em}
    @media print{body{padding:16px}button{display:none}}
  </style></head>
  <body>
    <h1>ÉTAT DES LIEUX ${insp.type === 'ENTRY' ? "D'ENTRÉE" : 'DE SORTIE'}</h1>
    <div class="header-badges">
      <span class="badge" style="background:${insp.type === 'ENTRY' ? '#f0fdf4;color:#15803d' : '#fef2f2;color:#dc2626'}">${insp.type === 'ENTRY' ? '→ Entrée' : '← Sortie'}</span>
      <span class="badge" style="background:#f5f5f5;color:#333">Réf : ${insp.ref}</span>
      <span class="badge" style="background:${insp.status === 'COMPLETED' ? '#dcfce7;color:#14532d' : '#fef3c7;color:#92400e'}">${STATUS_LABEL[insp.status] || insp.status}</span>
    </div>

    <h2>Informations générales</h2>
    <table>
      <tr><th style="width:30%">Propriété</th><td>${insp.propertyName || '—'}${insp.unitRef ? ' — ' + insp.unitRef : ''}</td><th style="width:20%">Locataire</th><td>${insp.tenantName || '—'}</td></tr>
      <tr><th>Gestionnaire</th><td>${insp.managerName || '—'}</td><th>Date prévue</th><td>${insp.scheduledDate ? new Date(insp.scheduledDate).toLocaleDateString('fr-FR') : '—'}</td></tr>
      ${insp.completedDate
        ? `<tr><th>Date de complétion</th><td>${insp.completedDate}</td><th>Éléments inspectés</th><td>${(insp.items || []).length}</td></tr>`
        : `<tr><th>Éléments inspectés</th><td>${(insp.items || []).length}</td><th>Dommages signalés</th><td>${(insp.damages || []).length}</td></tr>`}
    </table>

    <h2>Inventaire des éléments${totalInventaire > 0 ? ` — Valeur totale : ${fmt(totalInventaire)}` : ''}</h2>
    ${(insp.items || []).length === 0 ? '<p style="color:#999;font-style:italic">Aucun élément inventorié</p>' : inventaireHTML}

    ${damagesHTML}

    <h2>Signatures</h2>
    <div class="sig-row">
      ${sigHTML(insp.managerSignature, 'Signature du gestionnaire', insp.managerName)}
      ${sigHTML(insp.tenantSignature, 'Signature du locataire', insp.tenantName)}
    </div>

    ${insp.notes ? `<h2>Observations générales</h2><p style="background:#fafafa;border:1px solid #eee;padding:12px;border-radius:6px">${insp.notes}</p>` : ''}

    <div class="footer">
      Document généré le ${new Date().toLocaleDateString('fr-FR')} — Minsouah Immobilier<br>
      Ce document est un état des lieux officiel. Toute modification doit être validée par les deux parties.
    </div>
  </body></html>`;
}

export function openEDLReport(insp) {
  const html  = generateEDLHtml(insp);
  const blob  = new Blob([html], { type: 'text/html' });
  const url   = URL.createObjectURL(blob);
  const w     = window.open(url, '_blank');
  if (w) { w.onload = () => { w.print(); URL.revokeObjectURL(url); }; }
}
