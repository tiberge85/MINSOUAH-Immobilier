import { useState, useMemo, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, setDoc, writeBatch, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';
import { evaluateAll, AWARD_DEFS, AWARD_BY_KEY, DEFAULT_RULES } from '../lib/recognition';
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

  const years = useMemo(() => { const y = now.getFullYear(); return [y, y - 1, y - 2, y - 3]; }, [now]);
  const campaignId = `${orgId}__${year}`;

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

  function runEvaluation() {
    setBusy(true); setMsg('');
    try {
      const res = evaluateAll({ tenants: state.tenants || [], contracts: state.contracts || [], payments: state.payments || [], year, rules: DEFAULT_RULES, now });
      setResults(res);
      setMsg(`Évaluation terminée : ${res.length} locataire(s) analysé(s).`);
      setTimeout(() => setMsg(''), 4000);
    } catch (e) { setMsg('Erreur : ' + (e?.message || e)); }
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

  async function genCertPDF(award) {
    try {
      const { svg } = await buildCertificate(award, orgSettings, baseUrl);
      const win = window.open('', '_blank', 'width=1150,height=820');
      if (win) { win.document.write(certificateHTML(svg, `Certificat ${award.tenantName}`)); win.document.close(); }
      else alert('Autorisez les pop-ups pour le certificat.');
    } catch (e) { setMsg('Certificat : ' + (e?.message || e)); }
  }

  async function genCertPNG(award) {
    try {
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

  return (
    <div className="flex flex-col gap-md">
      <div>
        <h2 className="font-bold text-on-surface text-lg flex items-center gap-2"><Icon name="workspace_premium" size={22} className="text-primary" /> Minsouah Reconnaissance</h2>
        <p className="text-sm text-on-surface-variant mt-0.5 italic">« Votre sérieux mérite d'être reconnu. » {agencyName ? `— ${agencyName}` : ''}</p>
      </div>

      <div className="bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant/20 p-md flex flex-wrap items-end gap-md">
        <div>
          <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">Année</label>
          <select value={year} onChange={e => { setYear(Number(e.target.value)); setResults(null); }} className="border border-outline-variant rounded-lg px-3 py-2 text-sm bg-surface-container-lowest focus:outline-none focus:border-primary">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button onClick={runEvaluation} disabled={busy} className="inline-flex items-center gap-2 bg-primary text-on-primary font-semibold rounded-lg px-4 py-2.5 text-sm hover:bg-primary/90 disabled:opacity-50">
          {busy ? <><Icon name="progress_activity" size={18} className="animate-spin" /> …</> : <><Icon name="auto_awesome" size={18} /> Lancer l'évaluation</>}
        </button>
        {results && <button onClick={saveCampaign} disabled={busy} className="inline-flex items-center gap-2 bg-surface-container-high text-on-surface font-semibold rounded-lg px-4 py-2.5 text-sm hover:bg-outline-variant/30"><Icon name="save" size={18} /> Enregistrer la campagne</button>}
        {Object.values(saved).some(a => a.status === 'en_attente') && <button onClick={validateAll} disabled={busy} className="inline-flex items-center gap-2 bg-green-100 text-green-700 font-semibold rounded-lg px-4 py-2.5 text-sm hover:bg-green-200"><Icon name="verified" size={18} /> Tout valider</button>}
        {Object.values(saved).some(a => a.status === 'validee') && <button onClick={publishAll} disabled={busy} className="inline-flex items-center gap-2 bg-blue-100 text-blue-800 font-semibold rounded-lg px-4 py-2.5 text-sm hover:bg-blue-200"><Icon name="campaign" size={18} /> Publier</button>}
        {Object.values(saved).some(a => a.status === 'publiee') && <button onClick={notifyAllWA} className="inline-flex items-center gap-2 bg-green-100 text-green-700 font-semibold rounded-lg px-4 py-2.5 text-sm hover:bg-green-200"><Icon name="chat" size={18} /> Notifier tous (WhatsApp)</button>}
        {campaign && <span className="text-xs text-on-surface-variant">Campagne {year} : <b>{campaign.status}</b></span>}
        {msg && <span className="text-xs text-on-surface-variant">{msg}</span>}
      </div>

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
                            {sv && sv.status === 'en_attente' && <button onClick={() => validateOne(r.tenantId)} className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-green-100 text-green-700 hover:bg-green-200">Valider</button>}
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
          <Icon name="workspace_premium" size={40} className="opacity-30 mb-2" />
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
