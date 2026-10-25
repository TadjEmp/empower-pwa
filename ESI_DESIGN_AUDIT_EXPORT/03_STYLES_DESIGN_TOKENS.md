# Styles et design tokens

⚠️ **Constat structurel important** : le code superpose **deux systèmes de design en cascade CSS** :
1. Un premier système ("PHONE OS v4.1"), défini dans `base.css` et utilisé par `components.css`, `dashboard.css`, `pipeline.css`, `comptes.css`, `questionnaire.css` — couleurs chaudes, ombres portées, radius généreux.
2. Une **couche de surcharge finale** (`v7.css`, chargée en dernier) qui redéfinit une partie des mêmes variables CSS (couleurs, ombres → supprimées, radius réduits) sans toucher au HTML généré par les vues.

Résultat : le rendu visuel actuel à l'écran est un **hybride non unifié** — un audit visuel doit regarder le rendu final (cascade complète dans le navigateur), pas un fichier CSS isolément. C'est une motivation forte pour la refonte : repartir d'un design system unique et cohérent plutôt que de continuer à empiler des couches.

---

## 1. Design tokens (variables CSS `:root`)

### Fonds
| Token | Valeur | Usage |
|---|---|---|
| `--bg-base` | `#F5F0E8` | Fond de page |
| `--bg-surface` | `#EDE7D9` | Fond de section |
| `--bg-elevated` | `#E5DDD0` | Élément surélevé |
| `--bg-warm-white` | `#FAF8F4` | Cartes claires, modales, écran de connexion |
| `--bg-anchor` | `#343F48` | Fond sombre (sidebar, topbar, en-tête mobile, tiroir) |

### Textes
| Token | Valeur |
|---|---|
| `--text-primary` | `#1A1A2E` |
| `--text-secondary` | `#4A5568` |
| `--text-muted` | `#8A9BB0` |
| `--text-on-anchor` | `#E5E1D3` (texte sur fond sombre) |
| `--text-link` | `#FF6D68` |

### Accents
| Token | Valeur | Usage |
|---|---|---|
| `--accent-primary` | `#FF6D68` | Corail — CTA principal de l'app |
| `--accent-norton` | `#ED2567` | Magenta — brand Norton (theme-color PWA) |
| `--accent-violet` | `#A884FF` | |
| `--accent-blue` | `#3B82F6` | |

### Statuts CRM (leads / pipeline)
| Statut | Couleur |
|---|---|
| Converti | `#2D9E6B` (vert) |
| Intéressé | `#F59E0B` (ambre) |
| Chaud | `#FF6D68` (corail) |
| À rappeler | `#3B82F6` (bleu) |
| NRP (non répondu) | `#8A9BB0` (gris) |
| Non appelé | `#CBD5E0` (gris clair) |
| Inactif | `#D93025` (rouge) |
| Pas intéressé | `#8A9BB0` (gris) |

### Indicateurs de synchronisation offline
| État | Couleur |
|---|---|
| En ligne | `#2D9E6B` |
| En attente | `#F59E0B` |
| Synchronisation en cours | `#3B82F6` |
| Erreur | `#D93025` |
| Hors ligne | `#8A9BB0` |

### Typographie
- Police d'affichage : **Montserrat**
- Police d'interface : **Inter** *(⚠️ déclarée dans les tokens mais pas chargée via Google Fonts — incohérence : le fallback système s'applique réellement à la place d'Inter)*
- Police monospace : **JetBrains Mono**
- Seules Montserrat et JetBrains Mono sont effectivement chargées.

### Espacements (échelle de 4px)
`4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 px`

### Rayons de bordure
`6px (sm) · 8px (md) · 12px (lg) · 16px (xl) · 999px (pill/full)`

### Ombres
- Carte : ombre douce à deux couches (légère + diffuse)
- Modale : ombre plus marquée
- Toast : ombre moyenne

### Transitions
- Durées : de 100ms (micro) à 300ms (max)
- Courbes : standard, ease-out, et une courbe "spring" douce pour les interactions notables

---

## 2. Couche de surcharge V7 (`v7.css`, chargée en dernier)

Introduit une palette et une charte plus sobres ("Norton × ISM Apple Premium") :
- Nouvelle palette : encre `#343F48`, accent `#FF6D68`, signal (erreur) `#FF1209`, marine `#0E0D30`, cobalt `#2B2D92`, magenta `#ED2567`.
- Remplace tout le texte/titres en **Montserrat uniquement** (au lieu d'Inter).
- **Supprime les ombres** au profit de filets fins ("hairline") sur cartes/tableaux/KPI.
- Transforme les badges de statut pleins en points + texte.
- Réduit la densité (paddings, rayons de bordure) sur desktop ≥900px, dans un style plus compact.
- Anime les transitions de route (View Transitions API, 180ms).

---

## 3. Aperçu par fichier CSS

| Fichier | Taille | Rôle | Responsive | Dark mode | Animations notables |
|---|---|---|---|---|---|
| `base.css` | 50 Ko | Design tokens racine, shell applicatif, boutons, connexion, toast, modale générique, navigation principale, tableaux, pills | Oui — pivot **900px** | Absent | Spinner, shimmer de chargement, transitions sidebar, toast |
| `components.css` | 13,6 Ko | Composants partagés cross-vues : badges, avatars, indicateur de synchro, barre de filtres, boutons secondaires, FAB, centre de notifications | Oui | Absent | Icône de synchronisation animée, apparition du panneau de notifications |
| `dashboard.css` | 13,7 Ko | Dashboards CDS/Manager : tuiles CA, jauges de primes, alertes, camemberts, en-têtes desktop | Oui — fort, bascule complète mobile/desktop | Absent | Barres de progression animées |
| `pipeline.css` | 14,2 Ko | Kanban, tableau équipe, règles d'impression (export PDF "COPIL"), planning semaine, panneau docké | Oui — très développé | Absent | Transitions de sélection, scrollbar stylée desktop |
| `comptes.css` | 7,1 Ko | Liste de comptes, fiche compte, badges de statut compte | Oui — fiche compte en 2 colonnes ≥900px | Absent | Effet d'appui sur les cartes |
| `questionnaire.css` | 7,2 Ko | Formulaire de visite multi-étapes : barre de progression, chips, arbre de décision, navigation bas fixe | Oui — colonne centrée desktop | Absent | Transition sur les points d'étape |
| `v7.css` | 13,7 Ko | Couche de surcharge finale (voir section 2) | Oui — section dédiée densité desktop ≥900px | Absent | Transition de route (View Transitions) |

**Aucun dark mode** n'est implémenté nulle part dans le dépôt.

---

## 4. Responsive

- **Un seul breakpoint pivot dominant : 900px.**
  - En dessous : navigation en bas d'écran (bottom-nav), listes en cartes, formulaires plein écran.
  - Au-dessus : sidebar fixe (240px / 58px repliée), tableaux réels avec tri/pagination, panneaux de détail dockés, en-têtes de page dédiés.
- Quelques breakpoints secondaires mineurs et locaux (380px, 540px, 640px, 720px, 1200px) pour ajuster des grilles spécifiques.
- Le viewport bloque le pinch-zoom (`user-scalable=no`) — cohérent avec un usage "outil terrain" mais à challenger dans l'audit accessibilité.
- `prefers-reduced-motion` est respecté (désactivation globale des animations si l'utilisateur l'a demandé au niveau système).

---

## 5. Recommandation pour la refonte

Le principal enjeu visuel n'est pas un manque de tokens (ils existent, sont assez complets et déjà pensés en échelle), mais leur **application incohérente** du fait de la double couche CSS. Une refonte devrait :
1. Choisir un seul système de référence (probablement la direction "V7", plus sobre et plus proche de l'identité Norton/Empower) et le déclarer comme source unique de vérité.
2. Unifier les 6 systèmes de badges/pills de statut identifiés (voir `02_COMPOSANTS_UI.md`, section 9).
3. Trancher sur la police d'interface (Inter déclarée mais jamais chargée — à charger réellement, ou à retirer des tokens).
4. Documenter explicitement l'absence de dark mode comme un choix (ou l'introduire si le besoin existe côté utilisateurs terrain en extérieur/forte luminosité).
