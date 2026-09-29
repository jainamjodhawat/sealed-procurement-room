import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4399','--strictPort'], {cwd:root,stdio:'ignore'});
const base='http://127.0.0.1:4399/';
let browser;
const captures=[];
try {
  for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{} await new Promise(r=>setTimeout(r,200));}
  browser=await chromium.launch({headless:true});
  for(const [device,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
    const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
    const pending=['#/'], visited=new Set();
    const out=path.join(root,'screenshots',device);fs.mkdirSync(out,{recursive:true});
    async function capture(name){
      await page.evaluate(()=>document.fonts.ready);
      await page.waitForTimeout(600);
      const filename=name.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase()||'home';
      await page.screenshot({path:path.join(out,filename+'.png'),fullPage:true,animations:'disabled'});
      captures.push({device,page:name,file:'screenshots/'+device+'/'+filename+'.png',overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
    }
    while(pending.length){
      const route=pending.shift();if(visited.has(route))continue;visited.add(route);
      await page.goto(base+route,{waitUntil:'networkidle'});
      await page.locator('h1').first().waitFor();
      await capture(route==='#/'?'home':route.slice(2));
      const links=await page.locator('a[href^="#/"]').evaluateAll(els=>els.map(e=>e.getAttribute('href')));
      for(const link of links)if(!visited.has(link))pending.push(link);
      const nav=page.locator('nav button');
      const labels=await nav.allTextContents();
      for(let i=0;i<labels.length;i++){await nav.nth(i).click();await capture(route.slice(2)+'-'+labels[i].trim());}
    }
    await page.close();
  }
  fs.writeFileSync(path.join(root,'screenshots','capture-manifest.json'),JSON.stringify({capturedAt:new Date().toISOString(),walletState:'disconnected',captures},null,2));
  console.log(JSON.stringify({pages:captures.length,overflow:captures.filter(c=>c.overflow).map(c=>c.device+':'+c.page)}));
}finally{await browser?.close();server.kill('SIGTERM');}
