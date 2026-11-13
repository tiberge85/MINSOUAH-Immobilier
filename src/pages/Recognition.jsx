import { useState, useMemo, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, setDoc, writeBatch, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';
import { evaluateAll, AWARD_DEFS, AWARD_BY_KEY, DEFAULT_AWARD_RULES, AWARD_RULE_FIELDS, resolveAwardRules, isActiveTenant } from '../lib/recognition';
import { buildCertificate, certificateHTML } from '../lib/certificate';

const WS = import.meta.env.VITE_FIREBASE_WORKSPACE || 'minsouah';
const fNum = (n) => Number(n || 0).toLocaleString('fr-FR');

function phoneForWA(raw) {
  const d = (raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('225')) return d;
  return '225' + (d.startsWith('0') ? d.slice(1) : d);
}

export default function Recognition() {
  const { state } = useApp();
  const user = state.currentUser;
  const orgId = user?.orgId || 'default';
  const agencyName = (state.organizations || []).find(o => o.id === orgId)?.name || '';
  const now = new Date();

  const [year, setYear] = useState(now.getFullYear());
  const [results, setResults] = useState(null); // évaluation à l'écran (en mémoire)
  const [saved, setSaved] = useState({});        // distinctions enregistrées (par tenantId)
  const [campaign, setCampaign] = useState(null); // doc campagne
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState(null); // ligne dépliée (tenantId)

  // Critères paramétrables (par distinction), chargés depuis Firestore.
  const [rules, setRules] = useState(() => resolveAwardRules(null));
  const [showRules, setShowRules] = useState(false);
  const [rulesDirty, setRulesDirty] = useState(false);
  const rulesRef = doc(db, 'workspaces', WS, 'recognitionSettings', orgId);

  const years = useMemo(() => { const y = now.getFullYear(); return [y, y - 1, y - 2, y - 3]; }, [now]);
  const campaignId = `${orgId}__${year}`;

  // Chargement des critères paramétrés de l'agence.
  useEffect(() => {
    const unsub = onSnapshot(rulesRef, (s) => {
      setRules(resolveAwardRules(s.exists() ? s.data().awardRules : null));
      setRulesDirty(false);
    }, () => setRules(resolveAwardRules(null)));
    return unsub;
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Distinctions déjà enregistrées pour l'année.
  useEffect(() => {
    const q = query(collection(db, 'workspaces', WS, 'tenantAwards'), where('orgId', '==', orgId), where('year', '==', year));
    const unsub = onSnapshot(q, (snap) => {
      const map = {};
      snap.docs.forEach(d => { const a = { id: d.id, ...d.data() }; map[String(a.tenantId)] = a; });
      setSaved(map);
    }, () => {});
    const unsubC = onSnapshot(doc(db, 'workspaces', WS, 'awardCampaigns', campaignId),
      (s) => setCampaign(s.exists() ? { id: s.id, ...s.data() } : null), () => {});
    return () => { unsub(); unsubC(); };
  }, [orgId, year]); // eslint-disable-line react-hooks/exhaustive-deps

  function setRuleField(awardKey, field, value) {
    setRules(prev => ({ ...prev, [awardKey]: { ...prev[awardKey], [field]: value } }));
    setRulesDirty(true);
  }

  async function saveRules() {
    setBusy(true); setMsg('');
    try {
      await setDoc(rulesRef, { orgId, awardRules: rules, updated_at: new Date().toISOString(), updated_by: String(user?.id || '') }, { merge: true });
      await logAudit(null, 'CRITERES_MODIFIES', 'Critères des distinctions mis à jour');
      setRulesDirty(false);
      setMsg('Critères enregistrés. Relancez l\'évaluation pour les appliquer.'); setTimeout(() => setMsg(''), 5000);
    } catch (e) { setMsg('Échec enregistrement critères : ' + (e?.code || e?.message)); }
    finally { setBusy(false); }
  }

  function resetRules() {
    if (!window.confirm('Rétablir les critères par défaut (non enregistré tant que vous ne cliquez pas « Enregistrer les critères ») ?')) return;
    setRules(resolveAwardRules(null)); setRulesDirty(true);
  }

  function runEvaluation() {
    setBusy(true); setMsg('');
    try {
      const contracts = state.contracts || [];
      const activeTenants = (state.tenants || []).filter(t => isActiveTenant(t, contracts));
      const res = evaluateAll({ tenants: activeTenants, contracts, payments: state.payments || [], year, rules, now });
      setResults(res);
      setMsg(`Évaluation terminée : ${res.length} locataire(s) actif(s) analysé(s).`);
      setTimeout(() => setMsg(''), 4000);
    } catch (e) { setMsg('Erreur : ' + (e?.message || e)); }
    finally { setBusy(false); }
  }

  // Réinitialise l'évaluation affichée (n'efface rien d'enregistré).
  function resetEvaluation() {
    setResults(null); setOpen(null);
    setMsg('Évaluation réinitialisée. Vous pouvez relancer une nouvelle évaluation.'); setTimeout(() => setMsg(''), 4000);
  }

  // Supprime la campagne de l'année : distinctions, fiches de vérification, doc campagne.
  async function deleteCampaign() {
    const items = Object.values(saved);
    if (!items.length && !campaign) { setMsg('Aucune campagne enregistrée pour cette année.'); setTimeout(() => setMsg(''), 4000); return; }
    const nbPub = items.filter(a => a.status === 'publiee').length;
    if (!window.confirm(`Supprimer DÉFINITIVEMENT la campagne ${year} ?\n\n• ${items.length} distinction(s) enregistrée(s)${nbPub ? ` (dont ${nbPub} publiée(s))` : ''}\n• Les certificats publiés ne seront plus vérifiables.\n\nCette action est irréversible.`)) return;
    setBusy(true); setMsg('');
    try {
      const batch = writeBatch(db);
      items.forEach(a => {
        batch.delete(doc(db, 'workspaces', WS, 'tenantAwards', a.id));
        // La fiche de vérification publique n'existe QUE pour les distinctions
        // publiées. Supprimer une fiche inexistante ferait échouer tout le lot
        // (la règle refuse la suppression d'un document absent).
        if (a.status === 'publiee' && a.certificate_number) batch.delete(doc(db, 'workspaces', WS, 'certificateVerify', a.certificate_number));
      });
      batch.delete(doc(db, 'workspaces', WS, 'awardCampaigns', campaignId));
      await batch.commit();
      await logAudit(null, 'CAMPAGNE_SUPPRIMEE', `Campagne ${year} supprimée (${items.length} distinctions)`);
      setResults(null); setOpen(null);
      setMsg(`Campagne ${year} supprimée. Vous pouvez repartir de zéro.`); setTimeout(() => setMsg(''), 5000);
    } catch (e) { setMsg('Échec suppression : ' + (e?.code || e?.message)); }
    finally { setBusy(false); }
  }

  async function logAudit(award_id, action, reason) {
    try {
      await addDoc(collection(db, 'workspaces', WS, 'awardAuditLogs'), {
        orgId, award_id: award_id || null, administrator_id: String(user?.id || ''), administrator_name: user?.name || '',
        action, reason: reason || '', year, created_at: new Date().toISOString(),
      });
    } catch { /* non bloquant */ }
  }

  // Enregistre la campagne + les distinctions éligibles (statut « en attente »).
  async function saveCampaign() {
    if (!results) { setMsg('Lancez d\'abord une évaluation.'); return; }
    setBusy(true); setMsg('');
    try {
      const eligibles = results.filter(r => r.eligible);
      const batch = writeBatch(db);
      const nowIso = new Date().toISOString();
      eligibles.forEach(r => {
        const id = `${orgId}__${year}__${r.tenantId}`;
        batch.set(doc(db, 'workspaces', WS, 'tenantAwards', id), {
          id, orgId, year, tenantId: String(r.tenantId), tenantName: r.tenantName, property: r.property,
          tenantPhone: (state.tenants || []).find(t => String(t.id) === String(r.tenantId))?.phone || '',
          award_type: r.eligible, label: r.label, payment_score: r.score,
          certificate_number: `MR-${year}-${orgId}-${r.tenantId}`.replace(/[^A-Za-z0-9-]/g, ''),
          criteria_snapshot: { stats: r.stats, anciennete: r.anciennete, met: r.criteriaMet, failed: r.criteriaFailed },
          status: 'en_attente', awarded_at: null, created_at: nowIso, updated_at: nowIso,
        }, { merge: true });
      });
      const counts = countsOf(results);
      batch.set(doc(db, 'workspaces', WS, 'awardCampaigns', campaignId), {
        id: campaignId, orgId, year, status: 'Évaluée', started_at: nowIso,
        created_by: String(user?.id || ''), counts,
      }, { merge: true });
      await batch.commit();
      await logAudit(null, 'CAMPAGNE_ENREGISTREE', `${eligibles.length} distinctions proposées`);
      setMsg(`Campagne enregistrée : ${eligibles.length} distinction(s) en attente de validation.`);
      setTimeout(() => setMsg(''), 5000);
    } catch (e) { setMsg('Échec de l\'enregistrement : ' + (e?.code || e?.message)); }
    finally { setBusy(false); }
  }

  const baseUrl = (typeof window !== 'undefined') ? (window.location.origin + window.location.pathname) : '';
  const orgSettings = state.orgSettings || {};

  // Téléphones des locataires (pour la notification WhatsApp).
  const phoneMap = useMemo(() => {
    const m = {};
    (state.tenants || []).forEach(t => { if (t?.id != null) m[String(t.id)] = t.phone || t.telephone || ''; });
    return m;
  }, [state.tenants]);

  // Message de félicitations WhatsApp (sans aucune donnée financière).
  function waMessage(a) {
    const verif = `${baseUrl}#/certificat/${a.certificate_number}`;
    const company = orgSettings?.companyName || 'Minsouah Immobilier';
    return encodeURIComponent(
      `Bonjour ${a.tenantName},\n\n` +
      `Félicitations ! 🎉 Pour l'exercice ${a.year}, Minsouah vous décerne la distinction « ${a.label} ».\n` +
      `Votre sérieux mérite d'être reconnu.\n\n` +
      `Vous pouvez consulter et vérifier votre certificat ici :\n${verif}\n\n` +
      `Avec toute notre reconnaissance,\n— ${company}`
    );
  }

  // Ouvre WhatsApp pré-rempli pour un locataire (notification manuelle, un clic).
  function notifyWA(a) {
    const phone = phoneForWA(phoneMap[String(a.tenantId)] || a.tenantPhone || '');
    if (!phone) { setMsg(`Aucun numéro enregistré pour ${a.tenantName}.`); setTimeout(() => setMsg(''), 4000); return; }
    window.open(`https://wa.me/${phone}?text=${waMessage(a)}`, '_blank');
  }

  // Notifie tous les locataires des distinctions publiées (ouvre WhatsApp en série).
  function notifyAllWA() {
    const published = Object.values(saved).filter(a => a.status === 'publiee');
    const withPhone = published.filter(a => phoneForWA(phoneMap[String(a.tenantId)] || a.tenantPhone || ''));
    if (!withPhone.length) { setMsg('Aucun locataire publié avec numéro WhatsApp.'); setTimeout(() => setMsg(''), 4000); return; }
    if (!window.confirm(`Ouvrir WhatsApp pour notifier ${withPhone.length} locataire(s) ? (${published.length - withPhone.length} sans numéro seront ignorés)`)) return;
    withPhone.forEach((a, i) => setTimeout(() => window.open(`https://wa.me/${phoneForWA(phoneMap[String(a.tenantId)] || a.tenantPhone || '')}?text=${waMessage(a)}`, '_blank'), i * 700));
  }

  // Crée/complète la fiche de vérification publique pour qu'un certificat GÉNÉRÉ
  // (même avant publication groupée) soit vérifiable au scan du QR. Sans ça, le
  // scan renvoyait « Certificat introuvable ».
  async function ensureCertVerify(award) {
    const num = award.certificate_number || `MR-${award.year}-${award.tenantId}`;
    try {
      await setDoc(doc(db, 'workspaces', WS, 'certificateVerify', num), {
        certificate_number: num, tenantName: award.tenantName, label: award.label,
        award_type: award.award_type, year: award.year, property: award.property || '',
        orgId, valid: true, generated_at: new Date().toISOString(),
      }, { merge: true });
    } catch { /* la vérification publique reste optionnelle */ }
  }

  async function genCertPDF(award) {
    const win = window.open('', '_blank', 'width=1150,height=820'); // geste utilisateur → non bloqué
    try {
      ensureCertVerify(award);
      const { svg } = await buildCertificate(award, orgSettings, baseUrl);
      if (win) { win.document.write(certificateHTML(svg, `Certificat ${award.tenantName}`)); win.document.close(); }
      else { await genCertPNG(award); setMsg('Fenêtre bloquée : certificat téléchargé en image.'); setTimeout(() => setMsg(''), 6000); }
    } catch (e) { if (win) win.close(); setMsg('Certificat : ' + (e?.message || e)); }
  }

  async function genCertPNG(award) {
    try {
      ensureCertVerify(award);
      const { svg } = await buildCertificate(award, orgSettings, baseUrl);
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      const scale = 2, canvas = document.createElement('canvas');
      canvas.width = 1123 * scale; canvas.height = 794 * scale;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height); URL.revokeObjectURL(url);
      canvas.toBlob((b) => { const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `Certificat_${(award.tenantName || '').replace(/[^a-zA-Z0-9]+/g, '_')}_${award.year}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1500); }, 'image/png');
    } catch (e) { setMsg('Image : ' + (e?.message || e)); }
  }

  // Publie les distinctions validées : statut « publiee » + fiche de vérification publique.
  async function publishAll() {
    const toPublish = Object.values(saved).filter(a => a.status === 'validee');
    if (!toPublish.length) { setMsg('Aucune distinction validée à publier.'); return; }
    if (!window.confirm(`Publier ${toPublish.length} distinction(s) ? Les locataires pourront les consulter et les certificats deviendront vérifiables.`)) return;
    setBusy(true);
    try {
      const batch = writeBatch(db); const nowIso = new Date().toISOString();
      toPublish.forEach(a => {
        batch.set(doc(db, 'workspaces', WS, 'tenantAwards', a.id), { status: 'publiee', published_at: nowIso }, { merge: true });
        batch.set(doc(db, 'workspaces', WS, 'certificateVerify', a.certificate_number), {
          certificate_number: a.certificate_number, tenantName: a.tenantName, label: a.label,
          award_type: a.award_type, year: a.year, property: a.property || '', orgId, valid: true, published_at: nowIso,
        }, { merge: true });
      });
      batch.set(doc(db, 'workspaces', WS, 'awardCampaigns', campaignId), { status: 'Publiée', published_at: nowIso }, { merge: true });
      await batch.commit();
      await logAudit(null, 'PUBLICATION', `${toPublish.length} distinctions publiées`);
      setMsg(`${toPublish.length} distinction(s) publiée(s). Les locataires sont notifiés dans l'app (cloche « Mes distinctions »). Utilisez « Notifier tous (WhatsApp) » pour les prévenir aussi par message.`); setTimeout(() => setMsg(''), 9000);
    } catch (e) { setMsg('Échec publication : ' + (e?.code || e?.message)); }
    finally { setBusy(false); }
  }

  // ── Phase 7 : clôture / réouverture de la campagne annuelle ──
  async function closeCampaign() {
    if (!window.confirm(`Clôturer la campagne ${year} ?\n\nUne fois clôturée, l'évaluation et les modifications sont verrouillées (aucun recalcul). Les distinctions publiées restent consultables et vérifiables. Vous pourrez rouvrir si nécessaire.`)) return;
    setBusy(true);
    try {
      await setDoc(doc(db, 'workspaces', WS, 'awardCampaigns', campaignId), { id: campaignId, orgId, year, status: 'Clôturée', closed_at: new Date().toISOString(), closed_by: String(user?.id || '') }, { merge: true });
      await logAudit(null, 'CLOTURE', `Campagne ${year} clôturée`);
      setResults(null);
      setMsg(`Campagne ${year} clôturée et verrouillée.`); setTimeout(() => setMsg(''), 5000);
    } catch (e) { setMsg('Échec clôture : ' + (e?.code || e?.message)); }
    finally { setBusy(false); }
  }
  async function reopenCampaign() {
    if (!window.confirm(`Rouvrir la campagne ${year} ? Les modifications redeviennent possibles.`)) return;
    setBusy(true);
    try {
      const back = Object.values(saved).some(a => a.status === 'publiee') ? 'Publiée'
        : Object.values(saved).some(a => a.status === 'validee') ? 'Validée'
        : Object.keys(saved).length ? 'Évaluée' : 'Ouverte';
      await setDoc(doc(db, 'workspaces', WS, 'awardCampaigns', campaignId), { status: back, reopened_at: new Date().toISOString() }, { merge: true });
      await logAudit(null, 'REOUVERTURE', `Campagne ${year} rouverte`);
      setMsg(`Campagne ${year} rouverte (${back}).`); setTimeout(() => setMsg(''), 4000);
    } catch (e) { setMsg('Échec réouverture : ' + (e?.code || e?.message)); }
    finally { setBusy(false); }
  }

  async function validateOne(tenantId) {
    const a = saved[String(tenantId)]; if (!a) return;
    try {
      await setDoc(doc(db, 'workspaces', WS, 'tenantAwards', a.id), { status: 'validee', awarded_at: new Date().toISOString() }, { merge: true });
      await logAudit(a.id, 'VALIDATION_INDIVIDUELLE', '');
    } catch (e) { setMsg('Échec : ' + (e?.code || e?.message)); }
  }

  async function validateAll() {
    const pending = Object.values(saved).filter(a => a.status === 'en_attente');
    if (!pending.length) { setMsg('Aucune distinction en attente.'); return; }
    if (!window.confirm(`Valider les ${pending.length} distinction(s) en attente ?`)) return;
    setBusy(true);
    try {
      const batch = writeBatch(db); const nowIso = new Date().toISOString();
      pending.forEach(a => batch.set(doc(db, 'workspaces', WS, 'tenantAwards', a.id), { status: 'validee', awarded_at: nowIso }, { merge: true }));
      batch.set(doc(db, 'workspaces', WS, 'awardCampaigns', campaignId), { status: 'Validée', validated_at: nowIso }, { merge: true });
      await batch.commit();
      await logAudit(null, 'VALIDATION_GLOBALE', `${pending.length} distinctions validées`);
      setMsg(`${pending.length} distinction(s) validée(s).`); setTimeout(() => setMsg(''), 4000);
    } catch (e) { setMsg('Échec : ' + (e?.code || e?.message)); }
    finally { setBusy(false); }
  }

  const counts = useMemo(() => results ? countsOf(results) : null, [results]);
  const rows = results || [];
  const isClosed = campaign?.status === 'Clôturée';
  const savedList = Object.values(saved);
  const stage = isClosed ? 'Clôturée'
    : savedList.some(a => a.status === 'publiee') ? 'Publiée'
    : savedList.some(a => a.status === 'validee') ? 'Validée'
    : savedList.length ? 'Évaluée' : 'Ouverte';
  const nextStep = {
    Ouverte: 'Lancez l\'évaluation, puis enregistrez la campagne.',
    Évaluée: 'Validez les distinctions proposées (bouton « Tout valider »).',
    Validée: 'Publiez les distinctions validées (bouton « Publier »).',
    Publiée: 'Notifiez les locataires, puis clôturez la campagne quand tout est fait.',
    Clôturée: 'Campagne verrouillée. Rouvrez-la si une correction est nécessaire.',
  }[stage];

  return (
    <div className="flex flex-col gap-md">
      <div>
        <h2 className="font-bold text-on-surface text-lg flex items-center gap-2"><Icon name="verified" size={22} className="text-primary" /> Minsouah Reconnaissance</h2>
        <p className="text-sm text-on-surface-variant mt-0.5 italic">« Votre sérieux mérite d'être reconnu. » {agencyName ? `— ${agencyName}` : ''}</p>
      </div>

      <div className="bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant/20 p-md flex flex-wrap items-end gap-md">
        <div>
          <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">Année</label>
          <select value={year} onChange={e => { setYear(Number(e.target.value)); setResults(null); }} className="border border-outline-variant rounded-lg px-3 py-2 text-sm bg-surface-container-lowest focus:outline-none focus:border-primary">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button onClick={runEvaluation} disabled={busy || isClosed} title={isClosed ? 'Campagne clôturée — rouvrez-la pour réévaluer' : ''} className="inline-flex items-center gap-2 bg-primary text-on-primary font-semibold rounded-lg px-4 py-2.5 text-sm hover:bg-primary/90 disabled:opacity-50">
          {busy ? <><Icon name="progress_activity" size={18} className="animate-spin" /> …</> : <><Icon name="auto_awesome" size={18} /> Lancer l'évaluation</>}
        </button>
        <button onClick={() => setShowRules(v => !v)} className="inline-flex items-center gap-2 bg-surface-container-high text-on-surface font-semibold rounded-lg px-4 py-2.5 text-sm hover:bg-outline-variant/30"><Icon name="tune" size={18} /> Paramètres des critères</button>
        {results && !isClosed && <button onClick={resetEvaluation} disabled={busy} className="inline-flex items-center gap-2 bg-surface-container-high text-on-surface font-semibold rounded-lg px-4 py-2.5 text-sm hover:bg-outline-variant/30"><Icon name="restart_alt" size={18} /> Réinitialiser</button>}
        {results && !isClosed && <button onClick={saveCampaign} disabled={busy} className="inline-flex items-center gap-2 bg-surface-container-high text-on-surface font-semibold rounded-lg px-4 py-2.5 text-sm hover:bg-outline-variant/30"><Icon name="save" size={18} /> Enregistrer la campagne</button>}
        {!isClosed && Object.values(saved).some(a => a.status === 'en_attente') && <button onClick={validateAll} disabled={busy} className="inline-flex items-center gap-2 bg-green-100 text-green-700 font-semibold rounded-lg px-4 py-2.5 text-sm hover:bg-green-200"><Icon name="verified" size={18} /> Tout valider</button>}
        {!isClosed && Object.values(saved).some(a => a.status === 'validee') && <button onClick={publishAll} disabled={busy} className="inline-flex items-center gap-2 bg-blue-100 text-blue-800 font-semibold rounded-lg px-4 py-2.5 text-sm hover:bg-blue-200"><Icon name="campaign" size={18} /> Publier</button>}
        {Object.values(saved).some(a => a.status === 'publiee') && <button onClick={notifyAllWA} className="inline-flex items-center gap-2 bg-green-100 text-green-700 font-semibold rounded-lg px-4 py-2.5 text-sm hover:bg-green-200"><Icon name="chat" size={18} /> Notifier tous (WhatsApp)</button>}
        {!isClosed && Object.values(saved).some(a => a.status === 'publiee') && <button onClick={closeCampaign} disabled={busy} className="inline-flex items-center gap-2 bg-slate-200 text-slate-800 font-semibold rounded-lg px-4 py-2.5 text-sm hover:bg-slate-300"><Icon name="lock" size={18} /> Clôturer la campagne</button>}
        {isClosed && <button onClick={reopenCampaign} disabled={busy} className="inline-flex items-center gap-2 bg-amber-100 text-amber-800 font-semibold rounded-lg px-4 py-2.5 text-sm hover:bg-amber-200"><Icon name="lock_open" size={18} /> Rouvrir la campagne</button>}
        {!isClosed && (Object.keys(saved).length > 0 || campaign) && <button onClick={deleteCampaign} disabled={busy} className="inline-flex items-center gap-2 bg-red-50 text-red-700 font-semibold rounded-lg px-4 py-2.5 text-sm hover:bg-red-100"><Icon name="delete" size={18} /> Supprimer la campagne {year}</button>}
        {campaign && <span className="text-xs text-on-surface-variant">Campagne {year} : <b>{campaign.status}</b></span>}
        {msg && <span className="text-xs text-on-surface-variant">{msg}</span>}
      </div>

      {/* ── Suivi de campagne (Phase 7) ── */}
      <div className={`rounded-xl border p-3 flex items-start gap-3 ${isClosed ? 'bg-slate-50 border-slate-200' : 'bg-primary/5 border-primary/20'}`}>
        <Icon name={isClosed ? 'lock' : 'flag'} size={20} className={isClosed ? 'text-slate-600' : 'text-primary'} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {['Ouverte', 'Évaluée', 'Validée', 'Publiée', 'Clôturée'].map((s, i, arr) => {
              const active = s === stage; const done = arr.indexOf(stage) > i;
              return <span key={s} className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${active ? 'bg-primary text-on-primary' : done ? 'bg-green-100 text-green-700' : 'bg-surface-container-high text-on-surface-variant'}`}>{done && <Icon name="check" size={12} />}{s}</span>;
            })}
          </div>
          <p className="text-xs text-on-surface-variant mt-1.5"><b>Prochaine étape :</b> {nextStep}</p>
        </div>
      </div>

      {/* ── Paramètres des critères (par distinction) ── */}
      {showRules && (
        <div className="bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant/20 p-md">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div>
              <h3 className="font-bold text-on-surface text-sm flex items-center gap-2"><Icon name="tune" size={18} className="text-primary" /> Paramètres des critères</h3>
              <p className="text-xs text-on-surface-variant mt-0.5">Réglez les conditions de chaque distinction. L'évaluation attribue, à chaque locataire, la distinction la plus élevée dont <b>tous</b> les critères sont remplis (ordre : Partenaire → Excellence → Exemplaire → Fidèle → Régulier).</p>
            </div>
            <div className="flex gap-2">
              <button onClick={resetRules} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-outline-variant text-on-surface hover:bg-surface-container-high"><Icon name="restart_alt" size={16} /> Valeurs par défaut</button>
              <button onClick={saveRules} disabled={busy || !rulesDirty} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-primary text-on-primary hover:bg-primary/90 disabled:opacity-40"><Icon name="save" size={16} /> Enregistrer les critères</button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {AWARD_DEFS.map(def => {
              const r = rules[def.key] || DEFAULT_AWARD_RULES[def.key];
              return (
                <div key={def.key} className="rounded-xl border p-3" style={{ borderColor: def.color + '40', background: def.color + '08' }}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-bold text-sm flex items-center gap-1.5" style={{ color: def.color }}>{def.emoji} {def.label}</p>
                    <label className="inline-flex items-center gap-1 text-xs font-semibold cursor-pointer">
                      <input type="checkbox" checked={r.enabled !== false} onChange={e => setRuleField(def.key, 'enabled', e.target.checked)} />
                      {r.enabled !== false ? 'Activée' : 'Désactivée'}
                    </label>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {AWARD_RULE_FIELDS.filter(f => f.key !== 'enabled').map(f => (
                      <div key={f.key} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-on-surface-variant">{f.label}</span>
                        {f.type === 'bool'
                          ? <input type="checkbox" checked={!!r[f.key]} onChange={e => setRuleField(def.key, f.key, e.target.checked)} />
                          : <input type="number" min="0" value={r[f.key] ?? 0} onChange={e => setRuleField(def.key, f.key, Math.max(0, Number(e.target.value) || 0))} className="w-16 border border-outline-variant rounded-md px-2 py-1 text-xs text-right bg-surface-container-lowest focus:outline-none focus:border-primary" />}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {rulesDirty && <p className="text-xs text-amber-700 mt-2">Modifications non enregistrées — cliquez « Enregistrer les critères », puis relancez l'évaluation.</p>}
        </div>
      )}

      {counts && (
        <section className="grid grid-cols-2 lg:grid-cols-7 gap-md">
          <Kpi l="Évalués" v={counts.total} c="text-on-surface" />
          <Kpi l="Éligibles" v={counts.eligibles} c="text-green-700" />
          {AWARD_DEFS.map(a => <Kpi key={a.key} l={a.label.replace('Locataire ', '')} v={counts[a.key] || 0} c="text-primary" />)}
        </section>
      )}

      {results && (
        <div className="bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant/20 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-secondary text-on-primary">
                <tr>{['Locataire / Bien', 'Ancienneté', 'Score', 'Distinction proposée', 'Statut', 'Détail / Action'].map(h => <th key={h} className="px-4 py-3 text-xs font-bold uppercase tracking-wider">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {rows.map(r => {
                  const a = AWARD_BY_KEY[r.eligible];
                  const sv = saved[String(r.tenantId)];
                  return (
                    <>
                      <tr key={r.tenantId} className="hover:bg-surface-container-low align-top">
                        <td className="px-4 py-3"><p className="font-semibold text-sm text-on-surface">{r.tenantName}</p><p className="text-xs text-on-surface-variant">{r.property}</p></td>
                        <td className="px-4 py-3 text-sm">{r.anciennete} an(s)</td>
                        <td className="px-4 py-3 text-sm font-semibold">{r.score}%</td>
                        <td className="px-4 py-3">{a
                          ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: a.color + '22', color: a.color }}>{a.emoji} {a.label}</span>
                          : <span className="text-xs text-on-surface-variant">Non éligible</span>}</td>
                        <td className="px-4 py-3">{sv
                          ? <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${sv.status === 'validee' ? 'bg-green-100 text-green-700' : sv.status === 'publiee' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>{sv.status === 'validee' ? 'Validée' : sv.status === 'publiee' ? 'Publiée' : 'En attente'}</span>
                          : <span className="text-xs text-on-surface-variant">—</span>}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5">
                            <button onClick={() => setOpen(open === r.tenantId ? null : r.tenantId)} className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-outline-variant text-on-surface hover:bg-surface-container-high">Détail</button>
                            {!isClosed && sv && sv.status === 'en_attente' && <button onClick={() => validateOne(r.tenantId)} className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-green-100 text-green-700 hover:bg-green-200">Valider</button>}
                            {sv && (sv.status === 'validee' || sv.status === 'publiee') && <>
                              <button onClick={() => genCertPDF(sv)} className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-amber-300 text-amber-800 hover:bg-amber-50">Certif. PDF</button>
                              <button onClick={() => genCertPNG(sv)} className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-outline-variant text-on-surface hover:bg-surface-container-high">PNG</button>
                            </>}
                            {sv && sv.status === 'publiee' && <button onClick={() => notifyWA(sv)} className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-green-100 text-green-700 hover:bg-green-200">WhatsApp</button>}
                          </div>
                        </td>
                      </tr>
                      {open === r.tenantId && (
                        <tr key={r.tenantId + '-d'} className="bg-surface-container-low">
                          <td colSpan={6} className="px-4 py-3">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                              <div><p className="font-semibold text-on-surface mb-1">Statistiques {year}</p>
                                <ul className="text-on-surface-variant space-y-0.5">
                                  <li>Début de contrat : {r.stats.contractStart} · Ancienneté : {r.anciennete} an(s)</li>
                                  <li>Période évaluée : {r.stats.periode} <span className="text-on-surface-variant/70">(depuis la 1ʳᵉ quittance)</span></li>
                                  <li>Échéances exigibles : {r.stats.nbExigible}</li>
                                  <li>Payées : {r.stats.nbPaid} · En retard (régularisés) : {r.stats.nbLate}</li>
                                  <li>Partiels : {r.stats.nbPartial} · Impayés : {r.stats.nbUnpaid}</li>
                                  <li>Solde dû : {fNum(r.stats.soldeDu)} FCFA · Année complète : {r.stats.fullYear ? 'oui' : 'non'}</li>
                                </ul></div>
                              <div><p className="font-semibold text-green-700 mb-1">Critères remplis</p><ul className="text-on-surface-variant space-y-0.5">{(r.criteriaMet || []).map((c, i) => <li key={i}>✓ {c}</li>)}</ul></div>
                              <div><p className="font-semibold text-red-700 mb-1">Non remplis / motifs</p><ul className="text-on-surface-variant space-y-0.5">{(r.criteriaFailed || []).length ? r.criteriaFailed.map((c, i) => <li key={i}>✗ {c}</li>) : <li>—</li>}</ul></div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!results && (
        <div className="bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant/20 p-lg text-center text-on-surface-variant">
          <Icon name="verified" size={40} className="opacity-30 mb-2" />
          <p>Choisissez une année et cliquez sur <b>« Lancer l'évaluation »</b>.</p>
          <p className="text-xs mt-1">Le moteur analyse les paiements réels de chaque locataire et propose une distinction, soumise à votre validation avant publication.</p>
        </div>
      )}
    </div>
  );
}

function Kpi({ l, v, c }) {
  return <div className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20"><p className="text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold truncate">{l}</p><p className={`font-bold mt-0.5 text-lg ${c}`}>{v}</p></div>;
}

function countsOf(results) {
  const c = { total: results.length, eligibles: 0 };
  AWARD_DEFS.forEach(a => c[a.key] = 0);
  results.forEach(r => { if (r.eligible) { c.eligibles++; c[r.eligible] = (c[r.eligible] || 0) + 1; } });
  return c;
}
