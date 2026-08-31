(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href='phase12.css';document.head.appendChild(style);
 const hero=document.querySelector('.hero-inner');
 if(hero&&!hero.querySelector('.p12-hero-art')){
   const art=document.createElement('div');art.className='p12-hero-art reveal';art.setAttribute('aria-hidden','true');
   art.innerHTML='<div class="p12-orbit"></div><div class="p12-browser-stack"><div class="p12-browser one"></div><div class="p12-browser two"></div><span class="p12-browser-label a">Editorial / premium</span><span class="p12-browser-label b">Service / conversion</span></div><p class="p12-hero-note">One studio system. Different visual languages built around the business, the buyer, and the decision being made.</p>';
   hero.appendChild(art);
 }
 const desktop=document.querySelector('.nav-links');
 if(desktop&&!desktop.querySelector('[href="work.html"]')){
   const a=document.createElement('a');a.href='work.html';a.textContent='Case studies';desktop.insertBefore(a,desktop.firstChild);
 }
 const mobile=document.querySelector('.mobile-panel nav');
 if(mobile&&!mobile.querySelector('[href="work.html"]')){
   const a=document.createElement('a');a.href='work.html';a.textContent='Case studies';mobile.insertBefore(a,mobile.querySelector('[href="#work"]')||mobile.firstChild);
 }
 const cases=[
  ['case-aurelia.html','01 / Flagship'],['case-northstar.html','02 / Home services'],['case-oak-stone.html','03 / Outdoor living'],['case-westside-auto-lab.html','04 / Automotive'],['case-lakeview-dental.html','05 / Healthcare']
 ];
 document.querySelectorAll('.case-card').forEach((card,i)=>{
   const link=card.querySelector('.text-link');if(link&&cases[i]){link.href=cases[i][0];link.removeAttribute('target');link.removeAttribute('rel');link.textContent='View case study ↗'}
   const body=card.querySelector('.case-body>div');if(body&&cases[i]&&!body.querySelector('.p12-case-number')){const n=document.createElement('div');n.className='p12-case-number';n.textContent=cases[i][1];body.prepend(n)}
 });
 const work=document.querySelector('#work');
 if(work&&!document.querySelector('#diagnostic')){
  const section=document.createElement('section');section.className='section p12-diagnostic';section.id='diagnostic';
  section.innerHTML=`<div class="container">
   <div class="p12-diagnostic-head"><div class="eyebrow">Website diagnostic / 01</div><div><h2>See what a redesign actually <em>changes.</em></h2><p class="p12-diagnostic-intro">A redesign is not a new coat of paint. It changes what the visitor notices first, how quickly they understand the offer, what earns trust, and how easily they can take the next step. Use the controls below to inspect four common redesign decisions.</p></div></div>
   <div class="p12-compare" aria-live="polite">
    <div class="p12-compare-panel before"><div class="p12-compare-label"><span>Typical existing site</span><span id="diagBeforeLabel">Weak hierarchy</span></div><div class="p12-mocksite"><div class="p12-mockbar">•••</div><div class="p12-mockbody"><div class="p12-old-logo">LOCAL BUSINESS</div><div class="p12-old-title" id="diagOldTitle">Welcome to our website</div><div class="p12-old-lines"><span></span><span></span><span></span></div><div class="p12-old-buttons"><i></i><i></i></div></div></div></div>
    <div class="p12-compare-panel after"><div class="p12-compare-label"><span>BWD redesign direction</span><span id="diagAfterLabel">Clear priority</span></div><div class="p12-mocksite"><div class="p12-mockbar">•••</div><div class="p12-mockbody"><div class="p12-new-kicker" id="diagKicker">Service + location + trust</div><div class="p12-new-title" id="diagNewTitle">Lead with the reason a customer should care.</div><div class="p12-new-lines"><span></span><span></span></div><span class="p12-new-cta" id="diagCta">Request a quote ↗</span></div></div></div>
   </div>
   <div class="p12-diagnosis-grid" role="group" aria-label="Diagnostic focus">
    <button class="p12-diagnosis active" type="button" data-diag="hierarchy"><span>01 / Hierarchy</span><h3>Control attention.</h3><p>Make the most important business message the easiest thing to understand.</p></button>
    <button class="p12-diagnosis" type="button" data-diag="trust"><span>02 / Trust</span><h3>Look established.</h3><p>Use proof, structure, typography and restraint to reduce uncertainty.</p></button>
    <button class="p12-diagnosis" type="button" data-diag="mobile"><span>03 / Mobile</span><h3>Design the small screen.</h3><p>Reorder information and actions around how a real phone visitor behaves.</p></button>
    <button class="p12-diagnosis" type="button" data-diag="conversion"><span>04 / Conversion</span><h3>Clarify the next step.</h3><p>Replace vague navigation with a direct path toward a useful customer action.</p></button>
   </div>
   <div class="p12-diagnostic-actions"><span>No fabricated performance claims. This demonstrates design and information-architecture judgment.</span><a href="website-audit.html">Run the live website audit ↗</a></div>
  </div>`;
  work.after(section);
 }
 const states={
  hierarchy:{before:'Weak hierarchy',after:'Clear priority',old:'Welcome to our website',kicker:'Service + location + trust',title:'Lead with the reason a customer should care.',cta:'Request a quote ↗'},
  trust:{before:'Generic credibility',after:'Structured proof',old:'Quality service since 1998',kicker:'Licensed · reviewed · experienced',title:'Make trust visible before asking for the call.',cta:'See why customers choose us ↗'},
  mobile:{before:'Compressed desktop',after:'Mobile-first flow',old:'Everything at once',kicker:'Fast answer · clear action',title:'Give a phone visitor the right information in the right order.',cta:'Call / request service ↗'},
  conversion:{before:'Vague next step',after:'Specific action',old:'Learn more about us',kicker:'Clear service + clear outcome',title:'Turn browsing into an obvious next decision.',cta:'Start your project ↗'}
 };
 const els={before:document.querySelector('#diagBeforeLabel'),after:document.querySelector('#diagAfterLabel'),old:document.querySelector('#diagOldTitle'),kicker:document.querySelector('#diagKicker'),title:document.querySelector('#diagNewTitle'),cta:document.querySelector('#diagCta')};
 document.querySelectorAll('[data-diag]').forEach(btn=>btn.addEventListener('click',()=>{const s=states[btn.dataset.diag];if(!s)return;document.querySelectorAll('[data-diag]').forEach(b=>b.classList.toggle('active',b===btn));Object.entries(els).forEach(([k,el])=>{if(el)el.textContent=s[k]})}));
})();