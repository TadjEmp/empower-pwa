create table if not exists public.suggestions (
  id bigint generated always as identity primary key,
  pin_auteur integer not null,
  nom_auteur text,
  role_auteur text,
  categorie text not null default 'SUGGESTION' check (categorie in ('SUGGESTION','PROBLEME','QUESTION')),
  message text not null check (char_length(message) between 3 and 2000),
  page text,
  statut text not null default 'NOUVEAU' check (statut in ('NOUVEAU','EN_COURS','TRAITE','REFUSE')),
  reponse text,
  traite_par integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.suggestions enable row level security;
create policy suggestions_lecture on public.suggestions for select to anon, authenticated
  using ((select esi_session_valide()) and ((select esi_role()) = 'ADMIN' or pin_auteur = (select esi_pin())));
create policy suggestions_ajout on public.suggestions for insert to anon, authenticated
  with check ((select esi_session_valide()) and pin_auteur = (select esi_pin()) and statut = 'NOUVEAU' and reponse is null);
create policy suggestions_admin_maj on public.suggestions for update to anon, authenticated
  using ((select esi_session_valide()) and (select esi_role()) = 'ADMIN')
  with check ((select esi_session_valide()) and (select esi_role()) = 'ADMIN');
create policy suggestions_admin_suppr on public.suggestions for delete to anon, authenticated
  using ((select esi_session_valide()) and (select esi_role()) = 'ADMIN');
create policy suggestions_service on public.suggestions for all to service_role using (true) with check (true);
