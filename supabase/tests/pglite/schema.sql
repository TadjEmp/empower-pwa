-- Schéma minimal reproduisant l'état de production AVANT les migrations (rôles, tables, politiques anon ouvertes).
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;

create table public.utilisateurs (
  id uuid primary key default gen_random_uuid(), email text not null, hash text not null default 'x', salt text not null default 'x',
  pin integer not null unique, nom text not null, role text not null, actif boolean default true,
  token text, token_expiry bigint, reset_token text, reset_token_expiry bigint,
  failed_attempts integer not null default 0, locked_until bigint, droits jsonb);
create table public.comptes (id uuid primary key default gen_random_uuid(), nom_compte text, pin_cds_assigne integer, deleted boolean default false);
create table public.a_contacter_report (compte_id uuid primary key, jusqu_au date, par_pin integer, updated_at timestamptz);
create table public.push_subscriptions (id uuid primary key default gen_random_uuid(), pin_cds integer, endpoint text unique, p256dh text, auth text, user_agent text, actif boolean default true);
create table public.actions (id uuid primary key default gen_random_uuid(), note text);
create table public.attributions_historique (id uuid primary key default gen_random_uuid(), note text);
create table public.fiches_froides (id uuid primary key default gen_random_uuid(), note text);
create table public.leads (id uuid primary key default gen_random_uuid(), note text);
create table public.notifs (id uuid primary key default gen_random_uuid(), note text);
create table public.objectifs_primes (id uuid primary key default gen_random_uuid(), note text);
create table public.params (id uuid primary key default gen_random_uuid(), parametre text, valeur text);
create table public.phoning (id uuid primary key default gen_random_uuid(), note text);
create table public.sellin_agregats (id uuid primary key default gen_random_uuid(), note text);
create table public.sellin_imports (id uuid primary key default gen_random_uuid(), note text);
create table public.sellin_semaines (id uuid primary key default gen_random_uuid(), note text);
create table public.visites (id uuid primary key default gen_random_uuid(), note text);
create table public.vues_filtres (id uuid primary key default gen_random_uuid(), module text, nom text);

do $$ declare t text; begin
  foreach t in array array['utilisateurs','comptes','a_contacter_report','push_subscriptions','actions','attributions_historique','fiches_froides','leads','notifs','objectifs_primes','params','phoning','sellin_agregats','sellin_imports','sellin_semaines','visites','vues_filtres'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant all on public.%I to anon, authenticated, service_role', t);
    execute format('create policy anon_tout on public.%I for all to anon using (true) with check (true)', t);
  end loop;
end $$;
-- Reproduit la restriction de colonnes d'origine sur utilisateurs (select limité, update limité aux colonnes de jeton)
revoke all on public.utilisateurs from anon;
grant select (actif, email, nom, pin, role) on public.utilisateurs to anon;
grant update (token, token_expiry) on public.utilisateurs to anon;
create policy anon_update_token_utilisateurs on public.utilisateurs for update to anon using (true);
