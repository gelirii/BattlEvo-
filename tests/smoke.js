'use strict';

const fs=require('fs'),vm=require('vm'),assert=require('assert');
let seed=0xB4771E0;Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/0x100000000;};
const fakeCtx=new Proxy({}, {get(t,p){if(!(p in t))t[p]=()=>{};return t[p];},set(t,p,v){t[p]=v;return true;}});
const elements={game:{width:960,height:600,getContext:()=>fakeCtx},'brain-red':{value:'4'},'brain-green':{value:'10'},'brain-blue':{value:'20'}};
global.document={getElementById:id=>elements[id]||{value:'',disabled:false,textContent:'',classList:{toggle(){},remove(){}}}};global.performance={now:()=>0};global.setRunningUI=()=>{};global.updateHud=()=>{};global.updateRoundResult=()=>{};global.saveExperiment=()=>{};
for(const file of ['core.js','lifetime-stats.js','target-practice.js','brain-world.js','modes.js'])vm.runInThisContext(fs.readFileSync(file,'utf8'),{filename:file});
const ev=code=>vm.runInThisContext(code),init=mode=>ev(`selectedMode='${mode}';initSimulation();`);

assert.strictEqual(ev('GAME_VERSION'),'v1.0.0-rc.5');assert.strictEqual(ev('INPUTS'),599);assert.strictEqual(ev('OUTPUTS'),18);assert.strictEqual(ev('MIN_HIDDEN'),1);assert.strictEqual(ev('MAX_HIDDEN'),64);assert.strictEqual(ev('POP_SIZE'),16);assert.strictEqual(ev('TRIALS_PER_GENERATION'),4);assert.strictEqual(ev('MAX_TICKS.royale'),3600);assert.strictEqual(ev('FIELD.size'),ev('H'));assert.ok(ev('PROJECTILE_SPEED>AGENT_SPEED'));
assert.deepStrictEqual(ev('TACTICAL_SLOTS'),{bunkers:6,friends:15,enemies:32,friendlyProjectiles:12,enemyProjectiles:24});

const expectedCover={target:3,battlefield:4,invaders:3,royale:6};
for(const mode of ['target','battlefield','invaders','royale']){
  init(mode);assert.strictEqual(ev('sim.agents.length'),48,`${mode}: expected 48 creatures`);assert.strictEqual(ev('sim.bunkers.length'),expectedCover[mode],`${mode}: unexpected bunker count`);assert.strictEqual(ev('buildInputs(sim.agents[0]).length'),599,`${mode}: sensory vector mismatch`);assert.ok(ev('sim.agents.every(a=>inArenaPoint(a))'),`${mode}: spawn outside field`);assert.ok(ev('sim.agents.every(a=>sim.bunkers.every(b=>!rectCircleHit(b,a,AGENT_R+10)))'),`${mode}: spawn too close to cover`);
  for(let i=0;i<180;i++)ev('step();');assert.ok(ev('sim&&sim.generation>=1'),`${mode}: runtime stopped`);
}

assert.ok(!/function\s+setupTarget\s*\(/.test(fs.readFileSync('core.js','utf8')),'core.js contains an obsolete duplicate setupTarget');
assert.ok(!/function\s+stepTargets\s*\(/.test(fs.readFileSync('modes.js','utf8')),'modes.js contains an obsolete duplicate stepTargets');
for(const retired of ['inFront','rememberVisibleBunkers','sensorSector','relativeVelocity','proximity'])assert.ok(!new RegExp(`function\\s+${retired}\\s*\\(`).test(fs.readFileSync('brain-world.js','utf8')),`brain-world.js still contains retired ${retired} vision code`);
init('target');assert.strictEqual(ev('sim.bunkers.length'),3);assert.strictEqual(ev('sim.targets.length'),6);

const starts=ev(`Object.fromEntries(SPECIES.map(s=>[s.id,sim.agents.filter(a=>a.species.id===s.id).map(a=>[+a.x.toFixed(4),+a.y.toFixed(4),a.facing]).sort((a,b)=>a[0]-b[0]||a[1]-b[1])]))`);
assert.deepStrictEqual(starts.red,starts.green,'Red/Green Target starts are not matched');assert.deepStrictEqual(starts.red,starts.blue,'Red/Blue Target starts are not matched');

elements['brain-red'].value='5000000';elements['brain-green'].value='0';elements['brain-blue'].value='-9';init('target');
assert.strictEqual(ev('sim.populations.red[0].brain.hidden'),64);assert.strictEqual(ev('sim.populations.green[0].brain.hidden'),1);assert.strictEqual(ev('sim.populations.blue[0].brain.hidden'),1);

elements['brain-red'].value=elements['brain-green'].value=elements['brain-blue'].value='2';
for(const mode of ['target','battlefield','invaders','royale']){
  init(mode);let guard=0;while(ev('sim.generation')===1&&guard<16000){ev('step();');guard++;}
  assert.strictEqual(ev('sim.generation'),2,`${mode}: generation did not finish after four trials`);assert.strictEqual(ev('sim.trial'),1,`${mode}: next generation did not reset to trial 1`);assert.ok(ev('sim.lastSummary.length')>5,`${mode}: missing summary`);assert.strictEqual(ev(`sim.lifetimeRounds.${mode}`),4,`${mode}: expected four counted rounds per generation`);
}

const html=fs.readFileSync('index.html','utf8'),css=fs.readFileSync('style.css','utf8');
assert.ok(/minimum-scale=0\.5/.test(html)&&/maximum-scale=5/.test(html)&&/user-scalable=yes/.test(html),'phone pinch zoom contract changed');
assert.ok(/touch-action:auto/.test(css),'canvas must retain native Safari gestures');assert.ok(/safe-area-inset-left/.test(css)&&/safe-area-inset-bottom/.test(css),'safe-area padding missing');
assert.ok(/\.canvasViewport\{aspect-ratio:1\}/.test(css.replace(/\s/g,''))||/\.canvasViewport\{aspect-ratio:1/.test(css.replace(/\s/g,'')),'mobile square battlefield crop missing');
assert.ok(/pauseOverlay\[hidden\]\{display:none!important\}/.test(html.replace(/\s/g,'')),'PAUSED overlay hidden-state CSS regression');
assert.ok((html.match(/data-save/g)||[]).length>=2,'desktop/mobile save controls missing');
assert.ok(/599-input tactical screen state/.test(html),'RC5 tactical brain explanation missing');
assert.ok(fs.existsSync('.nojekyll'));
console.log('BattlEvo RC5 production smoke test passed.');