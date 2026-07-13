import { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { QRCodeSVG } from 'qrcode.react';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';
import SignaturePad from '../components/SignaturePad';
import SearchSelect from '../components/SearchSelect';
import TenantDocuments from '../components/TenantDocuments';
import { openContractReport } from '../lib/contractReport';
import { can } from '../lib/permissions';

const TABS = ['Contrats', 'Locataires', 'Propriétaires'];
const CONTRACT_STATUSES = ['Tous', 'Actif', 'Expirant', 'Brouillon', 'Résilié'];
const COLORS = ['bg-primary-container text-on-primary-container', 'bg-secondary-container text-on-secondary-container', 'bg-tertiary-container text-on-tertiary-container', 'bg-error-container text-on-error-container'];
const fmt = (n) => Number(n || 0).toLocaleString('fr-CI') + ' FCFA';

const STATUS_BADGE = {
  Actif:    'bg-green-100 text-green-800',
  Expirant: 'bg-amber-100 text-amber-800',
  Brouillon:'bg-surface-container text-on-surface-variant',
  Résilié:  'bg-error-container text-on-error-container',
  'En cours':'bg-amber-100 text-amber-800',
  Inactif:  'bg-surface-container text-on-surface-variant',
};

export default function Rental() {
  const { state, dispatch } = useApp();
  const canCreate = can(state.currentUser, 'rental', 'create');
  const canEdit   = can(state.currentUser, 'rental', 'edit');
  const canDelete = can(state.currentUser, 'rental', 'delete');
  const { contracts = [], tenants = [], owners = [], properties = [] } = state;

  const [tab, setTab] = useState('Contrats');
  const [cFilter, setCFilter] = useState('Tous');
  const [tFilter, setTFilter] = useState('Tous');
  const [tSort, setTSort] = useState(false);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [target, setTarget] = useState(null);
  const [step, setStep] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // ── QR Portail ────────────────────────────────────────────────────────────
  const [qrTenant, setQrTenant] = useState(null);
  const [portalToken, setPortalToken] = useState(null);
  const [qrGenerating, setQrGenerating] = useState(false);
  const [docsTenant, setDocsTenant] = useState(null); // locataire dont on gère les documents

  // Nombre de documents par locataire (pour le badge sur la fiche)
  const docCountByTenant = useMemo(() => {
    const m = {};
    (state.tenantDocuments || []).forEach(d => { m[String(d.tenantId)] = (m[String(d.tenantId)] || 0) + 1; });
    return m;
  }, [state.tenantDocuments]);

  // ── Import locataires ──────────────────────────────────────────────────────
  const [importRows, setImportRows] = useState([]);
  const [importResult, setImportResult] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const fileInputRef = useRef(null);

  // ── Formulaires ────────────────────────────────────────────────────────────
  const [cForm, setCForm] = useState({});
  const [tForm, setTForm] = useState({});
  const [oForm, setOForm] = useState({});
  const [createAccountPrompt, setCreateAccountPrompt] = useState(null);
  const [savingTenant, setSavingTenant] = useState(false);
  const sigBailleurRef = useRef(null);
  const sigPreneurRef  = useRef(null);

  // Sélection du bien + unité dans le formulaire locataire
  const [selectedPropId, setSelectedPropId] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');

  // Toutes les options de propriétés pour les dropdowns
  const allPropertyOptions = useMemo(() => {
    const opts = [];
    properties.forEach(p => {
      if (p.isBuilding) {
        (p.units || []).forEach(u => {
          opts.push({ label: `${p.name} — ${u.number} (${u.floor})`, value: `${p.id}::${u.id}`, rent: u.rent, buildingName: p.name, unitNumber: u.number, buildingId: p.id, unitId: u.id });
        });
      } else {
        opts.push({ label: p.name, value: `${p.id}::`, rent: p.rent, buildingName: p.name, unitNumber: '', buildingId: p.id, unitId: '' });
      }
    });
    return opts;
  }, [properties]);

  // Noms normalisés des biens déjà loués (contrat Actif ou Expirant)
  // — compare par nom complet (inclut le numéro d'unité) pour ne pas bloquer
  //   les autres unités du même immeuble
  const normN = s => (s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const rentedNames = useMemo(() => new Set(
    contracts
      .filter(c => c.status === 'Actif' || c.status === 'Expirant')
      .map(c => normN(c.propertyName || ''))
      .filter(Boolean)
  ), [contracts]);

  // Pour les nouveaux contrats : tous les biens, occupés marqués par unité
  const availablePropertyOptions = useMemo(() =>
    allPropertyOptions.map(o => ({
      ...o,
      displayLabel: (!target && rentedNames.has(normN(o.label)))
        ? `${o.label} — (Occupé)`
        : o.label,
    })),
  [allPropertyOptions, rentedNames, target]);

  // ── Données filtrées ───────────────────────────────────────────────────────
  const q = search.toLowerCase();
  const filteredContracts = contracts.filter(c =>
    (cFilter === 'Tous' || c.status === cFilter) &&
    (c.tenant.toLowerCase().includes(q) || c.propertyName.toLowerCase().includes(q))
  );
  const normQ = normN(q);
  const tenantsWithContract = useMemo(() => new Set(contracts.filter(c => c.status === 'Actif' || c.status === 'Expirant').map(c => normN(c.tenant))), [contracts]);
  const filteredTenants = tenants.filter(t => {
    if (tFilter === 'Avec contrat' && !tenantsWithContract.has(normN(t.name))) return false;
    if (tFilter === 'Sans contrat' && tenantsWithContract.has(normN(t.name))) return false;
    return !normQ || normN(t.name).includes(normQ) || normN(t.property || '').includes(normQ) || (t.phone || '').replace(/\s+/g, '').includes(q.replace(/\s+/g, '')) || normN(t.email || '').includes(normQ);
  }).sort((a, b) => tSort ? normN(a.name).localeCompare(normN(b.name)) : 0);
  const filteredOwners = owners.filter(o => o.name.toLowerCase().includes(q));

  // ── Ouvrir les modales ─────────────────────────────────────────────────────
  const openAddContract = () => {
    setCForm({ propertyName: '', tenant: '', rent: '', endDate: '', status: 'Brouillon', propertyType: 'Résidentiel', propertyIcon: 'apartment', sigBailleur: null, sigPreneur: null });
    setModal('contract'); setTarget(null); setStep(1);
    setTimeout(() => { sigBailleurRef.current?.clear(); sigPreneurRef.current?.clear(); }, 50);
  };
  const openEditContract = (c) => { setCForm({ ...c, rent: String(c.rent) }); setModal('contract'); setTarget(c); setStep(1); };

  const openAddTenant = () => {
    setTForm({ name: '', email: '', phone: '', emergencyName: '', emergencyPhone: '', property: '', since: '', status: 'Actif', color: COLORS[0] });
    setSelectedPropId(''); setSelectedUnitId('');
    setModal('tenant'); setTarget(null); setStep(1);
  };
  const openEditTenant = (t) => {
    setTForm(t);
    // Retrouver la sélection
    const opt = allPropertyOptions.find(o => o.label === t.property || o.buildingName === t.property);
    setSelectedPropId(opt ? opt.value : '');
    setSelectedUnitId('');
    setModal('tenant'); setTarget(t); setStep(1);
  };

  const openAddOwner = () => {
    setOForm({ name: '', initials: '', email: '', phone: '', bank: '', iban: '', status: 'Actif', properties: 0, revenue: 0, color: COLORS[0], propertyIds: [] });
    setModal('owner'); setTarget(null);
  };
  const openEditOwner = (o) => { setOForm({ propertyIds: [], ...o }); setModal('owner'); setTarget(o); };

  // ── Sauvegardes ────────────────────────────────────────────────────────────
  const saveContract = () => {
    const prop = properties.find(p => p.id === cForm.propertyId) ||
                 properties.find(p => p.name?.trim().toLowerCase() === cForm.propertyName?.trim().toLowerCase());
    const sigB = sigBailleurRef.current?.getDataURL() || cForm.sigBailleur || null;
    const sigP = sigPreneurRef.current?.getDataURL()  || cForm.sigPreneur  || null;
    const payload = {
      ...cForm,
      rent:        Number(cForm.rent) || 0,
      propertyId:  prop?.id           || cForm.propertyId || null,
      ownerName:   prop?.owner        || cForm.ownerName  || null,
      ownerId:     prop?.ownerId      || cForm.ownerId    || null,
      sigBailleur: sigB,
      sigPreneur:  sigP,
      signedAt:    (sigB || sigP) ? new Date().toISOString() : (cForm.signedAt || null),
    };
    const isActC = c => c.status === 'Actif' || c.status === 'Expirant';
    if (!target) {
      // Compare by full property name (includes unit number) — avoids false positives
      // when multiple units belong to the same building
      const normPayload = normN(payload.propertyName || '');
      const conflict = normPayload
        ? contracts.find(c => isActC(c) && normN(c.propertyName || '') === normPayload)
        : null;
      if (conflict) {
        const ok = window.confirm(
          `Ce bien est déjà loué par ${conflict.tenant} (contrat ${conflict.status}).\n\nVoulez-vous quand même créer un nouveau contrat ?`
        );
        if (!ok) return;
      }
    }
    if (target) dispatch({ type: 'UPDATE_CONTRACT', payload: { ...payload, id: target.id } });
    else dispatch({ type: 'ADD_CONTRACT', payload });
    setModal(null);
  };

  const offerCreateAccount = (name, email, role, personId = null) => {
    if (!email || !email.trim()) return;
    const emailLow = email.trim().toLowerCase();
    const alreadyExists = (state.users || []).some(u => u.email.toLowerCase() === emailLow);
    if (alreadyExists) return;
    const tmpPw = 'Bienv' + Math.random().toString(36).slice(2, 7);
    setCreateAccountPrompt({ name, email: emailLow, role, tmpPw, personId });
  };

  const confirmCreateAccount = () => {
    if (!createAccountPrompt) return;
    const { name, email, role, tmpPw, personId } = createAccountPrompt;
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const colorMap = { TENANT: 'bg-secondary-container text-on-secondary-container', OWNER: 'bg-tertiary-container text-on-tertiary-container' };
    dispatch({ type: 'ADD_USER', payload: { name, email, password: tmpPw, role, initials, color: colorMap[role] || 'bg-primary-container text-on-primary-container', firstLogin: true, personId: personId ?? null } });
    alert(`Compte créé pour ${name}\n\nEmail : ${email}\nMot de passe temporaire : ${tmpPw}\n\nCommuniquez ces identifiants à l'utilisateur.`);
    setCreateAccountPrompt(null);
  };

  const saveTenant = async () => {
    const initials = tForm.initials || tForm.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const opt = allPropertyOptions.find(o => o.value === selectedPropId);
    const propertyLabel = opt ? opt.label : (tForm.property || '');
    const payload = { ...tForm, initials, property: propertyLabel, color: tForm.color || COLORS[0] };
    setSavingTenant(true);
    try {
      if (target) {
        await dispatch({ type: 'UPDATE_TENANT', payload: { ...payload, id: target.id } });
      } else {
        await dispatch({ type: 'ADD_TENANT', payload });
        if (tForm.email) offerCreateAccount(tForm.name, tForm.email, 'TENANT');
      }
      setModal(null);
      setTab('Locataires');
      setSearch('');
    } catch (err) {
      alert(`Erreur lors de l'enregistrement : ${err?.message || err?.code || 'Erreur inconnue'}`);
    } finally {
      setSavingTenant(false);
    }
  };

  const exportTenantsPDF = () => {
    const fmtDate = (d) => {
      if (!d) return '—';
      const dt = new Date(d);
      if (isNaN(dt)) return String(d);
      return dt.toLocaleDateString('fr-CI');
    };
    const fmtAmt = (n) => n ? Number(n).toLocaleString('fr-CI') + ' FCFA' : '—';
    const org = state.orgSettings || {};

    // Group tenants by building name
    const getBldName = (t) => {
      const opt = allPropertyOptions.find(o => o.label === t.property);
      return opt ? opt.buildingName : (t.property || 'Non attribué');
    };
    const grouped = {};
    filteredTenants.forEach(t => {
      const bld = getBldName(t);
      if (!grouped[bld]) grouped[bld] = [];
      grouped[bld].push(t);
    });

    const logoHtml = org.logo
      ? `<img src="${org.logo}" style="height:56px;object-fit:contain;margin-right:14px;border-radius:8px" />`
      : `<div style="width:56px;height:56px;background:#785a00;border-radius:8px;display:flex;align-items:center;justify-content:center;margin-right:14px;color:#fff;font-weight:bold;font-size:18px;flex-shrink:0">M</div>`;

    const statusStyle = (s) => s === 'Actif' ? 'color:#166534;background:#dcfce7' : s === 'En cours' ? 'color:#92400e;background:#fef3c7' : 'color:#374151;background:#f3f4f6';

    const sectionsHtml = Object.entries(grouped).map(([building, list]) => {
      const rows = list.map(t => {
        const contract = contracts.find(c => normN(c.tenant) === normN(t.name));
        const rent = contract?.rent || allPropertyOptions.find(o => o.label === t.property)?.rent;
        const endDate = contract?.endDate ? fmtDate(contract.endDate) : 'Indéterminée';
        return `<tr>
          <td><strong>${t.name || ''}</strong></td>
          <td>${t.email ? t.email + '<br>' : ''}${t.phone || '—'}</td>
          <td class="urg">${t.emergencyName || ''}${t.emergencyPhone ? (t.emergencyName ? '<br>' : '') + t.emergencyPhone : (t.emergencyName ? '' : '—')}</td>
          <td>${t.property || '—'}</td>
          <td>${fmtDate(t.since)}</td>
          <td><strong>${fmtDate(t.paymentStartDate)}</strong></td>
          <td style="font-weight:bold;color:#166534">${fmtAmt(rent)}</td>
          <td>${endDate}</td>
          <td><span class="badge" style="${statusStyle(t.status)}">${t.status || ''}</span></td>
        </tr>`;
      }).join('');
      return `<div class="section">
        <div class="sec-hdr">&#127968; ${building}<span>${list.length} locataire${list.length > 1 ? 's' : ''}</span></div>
        <table><thead><tr>
          <th>Locataire</th><th>Contact</th><th>Urgence</th><th>Logement</th>
          <th>Date entrée</th><th>1er loyer</th><th>Loyer/mois</th><th>Fin de bail</th><th>Statut</th>
        </tr></thead><tbody>${rows}</tbody></table>
      </div>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8">
<title>Locataires — ${org.companyName || 'Minsouah'}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;padding:18px 16px;font-size:11px;color:#111}
  .hdr{border-bottom:3px solid #785a00;padding-bottom:12px;margin-bottom:18px;display:flex;align-items:center}
  .hdr-txt h1{font-size:18px;color:#785a00;font-weight:bold}
  .hdr-txt p{font-size:10.5px;color:#888;margin-top:2px}
  .section{margin-bottom:22px;page-break-inside:avoid}
  .sec-hdr{font-size:12.5px;font-weight:bold;color:#785a00;background:#fef9f0;border-left:4px solid #785a00;padding:6px 12px;margin-bottom:7px;border-radius:0 6px 6px 0}
  .sec-hdr span{font-weight:normal;font-size:10px;color:#aaa;margin-left:10px}
  table{width:100%;border-collapse:collapse;font-size:10px}
  th{background:#785a00;color:#fff;padding:6px 7px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.4px}
  td{padding:5px 7px;border-bottom:1px solid #e5e7eb;vertical-align:top}
  tr:nth-child(even) td{background:#fafaf8}
  .badge{display:inline-block;padding:2px 6px;border-radius:20px;font-size:9px;font-weight:bold}
  .urg{color:#dc2626}
  @media print{body{padding:0}@page{margin:8mm 6mm;size:A4 landscape}}
</style></head><body>
<div class="hdr">${logoHtml}
  <div class="hdr-txt">
    <h1>${org.companyName || 'Minsouah Immobilier'}</h1>
    <p>Liste des locataires — Exporté le ${new Date().toLocaleDateString('fr-CI')} — ${filteredTenants.length} locataire(s)</p>
    ${org.address ? `<p>${org.address}${org.phone ? ' &nbsp;|&nbsp; ' + org.phone : ''}</p>` : ''}
  </div>
</div>
${sectionsHtml}
</body></html>`;

    const win = window.open('', '_blank');
    if (!win) { alert("Autorisez les popups pour exporter en PDF."); return; }
    win.document.write(html);
    win.document.close();
    win.onload = () => { win.focus(); win.print(); };
  };

  const exportTenants = () => {
    const fmtDate = (d) => {
      if (!d) return '';
      const dt = new Date(d);
      if (isNaN(dt)) return d;
      return dt.toLocaleDateString('fr-CI');
    };
    const rows = filteredTenants.map(t => {
      const contract = contracts.find(c => normN(c.tenant) === normN(t.name));
      const rent = contract?.rent || allPropertyOptions.find(o => o.label === t.property)?.rent;
      return {
        'Nom': t.name || '',
        'Email': t.email || '',
        'Téléphone': t.phone || '',
        'Contact urgence — Nom': t.emergencyName || '',
        'Contact urgence — Tél.': t.emergencyPhone || '',
        'Bien / Logement': t.property || '',
        "Date d'entrée": fmtDate(t.since),
        '1er paiement loyer': fmtDate(t.paymentStartDate),
        'Loyer/mois (FCFA)': rent ? Number(rent) : '',
        'Fin de bail': contract?.endDate ? fmtDate(contract.endDate) : 'Indéterminée',
        'Statut': t.status || '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [24, 28, 20, 26, 22, 36, 16, 22, 16, 18, 10].map(wch => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Locataires');
    XLSX.writeFile(wb, `locataires_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const saveOwner = () => {
    const initials = oForm.initials || oForm.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const ids = oForm.propertyIds || [];
    const revenue = properties
      .filter(p => ids.includes(p.id))
      .reduce((s, p) => {
        if (p.isBuilding) return s + (p.units || []).filter(u => u.status === 'Loué').reduce((a, u) => a + u.rent, 0);
        return s + (p.rent || 0);
      }, 0);
    const payload = { ...oForm, initials, propertyIds: ids, properties: ids.length, revenue };
    if (target) {
      dispatch({ type: 'UPDATE_OWNER', payload: { ...payload, id: target.id } });
      ids.forEach(pid => { const prop = properties.find(p => p.id === pid); if (prop) dispatch({ type: 'UPDATE_PROPERTY', payload: { ...prop, owner: oForm.name, ownerInitials: initials, ownerId: target.id } }); });
      if (oForm.email) offerCreateAccount(oForm.name, oForm.email, 'OWNER', target.id);
    } else {
      const newOwnerId = Date.now();
      dispatch({ type: 'ADD_OWNER', payload: { ...payload, id: newOwnerId } });
      ids.forEach(pid => { const prop = properties.find(p => p.id === pid); if (prop) dispatch({ type: 'UPDATE_PROPERTY', payload: { ...prop, owner: oForm.name, ownerInitials: initials, ownerId: newOwnerId } }); });
      if (oForm.email) offerCreateAccount(oForm.name, oForm.email, 'OWNER', newOwnerId);
    }
    setModal(null);
  };

  // ── Quand propriété sélectionnée → pré-remplir loyer + locataire dans contrat ──
  const onContractPropChange = (e) => {
    const opt = availablePropertyOptions.find(o => String(o.value) === String(e.target.value));
    if (opt) {
      // First try direct property field match, then fall back to active contract lookup
      let linkedTenant = tenants.find(t => normN(t.property) === normN(opt.label));
      if (!linkedTenant) {
        const activeContract = contracts.find(c =>
          (c.status === 'Actif' || c.status === 'Expirant') &&
          (normN(c.propertyName || '') === normN(opt.label) ||
           normN(c.propertyName || '') === normN(opt.buildingName || '') ||
           String(c.propertyId) === String(opt.buildingId))
        );
        if (activeContract) {
          linkedTenant = tenants.find(t =>
            normN(t.name) === normN(activeContract.tenant || '') ||
            (activeContract.tenantId && String(t.id) === String(activeContract.tenantId))
          );
        }
      }
      setCForm(f => ({
        ...f,
        propertyId: opt.buildingId,
        propertyName: opt.label,
        rent: String(opt.rent),
        ...(linkedTenant ? { tenant: linkedTenant.name } : {}),
      }));
    }
  };

  // ── Quand propriété sélectionnée → auto loyer dans tenant form ────────────
  const onTenantPropChange = (e) => {
    setSelectedPropId(e.target.value);
    setSelectedUnitId('');
  };

  const confirmDelete = () => {
    const { type, data } = deleteTarget;
    dispatch({ type: `DELETE_${type.toUpperCase()}`, payload: data.id });
    setDeleteTarget(null);
  };

  // ── Import locataires ──────────────────────────────────────────────────────
  const COL_MAP = {
    // Format générique
    'nom complet': 'name', nom: 'name', name: 'name', locataire: 'name',
    email: 'email', courriel: 'email', 'adresse email': 'email',
    telephone: 'phone', tel: 'phone', phone: 'phone', mobile: 'phone', 'n° tel': 'phone',
    bien: 'property', immeuble: 'property', logement: 'property',
    'bien / logement': 'property', property: 'property', appartement: 'property',
    'depuis (date)': 'since', depuis: 'since', since: 'since',
    "date d'entree": 'since', 'date entree': 'since',
    statut: 'status', status: 'status',
    // Format "OCCUPATION DES APPARTEMENTS" (multi-feuilles)
    occupant: 'name',
    contact: 'phone',
    'numero ': 'unit', numero: 'unit', 'numéro ': 'unit', numéro: 'unit',
    'niveau ': 'floor', niveau: 'floor',
    loyer: 'rent',
  };

  const normalize = (s) =>
    String(s || '').toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    // Feuille 1 : format immeuble (comme OCCUPATION DES APPARTEMENTS)
    const ws1 = XLSX.utils.aoa_to_sheet([
      ['IMMEUBLE A'],
      ['Niveau ', 'Numéro ', 'Occupant', 'Contact', '', '', 'Loyer', 'Date ', ''],
      ['RDC', 'S1', 'Kouamé Konan', '07 12 34 56 78', '', '', '130,000 FCFA', '', ''],
      ['', 'S2', 'Ama Yao Adjoua', '05 98 76 54 32', '', '', '130,000 FCFA', '', ''],
      ['1er', 'S3', 'LIBRE', '', '', '', '130,000 FCFA', '', ''],
      ['', 'S4', 'Diomandé Moussa', '07 00 11 22 33', '', '', '130,000 FCFA', '', ''],
    ]);
    ws1['!cols'] = [{ wch: 8 }, { wch: 10 }, { wch: 28 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'IMMEUBLE A');
    // Feuille 2 : format standard (alternative)
    const ws2 = XLSX.utils.aoa_to_sheet([
      ['Nom complet', 'Email', 'Téléphone', 'Bien / Logement', 'Depuis (date)', 'Statut'],
      ['Kouamé Konan', 'kouame@email.com', '+225 07 12 34 56 78', 'Résidence A - Apt S1', '01/01/2024', 'Actif'],
      ['Ama Yao', '', '+225 05 98 76 54 32', 'Résidence B - Apt S2', '15/06/2023', 'Actif'],
    ]);
    ws2['!cols'] = [{ wch: 24 }, { wch: 28 }, { wch: 22 }, { wch: 34 }, { wch: 16 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Format standard');
    XLSX.writeFile(wb, 'modele_locataires.xlsx');
  };

  const parseImportFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const allMapped = [];

        for (const sheetName of wb.SheetNames) {
          const ws = wb.Sheets[sheetName];
          // sheet_to_json avec header:1 pour lire toutes les lignes brutes
          const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

          // Trouver la ligne d'en-tête (première ligne avec "Occupant" ou "Nom" ou "Contact")
          let headerRowIdx = -1;
          for (let i = 0; i < Math.min(rawRows.length, 5); i++) {
            const row = rawRows[i];
            const norm = row.map(c => normalize(c));
            if (norm.includes('occupant') || norm.includes('nom complet') || norm.includes('nom') || norm.includes('contact')) {
              headerRowIdx = i;
              break;
            }
          }

          if (headerRowIdx === -1) continue; // feuille sans en-tête reconnu

          const headers = rawRows[headerRowIdx].map(h => normalize(h));
          const dataRows = rawRows.slice(headerRowIdx + 1);

          for (const rawRow of dataRows) {
            const row = {};
            headers.forEach((h, i) => {
              const field = COL_MAP[h];
              if (field) row[field] = String(rawRow[i] ?? '').trim();
            });

            // Ignorer les lignes vides ou "LIBRE"
            const occupantName = row.name || '';
            if (!occupantName || occupantName.toUpperCase() === 'LIBRE') continue;

            // Construire le label du bien à partir du nom de feuille + numéro d'unité
            if (!row.property) {
              const unit = row.unit ? ` — Apt. ${row.unit}` : '';
              row.property = `${sheetName}${unit}`;
            }

            // Nettoyer le téléphone (peut être un nombre Excel)
            if (row.phone) row.phone = String(row.phone).replace(/\.0$/, '');

            allMapped.push(row);
          }
        }

        if (allMapped.length === 0) {
          alert("Aucun locataire trouvé dans le fichier.\nVérifiez que le fichier contient une colonne « Occupant », « Nom complet » ou « Nom ».");
          return;
        }
        setImportRows(allMapped);
        setImportResult(null);
        setModal('import');
      } catch (err) {
        alert("Impossible de lire le fichier. Utilisez un fichier Excel (.xlsx) ou CSV.\n" + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const runImport = async () => {
    setImportLoading(true);
    const ok = [];
    const errors = [];

    for (let i = 0; i < importRows.length; i++) {
      const row = importRows[i];
      try {
        const initials = row.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        await dispatch({
          type: 'ADD_TENANT',
          payload: {
            name: row.name,
            email: row.email || '',
            phone: row.phone || '',
            property: row.property || '',
            since: row.since || '',
            status: row.status || 'Actif',
            initials,
            color: COLORS[i % COLORS.length],
          },
        });
        ok.push(row.name);
      } catch (err) {
        errors.push({ name: row.name, reason: err.message || 'Erreur inconnue' });
      }
    }

    setImportResult({ ok, errors });
    setImportLoading(false);
  };

  // ── Rendu ──────────────────────────────────────────────────────────────────
  return (
    <div className="px-4 md:px-6 pt-6 pb-20 max-w-7xl mx-auto">

      {/* Create account prompt */}
      {createAccountPrompt && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="w-12 h-12 bg-primary-container rounded-xl flex items-center justify-center mb-4">
              <Icon name="person_add" size={24} className="text-on-primary-container" />
            </div>
            <h3 className="font-bold text-on-surface text-lg mb-2">Créer un accès ?</h3>
            <p className="text-sm text-on-surface-variant mb-4">
              Voulez-vous créer un compte d'accès pour <strong className="text-on-surface">{createAccountPrompt.name}</strong> ?
              <br /><span className="text-xs mt-1 block">Email : {createAccountPrompt.email}</span>
            </p>
            <div className="p-3 bg-surface-container rounded-xl mb-4 text-xs text-on-surface-variant">
              <p>Mot de passe temporaire : <span className="font-mono font-bold text-on-surface">{createAccountPrompt.tmpPw}</span></p>
              <p className="mt-1">L'utilisateur devra le changer à sa première connexion.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setCreateAccountPrompt(null)} className="flex-1 py-2.5 text-sm font-semibold text-on-surface-variant bg-surface-container rounded-xl hover:bg-surface-container-high transition-colors">Non merci</button>
              <button onClick={confirmCreateAccount} className="flex-1 py-2.5 text-sm font-bold text-on-primary bg-primary rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2">
                <Icon name="person_add" size={16} />Créer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Onglets */}
      <div className="flex items-end gap-2 mb-6">
        <div className="flex items-center gap-1 border-b border-outline-variant/30 overflow-x-auto no-scrollbar flex-1 min-w-0">
          {TABS.map(t => {
            const count = t === 'Contrats' ? contracts.length : t === 'Locataires' ? tenants.length : owners.length;
            return (
              <button key={t} onClick={() => { setTab(t); setSearch(''); setCFilter('Tous'); }}
                className={`py-3 px-5 text-sm font-semibold whitespace-nowrap transition-all border-b-2 flex items-center gap-2 ${tab === t ? 'text-primary border-primary' : 'text-on-surface-variant border-transparent hover:text-on-surface'}`}>
                {t}
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${tab === t ? 'bg-primary/15 text-primary' : 'bg-surface-container text-on-surface-variant'}`}>{count}</span>
              </button>
            );
          })}
        </div>
        <div className="pb-1 flex-shrink-0 flex gap-2">
          {tab === 'Contrats' && canCreate && <Btn icon="note_add" onClick={openAddContract}>Nouveau Contrat</Btn>}
          {tab === 'Locataires' && (
            <>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) parseImportFile(f); e.target.value = ''; }} />
              {canCreate && <BtnSecondary icon="upload_file" onClick={() => fileInputRef.current?.click()}>Importer</BtnSecondary>}
              <BtnSecondary icon="picture_as_pdf" onClick={exportTenantsPDF}>PDF</BtnSecondary>
              <BtnSecondary icon="download" onClick={exportTenants}>Excel</BtnSecondary>
              {canCreate && <Btn icon="person_add" onClick={openAddTenant}>Ajouter Locataire</Btn>}
            </>
          )}
          {tab === 'Propriétaires' && canCreate && <Btn icon="add_business" onClick={openAddOwner}>Ajouter Propriétaire</Btn>}
        </div>
      </div>

      {/* Recherche */}
      <div className="relative mb-5 max-w-sm">
        <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..."
          className="pl-9 pr-4 py-2.5 w-full bg-surface border border-outline-variant/30 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
      </div>

      {/* ── CONTRATS ────────────────────────────────────────────────────── */}
      {tab === 'Contrats' && (
        <div>
          <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
            {CONTRACT_STATUSES.map(s => (
              <button key={s} onClick={() => setCFilter(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${cFilter === s ? 'bg-primary text-on-primary' : 'bg-surface border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high'}`}>
                {s}
              </button>
            ))}
          </div>
          <div className="bg-surface rounded-2xl border border-outline-variant/20 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-primary text-on-primary">
                  <tr>
                    {['Propriété', 'Locataire', 'Loyer', 'Fin de bail', 'Statut', ''].map(h => (
                      <th key={h} className={`px-4 py-3 text-xs font-bold uppercase tracking-wider ${h === 'Loyer' ? 'text-right' : h === 'Fin de bail' ? 'text-center' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {filteredContracts.map(c => (
                    <tr key={c.id} className="hover:bg-surface-container-low group">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-on-surface text-sm">{c.propertyName}</p>
                        <p className="text-xs text-on-surface-variant">{c.propertyType}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-on-surface">{c.tenant}</td>
                      <td className="px-4 py-3 text-right font-bold text-primary text-sm">{fmt(c.rent)}</td>
                      <td className="px-4 py-3 text-center text-xs text-on-surface-variant">{c.endDate || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_BADGE[c.status] || ''}`}>{c.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 justify-end">
                          <IconBtn icon="picture_as_pdf" color="text-on-surface-variant" title="Générer l'avenant PDF"
                            onClick={() => {
                              const prop = properties.find(p => p.id === c.propertyId || p.name === c.propertyName);
                              const org = state.orgSettings || {};
                              openContractReport(c, prop, org, { sigBailleur: c.sigBailleur, sigPreneur: c.sigPreneur });
                            }} />
                          {canEdit && <IconBtn icon="edit" color="text-primary" onClick={() => openEditContract(c)} />}
                          {canDelete && <IconBtn icon="delete" color="text-error" onClick={() => setDeleteTarget({ type: 'contract', data: c })} />}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredContracts.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-12 text-on-surface-variant text-sm">Aucun contrat trouvé</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── LOCATAIRES ──────────────────────────────────────────────────── */}
      {tab === 'Locataires' && (
        <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar items-center">
          {['Tous', 'Avec contrat', 'Sans contrat'].map(f => (
            <button key={f} onClick={() => setTFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${tFilter === f ? 'bg-primary text-on-primary' : 'bg-surface border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high'}`}>
              {f}
            </button>
          ))}
          <div className="w-px h-4 bg-outline-variant/40 mx-1 flex-shrink-0" />
          <button onClick={() => setTSort(s => !s)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${tSort ? 'bg-primary text-on-primary' : 'bg-surface border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high'}`}>
            <Icon name="sort_by_alpha" size={13} /> A → Z
          </button>
        </div>
      )}
      {tab === 'Locataires' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTenants.map(t => (
            <div key={t.id} className="bg-surface rounded-2xl p-4 border border-outline-variant/20 shadow-sm group hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${t.color}`}>{t.initials}</div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-on-surface truncate">{t.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_BADGE[t.status] || ''}`}>{t.status}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button title="Documents du dossier" onClick={() => setDocsTenant(t)}
                    className="relative flex items-center justify-center w-9 h-9 rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-primary transition-colors">
                    <Icon name="folder" size={18} />
                    {docCountByTenant[String(t.id)] > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-on-primary text-[10px] font-bold flex items-center justify-center">{docCountByTenant[String(t.id)]}</span>
                    )}
                  </button>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                    <IconBtn icon="qr_code" color="text-on-surface-variant" title="Portail locataire QR" onClick={() => { setQrTenant(t); setPortalToken(null); }} />
                    {canEdit && <IconBtn icon="edit" color="text-primary" onClick={() => openEditTenant(t)} />}
                    {canDelete && <IconBtn icon="delete" color="text-error" onClick={() => setDeleteTarget({ type: 'tenant', data: t })} />}
                  </div>
                </div>
              </div>
              {(() => {
                const contract = contracts.find(c => normN(c.tenant) === normN(t.name));
                const rent = contract?.rent || allPropertyOptions.find(o => o.label === t.property)?.rent;
                return (
                  <div className="flex flex-col gap-1.5 text-xs text-on-surface-variant">
                    <span className="flex items-center gap-1.5"><Icon name="mail" size={12} />{t.email || '—'}</span>
                    <span className="flex items-center gap-1.5"><Icon name="phone" size={12} />{t.phone || '—'}</span>
                    {(t.emergencyName || t.emergencyPhone) && (
                      <span className="flex items-center gap-1.5 text-error/80">
                        <Icon name="emergency" size={12} />{t.emergencyName || ''}{t.emergencyPhone ? ` — ${t.emergencyPhone}` : ''}
                      </span>
                    )}
                    <span className="flex items-center gap-1.5"><Icon name="apartment" size={12} /><span className="truncate">{t.property || '—'}</span></span>
                    {rent && (
                      <span className="flex items-center gap-1.5 font-semibold text-primary">
                        <Icon name="payments" size={12} />{Number(rent).toLocaleString('fr-CI')} FCFA/mois
                      </span>
                    )}
                    <span className="flex items-center gap-1.5"><Icon name="calendar_today" size={12} />Depuis : {t.since || '—'}</span>
                    {contract?.endDate && (
                      <span className="flex items-center gap-1.5">
                        <Icon name="event" size={12} />Fin bail : {new Date(contract.endDate).toLocaleDateString('fr-CI')}
                      </span>
                    )}
                    {t.paymentStartDate && (
                      <span className="flex items-center gap-1.5 text-amber-600 font-medium">
                        <Icon name="event_upcoming" size={12} />1er loyer : {new Date(t.paymentStartDate).toLocaleDateString('fr-CI')}
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
          ))}
          {filteredTenants.length === 0 && (
            <div className="col-span-3 text-center py-12 text-on-surface-variant text-sm">Aucun locataire trouvé</div>
          )}
        </div>
      )}

      {/* ── PROPRIÉTAIRES ───────────────────────────────────────────────── */}
      {tab === 'Propriétaires' && (
        <div className="bg-surface rounded-2xl border border-outline-variant/20 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-primary text-on-primary">
                <tr>
                  {['Propriétaire', 'Contact', 'Biens', 'Revenu/mois', 'Statut', ''].map(h => (
                    <th key={h} className={`px-4 py-3 text-xs font-bold uppercase tracking-wider ${h === 'Revenu/mois' ? 'text-right' : h === 'Biens' ? 'text-center' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {filteredOwners.map(o => (
                  <tr key={o.id} className="hover:bg-surface-container-low group">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs ${o.color}`}>{o.initials}</div>
                        <span className="font-semibold text-on-surface text-sm">{o.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-on-surface">{o.email}</p>
                      <p className="text-xs text-on-surface-variant">{o.phone}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary-container text-on-primary-container text-xs font-bold">{o.properties}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-primary text-sm">{fmt(o.revenue)}</td>
                    <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_BADGE[o.status] || ''}`}>{o.status}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 justify-end">
                        {canEdit && <IconBtn icon="edit" color="text-primary" onClick={() => openEditOwner(o)} />}
                        {canDelete && <IconBtn icon="delete" color="text-error" onClick={() => setDeleteTarget({ type: 'owner', data: o })} />}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredOwners.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-12 text-on-surface-variant text-sm">Aucun propriétaire trouvé</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          MODALES
      ═══════════════════════════════════════════════════════════════════════ */}

      {/* ── Import locataires ───────────────────────────────────────────── */}
      {modal === 'import' && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget && !importLoading) setModal(null); }}>
          <div className="bg-surface rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="sticky top-0 bg-surface border-b border-outline-variant/20 px-6 py-4 flex justify-between items-center rounded-t-3xl flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-primary-container rounded-xl flex items-center justify-center">
                  <Icon name="upload_file" size={18} className="text-on-primary-container" />
                </div>
                <div>
                  <h2 className="font-bold text-on-surface text-sm">Importer des locataires</h2>
                  <p className="text-xs text-on-surface-variant">{importRows.length} ligne(s) détectée(s)</p>
                </div>
              </div>
              {!importLoading && !importResult && (
                <button onClick={downloadTemplate} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary border border-primary/30 rounded-xl hover:bg-primary/5 transition-colors">
                  <Icon name="download" size={14} />Télécharger le modèle
                </button>
              )}
              {!importLoading && <button onClick={() => setModal(null)} className="text-on-surface-variant hover:text-on-surface ml-2"><Icon name="close" size={20} /></button>}
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 p-6">

              {/* Résultat import */}
              {importResult ? (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
                      <p className="text-3xl font-black text-green-700">{importResult.ok.length}</p>
                      <p className="text-xs text-green-600 font-semibold mt-1">Importé(s) avec succès</p>
                    </div>
                    <div className={`${importResult.errors.length > 0 ? 'bg-red-50 border-red-200' : 'bg-surface-container border-outline-variant/20'} border rounded-2xl p-4 text-center`}>
                      <p className={`text-3xl font-black ${importResult.errors.length > 0 ? 'text-red-600' : 'text-on-surface-variant'}`}>{importResult.errors.length}</p>
                      <p className={`text-xs font-semibold mt-1 ${importResult.errors.length > 0 ? 'text-red-500' : 'text-on-surface-variant'}`}>Erreur(s)</p>
                    </div>
                  </div>

                  {importResult.ok.length > 0 && (
                    <div className="bg-green-50 rounded-2xl p-4">
                      <p className="text-xs font-bold text-green-700 mb-2">Locataires importés :</p>
                      <div className="flex flex-wrap gap-1.5">
                        {importResult.ok.map(name => (
                          <span key={name} className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-medium">{name}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {importResult.errors.length > 0 && (
                    <div className="bg-red-50 rounded-2xl p-4">
                      <p className="text-xs font-bold text-red-700 mb-2">Erreurs :</p>
                      {importResult.errors.map((e, i) => (
                        <p key={i} className="text-xs text-red-600 mb-1"><strong>{e.name}</strong> — {e.reason}</p>
                      ))}
                    </div>
                  )}

                  <button onClick={() => setModal(null)}
                    className="w-full py-3 bg-primary text-on-primary font-bold rounded-xl text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2">
                    <Icon name="check_circle" size={16} />Terminer
                  </button>
                </div>
              ) : (
                <>
                  {/* Prévisualisation */}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 flex items-start gap-2">
                    <Icon name="info" size={15} className="text-amber-700 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">
                      Vérifiez les données avant de confirmer. Compatible avec le format <strong>OCCUPATION DES APPARTEMENTS</strong> (multi-feuilles) et le format standard. Les locataires <strong>LIBRE</strong> sont automatiquement exclus.
                    </p>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-outline-variant/20">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-primary text-on-primary">
                        <tr>
                          {['Nom', 'Téléphone', 'Bien / Appartement', 'Loyer', 'Statut'].map(h => (
                            <th key={h} className="px-3 py-2.5 font-bold uppercase tracking-wide whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/10">
                        {importRows.map((r, i) => (
                          <tr key={i} className={i % 2 === 0 ? 'bg-surface' : 'bg-surface-container-low'}>
                            <td className="px-3 py-2 font-semibold text-on-surface whitespace-nowrap">{r.name}</td>
                            <td className="px-3 py-2 text-on-surface-variant whitespace-nowrap">{r.phone || '—'}</td>
                            <td className="px-3 py-2 text-on-surface-variant max-w-[200px] truncate">{r.property || '—'}</td>
                            <td className="px-3 py-2 text-on-surface-variant whitespace-nowrap">{r.rent || '—'}</td>
                            <td className="px-3 py-2">
                              <span className="px-2 py-0.5 rounded-full font-semibold bg-green-100 text-green-800">
                                Actif
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Boutons */}
                  <div className="flex gap-3 mt-5">
                    <button onClick={() => setModal(null)}
                      className="flex-1 py-2.5 text-sm font-semibold text-on-surface-variant bg-surface-container rounded-xl hover:bg-surface-container-high transition-colors">
                      Annuler
                    </button>
                    <button onClick={runImport} disabled={importLoading}
                      className="flex-1 py-2.5 text-sm font-bold text-on-primary bg-primary rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                      {importLoading
                        ? <><Icon name="progress_activity" size={16} className="animate-spin" />Import en cours…</>
                        : <><Icon name="upload_file" size={16} />Importer {importRows.length} locataire(s)</>}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Contrat ─────────────────────────────────────────────────────── */}
      {modal === 'contract' && (
        <ModalWrap title={target ? 'Modifier le Contrat' : 'Nouveau Contrat'} onClose={() => setModal(null)}>
          {/* Steps */}
          <div className="flex gap-4 mb-5">
            {[{ n: 1, l: 'Informations' }, { n: 2, l: 'Signatures' }].map((s, i) => (
              <div key={s.n} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step >= s.n ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'}`}>{s.n}</div>
                <span className={`text-sm ${step >= s.n ? 'text-primary font-semibold' : 'text-on-surface-variant'}`}>{s.l}</span>
                {i < 1 && <Icon name="chevron_right" size={14} className="text-outline-variant" />}
              </div>
            ))}
          </div>

          {step === 1 && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="form-label">
                  Propriété *
                </label>
                <SearchSelect
                  value={availablePropertyOptions.find(o => o.label === cForm.propertyName)?.value || ''}
                  onChange={v => onContractPropChange({ target: { value: v } })}
                  options={availablePropertyOptions.map(o => ({ value: o.value, label: o.displayLabel }))}
                  placeholder="— Rechercher un bien —"
                />
                {/* Info locataire actuel si bien déjà loué */}
                {cForm.propertyName && (() => {
                  const activeCont = contracts.find(c =>
                    (c.status === 'Actif' || c.status === 'Expirant') &&
                    normN(c.propertyName || '') === normN(cForm.propertyName)
                  );
                  if (!activeCont) return null;
                  const ct = tenants.find(t => normN(t.name) === normN(activeCont.tenant));
                  return (
                    <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex items-start gap-2">
                      <Icon name="person" size={14} className="text-amber-600 mt-0.5 flex-shrink-0" />
                      <div className="text-xs">
                        <p className="font-bold text-amber-800">{activeCont.tenant}</p>
                        {ct?.phone && <p className="text-amber-700">{ct.phone}</p>}
                        {ct?.email && <p className="text-amber-600">{ct.email}</p>}
                        <p className="text-amber-500 mt-0.5">Contrat {activeCont.status} — fin : {activeCont.endDate || 'Indéterminée'}</p>
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div>
                <label className="form-label">Locataire *</label>
                <SearchSelect
                  value={String(tenants.find(t => t.name === cForm.tenant)?.id || '')}
                  onChange={v => {
                    const t = tenants.find(x => String(x.id) === String(v));
                    if (!t) return;
                    if (!cForm.propertyName) {
                      // Auto-fill property from active contract when no property selected yet
                      const activeContract = contracts.find(c =>
                        (c.status === 'Actif' || c.status === 'Expirant') &&
                        (normN(c.tenant || '') === normN(t.name || '') ||
                         (c.tenantId && String(c.tenantId) === String(t.id)))
                      );
                      if (activeContract) {
                        const matchOpt = availablePropertyOptions.find(o =>
                          normN(o.label) === normN(activeContract.propertyName || '') ||
                          normN(o.label) === normN(activeContract.buildingName || '') ||
                          String(o.buildingId) === String(activeContract.propertyId)
                        );
                        if (matchOpt) {
                          setCForm(f => ({
                            ...f,
                            tenant: t.name,
                            propertyId: matchOpt.buildingId,
                            propertyName: matchOpt.label,
                            rent: f.rent || String(matchOpt.rent || ''),
                          }));
                          return;
                        }
                      }
                    }
                    setCForm(f => ({ ...f, tenant: t.name }));
                  }}
                  options={tenants.map(t => ({ value: String(t.id), label: t.name }))}
                  placeholder="— Rechercher un locataire —"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Loyer mensuel (FCFA) *</label>
                  <input type="number" value={cForm.rent} onChange={e => setCForm(f => ({ ...f, rent: e.target.value }))} className="form-input" placeholder="150000" />
                </div>
                <div>
                  <label className="form-label">Fin de bail</label>
                  <input type="date" value={cForm.endDate} onChange={e => setCForm(f => ({ ...f, endDate: e.target.value }))} className="form-input" />
                </div>
              </div>
              <div>
                <label className="form-label">Statut</label>
                <select value={cForm.status} onChange={e => setCForm(f => ({ ...f, status: e.target.value }))} className="form-input">
                  {['Actif', 'Expirant', 'Brouillon', 'Résilié'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex justify-between mt-2">
                <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-container-high rounded-xl">Annuler</button>
                <button onClick={() => setStep(2)} disabled={!cForm.propertyName || !cForm.tenant}
                  className="px-5 py-2 text-sm bg-primary text-on-primary rounded-xl font-bold disabled:opacity-40">
                  Signatures →
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-5">
              <div className="bg-primary-container/20 rounded-xl p-3 text-sm">
                <p className="font-semibold text-on-surface">{cForm.propertyName} — {cForm.tenant}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">Loyer : {Number(cForm.rent || 0).toLocaleString('fr-CI')} FCFA/mois</p>
              </div>
              <SignaturePad ref={sigBailleurRef} label="Signature du Bailleur" subtitle="Propriétaire ou mandataire" />
              <SignaturePad ref={sigPreneurRef} label="Signature du Preneur (Locataire)" subtitle='Précédée de « Lu et approuvé »' />
              {(cForm.sigBailleur || cForm.sigPreneur) && (
                <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded-xl px-3 py-2">
                  <Icon name="check_circle" size={14} />
                  Signatures précédentes enregistrées sur ce contrat
                </div>
              )}
              <p className="text-xs text-on-surface-variant">Les signatures sont optionnelles — tu pourras générer l'avenant PDF et signer ultérieurement.</p>
              <div className="flex justify-between mt-2">
                <button onClick={() => setStep(1)} className="px-4 py-2 text-sm bg-surface-container rounded-xl">← Précédent</button>
                <button onClick={saveContract} className="px-5 py-2 text-sm bg-primary text-on-primary rounded-xl font-bold">
                  Enregistrer le contrat
                </button>
              </div>
            </div>
          )}
        </ModalWrap>
      )}

      {/* ── Locataire ───────────────────────────────────────────────────── */}
      {modal === 'tenant' && (
        <ModalWrap title={target ? 'Modifier le Locataire' : 'Ajouter un Locataire'} onClose={() => setModal(null)}>
          {/* Steps */}
          <div className="flex gap-4 mb-5">
            {[{ n: 1, l: 'Identité' }, { n: 2, l: 'Logement' }].map((s, i) => (
              <div key={s.n} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step >= s.n ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'}`}>{s.n}</div>
                <span className={`text-sm ${step >= s.n ? 'text-primary font-semibold' : 'text-on-surface-variant'}`}>{s.l}</span>
                {i < 1 && <Icon name="chevron_right" size={14} className="text-outline-variant" />}
              </div>
            ))}
          </div>

          {step === 1 && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="col-span-full sm:col-span-2">
                  <label className="form-label">Nom complet *</label>
                  <input value={tForm.name} onChange={e => setTForm(f => ({ ...f, name: e.target.value }))} className="form-input" placeholder="Prénom Nom" />
                </div>
                <div>
                  <label className="form-label">Email</label>
                  <input type="email" value={tForm.email} onChange={e => setTForm(f => ({ ...f, email: e.target.value }))} className="form-input" placeholder="email@exemple.com" />
                </div>
                <div>
                  <label className="form-label">Téléphone</label>
                  <input value={tForm.phone} onChange={e => setTForm(f => ({ ...f, phone: e.target.value }))} className="form-input" placeholder="+225 07 00 00 00 00" />
                </div>
              </div>
              <div>
                <label className="form-label">Statut</label>
                <select value={tForm.status} onChange={e => setTForm(f => ({ ...f, status: e.target.value }))} className="form-input">
                  {['Actif', 'En cours', 'Inactif'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="border-t border-outline-variant/20 pt-4">
                <p className="text-xs font-semibold text-on-surface-variant mb-3 flex items-center gap-1.5">
                  <Icon name="emergency" size={13} className="text-error" />Contact en cas d'urgence
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">Nom</label>
                    <input value={tForm.emergencyName || ''} onChange={e => setTForm(f => ({ ...f, emergencyName: e.target.value }))} className="form-input" placeholder="Prénom Nom" />
                  </div>
                  <div>
                    <label className="form-label">Téléphone</label>
                    <input value={tForm.emergencyPhone || ''} onChange={e => setTForm(f => ({ ...f, emergencyPhone: e.target.value }))} className="form-input" placeholder="+225 07 00 00 00 00" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="form-label">Bien / Immeuble *</label>
                <select value={selectedPropId} onChange={onTenantPropChange} className="form-input">
                  <option value="">— Sélectionner un bien —</option>
                  {properties.filter(p => !p.isBuilding && (p.status === 'Disponible' || `${p.id}::` === selectedPropId)).map(p => (
                    <option key={p.id} value={`${p.id}::`}>{p.name} — {p.address}</option>
                  ))}
                  {properties.filter(p => p.isBuilding).map(p => (
                    <optgroup key={p.id} label={`🏢 ${p.name}`}>
                      {(p.units || []).filter(u => u.status === 'Disponible' || `${p.id}::${u.id}` === selectedPropId).map(u => (
                        <option key={u.id} value={`${p.id}::${u.id}`}>{u.number} ({u.floor}) — {Number(u.rent).toLocaleString('fr-CI')} FCFA</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Date d'entrée</label>
                  <input type="date" value={tForm.since || ''} onChange={e => {
                    const since = e.target.value;
                    const auto = since ? (() => { const d = new Date(since); d.setMonth(d.getMonth() + 2); return d.toISOString().split('T')[0]; })() : '';
                    setTForm(f => ({ ...f, since, paymentStartDate: auto }));
                  }} className="form-input" />
                </div>
                <div>
                  <label className="form-label">Jour d'échéance du loyer</label>
                  <select value={tForm.paymentDueDay || '5'} onChange={e => setTForm(f => ({ ...f, paymentDueDay: e.target.value }))} className="form-input">
                    {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                      <option key={d} value={String(d)}>{d} du mois</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="form-label flex items-center gap-1.5">
                  <Icon name="event_upcoming" size={13} className="text-amber-600" />
                  1er paiement de loyer
                </label>
                <input type="date" value={tForm.paymentStartDate || ''} onChange={e => setTForm(f => ({ ...f, paymentStartDate: e.target.value }))} className="form-input" />
                <p className="text-xs text-on-surface-variant mt-1">Auto-calculé (entrée + 2 mois) — modifiable si nécessaire</p>
              </div>
              {selectedPropId && (
                <div className="bg-primary-container/30 rounded-xl p-3 text-sm">
                  <p className="font-semibold text-primary">{allPropertyOptions.find(o => o.value === selectedPropId)?.label}</p>
                  <p className="text-on-surface-variant text-xs mt-0.5">
                    Loyer : <strong className="text-on-surface">{fmt(allPropertyOptions.find(o => o.value === selectedPropId)?.rent)}/mois</strong>
                  </p>
                </div>
              )}

              <div className="border-t border-outline-variant/20 pt-4">
                <label className="form-label flex items-center gap-1.5"><Icon name="folder" size={14} className="text-primary" /> Documents du dossier</label>
                {target?.id ? (
                  <TenantDocuments tenantId={target.id} tenantName={tForm.name} />
                ) : (
                  <p className="text-xs text-on-surface-variant bg-surface-container rounded-lg px-3 py-2 flex items-center gap-1.5">
                    <Icon name="info" size={14} /> Enregistrez d'abord le locataire, puis rouvrez sa fiche (ou l'icône dossier) pour joindre des documents.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-between mt-6">
            <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-container-high rounded-xl">Annuler</button>
            <div className="flex gap-2">
              {step > 1 && <button onClick={() => setStep(1)} className="px-4 py-2 text-sm bg-surface-container rounded-xl">← Précédent</button>}
              {step < 2
                ? <button onClick={() => setStep(2)} disabled={!tForm.name} className="px-5 py-2 text-sm bg-primary text-on-primary rounded-xl font-bold disabled:opacity-40">Suivant →</button>
                : <button onClick={saveTenant} disabled={savingTenant} className="px-5 py-2 text-sm bg-primary text-on-primary rounded-xl font-bold disabled:opacity-50 flex items-center gap-2">{savingTenant ? <><Icon name="progress_activity" size={14} className="animate-spin" />Enregistrement…</> : 'Enregistrer'}</button>
              }
            </div>
          </div>
        </ModalWrap>
      )}

      {/* ── Propriétaire ────────────────────────────────────────────────── */}
      {modal === 'owner' && (
        <ModalWrap title={target ? 'Modifier le Propriétaire' : 'Ajouter un Propriétaire'} onClose={() => setModal(null)}>
          <div className="flex flex-col gap-4">
            <div>
              <label className="form-label">Nom complet *</label>
              <input value={oForm.name} onChange={e => setOForm(f => ({ ...f, name: e.target.value }))} className="form-input" placeholder="Prénom Nom" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="form-label">Email</label>
                <input type="email" value={oForm.email} onChange={e => setOForm(f => ({ ...f, email: e.target.value }))} className="form-input" />
              </div>
              <div>
                <label className="form-label">Téléphone</label>
                <input value={oForm.phone} onChange={e => setOForm(f => ({ ...f, phone: e.target.value }))} className="form-input" placeholder="+225 07 00 00 00 00" />
              </div>
              <div>
                <label className="form-label">Banque</label>
                <input value={oForm.bank || ''} onChange={e => setOForm(f => ({ ...f, bank: e.target.value }))} className="form-input" placeholder="Ex: BICICI" />
              </div>
              <div>
                <label className="form-label">RIB / IBAN</label>
                <input value={oForm.iban || ''} onChange={e => setOForm(f => ({ ...f, iban: e.target.value }))} className="form-input" />
              </div>
              <div>
                <label className="form-label">Commission Minsouah (%)</label>
                <input
                  type="number" min="0" max="100" step="0.5"
                  value={oForm.commissionRate ?? ''}
                  onChange={e => setOForm(f => ({ ...f, commissionRate: e.target.value === '' ? '' : Number(e.target.value) }))}
                  className="form-input" placeholder="Ex: 10"
                />
                <p className="text-xs text-on-surface-variant mt-1">Taux prélevé sur les loyers reversés à ce propriétaire.</p>
              </div>
            </div>
            <div>
              <label className="form-label">Statut</label>
              <select value={oForm.status} onChange={e => setOForm(f => ({ ...f, status: e.target.value }))} className="form-input">
                {['Actif', 'Inactif'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Biens attribués */}
          <div className="mt-4">
            <label className="form-label mb-2 block">Biens immobiliers attribués</label>
            <div className="max-h-48 overflow-y-auto flex flex-col gap-1 border border-outline-variant/30 rounded-xl p-3 bg-surface-container-low">
              {properties.length === 0 && <p className="text-xs text-on-surface-variant">Aucun bien enregistré</p>}
              {properties.map(p => {
                const checked = (oForm.propertyIds || []).includes(p.id);
                return (
                  <label key={p.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${checked ? 'bg-primary-container/40' : 'hover:bg-surface-container-high'}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setOForm(f => ({
                        ...f,
                        propertyIds: checked
                          ? (f.propertyIds || []).filter(id => id !== p.id)
                          : [...(f.propertyIds || []), p.id],
                      }))}
                      className="accent-primary w-4 h-4"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-on-surface truncate">{p.name}</p>
                      <p className="text-xs text-on-surface-variant truncate">{p.address} — {p.isBuilding ? `${(p.units||[]).length} appts` : fmt(p.rent) + '/mois'}</p>
                    </div>
                    {checked && <Icon name="check_circle" size={14} className="text-primary flex-shrink-0" />}
                  </label>
                );
              })}
            </div>
            {(oForm.propertyIds || []).length > 0 && (
              <p className="text-xs text-primary font-semibold mt-1">{(oForm.propertyIds || []).length} bien(s) sélectionné(s)</p>
            )}
          </div>

          <ModalFooter onCancel={() => setModal(null)} onSave={saveOwner} disabled={!oForm.name} />
        </ModalWrap>
      )}

      {/* ── Documents du dossier locataire ──────────────────────────────── */}
      {docsTenant && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setDocsTenant(null)}>
          <div className="bg-surface rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-surface border-b border-outline-variant/20 px-6 py-4 flex justify-between items-center rounded-t-3xl z-10">
              <div className="flex items-center gap-2 min-w-0">
                <Icon name="folder_shared" className="text-primary" />
                <div className="min-w-0">
                  <h2 className="font-bold text-on-surface truncate">Documents — {docsTenant.name}</h2>
                  <p className="text-xs text-on-surface-variant truncate">{docsTenant.property || 'Dossier locataire'}</p>
                </div>
              </div>
              <button onClick={() => setDocsTenant(null)} className="text-on-surface-variant hover:text-on-surface"><Icon name="close" size={20} /></button>
            </div>
            <div className="p-6">
              <TenantDocuments tenantId={docsTenant.id} tenantName={docsTenant.name} readOnly={!canEdit} />
            </div>
          </div>
        </div>
      )}

      {/* ── QR Portail locataire ────────────────────────────────────────── */}
      {qrTenant && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) { setQrTenant(null); setPortalToken(null); } }}>
          <div className="bg-surface rounded-3xl w-full max-w-sm shadow-2xl">
            <div className="sticky top-0 bg-surface border-b border-outline-variant/20 px-6 py-4 flex justify-between items-center rounded-t-3xl">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-primary-container rounded-xl flex items-center justify-center">
                  <Icon name="qr_code" size={18} className="text-on-primary-container" />
                </div>
                <div>
                  <h2 className="font-bold text-on-surface text-sm">Portail Locataire</h2>
                  <p className="text-xs text-on-surface-variant truncate max-w-[180px]">{qrTenant.name}</p>
                </div>
              </div>
              <button onClick={() => { setQrTenant(null); setPortalToken(null); }} className="text-on-surface-variant hover:text-on-surface">
                <Icon name="close" size={20} />
              </button>
            </div>

            <div className="p-6 flex flex-col items-center gap-5">
              {/* QR Code display */}
              {portalToken ? (
                <>
                  <div className="p-4 bg-white rounded-2xl border border-outline-variant/20 shadow-sm" id="qr-portal-print">
                    <QRCodeSVG
                      value={`${window.location.origin}/#/locataire/${portalToken}`}
                      size={200}
                      fgColor="#785a00"
                      bgColor="#ffffff"
                      level="M"
                    />
                  </div>
                  <div className="w-full bg-surface-container rounded-xl p-3 text-xs text-on-surface-variant break-all text-center">
                    <span
                      className="text-primary font-semibold cursor-pointer hover:underline"
                      onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/#/locataire/${portalToken}`).then(() => alert('Lien copié !')).catch(() => {})}
                      title="Cliquer pour copier"
                    >
                      {`${window.location.origin}/#/locataire/${portalToken}`}
                    </span>
                    <p className="mt-1 text-on-surface-variant/70">Cliquez sur l'URL pour copier</p>
                  </div>
                  <div className="flex gap-3 w-full">
                    <button
                      onClick={async () => {
                        setQrGenerating(true);
                        const tenantPayments = (state.payments || []).filter(p => p.tenantId === qrTenant.id || p.tenantName === qrTenant.name);
                        dispatch({ type: 'GENERATE_TENANT_PORTAL', payload: { tenantId: qrTenant.id, tenantName: qrTenant.name, propertyName: qrTenant.property || '', payments: tenantPayments } });
                        setTimeout(() => {
                          const token = sessionStorage.getItem('lastPortalToken');
                          if (token) setPortalToken(token);
                          setQrGenerating(false);
                        }, 1500);
                      }}
                      disabled={qrGenerating}
                      className="flex-1 py-2.5 text-sm font-semibold text-on-surface-variant bg-surface-container rounded-xl hover:bg-surface-container-high transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {qrGenerating ? <Icon name="progress_activity" size={14} className="animate-spin" /> : <Icon name="refresh" size={14} />}
                      Rafraîchir
                    </button>
                    <button
                      onClick={() => {
                        const printWin = window.open('', '_blank');
                        if (!printWin) return;
                        const url = `${window.location.origin}/#/locataire/${portalToken}`;
                        const svgEl = document.querySelector('#qr-portal-print svg');
                        const svgHtml = svgEl ? svgEl.outerHTML : '';
                        printWin.document.write(`<!DOCTYPE html><html><head><title>QR Portail — ${qrTenant.name}</title><style>body{font-family:Arial,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;background:#fff}h2{color:#785a00;margin:0 0 8px}p{color:#666;font-size:13px;margin:4px 0}a{color:#785a00;word-break:break-all}svg{margin:16px 0}@media print{button{display:none}}</style></head><body><h2>Portail Locataire</h2><p><strong>${qrTenant.name}</strong> — ${qrTenant.property || ''}</p>${svgHtml}<p>Scannez ce QR code ou visitez :</p><a href="${url}">${url}</a><br><br><button onclick="window.print()">Imprimer</button></body></html>`);
                        printWin.document.close();
                        printWin.onload = () => printWin.print();
                      }}
                      className="flex-1 py-2.5 text-sm font-bold text-on-primary bg-primary rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Icon name="print" size={14} />Imprimer
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-full text-center py-4">
                    <div className="w-16 h-16 rounded-2xl bg-primary-container/40 flex items-center justify-center mx-auto mb-3">
                      <Icon name="qr_code_2" size={32} className="text-primary" />
                    </div>
                    <p className="text-sm text-on-surface font-semibold">{qrTenant.name}</p>
                    <p className="text-xs text-on-surface-variant mt-1">{qrTenant.property || 'Aucun bien associé'}</p>
                  </div>
                  <button
                    onClick={async () => {
                      setQrGenerating(true);
                      const tenantPayments = (state.payments || []).filter(p => p.tenantId === qrTenant.id || p.tenantName === qrTenant.name);
                      dispatch({ type: 'GENERATE_TENANT_PORTAL', payload: { tenantId: qrTenant.id, tenantName: qrTenant.name, propertyName: qrTenant.property || '', payments: tenantPayments } });
                      setTimeout(() => {
                        const token = sessionStorage.getItem('lastPortalToken');
                        if (token) setPortalToken(token);
                        setQrGenerating(false);
                      }, 1500);
                    }}
                    disabled={qrGenerating}
                    className="w-full py-3 text-sm font-bold text-on-primary bg-primary rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {qrGenerating
                      ? <><Icon name="progress_activity" size={16} className="animate-spin" />Génération…</>
                      : <><Icon name="qr_code" size={16} />Générer le portail</>}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Confirmation suppression ─────────────────────────────────────── */}
      {deleteTarget && (
        <ModalWrap title="Confirmer la suppression" onClose={() => setDeleteTarget(null)}>
          <div className="text-center py-4">
            <div className="w-16 h-16 rounded-full bg-error-container flex items-center justify-center mx-auto mb-4">
              <Icon name="warning" size={32} className="text-error" />
            </div>
            <p className="text-sm text-on-surface-variant">Supprimer <strong className="text-on-surface">"{deleteTarget.data?.name || deleteTarget.data?.propertyName}"</strong> ?</p>
            <p className="text-xs text-on-surface-variant mt-1">Cette action est irréversible.</p>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 rounded-xl bg-surface-container text-on-surface text-sm font-semibold">Annuler</button>
            <button onClick={confirmDelete} className="flex-1 py-2.5 rounded-xl bg-error text-on-error text-sm font-bold">Supprimer</button>
          </div>
        </ModalWrap>
      )}
    </div>
  );
}

// ── Micro-composants ──────────────────────────────────────────────────────────
function Btn({ icon, onClick, children }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 px-4 py-2 bg-primary text-on-primary rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors whitespace-nowrap">
      <Icon name={icon} size={16} />{children}
    </button>
  );
}
function BtnSecondary({ icon, onClick, children }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 px-4 py-2 bg-surface border border-outline-variant/40 text-on-surface-variant rounded-xl text-sm font-semibold hover:bg-surface-container-high transition-colors whitespace-nowrap">
      <Icon name={icon} size={16} />{children}
    </button>
  );
}
function IconBtn({ icon, color, onClick, title }) {
  return (
    <button title={title} onClick={e => { e.stopPropagation(); onClick(); }} className={`w-7 h-7 rounded-full flex items-center justify-center ${color} hover:bg-surface-container transition-colors`}>
      <Icon name={icon} size={14} />
    </button>
  );
}
function ModalWrap({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-surface border-b border-outline-variant/20 px-6 py-4 flex justify-between items-center rounded-t-3xl">
          <h2 className="font-bold text-on-surface">{title}</h2>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface"><Icon name="close" size={20} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
function ModalFooter({ onCancel, onSave, disabled, saveLabel = 'Enregistrer' }) {
  return (
    <div className="flex justify-between mt-6">
      <button onClick={onCancel} className="px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-container-high rounded-xl">Annuler</button>
      <button onClick={onSave} disabled={disabled} className="px-5 py-2 text-sm bg-primary text-on-primary rounded-xl font-bold disabled:opacity-40">{saveLabel}</button>
    </div>
  );
}

// Styles inline pour les formulaires (tailwind via className)
const _css = `
  .form-label { display: block; font-size: 0.75rem; font-weight: 500; color: var(--color-on-surface-variant); margin-bottom: 4px; }
  .form-input { width: 100%; padding: 10px 14px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.15); background: var(--color-surface-container); font-size: 0.875rem; color: var(--color-on-surface); outline: none; }
  .form-input:focus { box-shadow: 0 0 0 2px rgba(120,90,0,0.25); }
`;
