import { chromium } from 'playwright-core';
import { writeFileSync } from 'fs';
const [,, path='/', out='site.png', width='1142'] = process.argv;
const DIR='/tmp/claude-0/-home-user-hermes-front-end/bee331e8-5968-5c5e-8e20-2fca33aaa0e9/scratchpad';
const BASE='http://127.0.0.1:3100';
let html=await (await fetch(BASE+path)).text();
// inline stylesheets
const links=[...html.matchAll(/<link[^>]*>/g)].map(m=>{const t=m[0];if(!/rel="stylesheet"/.test(t))return null;const h=t.match(/href="([^"]+)"/);return h?[t,h[1]]:null}).filter(Boolean);
for(const m of links){
  const href=m[1].startsWith('http')?m[1]:BASE+m[1];
  try{ const css=await (await fetch(href)).text(); html=html.replace(m[0],`<style>${css}</style>`);}catch(e){console.log("CSS FAIL",href,e.message)}
}
// strip all script tags (SSR HTML already has content; JS disabled anyway)
html=html.replace(/<script[\s\S]*?<\/script>/g,'');
// neutralize entrance animations that rely on JS by forcing visible
html=html.replace('</head>',`<style>*{animation:none!important;transition:none!important}[style*="opacity"]{opacity:1!important}[style*="transform"]{transform:none!important}</style></head>`);
const file=`${DIR}/_page.html`; writeFileSync(file,html);
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const ctx=await b.newContext({viewport:{width:+width,height:900},deviceScaleFactor:1,javaScriptEnabled:false});
const p=await ctx.newPage();
await p.goto('file://'+file,{waitUntil:'load',timeout:20000});
await p.waitForTimeout(500);
await p.screenshot({path:`${DIR}/${out}`,fullPage:true});
await b.close();console.log('OK',out,'bytes',html.length);
