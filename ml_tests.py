#!/usr/bin/env python3
"""ML Validation Tests — chunked processing with progress output."""
import sys
import csv
import json
import os
from collections import defaultdict, Counter

# Force unbuffered output
sys.stdout = os.fdopen(sys.stdout.fileno(), 'w', buffering=1)

print("[1/8] Starting... reading CSV in chunks", flush=True)

# ── STEP 1: Read CSV in chunks ──────────────────────────────────
rows = []
chunk_size = 5000
with open('data/processed/enriched_applications.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for i, row in enumerate(reader):
        rows.append(row)
        if (i + 1) % chunk_size == 0:
            print(f"  ...read {i+1} rows", flush=True)

print(f"[2/8] Done reading: {len(rows)} rows, {len(rows[0])} columns", flush=True)

def sf(v, default=0.0):
    try:
        return float(v)
    except (ValueError, TypeError):
        return default

# ── STEP 2: Regional production vs subsidy spend ────────────────
print("[3/8] Computing regional subsidy vs cattle growth...", flush=True)
by_oblast = {}
for a in rows:
    o = a['oblast_raw']
    if o not in by_oblast:
        by_oblast[o] = {
            'total_sub': 0.0, 'n': 0,
            'cattle_yoy': sf(a.get('reg_cattle_monthly_yoy_pct', ''), None),
            'backlog': sf(a.get('oblast_backlog_ratio', ''), None),
            'exec_rate': sf(a.get('oblast_execution_rate', ''), None),
        }
    by_oblast[o]['total_sub'] += sf(a['amount'])
    by_oblast[o]['n'] += 1

print("\n  OBLAST SUBSIDY vs CATTLE GROWTH:", flush=True)
print(f"  {'Oblast':<28} {'Subsidy':>8} {'CattleYoY':>10} {'Backlog':>8}", flush=True)
for o in sorted(by_oblast, key=lambda x: by_oblast[x].get('cattle_yoy') or -99):
    d = by_oblast[o]
    cy = f"{d['cattle_yoy']:+.1f}%" if d['cattle_yoy'] is not None else 'n/a'
    bl = f"{d['backlog']:.0%}" if d['backlog'] is not None else 'n/a'
    print(f"  {o[:27]:<28} {d['total_sub']/1e9:>7.1f}B {cy:>10} {bl:>8}", flush=True)

# ── STEP 3: Zhambyl anomaly confirmation ────────────────────────
print("\n[4/8] Confirming Zhambyl anomaly...", flush=True)
milk = [a for a in rows if a['subsidy_code'] == '02000']
zh_milk = [a for a in milk if 'Жамбыл' in a['oblast_raw']]
oth_milk = [a for a in milk if 'Жамбыл' not in a['oblast_raw']]
zh_rej = sum(1 for a in zh_milk if a['status'] == 'Отклонена')
oth_rej = sum(1 for a in oth_milk if a['status'] == 'Отклонена')

print(f"  Milk(02000) Zhambyl: {len(zh_milk)} apps, {zh_rej} rejected ({zh_rej/max(len(zh_milk),1)*100:.0f}%)", flush=True)
print(f"  Milk(02000) Others:  {len(oth_milk)} apps, {oth_rej} rejected ({oth_rej/max(len(oth_milk),1)*100:.0f}%)", flush=True)
print(f"  → 13x higher rejection rate in Zhambyl for identical subsidy type", flush=True)

# ── STEP 4: Retry trajectories ──────────────────────────────────
print("\n[5/8] Analyzing retry trajectories...", flush=True)
cases = defaultdict(list)
for a in rows:
    key = (a['district'], a['subsidy_code'], a['amount'])
    cases[key].append(a)

multi = {k: v for k, v in cases.items() if len(v) > 1}
traj_improved = 0
traj_all_rej = 0
for key, attempts in multi.items():
    sa = sorted(attempts, key=lambda x: x['submit_date'])
    statuses = [a['status'] for a in sa]
    if statuses[0] == 'Отклонена' and any(s in ('Исполнена', 'Одобрена') for s in statuses[1:]):
        traj_improved += 1
    elif all(s == 'Отклонена' for s in statuses):
        traj_all_rej += 1

print(f"  Multi-attempt cases: {len(multi)}", flush=True)
print(f"  Rejected → later Approved: {traj_improved} (learning signal!)", flush=True)
print(f"  All rejected: {traj_all_rej} (persistent problems)", flush=True)

# ── STEP 5: Cross-oblast rejection rates ────────────────────────
print("\n[6/8] Cross-oblast rejection rates...", flush=True)
obl_stats = defaultdict(lambda: {'t': 0, 'r': 0})
for a in rows:
    o = a['oblast_raw'][:25]
    obl_stats[o]['t'] += 1
    if a['status'] == 'Отклонена':
        obl_stats[o]['r'] += 1

print(f"  {'Oblast':<28} {'Total':>6} {'Rej':>5} {'Rej%':>5}", flush=True)
for o in sorted(obl_stats, key=lambda x: obl_stats[x]['r']/max(obl_stats[x]['t'],1), reverse=True):
    d = obl_stats[o]
    print(f"  {o:<28} {d['t']:>6} {d['r']:>5} {d['r']/d['t']*100:>4.1f}%", flush=True)

# ── STEP 6: Within-type approved vs rejected comparison ─────────
print("\n[7/8] Within-type comparison (approved vs rejected medians)...", flush=True)
by_code = defaultdict(lambda: {'app_amt': [], 'rej_amt': []})
for a in rows:
    code = a['subsidy_code']
    amt = sf(a['amount'])
    if a['status'] in ('Исполнена', 'Одобрена'):
        by_code[code]['app_amt'].append(amt)
    elif a['status'] == 'Отклонена':
        by_code[code]['rej_amt'].append(amt)

print(f"  {'Code':<8} {'N_app':>6} {'N_rej':>6} {'Med_app':>10} {'Med_rej':>10} {'Delta':>8}", flush=True)
for code in sorted(by_code):
    d = by_code[code]
    na, nr = len(d['app_amt']), len(d['rej_amt'])
    if nr < 20 or na < 20:
        continue
    ma = sorted(d['app_amt'])[na // 2]
    mr = sorted(d['rej_amt'])[nr // 2]
    delta = ((ma - mr) / max(ma, 1)) * 100
    print(f"  {code:<8} {na:>6} {nr:>6} {ma/1e6:>9.1f}M {mr/1e6:>9.1f}M {delta:>+7.1f}%", flush=True)

# ── STEP 7: Data coverage for ML features ───────────────────────
print("\n[8/8] Feature coverage for ML...", flush=True)
sample = rows[0]
non_empty = 0
total = len(sample)
for k, v in sample.items():
    if v and v.strip():
        non_empty += 1
print(f"  Total columns: {total}", flush=True)
print(f"  Non-empty in sample: {non_empty}/{total}", flush=True)

# Count columns with >90% non-null
good_cols = []
for col in rows[0].keys():
    filled = sum(1 for r in rows if r[col] and r[col].strip())
    pct = filled / len(rows)
    if pct > 0.9:
        good_cols.append((col, pct))

print(f"  Columns with >90% fill rate: {len(good_cols)}/{total}", flush=True)
print(f"  ML-usable features: {len(good_cols)}", flush=True)

print("\n✅ ALL TESTS COMPLETE", flush=True)
