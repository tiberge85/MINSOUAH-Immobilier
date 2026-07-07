const COND_ORDER  = ['HS', 'MAUVAIS', 'USAGE', 'BON', 'NEUF'];
const condScore   = (c) => COND_ORDER.indexOf(c ?? 'BON');
const deltaStyle  = (ec, xc) => { const se = condScore(ec), sx = condScore(xc); return sx < se ? '#fee2e2;color:#991b1b' : sx > se ? '#dcfce7;color:#14532d' : '#f5f5f5;color:#555'; };
const deltaLabel  = (ec, xc) => { const se = condScore(ec), sx = condScore(xc); return sx < se ? '⬇ Dégradé' : sx > se ? '⬆ Amélioré' : '✓ Stable'; };

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

    ${(insp.photos || []).length > 0 ? `
    <h2>Photos du constat</h2>
    <div style="display:flex;flex-wrap:wrap;gap:8px">
      ${(insp.photos || []).map(p => `<img src="${p.data}" style="width:160px;height:120px;object-fit:cover;border-radius:6px;border:1px solid #ddd">`).join('')}
    </div>` : ''}

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

/* ── Combined PDF: a summary of ALL inspections, one block per état des lieux ── */
export function generateAllSummariesHtml(inspections = [], orgSettings = {}) {
  const org = orgSettings || {};
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const blocks = inspections.map((insp, idx) => {
    const isEntry = insp.type === 'ENTRY';
    const dmgCost = (insp.damages || []).reduce((s, d) => s + (d.cost || 0), 0);
    const photos = (insp.photos || []).length + (insp.items || []).reduce((s, it) => s + (it.photos || []).length, 0);
    const signed = insp.managerSignature && insp.tenantSignature;
    return `
    <div class="edl ${idx > 0 ? 'brk' : ''}">
      <div class="edl-head">
        <div>
          <span class="tag ${isEntry ? 'in' : 'out'}">${isEntry ? '→ Entrée' : '← Sortie'}</span>
          <span class="tag st">${STATUS_LABEL[insp.status] || esc(insp.status)}</span>
          <div class="ref">${esc(insp.ref)}</div>
        </div>
        <div class="right">${signed ? '<span class="ok">✓ Signé</span>' : '<span class="no">Non signé</span>'}</div>
      </div>
      <table class="info">
        <tr><th>Propriété</th><td>${esc(insp.propertyName)}${insp.unitRef ? ` — ${esc(insp.unitRef)}` : ''}</td><th>Locataire</th><td>${esc(insp.tenantName) || '—'}</td></tr>
        <tr><th>Gestionnaire</th><td>${esc(insp.managerName) || '—'}</td><th>Date prévue</th><td>${insp.scheduledDate ? new Date(insp.scheduledDate).toLocaleDateString('fr-FR') : '—'}</td></tr>
        <tr><th>Date complétion</th><td>${insp.completedDate ? new Date(insp.completedDate).toLocaleDateString('fr-FR') : '—'}</td><th>Éléments / Dommages</th><td>${(insp.items || []).length} / ${(insp.damages || []).length}</td></tr>
        <tr><th>Coût dommages</th><td>${fmt(dmgCost)}</td><th>Photos</th><td>${photos}</td></tr>
      </table>
      ${insp.notes ? `<div class="obs"><b>Observations :</b> ${esc(insp.notes)}</div>` : ''}
      ${(insp.photos || []).length > 0 ? `
      <div class="ph">
        <b>Photos du constat (${(insp.photos || []).length}) :</b>
        <div class="ph-grid">${(insp.photos || []).map(p => `<img src="${p.data}" alt="photo" />`).join('')}</div>
      </div>` : ''}
    </div>`;
  }).join('');

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Résumés des états des lieux</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1c1b19; font-size: 12px; margin: 0; }
    .doc-head { border-bottom: 3px solid #6d3b07; padding-bottom: 10px; margin-bottom: 16px; }
    .doc-head h1 { font-size: 18px; color: #6d3b07; margin: 0; }
    .doc-head p { font-size: 11px; color: #6b7280; margin: 3px 0 0; }
    .edl { border: 1px solid #e3d9cc; border-radius: 8px; padding: 12px 14px; margin-bottom: 12px; }
    .edl.brk { page-break-inside: avoid; }
    .edl-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
    .tag { display:inline-block; font-size:10px; font-weight:700; padding:2px 8px; border-radius:999px; margin-right:4px; }
    .tag.in { background:#e0e7ff; color:#3730a3; } .tag.out { background:#fee2e2; color:#991b1b; } .tag.st { background:#f3f4f6; color:#374151; }
    .ref { font-size:15px; font-weight:900; margin-top:4px; }
    .right .ok { color:#166534; font-weight:700; } .right .no { color:#9a3412; font-weight:700; }
    table.info { width:100%; border-collapse:collapse; }
    table.info th, table.info td { border:1px solid #eee; padding:4px 8px; text-align:left; font-size:11px; }
    table.info th { background:#faf7f2; color:#6b7280; font-weight:600; width:16%; }
    .obs { margin-top:8px; font-size:11px; background:#fafafa; border:1px solid #eee; border-radius:6px; padding:8px 10px; }
    .ph { margin-top:8px; font-size:11px; }
    .ph-grid { display:flex; flex-wrap:wrap; gap:6px; margin-top:5px; }
    .ph-grid img { width:120px; height:90px; object-fit:cover; border-radius:6px; border:1px solid #ddd; }
    .footer { margin-top: 16px; font-size: 9px; color: #b0a090; text-align:center; }
  </style></head><body>
    <div class="doc-head">
      <h1>Résumés des états des lieux</h1>
      <p>${esc(org.companyName || 'Minsouah Immobilier')} — ${inspections.length} état(s) des lieux — Généré le ${today}</p>
    </div>
    ${blocks || '<p style="color:#999;font-style:italic">Aucun état des lieux.</p>'}
    <div class="footer">Document généré le ${today} — ${esc(org.companyName || 'Minsouah Immobilier')}</div>
    <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 300); };</script>
  </body></html>`;
}

export function openAllSummariesReport(inspections, orgSettings) {
  const html = generateAllSummariesHtml(inspections, orgSettings);
  const win = window.open('', '_blank', 'width=900,height=1000');
  if (win) { win.document.write(html); win.document.close(); }
}

export function generateSynthesisHTML(entry, exit) {
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const entryItems = entry.items || [];
  const exitItems  = exit.items  || [];

  const matched = entryItems.map(ei => ({
    ei,
    xi: exitItems.find(x => x.label.toLowerCase() === ei.label.toLowerCase() && x.category === ei.category) || null,
  }));
  const newInExit = exitItems.filter(xi =>
    !entryItems.some(ei => ei.label.toLowerCase() === xi.label.toLowerCase() && ei.category === xi.category)
  );

  const degradations = matched.filter(({ ei, xi }) => xi && condScore(xi.condition) < condScore(ei.condition)).length;
  const totalDamages  = (exit.damages || []).reduce((s, d) => s + (d.cost || 0), 0);

  const grouped = matched.reduce((acc, item) => {
    const k = item.ei.category;
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});

  const compHTML = Object.entries(grouped).map(([cat, items]) => `
    <h3 style="color:#555;font-size:1em;margin:18px 0 6px;border-bottom:1px solid #eee;padding-bottom:4px">${CAT_LABEL[cat] || cat}</h3>
    <table>
      <tr><th style="width:28%">Élément</th><th style="width:18%">Entrée</th><th style="width:18%">Sortie</th><th style="width:16%">Évolution</th><th>Observations</th></tr>
      ${items.map(({ ei, xi }) => `<tr>
        <td><strong>${ei.label}</strong></td>
        <td><span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:.8em;font-weight:bold;background:${COND_COLOR[ei.condition] || '#f5f5f5;color:#333'}">${COND_LABEL[ei.condition] || ei.condition}</span></td>
        <td>${xi ? `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:.8em;font-weight:bold;background:${COND_COLOR[xi.condition] || '#f5f5f5;color:#333'}">${COND_LABEL[xi.condition] || xi.condition}</span>` : '<span style="color:#bbb;font-style:italic">Non inspecté</span>'}</td>
        <td>${xi ? `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:.8em;font-weight:bold;background:${deltaStyle(ei.condition, xi.condition)}">${deltaLabel(ei.condition, xi.condition)}</span>` : '—'}</td>
        <td style="color:#666;font-size:.9em">${xi?.notes || ei.notes || '—'}</td>
      </tr>`).join('')}
    </table>`).join('');

  const newHTML = newInExit.length > 0 ? `
    <h2>Éléments nouveaux (sortie uniquement)</h2>
    <table>
      <tr><th>Élément</th><th>Catégorie</th><th>État</th><th>Observations</th></tr>
      ${newInExit.map(i => `<tr>
        <td><strong>${i.label}</strong></td>
        <td>${CAT_LABEL[i.category] || i.category}</td>
        <td><span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:.8em;font-weight:bold;background:${COND_COLOR[i.condition] || '#f5f5f5;color:#333'}">${COND_LABEL[i.condition] || i.condition}</span></td>
        <td style="color:#666;font-size:.9em">${i.notes || '—'}</td>
      </tr>`).join('')}
    </table>` : '';

  const dmgHTML = (exit.damages || []).length > 0 ? `
    <h2>Dommages constatés à la sortie</h2>
    <table>
      <tr><th>Élément</th><th>Description</th><th>Gravité</th><th>Coût estimé</th></tr>
      ${(exit.damages || []).map(d => `<tr>
        <td>${d.itemLabel || '—'}</td><td>${d.description}</td>
        <td><span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:.8em;font-weight:bold;background:${SEV_COLOR[d.severity] || '#f5f5f5;color:#333'}">${SEV_LABEL[d.severity] || d.severity}</span></td>
        <td style="font-weight:bold;color:${d.cost > 0 ? '#dc2626' : '#333'}">${d.cost > 0 ? fmt(d.cost) : '—'}</td>
      </tr>`).join('')}
      <tr style="background:#fef9ee;font-weight:bold"><td colspan="3">Total estimé</td><td style="color:#dc2626">${totalDamages > 0 ? fmt(totalDamages) : '—'}</td></tr>
    </table>` : '';

  const sigHTML = (sig, label, name) => `
    <div style="border:1px solid #ddd;border-radius:8px;padding:12px;flex:1">
      <p style="margin:0 0 6px;font-weight:bold;color:#333">${label}</p>
      <p style="margin:0 0 8px;color:#666;font-size:.9em">${name || '—'}</p>
      ${sig ? `<img src="${sig.data}" style="max-height:70px;border:1px solid #eee;border-radius:4px;display:block">
               <p style="margin:6px 0 0;font-size:.8em;color:#999">Signé le ${new Date(sig.signedAt).toLocaleDateString('fr-FR')}</p>`
             : '<p style="color:#bbb;font-style:italic">Non signé</p>'}
    </div>`;

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
  <title>Synthèse EDL — ${exit.tenantName || ''}</title>
  <style>
    body{font-family:Arial,sans-serif;padding:32px;max-width:920px;margin:auto;color:#222;font-size:14px}
    h1{color:#785a00;border-bottom:3px solid #785a00;padding-bottom:10px;margin-bottom:4px}
    h2{color:#444;font-size:1.05em;margin:22px 0 8px;text-transform:uppercase;letter-spacing:.05em;border-left:3px solid #785a00;padding-left:8px}
    h3{color:#555;font-size:1em;margin:18px 0 6px;border-bottom:1px solid #eee;padding-bottom:4px}
    table{width:100%;border-collapse:collapse;margin:8px 0}
    th{background:#f8f4ed;padding:7px 10px;text-align:left;font-size:.85em;border:1px solid #ddd;color:#555}
    td{padding:7px 10px;border:1px solid #ddd;vertical-align:top}
    tr:nth-child(even){background:#fafafa}
    .summary{display:flex;gap:14px;margin-bottom:20px;flex-wrap:wrap}
    .s-card{flex:1;min-width:130px;border:1px solid #e3d9cc;border-radius:10px;padding:12px;text-align:center}
    .s-card .lbl{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#817662;margin-bottom:4px}
    .s-card .val{font-size:22px;font-weight:900}
    .sig-row{display:flex;gap:16px;margin-top:8px}
    .footer{margin-top:36px;padding-top:12px;border-top:1px solid #eee;color:#999;font-size:.8em}
    @media print{body{padding:16px}}
  </style></head>
  <body>
    <h1>RAPPORT DE SYNTHÈSE — ÉTAT DES LIEUX</h1>
    <p style="color:#666;margin-bottom:16px">Comparaison entrée / sortie — Généré le ${today}</p>

    <h2>Informations</h2>
    <table>
      <tr><th style="width:22%">Locataire</th><td>${exit.tenantName || entry.tenantName || '—'}</td><th style="width:22%">Propriété</th><td>${exit.propertyName || entry.propertyName || '—'}${(exit.unitRef || entry.unitRef) ? ' — ' + (exit.unitRef || entry.unitRef) : ''}</td></tr>
      <tr><th>État d'entrée</th><td>${entry.ref} — ${entry.scheduledDate ? new Date(entry.scheduledDate).toLocaleDateString('fr-FR') : '—'}</td><th>État de sortie</th><td>${exit.ref} — ${exit.scheduledDate ? new Date(exit.scheduledDate).toLocaleDateString('fr-FR') : '—'}</td></tr>
    </table>

    <h2>Résumé</h2>
    <div class="summary">
      <div class="s-card"><div class="lbl">Éléments comparés</div><div class="val">${matched.length}</div></div>
      <div class="s-card"><div class="lbl">Dégradations</div><div class="val" style="color:${degradations > 0 ? '#dc2626' : '#14532d'}">${degradations}</div></div>
      <div class="s-card"><div class="lbl">Dommages</div><div class="val">${(exit.damages || []).length}</div></div>
      <div class="s-card"><div class="lbl">Coût total</div><div class="val" style="color:${totalDamages > 0 ? '#dc2626' : '#14532d'};font-size:${totalDamages > 0 ? '15' : '22'}px">${totalDamages > 0 ? fmt(totalDamages) : 'Aucun'}</div></div>
    </div>

    <h2>Comparaison des éléments inventoriés</h2>
    ${matched.length === 0 ? '<p style="color:#999;font-style:italic">Aucun élément à comparer</p>' : compHTML}

    ${newHTML}
    ${dmgHTML}

    <h2>Signatures — Entrée (${entry.ref})</h2>
    <div class="sig-row">
      ${sigHTML(entry.managerSignature, 'Gestionnaire', entry.managerName)}
      ${sigHTML(entry.tenantSignature, 'Locataire', entry.tenantName)}
    </div>
    <h2>Signatures — Sortie (${exit.ref})</h2>
    <div class="sig-row">
      ${sigHTML(exit.managerSignature, 'Gestionnaire', exit.managerName)}
      ${sigHTML(exit.tenantSignature, 'Locataire', exit.tenantName)}
    </div>

    <div class="footer">
      Document généré le ${today} — Minsouah Immobilier<br>
      Ce rapport compare l'EDL d'entrée (${entry.ref}) et de sortie (${exit.ref}).
    </div>
  </body></html>`;
}

export function openSynthesisReport(entry, exit) {
  const html = generateSynthesisHTML(entry, exit);
  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const w    = window.open(url, '_blank');
  if (w) { w.onload = () => { w.print(); URL.revokeObjectURL(url); }; }
}
