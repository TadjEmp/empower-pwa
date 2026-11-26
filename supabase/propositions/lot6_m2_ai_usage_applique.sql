-- Lot 6 / M2 — journal d'usage des appels IA (plafonds par utilisateur dans ai-proxy). Accès service_role uniquement.
create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  pin integer not null,
  action text not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_pin_date on public.ai_usage (pin, created_at desc);
alter table public.ai_usage enable row level security;
create policy service_role_all on public.ai_usage for all to service_role using (true) with check (true);
