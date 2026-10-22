const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const store=JSON.parse(sessionStorage.getItem('__posts17')||'{}');
function card(el){let n=el;for(let i=0;i<12&&n&&n.parentElement;i++){n=n.parentElement;if(n.parentElement&&n.parentElement.getAttribute&&n.parentElement.getAttribute('data-testid')==='lazy-column')return n;}return el.closest('li')||el.parentElement.parentElement.parentElement;}
async function collect(){
 document.querySelectorAll('[data-testid=expandable-text-button]').forEach(b=>{if(/more/i.test(b.innerText))b.click();});
 await sleep(500);
 document.querySelectorAll('[data-testid=expandable-text-box]').forEach(box=>{
  const txt=box.innerText.trim(); if(txt.length<40)return; const key=txt.slice(0,80);
  if(store[key])return;
  const c=card(box);
  const a=c.querySelector('a[href*="/in/"],a[href*="/company/"]');
  const link=[...c.querySelectorAll('a[href]')].map(x=>x.href).find(h=>/\/posts\/|\/feed\/update\//.test(h))||'';
  const ctext=c.innerText||'';
  const time=(ctext.match(/\b\d+\s?(?:m|h|d|w|mo)\b/)||[''])[0];
  const emails=[...new Set(txt.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g)||[])];
  store[key]={q:decodeURIComponent(location.search).slice(0,80),author:a?a.innerText.trim().split('\n')[0]:'',profile:a?a.href:'',link,time,emails,text:txt.slice(0,3000)};
 });
}
const m=document.querySelector('main');const sc=(m&&m.scrollHeight>m.clientHeight+50)?m:null;
const sTo=(y)=>sc?sc.scrollTo(0,y):window.scrollTo(0,y);const sBy=(y)=>sc?sc.scrollBy(0,y):window.scrollBy(0,y);const sH=()=>sc?sc.scrollHeight:document.body.scrollHeight;const atEnd=()=>sc?(sc.scrollTop+sc.clientHeight>=sc.scrollHeight-5):(window.scrollY+window.innerHeight>=document.body.scrollHeight-5);
sTo(0);await sleep(800);
for(let i=0;i<22;i++){await collect();sBy(600);await sleep(900);const h=sH();if(atEnd()){await sleep(1500);if(sH()===h)break;}}
await collect();
sessionStorage.setItem('__posts17',JSON.stringify(store));
const all=Object.values(store);
JSON.stringify({total:all.length,withEmail:all.filter(p=>p.emails.length).length});
