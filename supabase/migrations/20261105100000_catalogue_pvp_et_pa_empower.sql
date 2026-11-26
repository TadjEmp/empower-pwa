-- Décisions du 5 nov. 2026 : PVP TTC Advanced 10 = 59,99 € (Book Empower), Platinum 20 = 79,99 €.
update public.catalogue_produits set pvp_ttc = 59.99 where produit_id = 'n360-adv10';
-- Relevé du portail Empower du 5 nov. 2026
update public.catalogue_produits set pa_empower = 22.82 where produit_id = 'n360-prem10';
update public.catalogue_produits set pa_empower = 16.34 where produit_id = 'n360-del5';
-- Platinum 20 : non vendu sur le portail Empower, pa_empower reste null.
