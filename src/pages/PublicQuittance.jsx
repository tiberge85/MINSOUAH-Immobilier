import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import Icon from '../components/Icon';

const WS = import.meta.env.VITE_FIREBASE_WORKSPACE || 'minsouah';
const fmt = (n) => `${(Number(n) || 0).toLocaleString('fr-FR')} FCFA`;

export default function PublicQuittance() {
  const { id } = useParams();
  const [state, setState] = useState('loading'); // loading | ok | notfound
  const [data, setData] = useState(null);

  useEffect(() => {
    getDoc(doc(db, 'workspaces', WS, 'quittanceVerify', id))
      .then((snap) => {
        if (!snap.exists()) { setState('notfound'); return; }
        setData(snap.data());
        setState('ok');
      })
      .catch(() => setState('notfound'));
  }, [id]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-surface rounded-2xl shadow-xl border border-outline-variant/20 p-6 text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
          <Icon name="receipt_long" size={30} className="text-primary" />
        </div>
        <h1 className="font-black text-xl text-primary">Vérification de quittance</h1>

        {state === 'loading' && (
          <p className="text-on-surface-variant text-sm mt-4 flex items-center justify-center gap-2">
            <Icon name="progress_activity" size={18} className="animate-spin" /> Vérification…
          </p>
        )}

        {state === 'notfound' && (
          <div className="mt-5">
            <div className="w-14 h-14 mx-auto rounded-full bg-error/10 flex items-center justify-center mb-2">
              <Icon name="gpp_bad" size={28} className="text-error" />
            </div>
            <p className="font-bold text-error">Quittance introuvable</p>
            <p className="text-xs text-on-surface-variant mt-1">Ce document n'a pas pu être authentifié.</p>
          </div>
        )}

        {state === 'ok' && data && (
          <div className="mt-5 text-left">
            <div className="w-14 h-14 mx-auto rounded-full bg-green-100 flex items-center justify-center mb-3">
              <Icon name="verified" size={28} className="text-green-700" />
            </div>
            <p className="text-center font-bold text-green-700 mb-3">Enregistrement trouvé ✓</p>
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
              <Icon name="info" size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 leading-relaxed">
                <strong>Comparez ces informations avec le document papier</strong> — surtout le <strong>montant</strong>, le <strong>nom du locataire</strong> et la <strong>période</strong>.
                En cas de différence, la quittance est <strong>falsifiée</strong>.
              </p>
            </div>
            <div className="flex flex-col gap-2 text-sm bg-surface-container-low rounded-xl p-4">
              <Row label="Référence" value={data.receiptNum} />
              <Row label="Locataire" value={data.tenantName} />
              <Row label="Propriété" value={data.propertyName} />
              <Row label="Période" value={data.month} />
              <Row label="Montant" value={fmt(data.amount)} />
              <Row label="Payé le" value={data.paidDate} />
              <Row label="Statut" value={data.status} />
              <Row label="Émis par" value={data.companyName} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between border-b border-dotted border-outline-variant/30 pb-1.5">
      <span className="text-on-surface-variant">{label}</span>
      <span className="font-semibold text-on-surface text-right">{value || '—'}</span>
    </div>
  );
}
