import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';
import { AWARD_BY_KEY } from '../lib/recognition';
import { buildCertificate, certificateHTML } from '../lib/certificate';

const WS = import.meta.env.VITE_FIREBASE_WORKSPACE || 'minsouah';
const THEME = { EXCELLENCE: '#b8860b', EXEMPLAIRE: '#1d4ed8', REGULIER: '#15803d', PARTENAIRE: '#7c3aed', FIDELE: '#0f766e' };
const CONGRATS = {
  EXCELLENCE: "Félicitations ! Votre rigueur a été exemplaire toute l'année : chaque loyer réglé, à temps, sans le moindre incident. Merci pour votre sérieux.",
  EXEMPLAIRE: "Félicitations ! Vous avez réglé l'ensemble de vos loyers avec ponctualité. Un comportement locatif exemplaire que nous tenons à saluer.",
  REGULIER: "Félicitations ! Votre constance à honorer et solder vos loyers mérite d'être reconnue. Merci pour votre régularité.",
  PARTENAIRE: "Félicitations ! Au fil des années, vous êtes devenu un véritable partenaire de confiance pour Minsouah. Merci pour cette belle relation.",
  FIDELE: "Félicitations ! Votre fidélité et la constance de vos règlements nous touchent. Merci pour votre confiance renouvelée.",
};

export default function MyAwards() {
  const { state } = useApp();
  const user = state.currentUser;
  const personId = user?.personId != null ? String(user.personId) : '';
  const orgSettings = state.orgSettings || {};
  const baseUrl = (typeof window !== 'undefined') ? (window.location.origin + window.location.pathname) : '';

  const [awards, setAwards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!personId) { setLoading(false); return; }
    const q = query(collection(db, 'workspaces', WS, 'tenantAwards'), where('tenantId', '==', personId));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(a => a.status === 'publiee')
        .sort((a, b) => (b.year || 0) - (a.year || 0));
      setAwards(list); setLoading(false);
    }, () => { setLoading(false); });
    return unsub;
  }, [personId]);

  async function viewPDF(a) {
    try {
      const { svg } = await buildCertificate(a, orgSettings, baseUrl);
      const win = window.open('', '_blank', 'width=1150,height=820');
      if (win) { win.document.write(certificateHTML(svg, `Certificat ${a.tenantName}`)); win.document.close(); }
      else alert('Autorisez les pop-ups pour voir le certificat.');
    } catch (e) { setMsg('Erreur : ' + (e?.message || e)); }
  }

  async function makePng(a) {
    const { svg } = await buildCertificate(a, orgSettings, baseUrl);
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image(); await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const scale = 2, canvas = document.createElement('canvas'); canvas.width = 1123 * scale; canvas.height = 794 * scale;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height); URL.revokeObjectURL(url);
    return await new Promise(res => canvas.toBlob(res, 'image/png'));
  }

  async function downloadPng(a) {
    try { const b = await makePng(a); const u = URL.createObjectURL(b); const el = document.createElement('a'); el.href = u; el.download = `Mon_certificat_${a.year}.png`; el.click(); setTimeout(() => URL.revokeObjectURL(u), 1500); }
    catch (e) { setMsg('Erreur image : ' + (e?.message || e)); }
  }

  async function share(a) {
    try {
      const b = await makePng(a);
      const file = new File([b], `Certificat_${a.year}.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Mon certificat Minsouah', text: `${a.label} — Minsouah ${a.year}` });
      } else { await downloadPng(a); setMsg('Partage direct non disponible : image téléchargée, vous pouvez l\'envoyer via WhatsApp.'); setTimeout(() => setMsg(''), 5000); }
    } catch (e) { if (e?.name !== 'AbortError') setMsg('Partage impossible : ' + (e?.message || e)); }
  }

  return (
    <div className="flex flex-col gap-md max-w-3xl mx-auto w-full">
      <div className="text-center">
        <h2 className="font-bold text-on-surface text-xl flex items-center justify-center gap-2"><Icon name="military_tech" size={24} className="text-primary" /> Mes distinctions</h2>
        <p className="text-sm text-on-surface-variant mt-1 italic">« Votre sérieux mérite d'être reconnu. »</p>
      </div>
      {msg && <div className="bg-surface-container-high text-on-surface rounded-xl px-4 py-2 text-sm text-center">{msg}</div>}

      {loading && <div className="text-center py-12 text-on-surface-variant"><Icon name="progress_activity" size={28} className="animate-spin" /></div>}

      {!loading && awards.length === 0 && (
        <div className="bg-surface-container-lowest rounded-2xl shadow-card border border-outline-variant/20 p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3"><Icon name="emoji_events" size={34} className="text-primary" /></div>
          <h3 className="font-bold text-on-surface">Votre reconnaissance se construit !</h3>
          <p className="text-on-surface-variant text-sm mt-2">Vous n'avez pas encore de distinction, mais chaque loyer réglé à temps vous en rapproche. Continuez ainsi : votre sérieux sera récompensé en fin d'année. 💪</p>
        </div>
      )}

      {!loading && awards.map(a => {
        const def = AWARD_BY_KEY[a.award_type]; const color = THEME[a.award_type] || '#785a00';
        return (
          <div key={a.id} className="bg-surface-container-lowest rounded-2xl shadow-card border border-outline-variant/20 overflow-hidden">
            <div className="p-5 text-center" style={{ background: color + '12' }}>
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-2 text-2xl" style={{ background: color + '22' }}>{def?.emoji || '🏅'}</div>
              <h3 className="font-black text-xl" style={{ color }}>{def?.label || a.label}</h3>
              <p className="text-on-surface-variant text-sm mt-0.5">Exercice {a.year}</p>
            </div>
            <div className="p-5 flex flex-col gap-3">
              <p className="text-sm text-on-surface text-center leading-relaxed">{CONGRATS[a.award_type] || 'Félicitations pour votre sérieux !'}</p>
              <p className="text-xs text-on-surface-variant text-center">Certificat N° {a.certificate_number}</p>
              <div className="flex gap-2 flex-wrap justify-center">
                <button onClick={() => viewPDF(a)} className="inline-flex items-center gap-1.5 bg-primary text-on-primary font-semibold rounded-lg px-4 py-2 text-sm hover:bg-primary/90"><Icon name="visibility" size={16} /> Voir / Imprimer (PDF)</button>
                <button onClick={() => downloadPng(a)} className="inline-flex items-center gap-1.5 bg-surface-container-high text-on-surface font-semibold rounded-lg px-4 py-2 text-sm hover:bg-outline-variant/30"><Icon name="download" size={16} /> Image</button>
                <button onClick={() => share(a)} className="inline-flex items-center gap-1.5 bg-green-100 text-green-700 font-semibold rounded-lg px-4 py-2 text-sm hover:bg-green-200"><Icon name="share" size={16} /> Partager</button>
              </div>
            </div>
          </div>
        );
      })}

      <p className="text-center text-xs text-on-surface-variant mt-2">MINSOUAH — Merci pour votre confiance et votre fidélité.</p>
    </div>
  );
}
