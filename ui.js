const MODE_BRIEFS={
  target:'Track semi-regular moving targets and learn to lead shots. Targets never fire back.',
  battlefield:'Cross the battlefield while arrows travel at 90° to the route. Survive, use cover and learn when not to move.',
  invaders:'Defend the marked edge. Move on one axis, face freely, clear your colour’s copy of the wave and dodge return fire.',
  royale:'Red, Green and Blue fight as teams. Friends are recognised as friendly; damage, survival and team victory drive evolution.'
};
const TICK_MS=1000/60;
const MAX_STEPS_PER_FRAME=90;
let tickAccumulator=0;

function drawBackground(){
  ctx.fillStyle='#06090d';ctx.fillRect(0,0,W,H);
  // The side gutters make the square combat field deliberate rather than looking like
  // unused canvas. All game physics and all four rotated scenarios live inside FIELD.
  ctx.fillStyle='#080d13';ctx.fillRect(FIELD.left,FIELD.top,FIELD.size,FIELD.size);
  ctx.save();ctx.beginPath();ctx.rect(FIELD.left,FIELD.top,FIELD.size,FIELD.size);ctx.clip();
  ctx.strokeStyle='#111a26';ctx.lineWidth=1;
  for(let x=FIELD.left;x<=FIELD.right;x+=40){ctx.beginPath();ctx.moveTo(x,FIELD.top);ctx.lineTo(x,FIELD.bottom);ctx.stroke();}
  for(let y=FIELD.top;y<=FIELD.bottom;y+=40){ctx.beginPath();ctx.moveTo(FIELD.left,y);ctx.lineTo(FIELD.right,y);ctx.stroke();}
  ctx.restore();
  ctx.strokeStyle='#26364a';ctx.lineWidth=2;ctx.strokeRect(FIELD.left+1,FIELD.top+1,FIELD.size-2,FIELD.size-2);
  ctx.save();ctx.translate(FIELD.left/2,H/2);ctx.rotate(-Math.PI/2);ctx.fillStyle='rgba(144,160,183,.16)';ctx.font='800 12px system-ui';ctx.textAlign='center';ctx.fillText('BATTLEVO // OBSERVATION FIELD',0,4);ctx.restore();
  ctx.save();ctx.translate(FIELD.right+(W-FIELD.right)/2,H/2);ctx.rotate(Math.PI/2);ctx.fillStyle='rgba(144,160,183,.16)';ctx.font='800 12px system-ui';ctx.textAlign='center';ctx.fillText('NEURAL EVOLUTION LIVE',0,4);ctx.restore();
}
function drawArenaGuides(){
  if(!sim)return;
  ctx.save();ctx.lineWidth=6;ctx.globalAlpha=.32;
  if(sim.mode==='battlefield'){
    ctx.strokeStyle='#f2d579';ctx.beginPath();
    if(sim.orientation===0){ctx.moveTo(FIELD.left,5);ctx.lineTo(FIELD.right,5);}
    if(sim.orientation===2){ctx.moveTo(FIELD.left,H-5);ctx.lineTo(FIELD.right,H-5);}
    if(sim.orientation===1){ctx.moveTo(FIELD.right-5,FIELD.top);ctx.lineTo(FIELD.right-5,FIELD.bottom);}
    if(sim.orientation===3){ctx.moveTo(FIELD.left+5,FIELD.top);ctx.lineTo(FIELD.left+5,FIELD.bottom);}ctx.stroke();
  }
  if(sim.mode==='invaders'){
    ctx.strokeStyle='#d9e7f8';ctx.beginPath();
    if(sim.orientation===0){ctx.moveTo(FIELD.left,H-5);ctx.lineTo(FIELD.right,H-5);}
    if(sim.orientation===2){ctx.moveTo(FIELD.left,5);ctx.lineTo(FIELD.right,5);}
    if(sim.orientation===1){ctx.moveTo(FIELD.left+5,FIELD.top);ctx.lineTo(FIELD.left+5,FIELD.bottom);}
    if(sim.orientation===3){ctx.moveTo(FIELD.right-5,FIELD.top);ctx.lineTo(FIELD.right-5,FIELD.bottom);}ctx.stroke();
  }
  ctx.restore();
}
function drawBunkers(){
  for(const b of sim.bunkers){
    ctx.fillStyle='#8d7653';ctx.fillRect(b.x,b.y,b.w,b.h);
    ctx.strokeStyle='#c5ad85';ctx.lineWidth=1;ctx.strokeRect(b.x+.5,b.y+.5,b.w-1,b.h-1);
  }
}
function drawAgent(a){
  if(a.finished)return;
  if(!a.alive&&a.deathTick!==null&&sim.tick-a.deathTick>150)return;
  const s=a.species,d=DIRS[a.facing];ctx.save();ctx.translate(a.x,a.y);
  let alpha=1;if(!a.alive){const age=Math.max(0,sim.tick-(a.deathTick??sim.tick));alpha=clamp(.48-age/360,.08,.48);}ctx.globalAlpha=alpha;
  ctx.fillStyle=a.flash?s.pale:s.color;ctx.beginPath();ctx.arc(0,0,AGENT_R,0,TAU);ctx.fill();
  ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(d.x*12,d.y*12);ctx.stroke();
  if(sim.mode==='royale'&&a.alive){
    ctx.strokeStyle='rgba(255,255,255,.72)';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(0,0,AGENT_R+3,-Math.PI/2,-Math.PI/2+TAU*clamp(a.health,0,1));ctx.stroke();
  }
  ctx.restore();
}
function drawProjectile(p,color='#ffd65a',arrow=false){
  const len=Math.hypot(p.vx||0,p.vy||0)||1,ux=(p.vx||0)/len,uy=(p.vy||0)/len;
  const trail=arrow?14:10;
  ctx.save();ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineCap='round';ctx.lineWidth=arrow?2:2.5;
  ctx.globalAlpha=.72;ctx.beginPath();ctx.moveTo(p.x-ux*trail,p.y-uy*trail);ctx.lineTo(p.x,p.y);ctx.stroke();
  ctx.globalAlpha=1;ctx.beginPath();ctx.arc(p.x,p.y,arrow?2.2:2.8,0,TAU);ctx.fill();ctx.restore();
}
function drawOrientation(){
  if(sim.mode==='target'||sim.mode==='royale')return;
  const arrows=['↑','→','↓','←'];ctx.fillStyle='rgba(255,255,255,.065)';ctx.font='bold 88px system-ui';ctx.textAlign='center';ctx.fillText(arrows[sim.orientation],FIELD.cx,FIELD.cy+30);
}
function drawTargets(){
  for(const t of sim.targets){
    ctx.strokeStyle=t.hitFlash?'#fff':'#ffd65a';ctx.lineWidth=3;ctx.beginPath();ctx.arc(t.x,t.y,t.r,0,TAU);ctx.stroke();
    ctx.beginPath();ctx.moveTo(t.x-5,t.y);ctx.lineTo(t.x+5,t.y);ctx.moveTo(t.x,t.y-5);ctx.lineTo(t.x,t.y+5);ctx.stroke();
  }
}
function drawInvaders(){
  for(const n of sim.invaders){
    if(!n.alive)continue;
    ctx.fillStyle='#b783ff';ctx.fillRect(n.x-7,n.y-6,14,12);ctx.fillRect(n.x-10,n.y+5,5,4);ctx.fillRect(n.x+5,n.y+5,5,4);
    // Three tiny status lamps show which colour still needs to clear this logical alien.
    const lamps=[['red','#ff4a4a',-6],['green','#45e06f',0],['blue','#4f8cff',6]];
    for(const [id,c,ox] of lamps){ctx.globalAlpha=n.aliveFor?.[id]?.85:.16;ctx.fillStyle=c;ctx.beginPath();ctx.arc(n.x+ox,n.y-10,1.8,0,TAU);ctx.fill();}
    ctx.globalAlpha=1;
  }
}
function draw(){
  drawBackground();
  if(!sim){ctx.fillStyle='#718098';ctx.font='22px system-ui';ctx.textAlign='center';ctx.fillText('Choose brain sizes and a scenario, then start evolution.',FIELD.cx,FIELD.cy);return;}
  drawArenaGuides();drawOrientation();drawBunkers();if(sim.mode==='target')drawTargets();if(sim.mode==='invaders')drawInvaders();
  for(const p of sim.arrows)drawProjectile(p,'#f3d19b',true);
  for(const p of sim.projectiles){
    const color=p.owner?p.owner.species.pale:(p.team==='invader'?'#c58cff':'#ffd65a');
    drawProjectile(p,color,false);
  }
  for(const a of sim.agents)drawAgent(a);
}

function orientationLabel(){
  if(!sim)return'—';
  if(sim.mode==='target')return'Free arena';
  if(sim.mode==='royale')return'Team arena';
  if(sim.mode==='battlefield')return['CROSS UP ↑','CROSS RIGHT →','CROSS DOWN ↓','CROSS LEFT ←'][sim.orientation];
  return['DEFEND BOTTOM ↓','DEFEND LEFT ←','DEFEND TOP ↑','DEFEND RIGHT →'][sim.orientation];
}
function updateModeBrief(){const el=document.getElementById('mode-brief');if(el)el.textContent=MODE_BRIEFS[sim?.mode||selectedMode];}
function updateRoundResult(){const el=document.getElementById('round-result');if(el)el.textContent=sim?.lastSummary||'No completed rounds yet.';}
function updateHud(){
  document.getElementById('hud-mode').textContent=MODE_NAMES[sim?.mode||selectedMode];
  document.getElementById('hud-gen').textContent=sim?sim.generation:'0';
  document.getElementById('hud-orient').textContent=orientationLabel();
  updateModeBrief();updateRoundResult();
}
function updateStats(){
  if(!sim)return;
  document.getElementById('hud-time').textContent=(sim.tick/60).toFixed(1)+'s';
  const scores={};
  for(const s of SPECIES){
    const agents=sim.agents.filter(a=>a.species.id===s.id);scores[s.id]=Math.max(...agents.map(a=>a.fitness));
    const active=agents.filter(a=>a.alive).length,modeBest=Number.isFinite(sim.bestEver[s.id])?sim.bestEver[s.id].toFixed(1):'—';
    const neurons=sim.populations[s.id][0].brain.hidden;
    let line='';
    if(sim.mode==='target')line=`${neurons}N · active ${active}/${POP_SIZE} · hits ${agents.reduce((n,a)=>n+a.hits,0)}`;
    if(sim.mode==='battlefield')line=`${neurons}N · active ${active}/${POP_SIZE} · crossed ${agents.filter(a=>a.finished).length}`;
    if(sim.mode==='invaders'){
      const remaining=sim.invaders.filter(n=>n.aliveFor?.[s.id]).length;
      line=sim.invaderCleared[s.id]?`${neurons}N · WAVE CLEARED · kills ${agents.reduce((n,a)=>n+a.kills,0)}`:`${neurons}N · alive ${active}/${POP_SIZE} · invaders ${remaining}`;
    }
    if(sim.mode==='royale')line=`${neurons}N · alive ${active}/${POP_SIZE} · kills ${agents.reduce((n,a)=>n+a.kills,0)}`;
    document.getElementById('stat-'+s.id).textContent=`${line} · best ${scores[s.id].toFixed(1)} · mode best ${modeBest}`;
  }
  const leader=Math.max(...Object.values(scores));
  for(const s of SPECIES)document.getElementById('card-'+s.id)?.classList.toggle('leader',Math.abs(scores[s.id]-leader)<1e-9);
}
function setRunningUI(on){
  document.body.classList.toggle('running',on);
  document.getElementById('start').disabled=on;document.getElementById('pause').disabled=!on;document.getElementById('reset').disabled=!on;
  for(const id of ['brain-red','brain-green','brain-blue'])document.getElementById(id).disabled=on;
  // Scenario buttons deliberately stay live. Changing scenario keeps evolved populations
  // and only discards the unfinished arena episode.
  document.querySelectorAll('#modes button').forEach(b=>b.disabled=false);
}

function loop(now){
  const dt=Math.min(100,Math.max(0,now-last));last=now;
  if(sim&&!paused){
    // Fixed-timestep pacing keeps 1× at 60 simulation ticks/sec on 60/90/120 Hz displays.
    // If old hardware cannot sustain 12×/30×, it gracefully runs slower instead of
    // accumulating an ever-growing catch-up backlog.
    tickAccumulator=Math.min(tickAccumulator+dt*speed,TICK_MS*MAX_STEPS_PER_FRAME);
    const steps=Math.min(MAX_STEPS_PER_FRAME,Math.floor(tickAccumulator/TICK_MS));
    tickAccumulator-=steps*TICK_MS;
    for(let i=0;i<steps;i++)step();
  }else tickAccumulator=0;
  draw();if(sim)updateStats();requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

document.querySelectorAll('#modes button').forEach(b=>b.addEventListener('click',()=>{
  selectedMode=b.dataset.mode;
  document.querySelectorAll('#modes button').forEach(x=>x.classList.toggle('active',x===b));
  if(sim){
    sim.mode=selectedMode;
    sim.bestEver={red:-Infinity,green:-Infinity,blue:-Infinity};
    sim.lastSummary=`Switched to ${MODE_NAMES[selectedMode]} — evolved brains retained at generation ${sim.generation}.`;
    setupGeneration();
  }
  updateHud();
}));
document.querySelectorAll('.speedRow button').forEach(b=>b.addEventListener('click',()=>{speed=Number(b.dataset.speed);tickAccumulator=0;document.querySelectorAll('.speedRow button').forEach(x=>x.classList.toggle('active',x===b));}));
document.getElementById('start').addEventListener('click',()=>{paused=false;tickAccumulator=0;document.getElementById('pause').textContent='Pause';initSimulation();});
document.getElementById('pause').addEventListener('click',()=>{paused=!paused;tickAccumulator=0;document.getElementById('pause').textContent=paused?'Resume':'Pause';});
document.getElementById('reset').addEventListener('click',()=>{
  if(typeof window!=='undefined'&&typeof window.confirm==='function'&&!window.confirm('Reset all evolved Red, Green and Blue brains? This cannot be undone.'))return;
  sim=null;paused=false;tickAccumulator=0;setRunningUI(false);document.getElementById('pause').textContent='Pause';document.getElementById('hud-gen').textContent='0';document.getElementById('hud-time').textContent='0.0s';document.getElementById('hud-orient').textContent='—';document.getElementById('round-result').textContent='No completed rounds yet.';
  for(const s of SPECIES){document.getElementById('stat-'+s.id).textContent='Waiting to evolve.';document.getElementById('card-'+s.id)?.classList.remove('leader');}
});
updateHud();
