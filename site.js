(()=>{
const nav=document.querySelector('.site-nav');const menu=document.querySelector('.menu-toggle');const panel=document.querySelector('.mobile-panel');
const progress=document.querySelector('.scroll-progress span');
function onScroll(){if(nav)nav.classList.toggle('scrolled',scrollY>18);if(progress){const d=document.documentElement.scrollHeight-innerHeight;progress.style.transform=`scaleX(${d>0?scrollY/d:0})`;}}
addEventListener('scroll',onScroll,{passive:true});onScroll();
if(menu&&panel){menu.addEventListener('click',()=>{const open=!panel.classList.contains('open');panel.classList.toggle('open',open);menu.classList.toggle('open',open);document.body.classList.toggle('menu-open',open);menu.setAttribute('aria-expanded',String(open));});panel.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{panel.classList.remove('open');menu.classList.remove('open');document.body.classList.remove('menu-open');}));}
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.08});document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
document.querySelectorAll('.faq-q').forEach(b=>b.addEventListener('click',()=>b.closest('.faq-item').classList.toggle('open')));
const form=document.querySelector('#contactForm');
if(form){form.addEventListener('submit',async e=>{
  e.preventDefault();const btn=form.querySelector('button[type="submit"]');const status=form.querySelector('.form-status');const original=btn.textContent;btn.disabled=true;btn.textContent='Sending…';status.className='form-status';
  try{const data=new FormData(form);const res=await fetch(form.action,{method:'POST',body:data,headers:{Accept:'application/json'}});if(!res.ok)throw new Error('submit');form.reset();status.textContent='Thank you — your message was sent. I’ll get back to you as soon as possible.';status.classList.add('show');btn.textContent='Sent';}
  catch(err){status.innerHTML='I could not send the form automatically. Please email <a href="mailto:BonebrakeWebsiteDesign@gmail.com"><strong>BonebrakeWebsiteDesign@gmail.com</strong></a> or call <a href="tel:+13312033717"><strong>331-203-3717</strong></a>.';status.classList.add('show');btn.disabled=false;btn.textContent=original;}
});}
})();