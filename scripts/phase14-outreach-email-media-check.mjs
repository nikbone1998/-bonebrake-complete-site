import fs from 'node:fs';

const standard = fs.readFileSync('PHASE14_PROSPECT_SELECTION_STANDARD.md','utf8');
const migration = fs.readFileSync('supabase/migrations/20260901_phase14_outbound_email_media_guard.sql','utf8');

const requiredStandard = [
  'Never use a GitHub-hosted, CDN-hosted, or other remote SVG',
  'Render the approved concept sample to a real **PNG or JPEG**',
  'attachment_files',
  'has_attachment=true',
  'inline_images',
  'gmail_media_verified=true'
];

const requiredMigration = [
  'sample_mime_type',
  'sample_bytes',
  'sample_width_px',
  'email_media_verified',
  "image/png",
  "image/jpeg",
  "gmail_media_delivery",
  "gmail_media_verified",
  'prospect_outreach_sent_media_guard'
];

const failures = [];
for (const needle of requiredStandard) if (!standard.includes(needle)) failures.push(`standard missing: ${needle}`);
for (const needle of requiredMigration) if (!migration.includes(needle)) failures.push(`migration missing: ${needle}`);

if (/raw\.githubusercontent\.com[^\n]+\.svg/i.test(standard)) {
  failures.push('authoritative standard must not prescribe raw GitHub SVG delivery');
}

if (failures.length) {
  console.error('Outbound email media QA failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}

console.log('Outbound email media QA passed: raster-only delivery policy and DB evidence guard present.');
