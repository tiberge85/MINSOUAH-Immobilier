import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import Icon from '../components/Icon';
import { AWARD_BY_KEY } from '../lib/recognition';

const WS = import.meta.env.VITE_FIREBASE_WORKSPACE || 'minsouah';
const THEME = { EXCELLENCE: '#b8860b', EXEMPLAIRE: '#1d4ed8', REGULIER: '#15803d', PARTENAIRE: '#7c3aed', FIDELE: '#0f766e' };

export default function PublicCertificate() {
  const { num } = useParams();
  const [state, setState] = useState('loading'); // loading | ok | invalid
  const [cert, setCert] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'workspaces', WS, 'certificateVerify', decodeURIComponent(num)));
        if (snap.exists() && snap.data().valid) { setCert(snap.data()); setState('ok'); }
        else setState('invalid');
      } catch { setState('invalid'); }
    })();
  }, [num]);

  const color = cert ? (THEME[cert.award_type] || '#785a00') : '#785a00';
  const def = cert ? AWARD_BY_KEY[cert.award_type] : null;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-surface rounded-3xl shadow-xl border border-outline-variant/20 overflow-hidden text-center">
        <div className="p-6" style={{ background: color }}>
          <h1 className="text-white font-black text-2xl tracking-tight">Minsouah</h1>
          <p className="text-white/80 text-xs italic mt-1">Votre sérieux mérite d'être reconnu.</p>
        </div>
        <div className="p-7 flex flex-col items-center gap-3">
          {state === 'loading' && <><Icon name="progress_activity" size={28} className="animate-spin text-primary" /><p className="text-on-surface-variant text-sm">Vérification du certificat…</p></>}

          {state === 'invalid' && <>
            <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center"><Icon name="gpp_bad" size={32} className="text-error" /></div>
            <h2 className="font-bold text-on-surface text-lg">Certificat introuvable</h2>
            <p className="text-on-surface-variant text-sm">Aucun certificat valide ne correspond à ce numéro. Vérifiez le code ou contactez Minsouah.</p>
            <p className="text-xs text-on-surface-variant mt-1">N° recherché : {decodeURIComponent(num || '')}</p>
          </>}

          {state === 'ok' && cert && <>
            <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: color + '22' }}><Icon name="verified" size={32} style={{ color }} /></div>
            <p className="text-green-700 font-semibold text-sm">✓ Certificat authentique</p>
            <h2 className="font-black text-xl" style={{ color }}>{def?.emoji} {cert.label}</h2>
            <p className="text-on-surface-variant text-sm">décerné à</p>
            <p className="font-bold text-on-surface text-lg">{cert.tenantName}</p>
            {cert.property && <p className="text-on-surface-variant text-xs">Résidence / Logement : {cert.property}</p>}
            <p className="text-on-surface text-sm">au titre de l'exercice <b>{cert.year}</b></p>
            <div className="mt-2 pt-3 border-t border-outline-variant/20 w-full">
              <p className="text-[11px] text-on-surface-variant">Certificat N° {cert.certificate_number}</p>
              <p className="text-[11px] text-on-surface-variant">Délivré par Minsouah — document de reconnaissance (aucune information financière n'est publiée).</p>
            </div>
          </>}
        </div>
      </div>
    </div>
  );
}
