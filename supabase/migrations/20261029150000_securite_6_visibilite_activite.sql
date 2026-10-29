-- Sécurité 6 (lot 2/3) : visibilité par rôle sur l'activité terrain (visites, appels, actions, fiches froides).
-- Même règle que le lot 1 (esi_voit_ligne) appliquée à la colonne pin_cds :
-- ADMIN / CHANNEL_MANAGER voient tout ; un CDS voit ses lignes et celles sans CDS ; EXTERNE : rien.
-- Retour arrière : voir le bas du fichier.

drop policy if exists visibilite_role on public.visites;
create policy visibilite_role on public.visites as restrictive for all to anon, authenticated
  using (public.esi_voit_ligne(pin_cds::text, false)) with check (public.esi_voit_ligne(pin_cds::text, false));

drop policy if exists visibilite_role on public.phoning;
create policy visibilite_role on public.phoning as restrictive for all to anon, authenticated
  using (public.esi_voit_ligne(pin_cds::text, false)) with check (public.esi_voit_ligne(pin_cds::text, false));

drop policy if exists visibilite_role on public.actions;
create policy visibilite_role on public.actions as restrictive for all to anon, authenticated
  using (public.esi_voit_ligne(pin_cds::text, false)) with check (public.esi_voit_ligne(pin_cds::text, false));

drop policy if exists visibilite_role on public.fiches_froides;
create policy visibilite_role on public.fiches_froides as restrictive for all to anon, authenticated
  using (public.esi_voit_ligne(pin_cds::text, false)) with check (public.esi_voit_ligne(pin_cds::text, false));

-- ── Retour arrière ──
-- drop policy visibilite_role on public.visites;
-- drop policy visibilite_role on public.phoning;
-- drop policy visibilite_role on public.actions;
-- drop policy visibilite_role on public.fiches_froides;
