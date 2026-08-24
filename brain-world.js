function objectiveVector(agent){
  if(sim.mode==='battlefield'){
    if(sim.orientation===0)return{x:0,y:-1,progress:1-agent.y/H};
    if(sim.orientation===2)return{x:0,y:1,progress:agent.y/H};
    if(sim.orientation===1)return{x:1,y:0,progress:agent.x/W};
    return{x:-1,y:0,progress:1-agent.x/W};
  }
  if(sim.mode==='invaders'){
    if(sim.orientation===0)return{x:0,y:-1,progress:0}; if(sim.orientation===2)return{x:0,y:1,progress:0}; if(sim.orientation===1)return{x:1,y:0,progress:0}; return{x:-1,y:0,progress:0};
  }
  return{x:0,y:0,progress:0};
}

function inFront(agent, obj){
  const dx=obj.x-agent.x,dy=obj.y-agent.y; const f=DIRS[agent.facing];
  return dot(dx,dy,f.x,f.y)>=0;
}

function rememberVisibleBunkers(agent){
  for(const b of sim.bunkers){
    if(inFront(agent,{x:b.x+b.w/2,y:b.y+b.h/2})) agent.memory.set(b.id,{x:b.x+b.w/2,y:b.y+b.h/2,w:b.w,h:b.h,seen:sim.tick});
  }
}

function buildInputs(a){
  rememberVisibleBunkers(a);
  const input=new Float32Array(INPUTS); let k=0;
  const f=DIRS[a.facing], mv=a.moveDir>=0?DIRS[a.moveDir]:{x:0,y:0};
  input[k++]=a.health; input[k++]=a.cooldown<=0?1:0; input[k++]=f.x; input[k++]=f.y; input[k++]=mv.x; input[k++]=mv.y;
  const obj=objectiveVector(a); input[k++]=obj.x; input[k++]=obj.y; input[k++]=obj.progress;

  // Seven sectors cover the full 180-degree forward field.
  // Each sector uses the same combat vocabulary in every mode:
  // hostile/target proximity + velocity, friendly proximity,
  // hostile projectile proximity + velocity, and visible bunker proximity.
  // This is deliberate: Target Practice targets, Invaders aliens and
  // Battle Royale enemies exercise the SAME hostile-tracking inputs.
  const sectors=Array.from({length:7},()=>new Float32Array(8));
  const sectorOf=(o)=>{
    const dx=o.x-a.x,dy=o.y-a.y; const d=Math.hypot(dx,dy); if(d<1)return null;
    const ang=normAngle(Math.atan2(dy,dx)-Math.atan2(f.y,f.x)); if(Math.abs(ang)>Math.PI/2)return null;
    const s=clamp(Math.floor(((ang+Math.PI/2)/Math.PI)*7),0,6);
    return{s,near:clamp(1-d/700,0,1)};
  };
  const addEnemy=(o,vx=0,vy=0)=>{
    const q=sectorOf(o); if(!q)return; const sec=sectors[q.s];
    if(q.near>sec[0]){sec[0]=q.near;sec[1]=clamp(vx/AGENT_SPEED,-1,1);sec[2]=clamp(vy/AGENT_SPEED,-1,1);}
  };
  const addFriend=(o)=>{const q=sectorOf(o);if(q)sectors[q.s][3]=Math.max(sectors[q.s][3],q.near);};
  const addProjectile=(o,vx=0,vy=0)=>{
    const q=sectorOf(o); if(!q)return; const sec=sectors[q.s];
    if(q.near>sec[4]){sec[4]=q.near;sec[5]=clamp(vx/PROJECTILE_SPEED,-1,1);sec[6]=clamp(vy/PROJECTILE_SPEED,-1,1);}
  };
  const addBunker=(o)=>{const q=sectorOf(o);if(q)sectors[q.s][7]=Math.max(sectors[q.s][7],q.near);};

  if(sim.mode==='royale'){
    for(const o of sim.agents){
      if(o===a||!o.alive)continue;
      if(o.species.id===a.species.id) addFriend(o);
      else {
        const d=o.moveDir>=0?DIRS[o.moveDir]:{x:0,y:0};
        addEnemy(o,d.x*AGENT_SPEED,d.y*AGENT_SPEED);
      }
    }
  }
  for(const p of sim.projectiles){
    if(p.owner===a||p.dead)continue;
    const hostile=sim.mode==='royale'?p.team!==a.species.id:p.team==='invader';
    if(hostile)addProjectile(p,p.vx,p.vy);
  }
  for(const p of sim.arrows){if(!p.dead)addProjectile(p,p.vx,p.vy);}
  for(const b of sim.bunkers)addBunker({x:b.x+b.w/2,y:b.y+b.h/2});
  if(sim.mode==='target')for(const t of sim.targets)addEnemy(t,(t.dx||0)*t.speed,(t.dy||0)*t.speed);
  if(sim.mode==='invaders')for(const n of sim.invaders){if(n.alive)addEnemy(n,n.vx||0,n.vy||0);}
  for(const s of sectors)for(const v of s)input[k++]=v;

  // Full 360-degree remembered terrain ring. A bunker only enters memory after
  // it has actually appeared in the agent's forward field, but remains usable
  // after the agent walks past or turns away from it.
  const memSectors=new Float32Array(8);
  for(const m of a.memory.values()){
    const dx=m.x-a.x,dy=m.y-a.y,d=Math.hypot(dx,dy);
    const rel=normAngle(Math.atan2(dy,dx)-Math.atan2(f.y,f.x));
    const sector=(Math.round(rel/(Math.PI/4))+8)%8;
    memSectors[sector]=Math.max(memSectors[sector],clamp(1-d/800,0,1));
  }
  for(const v of memSectors)input[k++]=v;

  input[k++]=a.x/W*2-1; input[k++]=a.y/H*2-1; input[k++]=Math.sin(sim.tick*.025); input[k++]=Math.cos(sim.tick*.025);
  while(k<INPUTS)input[k++]=0;
  return input;
}

function chooseAction(a){
  const out=a.genotype.brain.run(buildInputs(a));
  let mi=0; for(let i=1;i<9;i++)if(out[i]>out[mi])mi=i;
  a.moveDir=mi===0?-1:mi-1;
  let fi=9; for(let i=10;i<17;i++)if(out[i]>out[fi])fi=i;
  a.facing=fi-9;
  return out[17]>0.15;
}

function tryMove(a){
  if(a.moveDir<0)return;
  let d=DIRS[a.moveDir];
  if(sim.mode==='invaders'){
    const horizontal=sim.orientation===0||sim.orientation===2;
    d=horizontal?{x:Math.sign(d.x),y:0}:{x:0,y:Math.sign(d.y)};
    if(d.x===0&&d.y===0)return;
  }
  const nx=clamp(a.x+d.x*AGENT_SPEED,AGENT_R,W-AGENT_R),ny=clamp(a.y+d.y*AGENT_SPEED,AGENT_R,H-AGENT_R);
  const test={x:nx,y:ny};
  if(!sim.bunkers.some(b=>rectCircleHit(b,test,AGENT_R))){a.x=nx;a.y=ny;}
}

function fire(a){
  if(a.cooldown>0||!a.alive)return;
  const d=DIRS[a.facing];a.cooldown=24;a.shots++;
  sim.projectiles.push({x:a.x+d.x*11,y:a.y+d.y*11,vx:d.x*PROJECTILE_SPEED,vy:d.y*PROJECTILE_SPEED,owner:a,team:a.species.id,r:2.5,dead:false});
  a.fitness-=0.025;
}

function stepAgents(){
  for(const a of sim.agents){
    if(!a.alive)continue;
    a.lastX=a.x;a.lastY=a.y;
    const wantsFire=chooseAction(a);tryMove(a);if(wantsFire)fire(a);
    if(a.cooldown>0)a.cooldown--;if(a.flash>0)a.flash--;
    a.fitness+=0.002;
  }
}

function projectileBlocked(p){return sim.bunkers.some(b=>rectCircleHit(b,p,p.r));}
function killAgent(a,by=null){if(!a.alive)return;a.alive=false;a.health=0;a.fitness-=25;if(by&&by.owner&&by.owner!==a){by.owner.fitness+=35;by.owner.kills++;}}

function stepProjectiles(){
  for(const p of sim.projectiles){
    if(p.dead)continue;p.x+=p.vx;p.y+=p.vy;
    if(p.x<-10||p.x>W+10||p.y<-10||p.y>H+10||projectileBlocked(p)){p.dead=true;continue;}
    if(sim.mode==='target'){
      for(const t of sim.targets){if(circleHit(p,t,p.r,t.r)){p.dead=true;t.hitFlash=6;if(p.owner){p.owner.hits++;p.owner.fitness+=45;}break;}}
    }else if(sim.mode==='invaders'&&p.owner){
      for(const n of sim.invaders){if(n.alive&&circleHit(p,n,p.r,n.r)){p.dead=true;n.alive=false;n.flash=6;p.owner.hits++;p.owner.kills++;p.owner.fitness+=85;break;}}
    }else if(sim.mode==='royale'){
      for(const a of sim.agents){
        if(!a.alive||a===p.owner||a.species.id===p.team)continue;
        if(circleHit(p,a,p.r,AGENT_R)){p.dead=true;a.flash=5;a.health-=0.5;p.owner.fitness+=22;if(a.health<=0)killAgent(a,p);break;}
      }
    }
    if(!p.owner&&sim.mode==='invaders'){
      for(const a of sim.agents){if(a.alive&&circleHit(p,a,p.r,AGENT_R)){p.dead=true;killAgent(a,p);break;}}
    }
  }
  sim.projectiles=sim.projectiles.filter(p=>!p.dead);
}
