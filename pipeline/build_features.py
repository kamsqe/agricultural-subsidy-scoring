"""
AgroScore Feature Engineering Pipeline
Step 1: Load provided dataset + merge external data → enriched feature matrix
Step 2: Compute scoring features per application
Output: data/processed/enriched_applications.csv
"""

import os
import sys
import csv
import json
import math
from collections import defaultdict, Counter
from datetime import datetime

# ── Paths ──────────────────────────────────────────────────────────────
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXCEL_PATH = os.path.join(BASE, "Выгрузка по выданным субсидиям 2025 год (обезлич).xlsx")
REGIONAL_FEATURES = os.path.join(BASE, "data/external/regional_features.json")
BUDGET_CSV = os.path.join(BASE, "data/external/subsidy_plem_kz/budget_by_region.csv")
STATS_CSV = os.path.join(BASE, "data/external/subsidy_plem_kz/statistics_by_region.csv")
OUTPUT_DIR = os.path.join(BASE, "data/processed")

# ── Oblast Name Mapping ────────────────────────────────────────────────
# Three naming conventions:
#   provided dataset (Russian)  →  regional_features (English key)  →  budget/stats (Kazakh)

OBLAST_MAP_RU_TO_KEY = {
    "Акмолинская область": "akmolinsk",
    "Актюбинская область": "aktobe",
    "Алматинская область": "almaty_obl",
    "Атырауская область": "atyrau",
    "Восточно-Казахстанская область": "east_kz",
    "Жамбылская область": "zhambyl",
    "Западно-Казахстанская область": "west_kz",
    "Карагандинская область": "karaganda",
    "Костанайская область": "kostanay",
    "Кызылординская область": "kyzylorda",
    "Мангистауская область": "mangystau",
    "Павлодарская область": "pavlodar",
    "Северо-Казахстанская область": "north_kz",
    "Туркестанская область": "turkestan",
    "г.Шымкент": "shymkent",
    "область Абай": "abai",
    "область Жетісу": "zhetysu",
    "область Ұлытау": "ulytau",
}

OBLAST_MAP_KZ_TO_KEY = {
    "Ақмола облысы": "akmolinsk",
    "Ақтөбе облысы": "aktobe",
    "Алматы облысы": "almaty_obl",
    "Атырау облысы": "atyrau",
    "Шығыс Қазақстан облысы": "east_kz",
    "Жамбыл облысы": "zhambyl",
    "Батыс Қазақстан облысы": "west_kz",
    "Қарағанды облысы": "karaganda",
    "Қостанай облысы": "kostanay",
    "Қызылорда облысы": "kyzylorda",
    "Маңғыстау облысы": "mangystau",
    "Павлодар облысы": "pavlodar",
    "Солтүстік Қазақстан облысы": "north_kz",
    "Түркістан облысы": "turkestan",
    "Шымкент қ.": "shymkent",
    "Абай облысы": "abai",
    "Жетісу облысы": "zhetysu",
    "Ұлытау облысы": "ulytau",
}

# ── Subsidy Code Extraction ───────────────────────────────────────────
def extract_subsidy_code(app_number: str) -> str:
    """Extract subsidy type code from application number (first 5 digits)."""
    if app_number and len(app_number) >= 5:
        return app_number[:5]
    return "unknown"

# Subsidy categories for model grouping
SUBSIDY_CATEGORIES = {
    "acquisition": ["00100", "00200", "00300", "00400", "00700", "00800"],
    "production": ["01900", "02000", "04500", "04800"],
    "breeding": ["01200", "01300"],
    "emergency": ["04000", "11500", "11600"],
}

def get_category(code: str) -> str:
    for cat, codes in SUBSIDY_CATEGORIES.items():
        if code in codes:
            return cat
    return "other"

# ── Direction mapping ─────────────────────────────────────────────────
DIRECTION_MAP = {
    "Субсидирование в скотоводстве": "cattle",
    "Субсидирование в птицеводстве": "poultry",
    "Субсидирование в овцеводстве": "sheep",
    "Субсидирование в коневодстве": "horses",
    "Субсидирование в свиноводстве": "pigs",
    "Субсидирование молочного скотоводства": "dairy",
    "Субсидирование в верблюдоводстве": "camels",
    "Субсидирование мясного скотоводства": "meat",
    "Субсидирование развития племенного животноводства": "breeding",
}


def load_provided_dataset():
    """Load the provided Excel dataset into a list of dicts."""
    import openpyxl
    
    print("Loading provided dataset...")
    wb = openpyxl.load_workbook(EXCEL_PATH, read_only=True, data_only=True)
    sheet = wb.active
    
    rows = []
    for i, row in enumerate(sheet.iter_rows(min_row=2, values_only=True)):
        if i == 0 and row[0] == "№ п/п":
            continue  # skip header if duplicated
        
        oblast_raw = str(row[4]).strip() if row[4] else ""
        if oblast_raw == "Область" or not oblast_raw:
            continue  # skip header rows or empty
        
        # Parse date
        date_val = row[1]
        if isinstance(date_val, datetime):
            submit_date = date_val
        elif isinstance(date_val, str):
            try:
                submit_date = datetime.strptime(date_val.strip(), "%d.%m.%Y %H:%M:%S")
            except ValueError:
                try:
                    submit_date = datetime.strptime(date_val.strip()[:10], "%d.%m.%Y")
                except ValueError:
                    submit_date = None
        else:
            submit_date = None
        
        app_number = str(row[6]).strip() if row[6] else ""
        norm = row[10]
        amount = row[11]
        
        # Parse numeric values
        try:
            norm = float(norm) if norm else 0
        except (ValueError, TypeError):
            norm = 0
        try:
            amount = float(amount) if amount else 0
        except (ValueError, TypeError):
            amount = 0
        
        record = {
            "row_num": row[0],
            "submit_date": submit_date,
            "oblast_raw": oblast_raw,
            "oblast_key": OBLAST_MAP_RU_TO_KEY.get(oblast_raw, ""),
            "akimat": str(row[5]).strip() if row[5] else "",
            "app_number": app_number,
            "subsidy_code": extract_subsidy_code(app_number),
            "direction_raw": str(row[7]).strip() if row[7] else "",
            "direction": DIRECTION_MAP.get(str(row[7]).strip() if row[7] else "", "other"),
            "subsidy_name": str(row[8]).strip() if row[8] else "",
            "status": str(row[9]).strip() if row[9] else "",
            "norm": norm,
            "amount": amount,
            "district": str(row[12]).strip() if row[12] else "",
            "category": get_category(extract_subsidy_code(app_number)),
        }
        
        # Derived: production volume
        if norm > 0:
            record["volume"] = amount / norm
        else:
            record["volume"] = 0
        
        # Derived: month
        if submit_date:
            record["month"] = submit_date.month
            record["day_of_week"] = submit_date.weekday()  # 0=Mon, 6=Sun
            record["hour"] = submit_date.hour
        else:
            record["month"] = 0
            record["day_of_week"] = 0
            record["hour"] = 0
        
        rows.append(record)
    
    wb.close()
    print(f"  Loaded {len(rows):,} applications")
    return rows


def compute_dataset_features(rows):
    """Compute features that require the full dataset (aggregates, retries, etc.)."""
    
    print("Computing dataset-level features...")
    
    # ── Case-level dedup (retry detection) ─────────────────────────────
    # Group by (district, subsidy_code, amount) to detect retries
    case_groups = defaultdict(list)
    for i, r in enumerate(rows):
        key = (r["district"], r["subsidy_code"], r["amount"])
        case_groups[key].append(i)
    
    for indices in case_groups.values():
        # Sort by date
        sorted_indices = sorted(indices, key=lambda i: rows[i]["submit_date"] or datetime.min)
        for attempt_num, idx in enumerate(sorted_indices):
            rows[idx]["retry_count"] = attempt_num  # 0 = first attempt
            rows[idx]["total_attempts"] = len(sorted_indices)
            rows[idx]["is_retry"] = attempt_num > 0
    
    # ── District-level aggregates ──────────────────────────────────────
    district_stats = defaultdict(lambda: {"total": 0, "rejected": 0, "amounts": [], "statuses": Counter()})
    for r in rows:
        d = r["district"]
        district_stats[d]["total"] += 1
        district_stats[d]["amounts"].append(r["amount"])
        district_stats[d]["statuses"][r["status"]] += 1
        if r["status"] == "Отклонена":
            district_stats[d]["rejected"] += 1
    
    for r in rows:
        d = r["district"]
        ds = district_stats[d]
        r["district_reject_rate"] = ds["rejected"] / max(ds["total"], 1)
        r["district_app_count"] = ds["total"]
        
        # Monopolization: share of top recipient in this district
        amounts = sorted(ds["amounts"], reverse=True)
        total_amount = sum(amounts)
        if total_amount > 0 and amounts:
            r["district_top1_share"] = amounts[0] / total_amount
        else:
            r["district_top1_share"] = 0
        
        # District median amount
        sorted_amounts = sorted(ds["amounts"])
        mid = len(sorted_amounts) // 2
        r["district_median_amount"] = sorted_amounts[mid] if sorted_amounts else 0
        
        # Volume relative to district median
        if r["district_median_amount"] > 0:
            r["amount_vs_median"] = r["amount"] / r["district_median_amount"]
        else:
            r["amount_vs_median"] = 1.0
    
    # ── Oblast-level aggregates ────────────────────────────────────────
    oblast_stats = defaultdict(lambda: {"total": 0, "rejected": 0, "pending": 0, "executed": 0, "total_amount": 0})
    for r in rows:
        o = r["oblast_key"]
        oblast_stats[o]["total"] += 1
        oblast_stats[o]["total_amount"] += r["amount"]
        if r["status"] == "Отклонена":
            oblast_stats[o]["rejected"] += 1
        elif r["status"] == "Сформировано поручение":
            oblast_stats[o]["pending"] += 1
        elif r["status"] == "Исполнена":
            oblast_stats[o]["executed"] += 1
    
    for r in rows:
        o = r["oblast_key"]
        os_ = oblast_stats[o]
        r["oblast_reject_rate"] = os_["rejected"] / max(os_["total"], 1)
        r["oblast_backlog_ratio"] = os_["pending"] / max(os_["total"], 1)
        r["oblast_execution_rate"] = os_["executed"] / max(os_["total"], 1)
    
    # ── Subsidy-type aggregates ────────────────────────────────────────
    type_stats = defaultdict(lambda: {"total": 0, "rejected": 0, "amounts": [], "volumes": []})
    for r in rows:
        code = r["subsidy_code"]
        type_stats[code]["total"] += 1
        type_stats[code]["amounts"].append(r["amount"])
        type_stats[code]["volumes"].append(r["volume"])
        if r["status"] == "Отклонена":
            type_stats[code]["rejected"] += 1
    
    # Compute per-type medians
    type_medians = {}
    for code, ts in type_stats.items():
        sa = sorted(ts["amounts"])
        sv = sorted(ts["volumes"])
        mid = len(sa) // 2
        type_medians[code] = {
            "median_amount": sa[mid] if sa else 0,
            "median_volume": sv[mid] if sv else 0,
        }
    
    for r in rows:
        code = r["subsidy_code"]
        ts = type_stats[code]
        tm = type_medians[code]
        r["type_reject_rate"] = ts["rejected"] / max(ts["total"], 1)
        r["type_median_amount"] = tm["median_amount"]
        r["type_median_volume"] = tm["median_volume"]
        r["amount_vs_type_median"] = r["amount"] / max(tm["median_amount"], 1)
        r["volume_vs_type_median"] = r["volume"] / max(tm["median_volume"], 1) if tm["median_volume"] > 0 else 1.0
    
    # ── Amount features ────────────────────────────────────────────────
    for r in rows:
        r["amount_log"] = math.log1p(r["amount"])
        r["is_round_million"] = 1 if r["amount"] > 0 and r["amount"] % 1_000_000 == 0 else 0
        r["is_round_100k"] = 1 if r["amount"] > 0 and r["amount"] % 100_000 == 0 else 0
        r["is_weekend"] = 1 if r["day_of_week"] >= 5 else 0
        # Norm-derived amount: if amount == volume × norm, roundness is expected (not fraud)
        expected = r["volume"] * r["norm"] if r["norm"] > 0 else 0
        r["is_norm_amount"] = 1 if expected > 0 and abs(r["amount"] - expected) < 1.0 else 0
    
    print(f"  Computed aggregates for {len(district_stats)} districts, {len(oblast_stats)} oblasts, {len(type_stats)} subsidy types")
    return rows


def merge_external_data(rows):
    """Merge regional features, budget, and approval stats from external sources."""
    
    print("Merging external data...")
    
    # ── Regional features from stat.gov.kz ─────────────────────────────
    with open(REGIONAL_FEATURES) as f:
        regional = json.load(f)
    
    regional_cols = set()
    matched = 0
    for r in rows:
        key = r["oblast_key"]
        if key in regional:
            for col, val in regional[key].items():
                if col == "region":
                    continue
                r[f"reg_{col}"] = val
                regional_cols.add(col)
            matched += 1
    
    print(f"  Regional features: {matched:,}/{len(rows):,} matched ({len(regional_cols)} features)")
    
    # ── Budget from plem.kz ────────────────────────────────────────────
    budget = {}
    with open(BUDGET_CSV) as f:
        for row in csv.DictReader(f):
            key = OBLAST_MAP_KZ_TO_KEY.get(row["region"], "")
            if key:
                budget[key] = {
                    "budget_tenge": int(row["budget_tenge"]),
                    "active_applicants": int(row["active_applicants"]),
                    "registered_enterprises": int(row["registered_enterprises"]),
                }
    
    matched = 0
    for r in rows:
        key = r["oblast_key"]
        if key in budget:
            b = budget[key]
            r["oblast_budget"] = b["budget_tenge"]
            r["oblast_applicants"] = b["active_applicants"]
            r["oblast_enterprises"] = b["registered_enterprises"]
            # Budget per applicant
            r["budget_per_applicant"] = b["budget_tenge"] / max(b["active_applicants"], 1)
            matched += 1
        else:
            r["oblast_budget"] = 0
            r["oblast_applicants"] = 0
            r["oblast_enterprises"] = 0
            r["budget_per_applicant"] = 0
    
    print(f"  Budget: {matched:,}/{len(rows):,} matched")
    
    # ── Approval funnels from plem.kz stats ────────────────────────────
    # Aggregate by oblast: total sent, positived, executed
    funnel = defaultdict(lambda: {"sent": 0, "positived": 0, "executed": 0})
    with open(STATS_CSV) as f:
        for row in csv.DictReader(f):
            key = OBLAST_MAP_KZ_TO_KEY.get(row["StateName"], "")
            if key:
                funnel[key]["sent"] += int(row["Sended"])
                funnel[key]["positived"] += int(row["Positived"])
                funnel[key]["executed"] += int(row["Executed"])
    
    matched = 0
    for r in rows:
        key = r["oblast_key"]
        if key in funnel:
            f_ = funnel[key]
            r["oblast_approval_rate"] = f_["positived"] / max(f_["sent"], 1)
            r["oblast_execution_rate_ext"] = f_["executed"] / max(f_["sent"], 1)
            matched += 1
        else:
            r["oblast_approval_rate"] = 0
            r["oblast_execution_rate_ext"] = 0
    
    print(f"  Approval funnels: {matched:,}/{len(rows):,} matched")
    
    return rows


def save_output(rows):
    """Save enriched dataset to CSV and JSON."""
    
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Determine all columns
    all_cols = set()
    for r in rows:
        all_cols.update(r.keys())
    
    # Sort columns for consistent output
    priority_cols = [
        "row_num", "app_number", "submit_date", "oblast_raw", "oblast_key",
        "district", "direction", "category", "subsidy_code", "subsidy_name",
        "status", "norm", "amount", "volume",
        "month", "day_of_week", "hour",
        "retry_count", "total_attempts", "is_retry",
        "district_reject_rate", "district_app_count", "district_top1_share",
        "district_median_amount", "amount_vs_median",
        "oblast_reject_rate", "oblast_backlog_ratio", "oblast_execution_rate",
        "type_reject_rate", "type_median_amount", "type_median_volume",
        "amount_vs_type_median", "volume_vs_type_median",
        "amount_log", "is_round_million", "is_round_100k", "is_weekend",
        "oblast_budget", "oblast_applicants", "oblast_enterprises", "budget_per_applicant",
        "oblast_approval_rate", "oblast_execution_rate_ext",
    ]
    
    # Add regional features at the end
    reg_cols = sorted([c for c in all_cols if c.startswith("reg_")])
    remaining = sorted(all_cols - set(priority_cols) - set(reg_cols))
    cols = priority_cols + remaining + reg_cols
    
    # Convert datetime to string for CSV
    for r in rows:
        if r.get("submit_date"):
            r["submit_date"] = r["submit_date"].strftime("%Y-%m-%d %H:%M:%S")
        else:
            r["submit_date"] = ""
    
    # Save CSV
    csv_path = os.path.join(OUTPUT_DIR, "enriched_applications.csv")
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    
    print(f"\nSaved: {csv_path}")
    print(f"  {len(rows):,} rows × {len(cols)} columns")
    print(f"  Size: {os.path.getsize(csv_path)/1e6:.1f} MB")
    
    # Print column summary
    print(f"\n  Columns ({len(cols)}):")
    print(f"    Core: {len(priority_cols)}")
    print(f"    Regional features: {len(reg_cols)}")
    print(f"    Other: {len(remaining)}")
    
    return csv_path, cols


def print_summary(rows):
    """Print key statistics about the enriched dataset."""
    
    print("\n" + "=" * 60)
    print("ENRICHED DATASET SUMMARY")
    print("=" * 60)
    
    total = len(rows)
    statuses = Counter(r["status"] for r in rows)
    print(f"\nStatus distribution:")
    for s, c in statuses.most_common():
        print(f"  {s}: {c:,} ({c/total*100:.1f}%)")
    
    retries = sum(1 for r in rows if r.get("is_retry"))
    print(f"\nRetry analysis:")
    print(f"  First attempts: {total - retries:,}")
    print(f"  Retries: {retries:,} ({retries/total*100:.1f}%)")
    
    # Oblast coverage
    oblasts_matched = sum(1 for r in rows if r.get("oblast_budget", 0) > 0)
    print(f"\nExternal data coverage:")
    print(f"  Regional features matched: {sum(1 for r in rows if r.get('reg_cattle_2024'))}/{total}")
    print(f"  Budget data matched: {oblasts_matched}/{total}")
    
    # Amount distribution
    amounts = [r["amount"] for r in rows if r["amount"] > 0]
    print(f"\nAmount distribution:")
    print(f"  Total: {sum(amounts)/1e9:.1f}B tenge")
    print(f"  Mean: {sum(amounts)/len(amounts)/1e6:.1f}M tenge")
    print(f"  Median: {sorted(amounts)[len(amounts)//2]/1e6:.1f}M tenge")


if __name__ == "__main__":
    rows = load_provided_dataset()
    rows = compute_dataset_features(rows)
    rows = merge_external_data(rows)
    csv_path, cols = save_output(rows)
    print_summary(rows)
