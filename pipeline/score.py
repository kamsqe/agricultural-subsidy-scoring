"""
AgroScore Scoring Engine
Applies Impact Score v2 formula to all enriched applications.
Input:  data/processed/enriched_applications.csv
Output: data/processed/scored_applications.json  (for frontend)
        data/processed/scoring_summary.json       (aggregate stats)
"""

import os
import csv
import json
import math
from collections import defaultdict, Counter

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INPUT_CSV = os.path.join(BASE, "data/processed/enriched_applications.csv")
OUTPUT_DIR = os.path.join(BASE, "data/processed")

# ══════════════════════════════════════════════════════════════════════
# SCORING COMPONENTS
# ══════════════════════════════════════════════════════════════════════

# Food security priorities (self-sufficiency deficit = higher priority)
# KZ self-sufficiency: poultry 58%, dairy 89%, cattle 82%
FOOD_SECURITY = {
    "poultry": 1.0,
    "dairy": 0.8,
    "meat": 0.7,
    "cattle": 0.6,
    "sheep": 0.5,
    "horses": 0.4,
    "breeding": 0.7,
    "pigs": 0.3,
    "camels": 0.3,
    "other": 0.3,
}

# Strategic priority codes (Концепция АПК 2021-2030)
PRIORITY_CODES = {"01300", "01200", "02000", "04500"}  # breeding, dairy, meat processing


def score_strategic_alignment(app: dict) -> float:
    """
    Strategic Alignment [0-100]: How well does this subsidy align with
    national priorities and regional specialization?
    
    Factors:
    1. Regional specialization (stat.gov.kz livestock data)
    2. Концепция АПК priority codes
    3. Food security deficit
    """
    # Factor 1: Regional specialization (max 40 pts)
    # Use livestock density from stat.gov.kz — higher = more specialized
    direction = app.get("direction", "other")
    
    # Map direction to regional feature
    livestock_map = {
        "cattle": "reg_cattle_2024",
        "dairy": "reg_milk_2024",
        "sheep": "reg_sheep_2024",
        "horses": "reg_horses_2024",
        "poultry": "reg_poultry_2024",
        "camels": "reg_camels_2024",
        "pigs": "reg_pigs_2024",
        "meat": "reg_meat_live_2024",
    }
    
    feature_key = livestock_map.get(direction, "")
    regional_value = float(app.get(feature_key, 0)) if feature_key else 0
    
    # Normalize: use log scale, typical range 10-500 thousand head
    if regional_value > 0:
        spec_score = min(math.log1p(regional_value) / math.log1p(500), 1.0) * 40
    else:
        spec_score = 15  # neutral if no data
    
    # Factor 2: Priority code (max 30 pts)
    code = app.get("subsidy_code", "")
    priority_score = 30 if code in PRIORITY_CODES else 15
    
    # Factor 3: Food security (max 30 pts)
    fs_priority = FOOD_SECURITY.get(direction, 0.3)
    fs_score = fs_priority * 30
    
    return round(spec_score + priority_score + fs_score, 1)


def score_fairness(app: dict) -> float:
    """
    Fairness Factor [0-100]: Is the district already monopolized?
    Does this application help diversify subsidy distribution?
    
    Factors:
    1. District monopolization (top-1 share)
    2. Amount relative to district median
    3. Small farmer bonus
    """
    # Factor 1: Monopolization (max 40 pts)
    top1_share = float(app.get("district_top1_share", 0))
    
    # High monopolization + this is NOT the top recipient = bonus
    # We don't have recipient ID, but can use amount_vs_median as proxy
    amount_ratio = float(app.get("amount_vs_median", 1))
    
    if top1_share > 0.5:
        # District is monopolized
        if amount_ratio < 1.5:
            # Smaller applicant in monopolized district = fairness bonus
            monopoly_score = 35
        else:
            # Larger applicant in monopolized district = penalty
            monopoly_score = 10
    elif top1_share > 0.2:
        monopoly_score = 25
    else:
        monopoly_score = 20  # well-distributed district
    
    # Factor 2: Size relative to median (max 30 pts)
    if amount_ratio < 0.5:
        size_score = 25  # small = fairness bonus
    elif amount_ratio < 1.5:
        size_score = 30  # around median = good
    elif amount_ratio < 3.0:
        size_score = 20  # above median
    else:
        size_score = 10  # far above median = less fair
    
    # Factor 3: Small farmer bonus (max 30 pts)
    amount = float(app.get("amount", 0))
    if amount < 1_000_000:
        small_bonus = 30
    elif amount < 5_000_000:
        small_bonus = 22
    elif amount < 20_000_000:
        small_bonus = 12
    else:
        small_bonus = 5
    
    return round(monopoly_score + size_score + small_bonus, 1)


def score_regional_need(app: dict) -> float:
    """
    Regional Need [0-100]: How much does this region need this subsidy?
    
    Factors:
    1. Oblast backlog ratio (pending / total applications)
    2. Oblast approval rate from plem.kz external data
    3. Budget per applicant (lower = more need)
    4. Seasonality
    """
    # Factor 1: Backlog ratio (max 30 pts)
    backlog = float(app.get("oblast_backlog_ratio", 0))
    if backlog > 0.4:
        backlog_score = 30
    elif backlog > 0.2:
        backlog_score = 22
    elif backlog > 0.1:
        backlog_score = 15
    else:
        backlog_score = 8
    
    # Factor 2: External approval rate (max 25 pts)
    # Lower approval rate = stricter region = more need for good applicants
    ext_approval = float(app.get("oblast_approval_rate", 0))
    if ext_approval > 0:
        # Invert: low approval = high need
        approval_score = (1 - ext_approval) * 25
    else:
        approval_score = 12  # neutral
    
    # Factor 3: Budget pressure (max 25 pts)
    budget_per_app = float(app.get("budget_per_applicant", 0))
    if budget_per_app > 0:
        # Lower budget per applicant = more pressure
        if budget_per_app < 15_000_000:
            budget_score = 25
        elif budget_per_app < 30_000_000:
            budget_score = 18
        elif budget_per_app < 50_000_000:
            budget_score = 12
        else:
            budget_score = 5
    else:
        budget_score = 12
    
    # Factor 4: Seasonality (max 20 pts)
    month = int(app.get("month", 0))
    seasonal = {
        1: 0.7, 2: 0.9, 3: 1.0, 4: 1.0,
        5: 0.8, 6: 0.7, 7: 0.6, 8: 0.5,
        9: 0.6, 10: 0.7, 11: 0.8, 12: 0.8,
    }
    seasonal_score = seasonal.get(month, 0.7) * 20
    
    return round(backlog_score + approval_score + budget_score + seasonal_score, 1)


def score_efficiency(app: dict) -> float:
    """
    Efficiency Potential [0-100]: How likely is this subsidy to be used effectively?
    
    Factors:
    1. Retry history (persistent but not excessive)
    2. District reputation (reject rate)
    3. Amount reasonableness
    """
    # Factor 1: Retry history (max 35 pts)
    retry = int(app.get("retry_count", 0))
    if retry == 0:
        history_score = 30  # first timer
    elif retry == 1:
        history_score = 35  # one retry = persistent
    elif retry <= 3:
        history_score = 22  # several = concerning
    else:
        history_score = 10  # many = problematic
    
    # Factor 2: District reputation (max 40 pts)
    district_rr = float(app.get("district_reject_rate", 0))
    # Lower reject rate = better reputation
    reputation_score = (1 - min(district_rr, 1.0)) * 40
    
    # Factor 3: Amount reasonableness (max 25 pts)
    ratio = float(app.get("amount_vs_median", 1))
    if 0.3 <= ratio <= 2.0:
        amount_score = 25  # reasonable range
    elif 0.1 <= ratio <= 5.0:
        amount_score = 15
    else:
        amount_score = 5  # extreme outlier
    
    return round(history_score + reputation_score + amount_score, 1)


def score_fraud_risk(app: dict) -> float:
    """
    Fraud Risk [0-100]: Higher = more suspicious.
    This is SUBTRACTED from the final score.
    
    Factors:
    1. Round number flag
    2. Extreme outlier amount
    3. High retry velocity
    4. District monopolization
    5. Late-night submission
    
    NOTE: Weekend submission removed — data shows +0.2pp reject rate
    delta (8.1% weekend vs 7.9% weekday), which is noise.
    """
    risk = 0
    
    # Round million amounts (max 15)
    if int(app.get("is_round_million", 0)):
        risk += 15
    elif int(app.get("is_round_100k", 0)):
        risk += 5
    
    # Extreme volume outlier (max 25)
    ratio = float(app.get("amount_vs_median", 1))
    if ratio > 10:
        risk += 25
    elif ratio > 5:
        risk += 15
    elif ratio > 3:
        risk += 8
    
    # Excessive retries (max 20)
    retries = int(app.get("retry_count", 0))
    if retries > 5:
        risk += 20
    elif retries > 3:
        risk += 12
    elif retries > 1:
        risk += 5
    
    # High monopoly district (max 15)
    top1 = float(app.get("district_top1_share", 0))
    if top1 > 0.7:
        risk += 15
    elif top1 > 0.4:
        risk += 8
    
    # Late-night submission (max 10)
    hour = int(app.get("hour", 12))
    if 0 <= hour <= 5:
        risk += 10
    
    return min(risk, 100)


# ══════════════════════════════════════════════════════════════════════
# MAIN SCORING
# ══════════════════════════════════════════════════════════════════════

WEIGHTS = {
    "strategic": 0.20,
    "fairness": 0.20,
    "need": 0.20,
    "efficiency": 0.20,
    "fraud_penalty": 0.10,
}
# Remaining 10% = base score of 50 (everyone starts with some baseline)
BASE_WEIGHT = 0.10
BASE_SCORE = 50


def score_exception_points(app: dict):
    """
    Exception Points [0-15]: Bonus for special circumstances.
    Inspired by UNOS exception points and research recommendations.
    
    Returns (points, list of reason strings).
    """
    points = 0
    reasons = []
    
    # First-time applicant bonus (+5)
    retry = int(app.get("retry_count", 0))
    if retry == 0:
        points += 5
        reasons.append("first_time_applicant")
    
    # High-need oblast bonus (+5) — oblast with budget backlog > 30%
    backlog = float(app.get("oblast_backlog_ratio", 0))
    if backlog > 0.30:
        points += 5
        reasons.append("high_need_oblast")
    
    # Small farmer in monopolized district (+5)
    amount = float(app.get("amount", 0))
    top1 = float(app.get("district_top1_share", 0))
    if amount < 5_000_000 and top1 > 0.4:
        points += 5
        reasons.append("small_farmer_monopoly_district")
    
    return min(points, 15), reasons


def calculate_impact_score(app: dict) -> dict:
    """Calculate the full Impact Score with all components."""
    
    strategic = score_strategic_alignment(app)
    fairness = score_fairness(app)
    need = score_regional_need(app)
    efficiency = score_efficiency(app)
    fraud = score_fraud_risk(app)
    exception, exception_reasons = score_exception_points(app)
    
    base = (
        WEIGHTS["strategic"] * strategic +
        WEIGHTS["fairness"] * fairness +
        WEIGHTS["need"] * need +
        WEIGHTS["efficiency"] * efficiency +
        BASE_WEIGHT * BASE_SCORE
    )
    
    penalty = WEIGHTS["fraud_penalty"] * fraud
    # Exception points added directly (max 15, capped at 100 total)
    final = min(100, max(0, round(base - penalty + exception, 1)))
    
    # Triage band: A=critical(score<40), B=high(40-55), C=standard(55-65), D=low(65+)
    if final < 40:
        triage = "D"
    elif final < 55:
        triage = "C"
    elif final < 65:
        triage = "B"
    else:
        triage = "A"
    
    return {
        "score": final,
        "triage": triage,
        "components": {
            "strategic": round(strategic, 1),
            "fairness": round(fairness, 1),
            "need": round(need, 1),
            "efficiency": round(efficiency, 1),
            "fraud_risk": round(fraud, 1),
            "exception": round(exception, 1),
        },
        "exception_reasons": exception_reasons,
        "flags": {
            "high_fraud_risk": fraud > 50,
            "requires_audit": fraud > 70,
            "low_efficiency": efficiency < 30,
        },
    }


def run_scoring():
    """Load enriched data, score all applications, save results."""
    
    print("Loading enriched applications...")
    with open(INPUT_CSV, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        apps = list(reader)
    print(f"  {len(apps):,} applications loaded")
    
    # Score all
    print("Scoring...")
    scored = []
    for app in apps:
        result = calculate_impact_score(app)
        scored.append({
            "app_number": app["app_number"],
            "submit_date": app["submit_date"],
            "oblast": app["oblast_raw"],
            "oblast_key": app["oblast_key"],
            "district": app["district"],
            "direction": app["direction"],
            "category": app["category"],
            "subsidy_code": app["subsidy_code"],
            "subsidy_name": app["subsidy_name"],
            "status": app["status"],
            "amount": float(app["amount"]),
            "norm": float(app["norm"]),
            "volume": float(app["volume"]),
            "retry_count": int(app["retry_count"]),
            "is_retry": app["is_retry"] == "True",
            "month": int(app["month"]),
            **result,
        })
    
    # Rank by score (descending)
    scored.sort(key=lambda x: x["score"], reverse=True)
    for rank, s in enumerate(scored, 1):
        s["rank"] = rank
        s["percentile"] = round((1 - rank / len(scored)) * 100, 1)
    
    print(f"  Score range: {scored[-1]['score']:.1f} - {scored[0]['score']:.1f}")
    print(f"  Mean score: {sum(s['score'] for s in scored)/len(scored):.1f}")
    
    return scored


def compute_summary(scored):
    """Compute aggregate statistics for the frontend dashboard."""
    
    total = len(scored)
    
    # Score distribution
    scores = [s["score"] for s in scored]
    score_hist = Counter()
    for sc in scores:
        bucket = int(sc // 10) * 10
        score_hist[bucket] += 1
    
    # By status
    by_status = defaultdict(lambda: {"count": 0, "avg_score": 0, "total_amount": 0, "scores": []})
    for s in scored:
        st = s["status"]
        by_status[st]["count"] += 1
        by_status[st]["total_amount"] += s["amount"]
        by_status[st]["scores"].append(s["score"])
    
    for st in by_status:
        scores_list = by_status[st]["scores"]
        by_status[st]["avg_score"] = round(sum(scores_list) / len(scores_list), 1)
        del by_status[st]["scores"]
    
    # By oblast
    by_oblast = defaultdict(lambda: {"count": 0, "avg_score": 0, "total_amount": 0, "scores": []})
    for s in scored:
        o = s["oblast"]
        by_oblast[o]["count"] += 1
        by_oblast[o]["total_amount"] += s["amount"]
        by_oblast[o]["scores"].append(s["score"])
    
    for o in by_oblast:
        scores_list = by_oblast[o]["scores"]
        by_oblast[o]["avg_score"] = round(sum(scores_list) / len(scores_list), 1)
        del by_oblast[o]["scores"]
    
    # By category
    by_cat = defaultdict(lambda: {"count": 0, "avg_score": 0, "scores": []})
    for s in scored:
        c = s["category"]
        by_cat[c]["count"] += 1
        by_cat[c]["scores"].append(s["score"])
    
    for c in by_cat:
        scores_list = by_cat[c]["scores"]
        by_cat[c]["avg_score"] = round(sum(scores_list) / len(scores_list), 1)
        del by_cat[c]["scores"]
    
    # Fraud flags
    high_risk = sum(1 for s in scored if s["flags"]["high_fraud_risk"])
    audit_required = sum(1 for s in scored if s["flags"]["requires_audit"])
    
    # FIFO vs Merit simulation
    # Take applications with status "Сформировано поручение" (waiting for budget)
    # Compare FIFO ordering (by date) vs Merit ordering (by score)
    pending = [s for s in scored if s["status"] == "Сформировано поручение"]
    pending_fifo = sorted(pending, key=lambda x: x["submit_date"])
    pending_merit = sorted(pending, key=lambda x: x["score"], reverse=True)
    
    # If budget allows only top 50% of pending:
    half = len(pending) // 2
    if half > 0:
        fifo_top = pending_fifo[:half]
        merit_top = pending_merit[:half]
        
        fifo_avg_score = round(sum(s["score"] for s in fifo_top) / len(fifo_top), 1)
        merit_avg_score = round(sum(s["score"] for s in merit_top) / len(merit_top), 1)
        
        fifo_small = sum(1 for s in fifo_top if s["amount"] < 5_000_000)
        merit_small = sum(1 for s in merit_top if s["amount"] < 5_000_000)
        
        fifo_total_amount = sum(s["amount"] for s in fifo_top)
        merit_total_amount = sum(s["amount"] for s in merit_top)
    else:
        fifo_avg_score = merit_avg_score = 0
        fifo_small = merit_small = 0
        fifo_total_amount = merit_total_amount = 0
    
    # Gini coefficient calculation
    def gini(values):
        if not values or sum(values) == 0:
            return 0
        sorted_vals = sorted(values)
        n = len(sorted_vals)
        total = sum(sorted_vals)
        cum = 0
        gini_sum = 0
        for i, v in enumerate(sorted_vals):
            cum += v
            gini_sum += (2 * (i + 1) - n - 1) * v
        return round(gini_sum / (n * total), 4)
    
    # District-level Gini (current FIFO vs merit-based)
    district_amounts_fifo = defaultdict(float)
    district_amounts_merit = defaultdict(float)
    
    executed = [s for s in scored if s["status"] in ("Исполнена", "Одобрена")]
    for s in executed:
        district_amounts_fifo[s["district"]] += s["amount"]
    
    # Merit reranking: sort executed by score, reallocate
    executed_merit = sorted(executed, key=lambda x: x["score"], reverse=True)
    for s in executed_merit:
        district_amounts_merit[s["district"]] += s["amount"]
    
    current_gini = gini(list(district_amounts_fifo.values()))
    
    # Triage distribution
    triage_dist = Counter(s["triage"] for s in scored)
    
    # Exception points distribution
    exception_dist = Counter()
    for s in scored:
        for reason in s.get("exception_reasons", []):
            exception_dist[reason] += 1
    
    summary = {
        "total_applications": total,
        "total_amount_billion": round(sum(s["amount"] for s in scored) / 1e9, 1),
        "score_distribution": dict(sorted(score_hist.items())),
        "score_stats": {
            "min": round(min(scores), 1),
            "max": round(max(scores), 1),
            "mean": round(sum(scores) / len(scores), 1),
            "median": round(sorted(scores)[len(scores) // 2], 1),
        },
        "by_status": dict(by_status),
        "by_oblast": dict(by_oblast),
        "by_category": dict(by_cat),
        "fraud_analysis": {
            "high_risk_count": high_risk,
            "audit_required_count": audit_required,
            "high_risk_pct": round(high_risk / total * 100, 1),
        },
        "fifo_vs_merit": {
            "pending_count": len(pending),
            "simulated_budget_pct": 50,
            "fifo": {
                "avg_score": fifo_avg_score,
                "small_farmer_count": fifo_small,
                "total_amount": fifo_total_amount,
            },
            "merit": {
                "avg_score": merit_avg_score,
                "small_farmer_count": merit_small,
                "total_amount": merit_total_amount,
            },
            "improvement": {
                "avg_score_delta": round(merit_avg_score - fifo_avg_score, 1),
                "small_farmer_delta": merit_small - fifo_small,
            },
        },
        "gini": {
            "current_district_gini": current_gini,
        },
        "retry_analysis": {
            "total_retries": sum(1 for s in scored if s["is_retry"]),
            "retry_pct": round(sum(1 for s in scored if s["is_retry"]) / total * 100, 1),
            "avg_score_first": round(sum(s["score"] for s in scored if not s["is_retry"]) / max(sum(1 for s in scored if not s["is_retry"]), 1), 1),
            "avg_score_retry": round(sum(s["score"] for s in scored if s["is_retry"]) / max(sum(1 for s in scored if s["is_retry"]), 1), 1),
        },
        "triage_distribution": dict(triage_dist),
        "exception_points": dict(exception_dist),
    }
    
    return summary


def save_results(scored, summary):
    """Save scored applications and summary to JSON."""
    
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Full scored applications (for analysis)
    scored_path = os.path.join(OUTPUT_DIR, "scored_applications.json")
    with open(scored_path, "w", encoding="utf-8") as f:
        json.dump(scored, f, ensure_ascii=False, indent=None)
    print(f"\nSaved: {scored_path} ({os.path.getsize(scored_path)/1e6:.1f} MB)")
    
    # Summary for dashboard
    summary_path = os.path.join(OUTPUT_DIR, "scoring_summary.json")
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(f"Saved: {summary_path}")
    
    # === FRONTEND DATA FILES ===
    frontend_dir = os.path.join(os.path.dirname(OUTPUT_DIR), "..", "agroscore", "public", "data")
    os.makedirs(frontend_dir, exist_ok=True)
    
    # Copy summary
    import shutil
    shutil.copy2(summary_path, os.path.join(frontend_dir, "scoring_summary.json"))
    
    # Lightweight all-apps JSON for frontend table (compact keys)
    all_apps = []
    for s in scored:
        c = s["components"]
        all_apps.append({
            "r": s["rank"],
            "s": s["score"],
            "p": s["percentile"],
            "t": s["triage"],
            "sc": c["strategic"],
            "fc": c["fairness"],
            "nc": c["need"],
            "ec": c["efficiency"],
            "fr": c["fraud_risk"],
            "ex": c.get("exception", 0),
            "o": s["oblast"],
            "d": s["district"],
            "amt": s["amount"],
            "st": s["status"],
            "retry": s["retry_count"],
            "cat": s["category"],
            "code": s["subsidy_code"],
            "vol": s["volume"],
            "date": s["submit_date"][:10] if s["submit_date"] else "",
        })
    
    apps_path = os.path.join(frontend_dir, "all_apps.json")
    with open(apps_path, "w", encoding="utf-8") as f:
        json.dump(all_apps, f, ensure_ascii=False, indent=None)
    print(f"Saved: {apps_path} ({os.path.getsize(apps_path)/1e6:.1f} MB)")
    
    # District aggregates for PreCheck (district → {reject_rate, top1_share, avg_score, count})
    district_agg = {}
    from collections import defaultdict as dd
    d_data = dd(lambda: {"scores": [], "amounts": [], "count": 0, "rejected": 0})
    for s in scored:
        dk = s["district"]
        d_data[dk]["scores"].append(s["score"])
        d_data[dk]["amounts"].append(s["amount"])
        d_data[dk]["count"] += 1
        if s["status"] == "Отклонена":
            d_data[dk]["rejected"] += 1
    
    for dk, dd_val in d_data.items():
        total_amt = sum(dd_val["amounts"])
        max_amt = max(dd_val["amounts"]) if dd_val["amounts"] else 0
        district_agg[dk] = {
            "count": dd_val["count"],
            "avg_score": round(sum(dd_val["scores"]) / len(dd_val["scores"]), 1),
            "reject_rate": round(dd_val["rejected"] / dd_val["count"], 3) if dd_val["count"] > 0 else 0,
            "top1_share": round(max_amt / total_amt, 3) if total_amt > 0 else 0,
            "median_amount": round(sorted(dd_val["amounts"])[len(dd_val["amounts"]) // 2]),
        }
    
    districts_path = os.path.join(frontend_dir, "districts.json")
    with open(districts_path, "w", encoding="utf-8") as f:
        json.dump(district_agg, f, ensure_ascii=False, indent=None)
    print(f"Saved: {districts_path} ({os.path.getsize(districts_path)/1e3:.0f} KB)")
    
    # Oblast→districts mapping for PreCheck form
    oblast_districts = dd(set)
    for s in scored:
        oblast_districts[s["oblast"]].add(s["district"])
    mapping = {o: sorted(list(ds)) for o, ds in oblast_districts.items()}
    mapping_path = os.path.join(frontend_dir, "oblast_districts.json")
    with open(mapping_path, "w", encoding="utf-8") as f:
        json.dump(mapping, f, ensure_ascii=False, indent=None)
    print(f"Saved: {mapping_path}")
    
    # Subsidy codes for PreCheck form
    code_data = dd(lambda: {"name": "", "count": 0, "avg_amount": 0, "amounts": []})
    for s in scored:
        ck = s["subsidy_code"]
        code_data[ck]["name"] = s["subsidy_name"][:80] if s["subsidy_name"] else ck
        code_data[ck]["count"] += 1
        code_data[ck]["amounts"].append(s["amount"])
    
    codes = {}
    for ck, cv in code_data.items():
        codes[ck] = {
            "name": cv["name"],
            "count": cv["count"],
            "avg_amount": round(sum(cv["amounts"]) / len(cv["amounts"])),
            "median_amount": round(sorted(cv["amounts"])[len(cv["amounts"]) // 2]),
        }
    
    codes_path = os.path.join(frontend_dir, "subsidy_codes.json")
    with open(codes_path, "w", encoding="utf-8") as f:
        json.dump(codes, f, ensure_ascii=False, indent=2)
    print(f"Saved: {codes_path}")
    
    return scored_path, summary_path


def print_results(scored, summary):
    """Print key results to console."""
    
    print("\n" + "=" * 70)
    print("SCORING RESULTS")
    print("=" * 70)
    
    ss = summary["score_stats"]
    print(f"\nScore distribution: min={ss['min']}, max={ss['max']}, mean={ss['mean']}, median={ss['median']}")
    
    print(f"\nScore histogram:")
    for bucket, count in sorted(summary["score_distribution"].items(), key=lambda x: int(x[0])):
        bar = "█" * (count // 100)
        print(f"  {int(bucket):>3}-{int(bucket)+9:<3}: {count:>5} {bar}")
    
    print(f"\nAverage score by status:")
    for st, data in sorted(summary["by_status"].items(), key=lambda x: x[1]["avg_score"], reverse=True):
        print(f"  {st:<30} avg={data['avg_score']:>5.1f}  n={data['count']:>6,}")
    
    print(f"\nAverage score by oblast (top/bottom 5):")
    oblast_sorted = sorted(summary["by_oblast"].items(), key=lambda x: x[1]["avg_score"], reverse=True)
    for o, data in oblast_sorted[:5]:
        print(f"  ⬆ {o:<30} avg={data['avg_score']:>5.1f}  n={data['count']:>5,}")
    print("  ...")
    for o, data in oblast_sorted[-5:]:
        print(f"  ⬇ {o:<30} avg={data['avg_score']:>5.1f}  n={data['count']:>5,}")
    
    fa = summary["fraud_analysis"]
    print(f"\nFraud analysis:")
    print(f"  High risk: {fa['high_risk_count']} ({fa['high_risk_pct']}%)")
    print(f"  Audit required: {fa['audit_required_count']}")
    
    fvm = summary["fifo_vs_merit"]
    print(f"\nFIFO vs Merit (pending={fvm['pending_count']}, budget=50%):")
    print(f"  FIFO:  avg_score={fvm['fifo']['avg_score']}, small_farmers={fvm['fifo']['small_farmer_count']}")
    print(f"  Merit: avg_score={fvm['merit']['avg_score']}, small_farmers={fvm['merit']['small_farmer_count']}")
    print(f"  Delta: score +{fvm['improvement']['avg_score_delta']}, small_farmers +{fvm['improvement']['small_farmer_delta']}")
    
    print(f"\nGini (district-level): {summary['gini']['current_district_gini']}")
    
    ra = summary["retry_analysis"]
    print(f"\nRetry analysis:")
    print(f"  Retries: {ra['total_retries']} ({ra['retry_pct']}%)")
    print(f"  Avg score (first attempt): {ra['avg_score_first']}")
    print(f"  Avg score (retries): {ra['avg_score_retry']}")
    
    # Top 5 scored applications
    print(f"\nTop 5 scored applications:")
    for s in scored[:5]:
        c = s["components"]
        print(f"  #{s['rank']} score={s['score']:>5.1f} | "
              f"S={c['strategic']:.0f} F={c['fairness']:.0f} N={c['need']:.0f} "
              f"E={c['efficiency']:.0f} FR={c['fraud_risk']:.0f} | "
              f"{s['oblast'][:15]} | {s['amount']/1e6:.1f}M | {s['status']}")
    
    print(f"\nBottom 5 scored applications:")
    for s in scored[-5:]:
        c = s["components"]
        print(f"  #{s['rank']} score={s['score']:>5.1f} | "
              f"S={c['strategic']:.0f} F={c['fairness']:.0f} N={c['need']:.0f} "
              f"E={c['efficiency']:.0f} FR={c['fraud_risk']:.0f} | "
              f"{s['oblast'][:15]} | {s['amount']/1e6:.1f}M | {s['status']}")


if __name__ == "__main__":
    scored = run_scoring()
    summary = compute_summary(scored)
    save_results(scored, summary)
    print_results(scored, summary)
