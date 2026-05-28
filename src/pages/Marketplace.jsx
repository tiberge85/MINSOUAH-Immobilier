import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';

/* ── Unlock helpers ─────────────────────────────────────────────────────────── */
const UNLOCK_KEY = 'minsouah_mkt_unlocks';

function getUnlocked() {
  try { return JSON.parse(localStorage.getItem(UNLOCK_KEY) || '[]'); }
  catch { return []; }
}

function checkUnlocked(listingId) {
  return getUnlocked().some(u => u.listingId === listingId);
}

function markUnlocked(listingId, method) {
  const list = getUnlocked().filter(u => u.listingId !== listingId);
  list.push({ listingId, method, unlockedAt: new Date().toISOString() });
  localStorage.setItem(UNLOCK_KEY, JSON.stringify(list));
}

/* ── Payment Modal ─────────────────────────────────────────────────────────── */
const PAYMENT_METHODS = [
  { id: 'orange', label: 'Orange Money', icon: 'phone_iphone', bg: 'bg-orange-500 text-white' },
  { id: 'mtn',    label: 'MTN MoMo',     icon: 'phone_iphone', bg: 'bg-yellow-400 text-gray-900' },
  { id: 'wave',   label: 'Wave',         icon: 'waves',        bg: 'bg-blue-500 text-white' },
  { id: 'cinetpay', label: 'CinetPay / Carte', icon: 'credit_card', bg: 'bg-violet-600 text-white' },
];

function PaymentModal({ listing, onClose, onSuccess, onDispatch }) {
  const [step,    setStep]    = useState('choose'); // 'choose' | 'pay' | 'done'
  const [method,  setMethod]  = useState(null);
  const [txRef,   setTxRef]   = useState('');
  const [loading, setLoading] = useState(false);

  const price = listing.unlockPrice ?? 500;

  const handleSubmit = async () => {
    if (!txRef.trim()) return;
    setLoading(true);
    try {
      await onDispatch({ type: 'ADD_LISTING_UNLOCK', payload: {
        listingId: listing.id,
        listingTitle: listing.title,
        method: method.id,
        amount: price,
        txRef: txRef.trim(),
        status: 'pending',
        uid: null,
      }});
    } catch (_) { /* allow offline */ }
    markUnlocked(listing.id, method.id);
    setLoading(false);
    setStep('done');
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-surface w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="bg-gradient-to-r from-primary to-secondary px-5 py-5 text-on-primary">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold uppercase tracking-widest opacity-75">Débloquer le contact</span>
            <button onClick={onClose} className="opacity-70 hover:opacity-100 transition-opacity">
              <Icon name="close" size={18} />
            </button>
          </div>
          <p className="text-sm opacity-75 truncate mb-1">{listing.title}</p>
          <p className="text-3xl font-black">{price.toLocaleString('fr-CI')} FCFA</p>
        </div>

        <div className="p-5">
          {step === 'choose' && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-on-surface-variant text-center mb-1">Choisissez votre mode de paiement</p>
              {PAYMENT_METHODS.map(m => (
                <button key={m.id} onClick={() => { setMethod(m); setStep('pay'); }}
                  className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold text-sm transition-all hover:scale-[1.01] active:scale-[0.99] shadow-sm ${m.bg}`}>
                  <Icon name={m.icon} size={20} />
                  <span>{m.label}</span>
                  <Icon name="chevron_right" size={16} className="ml-auto" />
                </button>
              ))}
            </div>
          )}

          {step === 'pay' && (
            <div className="flex flex-col gap-4">
              <button onClick={() => setStep('choose')}
                className="flex items-center gap-1.5 text-xs text-on-surface-variant hover:text-on-surface transition-colors -mb-1">
                <Icon name="arrow_back" size={14} /> Choisir un autre mode
              </button>

              <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm ${method.bg}`}>
                <Icon name={method.icon} size={16} />{method.label}
              </div>

              <div className="bg-surface-container rounded-xl p-4">
                <p className="text-xs font-bold text-on-surface mb-2 flex items-center gap-1.5">
                  <Icon name="info" size={13} className="text-primary" /> Instructions
                </p>
                <ol className="text-xs text-on-surface-variant flex flex-col gap-1.5 list-decimal list-inside leading-relaxed">
                  <li>Ouvrez votre application <strong>{method.label}</strong></li>
                  <li>Envoyez <strong className="text-on-surface">{price.toLocaleString('fr-CI')} FCFA</strong> au numéro :</li>
                </ol>
                <p className="text-center text-lg font-black text-on-surface tracking-widest my-2">
                  +225 07 XX XX XX XX
                </p>
                <p className="text-[10px] text-center text-on-surface-variant">Numéro de paiement Minsouah</p>
                <ol className="text-xs text-on-surface-variant list-decimal list-inside mt-2 flex flex-col gap-1" start={3}>
                  <li>Notez votre référence de transaction</li>
                  <li>Saisissez-la ci-dessous pour déverrouiller</li>
                </ol>
              </div>

              <input value={txRef} onChange={e => setTxRef(e.target.value)}
                placeholder="Référence de transaction (ex: A1234567)"
                className="px-3 py-3 border border-outline-variant rounded-xl text-sm focus:outline-none focus:border-primary" />

              <button onClick={handleSubmit} disabled={!txRef.trim() || loading}
                className="w-full py-3.5 font-black text-on-primary bg-primary rounded-2xl hover:bg-primary/90 disabled:opacity-40 flex items-center justify-center gap-2 text-sm">
                {loading
                  ? <><Icon name="progress_activity" size={16} className="animate-spin" /> Vérification…</>
                  : <><Icon name="lock_open" size={16} /> Déverrouiller le contact</>
                }
              </button>
              <p className="text-[10px] text-center text-on-surface-variant leading-relaxed">
                Le contact s'affiche immédiatement après soumission. Le paiement est vérifié manuellement par notre équipe.
              </p>
            </div>
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center">
                <Icon name="lock_open" size={32} className="text-green-600" />
              </div>
              <div className="text-center">
                <p className="font-black text-on-surface text-lg">Contact déverrouillé !</p>
                <p className="text-sm text-on-surface-variant mt-1">
                  Vous pouvez maintenant contacter le propriétaire.
                </p>
              </div>
              <button onClick={onSuccess}
                className="w-full py-3 bg-primary text-on-primary font-bold rounded-xl text-sm hover:bg-primary/90">
                Voir le contact
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Constants ─────────────────────────────────────────────────────────────── */
const TYPES = [
  { value: 'all',               label: 'Tous',             icon: 'apps' },
  { value: 'maison',            label: 'Maison',           icon: 'house' },
  { value: 'appartement',       label: 'Appartement',      icon: 'apartment' },
  { value: 'villa',             label: 'Villa',            icon: 'villa' },
  { value: 'terrain',           label: 'Terrain',          icon: 'landscape' },
  { value: 'bureau',            label: 'Bureau',           icon: 'business_center' },
  { value: 'residence_meublee', label: 'Résidence Meublée',icon: 'hotel' },
];

const TRANSACTIONS = [
  { value: 'all',      label: 'Tout' },
  { value: 'location', label: 'Location' },
  { value: 'vente',    label: 'Vente' },
];

const SORT_OPTIONS = [
  { value: 'date_desc',  label: 'Plus récents' },
  { value: 'price_asc',  label: 'Prix croissant' },
  { value: 'price_desc', label: 'Prix décroissant' },
];

const TYPE_COLORS = {
  maison:            'bg-blue-100 text-blue-700',
  appartement:       'bg-violet-100 text-violet-700',
  villa:             'bg-emerald-100 text-emerald-700',
  terrain:           'bg-amber-100 text-amber-700',
  bureau:            'bg-slate-100 text-slate-700',
  residence_meublee: 'bg-rose-100 text-rose-700',
};

const TRANSACTION_COLORS = {
  vente:    'bg-green-600 text-white',
  location: 'bg-blue-600 text-white',
};

const STATUS_COLORS = {
  'publié': 'bg-green-100 text-green-700',
  'vendu':  'bg-red-100 text-red-700',
  'loué':   'bg-amber-100 text-amber-700',
};

const fmt = (n, period) => {
  const s = Number(n || 0).toLocaleString('fr-CI') + ' FCFA';
  return period ? `${s} / ${period}` : s;
};

const phoneForWA = raw => {
  const d = (raw || '').replace(/\D/g, '');
  if (!d) return '';
  return d.startsWith('225') ? d : '225' + (d.startsWith('0') ? d.slice(1) : d);
};

const AMENITY_ICONS = {
  piscine: 'pool', parking: 'local_parking', gardien: 'security',
  climatisation: 'ac_unit', balcon: 'balcony', terrasse: 'deck',
  ascenseur: 'elevator', garage: 'garage', jardin: 'yard',
  meublé: 'chair', wifi: 'wifi', eau: 'water_drop', électricité: 'bolt',
};

const FAV_KEY = 'minsouah_mkt_favs';

/* ── Helper: placeholder image ─────────────────────────────────────────────── */
function PlaceholderImg({ type, className }) {
  const icons = { maison: 'house', appartement: 'apartment', villa: 'villa', terrain: 'landscape', bureau: 'business_center', residence_meublee: 'hotel' };
  return (
    <div className={`flex items-center justify-center bg-gradient-to-br from-surface-container to-surface-container-high ${className}`}>
      <Icon name={icons[type] || 'home'} size={48} className="text-outline-variant/40" />
    </div>
  );
}

/* ── Property Card ──────────────────────────────────────────────────────────── */
function PropertyCard({ listing, onOpen, isFav, onToggleFav }) {
  const [imgFailed, setImgFailed] = useState(false);
  const img = listing.images?.[0];
  const isUnavailable = listing.status === 'vendu' || listing.status === 'loué';
  return (
    <div
      onClick={() => onOpen(listing)}
      className={`group bg-surface rounded-2xl overflow-hidden border border-outline-variant/20 shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer flex flex-col ${isUnavailable ? 'opacity-75' : ''}`}
    >
      {/* Image */}
      <div className="relative h-52 overflow-hidden bg-surface-container flex-shrink-0">
        {img && !imgFailed
          ? <img src={img} alt={listing.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onError={() => setImgFailed(true)} />
          : <PlaceholderImg type={listing.type} className="w-full h-full" />
        }
        {/* Badges overlay */}
        <div className="absolute top-3 left-3 flex gap-1.5">
          {listing.transaction && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${TRANSACTION_COLORS[listing.transaction] || 'bg-gray-600 text-white'}`}>
              {listing.transaction}
            </span>
          )}
          {listing.featured && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white uppercase tracking-wider">
              Vedette
            </span>
          )}
          {isUnavailable && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/60 text-white uppercase tracking-wider">
              {listing.status}
            </span>
          )}
        </div>
        {/* Fav button */}
        <button
          onClick={e => { e.stopPropagation(); onToggleFav(listing.id); }}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-sm hover:bg-white transition-colors"
        >
          <Icon name={isFav ? 'favorite' : 'favorite_border'} size={16} className={isFav ? 'text-red-500' : 'text-on-surface-variant'} />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col gap-2 flex-1">
        {/* Type pill */}
        <div className="flex items-center justify-between">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${TYPE_COLORS[listing.type] || 'bg-surface-container text-on-surface-variant'}`}>
            {TYPES.find(t => t.value === listing.type)?.label || listing.type}
          </span>
          {listing.views > 0 && (
            <span className="text-[10px] text-on-surface-variant flex items-center gap-0.5">
              <Icon name="visibility" size={11} />{listing.views}
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="font-bold text-on-surface text-sm leading-tight line-clamp-2">{listing.title}</h3>

        {/* Location */}
        <p className="text-xs text-on-surface-variant flex items-center gap-1">
          <Icon name="location_on" size={12} className="text-primary flex-shrink-0" />
          {listing.zone}{listing.city ? `, ${listing.city}` : ''}
        </p>

        {/* Stats */}
        <div className="flex gap-3 text-[11px] text-on-surface-variant mt-auto pt-1">
          {listing.surface > 0 && <span className="flex items-center gap-0.5"><Icon name="square_foot" size={11} />{listing.surface} m²</span>}
          {listing.rooms > 0  && <span className="flex items-center gap-0.5"><Icon name="meeting_room" size={11} />{listing.rooms} p.</span>}
          {listing.bedrooms > 0 && <span className="flex items-center gap-0.5"><Icon name="bed" size={11} />{listing.bedrooms} ch.</span>}
          {listing.bathrooms > 0 && <span className="flex items-center gap-0.5"><Icon name="shower" size={11} />{listing.bathrooms} sdb.</span>}
        </div>

        {/* Price */}
        <div className="border-t border-outline-variant/20 pt-2 mt-1">
          <p className="font-black text-primary text-base">{fmt(listing.price, listing.pricePeriod)}</p>
        </div>
      </div>
    </div>
  );
}

/* ── Detail Modal ───────────────────────────────────────────────────────────── */
function ListingDetailModal({ listing, onClose, onToggleFav, isFav, onContact, onDispatch }) {
  const [imgIdx,       setImgIdx]       = useState(0);
  const [showInterest, setShowInterest] = useState(false);
  const [unlocked,     setUnlocked]     = useState(() => checkUnlocked(listing.id));
  const [showPayment,  setShowPayment]  = useState(false);
  const [brokenImgs,   setBrokenImgs]   = useState(new Set());
  const images = listing.images?.length > 0 ? listing.images : [];
  const markBroken = (i) => setBrokenImgs(prev => new Set([...prev, i]));

  useEffect(() => {
    onDispatch({ type: 'INCREMENT_LISTING_VIEW', payload: listing.id });
    const handler = e => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [listing.id, onClose, onDispatch]);

  const waPhone = phoneForWA(listing.contactWhatsApp || listing.contactPhone);
  const waMsg = encodeURIComponent(`Bonjour, je suis intéressé(e) par votre annonce : ${listing.title} (${listing.zone}) — ${Number(listing.price).toLocaleString('fr-CI')} FCFA. Pouvez-vous me donner plus d'informations ?`);

  return (
  <>
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-surface w-full max-w-3xl rounded-3xl shadow-2xl my-8 overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* Image gallery */}
        <div className="relative h-72 sm:h-96 bg-surface-container">
          {images.length > 0 && !brokenImgs.has(imgIdx)
            ? <img src={images[imgIdx]} alt={listing.title} className="w-full h-full object-cover" onError={() => markBroken(imgIdx)} />
            : <PlaceholderImg type={listing.type} className="w-full h-full" />
          }
          {/* Close */}
          <button onClick={onClose} className="absolute top-4 left-4 w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors">
            <Icon name="arrow_back" size={18} />
          </button>
          {/* Fav */}
          <button onClick={() => onToggleFav(listing.id)} className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/90 flex items-center justify-center shadow">
            <Icon name={isFav ? 'favorite' : 'favorite_border'} size={18} className={isFav ? 'text-red-500' : 'text-on-surface-variant'} />
          </button>
          {/* Gallery thumbnails */}
          {images.length > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
              {images.map((_, i) => (
                <button key={i} onClick={() => setImgIdx(i)}
                  className={`w-2 h-2 rounded-full transition-all ${i === imgIdx ? 'bg-white w-5' : 'bg-white/50'}`} />
              ))}
            </div>
          )}
          {images.length > 1 && (
            <>
              <button onClick={() => setImgIdx(i => (i - 1 + images.length) % images.length)}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60">
                <Icon name="chevron_left" size={20} />
              </button>
              <button onClick={() => setImgIdx(i => (i + 1) % images.length)}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60">
                <Icon name="chevron_right" size={20} />
              </button>
            </>
          )}
          {/* Transaction badge */}
          {listing.transaction && (
            <div className={`absolute bottom-4 left-4 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider ${TRANSACTION_COLORS[listing.transaction] || 'bg-gray-700 text-white'}`}>
              {listing.transaction}
            </div>
          )}
        </div>

        {/* Thumbnails row */}
        {images.length > 1 && (
          <div className="flex gap-2 px-5 pt-3 overflow-x-auto no-scrollbar">
            {images.map((url, i) => (
              <button key={i} onClick={() => setImgIdx(i)} className={`flex-shrink-0 w-16 h-12 rounded-lg overflow-hidden border-2 transition-colors ${i === imgIdx ? 'border-primary' : 'border-transparent'}`}>
                <img src={url} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="px-5 py-5 flex flex-col gap-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex gap-2 flex-wrap mb-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${TYPE_COLORS[listing.type] || 'bg-surface-container text-on-surface-variant'}`}>
                  {TYPES.find(t => t.value === listing.type)?.label || listing.type}
                </span>
                {listing.status && listing.status !== 'publié' && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${STATUS_COLORS[listing.status] || ''}`}>{listing.status}</span>
                )}
              </div>
              <h2 className="font-black text-on-surface text-xl leading-tight">{listing.title}</h2>
              <p className="text-on-surface-variant text-sm flex items-center gap-1 mt-1">
                <Icon name="location_on" size={14} className="text-primary" />
                {listing.zone}{listing.city ? `, ${listing.city}` : ''}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="font-black text-primary text-2xl">{Number(listing.price).toLocaleString('fr-CI')}</p>
              <p className="text-xs text-on-surface-variant">FCFA{listing.pricePeriod ? ` / ${listing.pricePeriod}` : ''}</p>
            </div>
          </div>

          {/* Key stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              listing.surface   > 0 && { icon: 'square_foot',    val: `${listing.surface} m²`,   lbl: 'Surface' },
              listing.rooms     > 0 && { icon: 'meeting_room',   val: `${listing.rooms} pièces`,  lbl: 'Pièces' },
              listing.bedrooms  > 0 && { icon: 'bed',            val: `${listing.bedrooms} ch.`,  lbl: 'Chambres' },
              listing.bathrooms > 0 && { icon: 'shower',         val: `${listing.bathrooms} sdb.`,lbl: 'Salles de bain' },
            ].filter(Boolean).map(s => (
              <div key={s.lbl} className="bg-surface-container rounded-xl p-3 text-center">
                <Icon name={s.icon} size={20} className="text-primary mx-auto mb-1" />
                <p className="font-bold text-on-surface text-sm">{s.val}</p>
                <p className="text-[10px] text-on-surface-variant uppercase tracking-wide">{s.lbl}</p>
              </div>
            ))}
          </div>

          {/* Description */}
          {listing.description && (
            <div>
              <h4 className="font-bold text-on-surface text-sm mb-2">Description</h4>
              <p className="text-sm text-on-surface-variant leading-relaxed whitespace-pre-line">{listing.description}</p>
            </div>
          )}

          {/* Amenities */}
          {listing.amenities?.length > 0 && (
            <div>
              <h4 className="font-bold text-on-surface text-sm mb-2">Équipements & caractéristiques</h4>
              <div className="flex flex-wrap gap-2">
                {listing.amenities.map(a => (
                  <span key={a} className="flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-xs font-semibold">
                    <Icon name={AMENITY_ICONS[a] || 'check_circle'} size={12} />
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Contact section */}
          {(() => {
            const price = listing.unlockPrice ?? 500;
            const hasContact = !!(waPhone || listing.contactPhone);
            const requiresUnlock = price > 0 && hasContact;
            return (
              <div className="border-t border-outline-variant/20 pt-4 flex flex-col gap-3">
                <h4 className="font-bold text-on-surface text-sm">Contacter le propriétaire</h4>

                {/* Paywall */}
                {!unlocked && requiresUnlock && !showInterest && (
                  <div className="relative rounded-2xl overflow-hidden">
                    {/* Blurred placeholder */}
                    <div className="blur-sm select-none pointer-events-none flex flex-col sm:flex-row gap-3">
                      <div className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-500 text-white font-bold rounded-xl text-sm">
                        <Icon name="chat" size={18} /> +225 XX XX XX XX
                      </div>
                      <div className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary text-on-primary font-bold rounded-xl text-sm">
                        <Icon name="call" size={18} /> Appeler
                      </div>
                    </div>
                    {/* Unlock overlay */}
                    <div className="absolute inset-0 flex items-center justify-center bg-surface/40 backdrop-blur-[2px]">
                      <button onClick={() => setShowPayment(true)}
                        className="bg-primary text-on-primary px-5 py-3 rounded-xl font-bold text-sm shadow-xl flex items-center gap-2 hover:bg-primary/90 transition-all hover:scale-[1.02] active:scale-[0.98]">
                        <Icon name="lock" size={16} />
                        Débloquer — {price.toLocaleString('fr-CI')} FCFA
                      </button>
                    </div>
                  </div>
                )}

                {/* Actual contact (after unlock or free) */}
                {(unlocked || !requiresUnlock) && !showInterest && hasContact && (
                  <div className="flex flex-col sm:flex-row gap-3">
                    {waPhone && (
                      <a href={`https://wa.me/${waPhone}?text=${waMsg}`} target="_blank" rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-500 text-white font-bold rounded-xl hover:bg-green-600 transition-colors text-sm"
                        onClick={() => onDispatch({ type: 'INCREMENT_LISTING_REACTION', payload: listing.id })}>
                        <Icon name="chat" size={18} /> WhatsApp
                      </a>
                    )}
                    {listing.contactPhone && (
                      <a href={`tel:${listing.contactPhone}`}
                        className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary text-on-primary font-bold rounded-xl hover:bg-primary/90 transition-colors text-sm">
                        <Icon name="call" size={18} /> Appeler
                      </a>
                    )}
                  </div>
                )}

                {/* Interest form — always accessible */}
                {showInterest ? (
                  <InterestForm listing={listing} onClose={() => setShowInterest(false)} onDispatch={onDispatch} />
                ) : (
                  <button onClick={() => setShowInterest(true)}
                    className="flex items-center justify-center gap-2 py-3 border-2 border-primary text-primary font-bold rounded-xl hover:bg-primary/10 transition-colors text-sm">
                    <Icon name="thumb_up" size={18} /> Je suis intéressé(e)
                  </button>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>

    {/* Payment modal — above detail modal (z-[60]) */}
    {showPayment && (
      <PaymentModal
        listing={listing}
        onClose={() => setShowPayment(false)}
        onSuccess={() => { setUnlocked(true); setShowPayment(false); }}
        onDispatch={onDispatch}
      />
    )}
  </>
  );
}

/* ── Interest / Register Form ───────────────────────────────────────────────── */
function InterestForm({ listing, onClose, onDispatch }) {
  const [form,    setForm]    = useState({ name: '', phone: '', email: '', budget: '', zone: listing.zone || '', type: listing.type || '', rooms: '', notes: '' });
  const [sent,    setSent]    = useState(false);
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!form.name || !form.phone || sending) return;
    setSending(true);
    try {
      await onDispatch({
        type: 'ADD_LISTING_CLIENT',
        payload: {
          ...form,
          listingId:    listing.id,
          listingTitle: listing.title,
          uid:          null,
        },
      });
    } catch (_) { /* save failed — still show success to visitor */ }
    try {
      await onDispatch({ type: 'INCREMENT_LISTING_REACTION', payload: listing.id });
    } catch (_) {}
    setSending(false);
    setSent(true);
  };

  if (sent) return (
    <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-center">
      <Icon name="check_circle" size={36} className="text-green-600 mx-auto mb-2" />
      <p className="font-bold text-green-800 text-sm">Votre demande a bien été enregistrée !</p>
      <p className="text-xs text-green-600 mt-1">Un conseiller vous contactera très prochainement.</p>
      <button onClick={onClose} className="mt-3 text-xs text-green-700 underline">Fermer</button>
    </div>
  );

  return (
    <div className="bg-surface-container rounded-2xl p-4 flex flex-col gap-3">
      <p className="text-xs text-on-surface-variant font-semibold">Laissez vos coordonnées — un conseiller vous recontacte :</p>
      <div className="grid grid-cols-2 gap-3">
        <input placeholder="Nom complet *" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}
          className="col-span-2 px-3 py-2 bg-surface border border-outline-variant rounded-xl text-sm focus:outline-none focus:border-primary" />
        <input placeholder="Téléphone *" value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))}
          className="px-3 py-2 bg-surface border border-outline-variant rounded-xl text-sm focus:outline-none focus:border-primary" />
        <input placeholder="Email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))}
          className="px-3 py-2 bg-surface border border-outline-variant rounded-xl text-sm focus:outline-none focus:border-primary" />
        <input placeholder="Budget max (FCFA)" value={form.budget} onChange={e => setForm(f => ({...f, budget: e.target.value}))}
          className="px-3 py-2 bg-surface border border-outline-variant rounded-xl text-sm focus:outline-none focus:border-primary" />
        <input placeholder="Zone souhaitée" value={form.zone} onChange={e => setForm(f => ({...f, zone: e.target.value}))}
          className="px-3 py-2 bg-surface border border-outline-variant rounded-xl text-sm focus:outline-none focus:border-primary" />
        <textarea placeholder="Message ou précisions..." value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} rows={2}
          className="col-span-2 px-3 py-2 bg-surface border border-outline-variant rounded-xl text-sm focus:outline-none focus:border-primary resize-none" />
      </div>
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-2 text-sm text-on-surface-variant bg-surface border border-outline-variant rounded-xl font-semibold">Annuler</button>
        <button onClick={handleSend} disabled={!form.name || !form.phone || sending}
          className="flex-1 py-2 text-sm text-on-primary bg-primary rounded-xl font-bold disabled:opacity-40 flex items-center justify-center gap-2">
          {sending
            ? <><Icon name="progress_activity" size={14} className="animate-spin" /> Envoi…</>
            : <><Icon name="send" size={14} /> Envoyer</>}
        </button>
      </div>
    </div>
  );
}

/* ── Main Marketplace page ──────────────────────────────────────────────────── */
export default function Marketplace() {
  const { state, dispatch } = useApp();
  const { listings = [], orgSettings } = state;
  const navigate = useNavigate();

  const [typeFilter,        setTypeFilter]        = useState('all');
  const [transactionFilter, setTransactionFilter] = useState('all');
  const [search,            setSearch]            = useState('');
  const [sort,              setSort]              = useState('date_desc');
  const [minPrice,          setMinPrice]          = useState('');
  const [maxPrice,          setMaxPrice]          = useState('');
  const [zoneFilter,        setZoneFilter]        = useState('');
  const [selectedListing,   setSelectedListing]   = useState(null);
  const [showFilters,       setShowFilters]       = useState(false);
  const [favs,              setFavs]              = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')); }
    catch { return new Set(); }
  });

  const toggleFav = useCallback((id) => {
    setFavs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem(FAV_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  // Unique zones from published listings
  const zones = useMemo(() =>
    [...new Set(listings.filter(l => l.status === 'publié').map(l => l.zone).filter(Boolean))].sort(),
    [listings]
  );

  const published = useMemo(() =>
    listings.filter(l => l.status === 'publié' || l.status === 'vendu' || l.status === 'loué'),
    [listings]
  );

  const filtered = useMemo(() => {
    let res = [...published];
    if (typeFilter !== 'all')        res = res.filter(l => l.type === typeFilter);
    if (transactionFilter !== 'all') res = res.filter(l => l.transaction === transactionFilter);
    if (zoneFilter)                  res = res.filter(l => l.zone?.toLowerCase().includes(zoneFilter.toLowerCase()));
    if (search)                      res = res.filter(l =>
      l.title?.toLowerCase().includes(search.toLowerCase()) ||
      l.zone?.toLowerCase().includes(search.toLowerCase()) ||
      l.description?.toLowerCase().includes(search.toLowerCase())
    );
    if (minPrice) res = res.filter(l => (l.price || 0) >= Number(minPrice));
    if (maxPrice) res = res.filter(l => (l.price || 0) <= Number(maxPrice));

    if (sort === 'price_asc')  res.sort((a, b) => (a.price || 0) - (b.price || 0));
    if (sort === 'price_desc') res.sort((a, b) => (b.price || 0) - (a.price || 0));
    if (sort === 'date_desc')  res.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    // Featured first
    return [...res.filter(l => l.featured), ...res.filter(l => !l.featured)];
  }, [published, typeFilter, transactionFilter, zoneFilter, search, minPrice, maxPrice, sort]);

  const companyName = orgSettings?.companyName || 'Minsouah Immobilier';

  return (
    <div className="min-h-screen bg-background">

      {/* ── Top Nav ── */}
      <nav className="sticky top-0 z-40 bg-surface/95 backdrop-blur border-b border-outline-variant/20 px-4 sm:px-8 py-3 flex items-center justify-between gap-4">
        <button onClick={() => navigate('/')} className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center">
            <Icon name="domain" size={18} className="text-on-primary" />
          </div>
          <span className="font-black text-primary text-lg tracking-tight hidden sm:block">{companyName}</span>
        </button>

        {/* Search bar — desktop */}
        <div className="hidden md:flex flex-1 max-w-xl mx-4 relative">
          <Icon name="search" size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un bien, une zone…"
            className="w-full pl-10 pr-4 py-2.5 bg-surface-container rounded-full text-sm border border-outline-variant focus:outline-none focus:border-primary transition-colors"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-outline">
              <Icon name="close" size={14} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setShowFilters(s => !s)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border transition-colors ${showFilters ? 'bg-primary text-on-primary border-primary' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
            <Icon name="tune" size={15} /> Filtres
            {(typeFilter !== 'all' || transactionFilter !== 'all' || zoneFilter || minPrice || maxPrice) && (
              <span className="w-2 h-2 bg-amber-500 rounded-full" />
            )}
          </button>
          <button onClick={() => navigate('/superadmin')}
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs border border-outline-variant text-on-surface-variant hover:bg-surface-container transition-colors">
            <Icon name="manage_accounts" size={14} /> Admin
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative bg-gradient-to-br from-primary via-primary/90 to-secondary px-4 sm:px-8 py-14 sm:py-20 text-center overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'white\' fill-opacity=\'1\' fill-rule=\'evenodd\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/svg%3E")' }} />
        <div className="relative max-w-3xl mx-auto">
          <p className="text-on-primary/80 text-sm font-semibold uppercase tracking-widest mb-3">Trouvez votre bien idéal</p>
          <h1 className="text-4xl sm:text-5xl font-black text-on-primary leading-tight mb-3">
            L'immobilier<br className="sm:hidden" /> en Côte d'Ivoire
          </h1>
          <p className="text-on-primary/70 text-base sm:text-lg mb-8 max-w-xl mx-auto">
            Locations, ventes, terrains, résidences meublées — découvrez les meilleures offres sélectionnées par {companyName}.
          </p>

          {/* Mobile search */}
          <div className="md:hidden relative max-w-md mx-auto mb-6">
            <Icon name="search" size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher…"
              className="w-full pl-10 pr-4 py-3 bg-white rounded-full text-sm focus:outline-none shadow-lg"
            />
          </div>

          {/* Transaction toggle */}
          <div className="inline-flex bg-white/20 backdrop-blur rounded-full p-1 gap-0.5">
            {TRANSACTIONS.map(t => (
              <button key={t.value} onClick={() => setTransactionFilter(t.value)}
                className={`px-5 py-2 rounded-full text-sm font-bold transition-all ${transactionFilter === t.value ? 'bg-white text-primary shadow' : 'text-on-primary/80 hover:bg-white/10'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats bar ── */}
      <div className="bg-surface border-b border-outline-variant/20 px-4 sm:px-8 py-2 flex items-center gap-6 text-xs text-on-surface-variant overflow-x-auto no-scrollbar">
        <span className="font-semibold text-on-surface">{filtered.length} annonce(s) disponible(s)</span>
        <span>·</span>
        <span>{published.filter(l => l.transaction === 'location').length} locations</span>
        <span>·</span>
        <span>{published.filter(l => l.transaction === 'vente').length} ventes</span>
        <span>·</span>
        <span>{published.filter(l => l.featured).length} coups de cœur</span>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 flex flex-col gap-6">

        {/* ── Filter panel ── */}
        {showFilters && (
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 p-5 shadow-sm">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5">Zone</label>
                <select value={zoneFilter} onChange={e => setZoneFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-xl text-sm focus:outline-none focus:border-primary">
                  <option value="">Toutes les zones</option>
                  {zones.map(z => <option key={z} value={z}>{z}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5">Budget min</label>
                <input type="number" placeholder="0" value={minPrice} onChange={e => setMinPrice(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-xl text-sm focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5">Budget max</label>
                <input type="number" placeholder="∞" value={maxPrice} onChange={e => setMaxPrice(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-xl text-sm focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5">Trier par</label>
                <select value={sort} onChange={e => setSort(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-xl text-sm focus:outline-none focus:border-primary">
                  {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="flex items-end">
                <button onClick={() => { setTypeFilter('all'); setTransactionFilter('all'); setZoneFilter(''); setMinPrice(''); setMaxPrice(''); setSearch(''); }}
                  className="w-full px-3 py-2 text-sm font-semibold text-on-surface-variant border border-outline-variant rounded-xl hover:bg-surface-container transition-colors flex items-center justify-center gap-1">
                  <Icon name="restart_alt" size={14} /> Réinitialiser
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Type filter pills ── */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {TYPES.map(t => (
            <button key={t.value} onClick={() => setTypeFilter(t.value)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all flex-shrink-0 ${typeFilter === t.value ? 'bg-primary text-on-primary shadow-md' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high border border-outline-variant/20'}`}>
              <Icon name={t.icon} size={15} />{t.label}
            </button>
          ))}
        </div>

        {/* ── Grid ── */}
        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <Icon name="search_off" size={56} className="text-outline-variant/40 mx-auto mb-4" />
            <p className="font-bold text-on-surface text-lg">Aucun bien ne correspond à votre recherche</p>
            <p className="text-on-surface-variant text-sm mt-2">Essayez d'élargir vos critères ou consultez toutes les annonces.</p>
            <button onClick={() => { setTypeFilter('all'); setTransactionFilter('all'); setZoneFilter(''); setMinPrice(''); setMaxPrice(''); setSearch(''); }}
              className="mt-5 px-5 py-2.5 bg-primary text-on-primary rounded-xl font-bold text-sm">
              Voir toutes les annonces
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filtered.map(l => (
              <PropertyCard
                key={l.id}
                listing={l}
                onOpen={setSelectedListing}
                isFav={favs.has(l.id)}
                onToggleFav={toggleFav}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <footer className="bg-surface border-t border-outline-variant/20 px-4 sm:px-8 py-8 mt-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-on-surface-variant">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center">
              <Icon name="domain" size={15} className="text-on-primary" />
            </div>
            <span className="font-black text-primary">{companyName}</span>
          </div>
          <p>© {new Date().getFullYear()} {companyName} — Tous droits réservés</p>
          <button onClick={() => navigate('/')} className="flex items-center gap-1 hover:text-primary transition-colors">
            <Icon name="lock" size={13} /> Espace professionnel
          </button>
        </div>
      </footer>

      {/* ── Detail modal ── */}
      {selectedListing && (
        <ListingDetailModal
          listing={selectedListing}
          onClose={() => setSelectedListing(null)}
          onToggleFav={toggleFav}
          isFav={favs.has(selectedListing.id)}
          onDispatch={dispatch}
        />
      )}
    </div>
  );
}
