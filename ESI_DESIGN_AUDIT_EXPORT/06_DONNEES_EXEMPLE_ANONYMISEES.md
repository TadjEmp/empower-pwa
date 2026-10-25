# Données d'exemple anonymisées — pour maquettage uniquement

⚠️ Toutes les valeurs ci-dessous sont **fictives**, données à titre d'illustration pour produire des maquettes réalistes sans utiliser de données réelles. Les structures de champs et les règles métier (statuts, seuils, formats) sont fidèles au code réel.

---

## 1. Rôles et identités (anonymisés)

| Rôle | Exemple d'identité fictive | Périmètre |
|---|---|---|
| ADMIN | Manager (Commercial "Pilote") | Voit tout, administration complète |
| CDS | Commercial A / Commercial B / Commercial C | Ses propres comptes uniquement |
| CHANNEL_MANAGER | Responsable Channel | Vue consolidée équipe, lecture quasi-seule |
| EXTERNE | Apporteur externe | Tracker uniquement (saisie de leads) |

## 2. Exemple de fiche compte (structure de champs)

```
Raison Sociale        : Revendeur Exemple SARL
Code Client           : CLI-00142
Commercial assigné    : Commercial A
Canal                 : Distributeur INGRAM (fictif)
Ville / Département   : Lyon (69)
Téléphone              : +33 X XX XX XX XX (fictif)
Email                  : contact@example.com (fictif)
Statut                : Actif
Priorité               : Verte
CA FY25                : 18 400 € (fictif)
CA FY26                : 22 100 € (fictif)
CA FY27 (trimestre en cours) : 6 300 € (fictif)
Statut Empower         : Intégré
Dernière visite         : il y a 12 jours
Dernier appel           : il y a 4 jours
Prochaine action        : Relance téléphonique planifiée
```

## 3. Statuts de pipeline (Tracker) — énumération réelle

```
SAISIE → ASSIGNE → EN_COURS → COMPTE_CREE → INTEGRE
                                            → ARCHIVE
```
Libellés d'interface : "À traiter", "Assigné", "En cours", "Compte créé", "Intégré ✅", "Archivé".

## 4. Statuts d'appel (Phoning) — énumération réelle

```
Converti · Intéressé · Chaud · À rappeler · NRP (non répondu) · Non appelé · Pas intéressé
```

## 5. Statuts de compte — énumération réelle

```
Actif · À réactiver · Silencieux · Inactif
```

## 6. Statuts de visite — énumération réelle

```
Planifiée · En cours · Réalisée · Manquée (calculé automatiquement) · Annulée
```

## 7. Exemple de KPI dashboard (valeurs fictives)

| KPI | Valeur exemple |
|---|---|
| CA réalisé trimestre en cours | 42 500 € / objectif 55 000 € (77%) |
| Comptes actifs | 38 |
| Comptes à réactiver | 6 |
| Visites réalisées (semaine) | 9 |
| Appels réalisés (semaine) | 24 |
| Taux d'intégration Empower | 64% |
| Leads en cours de qualification | 15 |

## 8. Exemple de calcul de prime trimestrielle (structure, valeurs fictives)

```
Axe CA          : 105% de l'objectif → palier 400 € + bonus dépassement 100 €
Axe NSB         : 9 unités vendues (seuil haut atteint) → 150 €
Axe Empower     : 4 comptes intégrés → 50 €
Total trimestre : 700 € (plafond atteint)
```

## 9. Exemple de compte-rendu de visite (freins identifiés — liste réelle, non exhaustive)

```
Prix trop élevé face à la concurrence
Manque de notoriété de la marque auprès des clients finaux
Contrat déjà engagé avec un concurrent
Manque de formation de l'équipe de vente du revendeur
Problème logistique / disponibilité produit
```

## 10. Exemple de notification (structure)

```
Type          : LEAD_ASSIGNE
Destinataire  : Commercial B (par identifiant interne)
Message       : "Un nouveau lead vous a été assigné : Revendeur Exemple SARL"
Lu            : non
Action au clic : ouverture du Tracker, focus sur le lead concerné
```

---

## Notes pour le maquettage

- Les montants de CA sont toujours affichés en euros, format français (espace comme séparateur de milliers).
- Les identifiants internes (type "PIN") ne doivent **jamais** apparaître dans l'interface visible par l'utilisateur (règle explicite déjà respectée dans le code pour la vue Primes — à généraliser).
- Les listes de référence (freins, concurrents, grossistes, types de revendeur) sont des listes fermées assez longues (7 à 12 éléments) : prévoir un pattern d'affichage compact (chips sélectionnables) plutôt qu'une longue liste verticale.
