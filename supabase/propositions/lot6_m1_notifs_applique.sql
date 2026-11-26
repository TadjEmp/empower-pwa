-- Lot 6 / M1 — notifications non falsifiables : expéditeur tracé, types autorisés, taille et fréquence plafonnées.
alter table public.notifs add column if not exists pin_expediteur integer;

create or replace function public.notifs_marque_expediteur() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.pin_expediteur := nullif(esi_pin()::text, '')::integer;  -- imposé par le serveur (null = traitement serveur)
  return new;
end $$;

drop trigger if exists notifs_expediteur on public.notifs;
create trigger notifs_expediteur before insert on public.notifs
  for each row execute function public.notifs_marque_expediteur();

create or replace function public.esi_notifs_recentes() returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.notifs
  where pin_expediteur = nullif(esi_pin()::text, '')::integer and created_at > now() - interval '1 hour'
$$;

drop policy if exists anon_insert_notifs on public.notifs;
create policy anon_insert_notifs on public.notifs for insert to anon
  with check (
    char_length(coalesce(message, '')) <= 500
    and (select esi_notifs_recentes()) < 200
    and (
      (select esi_role()) in ('ADMIN','CHANNEL_MANAGER','CDS') and type_notif in (
        'NOUVEAU_LEAD','ALERTE_EMPOWER','LEAD_ASSIGNE','LEAD_ATTRIBUE_AUTO','LEAD_A_ATTRIBUER','COMPTE_CREE','CONVERSION_FROID',
        'STATUT_EN_COURS','STATUT_INTEGRE','STATUT_ARCHIVE','STATUT_CHANGE','SCORE_GROQ','SCORE_GROQ_CHANNEL','A_CONTACTER','SUGGESTION_NOUVELLE')
      or (select esi_role()) = 'ADMIN' and type_notif = 'SUGGESTION_REPONSE'
      or (select esi_role()) = 'EXTERNE' and type_notif in ('NOUVEAU_LEAD','ALERTE_EMPOWER','LEAD_ASSIGNE','LEAD_ATTRIBUE_AUTO','LEAD_A_ATTRIBUER','SUGGESTION_NOUVELLE')
    )
  );
