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

  assert.ok((await page.textContent('#version-badge')).includes('v1.0.0-rc.1'));
  await page.fill('#brain-red','5000000');await page.fill('#brain-green','0');await page.fill('#brain-blue','20');
  await page.click('#start');await page.waitForTimeout(150);
  assert.strictEqual(await page.inputValue('#brain-red'),'64');assert.strictEqual(await page.inputValue('#brain-green'),'1');
  assert.ok(await page.evaluate(()=>document.body.classList.contains('running')));

  // On a narrow screen the 600px internal field should occupy essentially the full viewport width.
  const crop=await page.evaluate(()=>{const v=document.querySelector('.canvasViewport').getBoundingClientRect(),c=document.querySelector('#game').getBoundingClientRect();return{viewport:v.width,canvas:c.width,field:c.width*(600/960),height:v.height};});
  assert.ok(Math.abs(crop.viewport-crop.field)<3,`mobile field width ${crop.field} does not fill viewport ${crop.viewport}`);assert.ok(Math.abs(crop.viewport-crop.height)<3,'mobile field viewport is not square');

  // Queueing does not abandon the current generation; last selection wins.
  await page.click('[data-mode="battlefield"]');assert.strictEqual(await page.evaluate(()=>sim.pendingMode),'battlefield');assert.strictEqual(await page.evaluate(()=>sim.mode),'target');
  await page.click('[data-mode="invaders"]');assert.strictEqual(await page.evaluate(()=>sim.pendingMode),'invaders');
  await page.evaluate(()=>{sim.tick=MAX_TICKS[sim.mode]-1;step();});await page.waitForTimeout(50);assert.strictEqual(await page.evaluate(()=>sim.mode),'invaders');

  // Pause remains accessible in the running mobile bar.
  const mobilePause=page.locator('.mobileRunBar [data-pause]');assert.ok(await mobilePause.isVisible());await mobilePause.click();assert.strictEqual(await page.evaluate(()=>paused),true);assert.ok(await page.locator('#pause-overlay').isVisible());await mobilePause.click();assert.strictEqual(await page.evaluate(()=>paused),false);

  // A generation-safe IndexedDB checkpoint survives reload and restores paused.
  await page.evaluate(()=>saveExperiment());await page.waitForTimeout(100);await page.reload({waitUntil:'load'});await page.waitForTimeout(150);assert.ok(await page.locator('#continue').isVisible(),'Continue button missing after reload');await page.click('#continue');await page.waitForTimeout(100);assert.strictEqual(await page.evaluate(()=>paused),true);assert.ok(await page.locator('#pause-overlay').isVisible());

  // Background handling must pause and must not catch up hidden time on return.
  await page.evaluate(()=>{paused=false;resetFrameTiming();});await page.evaluate(()=>handleVisibility(true));assert.strictEqual(await page.evaluate(()=>paused),true);await page.evaluate(()=>handleVisibility(false));assert.strictEqual(await page.evaluate(()=>paused),true);

  // Touch targets and landscape layout.
  const buttonHeights=await page.evaluate(()=>[...document.querySelectorAll('.modes button,input[type=number]')].map(e=>e.getBoundingClientRect().height));assert.ok(buttonHeights.every(h=>h>=40),'mobile interactive control below practical touch size');
  await page.setViewportSize({width:844,height:390});await page.waitForTimeout(100);const landscape=await page.evaluate(()=>({w:document.querySelector('.canvasViewport').getBoundingClientRect().width,h:document.querySelector('.canvasViewport').getBoundingClientRect().height,bar:getComputedStyle(document.querySelector('.mobileRunBar')).display}));assert.ok(landscape.w>landscape.h,'landscape layout did not expand horizontally');assert.notStrictEqual(landscape.bar,'none');

  await page.screenshot({path:'battlevo-webkit-landscape.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'battlevo-webkit-phone.png',fullPage:true});
  assert.deepStrictEqual(errors,[],`WebKit page errors: ${errors.join('\n')}`);
  await browser.close();console.log('BattlEvo WebKit interaction audit passed.');
})().catch(err=>{console.error(err);process.exit(1);});
