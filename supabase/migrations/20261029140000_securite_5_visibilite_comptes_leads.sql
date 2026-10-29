-- Sécurité 5 (lot 1/3) : visibilité par rôle sur comptes et leads.
--
-- Règles validées :
--  - ADMIN et CHANNEL_MANAGER : voient et modifient tout.
--  - CDS : ses propres lignes (pin_cds_assigne = son PIN) + les lignes non attribuées (pin_cds_assigne null).
--  - EXTERNE : ne voit que les leads non attribués ; aucun accès aux comptes.
-- Mécanisme : politique RESTRICTIVE (s'ajoute à session_requise, ne la remplace pas) qui lit le rôle et le PIN
-- de la session portée par l'en-tête x-esi-token. Les Edge Functions (service_role) ne sont pas concernées.
-- Retour arrière : voir le bas du fichier.

create or replace function public.esi_session_courante()
returns table (pin integer, role text)
language sql stable security definer set search_path = public, pg_temp
as $$
  select i.pin, i.role
  from public.esi_session_info(nullif(coalesce(current_setting('request.headers', true), '{}')::json ->> 'x-esi-token', '')) i
  where i.actif is true and i.token_expiry is not null
    and i.token_expiry > (extract(epoch from clock_timestamp()) * 1000)::bigint
  limit 1;
$$;
revoke all on function public.esi_session_courante() from public;
grant execute on function public.esi_session_courante() to anon, authenticated, service_role;

create or replace function public.esi_voit_ligne(p_pin_cds text, p_externe_ok boolean default false)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.esi_session_courante() s
    where s.role in ('ADMIN', 'CHANNEL_MANAGER')
       or (s.role = 'CDS' and (p_pin_cds is null or p_pin_cds = s.pin::text))
       or (s.role = 'EXTERNE' and p_externe_ok and p_pin_cds is null)
  );
$$;
revoke all on function public.esi_voit_ligne(text, boolean) from public;
grant execute on function public.esi_voit_ligne(text, boolean) to anon, authenticated, service_role;

drop policy if exists visibilite_role on public.comptes;
create policy visibilite_role on public.comptes as restrictive for all to anon, authenticated
  using (public.esi_voit_ligne(pin_cds_assigne::text, false))
  with check (public.esi_voit_ligne(pin_cds_assigne::text, false));

drop policy if exists visibilite_role on public.leads;
create policy visibilite_role on public.leads as restrictive for all to anon, authenticated
  using (public.esi_voit_ligne(pin_cds_assigne::text, true))
  with check (public.esi_voit_ligne(pin_cds_assigne::text, true));

-- ── Retour arrière ──
-- drop policy visibilite_role on public.comptes;
-- drop policy visibilite_role on public.leads;
