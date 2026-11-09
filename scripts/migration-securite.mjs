#!/usr/bin/env node
/**
 * Migration de sécurité MINSOUAH — à lancer UNE FOIS, juste après le
 * déploiement des nouvelles règles Firestore.
 *
 *   1. Supprime TOUS les documents usersByUid. Avec les anciennes règles,
 *      n'importe qui pouvait y écrire « SUPER_ADMIN » : on ne peut plus leur
 *      faire confiance. Chaque utilisateur recrée le sien, validé par les
 *      nouvelles règles, à sa prochaine connexion.
 *   2. Supprime le champ `password` (hash rejouable) de toutes les fiches users.
 *   3. Liste les fiches users SANS compte Firebase Auth : ces personnes ne
 *      pourront plus se connecter tant qu'un admin n'a pas cliqué
 *      « Réinitialiser le mot de passe » (qui crée le compte et envoie le lien).
 *
 * Prérequis :
 *   - une clé de compte de service : console Firebase → Paramètres du projet →
 *     Comptes de service → « Générer une nouvelle clé privée ». NE PAS la
 *     commiter ; la supprimer après usage.
 *   - npm i firebase-admin  (dans un dossier temporaire, pas dans le projet)
 *
 * Usage :
 *   node migration-securite.mjs /chemin/cle-service.json            # simulation
 *   node migration-securite.mjs /chemin/cle-service.json --appliquer
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const [keyPath, flag] = process.argv.slice(2);
if (!keyPath) { console.error('Usage : node migration-securite.mjs cle-service.json [--appliquer]'); process.exit(1); }
const APPLY = flag === '--appliquer';
const WS = process.env.MINSOUAH_WS || 'minsouah';

initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))) });
const db = getFirestore();
const auth = getAuth();

console.log(APPLY ? '>>> MODE APPLICATION' : '>>> SIMULATION (ajoutez --appliquer pour écrire)');

// 1. usersByUid
const ub = await db.collection(`workspaces/${WS}/usersByUid`).get();
const suspicious = ub.docs.filter((d) => d.data().role === 'SUPER_ADMIN');
console.log(`\n[1] usersByUid : ${ub.size} document(s), dont ${suspicious.length} déclarant SUPER_ADMIN :`);
for (const d of suspicious) {
  let who = '(compte introuvable)';
  try { const u = await auth.getUser(d.id); who = u.email || (u.providerData.length ? u.uid : 'ANONYME ⚠'); } catch { /* ignore */ }
  console.log(`    uid=${d.id}  →  ${who}`);
}
if (APPLY) {
  for (let i = 0; i < ub.docs.length; i += 400) {
    const batch = db.batch();
    ub.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  console.log('    → tous supprimés.');
}

// 2 & 3. users
const users = await db.collection(`workspaces/${WS}/users`).get();
let withHash = 0;
const noAuth = [];
for (const d of users.docs) {
  const u = d.data();
  if ('password' in u) withHash++;
  if (u.email) {
    try { await auth.getUserByEmail(String(u.email).toLowerCase()); }
    catch { noAuth.push(`${u.email} (${u.role}, agence ${u.orgId ?? '—'})`); }
  }
}
console.log(`\n[2] users : ${users.size} fiche(s), ${withHash} avec un champ password.`);
if (APPLY && withHash) {
  const batch = db.batch();
  users.docs.filter((d) => 'password' in d.data()).forEach((d) => batch.update(d.ref, { password: FieldValue.delete() }));
  await batch.commit();
  console.log('    → champs password supprimés.');
}
console.log(`\n[3] ${noAuth.length} fiche(s) sans compte Firebase Auth (à réactiver via « Réinitialiser le mot de passe ») :`);
noAuth.forEach((l) => console.log('    ' + l));
console.log('\nTerminé.');
