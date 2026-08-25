'use strict';

function targetRectOverlaps(a,b,pad=0){return a.x-pad<b.x+b.w+pad&&a.x+a.w+pad>b.x-pad&&a.y-pad<b.y+b.h+pad&&a.y+a.h+pad>b.y-pad;}
function targetPointClear(p,r,bunkers,points=[],pointGap=0){
  if(p.x-r<FIELD.left+12||p.x+r>FIELD.right-12||p.y-r<FIELD.top+12||p.y+r>FIELD.bottom-12)return false;
  if(bunkers.some(b=>rectCircleHit(b,p,r+8)))return false;
  return points.every(o=>Math.hypot(p.x-o.x,p.y-o.y)>=r+(o.r||AGENT_R)+pointGap);
}
function randomTargetBunkers(count=3){
  const out=[];
  for(let i=0;i<count;i++){
    let placed=false;
    for(let tries=0;tries<300&&!placed;tries++){
      const w=48+randi(39),h=30+randi(35),b=newBunker(rand(FIELD.right-w-28,FIELD.left+28),rand(FIELD.bottom-h-28,FIELD.top+28),w,h,'T'+(i+1));
      if(out.every(o=>!targetRectOverlaps(b,o,35))){out.push(b);placed=true;}
    }
    if(!placed)return null;
  }
  return out;
}
function randomTargetPoint(r,bunkers,points=[],gap=0){
  for(let tries=0;tries<600;tries++){
    const p={x:rand(FIELD.right-r-20,FIELD.left+r+20),y:rand(FIELD.bottom-r-20,FIELD.top+r+20),r};
    if(targetPointClear(p,r,bunkers,points,gap))return p;
  }
  return null;
}
function buildTargetLayout(){
  for(let attempt=0;attempt<50;attempt++){
    const bunkers=randomTargetBunkers(3);if(!bunkers)continue;
    const targetDirs=shuffledIndices(8).slice(0,6),targets=[];
    let failed=false;
    for(let i=0;i<6;i++){
      const p=randomTargetPoint(9,bunkers,targets,34);if(!p){failed=true;break;}
      const d=DIRS[targetDirs[i]];
      targets.push({x:p.x,y:p.y,r:9,id:i,dx:d.x,dy:d.y,speed:AGENT_SPEED,hitFlash:0,turnEvery:180+randi(121),nextTurn:90+randi(180),turnBias:Math.random()<.5?-1:1,cooldownFor:{red:0,green:0,blue:0}});
    }
    if(failed)continue;
    const starts=[],occupied=targets.map(t=>({x:t.x,y:t.y,r:t.r}));
    for(let i=0;i<POP_SIZE;i++){
      const p=randomTargetPoint(AGENT_R,bunkers,occupied,18);if(!p){failed=true;break;}
      starts.push({x:p.x,y:p.y,facing:randi(8)});occupied.push({x:p.x,y:p.y,r:AGENT_R});
    }
    if(failed)continue;
    return{bunkers,targets,starts};
  }
  throw new Error('Target Practice could not generate a legal arena.');
}

function setupTarget(){
  sim.orientation=0;
  const layout=buildTargetLayout();sim.bunkers=layout.bunkers;sim.targets=layout.targets;
  // All species receive the exact same twelve physical starts. Genotypes are shuffled
  // independently; tiny colour offsets are render-only so they do not alter physics.
  for(const s of SPECIES){
    const pop=sim.populations[s.id],genotypes=shuffledIndices(POP_SIZE);
    for(let slot=0;slot<POP_SIZE;slot++){const p=layout.starts[slot],g=pop[genotypes[slot]];sim.agents.push(new Agent(s,g,genotypes[slot],p.x,p.y,p.facing));}
  }
}

function targetActiveFor(t,speciesId){return sim.tick>=(t.cooldownFor?.[speciesId]||0);}
function stepTargets(){
  for(const t of sim.targets){
    if(sim.tick>=t.nextTurn){const nd=vecToDir(t.dx,t.dy),d=DIRS[(nd+t.turnBias+8)%8];t.dx=d.x;t.dy=d.y;t.nextTurn+=t.turnEvery;if(Math.random()<.3)t.turnBias*=-1;}
    const oldX=t.x,oldY=t.y,len=Math.hypot(t.dx,t.dy)||1;
    t.x+=t.dx/len*t.speed;t.y+=t.dy/len*t.speed;
    if(t.x<FIELD.left+35||t.x>FIELD.right-35){t.dx*=-1;t.x=clamp(t.x,FIELD.left+35,FIELD.right-35);}
    if(t.y<FIELD.top+35||t.y>FIELD.bottom-35){t.dy*=-1;t.y=clamp(t.y,FIELD.top+35,FIELD.bottom-35);}
    if(sim.bunkers.some(b=>rectCircleHit(b,t,t.r))){t.x=oldX;t.y=oldY;t.dx*=-1;t.dy*=-1;}
    if(t.hitFlash>0)t.hitFlash--;
  }
}
