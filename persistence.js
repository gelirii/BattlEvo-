'use strict';

const SAVE_SCHEMA=1,SAVE_DB='BattlEvo',SAVE_STORE='experiments',SAVE_KEY='current';
let savedExperimentAvailable=false,persistenceWarning='';

function openSaveDb(){
  return new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined'){reject(new Error('IndexedDB unavailable'));return;}
    const req=indexedDB.open(SAVE_DB,1);
    req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(SAVE_STORE))db.createObjectStore(SAVE_STORE);};
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('Could not open save database'));
  });
}
function idbRequest(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function serializePopulation(pop){return pop.map(g=>({hidden:g.brain.hidden,genome:Array.from(g.brain.g),best:Number(g.best)||0}));}
function makeSaveSnapshot(){
  if(!sim)return null;
  const lifetime=cloneLifetimeStats(sim.roundLifetimeBaseline||sim.lifetime);
  return{schema:SAVE_SCHEMA,gameVersion:GAME_VERSION,savedAt:Date.now(),mode:sim.mode,generation:sim.generation,lifetime,lifetimeRounds:copyJson(sim.lifetimeRounds),bestEver:copyJson(sim.bestEver),populations:Object.fromEntries(SPECIES.map(s=>[s.id,serializePopulation(sim.populations[s.id])]))};
}
async function saveExperiment(){
  if(!sim)return false;
  try{const db=await openSaveDb(),tx=db.transaction(SAVE_STORE,'readwrite');tx.objectStore(SAVE_STORE).put(makeSaveSnapshot(),SAVE_KEY);await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});db.close();savedExperimentAvailable=true;persistenceWarning='';if(typeof setSavedExperimentUI==='function')setSavedExperimentUI(true);return true;}
  catch(err){persistenceWarning='Automatic saving is unavailable in this browser session.';if(typeof showNotice==='function')showNotice(persistenceWarning,'warning');return false;}
}
async function loadExperimentSnapshot(){try{const db=await openSaveDb(),tx=db.transaction(SAVE_STORE,'readonly'),value=await idbRequest(tx.objectStore(SAVE_STORE).get(SAVE_KEY));db.close();return value||null;}catch(err){persistenceWarning='Saved experiments are unavailable in this browser session.';return null;}}
async function clearSavedExperiment(){try{const db=await openSaveDb(),tx=db.transaction(SAVE_STORE,'readwrite');tx.objectStore(SAVE_STORE).delete(SAVE_KEY);await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();savedExperimentAvailable=false;if(typeof setSavedExperimentUI==='function')setSavedExperimentUI(false);return true;}catch(err){return false;}}
async function continueSavedExperiment(){
  const snapshot=await loadExperimentSnapshot();if(!snapshot)return false;
  try{restoreSimulation(snapshot);paused=true;if(typeof syncModeButtons==='function')syncModeButtons();if(typeof updatePauseUI==='function')updatePauseUI();if(typeof updateHud==='function')updateHud();if(typeof showNotice==='function')showNotice(`Restored generation ${sim.generation}. The current round restarts from its saved checkpoint.`,'info');return true;}
  catch(err){if(typeof showNotice==='function')showNotice('The saved experiment could not be restored.','error');return false;}
}
async function detectSavedExperiment(){const snapshot=await loadExperimentSnapshot();savedExperimentAvailable=!!snapshot;if(typeof setSavedExperimentUI==='function')setSavedExperimentUI(savedExperimentAvailable);}

async function handleVisibility(hidden){
  if(hidden){
    if(sim){sim.wasRunningBeforeHide=!paused;paused=true;if(typeof updatePauseUI==='function')updatePauseUI();await saveExperiment();}
  }else{
    if(typeof resetFrameTiming==='function')resetFrameTiming();
    if(sim&&sim.wasRunningBeforeHide){sim.wasRunningBeforeHide=false;if(typeof showNotice==='function')showNotice('BattlEvo paused while it was in the background. Resume when ready.','info');}
  }
}
if(typeof document!=='undefined')document.addEventListener('visibilitychange',()=>handleVisibility(document.hidden));
if(typeof window!=='undefined'){
  window.addEventListener('pagehide',()=>{if(sim)saveExperiment();});
  window.addEventListener('pageshow',()=>{if(typeof resetFrameTiming==='function')resetFrameTiming();});
  window.addEventListener('load',detectSavedExperiment);
}
