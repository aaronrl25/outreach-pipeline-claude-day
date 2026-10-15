#!/usr/bin/env python3
"""Merge an overlay (tagline, location, summary, core_skills, tech_overrides, role_tweaks) with a base and build.
Usage: python3 make_spec.py overlay.json [dest_dir]"""
import json, sys, os, subprocess, copy
HERE=os.path.dirname(os.path.abspath(__file__))
ov=json.load(open(sys.argv[1]))
dest=sys.argv[2] if len(sys.argv)>2 else os.path.join(os.environ.get('OUTREACH_DIR', os.path.expanduser('~/Desktop/Outreach_2026-10-14')),'resumes')
base=json.load(open(os.path.join(HERE,'specs',f"base_{ov['base']}.json")))
spec=copy.deepcopy(base)
spec['name']=ov['name']; spec['tagline']=ov['tagline']; spec['location']=ov.get('location',''); spec['summary']=ov['summary']; spec['core_skills']=ov['core_skills']
for label,val in ov.get('tech_overrides',{}).items():
    for row in spec['tech']:
        if row[0]==label: row[1]=val
for extra in ov.get('tech_extra',[]): spec['tech'].insert(0,extra)
for i,tw in ov.get('role_tweaks',{}).items():
    r=spec['roles'][int(i)]
    for k,v in tw.items(): r[k]=v
sp=os.path.join(HERE,'specs',ov['name']+'.json'); json.dump(spec,open(sp,'w'),ensure_ascii=False,indent=1)
subprocess.run([sys.executable,os.path.join(HERE,'build_resume.py'),sp,dest],check=True)
