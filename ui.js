'use strict';

const TICK_MS=1000/60,FRAME_CPU_BUDGET_MS=8,MAX_STEPS_PER_FRAME=180;
let tickAccumulator=0,lastRender=0,lastHudUpdate=0,perfWindowStart=performance.now(),perfTicks=0,actualSpeed=0,noticeTimer=null;

const backgroundCanvas=typeof document.createElement==='function'?document.createElement('canvas'):null;
let backgroundReady=false;
if(backgroundCanvas){backgroundCanvas.width=W;backgroundCanvas.height=H;}
function paintStaticBackground(g){
  g.fillStyle='#06090d';g.fillRect(0,0,W,H);g.fillStyle='#080d13';g.fillRect(FIELD.left,FIELD.top,FIELD.size,FIELD.size);
  g.save();g.beginPath();g.rect(FIELD.left,FIELD.top,FIELD.size,FIELD.size);g.clip();g.strokeStyle='#111a26';g.lineWidth=1;
  for(let x=FIELD.left;x<=FIELD.right;x+=40){g.beginPath();g.moveTo(x,FIELD.top);g.lineTo(x,FIELD.bottom);g.stroke();}
  for(let y=FIELD.top;y<=FIELD.bottom;y+=40){g.beginPath();g.moveTo(FIELD.left,y);g.lineTo(FIELD.right,y);g.stroke();}g.restore();
  g.strokeStyle='#26364a';g.lineWidth=2;g.strokeRect(FIELD.left+1,FIELD.top+1,FIELD.size-2,FIELD.size-2);
  g.save();g.translate(FIELD.left/2,H/2);g.rotate(-Math.PI/2);g.fillStyle='rgba(144,160,183,.16)';g.font='800 12px system-ui';g.textAlign='center';g.fillText('BATTLEVO // OBSERVATION FIELD',0,4);g.restore();
  g.save();g.translate(FIELD.right+(W-FIELD.right)/2,H/2);g.rotate(Math.PI/2);g.fillStyle='rgba(144,160,183,.16)';g.font='800 12px system-ui';g.textAlign='center';g.fillText('NEURAL EVOLUTION LIVE',0,4);g.restore();
}
function drawBackground(){
  if(backgroundCanvas){if(!backgroundReady){paintStaticBackground(backgroundCanvas.getContext('2d'));backgroundReady=true;}ctx.drawImage(backgroundCanvas,0,0);}
  else paintStaticBackground(ctx);
}
function drawArenaGuides(){
  if(!sim)return;ctx.save();ctx.lineWidth=6;ctx.globalAlpha=.32;
  if(sim.mode==='battlefield'){ctx.strokeStyle='#f2d579';ctx.beginPath();if(sim.orientation===0){ctx.moveTo(FIELD.left,5);ctx.lineTo(FIELD.right,5);}if(sim.orientation===2){ctx.moveTo(FIELD.left,H-5);ctx.lineTo(FIELD.right,H-5);}if(sim.orientation===1){ctx.moveTo(FIELD.right-5,FIELD.top);ctx.lineTo(FIELD.right-5,FIELD.bottom);}if(sim.orientation===3){ctx.moveTo(FIELD.left+5,FIELD.top);ctx.lineTo(FIELD.left+5,FIELD.bottom);}ctx.stroke();}
  if(sim.mode==='invaders'){ctx.strokeStyle='#d9e7f8';ctx.beginPath();if(sim.orientation===0){ctx.moveTo(FIELD.left,H-5);ctx.lineTo(FIELD.right,H-5);}if(sim.orientation===2){ctx.moveTo(FIELD.left,5);ctx.lineTo(FIELD.right,5);}if(sim.orientation===1){ctx.moveTo(FIELD.left+5,FIELD.top);ctx.lineTo(FIELD.left+5,FIELD.bottom);}if(sim.orientation===3){ctx.moveTo(FIELD.right-5,FIELD.top);ctx.lineTo(FIELD.right-5,FIELD.bottom);}ctx.stroke();}ctx.restore();
}
function drawBunkers(){for(const b of sim.bunkers){ctx.fillStyle='#8d7653';ctx.fillRect(b.x,b.y,b.w,b.h);ctx.strokeStyle='#c5ad85';ctx.lineWidth=1;ctx.strokeRect(b.x+.5,b.y+.5,b.w-1,b.h-1);}}
function visualOffset(species){if(sim?.mode==='royale')return{x:0,y:0};const i=SPECIES.findIndex(s=>s.id===species.id);return i===0?{x:-3,y:-3}:i===1?{x:0,y:3}:{x:3,y:-3};}
function drawAgent(a){
  if(a.finished)return;if(!a.alive&&a.deathTick!==null&&sim.tick-a.deathTick>150)return;
  const s=a.species,base=DIRS[a.facing]||DIRS[0],len=Math.hypot(a.aimX||0,a.aimY||0),d=len>1e-6?{x:a.aimX/len,y:a.aimY/len}:base,vo=visualOffset(s);ctx.save();ctx.translate(a.x+vo.x,a.y+vo.y);let alpha=1;if(!a.alive){const age=Math.max(0,sim.tick-(a.deathTick??sim.tick));alpha=clamp(.48-age/360,.08,.48);}ctx.globalAlpha=alpha;
  ctx.fillStyle=a.flash?s.pale:s.color;ctx.beginPath();ctx.arc(0,0,AGENT_R,0,TAU);ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(d.x*12,d.y*12);ctx.stroke();
  if(sim.mode==='royale'&&a.alive){ctx.strokeStyle='rgba(255,255,255,.72)';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(0,0,AGENT_R+3,-Math.PI/2,-Math.PI/2+TAU*clamp(a.health,0,1));ctx.stroke();}ctx.restore();
}
function drawProjectile(p,color='#ffd65a',arrow=false){
  const len=Math.hypot(p.vx||0,p.vy||0)||1,ux=(p.vx||0)/len,uy=(p.vy||0)/len,trail=arrow?14:10,vo=p.owner?visualOffset(p.owner.species):{x:0,y:0},x=p.x+vo.x,y=p.y+vo.y;
  ctx.save();ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineCap='round';ctx.lineWidth=arrow?2:2.5;ctx.globalAlpha=.72;ctx.beginPath();ctx.moveTo(x-ux*trail,y-uy*trail);ctx.lineTo(x,y);ctx.stroke();ctx.globalAlpha=1;ctx.beginPath();ctx.arc(x,y,arrow?2.2:2.8,0,TAU);ctx.fill();
  if(p.targetTeam){const s=SPECIES.find(q=>q.id===p.targetTeam);if(s){ctx.fillStyle=s.pale;ctx.beginPath();ctx.arc(x,y,1.2,0,TAU);ctx.fill();}}ctx.restore();
}
function drawOrientation(){if(sim.mode==='target'||sim.mode==='royale')return;const arrows=['↑','→','↓','←'];ctx.fillStyle='rgba(255,255,255,.065)';ctx.font='bold 88px system-ui';ctx.textAlign='center';ctx.fillText(arrows[sim.orientation],FIELD.cx,FIELD.cy+30);}
function drawTargets(){for(const t of sim.targets){ctx.strokeStyle=t.hitFlash?'#fff':'#ffd65a';ctx.lineWidth=3;ctx.beginPath();ctx.arc(t.x,t.y,t.r,0,TAU);ctx.stroke();ctx.beginPath();ctx.moveTo(t.x-5,t.y);ctx.lineTo(t.x+5,t.y);ctx.moveTo(t.x,t.y-5);ctx.lineTo(t.x,t.y+5);ctx.stroke();}}
function drawInvaders(){for(const n of sim.invaders){if(!n.alive)continue;ctx.fillStyle='#b783ff';ctx.fillRect(n.x-7,n.y-6,14,12);ctx.fillRect(n.x-10,n.y+5,5,4);ctx.fillRect(n.x+5,n.y+5,5,4);const lamps=[['red','#ff4a4a',-6],['green','#45e06f',0],['blue','#4f8cff',6]];for(const[id,c,ox]of lamps){ctx.globalAlpha=n.aliveFor?.[id]?.valueOf()?.85:.16;ctx.fillStyle=c;ctx.beginPath();ctx.arc(n.x+ox,n.y-10,1.8,0,TAU);ctx.fill();}ctx.globalAlpha=1;}}
function draw(){
  drawBackground();
  if(!sim){ctx.fillStyle='#718098';ctx.font='22px system-ui';ctx.textAlign='center';const hasSave=typeof savedExperimentAvailable!=='undefined'&&savedExperimentAvailable;ctx.fillText(hasSave?'Saved species ready — choose a scenario, then Continue.':'Choose brain sizes and a scenario, then start evolution.',FIELD.cx,FIELD.cy);return;}
  drawArenaGuides();drawOrientation();drawBunkers();if(sim.mode==='target')drawTargets();if(sim.mode==='invaders')drawInvaders();for(const p of sim.arrows)drawProjectile(p,'#f3d19b',true);for(const p of sim.projectiles)drawProjectile(p,p.owner?p.owner.species.pale:(p.team==='invader'?'#c58cff':'#ffd65a'),false);for(const a of sim.agents)drawAgent(a);
}

function showNotice(message,type='info'){const el=document.getElementById('notice');if(!el)return;clearTimeout(noticeTimer);el.textContent=message;el.className='notice '+type;el.hidden=false;noticeTimer=setTimeout(()=>{el.hidden=true;},6500);}
function updateModeBrief(){const mode=sim?.mode||selectedMode,el=document.getElementById('mode-brief');if(el)el.textContent=MODE_CONFIG[mode].brief;}
function updateRoundResult(){const el=document.getElementById('round-result');if(el)el.textContent=sim?.lastSummary||'No completed rounds yet.';const mode=sim?.mode||selectedMode,rounds=sim?.lifetimeRounds?.[mode]||0,roundEl=document.getElementById('mode-rounds');if(roundEl)roundEl.textContent=`${rounds} ${rounds===1?'round':'rounds'}`;}
function updateLifetimeBoard(){
  const mode=sim?.mode||selectedMode,metrics={};
  for(const s of SPECIES){const m=lifetimeMetric(mode,s.id);metrics[s.id]=m;document.getElementById('lifetime-label-'+s.id).textContent=m.label;document.getElementById('lifetime-value-'+s.id).textContent=m.value;}
  const candidates=SPECIES.filter(s=>metrics[s.id].eligible),best=candidates.length?Math.max(...candidates.map(s=>metrics[s.id].score)):null;
  for(const s of SPECIES)document.getElementById('card-'+s.id)?.classList.toggle('leader',best!==null&&metrics[s.id].eligible&&Math.abs(metrics[s.id].score-best)<1e-9);
}
function syncModeButtons(){const current=sim?.mode||selectedMode,pending=sim?.pendingMode||null;document.querySelectorAll('#modes button').forEach(b=>{b.classList.toggle('active',b.dataset.mode===current);b.classList.toggle('pending',b.dataset.mode===pending);});}
function updateHud(){document.getElementById('version-badge').textContent=GAME_VERSION;document.getElementById('hud-mode').textContent=MODE_NAMES[sim?.mode||selectedMode];document.getElementById('hud-gen').textContent=sim?`${sim.generation} · T${sim.trial}/${TRIALS_PER_GENERATION}`:'0';document.getElementById('hud-pop').textContent=`${POP_SIZE} × 3`;updateModeBrief();updateRoundResult();updateLifetimeBoard();syncModeButtons();}
function updateStats(){
  if(!sim)return;document.getElementById('hud-time').textContent=(sim.tick/60).toFixed(1)+'s';
  for(const s of SPECIES){const agents=sim.agents.filter(a=>a.species.id===s.id),active=agents.filter(a=>a.alive).length,neurons=sim.populations[s.id][0].brain.hidden,roundHits=agents.reduce((n,a)=>n+a.hits,0),roundKills=agents.reduce((n,a)=>n+a.kills,0);let line='';
    if(sim.mode==='target')line=`${neurons}N · active ${active}/${POP_SIZE} · this trial ${roundHits} hits`;
    if(sim.mode==='battlefield')line=`${neurons}N · active ${active}/${POP_SIZE} · this trial ${agents.filter(a=>a.finished&&a.deathTick===null).length} crossed`;
    if(sim.mode==='invaders'){const remaining=sim.invaders.filter(n=>n.aliveFor?.[s.id]).length;line=sim.invaderCleared[s.id]?`${neurons}N · WAVE CLEARED · ${roundKills} kills`:sim.invaderBreached?.[s.id]?`${neurons}N · BREACHED · ${roundKills} kills`:`${neurons}N · alive ${active}/${POP_SIZE} · ${roundKills} kills · ${remaining} invaders`;}
    if(sim.mode==='royale')line=`${neurons}N · alive ${active}/${POP_SIZE} · this trial ${roundKills} kills`;
    document.getElementById('stat-'+s.id).textContent=line;
  }updateLifetimeBoard();
}
function setSavedExperimentUI(hasSave,snapshot=savedExperimentSnapshot){
  savedExperimentAvailable=!!hasSave;if(snapshot)savedExperimentSnapshot=snapshot;
  const waiting=savedExperimentAvailable&&!sim,cont=document.getElementById('continue'),start=document.getElementById('start'),reset=document.getElementById('reset');
  if(cont){cont.hidden=!waiting;cont.textContent=waiting&&snapshot?.generation?`CONTINUE GEN ${snapshot.generation}`:'CONTINUE SAVED EVOLUTION';}
  if(start){start.hidden=waiting;start.disabled=!!sim||waiting;}
  if(reset)reset.disabled=!sim&&!savedExperimentAvailable;
  for(const id of ['brain-red','brain-green','brain-blue']){const el=document.getElementById(id);if(el)el.disabled=!!sim||waiting;}
  for(const b of document.querySelectorAll('[data-save]'))b.disabled=!sim;
  if(waiting&&typeof draw==='function')draw();
}
function setRunningUI(on){document.body.classList.toggle('running',on);for(const b of document.querySelectorAll('[data-pause]'))b.disabled=!on;for(const b of document.querySelectorAll('[data-save]'))b.disabled=!on;setSavedExperimentUI(savedExperimentAvailable,savedExperimentSnapshot);updatePauseUI();}
function updatePauseUI(){for(const b of document.querySelectorAll('[data-pause]'))b.textContent=paused?'Resume':'Pause';const overlay=document.getElementById('pause-overlay');if(overlay)overlay.hidden=!sim||!paused;}
function syncSpeedButtons(){document.querySelectorAll('[data-speed]').forEach(b=>b.classList.toggle('active',Number(b.dataset.speed)===speed));}
function resetFrameTiming(){last=performance.now();tickAccumulator=0;perfWindowStart=last;perfTicks=0;actualSpeed=0;}
function updateSpeedStatus(){const el=document.getElementById('speed-status');if(!el)return;if(paused){el.textContent=`${speed}× target · paused`;return;}if(speed<=1){el.textContent=`${actualSpeed?actualSpeed.toFixed(1):'1.0'}× actual`;return;}const limited=actualSpeed>0&&actualSpeed<speed*.8;el.textContent=`${speed}× target · ${actualSpeed?actualSpeed.toFixed(1):'—'}× actual${limited?' · CPU limited':''}`;}
function normaliseBrainInputs(){const defaults={red:4,green:10,blue:20};let corrected=false;for(const s of SPECIES){const el=document.getElementById('brain-'+s.id),raw=Number(el.value);let n=Number.isFinite(raw)?Math.round(raw):defaults[s.id];n=clamp(n,MIN_HIDDEN,MAX_HIDDEN);if(String(n)!==String(el.value).trim())corrected=true;el.value=String(n);}return corrected;}
function setSaveButtonText(text){for(const b of document.querySelectorAll('[data-save]'))b.textContent=text;}

function loop(now){
  const dt=Math.min(100,Math.max(0,now-last));last=now;
  if(sim&&!paused){
    tickAccumulator=Math.min(tickAccumulator+dt*speed,TICK_MS*MAX_STEPS_PER_FRAME);
    const cpuStart=performance.now();let steps=0;
    while(tickAccumulator>=TICK_MS&&steps<MAX_STEPS_PER_FRAME){step();tickAccumulator-=TICK_MS;steps++;perfTicks++;if(performance.now()-cpuStart>=FRAME_CPU_BUDGET_MS)break;}
  }else tickAccumulator=0;
  if(now-perfWindowStart>=1000){const elapsed=(now-perfWindowStart)/1000;actualSpeed=elapsed>0?perfTicks/60/elapsed:0;perfTicks=0;perfWindowStart=now;updateSpeedStatus();}
  if(now-lastHudUpdate>=150){if(sim)updateStats();lastHudUpdate=now;}
  if(speed<=4||now-lastRender>=50||paused){draw();lastRender=now;}
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

document.querySelectorAll('#modes button').forEach(b=>b.addEventListener('click',()=>{
  const mode=b.dataset.mode;
  if(!sim){selectedMode=mode;syncModeButtons();updateHud();draw();return;}
  if(mode===sim.mode){if(sim.pendingMode){sim.pendingMode=null;showNotice('Queued scenario change cancelled.','info');syncModeButtons();}return;}
  sim.pendingMode=mode;showNotice(`${MODE_NAMES[mode]} queued for the next generation. All ${TRIALS_PER_GENERATION} evaluation trials of generation ${sim.generation} will finish first.`,'info');syncModeButtons();
}));
document.querySelectorAll('[data-speed]').forEach(b=>b.addEventListener('click',()=>{speed=Number(b.dataset.speed);tickAccumulator=0;syncSpeedButtons();updateSpeedStatus();}));
document.querySelectorAll('[data-pause]').forEach(b=>b.addEventListener('click',()=>{if(!sim)return;paused=!paused;tickAccumulator=0;updatePauseUI();updateSpeedStatus();if(paused&&typeof saveExperiment==='function')saveExperiment();}));
document.querySelectorAll('[data-save]').forEach(b=>b.addEventListener('click',async()=>{
  if(!sim)return;
  paused=true;tickAccumulator=0;updatePauseUI();updateSpeedStatus();setSaveButtonText('Saving…');
  const ok=typeof saveExperiment==='function'&&await saveExperiment();
  if(ok){setSaveButtonText('Saved ✓');showNotice(`Saved generation ${sim.generation}. On reload, choose any scenario and continue from Trial 1/${TRIALS_PER_GENERATION}.`,'info');setTimeout(()=>setSaveButtonText('Save'),1400);}
  else setSaveButtonText('Save');
}));
document.getElementById('brain-help').addEventListener('click',()=>{const el=document.getElementById('brain-help-text');el.hidden=!el.hidden;});
document.getElementById('continue').addEventListener('click',async()=>{if(await continueSavedExperiment(selectedMode)){setRunningUI(true);updateHud();updateStats();draw();}});
document.getElementById('start').addEventListener('click',async()=>{
  if(savedExperimentAvailable){showNotice('Reset the saved evolution before starting again from Gen 0.','warning');return;}
  const corrected=normaliseBrainInputs();if(corrected)showNotice('Brain sizes were corrected to whole numbers in the allowed 1–64 range.','warning');
  paused=false;resetFrameTiming();initSimulation();updatePauseUI();updateHud();
});
document.getElementById('reset').addEventListener('click',async()=>{
  if(typeof window!=='undefined'&&typeof window.confirm==='function'&&!window.confirm('Reset all evolved Red, Green and Blue brains, saved progress and lifetime records? This returns BattlEvo to Gen 0 and cannot be undone.'))return;
  await clearSavedExperiment();sim=null;paused=false;resetFrameTiming();setRunningUI(false);document.getElementById('hud-gen').textContent='0';document.getElementById('hud-time').textContent='0.0s';document.getElementById('round-result').textContent='No completed rounds yet.';document.getElementById('mode-rounds').textContent='0 rounds';for(const s of SPECIES)document.getElementById('stat-'+s.id).textContent='Waiting to evolve.';updateLifetimeBoard();updateHud();draw();
});

syncSpeedButtons();updateHud();draw();