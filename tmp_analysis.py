import csv
from collections import defaultdict

with open('data/processed/enriched_applications.csv', 'r') as f:
    apps = list(csv.DictReader(f))

def sf(v, d=0):
    try: return float(v)
    except: return d

by_oblast = {}
for a in apps:
    o = a['oblast_raw']
    if o not in by_oblast:
        by_oblast[o] = {
            'total_sub': 0,
            'cattle_yoy': sf(a.get('reg_cattle_monthly_yoy_pct',''), None),
            'n': 0,
            'backlog': sf(a.get('oblast_backlog_ratio',''), None)
        }
    by_oblast[o]['total_sub'] += sf(a['amount'])
    by_oblast[o]['n'] += 1

print("Oblast subsidy vs production growth:")
for o, d in sorted(by_oblast.items(), key=lambda x: x[1]['cattle_yoy'] if x[1]['cattle_yoy'] else -99):
    cy = "{:+.1f}%".format(d['cattle_yoy']) if d['cattle_yoy'] is not None else 'n/a'
    bl = "{:.0%}".format(d['backlog']) if d['backlog'] is not None else 'n/a'
    eff = ""
    if d['cattle_yoy'] and d['total_sub'] > 0:
        eff = "{:+.2f}".format(d['cattle_yoy'] / (d['total_sub'] / 1e9))
    print("  {:<28} {:>7.1f}B  CattleYoY:{:>7}  Backlog:{:>5}  eff:{}".format(
        o[:27], d['total_sub']/1e9, cy, bl, eff))
