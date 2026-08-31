import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.95.0/+esm';

const SB='https://usurytofnhhfxxipngdd.supabase.co';
const KEY='sb_publishable_jpA7u89wOaxWcyO5NU5cGw_HkQTnOkv';
const OWNER='bonebrakewebsitedesign@gmail.com';
const CONTROL=`${SB}/functions/v1/pilot-control`;
const db=createClient(SB,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});

export async function approvePilotAction(actionId){
  const{data:{session}}=await db.auth.getSession();
  if(!session||session.user?.email?.toLowerCase()!==OWNER){alert('Owner authentication is required for pilot activation.');return}
  const{data:action,error}=await db.from('automation_actions').select('*').eq('id',actionId).maybeSingle();
  if(error||!action||action.action_type!=='activate_single_customer_pilot'||action.entity_type!=='pilot_activation_plan'){alert('Pilot activation action could not be verified. Nothing was activated.');return}
  if(action.status!=='pending'){alert('This pilot activation action is no longer pending. Open Pilot Control to inspect its current state.');return}
  if(!confirm('APPROVE AND ACTIVATE THE FIRST-CUSTOMER PILOT?\n\nThis is the final live-pilot approval.\n\nOnly Autopilot + Payments + Fulfillment may turn ON.\nProspecting, Outreach, Auto Reply and Production remain OFF.\nCustomer capacity: exactly 1.'))return;
  const stamp=new Date().toISOString();
  const{data:approved,error:approvalError}=await db.from('automation_actions').update({status:'approved',approved_at:stamp,approved_by:session.user.id,updated_at:stamp,rejection_reason:null,rejected_at:null}).eq('id',action.id).eq('status','pending').select('id,status').maybeSingle();
  if(approvalError||!approved){alert(`Pilot approval failed: ${approvalError?.message||'action was not pending'}`);return}
  const response=await fetch(CONTROL,{method:'POST',headers:{'Content-Type':'application/json','apikey':KEY,'Authorization':`Bearer ${session.access_token}`},body:JSON.stringify({action:'activate',plan_id:action.entity_id,action_id:action.id})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok!==true){alert(`Approval was recorded, but pilot activation did not complete: ${data?.error||`HTTP ${response.status}`}\n\nOpen Pilot Control and use Execute Approved Activation to retry safely.`);window.dispatchEvent(new CustomEvent('phase14-pilot-state-changed'));return}
  alert('First-customer pilot is ACTIVE under the one-customer safety caps. Prospecting, Outreach, Auto Reply and Production remain OFF.');
  window.dispatchEvent(new CustomEvent('phase14-pilot-state-changed'));
  document.getElementById('pilotControlTab')?.click();
}
