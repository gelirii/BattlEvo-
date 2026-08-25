'use strict';

const assert=require('assert');
const {webkit}=require('playwright');

(async()=>{
  const browser=await webkit.launch();
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('http://127.0.0.1:8000/',{waitUntil:'load'});
  await page.evaluate(()=>clearSavedExperiment());

  assert.ok((await page.textContent('#version-badge')).includes('v1.0.0-rc.6'));
  await page.fill('#brain-red','5000000');await page.fill('#brain-green','0');await page.fill('#brain-blue','20');
  await page.click('#start');await page.waitForTimeout(150);
  assert.strictEqual(await page.inputValue('#brain-red'),'64');assert.strictEqual(await page.inputValue('#brain-green'),'1');
  assert.ok(await page.evaluate(()=>document.body.classList.contains('running')));
  assert.strictEqual(await page.evaluate(()=>sim.agents.length),48,'RC6 did not start 16 creatures/species');
  assert.strictEqual(await page.evaluate(()=>INPUTS),599);assert.strictEqual(await page.evaluate(()=>sim.agents[0].inputBuffer.length),599);
  assert.strictEqual(await page.evaluate(()=>typeof inFront),'undefined');assert.strictEqual(await page.evaluate(()=>typeof rememberVisibleBunkers),'undefined');assert.strictEqual(await page.evaluate(()=>typeof aimVectorFromOutputs),'function');
  const aimAngle=await page.evaluate(()=>{const o=new Float32Array(18);o.fill(-12);o[9]=0;o[10]=0;const a=aimVectorFromOutputs(o);return Math.atan2(a.y,a.x);});assert.ok(Math.abs(aimAngle-Math.PI/8)<.002,'continuous aiming regressed in WebKit');
  assert.strictEqual((await page.textContent('#hud-pop')).trim(),'16 × 3');
  assert.ok((await page.textContent('#hud-gen')).includes('T1/4'));
  assert.strictEqual(await page.evaluate(()=>TRIALS_PER_GENERATION),4);assert.strictEqual(await page.evaluate(()=>MAX_TICKS.royale),3600);
  assert.ok(await page.evaluate(()=>sim.agents.every(a=>sim.bunkers.every(b=>!rectCircleHit(b,a,AGENT_R+10)))),'initial arena contains a spawn/cover collision');

  const crop=await page.evaluate(()=>{const v=document.querySelector('.canvasViewport').getBoundingClientRect(),c=document.querySelector('#game').getBoundingClientRect();return{viewport:v.width,canvas:c.width,field:c.width*(600/960),height:v.height};});
  assert.ok(Math.abs(crop.viewport-crop.field)<3,`mobile field width ${crop.field} does not fill viewport ${crop.viewport}`);assert.ok(Math.abs(crop.viewport-crop.height)<3,'mobile field viewport is not square');

  // Scenario changes wait until all four evaluation trials complete.
  await page.click('[data-mode="invaders"]');assert.strictEqual(await page.evaluate(()=>sim.pendingMode),'invaders');assert.strictEqual(await page.evaluate(()=>sim.mode),'target');
  for(let trial=2;trial<=4;trial++){
    await page.evaluate(()=>{sim.tick=MAX_TICKS[sim.mode]-1;step();});await page.waitForTimeout(20);
    assert.strictEqual(await page.evaluate(()=>sim.mode),'target');assert.strictEqual(await page.evaluate(()=>sim.trial),trial);
  }
  await page.evaluate(()=>{sim.tick=MAX_TICKS[sim.mode]-1;step();});await page.waitForTimeout(30);assert.strictEqual(await page.evaluate(()=>sim.mode),'invaders');assert.strictEqual(await page.evaluate(()=>sim.generation),2);assert.strictEqual(await page.evaluate(()=>sim.trial),1);
  assert.ok(await page.evaluate(()=>sim.agents.every(a=>sim.bunkers.every(b=>!rectCircleHit(b,a,AGENT_R+10)))),'Invaders contains a spawn/cover collision');

  // PAUSED must appear only while actually paused and disappear immediately on resume.
  const mobilePause=page.locator('.mobileRunBar [data-pause]');assert.ok(await mobilePause.isVisible());assert.strictEqual(await page.locator('#pause-overlay').isVisible(),false,'PAUSED overlay visible while game is running');
  await mobilePause.click();assert.strictEqual(await page.evaluate(()=>paused),true);assert.ok(await page.locator('#pause-overlay').isVisible());
  await mobilePause.click();assert.strictEqual(await page.evaluate(()=>paused),false);await page.waitForTimeout(50);assert.strictEqual(await page.locator('#pause-overlay').isVisible(),false,'PAUSED overlay remained visible after resume');
  const beforeTick=await page.evaluate(()=>sim.tick);await page.waitForTimeout(120);assert.ok((await page.evaluate(()=>sim.tick))>beforeTick,'simulation did not advance after resume');

  // Manual Save pauses and stores species/generation state, not the current battle.
  await page.evaluate(()=>{sim.generation=200;sim.trial=3;});
  const mobileSave=page.locator('.mobileRunBar [data-save]');assert.ok(await mobileSave.isVisible());await mobileSave.click();await page.waitForTimeout(150);
  assert.strictEqual(await page.evaluate(()=>paused),true,'Save did not pause the simulation');assert.ok(await page.locator('#pause-overlay').isVisible());

  await page.reload({waitUntil:'load'});await page.waitForTimeout(180);
  assert.ok(await page.locator('#continue').isVisible(),'Continue button missing after reload');assert.ok((await page.textContent('#continue')).includes('200'),'saved generation not shown on Continue button');
  assert.strictEqual(await page.locator('#start').isVisible(),false,'Start New Evolution should be hidden while a save exists');
  assert.strictEqual(await page.isDisabled('#brain-red'),true);assert.strictEqual(await page.isDisabled('#brain-green'),true);assert.strictEqual(await page.isDisabled('#brain-blue'),true);
  assert.strictEqual(await page.isDisabled('#reset'),false,'Reset must remain available for deliberately returning to Gen 0');
  assert.strictEqual(await page.inputValue('#brain-red'),'64');assert.strictEqual(await page.inputValue('#brain-green'),'1');assert.strictEqual(await page.inputValue('#brain-blue'),'20');

  // Choose a different game before restoring the saved species.
  await page.click('[data-mode="battlefield"]');assert.strictEqual(await page.evaluate(()=>selectedMode),'battlefield');
  await page.click('#continue');await page.waitForTimeout(120);
  assert.strictEqual(await page.evaluate(()=>sim.generation),200);assert.strictEqual(await page.evaluate(()=>sim.trial),1);assert.strictEqual(await page.evaluate(()=>sim.mode),'battlefield');assert.strictEqual(await page.evaluate(()=>paused),true);assert.ok(await page.locator('#pause-overlay').isVisible());assert.strictEqual(await page.evaluate(()=>sim.populations.red.length),16);
  assert.ok(await page.evaluate(()=>sim.agents.every(a=>sim.bunkers.every(b=>!rectCircleHit(b,a,AGENT_R+10)))),'restored Battlefield contains a spawn/cover collision');

  await page.evaluate(()=>{paused=false;updatePauseUI();resetFrameTiming();});assert.strictEqual(await page.locator('#pause-overlay').isVisible(),false);await page.evaluate(()=>handleVisibility(true));assert.strictEqual(await page.evaluate(()=>paused),true);assert.ok(await page.locator('#pause-overlay').isVisible());await page.evaluate(()=>handleVisibility(false));assert.strictEqual(await page.evaluate(()=>paused),true);

  const buttonHeights=await page.evaluate(()=>[...document.querySelectorAll('.modes button,input[type=number],[data-save]')].map(e=>e.getBoundingClientRect().height).filter(Boolean));assert.ok(buttonHeights.every(h=>h>=40),'mobile interactive control below practical touch size');
  await page.setViewportSize({width:844,height:390});await page.waitForTimeout(100);const landscape=await page.evaluate(()=>({w:document.querySelector('.canvasViewport').getBoundingClientRect().width,h:document.querySelector('.canvasViewport').getBoundingClientRect().height,bar:getComputedStyle(document.querySelector('.mobileRunBar')).display}));assert.ok(landscape.w>landscape.h,'landscape layout did not expand horizontally');assert.notStrictEqual(landscape.bar,'none');

  await page.screenshot({path:'battlevo-webkit-landscape.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'battlevo-webkit-phone.png',fullPage:true});
  assert.deepStrictEqual(errors,[],`WebKit page errors: ${errors.join('\n')}`);
  await browser.close();console.log('BattlEvo RC6 WebKit interaction audit passed.');
})().catch(err=>{console.error(err);process.exit(1);});