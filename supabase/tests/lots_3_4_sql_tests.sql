-- Tests SQL des lots 3 + 4. Chaque bloc se TERMINE par une exception : rien ne persiste (transaction annulée).
-- Le résultat se lit dans le message d'erreur « TEST|… ».

-- 1) Non-régression : sans réattribution, le nouveau calcul = les CA par commercial déjà stockés (écart attendu 0,00).
select o.pin_cds, round(o.q1_ca_realise - ca_realise_cds(o.pin_cds,1),2) ecart_q1, round(o.q2_ca_realise - ca_realise_cds(o.pin_cds,2),2) ecart_q2 from objectifs_primes o;

-- 2) CA à la date d'effet : une réattribution datée du 04/09 (début S9 du Q2) retire à l'ancien exactement le CA des semaines >= 9
--    et le donne au nouveau ; total équipe inchangé ; Q1 clos inchangé. (Résultat constaté : 72,54 € transférés.)
do $$
declare c record; a1 numeric; b1 numeric; a2 numeric; b2 numeric; att numeric;
begin
  select s.compte_id into c from sellin_semaines s join comptes cp on cp.id = s.compte_id
   where s.quarter='Q2FY27' and cp.pin_cds_assigne = 4003 group by s.compte_id
   having coalesce(sum(ca_eur) filter (where semaine < 9),0) > 0 and coalesce(sum(ca_eur) filter (where semaine >= 9),0) > 0 limit 1;
  a1 := ca_realise_cds(4003,2); b1 := ca_realise_cds(4001,2);
  att := (select sum(ca_eur) from sellin_semaines where compte_id = c.compte_id and quarter='Q2FY27' and semaine >= 9);
  update comptes set pin_cds_assigne = 4001 where id = c.compte_id;
  insert into attributions_historique(compte_id, ancien_pin, nouveau_pin, mode, date_effet) values (c.compte_id, 4003, 4001, 'MANAGER', date '2026-09-04');
  raise exception 'TEST|ancien perd % ; nouveau gagne % ; attendu % ; total % -> %', round(a1-ca_realise_cds(4003,2),2), round(ca_realise_cds(4001,2)-b1,2), att, a1+b1, ca_realise_cds(4003,2)+ca_realise_cds(4001,2);
end $$;

-- 3) Règles de reattribuer_compte (jeton de session) : voir le détail dans la PR — reprise OK d'un compte sans propriétaire,
--    rejeu = COMPTE_SUIVI, compte suivi refusé, manager ne « reprend » pas, reprise pour autrui refusée, CDS en mode MANAGER refusé,
--    jeton falsifié = SESSION_INVALIDE, jeton expiré = SESSION_EXPIREE. (Jetons de test posés dans la transaction annulée.)

-- ── Lot 5 : axe « À contacter » ──
-- 4) Classement attendu sur les données réelles du 02/10/2026 : P1 = 43, P2 = 24 (audit : 49 / 28 avant exclusion des comptes contactés < 30 j).
select axe, count(*) from v_a_contacter group by 1;
-- 5) Rappel + reporter (transaction annulée) : le param SELLIN_SEMAINES_DATE déclenche UN récap par commercial (dédoublonné),
--    managers prévenus pour les comptes sans propriétaire ; reporter : propriétaire OK, autre CDS NON_AUTORISE, jeton faux SESSION_INVALIDE,
--    durée > 60 j DUREE_INVALIDE, manager OK ; le compte reporté sort de la vue. (Résultat constaté : 8 notifications, dédoublonnage OK.)
