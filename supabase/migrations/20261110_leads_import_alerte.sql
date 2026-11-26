-- v3 : les leads importés en lot (source_import = 'IMPORT_EXCEL') ne déclenchent plus une alerte par lead ; la fonction leads_import_alerte() envoie une alerte récapitulative.
-- Alertes d'un lead saisi par un externe : channel managers ET admins (nouveau lead), plus le commercial assigné (lead assigné).
-- Émises par la base : ne dépendent plus du poste de l'externe. Le push part ensuite via notify_push() (appareils abonnés).
create or replace function public.leads_alerte_externe() returns trigger
language plpgsql security definer set search_path to 'public' as $function$
declare v_role text; v_nom text; v_lieu text; v_pin text := new.pin_cds_assigne::text;
begin
  if new.pin_channel is null or new.source_import = 'IMPORT_EXCEL' then return new; end if;
  select role, nom into v_role, v_nom from utilisateurs where pin = new.pin_channel;
  if v_role is distinct from 'EXTERNE' then return new; end if;
  v_lieu := coalesce(new.nom_compte, '?') || case when coalesce(new.ville, '') <> '' then ', ' || new.ville else '' end;

  insert into notifs (id_notif_gas, pin_destinataire, type_notif, message, id_cible, statut_lu, date_envoi)
  select 'NOTIF_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12), u.pin, 'NOUVEAU_LEAD',
         'Nouveau lead saisi par ' || coalesce(v_nom, 'un externe') || ' : ' || v_lieu || case when v_pin is null then ' (à attribuer).' else '.' end,
         new.id_prospect_gas, false, now()
  from utilisateurs u
  where u.actif and u.role in ('CHANNEL_MANAGER', 'ADMIN') and u.pin::text is distinct from v_pin;

  if v_pin is not null then
    insert into notifs (id_notif_gas, pin_destinataire, type_notif, message, id_cible, statut_lu, date_envoi)
    select 'NOTIF_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12), u.pin, 'LEAD_ASSIGNE',
           'Lead assigné : ' || v_lieu || ', saisi par ' || coalesce(v_nom, 'un externe') || '. Premier contact sous 48 h.',
           new.id_prospect_gas, false, now()
    from utilisateurs u where u.actif and u.pin::text = v_pin;
  end if;
  return new;
exception when others then
  return new;
end $function$;

-- Alerte récapitulative d'un import Excel : un message par destinataire, quel que soit le nombre de leads.
-- Appelée par le navigateur après l'insertion en lot. Idempotente (une seule alerte par lot), limitée aux leads de l'appelant.
create or replace function public.leads_import_alerte(p_ids text[]) returns integer
language plpgsql security definer set search_path to 'public' as $function$
declare v_pin text := esi_pin()::text; v_nom text; v_nb int; v_sans int; r record;
begin
  if not coalesce(esi_session_valide(), false) or esi_role() not in ('EXTERNE', 'CHANNEL_MANAGER', 'ADMIN') then return 0; end if;
  if p_ids is null or array_length(p_ids, 1) is null or array_length(p_ids, 1) > 500 then return 0; end if;
  if exists (select 1 from notifs where type_notif = 'NOUVEAU_LEAD' and id_cible = p_ids[1]) then return 0; end if;
  select nom into v_nom from utilisateurs where pin::text = v_pin;
  select count(*), count(*) filter (where pin_cds_assigne is null) into v_nb, v_sans
    from leads where id_prospect_gas = any(p_ids) and pin_channel::text = v_pin and source_import = 'IMPORT_EXCEL';
  if v_nb = 0 then return 0; end if;

  insert into notifs (id_notif_gas, pin_destinataire, type_notif, message, id_cible, statut_lu, date_envoi)
  select 'NOTIF_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12), u.pin, 'NOUVEAU_LEAD',
         coalesce(v_nom, 'Un utilisateur') || ' a importé ' || v_nb || ' lead' || case when v_nb > 1 then 's' else '' end
           || case when v_sans > 0 then ' (dont ' || v_sans || ' à attribuer)' else '' end || '.',
         p_ids[1], false, now()
  from utilisateurs u where u.actif and u.role in ('CHANNEL_MANAGER', 'ADMIN') and u.pin::text <> v_pin;

  for r in select pin_cds_assigne as p, count(*) as n from leads
           where id_prospect_gas = any(p_ids) and pin_channel::text = v_pin and source_import = 'IMPORT_EXCEL' and pin_cds_assigne is not null
           group by pin_cds_assigne loop
    insert into notifs (id_notif_gas, pin_destinataire, type_notif, message, id_cible, statut_lu, date_envoi)
    select 'NOTIF_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12), u.pin, 'LEAD_ASSIGNE',
           r.n || ' lead' || case when r.n > 1 then 's' else '' end || ' vous ' || case when r.n > 1 then 'sont assignés' else 'est assigné' end
             || ' (import de ' || coalesce(v_nom, 'un utilisateur') || '). Premier contact sous 48 h.',
           p_ids[1], false, now()
    from utilisateurs u where u.actif and u.pin::text = r.p::text and u.pin::text <> v_pin;
  end loop;
  return v_nb;
end $function$;
grant execute on function public.leads_import_alerte(text[]) to anon, authenticated;
