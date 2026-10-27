const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const store=JSON.parse(sessionStorage.getItem('__ea')||'{}');
const col=document.querySelector('[data-testid=lazy-column]');
let added=0;
function grab(){if(!col)return;[...col.children].forEach(k=>{if(k.tagName!=='DIV')return;const id=(k.innerHTML.match(/\b4[45]\d{8}\b/)||[])[0];if(!id||store[id])return;const lines=k.innerText.split('\n').map(s=>s.trim()).filter(Boolean);let i=0;let title=lines[0]||'';title=title.replace(/^Selected,\s*/,'').replace(/\s*\(Verified job\)\s*/,'').trim();let j=1;if(lines[1]&&lines[1].replace(/\s*\(Verified job\)\s*/,'').trim()===title)j=2;const t=k.innerText.replace(/\s+/g,' ');store[id]={id,title,company:lines[j]||'',loc:lines[j+1]||'',easy:/Easy Apply/i.test(t),promoted:/Promoted/i.test(t),applied:/Applied|Viewed/i.test(t)?(t.match(/Applied|Viewed/)||[''])[0]:'',q:decodeURIComponent((location.search.match(/keywords=([^&]*)/)||['',''])[1]),pay:(t.match(/\$[\d,.]+K?(?:\/yr|\/hr)?(?:\s*-\s*\$[\d,.]+K?(?:\/yr|\/hr)?)?/)||[''])[0]};added++;});}
if(col){col.scrollTo(0,0);await sleep(300);for(let i=0;i<14;i++){grab();col.scrollBy(0,700);await sleep(450);}grab();}
sessionStorage.setItem('__ea',JSON.stringify(store));
JSON.stringify({added,total:Object.keys(store).length,easy:Object.values(store).filter(j=>j.easy).length});
