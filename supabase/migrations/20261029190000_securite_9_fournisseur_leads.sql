-- Rôle « fournisseur de leads » (EXTERNE) : alimente le Tracker et consulte les comptes en lecture seule.
--
--  - leads : il voit tous les leads, en crée (sans CDS), mais ne modifie ni ne supprime que les leads non attribués.
--  - comptes : il voit tous les comptes (grossistes et Empower), sans pouvoir rien créer, modifier ni supprimer.
-- Les règles de visibilité des autres rôles (securite_5) sont inchangées.
-- Retour arrière : voir le bas du fichier.

create or replace function public.esi_role()
returns text
language sql stable security definer set search_path = public, pg_temp
as $$ select s.role from public.esi_session_courante() s limit 1 $$;
revoke all on function public.esi_role() from public;
grant execute on function public.esi_role() to anon, authenticated, service_role;

-- comptes : lecture élargie au fournisseur, écriture inchangée
drop policy if exists visibilite_role on public.comptes;
drop policy if exists visibilite_lecture on public.comptes;
create policy visibilite_lecture on public.comptes as restrictive for select to anon, authenticated
  using (public.esi_voit_ligne(pin_cds_assigne::text, false) or public.esi_role() = 'EXTERNE');
drop policy if exists visibilite_ecriture_i on public.comptes;
create policy visibilite_ecriture_i on public.comptes as restrictive for insert to anon, authenticated
  with check (public.esi_voit_ligne(pin_cds_assigne::text, false));
drop policy if exists visibilite_ecriture_u on public.comptes;
create policy visibilite_ecriture_u on public.comptes as restrictive for update to anon, authenticated
  using (public.esi_voit_ligne(pin_cds_assigne::text, false)) with check (public.esi_voit_ligne(pin_cds_assigne::text, false));
drop policy if exists visibilite_ecriture_d on public.comptes;
create policy visibilite_ecriture_d on public.comptes as restrictive for delete to anon, authenticated
  using (public.esi_voit_ligne(pin_cds_assigne::text, false));

-- leads : lecture élargie au fournisseur ; écriture limitée aux leads non attribués pour lui
drop policy if exists visibilite_role on public.leads;
drop policy if exists visibilite_lecture on public.leads;
create policy visibilite_lecture on public.leads as restrictive for select to anon, authenticated
  using (public.esi_voit_ligne(pin_cds_assigne::text, true) or public.esi_role() = 'EXTERNE');
drop policy if exists visibilite_ecriture_i on public.leads;
create policy visibilite_ecriture_i on public.leads as restrictive for insert to anon, authenticated
  with check (public.esi_voit_ligne(pin_cds_assigne::text, true));
drop policy if exists visibilite_ecriture_u on public.leads;
create policy visibilite_ecriture_u on public.leads as restrictive for update to anon, authenticated
  using (public.esi_voit_ligne(pin_cds_assigne::text, true)) with check (public.esi_voit_ligne(pin_cds_assigne::text, true));
drop policy if exists visibilite_ecriture_d on public.leads;
create policy visibilite_ecriture_d on public.leads as restrictive for delete to anon, authenticated
  using (public.esi_voit_ligne(pin_cds_assigne::text, true));

-- ── Retour arrière : recréer la politique unique de securite_5 ──
-- drop policy visibilite_lecture on public.comptes; drop policy visibilite_ecriture_i on public.comptes; drop policy visibilite_ecriture_u on public.comptes; drop policy visibilite_ecriture_d on public.comptes;
-- create policy visibilite_role on public.comptes as restrictive for all to anon, authenticated using (public.esi_voit_ligne(pin_cds_assigne::text, false)) with check (public.esi_voit_ligne(pin_cds_assigne::text, false));
-- (idem pour leads avec esi_voit_ligne(pin_cds_assigne::text, true))
