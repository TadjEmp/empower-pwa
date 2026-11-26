-- Lot 6 / M3 — échecs de connexion comptés par (e-mail, IP), par IP et par e-mail : un tiers ne peut plus verrouiller le compte d'un autre.
create table if not exists public.login_echecs (
  id bigint generated always as identity primary key,
  email text not null,
  ip text not null,
  created_at timestamptz not null default now()
);
create index if not exists login_echecs_email_date on public.login_echecs (email, created_at desc);
create index if not exists login_echecs_ip_date on public.login_echecs (ip, created_at desc);
alter table public.login_echecs enable row level security;
create policy service_role_all on public.login_echecs for all to service_role using (true) with check (true);
