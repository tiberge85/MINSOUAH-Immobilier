import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

const WS = import.meta.env.VITE_FIREBASE_WORKSPACE || 'minsouah';

const BRAND = '#785a00';

const fmt = (n) => Number(n || 0).toLocaleString('fr-CI') + ' FCFA';

const STATUS_STYLE = {
  'Payé':      { bg: '#dcfce7', color: '#166534', label: 'Payé' },
  'Impayé':    { bg: '#fee2e2', color: '#991b1b', label: 'Impayé' },
  'En retard': { bg: '#fef3c7', color: '#92400e', label: 'En retard' },
  'Annulé':    { bg: '#f3f4f6', color: '#6b7280', label: 'Annulé' },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || { bg: '#f3f4f6', color: '#6b7280', label: status || '—' };
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: '999px',
      background: s.bg,
      color: s.color,
      fontSize: '12px',
      fontWeight: 700,
    }}>
      {s.label}
    </span>
  );
}

export default function PublicTenantPortal() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!token) { setNotFound(true); setLoading(false); return; }
    getDoc(doc(db, 'workspaces', WS, 'tenantPortals', token))
      .then((snap) => {
        if (!snap.exists()) {
          setNotFound(true);
        } else {
          setData(snap.data());
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div style={styles.centerPage}>
        <div style={styles.spinner} />
        <p style={{ color: BRAND, fontWeight: 600, marginTop: 16 }}>Chargement du portail…</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={styles.centerPage}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>404</div>
        <h1 style={{ color: BRAND, fontWeight: 800, fontSize: 22, margin: 0 }}>Portail introuvable</h1>
        <p style={{ color: '#6b7280', marginTop: 8, fontSize: 14 }}>
          Ce lien est invalide ou a expiré. Contactez votre gestionnaire immobilier.
        </p>
      </div>
    );
  }

  const payments = data.payments || [];
  const paid = payments.filter(p => p.status === 'Payé');
  const unpaid = payments.filter(p => p.status !== 'Payé' && p.status !== 'Annulé');
  const totalPaid = paid.reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalDue = unpaid.reduce((s, p) => s + Number(p.amount || 0), 0);
  const rate = payments.length > 0
    ? Math.round((paid.length / payments.filter(p => p.status !== 'Annulé').length) * 100) || 0
    : 0;

  const fmtDate = (d) => {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt)) return d;
    return dt.toLocaleDateString('fr-CI');
  };

  return (
    <>
      <style>{`
        @media print {
          body { margin: 0; }
          .no-print { display: none !important; }
          .page { box-shadow: none !important; max-width: 100% !important; }
        }
        body { margin: 0; background: #f5f5f0; font-family: Arial, sans-serif; }
        * { box-sizing: border-box; }
      `}</style>

      <div style={styles.page} className="page">
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.logoBlock}>
            <div style={styles.logoMark}>M</div>
            <div>
              <div style={styles.brandName}>Minsouah</div>
              <div style={styles.brandSub}>Gestion Immobilière</div>
            </div>
          </div>
          <div style={styles.headerRight}>
            <div style={styles.headerTitle}>Portail Locataire</div>
            <div style={styles.headerProp}>{data.propertyName || '—'}</div>
          </div>
        </div>

        {/* Tenant Info */}
        <div style={styles.tenantBar}>
          <div>
            <span style={styles.tenantLabel}>Locataire</span>
            <div style={styles.tenantName}>{data.tenantName || '—'}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={styles.tenantLabel}>Bien loué</span>
            <div style={styles.tenantProp}>{data.propertyName || '—'}</div>
          </div>
        </div>

        {/* Summary Cards */}
        <div style={styles.cards}>
          <SummaryCard
            label="Total payé"
            value={fmt(totalPaid)}
            color="#166534"
            bg="#dcfce7"
            icon="✓"
          />
          <SummaryCard
            label="Total dû"
            value={fmt(totalDue)}
            color="#991b1b"
            bg="#fee2e2"
            icon="!"
          />
          <SummaryCard
            label="Taux de paiement"
            value={`${rate}%`}
            color={rate >= 80 ? '#166534' : rate >= 50 ? '#92400e' : '#991b1b'}
            bg={rate >= 80 ? '#dcfce7' : rate >= 50 ? '#fef3c7' : '#fee2e2'}
            icon="~"
          />
        </div>

        {/* Payment History */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Historique des paiements</div>
          {payments.length === 0 ? (
            <div style={styles.emptyState}>Aucun paiement enregistré</div>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.thead}>
                    <th style={styles.th}>Mois</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Montant</th>
                    <th style={styles.th}>Statut</th>
                    <th style={styles.th}>Date paiement</th>
                    <th style={styles.th}>Mode</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p, i) => (
                    <tr key={i} style={i % 2 === 0 ? styles.trEven : styles.trOdd}>
                      <td style={styles.td}>{p.month || '—'}</td>
                      <td style={{ ...styles.td, textAlign: 'right', fontWeight: 700, color: BRAND }}>
                        {fmt(p.amount)}
                      </td>
                      <td style={styles.td}><StatusBadge status={p.status} /></td>
                      <td style={styles.td}>{p.paidDate ? fmtDate(p.paidDate) : '—'}</td>
                      <td style={{ ...styles.td, color: '#6b7280' }}>{p.method || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Summary Row */}
        {payments.length > 0 && (
          <div style={styles.summaryRow}>
            <span>{paid.length}/{payments.filter(p => p.status !== 'Annulé').length} paiements effectués</span>
            <span style={{ fontWeight: 700, color: BRAND }}>Total payé : {fmt(totalPaid)}</span>
          </div>
        )}

        {/* Footer */}
        <div style={styles.footer}>
          <div>Généré le {fmtDate(data.generatedAt)} — Minsouah Gestion Immobilière</div>
          <div style={{ marginTop: 4, color: '#9ca3af', fontSize: 11 }}>
            Document confidentiel — Usage locataire uniquement
          </div>
        </div>

        {/* Print button (hidden on print) */}
        <div className="no-print" style={{ textAlign: 'center', marginTop: 24, paddingBottom: 32 }}>
          <button
            onClick={() => window.print()}
            style={styles.printBtn}
          >
            Imprimer / Télécharger PDF
          </button>
        </div>
      </div>
    </>
  );
}

function SummaryCard({ label, value, color, bg, icon }) {
  return (
    <div style={{ ...styles.card, background: bg }}>
      <div style={{ ...styles.cardIcon, color, borderColor: color + '40' }}>{icon}</div>
      <div style={{ ...styles.cardValue, color }}>{value}</div>
      <div style={styles.cardLabel}>{label}</div>
    </div>
  );
}

const styles = {
  centerPage: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'Arial, sans-serif',
    background: '#f5f5f0',
    color: '#374151',
    textAlign: 'center',
    padding: '24px',
  },
  spinner: {
    width: 40,
    height: 40,
    border: `4px solid ${BRAND}30`,
    borderTop: `4px solid ${BRAND}`,
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  page: {
    maxWidth: 820,
    margin: '24px auto',
    background: '#ffffff',
    borderRadius: 16,
    boxShadow: '0 4px 32px rgba(0,0,0,0.10)',
    overflow: 'hidden',
    fontFamily: 'Arial, sans-serif',
    color: '#111827',
  },
  header: {
    background: BRAND,
    color: '#fff',
    padding: '20px 28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  logoBlock: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  logoMark: {
    width: 44,
    height: 44,
    borderRadius: 10,
    background: 'rgba(255,255,255,0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 22,
    fontWeight: 900,
    color: '#fff',
    flexShrink: 0,
  },
  brandName: {
    fontSize: 22,
    fontWeight: 900,
    letterSpacing: '-0.5px',
    lineHeight: 1,
  },
  brandSub: {
    fontSize: 11,
    opacity: 0.8,
    marginTop: 2,
  },
  headerRight: {
    textAlign: 'right',
  },
  headerTitle: {
    fontSize: 13,
    opacity: 0.85,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  headerProp: {
    fontSize: 17,
    fontWeight: 800,
    marginTop: 2,
  },
  tenantBar: {
    background: '#fef9f0',
    borderBottom: `3px solid ${BRAND}20`,
    padding: '14px 28px',
    display: 'flex',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  tenantLabel: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: '#9ca3af',
    display: 'block',
  },
  tenantName: {
    fontSize: 18,
    fontWeight: 800,
    color: BRAND,
    marginTop: 2,
  },
  tenantProp: {
    fontSize: 14,
    fontWeight: 600,
    color: '#374151',
    marginTop: 2,
  },
  cards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 16,
    padding: '20px 28px',
  },
  card: {
    borderRadius: 12,
    padding: '16px 18px',
    textAlign: 'center',
  },
  cardIcon: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    border: '2px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 8px',
    fontWeight: 900,
    fontSize: 15,
  },
  cardValue: {
    fontSize: 20,
    fontWeight: 900,
    lineHeight: 1,
  },
  cardLabel: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: 600,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
  },
  section: {
    padding: '0 28px 20px',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: BRAND,
    borderLeft: `4px solid ${BRAND}`,
    paddingLeft: 10,
    marginBottom: 12,
  },
  tableWrap: {
    borderRadius: 10,
    overflow: 'hidden',
    border: '1px solid #e5e7eb',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  thead: {
    background: BRAND,
  },
  th: {
    color: '#fff',
    padding: '10px 14px',
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    textAlign: 'left',
  },
  td: {
    padding: '10px 14px',
    verticalAlign: 'middle',
    borderBottom: '1px solid #f3f4f6',
  },
  trEven: { background: '#ffffff' },
  trOdd:  { background: '#fafaf8' },
  summaryRow: {
    margin: '0 28px 20px',
    padding: '10px 16px',
    background: '#fef9f0',
    borderRadius: 8,
    border: `1px solid ${BRAND}20`,
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 13,
    color: '#6b7280',
    flexWrap: 'wrap',
    gap: 8,
  },
  emptyState: {
    textAlign: 'center',
    padding: '32px',
    color: '#9ca3af',
    fontSize: 14,
    background: '#f9fafb',
    borderRadius: 10,
    border: '1px dashed #d1d5db',
  },
  footer: {
    borderTop: `1px solid #e5e7eb`,
    padding: '14px 28px',
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
  },
  printBtn: {
    padding: '12px 28px',
    background: BRAND,
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
  },
};
