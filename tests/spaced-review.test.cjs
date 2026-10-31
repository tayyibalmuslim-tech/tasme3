const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'), vm=require('node:vm');
const source=fs.readFileSync('index.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\(function init\(\)\{[\s\S]*?\}\)\(\);/,'');
function app(){
  const storage=new Map();
  const nodes=new Proxy({}, {get:(t,id)=>t[id]||(t[id]={addEventListener(){},close(){},style:{},value:'',checked:false})});
  const ctx=vm.createContext({console:{error(){}},Date,Math,Intl,Set,Map,JSON,Object,Number,String,Array,crypto:{randomUUID:()=>require('node:crypto').randomUUID()},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},document:{getElementById:id=>nodes[id],addEventListener(){}},window:{addEventListener(){}},alert(){},confirm:()=>true,setInterval,clearInterval});
  vm.runInContext(source,ctx);
  vm.runInContext('render=()=>{}; state={people:[{id:"p",name:"test"}],assignments:[]}; localSnapshot=cloneData(state);',ctx);
  return {run:code=>vm.runInContext(code,ctx),json:code=>JSON.parse(JSON.stringify(vm.runInContext(code,ctx))),nodes,ctx};
}
function fixture(a,patch={}){a.run(`state.assignments=[${JSON.stringify({id:'a',personId:'p',assignType:'review',repeatDays:10,date:'2026-01-01',weekStart:'2025-12-27',status:'pending',surah:0,fromAyah:1,toAyah:7,...patch})}]; localSnapshot=cloneData(state);`);}
for(const [rating,days] of [['hard',12],['medium',20],['easy',30],['reset',1]]) test(`10-day review ${rating} -> ${days}`,()=>{
 const a=app();fixture(a);a.run(`toggleRating('a');rateAssignment('a','${rating}')`);
 assert.equal(a.run('state.assignments[1].intervalDays'),days);
 assert.equal(a.run('state.assignments[1].date'),a.run(`addDaysStr(toStr(new Date()),${days})`));
 assert.equal(a.run('state.assignments[0].successful'),rating!=='reset');
 assert.equal(a.run('state.assignments[0].attempted'),true);
});
test('new memorization first review is one day; subsequent review multiplies',()=>{
 const a=app();fixture(a,{assignType:'new',scheduleMode:'auto',repeatDays:30});a.run("toggleRating('a');rateAssignment('a','easy')");assert.equal(a.run('state.assignments[1].intervalDays'),1);
 a.run("toggleRating('review-a');rateAssignment('review-a','easy')");assert.equal(a.run('state.assignments[2].intervalDays'),3);
});
test('reset 30 -> 1, hard 1 -> 1',()=>{const a=app();fixture(a,{repeatDays:30});a.run("toggleRating('a');rateAssignment('a','reset')");assert.equal(a.run('state.assignments[1].intervalDays'),1);a.run("toggleRating('review-a');rateAssignment('review-a','hard')");assert.equal(a.run('state.assignments[2].intervalDays'),1);});
test('absent postpones from actual today, retains interval and makes no attempt',()=>{
 const a=app();fixture(a);a.run("markAbsent('a')");assert.equal(a.run('state.assignments[1].intervalDays'),10);assert.equal(a.run('state.assignments[1].date'),a.run('addDaysStr(toStr(new Date()),1)'));assert.equal(a.run('state.assignments[0].attempted'),false);assert.equal(a.run('state.assignments[0].rating'),null);
 a.run("toggleRating('review-a');rateAssignment('review-a','medium')");assert.equal(a.run('state.assignments[2].intervalDays'),20);
});
test('picker cancellation and duplicate clicks have no extra writes or reviews',()=>{
 const a=app();fixture(a);const before=a.json('state');a.run("toggleRating('a');cancelRating()");assert.deepEqual(a.json('state'),before);
 a.run("toggleRating('a');rateAssignment('a','easy');rateAssignment('a','easy');spawnRepeat(state.assignments[0])");assert.equal(a.run('state.assignments.length'),2);
});
test('undo removes only pending review; re-rating uses incoming interval',()=>{
 const a=app();fixture(a);a.run("toggleRating('a');rateAssignment('a','easy');undoRecitation('a')");assert.equal(a.run('state.assignments.length'),1);assert.equal(a.run('getStatus(state.assignments[0])'),'pending');assert.equal(a.run('state.assignments[0].learningHistory.length'),2);
 a.run("toggleRating('a');rateAssignment('a','medium')");assert.equal(a.run('state.assignments[1].intervalDays'),20);
});
test('undo and edits preserve completed descendants and their pending successor',()=>{
 const a=app();fixture(a);a.run("toggleRating('a');rateAssignment('a','medium');toggleRating('review-a');rateAssignment('review-a','easy');undoRecitation('a')");assert.equal(a.run('state.assignments.length'),3);assert.equal(a.run('getStatus(state.assignments[1])'),'done');
 a.run("opUpdateAssignment('review-review-a',{date:'2027-01-01',weekStart:'2026-12-26'})");assert.equal(a.run('state.assignments[2].date'),'2027-01-01');assert.equal(a.run('state.assignments[1].rating'),'easy');
});
test('old data remains byte-identical when loaded; non-repeating stays non-repeating',()=>{
 const a=app();fixture(a,{repeatDays:0,done:true,status:undefined});const before=a.json('state');a.run("saveLocal();loadLocal()");assert.deepEqual(a.json('state'),before);a.run("toggleRating('a');rateAssignment('a','easy')");assert.equal(a.run('state.assignments.length'),1);
});
test('existing legacy pending child is reused and legacy interval is starting point',()=>{
 const a=app();fixture(a);a.run("state.assignments[0].spawnedId='legacy';state.assignments.push({...state.assignments[0],id:'legacy',parentId:'a',autoGen:true,spawnedId:null});toggleRating('a');rateAssignment('a','hard')");assert.equal(a.run('state.assignments.length'),2);assert.equal(a.run('state.assignments[1].id'),'legacy');assert.equal(a.run('state.assignments[1].intervalDays'),12);
});
test('stale open picker cannot overwrite incoming synchronized rating',()=>{
 const a=app();fixture(a);a.run("toggleRating('a');state.assignments[0].updatedAt=123;rateAssignment('a','easy')");assert.equal(a.run('state.assignments.length'),1);assert.equal(a.run('getStatus(state.assignments[0])'),'pending');
});
test('merge combines independent device changes and protects completed child against stale undo',()=>{
 const a=app();fixture(a);a.run("remote={people:state.people,assignments:[{id:'x',status:'done',updatedAt:5}]};merged=mergeChanges(remote,{people:{},assignments:{a:state.assignments[0]}})");assert.equal(a.run('merged.assignments.length'),2);
 a.run("merged=mergeChanges(remote,{people:{},assignments:{x:{__deleted:true,preserveCompleted:true}}})");assert.equal(a.run('merged.assignments.length'),1);
});
test('transactions synchronize two devices, deterministic child and offline pending survive reload',async()=>{
 const a=app(),b=app();fixture(a);fixture(b);
 let remote=a.json('state'),tail=Promise.resolve();
 function connect(client){client.ctx.fakeDB={collection:()=>({doc:()=>({get:async()=>({exists:true,data:()=>remote})})}),runTransaction:fn=>{const p=tail.then(()=>fn({get:async()=>({exists:true,data:()=>remote}),set:(ref,value)=>{remote=JSON.parse(JSON.stringify(value));}}));tail=p.catch(()=>{});return p;}};client.run("db=fakeDB;syncCode='TEST';localStorage.setItem('tasmee-sync-code','TEST')");}
 connect(a);connect(b);
 a.run("toggleRating('a');rateAssignment('a','medium')");await tail;await new Promise(r=>setImmediate(r));await b.run('syncTick()');assert.deepEqual(a.json('state'),b.json('state'));assert.equal(remote.assignments.length,2);
 a.run("db=null;toggleRating('review-a');rateAssignment('review-a','easy');loadLocal()");assert.equal(a.run('hasDirty()'),true);connect(a);await a.run('pushToFirebase()');await b.run('syncTick()');assert.deepEqual(a.json('state'),b.json('state'));assert.equal(remote.assignments.length,3);
 // Two offline devices rating the same pending task still write exactly one child.
 a.run('db=null');b.run('db=null');a.run("toggleRating('review-review-a');rateAssignment('review-review-a','hard')");b.run("toggleRating('review-review-a');rateAssignment('review-review-a','easy')");connect(a);connect(b);await Promise.all([a.run('pushToFirebase()'),b.run('pushToFirebase()')]);await a.run('syncTick()');assert.equal(remote.assignments.length,4);assert.deepEqual(a.json('state'),b.json('state'));
});
test('stale parent update cannot replace the winning pending successor interval',()=>{
 const a=app();a.run(`remote={people:[],assignments:[{id:'a',status:'done',updatedAt:200,rating:'easy'},{id:'review-a',parentId:'a',autoGen:true,status:'pending',intervalDays:30,updatedAt:205}]}; merged=mergeChanges(remote,{people:{},assignments:{a:{id:'a',status:'done',updatedAt:100,rating:'hard'},'review-a':{id:'review-a',parentId:'a',autoGen:true,status:'pending',intervalDays:12,updatedAt:300}}})`);assert.equal(a.run('merged.assignments[1].intervalDays'),30);
});
