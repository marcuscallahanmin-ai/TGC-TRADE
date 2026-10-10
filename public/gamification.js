(function(){
'use strict';
var muted=false,ctx=null,observer=null;
try{muted=localStorage.getItem('tgc-sound-muted')==='1'}catch(e){}
function sound(kind){
 if(muted)return;
 try{
  var AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
  if(!ctx)ctx=new AC();if(ctx.state==='suspended')ctx.resume();
  var notes=kind==='coin'?[740,988,1318]:kind==='zing'?[440,880,1175]:[880,1175];
  notes.forEach(function(hz,i){
   var start=ctx.currentTime+i*(kind==='coin'?.075:.085),osc=ctx.createOscillator(),gain=ctx.createGain();
   osc.type=kind==='zing'?'triangle':'sine';osc.frequency.setValueAtTime(hz,start);
   gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(kind==='coin'?.085:.05,start+.012);gain.gain.exponentialRampToValueAtTime(.0001,start+.13);
   osc.connect(gain);gain.connect(ctx.destination);osc.start(start);osc.stop(start+.14);
  });
 }catch(e){}
}
window.playTgcSound=sound;
window.toggleTgcSound=function(){
 muted=!muted;try{localStorage.setItem('tgc-sound-muted',muted?'1':'0')}catch(e){}
 var b=document.getElementById('tgcSoundToggle');if(b)b.textContent=muted?'🔇 Sound Off':'🔊 Sound On';
 if(!muted)sound('bink');
};
function xpData(){return (window.profile&&profile.progress)||((window.currentUser&&currentUser.progress)||null)}
function escText(v){return typeof window.esc==='function'?esc(v):String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function panel(p){
 if(!p)return '';
 var percent=Math.max(0,Math.min(100,Number(p.progressPercent)||0));
 return '<section class="tgc-xp-panel"><div class="tgc-xp-top"><div><div class="tgc-eyebrow">YOUR COLLECTOR LEVEL</div><h3>⚡ Level '+(Number(p.level)||1)+' · '+escText(p.title||'New Collector')+'</h3></div><div class="tgc-xp-number"><b>'+(Number(p.xp)||0)+'</b><span>XP</span></div></div><div class="tgc-xp-track"><span style="width:'+percent+'%"></span></div><div class="tgc-xp-foot"><span>'+(p.nextLevelXp===null?'MAX LEVEL':(Number(p.xp)||0)+' / '+p.nextLevelXp+' XP')+'</span><span>'+(p.nextLevelXp===null?'Legendary!':(Number(p.xpToNext)||0)+' XP to next level')+'</span></div><a class="btn small" href="#/rewards">🏆 View Rewards</a></section>';
}
var badges=[
 {id:'profile',name:'Profile Polished',icon:'✨',description:'Save your collector profile'},
 {id:'first-card',name:'First Card Listed',icon:'🃏',description:'Post your first real card listing'},
 {id:'five-cards',name:'Binder Builder',icon:'📚',description:'Publish 5 card listings'},
 {id:'wishlist',name:'On the Hunt',icon:'🔎',description:'Add your first card to My Wants'},
 {id:'xp-250',name:'Collector Momentum',icon:'⚡',description:'Earn 250 XP'}
];
function renderRewards(main){
 var p=xpData()||{xp:0,level:1,title:'New Collector',progressPercent:0,badges:[],listingCount:0,wantCount:0};
 var earned=new Set((p.badges||[]).map(function(b){return b.id}));
 main.innerHTML='<section class="section-head"><div><div class="tag">COLLECTOR PROGRESSION</div><h2>🏆 Your Rewards</h2><div class="muted">Earn experience through real participation. Your progress is saved to your account.</div></div></section>'+panel(p)+'<section class="section-head"><div><h2>Achievement cabinet</h2><div class="muted">'+earned.size+' of '+badges.length+' badges unlocked</div></div></section><div class="tgc-achievement-grid">'+badges.map(function(b){return '<article class="tgc-achievement '+(earned.has(b.id)?'earned':'locked')+'"><div class="tgc-achievement-icon">'+b.icon+'</div><div><h3>'+b.name+'</h3><p>'+b.description+'</p><span class="tgc-achievement-status">'+(earned.has(b.id)?'✓ UNLOCKED':'🔒 NOT YET UNLOCKED')+'</span></div></article>'}).join('')+'</div><section class="tgc-meme-strip"><div><div class="tgc-eyebrow">COLLECTOR CHECK</div><h2>'+(Number(p.listingCount)>0?'The binder is growing.':'Your binder is waiting.')+'</h2><p>'+(Number(p.listingCount)>0?'Every real card you list helps collectors find their next favorite.':'Your first listing is your origin story. Make it a good one. 🃏')+'</p></div><a class="btn primary" href="#/create">List a Card →</a></section><p class="muted tgc-small-note">XP is a fun participation score, not money. Trade-completion rewards will be added when real trade confirmation is available.</p>';
 main.dataset.tgcRewards='true';
}
function rewardToast(message){
 sound('coin');
 if(typeof window.toast==='function')toast(message);
 var app=document.getElementById('app');if(app){app.classList.remove('tgc-reward-pop');void app.offsetWidth;app.classList.add('tgc-reward-pop');setTimeout(function(){app.classList.remove('tgc-reward-pop')},850)}
}
window.tgcRewardToast=rewardToast;
function enhance(){
 var main=document.querySelector('#app main');if(!main)return;
 var isRewards=(location.hash||'').replace(/\/$/,'')==='#/rewards';
 if(isRewards){if(main.dataset.tgcRewards!=='true')renderRewards(main);return}
 if(main.dataset.tgcRewards==='true')delete main.dataset.tgcRewards;
 var nav=document.querySelector('.nav');
 if(nav&&!nav.querySelector('a[href="#/rewards"]')){var a=document.createElement('a');a.href='#/rewards';a.textContent='🏆 Rewards';if(location.hash==='#/rewards')a.className='active';nav.appendChild(a)}
 var actions=document.querySelector('.header-actions');
 if(actions&&!document.getElementById('tgcSoundToggle')){var b=document.createElement('button');b.type='button';b.id='tgcSoundToggle';b.className='btn small tgc-sound-toggle';b.textContent=muted?'🔇 Sound Off':'🔊 Sound On';b.addEventListener('click',window.toggleTgcSound);actions.insertBefore(b,actions.firstChild)}
 var page=(location.hash||'#/').replace(/^#\/?/,'').split('/')[0];
 var p=xpData();
 if(p&&(page===''||page==='profile'||page==='market'||page==='members'||page==='community')&&!main.querySelector('.tgc-xp-panel')){
  var target=page===''?main.querySelector('.hero'):main.querySelector('.section-head');
  if(target)target.insertAdjacentHTML('afterend',panel(p));
 }
 if(page===''&&!main.querySelector('.tgc-meme-strip')){
  var grid=main.querySelector('.grid');
  if(grid)grid.insertAdjacentHTML('afterend','<section class="tgc-meme-strip"><div><div class="tgc-eyebrow">COLLECTOR MOOD</div><h2>“I came to browse.”</h2><p>Also me, 47 cards later: <b>THE BINDER HAS CHOSEN ME.</b> 😂</p></div><a class="btn" href="#/rewards">Check your XP →</a></section>');
 }
}
function wrapAction(name,kind){
 var original=window[name];if(typeof original!=='function'||original.__tgcWrapped)return;
 var wrapped=async function(){
  var before=Number(xpData()&&xpData().xp)||0;
  var result=await original.apply(this,arguments);
  var after=Number(xpData()&&xpData().xp)||0;
  if(after>before)rewardToast('+'+(after-before)+' XP · Nice move!');
  else if(kind)sound(kind);
  return result;
 };
 wrapped.__tgcWrapped=true;window[name]=wrapped;
}
function boot(){
 wrapAction('submitListing','bink');wrapAction('addWant','bink');wrapAction('saveProfilePage','bink');wrapAction('viewListing','zing');wrapAction('runMatch','coin');
 enhance();
 if(!observer){var app=document.getElementById('app');if(app){observer=new MutationObserver(function(){enhance()});observer.observe(app,{childList:true,subtree:true})}}
 window.addEventListener('hashchange',function(){setTimeout(enhance,0)});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();