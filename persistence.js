'use strict';

const SAVE_SCHEMA=4,SAVE_DB='BattlEvo',SAVE_STORE='experiments',SAVE_KEY='current';
let savedExperimentAvailable=false,persistenceWarning='',savedExperimentSnapshot=null;

function openSaveDb(){
  return new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined'){reject(new Error('IndexedDB unavailable'));return;}
    const req=indexedDB.open(SAVE_DB,1);
    req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(SAVE_STORE))db.createObjectStore(SAVE_STORE);};
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('Could not open save database'));
  });
}
function idbRequest(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function serializePopulation(pop){return pop.map(g=>({hidden:g.brain.hidden,genome:new Float32Array(g.brain.g),best:Number(g.best)||0}));}
function makeSaveSnapshot(){
  if(!sim)return null;
  // Species-state saves deliberately discard the current trial's partial evaluation.
  // The genomes and generation are preserved; continuing always starts Trial 1 on a fresh arena.
  const lifetime=cloneLifetimeStats(sim.roundLifetimeBaseline||sim.lifetime);
  return{schema:SAVE_SCHEMA,gameVersion:GAME_VERSION,inputCount:INPUTS,savedAt:Date.now(),generation:sim.generation,lifetime,lifetimeRounds:copyJson(sim.lifetimeRounds),populations:Object.fromEntries(SPECIES.map(s=>[s.id,serializePopulation(sim.populations[s.id])]))};
}
function snapshotCompatible(snapshot){
  if(!snapshot||snapshot.schema!==SAVE_SCHEMA||snapshot.inputCount!==INPUTS)return false;
  return SPECIES.every(s=>Array.isArray(snapshot.populations?.[s.id])&&snapshot.populations[s.id].length>=2&&snapshot.populations[s.id].every(row=>Number.isFinite(row.hidden)&&row.genome?.length===genomeLayout(clamp(Math.round(row.hidden),MIN_HIDDEN,MAX_HIDDEN)).count));
}
function savedBrainSizes(snapshot){return Object.fromEntries(SPECIES.map(s=>[s.id,Number(snapshot?.populations?.[s.id]?.[0]?.hidden)||null]));}
function syncBrainInputsFromSnapshot(snapshot){
  const sizes=savedBrainSizes(snapshot);
  for(const s of SPECIES){const el=document.getElementById('brain-'+s.id);if(el&&sizes[s.id])el.value=String(clamp(Math.round(sizes[s.id]),MIN_HIDDEN,MAX_HIDDEN));}
}
function syncBrainInputsFromSimulation(){
  if(!sim)return;
  for(const s of SPECIES){const el=document.getElementById('brain-'+s.id),pop=sim.populations?.[s.id];if(el&&pop?.[0])el.value=String(pop[0].brain.hidden);}
}
async function saveExperiment(){
  if(!sim)return false;
  const snapshot=makeSaveSnapshot();
  try{
    const db=await openSaveDb(),tx=db.transaction(SAVE_STORE,'readwrite');
    tx.objectStore(SAVE_STORE).put(snapshot,SAVE_KEY);
    await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
    db.close();savedExperimentAvailable=true;savedExperimentSnapshot=snapshot;persistenceWarning='';
    if(typeof setSavedExperimentUI==='function')setSavedExperimentUI(true,snapshot);
    return true;
  }
  catch(err){persistenceWarning='Saving is unavailable in this browser session.';if(typeof showNotice==='function')showNotice(persistenceWarning,'warning');return false;}
}
async function loadExperimentSnapshot(){
  try{const db=await openSaveDb(),tx=db.transaction(SAVE_STORE,'readonly'),value=await idbRequest(tx.objectStore(SAVE_STORE).get(SAVE_KEY));db.close();return value||null;}
  catch(err){persistenceWarning='Saved evolution is unavailable in this browser session.';return null;}
}
async function clearSavedExperiment(){
  try{
    const db=await openSaveDb(),tx=db.transaction(SAVE_STORE,'readwrite');tx.objectStore(SAVE_STORE).delete(SAVE_KEY);
    await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
    savedExperimentAvailable=false;savedExperimentSnapshot=null;if(typeof setSavedExperimentUI==='function')setSavedExperimentUI(false,null);return true;
  }catch(err){return false;}
}
async function continueSavedExperiment(mode=selectedMode){
  const snapshot=await loadExperimentSnapshot();if(!snapshot)return false;
  if(!snapshotCompatible(snapshot)){
    if(typeof showNotice==='function')showNotice('This saved evolution used the retired 77-input vision system and cannot be continued with the new tactical brain. Reset/start a new evolution.','error');
    return false;
  }
  try{
    restoreSimulation(snapshot,mode);syncBrainInputsFromSimulation();paused=true;savedExperimentSnapshot=snapshot;
    if(typeof syncModeButtons==='function')syncModeButtons();if(typeof updatePauseUI==='function')updatePauseUI();if(typeof updateHud==='function')updateHud();
    if(typeof showNotice==='function')showNotice(`Restored generation ${sim.generation} into ${MODE_NAMES[sim.mode]}. Trial 1/${TRIALS_PER_GENERATION} starts on a fresh arena.`,'info');
    return true;
  }
  catch(err){if(typeof showNotice==='function')showNotice('The saved evolution could not be restored.','error');return false;}
}
async function detectSavedExperiment(){
  const snapshot=await loadExperimentSnapshot();
  if(snapshot&&!snapshotCompatible(snapshot)){
    await clearSavedExperiment();
    if(typeof showNotice==='function')showNotice('RC5 replaced the old 77-input field-of-view brain. The old save cannot be meaningfully migrated, so BattlEvo is ready for a new evolution.','warning');
    return;
  }
  savedExperimentAvailable=!!snapshot;savedExperimentSnapshot=snapshot||null;
  if(snapshot)syncBrainInputsFromSnapshot(snapshot);
  if(typeof setSavedExperimentUI==='function')setSavedExperimentUI(savedExperimentAvailable,snapshot);
}

async function handleVisibility(hidden){
  if(hidden){if(sim){sim.wasRunningBeforeHide=!paused;paused=true;if(typeof updatePauseUI==='function')updatePauseUI();await saveExperiment();}}
  else{if(typeof resetFrameTiming==='function')resetFrameTiming();if(sim&&sim.wasRunningBeforeHide){sim.wasRunningBeforeHide=false;if(typeof showNotice==='function')showNotice('BattlEvo paused while it was in the background. Resume when ready.','info');}}
}
if(typeof document!=='undefined'&&typeof document.addEventListener==='function')document.addEventListener('visibilitychange',()=>handleVisibility(document.hidden));
if(typeof window!=='undefined'){
  window.addEventListener('pagehide',()=>{if(sim)saveExperiment();});
  window.addEventListener('pageshow',()=>{if(typeof resetFrameTiming==='function')resetFrameTiming();});
  window.addEventListener('load',detectSavedExperiment);
}
