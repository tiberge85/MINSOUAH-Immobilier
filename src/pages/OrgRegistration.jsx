import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, sendEmailVerification, deleteUser } from 'firebase/auth';
import { db, auth } from '../lib/firebase';
import { hashPwd } from '../lib/auth';
import { createLicensePayload } from '../lib/licenses';
import { PLANS, getPlan } from '../lib/planLimits';
import { isDisposableEmail } from '../lib/disposableEmails';
import Icon from '../components/Icon';

const WS = import.meta.env.VITE_FIREBASE_WORKSPACE || 'minsouah';
const wsDoc = (col, id) => doc(db, 'workspaces', WS, col, String(id));

const PLAN_CARDS = [
  {
    id: 'standard',
    highlight: false,
    limits: ['2 utilisateurs', '10 biens', '30 locataires'],
    included: ['Gestion biens', 'Locataires', 'Paiements', 'Notifications'],
    excluded: ['Export avancé', 'Analytics', 'API'],
  },
  {
    id: 'pro',
    highlight: true,
    limits: ['5 utilisateurs', '150 biens', '1000 locataires'],
    included: ['Tout Standard', 'Rapports financiers', 'Export PDF/Excel', 'Dashboard temps réel', 'Logs activité'],
    excluded: ['Multi-agences', 'API', 'IA analytics'],
  },
  {
    id: 'enterprise',
    highlight: false,
    limits: ['Utilisateurs illimités', 'Biens illimités', 'Locataires illimités'],
    included: ['Tout Pro', 'Multi-agences', 'API privée', 'IA analytics', 'SLA premium', 'Support prioritaire'],
    excluded: [],
  },
];

export default function OrgRegistration() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [selectedPlan, setSelectedPlan] = useState('pro');
  const [orgForm, setOrgForm] = useState({ name: '', address: '', phone: '', email: '' });
  const [adminForm, setAdminForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [waitingVerification, setWaitingVerification] = useState(false);
  const [resendMsg, setResendMsg] = useState('');

  // Data held in memory until email is verified — never write live records before verification
  const pendingDataRef    = useRef(null);
  const fbUserRef         = useRef(null);
  const pendingOrgDocRef  = useRef(null); // Firestore ref for cleanup on cancel
  const pollingRef        = useRef(null);

  useEffect(() => () => { if (pollingRef.current) clearInterval(pollingRef.current); }, []);

  const plan = getPlan(selectedPlan);

  // ── Step 3: move pending → live collections once email is verified ────────
  const commitToFirestore = async () => {
    if (!fbUserRef.current?.emailVerified) {
      setResendMsg("Email pas encore vérifié. Cliquez sur le lien dans votre boîte mail.");
      return;
    }
    // Force JWT refresh so Firestore rules see email_verified: true
    await fbUserRef.current.getIdToken(true);

    const { orgId, orgData, adminId, adminData, license, now } = pendingDataRef.current;
    const fbUser = fbUserRef.current;

    // These writes are now gated by email_verified == true in Firestore rules
    await setDoc(wsDoc('organizations', orgId), orgData);
    await setDoc(wsDoc('licenses', license.key), { ...license, id: license.key });
    await setDoc(wsDoc('users', adminId), adminData);
    await setDoc(doc(db, 'workspaces', WS, 'usersByUid', fbUser.uid), {
      userId: String(adminId), orgId, role: 'ORGANIZATION_ADMIN', updatedAt: now,
    }, { merge: true }).catch(console.warn);

    // Remove the pending record
    if (pendingOrgDocRef.current) deleteDoc(pendingOrgDocRef.current).catch(() => {});

    setEmailSent(true);
    setWaitingVerification(false);
  };

  const startPolling = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        await fbUserRef.current?.reload();
        if (fbUserRef.current?.emailVerified) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
          await commitToFirestore();
        }
      } catch { /* ignore network blips */ }
    }, 4000);
  };

  const handleCheckNow = async () => {
    setLoading(true);
    setResendMsg('');
    try {
      await fbUserRef.current?.reload();
      if (fbUserRef.current?.emailVerified) {
        if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
        await commitToFirestore();
      } else {
        setResendMsg("Email pas encore vérifié. Cliquez sur le lien dans votre boîte mail.");
      }
    } catch {
      setResendMsg("Erreur de connexion. Réessayez.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    try {
      await sendEmailVerification(fbUserRef.current);
      setResendMsg("Email renvoyé !");
    } catch {
      setResendMsg("Erreur lors de l'envoi — réessayez dans 1 minute.");
    }
  };

  const handleCancelVerification = async () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    try { if (pendingOrgDocRef.current) await deleteDoc(pendingOrgDocRef.current); } catch { /* ignore */ }
    try { if (fbUserRef.current) await deleteUser(fbUserRef.current); } catch { /* ignore */ }
    fbUserRef.current = null;
    pendingDataRef.current = null;
    pendingOrgDocRef.current = null;
    setWaitingVerification(false);
    setResendMsg('');
  };

  // ── Step 1: create Firebase Auth + write pendingOrg + start polling ────────
  const handleRegister = async () => {
    if (adminForm.password.length < 8) { setError('Mot de passe : 8 caractères minimum.'); return; }
    if (adminForm.password !== adminForm.confirm) { setError('Les mots de passe ne correspondent pas.'); return; }
    if (!adminForm.name.trim() || !adminForm.email.trim()) { setError('Nom et email requis.'); return; }
    if (!orgForm.name.trim()) { setError("Nom de l'organisation requis."); return; }

    const emailLow = adminForm.email.trim().toLowerCase();

    if (isDisposableEmail(emailLow)) {
      setError("Les adresses email temporaires/jetables ne sont pas acceptées. Utilisez une adresse professionnelle valide.");
      return;
    }

    setLoading(true);
    setError('');
    try {
      // Step 1: Firebase Auth account (signs in as the new user)
      const fbCred = await createUserWithEmailAndPassword(auth, emailLow, adminForm.password);
      fbUserRef.current = fbCred.user;

      // Step 2: Send verification email — login is blocked until this link is clicked
      await sendEmailVerification(fbCred.user);

      // Step 3: Prepare Firestore payload — held in memory until email is verified
      const orgId    = `org_${Date.now()}`;
      const adminId  = Date.now() + 1;
      const now      = new Date().toISOString();
      const initials = adminForm.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
      const hashedPwd = await hashPwd(adminForm.password);
      const license  = createLicensePayload({ orgId, plan: 'trial' });

      pendingDataRef.current = {
        orgId,
        orgData: {
          id: orgId, name: orgForm.name.trim(), address: orgForm.address,
          phone: orgForm.phone, email: orgForm.email || emailLow,
          plan: 'trial', active: true, createdAt: now, licenseKey: license.key,
        },
        adminId,
        adminData: {
          id: adminId, name: adminForm.name.trim(), email: emailLow,
          password: hashedPwd, role: 'ORGANIZATION_ADMIN', orgId, initials,
          color: 'bg-primary-container text-on-primary-container',
          personId: null, firstLogin: false, suspended: false, createdAt: now,
          lastLogin: null, failedAttempts: 0, lockedUntil: null,
          emailVerificationRequired: true,
        },
        license,
        now,
      };

      // Step 4: Write a minimal pending record to Firestore
      // This only requires sign_in_provider != 'anonymous' (no email_verified check)
      const pendingRef = wsDoc('pendingOrganizations', orgId);
      pendingOrgDocRef.current = pendingRef;
      await setDoc(pendingRef, {
        fbUid: fbCred.user.uid, orgId, adminEmail: emailLow, createdAt: now,
      });

      setWaitingVerification(true);
      startPolling();
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        setError("Cet email est déjà associé à un compte. Connectez-vous ou utilisez un autre email.");
      } else {
        setError("Erreur lors de la création : " + (err.message || 'Réessayez.'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-surface border-b border-outline-variant/20 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
            <Icon name="domain" size={20} className="text-on-primary" />
          </div>
          <div>
            <h1 className="font-black text-lg text-primary">Minsouah</h1>
            <p className="text-xs text-on-surface-variant">Créer votre organisation</p>
          </div>
        </div>
        <button onClick={() => navigate('/login')} className="text-sm text-on-surface-variant hover:text-on-surface flex items-center gap-1 transition-colors">
          <Icon name="login" size={16} /> Connexion
        </button>
      </header>

      {/* Step indicator */}
      <div className="bg-surface border-b border-outline-variant/10 px-6 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          {[{ n: 1, l: 'Plan' }, { n: 2, l: 'Organisation' }, { n: 3, l: 'Admin' }].map((s, i) => (
            <div key={s.n} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${step >= s.n ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'}`}>{s.n}</div>
              <span className={`text-sm font-medium hidden sm:block ${step === s.n ? 'text-primary font-bold' : step > s.n ? 'text-on-surface' : 'text-on-surface-variant'}`}>{s.l}</span>
              {i < 2 && <Icon name="chevron_right" size={16} className="text-outline-variant mx-1" />}
            </div>
          ))}
        </div>
      </div>

      <main className="flex-1 px-4 py-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto">

          {/* Waiting for email verification */}
          {waitingVerification && !emailSent && (
            <div className="max-w-lg mx-auto text-center">
              <div className="w-20 h-20 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Icon name="mark_email_unread" size={40} className="text-amber-700" />
              </div>
              <h2 className="text-2xl font-black text-on-surface mb-2">Vérifiez votre email</h2>
              <p className="text-on-surface-variant mb-2">
                Un lien de confirmation a été envoyé à{' '}
                <strong className="text-on-surface">{adminForm.email}</strong>.
              </p>
              <p className="text-sm text-on-surface-variant mb-6">
                Cliquez sur le lien dans l'email puis revenez ici. Votre espace sera créé automatiquement dès la vérification.
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-left text-sm text-amber-800">
                <p className="font-bold mb-1 flex items-center gap-1.5"><Icon name="shield" size={15} /> Pourquoi cette étape ?</p>
                <p>Nous vérifions que l'adresse email est réelle et vous appartient. Cela protège votre compte et empêche toute usurpation.</p>
              </div>
              <div className="flex flex-col gap-3">
                <button onClick={handleCheckNow} disabled={loading}
                  className="w-full py-3 bg-primary text-on-primary rounded-xl font-bold text-sm hover:bg-primary/90 flex items-center justify-center gap-2 disabled:opacity-60">
                  {loading
                    ? <><Icon name="progress_activity" size={18} className="animate-spin" /> Vérification…</>
                    : <><Icon name="check_circle" size={18} /> J'ai cliqué sur le lien</>}
                </button>
                <button onClick={handleResendVerification}
                  className="w-full py-3 bg-surface border border-outline-variant/30 text-on-surface-variant rounded-xl font-semibold text-sm hover:bg-surface-container flex items-center justify-center gap-2">
                  <Icon name="refresh" size={18} /> Renvoyer l'email
                </button>
                <button onClick={handleCancelVerification}
                  className="text-sm text-on-surface-variant hover:text-on-surface underline mt-1">
                  Annuler et recommencer
                </button>
              </div>
              {resendMsg && (
                <p className={`text-sm mt-4 font-semibold ${resendMsg.startsWith('Email renvoyé') ? 'text-green-700' : 'text-amber-700'}`}>
                  {resendMsg}
                </p>
              )}
              <div className="mt-6 flex items-center justify-center gap-2 text-xs text-on-surface-variant">
                <Icon name="progress_activity" size={14} className="animate-spin text-primary" />
                Vérification automatique en cours…
              </div>
            </div>
          )}

          {/* Success */}
          {emailSent && (
            <div className="max-w-lg mx-auto text-center">
              <div className="w-20 h-20 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Icon name="verified" size={40} className="text-green-700" />
              </div>
              <h2 className="text-2xl font-black text-on-surface mb-2">Email vérifié — Espace créé !</h2>
              <p className="text-on-surface-variant mb-4">
                Votre organisation <strong className="text-on-surface">{orgForm.name}</strong> est prête.
              </p>
              <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 text-sm text-on-surface-variant mb-6 text-left flex flex-col gap-1.5">
                <p className="font-bold text-primary text-base mb-1 flex items-center gap-2">
                  <Icon name="check_circle" size={18} /> Organisation créée avec succès
                </p>
                <p><strong className="text-on-surface">{orgForm.name}</strong></p>
                <p>Plan {plan.name} · Essai {plan.trialDays} jours gratuits</p>
                <p>Admin : {adminForm.name}</p>
              </div>
              <button
                onClick={() => navigate('/login', { state: { registered: true, email: adminForm.email, orgName: orgForm.name } })}
                className="w-full py-3 bg-primary text-on-primary rounded-xl font-bold text-sm hover:bg-primary/90 flex items-center justify-center gap-2">
                <Icon name="login" size={18} /> Se connecter maintenant
              </button>
            </div>
          )}

          {!emailSent && !waitingVerification && (
          <>
          {/* STEP 1 — Plan */}
          {step === 1 && (
            <div>
              <h2 className="text-2xl font-black text-on-surface text-center mb-2">Choisissez votre plan</h2>
              <p className="text-center text-on-surface-variant mb-8">Essai gratuit {PLANS[selectedPlan]?.trialDays} jours — aucune carte requise</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                {PLAN_CARDS.map(pc => {
                  const p = getPlan(pc.id);
                  const isSelected = selectedPlan === pc.id;
                  return (
                    <button key={pc.id} onClick={() => setSelectedPlan(pc.id)}
                      className={`text-left rounded-2xl border-2 p-5 transition-all relative ${isSelected ? 'border-primary bg-primary/5 shadow-lg' : 'border-outline-variant/30 bg-surface hover:border-primary/40'}`}>
                      {pc.highlight && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-on-primary text-[10px] font-bold px-3 py-1 rounded-full">RECOMMANDÉ</div>
                      )}
                      {isSelected && (
                        <div className="absolute top-3 right-3 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                          <Icon name="check" size={14} className="text-on-primary" />
                        </div>
                      )}
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${p.badgeColor}`}>
                        <Icon name={p.icon} size={20} />
                      </div>
                      <h3 className="font-black text-xl text-on-surface mb-0.5">{p.name}</h3>
                      <p className="text-xs text-on-surface-variant mb-3">{p.description}</p>
                      <div className="mb-3">
                        {p.monthlyPrice ? (
                          <span className="font-black text-2xl text-primary">{p.monthlyPrice.toLocaleString('fr-CI')} <span className="text-sm font-normal text-on-surface-variant">FCFA/mois</span></span>
                        ) : (
                          <span className="font-black text-xl text-primary">Sur devis</span>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 mb-3">
                        {pc.limits.map(l => (
                          <div key={l} className="flex items-center gap-1.5 text-xs text-on-surface">
                            <Icon name="check_circle" size={13} className="text-primary flex-shrink-0" /> {l}
                          </div>
                        ))}
                      </div>
                      <div className="border-t border-outline-variant/20 pt-3 flex flex-col gap-1">
                        {pc.included.map(f => (
                          <div key={f} className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                            <Icon name="check" size={12} className="text-green-600 flex-shrink-0" /> {f}
                          </div>
                        ))}
                        {pc.excluded.map(f => (
                          <div key={f} className="flex items-center gap-1.5 text-xs text-on-surface-variant opacity-50">
                            <Icon name="close" size={12} className="text-error flex-shrink-0" /> {f}
                          </div>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-end">
                <button onClick={() => setStep(2)}
                  className="px-8 py-3 bg-primary text-on-primary rounded-xl font-bold text-sm hover:bg-primary/90 transition-colors flex items-center gap-2">
                  Continuer avec {plan.name} <Icon name="arrow_forward" size={18} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2 — Organisation */}
          {step === 2 && (
            <div className="max-w-lg mx-auto">
              <h2 className="text-2xl font-black text-on-surface mb-2">Votre organisation</h2>
              <p className="text-on-surface-variant mb-6">Ces informations apparaîtront sur vos documents officiels.</p>
              <div className="bg-surface rounded-2xl border border-outline-variant/20 p-6 flex flex-col gap-4">
                <div>
                  <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1 block">Nom de l'organisation *</label>
                  <input value={orgForm.name} onChange={e => setOrgForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/30 text-on-surface"
                    placeholder="Ex: Agence Immobilière Cocody" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1 block">Adresse</label>
                  <input value={orgForm.address} onChange={e => setOrgForm(f => ({ ...f, address: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/30 text-on-surface"
                    placeholder="Abidjan, Cocody 2 Plateaux" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1 block">Téléphone</label>
                    <input value={orgForm.phone} onChange={e => setOrgForm(f => ({ ...f, phone: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/30 text-on-surface"
                      placeholder="+225 07 00 00 00 00" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1 block">Email pro</label>
                    <input type="email" value={orgForm.email} onChange={e => setOrgForm(f => ({ ...f, email: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/30 text-on-surface"
                      placeholder="contact@agence.ci" />
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-xl border border-primary/20">
                  <div className={`px-2 py-1 rounded-lg text-xs font-bold ${getPlan(selectedPlan).badgeColor}`}>{getPlan(selectedPlan).name}</div>
                  <p className="text-xs text-on-surface-variant">Plan sélectionné · Essai {getPlan(selectedPlan).trialDays}j gratuit</p>
                  <button onClick={() => setStep(1)} className="ml-auto text-xs text-primary hover:underline">Changer</button>
                </div>
              </div>
              <div className="flex justify-between mt-6">
                <button onClick={() => setStep(1)} className="px-5 py-2.5 bg-surface-container text-on-surface rounded-xl font-semibold text-sm hover:bg-surface-container-high transition-colors">← Précédent</button>
                <button onClick={() => { if (!orgForm.name.trim()) { setError("Nom requis"); return; } setError(''); setStep(3); }}
                  className="px-8 py-2.5 bg-primary text-on-primary rounded-xl font-bold text-sm hover:bg-primary/90 transition-colors flex items-center gap-2">
                  Suivant <Icon name="arrow_forward" size={16} />
                </button>
              </div>
              {error && <p className="text-error text-sm mt-3 text-center">{error}</p>}
            </div>
          )}

          {/* STEP 3 — Admin */}
          {step === 3 && (
            <div className="max-w-lg mx-auto">
              <h2 className="text-2xl font-black text-on-surface mb-2">Compte administrateur</h2>
              <p className="text-on-surface-variant mb-6">Ce compte aura accès complet à votre espace. Un email de vérification sera envoyé.</p>
              <div className="bg-surface rounded-2xl border border-outline-variant/20 p-6 flex flex-col gap-4">
                <div>
                  <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1 block">Nom complet *</label>
                  <input value={adminForm.name} onChange={e => setAdminForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/30 text-on-surface"
                    placeholder="Prénom Nom" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1 block">Email professionnel *</label>
                  <input type="email" value={adminForm.email} onChange={e => setAdminForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/30 text-on-surface"
                    placeholder="admin@votreagence.ci" />
                  <p className="text-xs text-on-surface-variant mt-1">Les adresses email temporaires ne sont pas acceptées.</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1 block">Mot de passe * (min. 8 caractères)</label>
                  <input type="password" value={adminForm.password} onChange={e => setAdminForm(f => ({ ...f, password: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/30 text-on-surface"
                    placeholder="••••••••" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1 block">Confirmer le mot de passe *</label>
                  <input type="password" value={adminForm.confirm} onChange={e => setAdminForm(f => ({ ...f, confirm: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/30 text-on-surface"
                    placeholder="••••••••" />
                </div>
                <div className="p-3 bg-surface-container rounded-xl text-xs text-on-surface-variant flex flex-col gap-1">
                  <p><strong className="text-on-surface">{orgForm.name}</strong> · Plan {getPlan(selectedPlan).name}</p>
                  <p>Essai gratuit {getPlan(selectedPlan).trialDays} jours, puis {getPlan(selectedPlan).monthlyPrice ? `${getPlan(selectedPlan).monthlyPrice.toLocaleString('fr-CI')} FCFA/mois` : 'sur devis'}</p>
                </div>
                {error && <div className="flex items-center gap-2 p-3 bg-error/10 border border-error/20 rounded-xl text-error text-sm"><Icon name="error" size={16} />{error}</div>}
              </div>
              <div className="flex justify-between mt-6">
                <button onClick={() => { setError(''); setStep(2); }} className="px-5 py-2.5 bg-surface-container text-on-surface rounded-xl font-semibold text-sm hover:bg-surface-container-high transition-colors">← Précédent</button>
                <button onClick={handleRegister} disabled={loading}
                  className="px-8 py-2.5 bg-primary text-on-primary rounded-xl font-bold text-sm hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:opacity-60">
                  {loading ? <Icon name="progress_activity" size={16} className="animate-spin" /> : <Icon name="rocket_launch" size={16} />}
                  {loading ? 'Création...' : 'Créer mon espace'}
                </button>
              </div>
            </div>
          )}
          </>
          )}
        </div>
      </main>

      <footer className="py-4 text-center text-xs text-on-surface-variant border-t border-outline-variant/10">
        © {new Date().getFullYear()} Minsouah Immobilier · <button onClick={() => navigate('/login')} className="text-primary hover:underline">Déjà inscrit ? Se connecter</button>
      </footer>
    </div>
  );
}
