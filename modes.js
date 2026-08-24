function stepTargets(){
  for(const t of sim.targets){
    // Semi-regular movement: straight/bouncing with a gentle periodic turn.
    if((sim.tick+t.id*17)%240===0){const nd=vecToDir(t.dx,t.dy);const turn=((t.id%2)?1:-1);const d=DIRS[(nd+turn+8)%8];t.dx=d.x;t.dy=d.y;}
    const len=Math.hypot(t.dx,t.dy)||1;t.x+=(t.dx/len)*t.speed;t.y+=(t.dy/len)*t.speed;
    if(t.x<35||t.x>W-35){t.dx*=-1;t.x=clamp(t.x,35,W-35);}if(t.y<35||t.y>H-35){t.dy*=-1;t.y=clamp(t.y,35,H-35);}if(t.hitFlash>0)t.hitFlash--;
  }
}

function stepBattlefield(){
  const vertical=sim.orientation===0||sim.orientation===2;
  // Arrow lanes are always perpendicular to the crossing direction.
  // Every arrow uses exactly the same projectile speed as every other projectile.
  if(sim.tick%34===0){
    if(vertical){const y=65+randi(8)*67;const fromLeft=Math.random()<.5;sim.arrows.push({x:fromLeft?-10:W+10,y,vx:(fromLeft?1:-1)*PROJECTILE_SPEED,vy:0,r:3,dead:false});}
    else{const x=65+randi(13)*69;const fromTop=Math.random()<.5;sim.arrows.push({x,y:fromTop?-10:H+10,vx:0,vy:(fromTop?1:-1)*PROJECTILE_SPEED,r:3,dead:false});}
  }
  for(const p of sim.arrows){
    p.x+=p.vx;p.y+=p.vy;
    if(p.x<-15||p.x>W+15||p.y<-15||p.y>H+15||projectileBlocked(p)){p.dead=true;continue;}
    for(const a of sim.agents){if(a.alive&&circleHit(p,a,p.r,AGENT_R)){p.dead=true;killAgent(a);break;}}
  }
  sim.arrows=sim.arrows.filter(p=>!p.dead);
  for(const a of sim.agents){
    if(!a.alive||a.finished)continue;
    const o=objectiveVector(a);a.fitness+=Math.max(0,o.progress)*.02;
    let done=false;if(sim.orientation===0&&a.y<16)done=true;if(sim.orientation===2&&a.y>H-16)done=true;if(sim.orientation===1&&a.x>W-16)done=true;if(sim.orientation===3&&a.x<16)done=true;
    if(done){a.finished=true;a.alive=false;a.fitness+=700+(MAX_TICKS.battlefield-sim.tick)*.2;}
  }
}

function invaderForward(){if(sim.orientation===0)return{x:0,y:1};if(sim.orientation===2)return{x:0,y:-1};if(sim.orientation===1)return{x:-1,y:0};return{x:1,y:0};}
function invaderShuffle(){return(sim.orientation===0||sim.orientation===2)?{x:1,y:0}:{x:0,y:1};}
function stepInvaders(){
  const f=invaderForward(),s=invaderShuffle();const alive=sim.invaders.filter(n=>n.alive);
  const vertical=sim.orientation===0||sim.orientation===2;
  if(alive.length){
    const dir=alive[0].shuffle;
    const minPos=Math.min(...alive.map(n=>vertical?n.x:n.y)),maxPos=Math.max(...alive.map(n=>vertical?n.x:n.y));
    if((dir>0&&maxPos>(vertical?W:H)-25)||(dir<0&&minPos<25))for(const n of alive)n.shuffle*=-1;
  }
  // Space-Invaders-style shuffle and migration. An invader moves either sideways
  // OR forwards on a tick, never diagonally faster than the species' movement speed.
  const forwardStep=sim.tick%7===0;
  for(const n of alive){
    if(forwardStep){n.vx=f.x*AGENT_SPEED;n.vy=f.y*AGENT_SPEED;}
    else{n.vx=s.x*n.shuffle*AGENT_SPEED;n.vy=s.y*n.shuffle*AGENT_SPEED;}
    n.x+=n.vx;n.y+=n.vy;
    n.fireClock--;
    if(n.fireClock<=0){n.fireClock=125+randi(120);sim.projectiles.push({x:n.x,y:n.y,vx:f.x*PROJECTILE_SPEED,vy:f.y*PROJECTILE_SPEED,owner:null,team:'invader',r:2.5,dead:false});}
  }
  // A breach is a genuine failure, so surviving while ignoring the invaders is not a winning strategy.
  for(const n of alive){
    if((sim.orientation===0&&n.y>H-28)||(sim.orientation===2&&n.y<28)||(sim.orientation===1&&n.x<28)||(sim.orientation===3&&n.x>W-28)){
      for(const a of sim.agents)if(a.alive)a.fitness-=120;
      sim.endReason='breach';sim.tick=MAX_TICKS.invaders;break;
    }
  }
  if(alive.length===0){for(const a of sim.agents)if(a.alive)a.fitness+=300;sim.endReason='wave cleared';sim.tick=MAX_TICKS.invaders;}
}

function stepRoyale(){
  const aliveTeams=SPECIES.filter(s=>sim.agents.some(a=>a.alive&&a.species.id===s.id));
  if(aliveTeams.length<=1){
    if(aliveTeams.length===1){sim.winner=aliveTeams[0].id;for(const a of sim.agents)if(a.species.id===sim.winner)a.fitness+=300;}
    sim.tick=MAX_TICKS.royale;sim.endReason=aliveTeams.length?'team victory':'draw';
  }
}

function step(){
  if(!sim||paused)return;
  sim.tick++;
  stepAgents();
  if(sim.mode==='target')stepTargets();
  if(sim.mode==='battlefield')stepBattlefield();
  if(sim.mode==='invaders')stepInvaders();
  stepProjectiles();
  if(sim.mode==='royale')stepRoyale();
  if(sim.tick>=MAX_TICKS[sim.mode])finishGeneration();
}

function finishGeneration(){
  // Mode-specific terminal shaping.
  for(const a of sim.agents){
    if(sim.mode==='target')a.fitness+=a.hits*8;
    if(sim.mode==='battlefield'&&!a.finished){const o=objectiveVector(a);a.fitness+=o.progress*110;}
    if(sim.mode==='invaders'&&a.alive)a.fitness+=35;
    if(sim.mode==='royale'&&a.alive)a.fitness+=55;
    sim.populations[a.species.id][a.idx].fitness=a.fitness;
  }
  for(const s of SPECIES){
    const pop=sim.populations[s.id];const best=Math.max(...pop.map(p=>p.fitness));sim.bestEver[s.id]=Math.max(sim.bestEver[s.id],best);
    sim.populations[s.id]=evolvePopulation(pop);
  }
  sim.generation++;setupGeneration();
}
