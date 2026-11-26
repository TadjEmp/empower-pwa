-- Trois produits au prix d'achat Empower relevé le 5 nov. 2026 (portail Empower).
-- PVP TTC et références grossiste non fournis : laissés à null, à saisir dans Réglages > Prix.
-- Tant que le PVP est vide, le produit n'apparaît pas dans le calculateur (jamais de prix inventé).
insert into public.catalogue_produits (produit_id, famille, nom, appareils, pvp_ttc, pa_empower, pa_td, pa_ingram, sku_td, sku_ingram, ordre) values
  ('vpn-plus5','VPN','Norton VPN Plus',5,null,17.05,null,null,null,null,14),
  ('vpn-std1','VPN','Norton VPN Standard',1,null,11.74,null,null,null,null,15),
  ('util-wl10','UTIL','Norton Utilities WL',10,null,14.30,null,null,null,null,16)
on conflict (produit_id) do nothing;
