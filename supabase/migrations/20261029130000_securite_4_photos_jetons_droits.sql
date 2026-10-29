-- Sécurité 4 : envoi de photos réservé aux sessions, fin des jetons en clair, droits de table resserrés.
--
-- 1. Stockage : l'envoi dans le bucket empower-photos était ouvert à n'importe qui (rôle anon) ; il exige
--    maintenant une session valide (même règle que les tables : en-tête x-esi-token). La lecture reste publique
--    (les photos s'affichent par URL).
-- 2. Jetons : les sessions encore portées par utilisateurs.token (en clair) sont recopiées, hachées, dans la
--    table sessions ; la colonne est ensuite vidée et n'est plus lue. Personne n'est déconnecté.
-- 3. utilisateurs : le rôle anon n'a plus le droit d'insérer, et le rôle authenticated (inutilisé : l'appli
--    n'emploie pas Supabase Auth) n'a plus aucun droit sur la table (hash, sel, jetons).
-- Retour arrière : voir le bas du fichier.

-- 1. Photos
drop policy if exists allow_auth_upload_photos on storage.objects;
create policy allow_auth_upload_photos on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'empower-photos' and public.esi_session_valide());

-- 2. Jetons en clair -> sessions hachées, puis purge
insert into public.sessions (pin, token_hash, expire_le, user_agent)
select u.pin, public.esi_hash_jeton(u.token), u.token_expiry, 'migré'
from public.utilisateurs u
where u.token is not null and u.token <> ''
  and u.token_expiry > (extract(epoch from clock_timestamp()) * 1000)::bigint
on conflict (token_hash) do nothing;

update public.utilisateurs set token = null, token_expiry = null where token is not null or token_expiry is not null;

create or replace function public.esi_session_info(p_token text)
returns table (pin integer, role text, actif boolean, token_expiry bigint)
language sql stable security definer set search_path = public, pg_temp
as $$
  select u.pin, u.role, u.actif, s.expire_le
  from public.sessions s join public.utilisateurs u on u.pin = s.pin
  where p_token is not null and p_token <> '' and s.token_hash = public.esi_hash_jeton(p_token);
$$;
revoke all on function public.esi_session_info(text) from public, anon, authenticated;
grant execute on function public.esi_session_info(text) to service_role;

create or replace function public.esi_fermer_session(p_token text)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if p_token is null or p_token = '' then return; end if;
  delete from public.sessions where token_hash = public.esi_hash_jeton(p_token);
end $$;
revoke all on function public.esi_fermer_session(text) from public, anon, authenticated;
grant execute on function public.esi_fermer_session(text) to service_role;

-- 3. Droits de table
revoke insert on public.utilisateurs from anon;
revoke all on public.utilisateurs from authenticated;

-- ── Retour arrière ──
-- drop policy allow_auth_upload_photos on storage.objects;
-- create policy allow_auth_upload_photos on storage.objects for insert to anon, authenticated with check (bucket_id = 'empower-photos');
-- (les jetons restent valables : ils sont dans sessions ; recréer l'ancienne esi_session_info de securite_3 si besoin)
-- grant insert on public.utilisateurs to anon; grant select, insert, update on public.utilisateurs to authenticated;
