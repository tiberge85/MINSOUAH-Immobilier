#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  Déploiement MINSOUAH — version robuste et bavarde.
#  Commite les fichiers modifiés puis pousse sur GitHub (déclenche Render).
#  Chaque étape affiche clairement son résultat ; en cas d'échec du push,
#  l'erreur exacte de git s'affiche (copie-la moi si ça bloque encore).
# ─────────────────────────────────────────────────────────────
cd "$HOME/Documents/PROJET DE PROGRAMMATION/MINSOUAH" || { echo "!!! Dossier projet introuvable"; exit 1; }

FILES="src/lib/permissions.js src/lib/monthMetrics.js src/pages/Assets.jsx src/pages/Rental.jsx src/pages/Dashboard.jsx src/pages/Finance.jsx src/pages/OwnerPortal.jsx"

echo "========================================"
echo " 1/5  Etat de depart"
echo "========================================"
echo "Branche : $(git rev-parse --abbrev-ref HEAD)"
echo "Dernier commit local : $(git log --oneline -1)"

echo ""
echo "========================================"
echo " 2/5  Ajout des fichiers"
echo "========================================"
git update-index --no-assume-unchanged $FILES 2>/dev/null || true
git add -f $FILES
echo "Fichiers prets a etre commites :"
git diff --cached --name-only

echo ""
echo "========================================"
echo " 3/5  Commit"
echo "========================================"
if git diff --cached --quiet; then
  echo "(rien de nouveau a commiter — deja fait lors d'un run precedent)"
else
  git commit -m "MINSOUAH: coherence chiffres du mois + concierge sans finances + archivage depenses"
  echo "Commit cree : $(git log --oneline -1)"
fi

echo ""
echo "========================================"
echo " 4/5  Push vers GitHub (declenche Render)"
echo "========================================"
echo "Commits locaux en avance sur GitHub :"
git log --oneline @{u}..HEAD 2>/dev/null || echo "(impossible de comparer — on pousse quand meme)"
echo ""
if git push origin main; then
  echo ""
  echo "########################################"
  echo "#   PUSH REUSSI                        #"
  echo "#   Render va redeployer (~2-4 min)    #"
  echo "########################################"
  echo "Commit publie : $(git log --oneline -1)"
else
  echo ""
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  echo "!!!  PUSH ECHOUE                       !!!"
  echo "!!!  Copie-moi les lignes ci-dessus.   !!!"
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  exit 1
fi

echo ""
echo "========================================"
echo " 5/5  Regles Firestore (module Rapports) — optionnel"
echo "========================================"
if npx firebase-tools deploy --only firestore:rules --project minsouah-7d698; then
  echo "Regles Firestore deployees."
else
  echo "(Regles Firestore non deployees — sans impact sur le site. Ignore si pas besoin.)"
fi

echo ""
echo "TERMINE. Attends 2-4 min puis recharge le site (Cmd+Shift+R pour vider le cache)."
