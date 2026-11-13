/* ────────────────────────────────────────────────────────────────────────────
   MINSOUAH RECONNAISSANCE — Générateur de certificats.
   Produit un CERTIFICAT en SVG autonome (A4 paysage) selon le type de
   distinction, avec un QR code de vérification. Le même SVG sert au PDF
   (impression) et à l'image PNG (partage WhatsApp). Aucune donnée financière
   n'y figure.
   ──────────────────────────────────────────────────────────────────────────── */

import { AWARD_BY_KEY } from './recognition';

// Thème graphique par distinction.
const THEMES = {
  EXCELLENCE: { name: 'Or', main: '#b8860b', soft: '#fdf6e3', accent: '#8a6508' },
  EXEMPLAIRE: { name: 'Bleu', main: '#1d4ed8', soft: '#eef4ff', accent: '#1e3a8a' },
  REGULIER: { name: 'Vert', main: '#15803d', soft: '#f0fdf4', accent: '#166534' },
  PARTENAIRE: { name: 'Premium', main: '#7c3aed', soft: '#f5f3ff', accent: '#5b21b6' },
  FIDELE: { name: 'Fidélité', main: '#0f766e', soft: '#f0fdfa', accent: '#115e59' },
};

const MESSAGES = {
  EXCELLENCE: "Pour la rigueur exemplaire dont vous avez fait preuve tout au long de l'année : chaque loyer réglé, dans les délais, sans le moindre incident. Votre sérieux force le respect.",
  EXEMPLAIRE: "Pour une année sans fausse note : l'ensemble de vos loyers réglés avec ponctualité et rigueur. Un comportement locatif exemplaire.",
  REGULIER: "Pour votre constance et votre engagement à honorer vos loyers et à solder votre année. Une régularité que Minsouah tient à saluer.",
  PARTENAIRE: "Pour une relation de confiance bâtie au fil des années, faite de régularité et de respect mutuel. Vous êtes, pour Minsouah, un véritable partenaire.",
  FIDELE: "Pour votre fidélité et la constance de vos règlements au fil des années. Votre confiance est précieuse et Minsouah vous en remercie.",
};

const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Découpe un texte en lignes d'environ `max` caractères (pour le SVG).
function wrap(text, max) {
  const words = String(text || '').split(/\s+/); const lines = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > max) { if (cur) lines.push(cur.trim()); cur = w; } else cur += ' ' + w; }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}

/** Construit le certificat (SVG) + l'URL de vérification. */
export async function buildCertificate(award, org, baseUrl) {
  const QR = (await import('qrcode')).default;
  const num = award.certificate_number || `MR-${award.year}-${award.tenantId}`;
  const verifyUrl = `${baseUrl || ''}#/certificat/${encodeURIComponent(num)}`;
  let qrDataUrl = '';
  try { qrDataUrl = await QR.toDataURL(verifyUrl, { margin: 1, width: 150, color: { dark: '#222222', light: '#ffffff' } }); } catch { /* QR optionnel */ }
  const svg = certSVG({ award, org, num, qrDataUrl });
  return { svg, verifyUrl, num };
}

function certSVG({ award, org, num, qrDataUrl }) {
  const W = 1123, H = 794, M = 28;
  const def = AWARD_BY_KEY[award.award_type] || { label: award.label || 'Distinction', emoji: '★' };
  const th = THEMES[award.award_type] || THEMES.REGULIER;
  const company = (org && org.companyName) || 'Minsouah';
  const logo = (org && org.logo && String(org.logo).startsWith('data:')) ? org.logo : ''; // data URL only (pour le PNG)
  const stamp = (org && org.stamp && String(org.stamp).startsWith('data:')) ? org.stamp : '';
  const dateStr = award.awarded_at ? new Date(award.awarded_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : new Date().toLocaleDateString('fr-FR');
  const msgLines = wrap(MESSAGES[award.award_type] || '', 78);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Georgia, 'Times New Roman', serif">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <rect x="10" y="10" width="${W - 20}" height="${H - 20}" fill="${th.soft}"/>
  <rect x="${M}" y="${M}" width="${W - M * 2}" height="${H - M * 2}" fill="#ffffff" stroke="${th.main}" stroke-width="3"/>
  <rect x="${M + 8}" y="${M + 8}" width="${W - (M + 8) * 2}" height="${H - (M + 8) * 2}" fill="none" stroke="${th.accent}" stroke-width="1"/>
  <!-- coins décoratifs -->
  ${[[M, M], [W - M, M], [M, H - M], [W - M, H - M]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7" fill="${th.main}"/>`).join('')}

  <!-- entête -->
  ${logo ? `<image href="${logo}" x="${W / 2 - 40}" y="56" width="80" height="80" preserveAspectRatio="xMidYMid meet"/>` : ''}
  <text x="${W / 2}" y="${logo ? 170 : 110}" text-anchor="middle" font-size="30" fill="${th.accent}" font-weight="bold" letter-spacing="2">${esc(company).toUpperCase()}</text>
  <text x="${W / 2}" y="${logo ? 196 : 136}" text-anchor="middle" font-size="13" fill="#888" font-style="italic">Votre sérieux mérite d'être reconnu.</text>

  <text x="${W / 2}" y="252" text-anchor="middle" font-size="22" fill="#555" letter-spacing="6">CERTIFICAT DE RECONNAISSANCE</text>
  <line x1="${W / 2 - 170}" y1="268" x2="${W / 2 + 170}" y2="268" stroke="${th.main}" stroke-width="1.5"/>

  <!-- distinction -->
  <text x="${W / 2}" y="320" text-anchor="middle" font-size="40" fill="${th.main}" font-weight="bold">${def.emoji || ''} ${esc(def.label)}</text>

  <text x="${W / 2}" y="372" text-anchor="middle" font-size="16" fill="#666">est fièrement décerné à</text>
  <text x="${W / 2}" y="420" text-anchor="middle" font-size="40" fill="#1a1a1a" font-weight="bold">${esc(award.tenantName)}</text>
  <line x1="${W / 2 - 240}" y1="434" x2="${W / 2 + 240}" y2="434" stroke="#ddd" stroke-width="1"/>
  ${award.property ? `<text x="${W / 2}" y="462" text-anchor="middle" font-size="15" fill="#666">Résidence / Logement : ${esc(award.property)}</text>` : ''}
  <text x="${W / 2}" y="${award.property ? 492 : 470}" text-anchor="middle" font-size="17" fill="#333">au titre de l'exercice ${esc(award.year)}</text>

  <!-- message -->
  ${msgLines.map((l, i) => `<text x="${W / 2}" y="${535 + i * 24}" text-anchor="middle" font-size="14" fill="#555" font-style="italic">${esc(l)}</text>`).join('')}

  <!-- sceau -->
  <g transform="translate(130, ${H - 150})">
    <circle r="56" fill="none" stroke="${th.main}" stroke-width="3"/>
    <circle r="46" fill="${th.soft}" stroke="${th.accent}" stroke-width="1"/>
    <text text-anchor="middle" y="-6" font-size="30">${def.emoji || '✔'}</text>
    <text text-anchor="middle" y="22" font-size="10" fill="${th.accent}" font-weight="bold">MINSOUAH</text>
  </g>

  <!-- signature — « La Direction » puis le nom de l'agence sur DEUX lignes pour
       ne jamais déborder du cadre, même avec un nom long. -->
  <g transform="translate(${W - 300}, ${H - 150})">
    ${stamp ? `<image href="${stamp}" x="55" y="-36" width="120" height="66" preserveAspectRatio="xMidYMid meet" opacity="0.9"/>` : ''}
    <line x1="10" y1="40" x2="250" y2="40" stroke="#888" stroke-width="1"/>
    <text x="130" y="57" text-anchor="middle" font-size="12" fill="#666">La Direction</text>
    <text x="130" y="75" text-anchor="middle" font-size="${String(company).length > 24 ? 11 : 13}" fill="#333" font-weight="bold">${esc(company)}</text>
  </g>

  <!-- bas : numéro + date + QR -->
  ${qrDataUrl ? `<image href="${qrDataUrl}" x="${W / 2 - 42}" y="${H - 132}" width="84" height="84"/>
  <text x="${W / 2}" y="${H - 40}" text-anchor="middle" font-size="10" fill="#999">Vérifiez l'authenticité avec ce QR code</text>` : ''}
  <text x="${M + 20}" y="${H - 44}" font-size="11" fill="#777">N° ${esc(num)}</text>
  <text x="${W - M - 20}" y="${H - 44}" text-anchor="end" font-size="11" fill="#777">Délivré le ${esc(dateStr)}</text>
</svg>`;
}

/** Page HTML autonome pour impression / PDF (A4 paysage). */
export function certificateHTML(svg, title) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title || 'Certificat')}</title>
  <style>@page{size:A4 landscape;margin:0} *{margin:0;padding:0} body{display:flex;align-items:center;justify-content:center} svg{width:100%;height:auto;max-width:100%}
  @media screen{body{background:#eee;padding:16px} svg{box-shadow:0 2px 16px rgba(0,0,0,.2);background:#fff}}</style>
  </head><body>${svg}<script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`;
}
