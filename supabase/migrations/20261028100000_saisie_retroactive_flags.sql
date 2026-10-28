-- Saisie post-date : visites / appels créés pour une date passée, à renseigner après coup.
-- Le drapeau empêche le marquage automatique « manquée » et trace la saisie rétroactive.
alter table public.visites add column if not exists saisie_retroactive boolean not null default false;
alter table public.phoning add column if not exists saisie_retroactive boolean not null default false;
comment on column public.visites.saisie_retroactive is 'true = visite planifiée a posteriori (date passée) ; exclue du passage automatique en « manquée »';
comment on column public.phoning.saisie_retroactive is 'true = appel planifié a posteriori (date passée)';
