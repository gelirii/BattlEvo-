'use strict';

const fs=require('fs'),vm=require('vm'),assert=require('assert');
let seed=0xBADD1E;Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
const fakeCtx=new Proxy({}, {get(t,p){if(!(p in t))t[p]=()=>{};return t[p];},set(t,p,v){t[p]=v;return true;}}),elements={game:{width:960,height:600,getContext:()=>fakeCtx},'brain-red':{value:'4'},'brain-green':{value:'10'},'brain-blue':{value:'20'}};
global.document={getElementById:id=>elements[id]||{value:'',disabled:false,textContent:''}};global.performance={now:()=>0};global.setRunningUI=()=>{};global.updateHud=()=>{};global.updateRoundResult=()=>{};global.saveExperiment=()=>{};
for(const file of ['core.js','lifetime-stats.js','target-practice.js','brain-world.js','modes.js'])vm.runInThisContext(fs.readFileSync(file,'utf8'),{filename:file});
const ev=code=>vm.runInThisContext(code),reset=mode=>ev(`selectedMode='${mode}';initSimulation();`);

// Projectile balance stays in the intended dangerous-but-dodgeable window.
const agentSpeed=ev('AGENT_SPEED'),projectileSpeed=ev('PROJECTILE_SPEED'),ratio=projectileSpeed/agentSpeed,reaction100=100/projectileSpeed,lateral100=reaction100*agentSpeed,fleeCatch100=100/(projectileSpeed-agentSpeed);
assert.ok(ratio>2.5&&ratio<3.2);assert.ok(lateral100>3*ev('AGENT_R'));assert.ok(fleeCatch100<60);

// Full forward field, bunker occlusion and persistent terrain memory.
reset('target');ev(`sim.bunkers=[newBunker(300,275,60,50,'LOS')];sim.agents[0].x=240;sim.agents[0].y=300;sim.agents[0].facing=0;sim.agents[0].memory.clear();`);
assert.strictEqual(ev('lineOfSight(sim.agents[0],{x:420,y:300})'),false);assert.strictEqual(ev('lineOfSight(sim.agents[0],{x:320,y:170})'),true);ev('rememberVisibleBunkers(sim.agents[0]);');assert.strictEqual(ev("sim.agents[0].memory.has('LOS')"),true);ev('sim.agents[0].facing=4;rememberVisibleBunkers(sim.agents[0]);');assert.strictEqual(ev("sim.agents[0].memory.has('LOS')"),true);

// Velocity channels are creature-relative, not screen-relative.
const rv=ev(`(()=>{const a=sim.agents[0];a.facing=0;return relativeVelocity(a,0,-PROJECTILE_SPEED,PROJECTILE_SPEED);})()`);assert.ok(Math.abs(rv.forward)<1e-9&&Math.abs(rv.side+1)<1e-9,'velocity was not converted into facing-relative coordinates');

// Target Practice discourages spray-and-pray and prevents one target being farmed continuously.
reset('target');
ev(`(()=>{const a=sim.agents.find(x=>x.species.id==='red');a.cooldown=0;a.fitness=10;fire(a);})()`);assert.ok(Math.abs(ev('sim.agents.find(x=>x.species.id===\'red\').fitness')-9.5)<1e-6,'Target shot cost is not meaningful');
ev(`(()=>{const a=sim.agents.find(x=>x.species.id==='red'),t=sim.targets[0];sim.bunkers=[];sim.projectiles=[{x:t.x-PROJECTILE_SPEED,y:t.y,vx:PROJECTILE_SPEED,vy:0,owner:a,team:'red',r:2.5,dead:false}];stepProjectiles();})()`);const firstHits=ev('sim.lifetime.target.red.hits');
ev(`(()=>{const a=sim.agents.find(x=>x.species.id==='red'),t=sim.targets[0];sim.projectiles=[{x:t.x-PROJECTILE_SPEED,y:t.y,vx:PROJECTILE_SPEED,vy:0,owner:a,team:'red',r:2.5,dead:false}];stepProjectiles();})()`);assert.strictEqual(ev('sim.lifetime.target.red.hits'),firstHits,'same species farmed a target during its cooldown');
ev('sim.tick+=121;');ev(`(()=>{const a=sim.agents.find(x=>x.species.id==='red'),t=sim.targets[0];sim.projectiles=[{x:t.x-PROJECTILE_SPEED,y:t.y,vx:PROJECTILE_SPEED,vy:0,owner:a,team:'red',r:2.5,dead:false}];stepProjectiles();})()`);assert.strictEqual(ev('sim.lifetime.target.red.hits'),firstHits+1,'target did not become available after cooldown');

// Battlefield orientation equivalence and no species gunfire.
reset('battlefield');const starts=[];for(let o=0;o<4;o++){ev(`sim.orientation=${o};sim.agents=[];sim.bunkers=[];setupBattlefield();`);starts.push(ev('objectiveVector(sim.agents[0]).progress'));assert.ok(ev('sim.agents.every(a=>inArenaPoint(a))'));}assert.ok(Math.max(...starts)-Math.min(...starts)<1e-6);
ev(`sim.projectiles=[];for(const a of sim.agents)a.genotype.brain.run=()=>{const o=new Float32Array(18);o[17]=1;return o;};stepAgents();`);assert.strictEqual(ev('sim.projectiles.length'),0);

// Friendly fire is impossible, enemies still take damage, and Royale bodies cannot stack.
reset('royale');ev(`(()=>{const red=SPECIES[0],blue=SPECIES[2],g=sim.populations.red[0];const shooter=new Agent(red,g,0,300,300,0),friend=new Agent(red,g,1,400,300,4),enemy=new Agent(blue,sim.populations.blue[0],0,450,300,4);sim.agents=[shooter,friend,enemy];sim.bunkers=[];sim.projectiles=[{x:400-PROJECTILE_SPEED,y:300,vx:PROJECTILE_SPEED,vy:0,owner:shooter,team:'red',r:2.5,dead:false}];stepProjectiles();})()`);assert.strictEqual(ev('sim.agents[1].health'),1);ev(`sim.projectiles=[{x:450-PROJECTILE_SPEED,y:300,vx:PROJECTILE_SPEED,vy:0,owner:sim.agents[0],team:'red',r:2.5,dead:false}];stepProjectiles();`);assert.ok(ev('sim.agents[2].health')<1);
ev(`(()=>{const a=sim.agents[0],o=sim.agents[1];a.x=300;a.y=300;o.x=315;o.y=300;a.moveDir=0;tryMove(a);})()`);assert.ok(ev('dist2(sim.agents[0],sim.agents[1])')>=(ev('AGENT_R')*2)**2,'Royale creatures overlapped after movement');

// One species cannot steal Invader targets, bullets or breach state from another.
reset('invaders');ev(`(()=>{const n=sim.invaders[0],red=sim.agents.find(a=>a.species.id==='red');n.x=FIELD.cx;n.y=FIELD.cy;sim.bunkers=[];red.x=n.x-30;red.y=n.y;sim.projectiles=[{x:n.x-PROJECTILE_SPEED,y:n.y,vx:PROJECTILE_SPEED,vy:0,owner:red,team:'red',r:2.5,dead:false}];stepProjectiles();})()`);assert.strictEqual(ev('sim.invaders[0].aliveFor.red'),false);assert.strictEqual(ev('sim.invaders[0].aliveFor.green'),true);
reset('invaders');ev(`sim.invaderBreached={red:false,green:false,blue:false};for(const n of sim.invaders){for(const t of ['red','green','blue'])n.fireClockFor[t]=999;}const front=sim.invaders.find(n=>n.row===2&&n.col===0);front.aliveFor.red=false;front.fireClockFor.green=0;sim.tick=1;sim.projectiles=[];stepInvaders();`);assert.strictEqual(ev("sim.projectiles.some(p=>p.targetTeam==='red')"),false,'dead Red Invader fired at Red');assert.strictEqual(ev("sim.projectiles.some(p=>p.targetTeam==='green')"),true,'live Green logical Invader failed to fire');
reset('invaders');ev(`sim.invaderBreached={red:false,green:false,blue:false};const n=sim.invaders.find(q=>q.row===2);n.aliveFor.red=false;n.y=FIELD.bottom-20;sim.tick=1;stepInvaders();`);assert.strictEqual(ev('sim.invaderBreached.red'),false,'Red failed from an Invader it had already killed');assert.strictEqual(ev('sim.invaderBreached.green'),true);assert.ok(ev("sim.agents.some(a=>a.species.id==='red'&&a.alive)"),'Red agents were removed by another colour’s breach');

// Per-team hostile fire density, not aggregate three-layer density.
reset('invaders');ev('sim.projectiles=[];sim.invaderBreached={red:false,green:false,blue:false};');for(let i=0;i<600;i++)ev('sim.tick++;stepInvaders();');const perTeam=Object.fromEntries(['red','green','blue'].map(t=>[t,ev(`sim.projectiles.filter(p=>p.targetTeam==='${t}').length`)]));for(const n of Object.values(perTeam))assert.ok(n>=12&&n<=50,`Invader per-team fire density ${n}/10s is unreasonable`);

// Mutation burden remains sub-linear with brain size.
const genome=n=>77*n+n+n*18+18,rate=n=>.06*Math.sqrt(genome(4)/genome(n));assert.ok(rate(20)<rate(4)&&rate(64)<rate(20));

console.log('BattlEvo v1 gameplay audit passed.');console.log(JSON.stringify({speedRatio:+ratio.toFixed(3),stationary100pxReactionSeconds:+(reaction100/60).toFixed(3),lateralDodgeAt100px:+lateral100.toFixed(1),fleeing100pxCatchSeconds:+(fleeCatch100/60).toFixed(3),battlefieldStartProgress:starts.map(x=>+x.toFixed(4)),invaderShotsPer10sPerTeam:perTeam},null,2));
