// Réduit la police d'icônes Material Symbols aux seules icônes utilisées.
//
// Sans cela, Google envoie la police complète (~295 Ko, 4 300 icônes) et,
// avec display=block, les icônes restent invisibles tant qu'elle n'est pas
// arrivée. Avec la liste « icon_names », le fichier tombe à ~25 Ko.
//
// Lancé automatiquement avant chaque build (npm run build → prebuild).
// Principe : toute chaîne du code source qui est un nom d'icône officiel est
// gardée (liste officielle : scripts/material-symbols-names.txt). Garder un
// mot en trop coûte quelques octets ; en oublier un afficherait son nom en
// texte, d'où ce balayage large plutôt qu'une liste tenue à la main.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const official = new Set(readFileSync(join(root, 'scripts/material-symbols-names.txt'), 'utf8').split('\n').filter(Boolean));

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(jsx?|tsx?)$/.test(name)) files.push(p);
  }
};
walk(join(root, 'src'));

const used = new Set();
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/['"`>]([a-z][a-z0-9_]{1,40})['"`<]/g)) {
    if (official.has(m[1])) used.add(m[1]);
  }
}
const names = [...used].sort(); // Google exige l'ordre alphabétique

const htmlPath = join(root, 'index.html');
const html = readFileSync(htmlPath, 'utf8');
const re = /(https:\/\/fonts\.googleapis\.com\/css2\?family=Material\+Symbols\+Outlined:[^"&]+)(&icon_names=[^"&]*)?/;
if (!re.test(html)) {
  console.error('[icones] lien Material Symbols introuvable dans index.html');
  process.exit(1);
}
const next = html.replace(re, `$1&icon_names=${names.join(',')}`);
if (next !== html) writeFileSync(htmlPath, next);
console.log(`[icones] ${names.length} icônes gardées dans la police`);
