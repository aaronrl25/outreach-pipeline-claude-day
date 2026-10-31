#!/usr/bin/env python3
"""Append an application row to data/2026-10-14/tracker_rows.json + Outreach_Log.csv and data/2026-10-31/applications.json.
Usage: add_application.py '<json>'  with keys company, role, loc, arr, pay, posted, link, resume, status, src, visa, notes, recruiter, cover_letter"""
import json, sys, csv, os, datetime
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(HERE)
d=json.loads(sys.argv[1])
rows=json.load(open(f'{ROOT}/data/2026-10-14/tracker_rows.json'))
row={'company':d['company'],'role':d['role'],'loc':d.get('loc',''),'arr':d.get('arr','FT'),'type':d.get('type','Application'),'pay':d.get('pay','Not stated'),
 'posted':d.get('posted',''),'skills':d.get('skills',''),'visa':d.get('visa','Not stated'),'recruiter':d.get('recruiter',''),'contact':d.get('contact',''),
 'link':d['link'],'fit':d.get('fit',''),'resume':d.get('resume',''),'msg':d.get('cover_letter',''),'status':d['status'],'src':d.get('src','Job sweep 2026-10-31')}
rows.append(row); json.dump(rows,open(f'{ROOT}/data/2026-10-14/tracker_rows.json','w'),ensure_ascii=False,indent=0)
with open(f'{ROOT}/data/2026-10-14/Outreach_Log.csv','a',newline='') as f:
    csv.writer(f).writerow([datetime.date.today().isoformat(),d['status'],d.get('recruiter',''),d['company'],d['role'],d.get('loc',''),d.get('arr',''),d.get('resume',''),d['link'],d.get('notes','')])
ap=f'{ROOT}/data/2026-10-31/applications.json'
apps=json.load(open(ap)) if os.path.exists(ap) else []
d['ts']=datetime.datetime.now().isoformat(timespec='minutes'); apps.append(d); json.dump(apps,open(ap,'w'),ensure_ascii=False,indent=1)
print('tracker rows',len(rows),'| applications today',len(apps))
