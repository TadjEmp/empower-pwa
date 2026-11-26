-- Le UPDATE sans WHERE etait refuse par la base et bloquait l'ecriture de DATE_SYNC_SELLIN (declencheur params_recalc_ca).
create or replace function public.recalculer_ca_realise() returns void
language plpgsql as $function$
begin
  update objectifs_primes o set
    q1_ca_realise = ca_realise_cds(o.pin_cds, 1), q2_ca_realise = ca_realise_cds(o.pin_cds, 2),
    q3_ca_realise = ca_realise_cds(o.pin_cds, 3), q4_ca_realise = ca_realise_cds(o.pin_cds, 4),
    updated_at = now()
  where true;
end $function$;
