// Optional UI integration checks: npm install --no-save playwright
// TASME3_BROWSER_EXECUTABLE=/path/to/chromium node --test tests/browser.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http');
const executablePath=process.env.TASME3_BROWSER_EXECUTABLE;
for(const viewport of [{width:1366,height:900},{width:390,height:844}]) test(`RTL UI at ${viewport.width}px: rating, cancellation, undo, bulk edit, manual date`,{skip:!executablePath},async()=>{
 const {chromium}=require('playwright');
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync('index.html'));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--single-process','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 let page;
 try{
  page=await browser.newPage({viewport});page.setDefaultTimeout(5000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route('https://**/*',route=>route.fulfill({body:'',contentType:'application/javascript'}));
  await page.addInitScript(()=>{
   const date=new Date(),ds=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');date.setDate(date.getDate()-(date.getDay()+1)%7);
   const ws=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
   localStorage.setItem('tasmee-intro-done','1');localStorage.setItem('tasmee-data',JSON.stringify({people:[{id:'p',name:'شخص تجريبي'}],assignments:[{id:'a',personId:'p',assignType:'review',repeatDays:10,surah:0,fromAyah:1,toAyah:7,date:ds,weekStart:ws,status:'pending'}]}));
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  assert.equal(await page.locator('.rating-picker').count(),0);
  const before=await page.evaluate(()=>localStorage.getItem('tasmee-data'));
  await page.getByRole('button',{name:'تقييم التسميع',exact:true}).click();
  assert.equal(await page.locator('.rating-picker button').count(),5);
  assert.match(await page.locator('.rating-hard').textContent(),/12/);assert.match(await page.locator('.rating-medium').textContent(),/20/);assert.match(await page.locator('.rating-easy').textContent(),/30/);
  const tops=await page.locator('.rating-picker button').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().top));assert.ok(Math.max(...tops)-Math.min(...tops)<2,'ratings in one horizontal row');
  await page.getByRole('button',{name:'إلغاء التقييم',exact:true}).click();assert.equal(await page.evaluate(()=>localStorage.getItem('tasmee-data')),before);
  await page.getByRole('button',{name:'تقييم التسميع',exact:true}).click();await page.locator('.rating-hard').click();
  let data=await page.evaluate(()=>JSON.parse(localStorage.getItem('tasmee-data')));assert.equal(data.assignments.length,2);assert.equal(data.assignments[1].intervalDays,12);
  await page.getByRole('button',{name:'التراجع عن الحالة',exact:true}).click();
  data=await page.evaluate(()=>JSON.parse(localStorage.getItem('tasmee-data')));assert.equal(data.assignments.length,1);
  await page.getByRole('button',{name:'لم أفعلها',exact:true}).click();data=await page.evaluate(()=>JSON.parse(localStorage.getItem('tasmee-data')));assert.equal(data.assignments[1].intervalDays,10);assert.equal(data.assignments[0].attempted,false);
  await page.getByText('شخص تجريبي',{exact:true}).click();await page.getByRole('button',{name:'تقييم التسميع',exact:true}).first().click();assert.equal(await page.locator('.rating-picker').count(),1);
  await page.getByRole('button',{name:'إلغاء التقييم',exact:true}).click();
  // Date outside current week remains editable and never deletes history.
  await page.locator('.assign-item').filter({hasText:'إعادة بعد عدم التسميع'}).getByRole('button',{name:'✎ تعديل',exact:true}).click();await page.locator('#aDay').fill('2027-05-01');await page.locator('#dlgSaveBtn').click();
  data=await page.evaluate(()=>JSON.parse(localStorage.getItem('tasmee-data')));assert.equal(data.assignments.find(a=>a.id==='review-a').date,'2027-05-01');assert.equal(data.assignments[0].status,'absent');
  // Batch rating must use the same algorithm and classify reset as failed.
  await page.getByRole('button',{name:/تحديد عدة مهام/}).click();await page.locator('.multi-check').first().check();await page.getByRole('button',{name:/تعديل المحدد/}).click();await page.locator('#bulkStatusOn').check();await page.locator('#bulkStatus').selectOption('done');await page.locator('#bulkRating').selectOption('reset');await page.getByRole('button',{name:'حفظ التعديلات للجميع',exact:true}).click();
  data=await page.evaluate(()=>JSON.parse(localStorage.getItem('tasmee-data')));assert.equal(data.assignments.find(a=>a.id==='review-a').status,'failed');assert.equal(data.assignments.find(a=>a.id==='review-review-a').intervalDays,1);
  // New task defaults to auto, even though legacy no-repeat tasks do not.
  await page.getByRole('button',{name:'＋ إضافة مطلوب',exact:true}).click();assert.equal(await page.locator('#aScheduleMode').inputValue(),'auto');await page.getByRole('button',{name:'إلغاء',exact:true}).click();
  await page.locator('.assign-item').first().getByRole('button',{name:'تقييم التسميع',exact:true}).click();
  if(process.env.TASME3_SCREENSHOT_DIR) await page.screenshot({path:`${process.env.TASME3_SCREENSHOT_DIR}/tasme3-${viewport.width}.png`,fullPage:true});
  assert.deepEqual(errors,[]);
 }catch(error){ if(page) console.error((await page.locator("body").innerText()).slice(0,2500));throw error; }finally{await browser.close();await new Promise(r=>server.close(r));}
});
