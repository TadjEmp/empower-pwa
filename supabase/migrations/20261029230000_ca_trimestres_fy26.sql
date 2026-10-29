-- CA par trimestre de FY26 sur les comptes : base des statuts commerciaux (renouvellement à 12 mois, baisse, relance).
-- Les licences durent 12 mois : un compte qui a commandé au trimestre N de FY26 renouvelle au trimestre N de FY27.
-- Les statuts eux-mêmes sont calculés à l'affichage (js/statuts-ca.js) : seuils modifiables sans migration.
-- Les totaux existants (ca_fy26, ca_q1fy27...) ne changent pas. La synchro Sell-In (v16) renseigne ces colonnes à chaque import.
-- Retour arrière : voir le bas du fichier.

alter table public.comptes
  add column if not exists ca_q1fy26 numeric not null default 0,
  add column if not exists ca_q2fy26 numeric not null default 0,
  add column if not exists ca_q3fy26 numeric not null default 0,
  add column if not exists ca_q4fy26 numeric not null default 0;

-- Reprise de l'existant : somme par compte des lignes Sell-In (un compte peut regrouper plusieurs noms de revendeur)
update public.comptes c set
  ca_q1fy26 = coalesce(g.q1, 0), ca_q2fy26 = coalesce(g.q2, 0), ca_q3fy26 = coalesce(g.q3, 0), ca_q4fy26 = coalesce(g.q4, 0)
from (
  select a.compte_id,
    sum(s.ca_eur) filter (where s.quarter = 'Q1FY26') q1, sum(s.ca_eur) filter (where s.quarter = 'Q2FY26') q2,
    sum(s.ca_eur) filter (where s.quarter = 'Q3FY26') q3, sum(s.ca_eur) filter (where s.quarter = 'Q4FY26') q4
  from public.sellin s join public.sellin_agregats a on a.reseller = s.reseller
  where a.compte_id is not null group by a.compte_id
) g
where c.id = g.compte_id;

-- ── Retour arrière ──
-- alter table public.comptes drop column ca_q1fy26, drop column ca_q2fy26, drop column ca_q3fy26, drop column ca_q4fy26;
