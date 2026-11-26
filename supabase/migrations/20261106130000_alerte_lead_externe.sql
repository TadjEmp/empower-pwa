-- APPLIQUÉE en production le 06/11/2026. Testée en transaction annulée : 3 alertes pour un lead d'externe, 0 pour un lead de responsable canal.
-- Alerte aux responsables canal (CHANNEL_MANAGER : Alexandra, Sabine, Sophie) quand un EXTERNE saisit un lead dans le Tracker.
-- Côté base (et non côté appareil) : un externe n'a pas accès à la liste des utilisateurs. Le déclencheur notify_push()
-- envoie ensuite le push aux appareils abonnés. Les leads saisis par un responsable canal ou un commercial ne déclenchent rien ici.
create or replace function public.leads_alerte_externe() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare v_role text; v_nom text;
begin
  if new.pin_channel is null then return new; end if;
  select role, nom into v_role, v_nom from utilisateurs where pin = new.pin_channel;
  if v_role is distinct from 'EXTERNE' then return new; end if;
  insert into notifs (id_notif_gas, pin_destinataire, type_notif, message, id_cible, statut_lu, date_envoi)
  select 'NOTIF_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12), u.pin, 'NOUVEAU_LEAD',
         'Nouveau lead saisi par ' || coalesce(v_nom, 'un externe') || ' : ' || coalesce(new.nom_compte, '?')
           || case when coalesce(new.ville, '') <> '' then ', ' || new.ville else '' end || '.',
         new.id_prospect_gas, false, now()
  from utilisateurs u where u.role = 'CHANNEL_MANAGER' and u.actif;
  return new;
exception when others then
  return new;   -- l'alerte ne doit jamais empêcher la saisie du lead
end $$;

drop trigger if exists leads_alerte_externe on public.leads;
create trigger leads_alerte_externe after insert on public.leads
  for each row execute function public.leads_alerte_externe();
