-- Lot 3 (droits Externe) — état APPLIQUÉ en production le 3 nov. 2026 (trois migrations successives).
-- Modèle en place : une base PERMISSIVE « session_requise » (session valide) + des politiques RESTRICTIVES
-- « visibilite_* » par rôle (combinées en ET). Les politiques ouvertes redondantes ont été supprimées :
-- leads_select / leads_insert / leads_update (public, true) et anon_select/insert/update_comptes.
-- ATTENTION : ne jamais supprimer session_requise sans remplacer la base permissive, sinon plus aucune ligne n'est lisible.

drop policy if exists leads_select on public.leads;
drop policy if exists leads_insert on public.leads;
drop policy if exists leads_update on public.leads;
drop policy if exists anon_select_comptes on public.comptes;
drop policy if exists anon_insert_comptes on public.comptes;
drop policy if exists anon_update_comptes on public.comptes;

-- Externe : crée et modifie tous les leads (coordonnées, attribution) et modifie les comptes (coordonnées).
drop policy if exists visibilite_ecriture_i on public.leads;
drop policy if exists visibilite_ecriture_u on public.leads;
drop policy if exists visibilite_ecriture_u on public.comptes;
create policy visibilite_ecriture_i on public.leads as restrictive for insert to anon, authenticated with check (
  (select esi_role()) in ('ADMIN','CHANNEL_MANAGER','EXTERNE')
  or ((select esi_role()) = 'CDS' and (pin_cds_assigne is null or pin_cds_assigne::text = (select esi_pin())::text)));
create policy visibilite_ecriture_u on public.leads as restrictive for update to anon, authenticated
  using ((select esi_role()) in ('ADMIN','CHANNEL_MANAGER','EXTERNE')
    or ((select esi_role()) = 'CDS' and (pin_cds_assigne is null or pin_cds_assigne::text = (select esi_pin())::text)))
  with check ((select esi_role()) in ('ADMIN','CHANNEL_MANAGER','EXTERNE')
    or ((select esi_role()) = 'CDS' and (pin_cds_assigne is null or pin_cds_assigne::text = (select esi_pin())::text)));
create policy visibilite_ecriture_u on public.comptes as restrictive for update to anon, authenticated
  using ((select esi_role()) in ('ADMIN','CHANNEL_MANAGER','EXTERNE')
    or ((select esi_role()) = 'CDS' and (pin_cds_assigne is null or pin_cds_assigne::text = (select esi_pin())::text)))
  with check ((select esi_role()) in ('ADMIN','CHANNEL_MANAGER','EXTERNE')
    or ((select esi_role()) = 'CDS' and (pin_cds_assigne is null or pin_cds_assigne::text = (select esi_pin())::text)));
