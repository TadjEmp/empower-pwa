-- Sécurité 7 (lot 3/3) : données personnelles (objectifs et primes, notifications, vues enregistrées).
--
--  - objectifs_primes : lecture ADMIN et CHANNEL_MANAGER (la Vue équipe COPIL en a besoin), et chaque CDS pour
--    sa ligne ; écriture ADMIN et CDS sur sa propre ligne (un channel manager ne modifie rien).
--  - notifs : chacun lit/modifie/supprime les siennes (ADMIN : toutes) ; tout utilisateur connecté peut en créer
--    pour un autre (attribution, relance), comme aujourd'hui.
--  - vues_filtres : chacun les siennes (ADMIN : toutes).
-- Retour arrière : voir le bas du fichier.

create or replace function public.esi_est_moi(p_pin text, p_admin_ok boolean default true)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.esi_session_courante() s
    where (p_admin_ok and s.role = 'ADMIN') or s.pin::text = p_pin
  );
$$;
revoke all on function public.esi_est_moi(text, boolean) from public;
grant execute on function public.esi_est_moi(text, boolean) to anon, authenticated, service_role;

-- objectifs_primes
drop policy if exists visibilite_lecture on public.objectifs_primes;
create policy visibilite_lecture on public.objectifs_primes as restrictive for select to anon, authenticated
  using (exists (select 1 from public.esi_session_courante() s
                 where s.role in ('ADMIN', 'CHANNEL_MANAGER') or s.pin::text = pin_cds::text));
drop policy if exists visibilite_ecriture_i on public.objectifs_primes;
create policy visibilite_ecriture_i on public.objectifs_primes as restrictive for insert to anon, authenticated
  with check (public.esi_est_moi(pin_cds::text));
drop policy if exists visibilite_ecriture_u on public.objectifs_primes;
create policy visibilite_ecriture_u on public.objectifs_primes as restrictive for update to anon, authenticated
  using (public.esi_est_moi(pin_cds::text)) with check (public.esi_est_moi(pin_cds::text));
drop policy if exists visibilite_ecriture_d on public.objectifs_primes;
create policy visibilite_ecriture_d on public.objectifs_primes as restrictive for delete to anon, authenticated
  using (public.esi_est_moi(pin_cds::text));

-- notifs
drop policy if exists visibilite_lecture on public.notifs;
create policy visibilite_lecture on public.notifs as restrictive for select to anon, authenticated
  using (public.esi_est_moi(pin_destinataire::text));
drop policy if exists visibilite_maj on public.notifs;
create policy visibilite_maj on public.notifs as restrictive for update to anon, authenticated
  using (public.esi_est_moi(pin_destinataire::text)) with check (public.esi_est_moi(pin_destinataire::text));
-- insert : déjà couvert par session_requise (tout utilisateur connecté)

-- vues_filtres
drop policy if exists visibilite_role on public.vues_filtres;
create policy visibilite_role on public.vues_filtres as restrictive for all to anon, authenticated
  using (public.esi_est_moi(pin_cds::text)) with check (public.esi_est_moi(pin_cds::text));

-- ── Retour arrière ──
-- drop policy visibilite_lecture on public.objectifs_primes; drop policy visibilite_ecriture_i on public.objectifs_primes;
-- drop policy visibilite_ecriture_u on public.objectifs_primes; drop policy visibilite_ecriture_d on public.objectifs_primes;
-- drop policy visibilite_lecture on public.notifs; drop policy visibilite_maj on public.notifs;
-- drop policy visibilite_role on public.vues_filtres;
