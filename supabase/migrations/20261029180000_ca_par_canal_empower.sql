-- CA par canal de commande : part Empower du CA, stockée à côté du CA total.
--
-- Avant : le Sell-In garde une ligne par revendeur et par trimestre avec UN canal ; un revendeur qui commande
-- à la fois par Empower et par un grossiste (Ingram / TD Synnex) dans le même trimestre voyait ses montants
-- additionnés sous le premier canal rencontré.
-- Après : chaque ligne porte aussi sa part Empower (ca_empower). CA grossiste = CA total - CA Empower.
-- Les totaux existants (ca_fy25, ca_fy26, ca_q1fy27...) ne changent pas : objectifs et primes sont inchangés.
-- La synchro Sell-In (v15) renseigne ces colonnes à chaque import. Reprise de l'existant ci-dessous : les lignes dont le
-- canal est EMPOWER comptent 100 % Empower (approximation, corrigée au prochain import du fichier complet).
-- Retour arrière : voir le bas du fichier.

alter table public.sellin add column if not exists ca_empower numeric not null default 0;

alter table public.sellin_agregats
  add column if not exists ca_emp_fy25 numeric not null default 0,
  add column if not exists ca_emp_fy26 numeric not null default 0,
  add column if not exists ca_emp_q1fy27 numeric not null default 0,
  add column if not exists ca_emp_q2fy27 numeric not null default 0,
  add column if not exists ca_emp_q3fy27 numeric not null default 0,
  add column if not exists ca_emp_q4fy27 numeric not null default 0;

alter table public.comptes
  add column if not exists ca_emp_fy25 numeric not null default 0,
  add column if not exists ca_emp_fy26 numeric not null default 0,
  add column if not exists ca_emp_q1fy27 numeric not null default 0,
  add column if not exists ca_emp_q2fy27 numeric not null default 0,
  add column if not exists ca_emp_q3fy27 numeric not null default 0,
  add column if not exists ca_emp_q4fy27 numeric not null default 0;

-- Reprise de l'existant
update public.sellin set ca_empower = ca_eur where upper(coalesce(canal, '')) like '%EMPOWER%';

update public.sellin_agregats a set
  ca_emp_fy25   = coalesce(s.fy25, 0), ca_emp_fy26   = coalesce(s.fy26, 0),
  ca_emp_q1fy27 = coalesce(s.q1, 0),   ca_emp_q2fy27 = coalesce(s.q2, 0),
  ca_emp_q3fy27 = coalesce(s.q3, 0),   ca_emp_q4fy27 = coalesce(s.q4, 0)
from (
  select reseller,
    sum(ca_empower) filter (where quarter ilike '%FY25') fy25,
    sum(ca_empower) filter (where quarter ilike '%FY26') fy26,
    sum(ca_empower) filter (where quarter = 'Q1FY27') q1,
    sum(ca_empower) filter (where quarter = 'Q2FY27') q2,
    sum(ca_empower) filter (where quarter = 'Q3FY27') q3,
    sum(ca_empower) filter (where quarter = 'Q4FY27') q4
  from public.sellin group by reseller
) s
where a.reseller = s.reseller;

update public.comptes c set
  ca_emp_fy25 = g.fy25, ca_emp_fy26 = g.fy26,
  ca_emp_q1fy27 = g.q1, ca_emp_q2fy27 = g.q2, ca_emp_q3fy27 = g.q3, ca_emp_q4fy27 = g.q4
from (
  select compte_id, sum(ca_emp_fy25) fy25, sum(ca_emp_fy26) fy26, sum(ca_emp_q1fy27) q1,
         sum(ca_emp_q2fy27) q2, sum(ca_emp_q3fy27) q3, sum(ca_emp_q4fy27) q4
  from public.sellin_agregats where compte_id is not null group by compte_id
) g
where c.id = g.compte_id;

-- ── Retour arrière ──
-- alter table public.comptes drop column ca_emp_fy25, drop column ca_emp_fy26, drop column ca_emp_q1fy27, drop column ca_emp_q2fy27, drop column ca_emp_q3fy27, drop column ca_emp_q4fy27;
-- alter table public.sellin_agregats drop column ca_emp_fy25, drop column ca_emp_fy26, drop column ca_emp_q1fy27, drop column ca_emp_q2fy27, drop column ca_emp_q3fy27, drop column ca_emp_q4fy27;
-- alter table public.sellin drop column ca_empower;
