-- Phase 14: harden prospect outreach media delivery evidence.
-- Existing historical sent rows are preserved. NOT VALID constraints are enforced for
-- new/updated rows without retroactively invalidating earlier outreach.

alter table public.prospect_outreach_events
  add column if not exists sample_mime_type text,
  add column if not exists sample_bytes integer,
  add column if not exists sample_width_px integer,
  add column if not exists email_media_verified boolean not null default false;

alter table public.prospect_outreach_events
  drop constraint if exists prospect_outreach_sent_media_guard;

alter table public.prospect_outreach_events
  add constraint prospect_outreach_sent_media_guard check (
    event_type <> 'sent'
    or (
      email_media_verified = true
      and lower(coalesce(sample_mime_type,'')) in ('image/png','image/jpeg')
      and coalesce(sample_filename,'') ~* '\.(png|jpe?g)$'
      and sample_bytes is not null
      and sample_bytes > 0
      and sample_bytes <= 1048576
      and sample_width_px between 600 and 800
      and coalesce(metadata->>'gmail_media_delivery','') in ('attachment','inline')
      and coalesce(metadata->>'gmail_media_verified','false') = 'true'
      and nullif(gmail_message_id,'') is not null
      and nullif(gmail_thread_id,'') is not null
    )
  ) not valid;

comment on column public.prospect_outreach_events.email_media_verified is
  'True only after authoritative Gmail readback proves the expected PNG/JPEG exists in attachments or inline_images.';

comment on constraint prospect_outreach_sent_media_guard on public.prospect_outreach_events is
  'New sent outreach evidence must use a verified raster sample delivered as a real Gmail MIME attachment/inline image; remote SVG-only proof is forbidden.';
