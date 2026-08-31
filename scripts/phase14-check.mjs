import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const root=process.cwd();
const failures=[];
const required=['phase14-autopilot.js','phase14-autopilot.css'];
for(const file of required){try{await fs.access(path.join(root,file))}catch{failures.push(`Missing Phase 14 file: ${file}`)}}

try{
  execFileSync(process.execPath,['--check',path.join(root,'phase14-autopilot.js')],{stdio:'pipe'});
}catch(error){failures.push(`phase14-autopilot.js syntax invalid: ${String(error.stderr||error.message).trim()}`)}

try{
  const html=await fs.readFile(path.join(root,'dashboard.html'),'utf8');
  if(!html.includes('phase14-autopilot.css')) failures.push('dashboard does not load Phase 14 styles');
  if(!html.includes('phase14-autopilot.js')) failures.push('dashboard does not load Phase 14 approval layer');
  if(!html.includes('Business operating layer / Phase 14')) failures.push('dashboard release label is not Phase 14');
}catch(error){failures.push(`dashboard Phase 14 validation failed: ${error.message}`)}

try{
  const source=await fs.readFile(path.join(root,'phase14-autopilot.js'),'utf8');
  for(const marker of ["'automation_actions'","'automation_settings'",'STOP ALL AUTOMATION','approved_by','rejection_reason'])if(!source.includes(marker))failures.push(`Autopilot approval layer missing marker: ${marker}`);
  for(const forbidden of ['sb_secret_','SUPABASE_SERVICE_ROLE_KEY','service_role'])if(source.includes(forbidden))failures.push(`Autopilot client contains privileged credential marker: ${forbidden}`);
  for(const unsafe of ['autopilot_enabled:true','outreach_enabled:true','payments_enabled:true','production_deploy_enabled:true'])if(source.replace(/\s/g,'').includes(unsafe))failures.push(`Autopilot UI can directly enable protected capability: ${unsafe}`);
}catch(error){failures.push(`Autopilot source validation failed: ${error.message}`)}

try{
  await fs.access(path.join(root,'api/phase13-owner-bootstrap.js'));
  failures.push('Temporary Phase 13 owner bootstrap bridge must not ship in Phase 14');
}catch{}

try{
  const workflow=await fs.readFile(path.join(root,'.github/workflows/phase13-ci.yml'),'utf8');
  if(!/phase14-\*/.test(workflow)) failures.push('CI does not run on Phase 14 branches');
}catch(error){failures.push(`Phase 14 CI validation failed: ${error.message}`)}

if(failures.length){
  console.error(`Phase 14 Autopilot checks failed (${failures.length}):`);
  for(const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Phase 14 Autopilot checks passed (${required.length} required files + approval, kill-switch, credential, and CI safeguards).`);
