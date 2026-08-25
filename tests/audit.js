'use strict';

const fs=require('fs'),vm=require('vm'),assert=require('assert');
let seed=0xBADD1E;Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
const fakeCtx=new Proxy({}, {get(t,p){if(!(p in t))t[p]=()=>{};return t[p];},set(t,p,v){t[p]=v;return true;}}),elements={game:{width:960,height:600,getContext:()=>fakeCtx},'brain-red':{value:'4'},'brain-green':{value:'10'},'brain-blue':{value:'20'}};
global.document={getElementById:id=>elements[id]||{value:'',disabled:false,textContent:''}};global.performance={now:()=>0};global.setRunningUI=()=>{};global.updateHud=()=>{};global.updateRoundResult=()=>{};global.saveExperiment=()=>{};
for(const file of ['core.js','lifetime-stats.js','target-practice.js','brain-world.js','modes.js'])vm.runInThisContext(fs.readFileSync(file,'utf8'),{filename:file});
const ev=code=>vm.runInThisContext(code),reset=mode=>ev(`selectedMode='${mode}';initSimulation();`);

const agentSpeed=ev('AGENT_SPEED'),projectileSpeed=ev('PROJECTILE_SPEED'),ratio=projectileSpeed/agentSpeed,reaction100=100/projectileSpeed,lateral100=reaction100*agentSpeed,fleeCatch100=100/(projectileSpeed-agentSpeed);assert.ok(ratio>2.5&&ratio<3.2);assert.ok(lateral100>3*ev('AGENT_R'));assert.ok(fleeCatch100<60);

// Random-cover contract: every mode gets a fresh layout only after its live entities exist.
const expectedCover={target:3,battlefield:4,invaders:3,royale:6},coverSignatures={};
for(const mode of Object.keys(expectedCover)){
  const sig=new Set();
  for(let i=0;i<12;i++){
    reset(mode);
    assert.strictEqual(ev('sim.bunkers.length'),expectedCover[mode],`${mode}: wrong bunker count`);
    assert.ok(ev('sim.bunkers.every(b=>bunkerInsideField(b,20))'),`${mode}: bunker outside legal field`);
    assert.ok(ev('sim.agents.every(a=>!sim.bunkers.some(b=>rectCircleHit(b,a,AGENT_R+10)))'),`${mode}: creature spawned too close to/inside cover`);
    assert.ok(ev('sim.bunkers.every((b,i)=>sim.bunkers.every((o,j)=>i===j||!rectOverlap(b,o,10)))'),`${mode}: bunkers overlap or pinch together`);
    if(mode==='target')assert.ok(ev('sim.targets.every(t=>!sim.bunkers.some(b=>rectCircleHit(b,t,t.r+10)))'),'target: target spawned too close to/inside cover');
    if(mode==='invaders')assert.ok(ev('sim.invaders.every(n=>!sim.bunkers.some(b=>rectCircleHit(b,n,n.r+8)))'),'invaders: Invader spawned too close to/inside cover');
    sig.add(ev("JSON.stringify(sim.bunkers.map(b=>[Math.round(b.x),Math.round(b.y),Math.round(b.w),Math.round(b.h)]))"));
  }
  assert.ok(sig.size>=10,`${mode}: cover is not varying enough between trials`);coverSignatures[mode]=sig.size;
}

// With RNG held constant, Battlefield cover must be one canonical layout rotated with the route.
reset('battlefield');const rotated=[];
for(let o=0;o<4;o++){
  seed=0x51DEBEEF;ev(`sim.orientation=${o};sim.agents=[];sim.bunkers=[];setupBattlefield();`);
  rotated.push(ev(`sim.bunkers.map(b=>{const c=orientedPoint(b.x+b.w/2,b.y+b.h/2,${(4-o)%4}),odd=${o}%2===1;return[+c.x.toFixed(4),+c.y.toFixed(4),odd?b.h:b.w,odd?b.w:b.h];})`));
}
for(let i=1;i<4;i++)assert.deepStrictEqual(rotated[i],rotated[0],`Battlefield orientation ${i} did not rotate the same canonical cover`);

reset('target');ev(`sim.bunkers=[newBunker(300,275,60,50,'LOS')];sim.agents[0].x=240;sim.agents[0].y=300;sim.agents[0].facing=0;sim.agents[0].memory.clear();`);assert.strictEqual(ev('lineOfSight(sim.agents[0],{x:420,y:300})'),false);assert.strictEqual(ev('lineOfSight(sim.agents[0],{x:320,y:170})'),true);ev('rememberVisibleBunkers(sim.agents[0]);');assert.strictEqual(ev("sim.agents[0].memory.has('LOS')"),true);ev('sim.agents[0].facing=4;rememberVisibleBunkers(sim.agents[0]);');assert.strictEqual(ev("sim.agents[0].memory.has('LOS')"),true);
const rv=ev(`(()=>{const a=sim.agents[0];a.facing=0;return relativeVelocity(a,0,-PROJECTILE_SPEED,PROJECTILE_SPEED);})()`);assert.ok(Math.abs(rv.forward)<1e-9&&Math.abs(rv.side+1)<1e-9);
reset('target');ev(`(()=>{const a=sim.agents.find(x=>x.species.id==='red');a.cooldown=0;a.fitness=10;fire(a);})()`);assert.ok(Math.abs(ev("sim.agents.find(x=>x.species.id==='red').fitness")-9.5)<1e-6);ev(`(()=>{const a=sim.agents.find(x=>x.species.id==='red'),t=sim.targets[0];sim.bunkers=[];sim.projectiles=[{x:t.x-PROJECTILE_SPEED,y:t.y,vx:PROJECTILE_SPEED,vy:0,owner:a,team:'red',r:2.5,dead:false}];stepProjectiles();})()`);const firstHits=ev('sim.lifetime.target.red.hits');ev(`(()=>{const a=sim.agents.find(x=>x.species.id==='red'),t=sim.targets[0];sim.projectiles=[{x:t.x-PROJECTILE_SPEED,y:t.y,vx:PROJECTILE_SPEED,vy:0,owner:a,team:'red',r:2.5,dead:false}];stepProjectiles();})()`);assert.strictEqual(ev('sim.lifetime.target.red.hits'),firstHits);ev('sim.tick+=121;');ev(`(()=>{const a=sim.agents.find(x=>x.species.id==='red'),t=sim.targets[0];sim.projectiles=[{x:t.x-PROJECTILE_SPEED,y:t.y,vx:PROJECTILE_SPEED,vy:0,owner:a,team:'red',r:2.5,dead:false}];stepProjectiles();})()`);assert.strictEqual(ev('sim.lifetime.target.red.hits'),firstHits+1);
reset('battlefield');const starts=[];for(let o=0;o<4;o++){seed=0x1234ABCD;ev(`sim.orientation=${o};sim.agents=[];sim.bunkers=[];setupBattlefield();`);starts.push(ev('objectiveVector(sim.agents[0]).progress'));assert.ok(ev('sim.agents.every(a=>inArenaPoint(a))'));}assert.ok(Math.max(...starts)-Math.min(...starts)<1e-6);ev(`sim.projectiles=[];for(const a of sim.agents)a.genotype.brain.run=()=>{const o=new Float32Array(18);o[17]=1;return o;};stepAgents();`);assert.strictEqual(ev('sim.projectiles.length'),0);
reset('royale');ev(`(()=>{const red=SPECIES[0],blue=SPECIES[2],g=sim.populations.red[0];const shooter=new Agent(red,g,0,300,300,0),friend=new Agent(red,g,1,400,300,4),enemy=new Agent(blue,sim.populations.blue[0],0,450,300,4);sim.agents=[shooter,friend,enemy];sim.bunkers=[];sim.projectiles=[{x:400-PROJECTILE_SPEED,y:300,vx:PROJECTILE_SPEED,vy:0,owner:shooter,team:'red',r:2.5,dead:false}];stepProjectiles();})()`);assert.strictEqual(ev('sim.agents[1].health'),1);ev(`sim.projectiles=[{x:450-PROJECTILE_SPEED,y:300,vx:PROJECTILE_SPEED,vy:0,owner:sim.agents[0],team:'red',r:2.5,dead:false}];stepProjectiles();`);assert.ok(ev('sim.agents[2].health')<1);ev(`(()=>{const a=sim.agents[0],o=sim.agents[1];a.x=300;a.y=300;o.x=315;o.y=300;a.moveDir=0;tryMove(a);})()`);assert.ok(ev('dist2(sim.agents[0],sim.agents[1])')>=(ev('AGENT_R')*2)**2);
reset('invaders');ev(`(()=>{const n=sim.invaders[0],red=sim.agents.find(a=>a.species.id==='red');n.x=FIELD.cx;n.y=FIELD.cy;sim.bunkers=[];red.x=n.x-30;red.y=n.y;sim.projectiles=[{x:n.x-PROJECTILE_SPEED,y:n.y,vx:PROJECTILE_SPEED,vy:0,owner:red,team:'red',r:2.5,dead:false}];stepProjectiles();})()`);assert.strictEqual(ev('sim.invaders[0].aliveFor.red'),false);assert.strictEqual(ev('sim.invaders[0].aliveFor.green'),true);
reset('invaders');ev(`for(const n of sim.invaders){for(const t of ['red','green','blue'])n.fireClockFor[t]=999;}const front=sim.invaders.find(n=>n.row===2&&n.col===0);front.aliveFor.red=false;front.fireClockFor.green=0;sim.tick=1;sim.projectiles=[];stepInvaders();`);assert.strictEqual(ev("sim.projectiles.some(p=>p.targetTeam==='red')"),false);assert.strictEqual(ev("sim.projectiles.some(p=>p.targetTeam==='green')"),true);
reset('invaders');ev(`sim.orientation=0;const n=sim.invaders.find(q=>q.row===2);n.aliveFor.red=false;n.y=FIELD.bottom-20;sim.tick=1;stepInvaders();`);assert.strictEqual(ev('sim.invaderBreached.red'),false);assert.strictEqual(ev('sim.invaderBreached.green'),true);assert.ok(ev("sim.agents.some(a=>a.species.id==='red'&&a.alive)"));
reset('invaders');ev('sim.projectiles=[];');for(let i=0;i<600;i++)ev('sim.tick++;stepInvaders();');const perTeam=Object.fromEntries(['red','green','blue'].map(t=>[t,ev(`sim.projectiles.filter(p=>p.targetTeam==='${t}').length`)]));for(const n of Object.values(perTeam))assert.ok(n>=12&&n<=50,`Invader per-team fire density ${n}/10s is unreasonable`);
const genome=n=>77*n+n+n*18+18,rate=n=>.06*Math.sqrt(genome(4)/genome(n));assert.ok(rate(20)<rate(4)&&rate(64)<rate(20));
console.log('BattlEvo v1 gameplay audit passed.');console.log(JSON.stringify({speedRatio:+ratio.toFixed(3),stationary100pxReactionSeconds:+(reaction100/60).toFixed(3),lateralDodgeAt100px:+lateral100.toFixed(1),fleeing100pxCatchSeconds:+(fleeCatch100/60).toFixed(3),battlefieldStartProgress:starts.map(x=>+x.toFixed(4)),coverLayouts:coverSignatures,invaderShotsPer10sPerTeam:perTeam},null,2));
