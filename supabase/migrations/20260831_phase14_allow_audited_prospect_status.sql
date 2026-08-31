alter table public.prospect_candidates drop constraint if exists prospect_candidates_status_check;

alter table public.prospect_candidates
  add constraint prospect_candidates_status_check
  check (
    status = any (
      array[
        'discovered'::text,
        'needs_enrichment'::text,
        'ready_for_audit'::text,
        'auditing'::text,
        'audited'::text,
        'qualified'::text,
        'rejected'::text,
        'duplicate'::text,
        'promoted'::text
      ]
    )
  );
