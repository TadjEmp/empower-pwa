-- Sécurité 2/2 : exiger une session valide pour lire ou écrire les données.
--
-- Le navigateur envoie le jeton de session dans l'en-tête x-esi-token (js/api.js). La fonction
-- esi_session_valide() le compare à utilisateurs.token (actif, non expiré). Une politique RESTRICTIVE
-- s'ajoute (ET logique) aux politiques existantes : sans session valide, plus aucun accès ; avec une
-- session valide, le comportement reste celui d'aujourd'hui. Retour arrière : drop policy session_requise.
create or replace function public.esi_session_valide()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.utilisateurs u
    where u.actif is true
      and u.token is not null and u.token <> ''
      and u.token = nullif(coalesce(current_setting('request.headers', true), '{}')::json ->> 'x-esi-token', '')
      and u.token_expiry is not null
      and u.token_expiry > (extract(epoch from clock_timestamp()) * 1000)::bigint
  );
$$;
revoke all on function public.esi_session_valide() from public;
grant execute on function public.esi_session_valide() to anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'a_contacter_report','actions','attributions_historique','comptes','fiches_froides','leads','notifs',
    'objectifs_primes','params','phoning','sellin_agregats','sellin_imports','sellin_semaines',
    'utilisateurs','visites','vues_filtres'
  ] loop
    execute format('drop policy if exists session_requise on public.%I', t);
    execute format(
      'create policy session_requise on public.%I as restrictive for all to anon, authenticated using ((select public.esi_session_valide())) with check ((select public.esi_session_valide()))',
      t);
  end loop;
end $$;

-- Retour arrière :
--   do $$ declare t text; begin
--     for t in select tablename from pg_policies where policyname = 'session_requise' loop
--       execute format('drop policy session_requise on public.%I', t); end loop; end $$;
