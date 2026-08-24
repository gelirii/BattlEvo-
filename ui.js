function drawBackground(){
  ctx.fillStyle='#080c11';ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='#111a26';ctx.lineWidth=1;
  for(let x=0;x<W;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
  for(let y=0;y<H;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
}
function drawBunkers(){ for(const b of sim.bunkers){ctx.fillStyle='#8d7653';ctx.fillRect(b.x,b.y,b.w,b.h);ctx.strokeStyle='#c5ad85';ctx.strokeRect(b.x+.5,b.y+.5,b.w-1,b.h-1);} }
function drawAgent(a){
  const s=a.species, d=DIRS[a.facing]; ctx.save();ctx.translate(a.x,a.y);
  ctx.globalAlpha=a.alive?1:.18; ctx.fillStyle=a.flash?s.pale:s.color; ctx.strokeStyle='#fff';ctx.lineWidth=1;
  ctx.beginPath();ctx.arc(0,0,AGENT_R,0,TAU);ctx.fill();
  ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(d.x*12,d.y*12);ctx.stroke();
  ctx.restore();
}
function drawProjectile(p,color='#ffd65a'){ ctx.fillStyle=color;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,TAU);ctx.fill(); }
function drawOrientation(){
  if(sim.mode==='target'||sim.mode==='royale')return;
  const arrows=['↑','→','↓','←']; ctx.fillStyle='rgba(255,255,255,.08)';ctx.font='bold 88px system-ui';ctx.textAlign='center';ctx.fillText(arrows[sim.orientation],W/2,H/2+30);
}
function drawTargets(){ for(const t of sim.targets){ctx.strokeStyle=t.hitFlash?'#fff':'#ffd65a';ctx.lineWidth=3;ctx.beginPath();ctx.arc(t.x,t.y,t.r,0,TAU);ctx.stroke();ctx.beginPath();ctx.moveTo(t.x-5,t.y);ctx.lineTo(t.x+5,t.y);ctx.moveTo(t.x,t.y-5);ctx.lineTo(t.x,t.y+5);ctx.stroke();} }
function drawInvaders(){ for(const n of sim.invaders){if(!n.alive)continue;ctx.fillStyle='#b783ff';ctx.beginPath();ctx.rect(n.x-7,n.y-6,14,12);ctx.fill();ctx.fillRect(n.x-10,n.y+5,5,4);ctx.fillRect(n.x+5,n.y+5,5,4);} }
function draw(){
  drawBackground();
  if(!sim){ ctx.fillStyle='#718098';ctx.font='22px system-ui';ctx.textAlign='center';ctx.fillText('Choose brain sizes and a training ground, then start evolution.',W/2,H/2); return; }
  drawOrientation();drawBunkers(); if(sim.mode==='target')drawTargets(); if(sim.mode==='invaders')drawInvaders();
  for(const p of sim.arrows)drawProjectile(p,'#f3d19b'); for(const p of sim.projectiles)drawProjectile(p,p.team==='invader'?'#c58cff':'#ffd65a');
  for(const a of sim.agents)drawAgent(a);
}

function orientationLabel(){ if(!sim)return'—'; if(sim.mode==='target')return'Free arena'; if(sim.mode==='royale')return'Team arena'; const n=['UP ↑','RIGHT →','DOWN ↓','LEFT ←']; return n[sim.orientation]; }
function updateHud(){
  document.getElementById('hud-mode').textContent=MODE_NAMES[sim?.mode||selectedMode]; document.getElementById('hud-gen').textContent=sim?sim.generation:'0'; document.getElementById('hud-orient').textContent=orientationLabel();
}
function updateStats(){
  if(!sim)return;
  document.getElementById('hud-time').textContent=(sim.tick/60).toFixed(1)+'s';
  for(const s of SPECIES){
    const agents=sim.agents.filter(a=>a.species.id===s.id); const alive=agents.filter(a=>a.alive).length; const bestNow=Math.max(...agents.map(a=>a.fitness));
    let extra=''; if(sim.mode==='target')extra=` · hits ${agents.reduce((n,a)=>n+a.hits,0)}`; if(sim.mode==='royale')extra=` · kills ${agents.reduce((n,a)=>n+a.kills,0)}`;
    document.getElementById('stat-'+s.id).textContent=`Alive ${alive}/${POP_SIZE} · best ${bestNow.toFixed(1)} · all-time ${sim.bestEver[s.id].toFixed(1)}${extra}`;
  }
}
function setRunningUI(on){
  document.getElementById('start').disabled=on;document.getElementById('pause').disabled=!on;document.getElementById('reset').disabled=!on;
  for(const id of ['brain-red','brain-green','brain-blue'])document.getElementById(id).disabled=on;
  document.querySelectorAll('#modes button').forEach(b=>b.disabled=on);
}

function loop(now){
  const dt=now-last; last=now;
  if(sim&&!paused){ const steps=Math.max(1,Math.floor(speed*(dt/16.67))); for(let i=0;i<steps;i++)step(); }
  draw(); if(sim)updateStats(); requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

document.querySelectorAll('#modes button').forEach(b=>b.addEventListener('click',()=>{ selectedMode=b.dataset.mode; document.querySelectorAll('#modes button').forEach(x=>x.classList.toggle('active',x===b)); updateHud(); }));
document.querySelectorAll('.speedRow button').forEach(b=>b.addEventListener('click',()=>{ speed=Number(b.dataset.speed); document.querySelectorAll('.speedRow button').forEach(x=>x.classList.toggle('active',x===b)); }));
document.getElementById('start').addEventListener('click',()=>{paused=false;document.getElementById('pause').textContent='Pause';initSimulation();});
document.getElementById('pause').addEventListener('click',()=>{paused=!paused;document.getElementById('pause').textContent=paused?'Resume':'Pause';});
document.getElementById('reset').addEventListener('click',()=>{sim=null;paused=false;setRunningUI(false);document.getElementById('pause').textContent='Pause';document.getElementById('hud-gen').textContent='0';document.getElementById('hud-time').textContent='0.0s';document.getElementById('hud-orient').textContent='—';for(const s of SPECIES)document.getElementById('stat-'+s.id).textContent='Waiting to evolve.';});
updateHud();
