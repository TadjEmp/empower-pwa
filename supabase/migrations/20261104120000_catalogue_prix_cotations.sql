-- Assistant commercial : prix par canal et cotations datées (réglages Administration › Prix et cotations).
-- catalogue_produits : prix d'achat HT revendeur par canal (Empower, Tech Data, Ingram) et PVP TTC conseillé.
-- catalogue_cotations : remise ou prix cotés sur les canaux grossistes pendant une période ; active si actif et debut <= jour <= fin.
-- Lecture : toute session valide. Écriture : ADMIN et CHANNEL_MANAGER (même règle que secteurs_cp).
create table if not exists public.catalogue_produits (
  produit_id text primary key,
  famille text not null,
  nom text not null,
  appareils int not null check (appareils > 0),
  pvp_ttc numeric(10,2) check (pvp_ttc is null or pvp_ttc >= 0),
  pa_empower numeric(10,2) check (pa_empower is null or pa_empower >= 0),
  pa_td numeric(10,2) check (pa_td is null or pa_td >= 0),
  pa_ingram numeric(10,2) check (pa_ingram is null or pa_ingram >= 0),
  sku_td text, sku_ingram text,
  ordre int not null default 0,
  actif boolean not null default true,
  maj_par int, updated_at timestamptz not null default now()
);
create table if not exists public.catalogue_cotations (
  id uuid primary key default gen_random_uuid(),
  libelle text not null check (length(trim(libelle)) > 0),
  canaux text[] not null default '{td,ingram}' check (canaux <@ array['td','ingram'] and cardinality(canaux) > 0),
  debut date not null,
  fin date not null,
  remise_pct numeric(5,2) check (remise_pct is null or (remise_pct > 0 and remise_pct <= 90)),
  prix jsonb not null default '{}'::jsonb check (jsonb_typeof(prix) = 'object'),
  actif boolean not null default true,
  maj_par int, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (fin >= debut),
  check (remise_pct is not null or prix <> '{}'::jsonb)
);
alter table public.catalogue_produits enable row level security;
alter table public.catalogue_cotations enable row level security;
do $$ declare t text; begin
  foreach t in array array['catalogue_produits','catalogue_cotations'] loop
    execute format('drop policy if exists %I on public.%I', t||'_lecture', t);
    execute format('drop policy if exists %I on public.%I', t||'_ecriture', t);
    execute format('drop policy if exists %I on public.%I', t||'_service', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using ((select esi_session_valide()))', t||'_lecture', t);
    execute format('create policy %I on public.%I for all to anon, authenticated using ((select esi_session_valide()) and (select esi_role()) = any (array[''ADMIN'',''CHANNEL_MANAGER''])) with check ((select esi_session_valide()) and (select esi_role()) = any (array[''ADMIN'',''CHANNEL_MANAGER'']))', t||'_ecriture', t);
    execute format('create policy %I on public.%I for all to service_role using (true) with check (true)', t||'_service', t);
  end loop;
end $$;
insert into public.catalogue_produits (produit_id, famille, nom, appareils, pvp_ttc, pa_empower, pa_td, pa_ingram, sku_td, sku_ingram, ordre) values
  ('n360-std','N360','Norton 360 Standard',1,39.99,11.61,25.0,25.0,'21404856','21404971',1),
  ('n360-del3','N360','Norton 360 Deluxe',3,49.99,15.11,32.08,32.08,'21404977','21404910',2),
  ('n360-del5','N360','Norton 360 Deluxe',5,59.99,16.24,33.33,33.33,'21404968','21404845',3),
  ('n360-prem10','N360','Norton 360 Premium',10,69.99,null,37.5,37.5,'21404987','21404998',4),
  ('n360-gam3','N360','Norton 360 For Gamers',3,49.99,15.11,32.25,32.25,'21417152','21416747',5),
  ('n360-adv10','N360','Norton 360 Advanced',10,104.99,25.1,36.27,36.27,'21444054','21444054',6),
  ('n360-plat20','N360','Norton 360 Platinum',20,79.99,null,52.08,52.08,'21444053','21444053',7),
  ('nav-plus1','AV','Norton Antivirus Plus',1,29.99,14.55,null,null,null,null,8),
  ('nsb-6','NSB','Norton Small Business',6,99.99,17.86,41.66,41.66,'21453221','21453842',9),
  ('nsb-10','NSB','Norton Small Business',10,139.99,29.79,58.33,58.33,'21453240','21453846',10),
  ('nsb-20','NSB','Norton Small Business',20,199.99,53.61,83.33,83.33,'21453225','21453844',11),
  ('nsbp-10','NSB','Norton Small Business Premium',10,199.99,62.9,83.33,83.33,'21453254','21453850',12),
  ('nsbp-20','NSB','Norton Small Business Premium',20,299.99,95.33,125.0,125.0,'21453236','21453851',13)
on conflict (produit_id) do nothing;
