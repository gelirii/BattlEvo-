'use strict';

const fs=require('fs'),vm=require('vm'),assert=require('assert');let seed=0x51A7B04D;Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
const fakeCtx=new Proxy({}, {get(t,p){if(!(p in t))t[p]=()=>{};return t[p];},set(t,p,v){t[p]=v;return true;}}),elements={game:{width:960,height:600,getContext:()=>fakeCtx},'brain-red':{value:'4'},'brain-green':{value:'10'},'brain-blue':{value:'20'}};
global.document={getElementById:id=>elements[id]||{value:'',disabled:false,textContent:'',classList:{toggle(){},remove(){}}}};global.performance={now:()=>0};global.setRunningUI=()=>{};global.updateHud=()=>{};global.updateRoundResult=()=>{};global.saveExperiment=()=>{};
for(const file of ['core.js','lifetime-stats.js','target-practice.js','brain-world.js','modes.js'])vm.runInThisContext(fs.readFileSync(file,'utf8'),{filename:file});const ev=code=>vm.runInThisContext(code);
ev("selectedMode='target';initSimulation();");assert.strictEqual(ev('sim.lifetime.target.red.hits'),0);
ev(`(()=>{const a=sim.agents.find(x=>x.species.id==='red'),t=sim.targets[0];sim.bunkers=[];sim.projectiles=[{x:t.x-PROJECTILE_SPEED,y:t.y,vx:PROJECTILE_SPEED,vy:0,owner:a,team:'red',r:2.5,dead:false}];stepProjectiles();})()`);assert.strictEqual(ev('sim.lifetime.target.red.hits'),1);
ev("sim.mode='battlefield';setupGeneration();");assert.strictEqual(ev('sim.lifetime.target.red.hits'),1);
ev(`(()=>{sim.orientation=0;sim.arrows=[];sim.bunkers=[];const a=sim.agents.find(x=>x.species.id==='green');a.alive=true;a.finished=false;a.y=FIELD.top+15;sim.tick=1;stepBattlefield();})()`);assert.strictEqual(ev('sim.lifetime.battlefield.green.crosses'),1);
ev("sim.mode='invaders';setupGeneration();");ev(`(()=>{const n=sim.invaders[0],a=sim.agents.find(x=>x.species.id==='blue');sim.bunkers=[];n.x=FIELD.cx;n.y=FIELD.cy;sim.projectiles=[{x:n.x-PROJECTILE_SPEED,y:n.y,vx:PROJECTILE_SPEED,vy:0,owner:a,team:'blue',r:2.5,dead:false}];stepProjectiles();})()`);assert.strictEqual(ev('sim.lifetime.invaders.blue.kills'),1);
ev("sim.mode='royale';setupGeneration();");ev(`(()=>{const red=sim.agents.find(x=>x.species.id==='red'),green=sim.agents.find(x=>x.species.id==='green');sim.bunkers=[];red.x=300;red.y=300;green.x=330;green.y=300;green.health=.5;sim.projectiles=[{x:green.x-PROJECTILE_SPEED,y:green.y,vx:PROJECTILE_SPEED,vy:0,owner:red,team:'red',r:2.5,dead:false}];stepProjectiles();})()`);assert.strictEqual(ev('sim.lifetime.royale.red.kills'),1);assert.strictEqual(ev('sim.lifetime.royale.green.deaths'),1);
let metric=ev("lifetimeMetric('royale','red')");assert.ok(metric.value.startsWith('∞ · 1K / 0D'));assert.strictEqual(metric.eligible,false);assert.strictEqual(metric.provisional,true);
ev("for(let i=0;i<9;i++)lifetimeAdd('royale','red','deaths');");metric=ev("lifetimeMetric('royale','red')");assert.strictEqual(metric.eligible,true);assert.ok(metric.value.includes('1K / 9D'));
assert.deepStrictEqual(ev(`({h:sim.lifetime.target.red.hits,c:sim.lifetime.battlefield.green.crosses,i:sim.lifetime.invaders.blue.kills,rk:sim.lifetime.royale.red.kills,rd:sim.lifetime.royale.red.deaths})`),{h:1,c:1,i:1,rk:1,rd:9});
console.log('BattlEvo lifetime scoreboard audit passed.');
