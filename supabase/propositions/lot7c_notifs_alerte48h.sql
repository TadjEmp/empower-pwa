-- ════════════════════════════════════════════════════════════════════
--  lot7c_notifs_alerte48h.sql — PROPOSITION, NON APPLIQUÉE
--  Objet : l'escalade de l'alerte 48 h écrit une notification de type ALERTE_48H. La policy d'insertion
--  `anon_insert_notifs` n'accepte qu'une liste fermée de types : l'écriture est refusée (erreur RLS constatée
--  le 5 nov. 2026 avec la session ADMIN). On ajoute ce seul type pour ADMIN, CHANNEL_MANAGER et CDS.
--  (DEMANDE_MDP est écrit par une fonction serveur avec la clé de service : aucune modification nécessaire.)
-- ════════════════════════════════════════════════════════════════════
drop policy if exists anon_insert_notifs on public.notifs;
create policy anon_insert_notifs on public.notifs for insert to anon
with check (
  (char_length(coalesce(message, '')) <= 500)
  and ((select public.esi_notifs_recentes()) < 200)
  and (
    (((select public.esi_role()) = any (array['ADMIN','CHANNEL_MANAGER','CDS']))
      and (type_notif = any (array['NOUVEAU_LEAD','ALERTE_EMPOWER','LEAD_ASSIGNE','LEAD_ATTRIBUE_AUTO','LEAD_A_ATTRIBUER',
        'COMPTE_CREE','CONVERSION_FROID','STATUT_EN_COURS','STATUT_INTEGRE','STATUT_ARCHIVE','STATUT_CHANGE',
        'SCORE_GROQ','SCORE_GROQ_CHANNEL','A_CONTACTER','SUGGESTION_NOUVELLE','ALERTE_48H'])))
    or (((select public.esi_role()) = 'ADMIN') and (type_notif = 'SUGGESTION_REPONSE'))
    or (((select public.esi_role()) = 'EXTERNE')
      and (type_notif = any (array['NOUVEAU_LEAD','ALERTE_EMPOWER','LEAD_ASSIGNE','LEAD_ATTRIBUE_AUTO','LEAD_A_ATTRIBUER','SUGGESTION_NOUVELLE'])))
  )
);
-- Retour arrière : recréer la policy sans 'ALERTE_48H' dans la liste.
