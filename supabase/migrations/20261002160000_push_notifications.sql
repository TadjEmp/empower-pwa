-- Lot 6 : notifications push (Web Push / VAPID). Appliqué en production.
-- push_config contient les clés VAPID + secret partagé : à renseigner hors dépôt
-- (insert into push_config(id, vapid_public, vapid_private, vapid_sujet, secret) ...).
create extension if not exists pg_net with schema extensions;

create table if not exists public.push_config (
  id int primary key default 1 check (id = 1),
  vapid_public text, vapid_private text, vapid_sujet text, secret text
);
alter table public.push_config enable row level security;  -- aucune policy : inaccessible à anon

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  pin int not null, endpoint text not null unique, p256dh text not null, auth text not null,
  actif boolean not null default true, created_at timestamptz default now()
);
alter table public.push_subscriptions enable row level security;
-- Les RPC enregistrer_push / supprimer_push (security definer, auth par token) et le trigger
-- notify_push() (pg_net → edge function send-push, en-tête x-push-secret) sont décrits dans
-- l'historique de migration Supabase (version appliquée en prod).
