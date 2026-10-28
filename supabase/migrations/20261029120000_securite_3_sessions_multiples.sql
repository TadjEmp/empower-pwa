-- Sécurité 3/3 : sessions multiples (un utilisateur peut être connecté sur plusieurs appareils).
--
-- Avant : un seul jeton par utilisateur (utilisateurs.token). Se connecter sur un appareil déconnectait les autres.
-- Après : table sessions (un jeton par appareil), jetons stockés HACHÉS (SHA-256) : une fuite de la base ne
-- donne plus de session utilisable. Les sessions existantes (utilisateurs.token) restent valables jusqu'à leur
-- expiration : esi_session_info() lit les deux sources, personne n'est déconnecté par cette migration.
-- Retour arrière : voir le bas du fichier.

create table if not exists public.sessions (
  id          uuid primary key default gen_random_uuid(),
  pin         integer not null,
  token_hash  text not null unique,
  expire_le   bigint not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index if not exists sessions_pin_idx    on public.sessions (pin);
create index if not exists sessions_expire_idx on public.sessions (expire_le);
alter table public.sessions enable row level security;
revoke all on public.sessions from anon, authenticated;   -- aucune politique : service_role uniquement

create or replace function public.esi_hash_jeton(p text)
returns text language sql immutable set search_path = public, pg_temp
as $$ select encode(sha256(convert_to(p, 'UTF8')), 'hex') $$;

-- Identité d'un jeton : sessions (haché) puis ancien jeton. Les colonnes portent les noms de l'ancien code
-- (pin, role, actif, token_expiry) pour que les fonctions existantes n'aient qu'une clause à changer.
create or replace function public.esi_session_info(p_token text)
returns table (pin integer, role text, actif boolean, token_expiry bigint)
language sql stable security definer set search_path = public, pg_temp
as $$
  select u.pin, u.role, u.actif, s.expire_le
  from public.sessions s join public.utilisateurs u on u.pin = s.pin
  where p_token is not null and p_token <> '' and s.token_hash = public.esi_hash_jeton(p_token)
  union all
  select u.pin, u.role, u.actif, u.token_expiry
  from public.utilisateurs u
  where p_token is not null and p_token <> '' and u.token = p_token;
$$;
revoke all on function public.esi_session_info(text) from public, anon, authenticated;
grant execute on function public.esi_session_info(text) to service_role;

create or replace function public.esi_creer_session(p_pin integer, p_token text, p_expire bigint, p_ua text default null)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  -- ménage : sessions expirées de cet utilisateur, puis plafond de 10 appareils (les plus anciens sortent)
  delete from public.sessions where pin = p_pin and expire_le < (extract(epoch from clock_timestamp()) * 1000)::bigint;
  delete from public.sessions where id in (
    select id from public.sessions where pin = p_pin order by created_at desc offset 9
  );
  insert into public.sessions (pin, token_hash, expire_le, user_agent)
  values (p_pin, public.esi_hash_jeton(p_token), p_expire, left(coalesce(p_ua, ''), 200));
end $$;
revoke all on function public.esi_creer_session(integer, text, bigint, text) from public, anon, authenticated;
grant execute on function public.esi_creer_session(integer, text, bigint, text) to service_role;

create or replace function public.esi_fermer_session(p_token text)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if p_token is null or p_token = '' then return; end if;
  delete from public.sessions where token_hash = public.esi_hash_jeton(p_token);
  update public.utilisateurs set token = null, token_expiry = null where token = p_token;
end $$;
revoke all on function public.esi_fermer_session(text) from public, anon, authenticated;
grant execute on function public.esi_fermer_session(text) to service_role;

-- Règle d'accès aux données (securite_2) : lit désormais sessions ET anciens jetons.
create or replace function public.esi_session_valide()
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.esi_session_info(nullif(coalesce(current_setting('request.headers', true), '{}')::json ->> 'x-esi-token', '')) i
    where i.actif is true and i.token_expiry is not null
      and i.token_expiry > (extract(epoch from clock_timestamp()) * 1000)::bigint
  );
$$;

-- Fonctions métier qui identifient l'utilisateur par son jeton (p_token) : une seule clause à remplacer,
-- vérifiée exactement une fois par fonction (sinon la migration échoue et rien n'est modifié).
do $$
declare
  f record; d text; n integer;
  motif constant text := 'from\s+utilisateurs\s+where\s+token\s*=\s*p_token\s+and\s+p_token\s+is\s+not\s+null\s+limit\s+1';
begin
  for f in
    select p.oid, p.proname
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.proname in ('reattribuer_compte', 'reporter_a_contacter', 'enregistrer_push', 'supprimer_push')
      and pg_get_function_arguments(p.oid) ~* 'p_token'
  loop
    d := pg_get_functiondef(f.oid);
    select count(*) into n from regexp_matches(d, motif, 'gi');
    if n <> 1 then
      raise exception 'fonction %: clause de recherche du jeton trouvée % fois (attendu 1)', f.proname, n;
    end if;
    d := regexp_replace(d, motif, 'from public.esi_session_info(p_token) limit 1', 'gi');
    execute d;
  end loop;
end $$;

-- Retour arrière (sessions multiples seulement ; les fonctions ne lisent plus que utilisateurs.token) :
--   1. redéployer les versions précédentes des edge functions (auth-login, admin-users, ai-proxy, sync-sellin-semaines) ;
--   2. recréer esi_session_valide() comme dans securite_2 et remettre dans les 4 fonctions
--      « from utilisateurs where token = p_token and p_token is not null limit 1 » ;
--   3. drop table public.sessions ; drop function esi_session_info, esi_creer_session, esi_fermer_session, esi_hash_jeton.
