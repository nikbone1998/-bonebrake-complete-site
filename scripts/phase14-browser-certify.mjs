import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl=(process.env.BASE_URL||'').replace(/\/$/,'');
if(!baseUrl) throw new Error('BASE_URL is required');
const out=path.resolve('artifacts/phase14-browser');
await fs.mkdir(out,{recursive:true});

const viewports=[
 {name:'desktop-1440',width:1440,height:1000},
 {name:'desktop-1280',width:1280,height:900},
 {name:'desktop-1024',width:1024,height:850},
 {name:'mobile-430',width:430,height:932},
 {name:'mobile-402',width:402,height:874},
 {name:'mobile-393',width:393,height:852},
 {name:'mobile-390',width:390,height:844},
 {name:'mobile-360',width:360,height:800},
];
const routes=['/','/work.html','/case-aurelia.html','/case-northstar.html','/case-oak-stone.html','/case-westside-auto-lab.html','/case-lakeview-dental.html','/aurelia.html','/northstar.html','/oak-stone.html','/westside-auto-lab.html','/lakeview-dental.html','/website-audit.html','/audit-report.html','/dashboard.html','/proposal.html','/privacy.html','/terms.html','/404.html'];
const failures=[]; const observations=[];
const browser=await chromium.launch({headless:true});
const safe=r=>r==='/'?'home':r.replace(/^\//,'').replace(/\.html$/,'').replace(/[^a-z0-9-]+/gi,'-');

for(const vp of viewports){
 const context=await browser.newContext({viewport:{width:vp.width,height:vp.height},deviceScaleFactor:1,reducedMotion:'reduce'});
 for(const route of routes){
  const page=await context.newPage();
  const consoleErrors=[]; const pageErrors=[]; const resource404=[]; const failedSameOrigin=[]; const serverErrors=[];
  page.on('console',m=>{if(m.type()==='error') consoleErrors.push(m.text())});
  page.on('pageerror',e=>pageErrors.push(String(e)));
  page.on('requestfailed',req=>{try{const u=new URL(req.url()),b=new URL(baseUrl);if(u.origin===b.origin) failedSameOrigin.push(`${req.method()} ${u.pathname}: ${req.failure()?.errorText||'failed'}`)}catch{}});
  page.on('response',res=>{try{const u=new URL(res.url()),b=new URL(baseUrl),s=res.status();if(s===404 && u.href!==`${baseUrl}/404.html`) resource404.push(`${s} ${u.href}`);if(u.origin===b.origin&&s>=500) serverErrors.push(`${s} ${u.pathname}`)}catch{}});
  let response;
  try{response=await page.goto(`${baseUrl}${route}`,{waitUntil:'domcontentloaded',timeout:30000});await page.waitForTimeout(900)}catch(e){failures.push(`${vp.name} ${route}: navigation failed: ${e.message}`);await page.close();continue}
  const status=response?.status()??0;
  if(route!=='/404.html'&&status>=400) failures.push(`${vp.name} ${route}: HTTP ${status}`);
  if(route==='/404.html'&&status>=500) failures.push(`${vp.name} ${route}: HTTP ${status}`);
  const title=await page.title().catch(()=>''),bodyText=await page.locator('body').innerText().catch(()=>'');
  if(/authentication required|vercel login|log in to vercel/i.test(`${title}\n${bodyText.slice(0,1200)}`)) failures.push(`${vp.name} ${route}: Vercel protection blocked runner`);
  const m=await page.evaluate(()=>({vw:document.documentElement.clientWidth,sw:document.documentElement.scrollWidth,bsw:document.body?.scrollWidth||0,h1:document.querySelectorAll('h1').length}));
  if(Math.max(m.sw,m.bsw)>m.vw+3){
    const offenders=await page.evaluate(()=>[...document.querySelectorAll('body *')].map(el=>({el,r:el.getBoundingClientRect()})).filter(x=>x.r.width>0&&x.r.height>0&&(x.r.right>innerWidth+2||x.r.left<-2||x.el.scrollWidth>x.el.clientWidth+3)).slice(0,12).map(x=>`${x.el.tagName.toLowerCase()}${x.el.id?'#'+x.el.id:''}${x.el.classList?.length?'.'+[...x.el.classList].slice(0,2).join('.'):''} right=${Math.round(x.r.right)} scroll=${x.el.scrollWidth}/${x.el.clientWidth}`));
    failures.push(`${vp.name} ${route}: horizontal overflow ${Math.max(m.sw,m.bsw)} > ${m.vw}; ${offenders.join(' || ')}`);
  }
  if(route==='/'){
    const diag=page.locator('.p12-diagnostic'); if(!(await diag.count())) failures.push(`${vp.name} home: diagnostic missing`);
    else {const b=diag.locator('button');if(await b.count()) await b.first().click({timeout:3000}).catch(e=>failures.push(`${vp.name} home: diagnostic click failed: ${e.message}`));}
    if(vp.width<=430){const btn=page.locator('button[aria-controls],button[aria-expanded],.nav-toggle,.menu-toggle').first();if(await btn.count()){await btn.click({timeout:3000}).catch(e=>failures.push(`${vp.name} home: mobile menu click failed: ${e.message}`));}}
  }
  if(route==='/website-audit.html'&&!(await page.locator('input[type="url"]').count())) failures.push(`${vp.name} audit: URL input missing`);
  if(route==='/dashboard.html'){
    if(!(await page.locator('#loginEmail').count())) failures.push(`${vp.name} dashboard: login email missing`);
    if(!(await page.locator('#loginBtn').count())) failures.push(`${vp.name} dashboard: login button missing`);
  }
  if((route==='/privacy.html'||route==='/terms.html')&&m.h1<1) failures.push(`${vp.name} ${route}: no h1`);
  if(consoleErrors.length) failures.push(`${vp.name} ${route}: console errors: ${[...new Set(consoleErrors)].slice(0,5).join(' | ')}`);
  if(resource404.length) failures.push(`${vp.name} ${route}: 404 resources: ${[...new Set(resource404)].slice(0,8).join(' | ')}`);
  if(pageErrors.length) failures.push(`${vp.name} ${route}: page errors: ${[...new Set(pageErrors)].slice(0,5).join(' | ')}`);
  if(failedSameOrigin.length) failures.push(`${vp.name} ${route}: failed same-origin requests: ${[...new Set(failedSameOrigin)].slice(0,5).join(' | ')}`);
  if(serverErrors.length) failures.push(`${vp.name} ${route}: server errors: ${[...new Set(serverErrors)].slice(0,5).join(' | ')}`);
  if(vp.width<=430){
    const small=await page.evaluate(()=>[...document.querySelectorAll('button,input[type="submit"],[role="button"],nav a')].filter(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&(r.width<40||r.height<40)}).slice(0,8).map(el=>`${el.tagName.toLowerCase()}${el.id?'#'+el.id:''}:${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`));
    if(small.length) observations.push(`${vp.name} ${route}: small targets: ${small.join(', ')}`);
  }
  await page.screenshot({path:path.join(out,`${vp.name}--${safe(route)}.png`),fullPage:true}).catch(e=>failures.push(`${vp.name} ${route}: screenshot failed: ${e.message}`));
  await page.close();
 }
 await context.close();
}
await browser.close();
const report={baseUrl,generatedAt:new Date().toISOString(),viewports,routes,failures,observations};
await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
await fs.writeFile(path.join(out,'summary.txt'),[`Base URL: ${baseUrl}`,`Viewports: ${viewports.length}`,`Routes: ${routes.length}`,`Failures: ${failures.length}`,`Observations: ${observations.length}`,'',...failures.map(x=>`FAIL: ${x}`),...observations.map(x=>`NOTE: ${x}`)].join('\n'));
console.log(`Phase 14 real Chromium QA: ${viewports.length} × ${routes.length} = ${viewports.length*routes.length} combinations.`);
console.log(`Failures: ${failures.length}; observations: ${observations.length}`);
if(failures.length){for(const f of failures) console.error(`- ${f}`);process.exit(1)}
console.log('Phase 14 browser certification passed with zero blocking failures.');
