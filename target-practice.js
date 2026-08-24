'use strict';

// Target Practice deliberately has no privileged attack direction. Every generation
// rebuilds the arena from scratch: cover, moving targets and creature starts all come
// from the same unbiased square-field distribution.
function targetRectOverlaps(a,b,pad=0){
  return a.x-pad<b.x+b.w+pad&&a.x+a.w+pad>b.x-pad&&a.y-pad<b.y+b.h+pad&&a.y+a.h+pad>b.y-pad;
}

function targetPointClear(p,r,bunkers,points=[],pointGap=0){
  if(p.x-r<FIELD.left+12||p.x+r>FIELD.right-12||p.y-r<FIELD.top+12||p.y+r>FIELD.bottom-12)return false;
  if(bunkers.some(b=>rectCircleHit(b,p,r+8)))return false;
  return points.every(o=>Math.hypot(p.x-o.x,p.y-o.y)>=r+(o.r||AGENT_R)+pointGap);
}

function randomTargetBunkers(count=3){
  const out=[];
  for(let i=0;i<count;i++){
    let placed=false;
    for(let tries=0;tries<250&&!placed;tries++){
      const w=48+randi(39),h=30+randi(35);
      const b=newBunker(
        rand(FIELD.right-w-28,FIELD.left+28),
        rand(FIELD.bottom-h-28,FIELD.top+28),
        w,h,'T'+(i+1)
      );
      if(out.every(o=>!targetRectOverlaps(b,o,35))){out.push(b);placed=true;}
    }
  }
  return out;
}

function randomTargetPoint(r,bunkers,points=[],gap=0){
  for(let tries=0;tries<500;tries++){
    const p={x:rand(FIELD.right-r-20,FIELD.left+r+20),y:rand(FIELD.bottom-r-20,FIELD.top+r+20),r};
    if(targetPointClear(p,r,bunkers,points,gap))return p;
  }
  // Pathological random sequences should not break a generation; the centre is only
  // a last-resort fallback and is subsequently handled by normal collision rules.
  return{x:FIELD.cx,y:FIELD.cy,r};
}

setupTarget=function(){
  sim.orientation=0;
  sim.bunkers=randomTargetBunkers(3);

  // Targets are placed before creatures so creature spawns cannot begin directly on
  // top of the thing they are meant to acquire visually.
  sim.targets=[];
  for(let i=0;i<6;i++){
    const p=randomTargetPoint(9,sim.bunkers,sim.targets,34);
    const d=DIRS[randi(8)];
    sim.targets.push({
      x:p.x,y:p.y,r:9,id:i,
      dx:d.x,dy:d.y,speed:AGENT_SPEED,
      phase:Math.random()*TAU,hitFlash:0,
      turnEvery:180+randi(121),
      nextTurn:90+randi(180),
      turnBias:Math.random()<.5?-1:1
    });
  }

  // Generate one neutral pool of 36 legal spawn positions, shuffle it, then divide it
  // between the colours. This is random per creature without giving any species a
  // hard-coded side or band of the arena.
  const spawnPoints=[];
  const occupied=sim.targets.map(t=>({x:t.x,y:t.y,r:t.r}));
  for(let i=0;i<POP_SIZE*SPECIES.length;i++){
    const p=randomTargetPoint(AGENT_R,sim.bunkers,occupied,10);
    spawnPoints.push(p);occupied.push({x:p.x,y:p.y,r:AGENT_R});
  }
  for(let i=spawnPoints.length-1;i>0;i--){const j=randi(i+1);[spawnPoints[i],spawnPoints[j]]=[spawnPoints[j],spawnPoints[i]];}

  let cursor=0;
  for(const s of SPECIES){
    const pop=sim.populations[s.id],genotypes=shuffledIndices(POP_SIZE);
    for(let i=0;i<POP_SIZE;i++){
      const p=spawnPoints[cursor++],g=pop[genotypes[i]];
      sim.agents.push(new Agent(s,g,genotypes[i],p.x,p.y,randi(8)));
    }
  }
};

// Keep target motion learnable rather than Brownian: each target travels straight,
// bounces off walls/cover, and occasionally makes a single 45-degree turn. The timing
// and handedness are randomised per target each generation.
stepTargets=function(){
  for(const t of sim.targets){
    if(sim.tick>=t.nextTurn){
      const nd=vecToDir(t.dx,t.dy);
      const d=DIRS[(nd+t.turnBias+8)%8];
      t.dx=d.x;t.dy=d.y;
      t.nextTurn+=t.turnEvery;
      if(Math.random()<.3)t.turnBias*=-1;
    }
    const oldX=t.x,oldY=t.y,len=Math.hypot(t.dx,t.dy)||1;
    t.x+=(t.dx/len)*t.speed;t.y+=(t.dy/len)*t.speed;
    if(t.x<FIELD.left+35||t.x>FIELD.right-35){t.dx*=-1;t.x=clamp(t.x,FIELD.left+35,FIELD.right-35);}
    if(t.y<FIELD.top+35||t.y>FIELD.bottom-35){t.dy*=-1;t.y=clamp(t.y,FIELD.top+35,FIELD.bottom-35);}
    if(sim.bunkers.some(b=>rectCircleHit(b,t,t.r))){t.x=oldX;t.y=oldY;t.dx*=-1;t.dy*=-1;}
    if(t.hitFlash>0)t.hitFlash--;
  }
};
