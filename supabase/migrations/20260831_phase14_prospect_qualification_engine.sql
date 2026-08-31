alter table public.prospect_candidates
  add column if not exists qualification_tier text not null default 'unscored',
  add column if not exists score_breakdown jsonb not null default '{}'::jsonb;

alter table public.prospect_candidates drop constraint if exists prospect_candidates_qualification_tier_check;
alter table public.prospect_candidates add constraint prospect_candidates_qualification_tier_check check (qualification_tier in ('unscored','A','B','C','D'));

create unique index if not exists prospect_candidates_source_record_unique
  on public.prospect_candidates (source_system, source_record_id)
  where source_record_id is not null;

create or replace function public.phase14_score_prospect_candidate()
returns trigger
language plpgsql
as $$
declare
  s int := 0;
  b jsonb := '{}'::jsonb;
  t text := 'D';
  title_l text := lower(coalesce(new.contact_title,''));
  industry_l text := lower(coalesce(new.industry,''));
begin
  if new.website is not null or new.normalized_domain is not null then s := s + 15; b := b || '{"website":15}'::jsonb; end if;
  if new.email is not null and position('@' in new.email) > 1 then s := s + 15; b := b || '{"email":15}'::jsonb; end if;
  if new.phone is not null and length(regexp_replace(new.phone,'[^0-9]','','g')) >= 10 then s := s + 10; b := b || '{"phone":10}'::jsonb; end if;
  if title_l ~ '(owner|founder|president|principal|chief executive|ceo|partner)' then s := s + 10; b := b || '{"decision_maker":10}'::jsonb; end if;
  if lower(coalesce(new.country,'united states')) in ('united states','us','usa','u.s.','u.s.a.') then s := s + 5; b := b || '{"us_market":5}'::jsonb; end if;
  if new.employee_count between 2 and 50 then s := s + 10; b := b || '{"company_size":10}'::jsonb;
  elsif new.employee_count between 51 and 200 then s := s + 5; b := b || '{"company_size":5}'::jsonb; end if;
  if new.review_count >= 100 then s := s + 15; b := b || '{"review_volume":15}'::jsonb;
  elsif new.review_count >= 25 then s := s + 10; b := b || '{"review_volume":10}'::jsonb;
  elsif new.review_count >= 10 then s := s + 5; b := b || '{"review_volume":5}'::jsonb; end if;
  if new.rating >= 4.5 then s := s + 10; b := b || '{"rating":10}'::jsonb;
  elsif new.rating >= 4.0 then s := s + 7; b := b || '{"rating":7}'::jsonb;
  elsif new.rating >= 3.5 then s := s + 3; b := b || '{"rating":3}'::jsonb;
  elsif new.rating is not null and new.rating < 3.0 then s := greatest(0,s-10); b := b || '{"rating_penalty":-10}'::jsonb; end if;
  if industry_l ~ '(plumb|hvac|heating|cooling|roof|electric|landscap|concrete|dental|dentist|auto repair|automotive|moving|contractor|construction|remodel|garage door|pest control|tree service|flooring|painting)' then s := s + 10; b := b || '{"target_industry":10}'::jsonb; end if;
  s := greatest(0,least(100,s));
  if s >= 70 then t := 'A'; elsif s >= 50 then t := 'B'; elsif s >= 35 then t := 'C'; else t := 'D'; end if;
  new.discovery_score := s;
  new.qualification_tier := t;
  new.score_breakdown := b;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists phase14_score_prospect_candidate on public.prospect_candidates;
create trigger phase14_score_prospect_candidate
before insert or update of website, normalized_domain, email, phone, contact_title, country, employee_count, review_count, rating, industry
on public.prospect_candidates
for each row execute function public.phase14_score_prospect_candidate();

drop view if exists public.prospect_ready_for_audit;
create view public.prospect_ready_for_audit with (security_invoker=true) as
select id, created_at, company_name, website, normalized_domain, contact_name, contact_title, email, phone, city, region, country, industry, employee_count, review_count, rating, discovery_score, qualification_tier, score_breakdown, source_system
from public.prospect_candidates
where status = 'discovered'
  and qualification_tier in ('A','B')
  and website is not null
  and audit_id is null
  and lead_id is null;
