# Composants UI partagés

Constat général : pas de bundler ni de composants réutilisables au sens framework — chaque "vue" est un objet JS global qui régénère du HTML via `innerHTML`. Certains éléments UI sont mutualisés via des fonctions JS dans `js/utils.js`, d'autres sont de simples **conventions CSS répétées à la main** dans chaque vue (source de duplication à corriger dans la refonte — signalé à chaque fois ci-dessous).

---

## 1. Navigation principale — `NavBar()` (js/utils.js)
- Génère la barre de navigation : **bottom-nav mobile** + **sidebar desktop** (240px déployée / 58px repliée).
- Sidebar desktop : logo, sections groupées par thème (Accueil / Activité / Données / Admin), items filtrés dynamiquement selon les permissions du rôle connecté, pied de sidebar avec avatar utilisateur + bouton Synchroniser + Déconnexion.
- Catalogue des 17 entrées de navigation et leurs icônes SVG codés en dur dans la fonction.

## 2. Menu tiroir mobile — `DrawerMenu` (js/utils.js)
- Volet latéral gauche, ouvert par le bouton hamburger de la barre mobile.
- Monté dans une racine séparée (`#drawer-root`) qui persiste à travers les changements de vue.
- Possède sa propre liste d'items filtrée par rôle — **dupliquée** avec le catalogue de `NavBar()` (mêmes libellés, icônes parfois différentes) : point de duplication à corriger.

## 3. Barre de titre desktop — `Topbar` (js/utils.js)
- Barre persistante en haut de l'écran desktop, montée dans `#topbar-root`.
- Affiche un fil d'ariane déduit automatiquement du titre `<h1>` de la vue active (observation passive du DOM), masquée si la vue a déjà son propre en-tête.

## 4. Carte KPI — `kpiCard(opts)` (js/utils.js)
- Signature : `{ label, value, unit?, accent?, pills?, onclick? }`.
- Carte avec barre d'accent colorée, libellé, valeur, unité, pastilles optionnelles ; cliquable pour naviguer.
- Utilisée massivement dans les dashboards (grilles de KPI).

## 5. Badge de statut — `statusBadge(statut, label)` (js/utils.js)
- Génère un badge coloré selon un statut de pipeline (à traiter / assigné / en cours / saisie / intégré / archivé).
- ⚠️ Un des **6 systèmes de badges/pills parallèles** trouvés dans le code (voir section 9) — non unifié.

## 6. Graphique camembert — `svgDonut()` + `legendeDonut()` (js/utils.js)
- Génère un anneau SVG (jamais un disque plein) + une légende HTML séparée.
- Utilisé dans les dashboards (répartition visites/appels par statut ou par commercial).

## 7. États de chargement — `skeletonKanban()`, `skeletonListe()`, `skeletonKPI()` (js/utils.js)
- Blocs de squelette avec effet "shimmer" (animation CSS), affichés pendant le chargement des données.
- Convention respectée dans la majorité des vues (bon point pour la refonte : à conserver comme pattern systématique).

## 8. Avatar commercial — `avatarCDS(pinOuNom, taille)` (js/utils.js)
- Couleur stable par commercial (mapping nom → couleur, avec repli par hash si le nom n'est pas dans la table).

## 9. Système de badges/pills de statut — **fragmenté, à unifier**
Au moins 6 familles de classes CSS coexistent pour représenter un statut (lead, compte, appel, potentiel...) :
- `.badge-*` (converti / à rappeler / chaud / inactif / intéressé / non appelé / NRP / score)
- `.statut-pill` + variantes
- `.status-badge` (généré par `statusBadge()`)
- `.pot-pill` (potentiel du lead : fort/moyen/faible)
- `.pill-soft` + variantes de couleur (vert/bleu/orange/rouge/gris/primaire/corail)
- badges de statut compte avec emoji (🟢/🟡/🔴) générés par une fonction dédiée

**Recommandation pour la refonte** : concevoir un unique composant "badge de statut" paramétrable (couleur sémantique + label + variante pleine/soft/point) qui couvre tous ces cas d'usage.

## 10. Barre de filtres — deux variantes CSS, pas de composant JS unique
- Variante A (`.filter-bar` / `.filter-chip`) : chips retirables, peu utilisée.
- Variante B (`.barre-filtres` / `.btn-filtre`) : effectivement utilisée, ex. Tracker (recherche + 5 menus déroulants : commercial, statut, potentiel, alerte, origine, canal).
- Chaque vue reconstruit ses propres champs de filtre "à la main" — pas de composant `FilterBar()` générique.

## 11. Modales / boîtes de dialogue — **aucun composant JS partagé**
- Uniquement une convention CSS (`.modal-overlay` / `.modal`), fermeture par clic sur l'overlay.
- **22 implémentations de modale quasi-identiques**, chacune codée à la main dans sa vue (primes, questionnaire, objectifs, admin, tracker, fiche compte, phoning, visites, vue équipe).
- **Recommandation** : c'est le point de duplication le plus important du code actuel — un composant `Modal()` générique est un quick-win fort pour la refonte.

## 12. Panneau latéral docké (détail, desktop uniquement)
- Variante de modale ancrée à droite (440px), utilisée pour la fiche lead du Tracker sur desktop ≥900px (liste/Kanban restent cliquables derrière).
- Un commentaire dans le code indique que ce pattern était prévu pour Planning, Phoning et Fiche compte, mais **seul le Tracker l'utilise aujourd'hui** — piste d'harmonisation pour la refonte.

## 13. Barre d'actions fixe bas (fiche compte)
- Boutons d'action rapide (Visiter / Appeler / Planifier) ancrés en bas d'écran sur la fiche compte.

## 14. Bouton d'action flottant (FAB)
- Bouton "+" flottant (ex. nouveau lead sur le Tracker), variante export Excel sur mobile.

## 15. Centre de notifications — `NotifCenter` (js/notif-center.js)
- Composant global autonome (pas lié à une route) : cloche flottante + badge de compteur + panneau déroulant.
- Alimenté par un polling réseau toutes les 60 secondes (premier appel à 5 secondes).
- Table de routage interne : chaque type de notification (nouveau lead, changement de statut, visite réalisée, score IA...) pointe vers la route contextuelle correspondante (fiche compte ou Tracker), et marque la notification comme lue à l'ouverture.

## 16. Formulaires de saisie (Questionnaire / Phoning)
- Classes CSS partagées (`.q-input`, `.q-select`, `.q-chip`, `.q-arbre-btn`, `.q-slider`...) pour les champs de formulaire multi-étapes.
- La **logique** d'arbre de décision (branchement de questions) est centralisée dans `js/questionnaire-branching.js` — bon point, réutilisable.
- Le **rendu** des champs, lui, est recodé à la main dans chaque vue plutôt que via un composant `Field()` générique.

## 17. Tableaux avec tri / filtre / pagination — pattern répété
- Exemple représentatif : le tableau du Tracker (tri par colonne, pagination, sélection multiple avec barre d'actions groupées, colonnes configurables et persistées).
- Bascule automatique carte (mobile) / tableau réel (desktop ≥900px).
- Chaque vue qui a un tableau réimplémente indépendamment le tri/la pagination/la sélection — pas de composant `DataTable()` partagé.

## 18. Export de données — dupliqué entre deux mécanismes
- **CSV** : fonction partagée `generateCSV(data, filename)` (séparateur `;`, BOM UTF-8, toast de confirmation intégré) — bon point, réutilisée.
- **Excel (XLSX)** : bibliothèque SheetJS chargée en CDN, mais **chaque vue réimplémente indépendamment** la génération du classeur (Tracker, Visites — 3 exports distincts, Administration, Vue équipe). Aucune fonction `ExportXLSX()` commune.

## 19. Feedback utilisateur — `Toast.afficher(message, type, durée)` (js/toast.js)
- Mécanisme **unique et réel** de feedback (succès / info / avertissement / erreur), utilisé après quasiment chaque écriture de données dans toute l'application.
- ⚠️ Ne pas confondre avec `#save-toast`, qui n'existe que dans du code legacy non exécuté (voir `00_README_CLAUDE_DESIGN.md`, section 4).

---

## 20. Système Kanban (Tracker — pipeline de leads)

- **6 colonnes fixes** représentant le workflow de qualification : À traiter → Assigné → En cours → Compte créé → Intégré / Archivé.
- **Pas de glisser-déposer.** Le déplacement d'une carte se fait exclusivement par clic : ouverture de la fiche détail du lead → clic sur un statut cible (bouton) → écriture + fermeture + rafraîchissement. Le texte "glisser pour voir les statuts" présent dans l'interface fait référence au **scroll horizontal** de la rangée de colonnes sur mobile, pas à un drag-and-drop de cartes.
- **Deux modes de densité d'affichage**, mémorisés par l'utilisateur : mode "Cartes" (complet : nom, badge d'ancienneté, pastilles potentiel/canal, commercial assigné, alertes) et mode "Compact" (une ligne dense par lead, jusqu'à 4× plus d'éléments visibles par colonne).
- Bouton "+N autres" par colonne pour dépasser la limite d'affichage sans pagination complète.
- **Rafraîchissement en temps quasi-réel** : quand un appel ou une visite est loggé depuis une autre vue (Phoning, Questionnaire) sur un prospect déjà présent dans le Tracker, la carte correspondante est mise à jour en mémoire et le Kanban se redessine automatiquement, sans rechargement réseau — via un petit bus d'événements interne à l'application.
- **Vue Tableau alternative** (bascule par onglet) : tri de colonnes, pagination réelle, sélection multiple avec actions groupées, colonnes configurables — réservée au desktop (masquée sous 900px, jugée non pertinente sur petit écran).

---

## 21. Structure du shell applicatif (`index.html`)

```
<body>
  #drawer-root   → racine du menu tiroir mobile (persiste entre les vues)
  #topbar-root   → racine de la barre de titre desktop
  #app
    ├── écran de démarrage (splash, au premier chargement)
    └── contenu de la vue active (réécrit intégralement à chaque navigation)
```

- Aucun bundler : chaque script se déclare comme objet global (`window.VueXxx`), l'ordre de chargement dans `index.html` est donc **significatif** (les utilitaires/composants partagés doivent être chargés avant les vues qui les utilisent).
- 7 feuilles CSS chargées dans un ordre précis, la dernière (`v7.css`) agissant comme **couche de surcharge visuelle finale** sur toutes les précédentes (détail dans `03_STYLES_DESIGN_TOKENS.md`).
- Les fichiers legacy (`js/phoneos-sheets.js`, backend Apps Script, fichiers de test à la racine) **ne sont pas chargés** par l'application — code mort/hors runtime, à ignorer pour l'audit UI.
