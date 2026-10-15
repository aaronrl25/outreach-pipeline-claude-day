#!/usr/bin/env python3
"""Build a tailored resume from a JSON spec using the Pages-exported docx template (Milwaukee RN variant).
Usage: python3 build_resume.py spec.json  -> writes out/<name>.docx, then exports <name>.pages/.docx/.pdf to --dest via Pages.
Spec keys: name(file stem), tagline, location, summary, core_skills [[l,r],...], roles [{title,company,dates,sub,bullets[]}],
tech [[label,value],...], edu, community
"""
import re, shutil, zipfile, os, html, json, sys, subprocess
HERE=os.path.dirname(os.path.abspath(__file__))
SRC=os.path.join(HERE,'src/mil')
spec=json.load(open(sys.argv[1]))
dest=sys.argv[2] if len(sys.argv)>2 else os.path.expanduser('~/Desktop')
x=open(f'{SRC}/word/document.xml',encoding='utf-8').read()
head=x[:x.index('<w:body>')]+'<w:body>'
body=x[x.index('<w:body>'):]
tail=body[body.rindex('</w:p>')+len('</w:p>'):]
paras=re.findall(r'<w:p[ >].*?</w:p>',body,re.S)
def ppr(i): return re.search(r'<w:pPr>.*?</w:pPr>',paras[i],re.S).group(0)
def rprs(i):
    out=[]
    for r in re.findall(r'<w:r>.*?</w:r>',paras[i],re.S):
        m=re.search(r'<w:rPr>.*?</w:rPr>',r,re.S); out.append(m.group(0) if m else '')
    return out
def esc(s): return html.escape(s,quote=False)
def run(rpr,t): return f'<w:r>{rpr}<w:t xml:space="preserve">{esc(t)}</w:t></w:r>'
def tab(rpr='<w:rPr><w:lang w:val="de-DE"/></w:rPr>'): return f'<w:r>{rpr}<w:tab/></w:r>'
def P(pp,*runs): return f'<w:p>{pp}{"".join(runs)}</w:p>'
T={}
T['name']=(ppr(0),rprs(0)[0]); T['tag']=(ppr(1),rprs(1)[0]); T['contact']=(ppr(2),rprs(2)[0]); T['loc']=(ppr(3),rprs(3)[0])
T['head']=(ppr(4),rprs(4)[0]); T['sum']=(ppr(5),rprs(5)[0]); T['skill']=(ppr(7),rprs(7)[0])
jr=rprs(12); T['job']=(ppr(12),jr[0],jr[1],jr[2],jr[4])
T['sub']=(ppr(13),rprs(13)[0]); T['bul']=(ppr(14),rprs(14)[0])
tr=rprs(50); T['tech']=(ppr(50),tr[0],tr[2]); T['edu']=(ppr(59),rprs(59)[0])
def simple(k,t): pp,rp=T[k]; return P(pp,run(rp,t))
def skill(l,r): pp,rp=T['skill']; return P(pp,run(rp,'▪  '+l),tab(),run(rp,'▪  '+r))
def job(title,company,dates):
    pp,rt,rs,rc,rd=T['job']; return P(pp,run(rt,title),run(rs,'  ·  '),run(rc,company),tab(),run(rd,dates))
def tech(label,val): pp,rl,rv=T['tech']; return P(pp,run(rl,label),tab(),run(rv,val))
out=[simple('name','AARON DAVID RAMÍREZ LEZAMA'), simple('tag',spec['tagline']),
     simple('contact','rl.aaron4@gmail.com  ·  (773) 708-2882  ·  linkedin.com/in/aaronsoftware  ·  github.com/aaronrl25  ·  aron.software')]
if spec.get('location'): out.append(simple('loc',spec['location']))
out+= [simple('head','PROFESSIONAL SUMMARY'), simple('sum',spec['summary']), simple('head','CORE SKILLS')]
out+= [skill(l,r) for l,r in spec['core_skills']]
out.append(simple('head','PROFESSIONAL EXPERIENCE'))
for r in spec['roles']:
    out+= [job(r['title'],r['company'],r['dates']), simple('sub',r['sub'])] + [simple('bul',b) for b in r['bullets']]
out.append(simple('head','TECHNICAL SKILLS'))
out+= [tech(l,v) for l,v in spec['tech']]
out+= [simple('head','EDUCATION & COMMUNITY'), simple('edu',spec.get('edu','B.S. Computer Systems Engineering  ·  Universidad España y México  ·  Puebla, Mexico')),
       simple('bul',spec.get('community','5x hackathon winner; Co-Organizer, Code & Coffee Chicago & SF (200+ monthly attendees); Speaker, ChicagoJS & Jalisco Talent Land 2024.'))]
doc=head+''.join(out)+tail
name=spec['name']
OUT=os.path.join(HERE,'build_'+name)
shutil.rmtree(OUT,ignore_errors=True); shutil.copytree(SRC,OUT)
open(f'{OUT}/word/document.xml','w',encoding='utf-8').write(doc)
os.makedirs(os.path.join(HERE,'out'),exist_ok=True)
docx=os.path.join(HERE,'out',name+'.docx')
if os.path.exists(docx): os.remove(docx)
with zipfile.ZipFile(docx,'w',zipfile.ZIP_DEFLATED) as z:
    z.write(f'{OUT}/[Content_Types].xml','[Content_Types].xml')
    for root,_,files in os.walk(OUT):
        for f in files:
            full=os.path.join(root,f); arc=os.path.relpath(full,OUT)
            if arc!='[Content_Types].xml': z.write(full,arc)
shutil.rmtree(OUT,ignore_errors=True)
os.makedirs(dest,exist_ok=True)
for ext in ('pages','docx','pdf'):
    p=os.path.join(dest,f'{name}.{ext}')
    if os.path.exists(p): os.remove(p)
script=f'''
set srcFile to POSIX file "{docx}"
tell application "Pages"
  set d to open srcFile
  delay 2
  save d in POSIX file "{dest}/{name}.pages"
  delay 1
  export d to POSIX file "{dest}/{name}.pdf" as PDF
  export d to POSIX file "{dest}/{name}.docx" as Microsoft Word
  close d saving no
end tell'''
subprocess.run(['osascript','-e',script],check=True)
pdf=open(f'{dest}/{name}.pdf','rb').read()
print(name,'pages=',len(re.findall(rb'/Type\s*/Page[^s]',pdf)))
