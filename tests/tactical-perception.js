'use strict';

const fs=require('fs'),vm=require('vm'),assert=require('assert');
let seed=0x71C71C;Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
const fakeCtx=new Proxy({}, {get(t,p){if(!(p in t))t[p]=()=>{};return t[p];},set(t,p,v){t[p]=v;return true;}}),elements={game:{width:960,height:600,getContext:()=>fakeCtx},'brain-red':{value:'4'},'brain-green':{value:'10'},'brain-blue':{value:'20'}};
global.document={getElementById:id=>elements[id]||{value:'',disabled:false,textContent:''}};global.performance={now:()=>0};global.setRunningUI=()=>{};global.updateHud=()=>{};global.updateRoundResult=()=>{};global.saveExperiment=()=>{};
for(const file of ['core.js','lifetime-stats.js','target-practice.js','brain-world.js','modes.js'])vm.runInThisContext(fs.readFileSync(file,'utf8'),{filename:file});
const ev=code=>vm.runInThisContext(code),reset=mode=>ev(`selectedMode='${mode}';initSimulation();sim.bunkers=[];`);
const redAgent=()=>ev("sim.agents.find(a=>a.species.id==='red')");

assert.strictEqual(ev('INPUTS'),599);
assert.deepStrictEqual(ev('TACTICAL_SLOTS'),{bunkers:6,friends:15,enemies:32,friendlyProjectiles:12,enemyProjectiles:24});

// Target Practice: no creatures exist in perception; targets are enemies; only this individual's own shots are visible.
reset('target');
ev(`(()=>{const a=sim.agents.find(q=>q.species.id==='red'),mate=sim.agents.find(q=>q.species.id==='red'&&q!==a),green=sim.agents.find(q=>q.species.id==='green');const own={x:a.x+20,y:a.y,vx:PROJECTILE_SPEED,vy:0,owner:a,team:'red',r:2.5,dead:false},mates={x:a.x+25,y:a.y,vx:PROJECTILE_SPEED,vy:0,owner:mate,team:'red',r:2.5,dead:false},other={x:a.x+30,y:a.y,vx:PROJECTILE_SPEED,vy:0,owner:green,team:'green',r:2.5,dead:false};sim.projectiles=[own,mates,other];globalThis.__own=own;globalThis.__mates=mates;globalThis.__other=other;fillTacticalView(a);})()`);
assert.strictEqual(ev("sim.agents.find(q=>q.species.id==='red').tacticalView.friends.length"),0);
assert.strictEqual(ev("sim.agents.find(q=>q.species.id==='red').tacticalView.enemies.length"),6);
assert.strictEqual(ev("sim.agents.find(q=>q.species.id==='red').tacticalView.friendlyProjectiles.length"),1);
assert.strictEqual(ev("sim.agents.find(q=>q.species.id==='red').tacticalView.friendlyProjectiles[0]===__own"),true);
assert.strictEqual(ev("sim.agents.find(q=>q.species.id==='red').tacticalView.enemyProjectiles.length"),0);

// Facing no longer gates perception; a bunker does.
ev(`(()=>{const a=sim.agents.find(q=>q.species.id==='red'),t=sim.targets[0];a.x=400;a.y=300;a.facing=0;t.x=250;t.y=300;sim.bunkers=[];fillTacticalView(a);})()`);
assert.strictEqual(ev("sim.agents.find(q=>q.species.id==='red').tacticalView.enemies.includes(sim.targets[0])"),true,'target behind creature should be visible');
ev(`sim.bunkers=[newBunker(315,270,45,60,'BLOCK')];fillTacticalView(sim.agents.find(q=>q.species.id==='red'));`);
assert.strictEqual(ev("sim.agents.find(q=>q.species.id==='red').tacticalView.enemies.includes(sim.targets[0])"),false,'bunker should hide target');
const blockedInput=ev("buildInputs(sim.agents.find(q=>q.species.id==='red'))");assert.strictEqual(blockedInput.length,599);assert.strictEqual(blockedInput[ev('SELF_INPUTS')],1,'static bunker must remain known even while it occludes a target');

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

// Self coordinates are absolute screen coordinates and legacy animal-vision state is absent.
ev(`(()=>{const a=sim.agents.find(q=>q.species.id==='red');a.x=FIELD.left;a.y=FIELD.top;sim.bunkers=[];buildInputs(a);})()`);
assert.strictEqual(ev("sim.agents.find(q=>q.species.id==='red').inputBuffer[0]"),-1);assert.strictEqual(ev("sim.agents.find(q=>q.species.id==='red').inputBuffer[1]"),-1);
assert.strictEqual(ev("'memory' in sim.agents.find(q=>q.species.id==='red')"),false);assert.strictEqual(ev("'sectorBuffer' in sim.agents.find(q=>q.species.id==='red')"),false);assert.strictEqual(ev("'memoryBuffer' in sim.agents.find(q=>q.species.id==='red')"),false);
assert.strictEqual(ev('typeof inFront'),'undefined');assert.strictEqual(ev('typeof sensorSector'),'undefined');assert.strictEqual(ev('typeof rememberVisibleBunkers'),'undefined');

console.log('BattlEvo RC5 tactical perception audit passed.');
