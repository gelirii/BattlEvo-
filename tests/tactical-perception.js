'use strict';

const fs=require('fs'),vm=require('vm'),assert=require('assert');
let seed=0x71C71C;Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
const fakeCtx=new Proxy({}, {get(t,p){if(!(p in t))t[p]=()=>{};return t[p];},set(t,p,v){t[p]=v;return true;}}),elements={game:{width:960,height:600,getContext:()=>fakeCtx},'brain-red':{value:'4'},'brain-green':{value:'10'},'brain-blue':{value:'20'}};
global.document={getElementById:id=>elements[id]||{value:'',disabled:false,textContent:''}};global.performance={now:()=>0};global.setRunningUI=()=>{};global.updateHud=()=>{};global.updateRoundResult=()=>{};global.saveExperiment=()=>{};
for(const file of ['core.js','lifetime-stats.js','target-practice.js','brain-world.js','modes.js'])vm.runInThisContext(fs.readFileSync(file,'utf8'),{filename:file});
const ev=code=>vm.runInThisContext(code),reset=mode=>ev(`selectedMode='${mode}';initSimulation();sim.bunkers=[];`);

assert.strictEqual(ev('INPUTS'),599);
assert.deepStrictEqual(ev('TACTICAL_SLOTS'),{bunkers:6,friends:15,enemies:32,friendlyProjectiles:12,enemyProjectiles:24});

// Target Practice: no creatures exist in perception; targets are enemies; only this individual's own shots are represented.
reset('target');
ev(`(()=>{const a=sim.agents.find(q=>q.species.id==='red'),mate=sim.agents.find(q=>q.species.id==='red'&&q!==a),green=sim.agents.find(q=>q.species.id==='green');const own={x:a.x+20,y:a.y,vx:PROJECTILE_SPEED,vy:0,owner:a,team:'red',r:2.5,dead:false},mates={x:a.x+25,y:a.y,vx:PROJECTILE_SPEED,vy:0,owner:mate,team:'red',r:2.5,dead:false},other={x:a.x+30,y:a.y,vx:PROJECTILE_SPEED,vy:0,owner:green,team:'green',r:2.5,dead:false};sim.projectiles=[own,mates,other];globalThis.__own=own;globalThis.__mates=mates;globalThis.__other=other;fillTacticalView(a);})()`);
assert.strictEqual(ev("sim.agents.find(q=>q.species.id==='red').tacticalView.friends.length"),0);
assert.strictEqual(ev("sim.agents.find(q=>q.species.id==='red').tacticalView.enemies.length"),6);
assert.strictEqual(ev("sim.agents.find(q=>q.species.id==='red').tacticalView.friendlyProjectiles.length"),1);
assert.strictEqual(ev("sim.agents.find(q=>q.species.id==='red').tacticalView.friendlyProjectiles[0]===__own"),true);
assert.strictEqual(ev("sim.agents.find(q=>q.species.id==='red').tacticalView.enemyProjectiles.length"),0);

// Facing never gates awareness. Cover changes visibility, not the object's known location.
ev(`(()=>{const a=sim.agents.find(q=>q.species.id==='red'),t=sim.targets[0];a.x=400;a.y=300;a.facing=0;a.aimX=1;a.aimY=0;t.x=250;t.y=300;sim.bunkers=[];fillTacticalView(a);})()`);
assert.strictEqual(ev("sim.agents.find(q=>q.species.id==='red').tacticalView.enemies.includes(sim.targets[0])"),true,'target behind creature should remain known');
assert.strictEqual(ev("lineOfSight(sim.agents.find(q=>q.species.id==='red'),sim.targets[0])"),true);
ev(`sim.bunkers=[newBunker(315,270,45,60,'BLOCK')];fillTacticalView(sim.agents.find(q=>q.species.id==='red'));`);
assert.strictEqual(ev("sim.agents.find(q=>q.species.id==='red').tacticalView.enemies.includes(sim.targets[0])"),true,'occluded target location should remain in tactical table');
assert.strictEqual(ev("lineOfSight(sim.agents.find(q=>q.species.id==='red'),sim.targets[0])"),false,'bunker should set clear sight false');
const hiddenSlot=ev(`(()=>{const a=sim.agents.find(q=>q.species.id==='red'),t=sim.targets[0],buf=new Float32Array(ACTOR_INPUTS);writeActorSlot(buf,0,t,a);return Array.from(buf);})()`);
assert.strictEqual(hiddenSlot[0],0,'occluded actor visibility must be 0');
assert.ok(Math.abs(hiddenSlot[1]-ev('normX(sim.targets[0].x)'))<1e-6,'occluded actor x coordinate was erased');
assert.ok(Math.abs(hiddenSlot[2]-ev('normY(sim.targets[0].y)'))<1e-6,'occluded actor y coordinate was erased');
ev('sim.bunkers=[];');const clearSlot=ev(`(()=>{const a=sim.agents.find(q=>q.species.id==='red'),t=sim.targets[0],buf=new Float32Array(ACTOR_INPUTS);writeActorSlot(buf,0,t,a);return Array.from(buf);})()`);assert.strictEqual(clearSlot[0],1,'clear actor visibility must be 1');

// Direct fire at a known-but-occluded location still collides with physical cover.
ev(`(()=>{const a=sim.agents.find(q=>q.species.id==='red');a.x=300;a.y=300;a.aimX=1;a.aimY=0;a.cooldown=0;sim.bunkers=[newBunker(340,270,50,60,'SHOTBLOCK')];sim.projectiles=[];fire(a);for(let i=0;i<20&&sim.projectiles.length;i++)stepProjectiles();})()`);
assert.strictEqual(ev('sim.projectiles.length'),0,'shot passed through bunker toward known hidden target');

// Battlefield: teammates + their shots, hostile arrows; no other colours or their shots.
reset('battlefield');
ev(`(()=>{const a=sim.agents.find(q=>q.species.id==='red'),mate=sim.agents.find(q=>q.species.id==='red'&&q!==a),green=sim.agents.find(q=>q.species.id==='green');const rp={x:a.x+20,y:a.y,vx:1,vy:0,owner:mate,team:'red',r:2.5,dead:false},gp={x:a.x+25,y:a.y,vx:1,vy:0,owner:green,team:'green',r:2.5,dead:false},arrow={x:a.x+30,y:a.y,vx:-PROJECTILE_SPEED,vy:0,r:3,dead:false,hitTeams:{}};sim.projectiles=[rp,gp];sim.arrows=[arrow];globalThis.__rp=rp;globalThis.__gp=gp;globalThis.__arrow=arrow;fillTacticalView(a);})()`);
assert.strictEqual(ev("sim.agents.find(q=>q.species.id==='red').tacticalView.friends.length"),15);
assert.strictEqual(ev("sim.agents.find(q=>q.species.id==='red').tacticalView.enemies.length"),0);
assert.strictEqual(ev("sim.agents.find(q=>q.species.id==='red').tacticalView.friendlyProjectiles.includes(__rp)"),true);
assert.strictEqual(ev("sim.agents.find(q=>q.species.id==='red').tacticalView.friendlyProjectiles.includes(__gp)"),false);
assert.strictEqual(ev("sim.agents.find(q=>q.species.id==='red').tacticalView.enemyProjectiles.includes(__arrow)"),true);

// Invaders: Invaders are enemies, same-species creatures/shots are friendly, only Invader fire for this species is hostile.
reset('invaders');
ev(`(()=>{const a=sim.agents.find(q=>q.species.id==='red'),mate=sim.agents.find(q=>q.species.id==='red'&&q!==a),green=sim.agents.find(q=>q.species.id==='green');const rp={x:a.x+20,y:a.y,vx:1,vy:0,owner:mate,team:'red',r:2.5,dead:false},gp={x:a.x+25,y:a.y,vx:1,vy:0,owner:green,team:'green',r:2.5,dead:false},ir={x:a.x+30,y:a.y,vx:0,vy:PROJECTILE_SPEED,owner:null,team:'invader',targetTeam:'red',r:2.5,dead:false},ig={x:a.x+35,y:a.y,vx:0,vy:PROJECTILE_SPEED,owner:null,team:'invader',targetTeam:'green',r:2.5,dead:false};sim.projectiles=[rp,gp,ir,ig];globalThis.__rp=rp;globalThis.__gp=gp;globalThis.__ir=ir;globalThis.__ig=ig;fillTacticalView(a);})()`);
assert.strictEqual(ev("sim.agents.find(q=>q.species.id==='red').tacticalView.friends.length"),15);
assert.strictEqual(ev("sim.agents.find(q=>q.species.id==='red').tacticalView.enemies.length"),21);
assert.strictEqual(ev("sim.agents.find(q=>q.species.id==='red').tacticalView.friendlyProjectiles.includes(__rp)"),true);
assert.strictEqual(ev("sim.agents.find(q=>q.species.id==='red').tacticalView.friendlyProjectiles.includes(__gp)"),false);
assert.strictEqual(ev("sim.agents.find(q=>q.species.id==='red').tacticalView.enemyProjectiles.includes(__ir)"),true);
assert.strictEqual(ev("sim.agents.find(q=>q.species.id==='red').tacticalView.enemyProjectiles.includes(__ig)"),false);

// Royale: same colour = friend/friendly fire; both other colours = enemy/hostile fire.
reset('royale');
ev(`(()=>{const a=sim.agents.find(q=>q.species.id==='red'),mate=sim.agents.find(q=>q.species.id==='red'&&q!==a),green=sim.agents.find(q=>q.species.id==='green'),blue=sim.agents.find(q=>q.species.id==='blue');const rp={x:a.x+20,y:a.y,vx:1,vy:0,owner:mate,team:'red',r:2.5,dead:false},gp={x:a.x+25,y:a.y,vx:1,vy:0,owner:green,team:'green',r:2.5,dead:false},bp={x:a.x+30,y:a.y,vx:1,vy:0,owner:blue,team:'blue',r:2.5,dead:false};sim.projectiles=[rp,gp,bp];globalThis.__rp=rp;globalThis.__gp=gp;globalThis.__bp=bp;fillTacticalView(a);})()`);
assert.strictEqual(ev("sim.agents.find(q=>q.species.id==='red').tacticalView.friends.length"),15);
assert.strictEqual(ev("sim.agents.find(q=>q.species.id==='red').tacticalView.enemies.length"),32);
assert.strictEqual(ev("sim.agents.find(q=>q.species.id==='red').tacticalView.friendlyProjectiles.includes(__rp)"),true);
assert.strictEqual(ev("sim.agents.find(q=>q.species.id==='red').tacticalView.enemyProjectiles.includes(__gp)"),true);
assert.strictEqual(ev("sim.agents.find(q=>q.species.id==='red').tacticalView.enemyProjectiles.includes(__bp)"),true);

// Eight aim outputs now combine into a continuous circular direction rather than winner-take-all compass snapping.
const continuous=ev(`(()=>{const out=new Float32Array(OUTPUTS);out.fill(-12);out[9]=0;out[10]=0;return aimVectorFromOutputs(out);})()`);
const continuousAngle=Math.atan2(continuous.y,continuous.x);assert.ok(Math.abs(continuousAngle-Math.PI/8)<0.002,`adjacent aim votes produced ${(continuousAngle*180/Math.PI).toFixed(2)}°, expected 22.5°`);
reset('target');const shot=ev(`(()=>{const a=sim.agents.find(q=>q.species.id==='red'),ang=Math.PI/8;a.aimX=Math.cos(ang);a.aimY=Math.sin(ang);a.cooldown=0;sim.projectiles=[];fire(a);return sim.projectiles[0];})()`);
const shotAngle=Math.atan2(shot.vy,shot.vx);assert.ok(Math.abs(shotAngle-Math.PI/8)<1e-6,'fired projectile snapped back to a compass direction');

// Self coordinates are absolute screen coordinates and legacy animal-vision state is absent.
ev(`(()=>{const a=sim.agents.find(q=>q.species.id==='red');a.x=FIELD.left;a.y=FIELD.top;sim.bunkers=[];buildInputs(a);})()`);
assert.strictEqual(ev("sim.agents.find(q=>q.species.id==='red').inputBuffer[0]"),-1);assert.strictEqual(ev("sim.agents.find(q=>q.species.id==='red').inputBuffer[1]"),-1);
assert.strictEqual(ev("'memory' in sim.agents.find(q=>q.species.id==='red')"),false);assert.strictEqual(ev("'sectorBuffer' in sim.agents.find(q=>q.species.id==='red')"),false);assert.strictEqual(ev("'memoryBuffer' in sim.agents.find(q=>q.species.id==='red')"),false);
assert.strictEqual(ev('typeof inFront'),'undefined');assert.strictEqual(ev('typeof sensorSector'),'undefined');assert.strictEqual(ev('typeof rememberVisibleBunkers'),'undefined');

console.log('BattlEvo RC6 tactical visibility + continuous aim audit passed.');
