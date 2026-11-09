/*
 * Formats d'affichage uniques pour toute l'application.
 * Avant : 19 fonctions `fmt` locales, deux locales (fr-CI / fr-FR) et deux
 * unités (FCFA / XOF). Désormais : « 1 250 000 FCFA » partout.
 *
 * Le séparateur de milliers est une espace insécable classique (U+00A0) :
 * l'espace fine (U+202F) produite par Intl s'affiche mal dans certains PDF
 * et impressions.
 */
const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

/** 1250000 → « 1 250 000 » */
export const formatNumber = (n) => nf.format(Number(n) || 0).replace(/[   ]/g, ' ');

/** 1250000 → « 1 250 000 FCFA » */
export const formatFCFA = (n) => `${formatNumber(n)} FCFA`;

/** Date courte « 09/11/2026 » (vide si la date est absente ou invalide). */
export const formatDate = (d) => {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

/** Accord simple : plural(1, 'location') → « 1 location », plural(3, 'location') → « 3 locations ». */
export const plural = (n, singular, pluralForm = `${singular}s`) => `${n} ${Math.abs(n) > 1 ? pluralForm : singular}`;
