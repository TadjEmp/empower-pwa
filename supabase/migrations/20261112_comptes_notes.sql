-- Notes sur les comptes : journal horodaté, saisissable par tous les rôles (ADMIN, CHANNEL_MANAGER, CDS, EXTERNE)
-- sur les comptes qu'ils voient. Le commercial attribué, les channel managers et les admins sont notifiés
-- (hors auteur). Écriture uniquement via la fonction compte_note_ajouter (aucune politique d'écriture directe).
-- Retour arrière : drop function public.compte_note_ajouter(uuid, text, text); drop table public.comptes_notes;

create table if not exists public.comptes_notes (
  id          uuid primary key default gen_random_uuid(),
  compte_id   uuid not null references public.comptes(id) on delete cascade,
  type        text not null default 'NOTE' check (type in ('NOTE', 'MAJ_INFOS')),
  texte       text not null check (char_length(btrim(texte)) between 1 and 2000),
  auteur_pin  integer,
  auteur_nom  text,
  auteur_role text,
  created_at  timestamptz not null default now()
);
create index if not exists comptes_notes_compte_idx on public.comptes_notes (compte_id, created_at desc);

alter table public.comptes_notes enable row level security;

-- Lecture : toute note d'un compte que l'appelant voit (la RLS de comptes s'applique dans la sous-requête).
drop policy if exists notes_lecture on public.comptes_notes;
create policy notes_lecture on public.comptes_notes for select to anon, authenticated
  using (exists (select 1 from public.comptes c where c.id = comptes_notes.compte_id));
drop policy if exists session_requise on public.comptes_notes;
create policy session_requise on public.comptes_notes as restrictive for all to anon, authenticated
  using ((select public.esi_session_valide())) with check ((select public.esi_session_valide()));
grant select on public.comptes_notes to anon, authenticated;
revoke insert, update, delete, truncate on public.comptes_notes from anon, authenticated;

create or replace function public.compte_note_ajouter(p_compte uuid, p_texte text, p_type text default 'NOTE')
returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  v_pin int := (select public.esi_pin())::int;
  v_role text := (select public.esi_role());
  v_nom text; v_c record; v_texte text := btrim(coalesce(p_texte, '')); v_type text := upper(coalesce(p_type, 'NOTE'));
  v_cible text; v_msg text;
begin
  if not coalesce((select public.esi_session_valide()), false) or v_role is null then
    return jsonb_build_object('ok', false, 'erreur', 'Session expirée.');
  end if;
  if v_type not in ('NOTE', 'MAJ_INFOS') then v_type := 'NOTE'; end if;
  if char_length(v_texte) < 1 or char_length(v_texte) > 2000 then
    return jsonb_build_object('ok', false, 'erreur', 'Note vide ou trop longue (2000 caractères maximum).');
  end if;

  select id, id_compte_gas, nom_compte, ville, pin_cds_assigne into v_c from comptes where id = p_compte and coalesce(deleted, false) = false;
  if not found then return jsonb_build_object('ok', false, 'erreur', 'Compte introuvable.'); end if;
  -- même périmètre que la lecture : Admin et Channel Manager partout, Externe sur tous les comptes (lecture),
  -- commercial sur ses comptes et ceux non attribués.
  if not (v_role in ('ADMIN', 'CHANNEL_MANAGER', 'EXTERNE')
          or (v_role = 'CDS' and (v_c.pin_cds_assigne is null or v_c.pin_cds_assigne::text = v_pin::text))) then
    return jsonb_build_object('ok', false, 'erreur', 'Ce compte n''est pas dans votre périmètre.');
  end if;

  select nom into v_nom from utilisateurs where pin::text = v_pin::text;
  insert into comptes_notes (compte_id, type, texte, auteur_pin, auteur_nom, auteur_role)
  values (p_compte, v_type, v_texte, v_pin, v_nom, v_role);

  v_cible := coalesce(v_c.id_compte_gas, v_c.id::text);
  v_msg := coalesce(v_nom, 'Un utilisateur')
        || case when v_type = 'MAJ_INFOS' then ' a mis à jour les infos de ' else ' a ajouté une note sur ' end
        || coalesce(v_c.nom_compte, 'un compte') || case when coalesce(v_c.ville, '') <> '' then ' (' || v_c.ville || ')' else '' end
        || ' : ' || left(v_texte, 140) || case when char_length(v_texte) > 140 then '…' else '' end;

  insert into notifs (id_notif_gas, date_envoi, pin_destinataire, type_notif, message, id_cible, statut_lu)
  select 'NOTIF_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12), now(), u.pin, 'NOTE_COMPTE', v_msg, v_cible, false
  from utilisateurs u
  where u.actif
    and (u.role in ('ADMIN', 'CHANNEL_MANAGER') or u.pin::text = v_c.pin_cds_assigne::text)
    and u.pin::text <> v_pin::text;

  return jsonb_build_object('ok', true);
end $function$;
revoke all on function public.compte_note_ajouter(uuid, text, text) from public;
grant execute on function public.compte_note_ajouter(uuid, text, text) to anon, authenticated;
