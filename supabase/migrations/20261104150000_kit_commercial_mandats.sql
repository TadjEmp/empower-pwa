-- Kit commercial (bibliothèque par rôle) et archives des mandats.
-- kit_documents : fiches de la bibliothèque ; le fichier vit dans le bucket privé kit-commercial (liens signés, jamais publics).
--   Visibilité : les documents « interne » (NE PAS DIFFUSER, sources grossistes) restent réservés à ADMIN, CDS, CHANNEL_MANAGER ;
--   les autres sont lisibles par tout rôle y compris EXTERNE. Un document échu (valide_au dépassé) reste listé mais l'app bloque son envoi.
--   Écriture : ADMIN et CHANNEL_MANAGER.
-- mandats : trace de chaque contrat de mandat généré depuis une fiche (qui, pour quel compte, quelle offre, quel montant).
create table if not exists public.kit_documents (
  id text primary key,
  titre text not null check (length(trim(titre)) > 0),
  groupe text not null,
  categorie text not null check (categorie in ('flyer','deck','book','offre','cotation','mandat','source','interne')),
  format text,
  interne boolean not null default false,
  paliers text[] not null default '{}' check (paliers <@ array['DORMANT','EVEIL','ACTIF','AMBASSADEUR']),
  valide_au date,
  version text,
  fichier_path text,
  fichier_nom text,
  taille bigint,
  ordre int not null default 0,
  actif boolean not null default true,
  maj_par int,
  updated_at timestamptz not null default now()
);
create table if not exists public.mandats (
  id uuid primary key default gen_random_uuid(),
  compte_id text,
  societe text not null,
  pin_cds int,
  canal text not null check (canal in ('empower','grossiste')),
  offre text not null check (offre in ('1+1','2+1','remise')),
  compensation text not null check (compensation in ('virement','licences','cheques')),
  montant_ht numeric(12,2) not null default 0 check (montant_ht >= 0),
  debut date, fin date,
  ref_commande text,
  representant text,
  statut text not null default 'genere' check (statut in ('genere','envoye','signe','annule')),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mandats_compte_idx on public.mandats (compte_id);
create index if not exists mandats_pin_idx on public.mandats (pin_cds);
alter table public.kit_documents enable row level security;
alter table public.mandats enable row level security;

drop policy if exists kit_documents_lecture on public.kit_documents;
drop policy if exists kit_documents_ecriture on public.kit_documents;
drop policy if exists kit_documents_service on public.kit_documents;
create policy kit_documents_lecture on public.kit_documents for select to anon, authenticated
  using ((select esi_session_valide()) and actif and (not interne or (select esi_role()) = any (array['ADMIN','CDS','CHANNEL_MANAGER'])));
create policy kit_documents_ecriture on public.kit_documents for all to anon, authenticated
  using ((select esi_session_valide()) and (select esi_role()) = any (array['ADMIN','CHANNEL_MANAGER']))
  with check ((select esi_session_valide()) and (select esi_role()) = any (array['ADMIN','CHANNEL_MANAGER']));
create policy kit_documents_service on public.kit_documents for all to service_role using (true) with check (true);

drop policy if exists mandats_lecture on public.mandats;
drop policy if exists mandats_creation on public.mandats;
drop policy if exists mandats_maj on public.mandats;
drop policy if exists mandats_suppr on public.mandats;
drop policy if exists mandats_service on public.mandats;
create policy mandats_lecture on public.mandats for select to anon, authenticated
  using ((select esi_session_valide()) and ((select esi_role()) = any (array['ADMIN','CHANNEL_MANAGER']) or (pin_cds is not null and pin_cds::text = (select esi_pin())::text)));
create policy mandats_creation on public.mandats for insert to anon, authenticated
  with check ((select esi_session_valide()) and (select esi_role()) = any (array['ADMIN','CDS','CHANNEL_MANAGER'])
    and ((select esi_role()) = any (array['ADMIN','CHANNEL_MANAGER']) or pin_cds::text = (select esi_pin())::text));
create policy mandats_maj on public.mandats for update to anon, authenticated
  using ((select esi_session_valide()) and ((select esi_role()) = any (array['ADMIN','CHANNEL_MANAGER']) or pin_cds::text = (select esi_pin())::text))
  with check ((select esi_session_valide()) and ((select esi_role()) = any (array['ADMIN','CHANNEL_MANAGER']) or pin_cds::text = (select esi_pin())::text));
create policy mandats_suppr on public.mandats for delete to anon, authenticated
  using ((select esi_session_valide()) and (select esi_role()) = 'ADMIN');
create policy mandats_service on public.mandats for all to service_role using (true) with check (true);

-- Bucket privé : lecture uniquement des fichiers rattachés à un document que le rôle a le droit de voir (la RLS de kit_documents s'applique dans la sous-requête).
insert into storage.buckets (id, name, public, file_size_limit)
  values ('kit-commercial', 'kit-commercial', false, 52428800)
  on conflict (id) do update set public = false, file_size_limit = 52428800;
drop policy if exists kit_storage_lecture on storage.objects;
drop policy if exists kit_storage_ecriture on storage.objects;
drop policy if exists kit_storage_maj on storage.objects;
drop policy if exists kit_storage_suppr on storage.objects;
create policy kit_storage_lecture on storage.objects for select to anon, authenticated
  using (bucket_id = 'kit-commercial' and (select esi_session_valide())
    and exists (select 1 from public.kit_documents d where d.fichier_path = storage.objects.name));
create policy kit_storage_ecriture on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'kit-commercial' and (select esi_session_valide()) and (select esi_role()) = any (array['ADMIN','CHANNEL_MANAGER']));
create policy kit_storage_maj on storage.objects for update to anon, authenticated
  using (bucket_id = 'kit-commercial' and (select esi_session_valide()) and (select esi_role()) = any (array['ADMIN','CHANNEL_MANAGER']))
  with check (bucket_id = 'kit-commercial' and (select esi_session_valide()) and (select esi_role()) = any (array['ADMIN','CHANNEL_MANAGER']));
create policy kit_storage_suppr on storage.objects for delete to anon, authenticated
  using (bucket_id = 'kit-commercial' and (select esi_session_valide()) and (select esi_role()) = any (array['ADMIN','CHANNEL_MANAGER']));

-- Fiches initiales : les fichiers s'ajoutent ensuite depuis l'app (Kit commercial › Ajouter le fichier).
insert into public.kit_documents (id, titre, groupe, categorie, format, interne, paliers, valide_au, ordre) values
  ('book-empower',            'Book Empower Norton 2026',                         'Book',                    'book',    'A4', false, '{DORMANT,EVEIL}', null, 10),
  ('book-empower-interne',    'Fiche interne Book Empower',                       'Book',                    'interne', 'A4', true,  '{}', null, 11),
  ('deck-fonct-avancees',     'Deck fonctionnalités avancées Norton',             'Decks',                   'deck',    'Digital', false, '{ACTIF,AMBASSADEUR}', null, 20),
  ('bundle-rentree',          'Bundle rentrée et cross-sell',                     'Offres',                  'offre',   'Digital', false, '{ACTIF}', null, 30),
  ('cotation-back2school',    'Cotation rentrée Back2School 2026',                'Cotations',               'cotation','Digital', false, '{EVEIL}', '2026-09-30', 40),
  ('cotation-b2s-argu',       'Fiche argumentaire cotation Back2School',          'Cotations',               'interne', 'A4', true,  '{}', '2026-09-30', 41),
  ('cotation-b2s-speech',     'Speech mailing cotation Back2School',              'Cotations',               'interne', 'A4', true,  '{}', '2026-09-30', 42),
  ('produits-add',            'Produits additionnels VPN et Utilities',           'Produits additionnels',   'offre',   'Digital', false, '{ACTIF,AMBASSADEUR}', null, 50),
  ('produits-add-interne',    'Fiche interne produits additionnels',              'Produits additionnels',   'interne', 'A4', true,  '{}', null, 51),
  ('flyer-bp-a4',             'Flyer bonnes pratiques',                           'Flyers bonnes pratiques', 'flyer',   'A4', false, '{DORMANT,EVEIL}', null, 60),
  ('flyer-bp-a5',             'Flyer bonnes pratiques',                           'Flyers bonnes pratiques', 'flyer',   'A5', false, '{}', null, 61),
  ('flyer-deepfakes-a4',      'Comprendre les deepfakes',                         'Flyers lifestyle',        'flyer',   'A4', false, '{}', null, 70),
  ('flyer-deepfakes-a5',      'Comprendre les deepfakes',                         'Flyers lifestyle',        'flyer',   'A5', false, '{}', null, 71),
  ('flyer-family-ctrl-a4',    'Contrôle parental Family',                         'Flyers lifestyle',        'flyer',   'A4', false, '{}', null, 72),
  ('flyer-family-ctrl-a5',    'Contrôle parental Family',                         'Flyers lifestyle',        'flyer',   'A5', false, '{}', null, 73),
  ('flyer-darkweb-a4',        'Dark Web Monitoring',                              'Flyers lifestyle',        'flyer',   'A4', false, '{}', null, 74),
  ('flyer-darkweb-a5',        'Dark Web Monitoring',                              'Flyers lifestyle',        'flyer',   'A5', false, '{}', null, 75),
  ('flyer-family-rv-a4',      'Norton Family recto verso',                        'Flyers lifestyle',        'flyer',   'A4', false, '{}', null, 76),
  ('flyer-family-rv-a5',      'Norton Family recto verso',                        'Flyers lifestyle',        'flyer',   'A5', false, '{}', null, 77),
  ('flyer-genie-a4',          'Norton Genie',                                     'Flyers lifestyle',        'flyer',   'A4', false, '{}', null, 78),
  ('flyer-genie-a5',          'Norton Genie',                                     'Flyers lifestyle',        'flyer',   'A5', false, '{}', null, 79),
  ('flyer-passwd-a4',         'Password Manager',                                 'Flyers lifestyle',        'flyer',   'A4', false, '{}', null, 80),
  ('flyer-passwd-a5',         'Password Manager',                                 'Flyers lifestyle',        'flyer',   'A5', false, '{}', null, 81),
  ('flyer-util-diag',         'Utilities : diagnostic',                           'Flyers VPN et Utilities', 'flyer',   'A4', false, '{ACTIF,AMBASSADEUR}', null, 90),
  ('flyer-util-entretien',    'Utilities : entretien régulier',                   'Flyers VPN et Utilities', 'flyer',   'A4', false, '{ACTIF,AMBASSADEUR}', null, 91),
  ('flyer-vpn-comptoir',      'VPN : Wi-Fi au comptoir',                          'Flyers VPN et Utilities', 'flyer',   'A4', false, '{ACTIF,AMBASSADEUR}', null, 92),
  ('flyer-vpn-voyage',        'VPN : voyage',                                     'Flyers VPN et Utilities', 'flyer',   'A4', false, '{ACTIF,AMBASSADEUR}', null, 93),
  ('src-book-commercial',     'Book commercial Empower (source)',                 'Sources Empower',         'source',  'A4', true,  '{}', null, 100),
  ('src-pas-a-pas',           'Pas à pas Empower',                                'Sources Empower',         'source',  'A4', true,  '{}', null, 101),
  ('src-reclamer-cle',        'Comment réclamer une clé',                         'Sources Empower',         'source',  'A4', true,  '{}', null, 102),
  ('src-registration',        'Processus d''inscription Empower',                 'Sources Empower',         'source',  'Digital', true, '{}', null, 103),
  ('src-brochure',            'Brochure Empower A4',                              'Sources Empower',         'source',  'A4', true,  '{}', null, 104),
  ('src-grossiste-book',      'Book du commercial grossiste',                     'Sources grossistes',      'source',  'Digital', true, '{}', null, 110),
  ('src-grossiste-tarifs',    'Tarifs opération Back2School Ingram et Tech Data', 'Sources grossistes',      'source',  'A4', true,  '{}', '2026-09-30', 111)
on conflict (id) do nothing;
