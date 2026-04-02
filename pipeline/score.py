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
    2. Volume relative to type median (normalized by subsidy type)
    3. Small farmer bonus (by volume percentile within type)
    """
    # Factor 1: Monopolization (max 40 pts)
    top1_share = float(app.get("district_top1_share", 0))
    
    # Use per-type volume ratio (not broken cross-type amount_vs_median)
    vol_ratio = float(app.get("volume_vs_type_median", 1))
    
    if top1_share > 0.5:
        # District is monopolized
        if vol_ratio < 1.5:
            # Smaller applicant in monopolized district = fairness bonus
            monopoly_score = 35
        else:
            # Larger applicant in monopolized district = penalty
            monopoly_score = 10
    elif top1_share > 0.2:
        monopoly_score = 25
    else:
        monopoly_score = 20  # well-distributed district
    
    # Factor 2: Volume relative to type median (max 30 pts)
    # Comparing within same subsidy type — apples to apples
    if vol_ratio < 0.5:
        size_score = 25  # small herd = fairness bonus
    elif vol_ratio < 1.5:
        size_score = 30  # around median = good
    elif vol_ratio < 3.0:
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
    
    # Factor 3: Amount reasonableness vs type median (max 25 pts)
    ratio = float(app.get("amount_vs_type_median", 1))
    if 0.3 <= ratio <= 2.0:
        amount_score = 25  # reasonable range for this subsidy type
    elif 0.1 <= ratio <= 5.0:
        amount_score = 15
    else:
        amount_score = 5  # extreme outlier within type
    
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
    6. Machine Learning Anomaly Score
    
    NOTE: Weekend submission removed — data shows +0.2pp reject rate
    delta (8.1% weekend vs 7.9% weekday), which is noise.
    """
    risk = 0
    
    # ML Anomaly Factor (max 40)
    anomaly_score = float(app.get("anomaly_score", 0))
    if anomaly_score > 70:
        risk += 40
    elif anomaly_score > 50:
        risk += 20
    elif anomaly_score > 30:
        risk += 10
    
    # Round million amounts (max 15) — skip if amount is norm-derived (volume × norm)
    is_norm = int(app.get("is_norm_amount", 0))
    if not is_norm:
        if int(app.get("is_round_million", 0)):
            risk += 15
        elif int(app.get("is_round_100k", 0)):
            risk += 5
    
    # Extreme volume outlier vs type median (max 25)
    ratio = float(app.get("volume_vs_type_median", 1))
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
    
    # First-time applicant in high-retry district (+3)
    # Only meaningful when district has high retry rate (>40%), making first-timers exceptional
    retry = int(app.get("retry_count", 0))
    district_reject_rate = float(app.get("district_reject_rate", 0))
    if retry == 0 and district_reject_rate > 0.15:
        points += 3
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
            "requires_audit": fraud > 70 or float(app.get("anomaly_score", 0)) > 80,
            "low_efficiency": efficiency < 30,
            "is_ml_anomalous": float(app.get("anomaly_score", 0)) > 70,
        },
    }


def run_scoring():
    """Load enriched data, score all applications, save results."""
    
    print("Loading enriched applications...")
    with open(INPUT_CSV, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        apps = list(reader)
    print(f"  {len(apps):,} applications loaded")
    
    # Load ML outputs
    anomaly_csv = os.path.join(BASE, "data/ml_outputs/anomaly_scores.csv")
    anomaly_dict = {}
    if os.path.exists(anomaly_csv):
        print("Loading Isolation Forest anomaly scores...")
        with open(anomaly_csv, "r", encoding="utf-8") as f:
            next(f) # skip header
            for line in f:
                parts = line.strip().split(',')
                if len(parts) == 2:
                    k = parts[0].lstrip('0')
                    anomaly_dict[k] = float(parts[1])
    
    # Score all
    print("Scoring...")
    scored = []
    for app in apps:
        app_key = app["app_number"].lstrip('0')
        app['anomaly_score'] = anomaly_dict.get(app_key, 0)
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
            "anomaly_score": app.get("anomaly_score", 0),
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
    anomalous_count = sum(1 for s in scored if s["flags"].get("is_ml_anomalous"))
    
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
    merit_gini = gini(list(district_amounts_merit.values()))
    
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
            "ml_anomalies_detected": anomalous_count,
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
            "merit_district_gini": merit_gini,
            "gini_delta": round(merit_gini - current_gini, 4),
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
            "ano": round(float(s.get("anomaly_score", 0)), 1),
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
    code_data = dd(lambda: {"name": "", "norm": 0, "count": 0, "amounts": [], "volumes": []})
    for s in scored:
        ck = s["subsidy_code"]
        code_data[ck]["name"] = s["subsidy_name"][:80] if s["subsidy_name"] else ck
        code_data[ck]["norm"] = s["norm"]
        code_data[ck]["count"] += 1
        code_data[ck]["amounts"].append(s["amount"])
        code_data[ck]["volumes"].append(s["volume"])
    
    codes = {}
    for ck, cv in code_data.items():
        sorted_vols = sorted(cv["volumes"])
        codes[ck] = {
            "name": cv["name"],
            "norm": cv["norm"],
            "count": cv["count"],
            "avg_amount": round(sum(cv["amounts"]) / len(cv["amounts"])),
            "median_amount": round(sorted(cv["amounts"])[len(cv["amounts"]) // 2]),
            "median_volume": sorted_vols[len(sorted_vols) // 2],
        }
    
    codes_path = os.path.join(frontend_dir, "subsidy_codes.json")
    with open(codes_path, "w", encoding="utf-8") as f:
        json.dump(codes, f, ensure_ascii=False, indent=2)
    print(f"Saved: {codes_path}")
    
    return scored_path, summary_path


def run_sensitivity_analysis(apps):
    """
    Sensitivity analysis: perturb each weight by ±0.05 (±25% relative)
    and measure impact on score distribution.
    """
    import copy
    
    print("\nRunning sensitivity analysis...")
    
    base_weights = dict(WEIGHTS)
    results = {}
    
    # Get baseline scores
    baseline_scores = []
    for app in apps:
        r = calculate_impact_score(app)
        baseline_scores.append(r["score"])
    baseline_mean = sum(baseline_scores) / len(baseline_scores)
    
    for weight_name in ["strategic", "fairness", "need", "efficiency", "fraud_penalty"]:
        deltas = {}
        for direction, delta in [("up", +0.05), ("down", -0.05)]:
            # Temporarily change weight
            original = WEIGHTS[weight_name]
            WEIGHTS[weight_name] = max(0, original + delta)
            
            perturbed_scores = []
            for app in apps:
                r = calculate_impact_score(app)
                perturbed_scores.append(r["score"])
            
            perturbed_mean = sum(perturbed_scores) / len(perturbed_scores)
            
            # Rank changes
            base_ranked = sorted(range(len(baseline_scores)), key=lambda i: baseline_scores[i], reverse=True)
            pert_ranked = sorted(range(len(perturbed_scores)), key=lambda i: perturbed_scores[i], reverse=True)
            base_rank = {idx: rank for rank, idx in enumerate(base_ranked)}
            pert_rank = {idx: rank for rank, idx in enumerate(pert_ranked)}
            rank_changes = [abs(base_rank[i] - pert_rank[i]) for i in range(len(apps))]
            avg_rank_change = sum(rank_changes) / len(rank_changes)
            
            deltas[direction] = {
                "weight_delta": round(delta, 3),
                "new_weight": round(WEIGHTS[weight_name], 3),
                "mean_score_delta": round(perturbed_mean - baseline_mean, 2),
                "avg_rank_change": round(avg_rank_change, 1),
                "max_rank_change": max(rank_changes),
            }
            
            # Restore
            WEIGHTS[weight_name] = original
        
        results[weight_name] = deltas
        print(f"  {weight_name}: up→mean {deltas['up']['mean_score_delta']:+.2f}, "
              f"down→mean {deltas['down']['mean_score_delta']:+.2f}, "
              f"avg rank Δ: {deltas['up']['avg_rank_change']:.0f}/{deltas['down']['avg_rank_change']:.0f}")
    
    return results


def run_backtesting(scored):
    """
    Basic backtesting: correlate scores with actual execution status.
    If the model has any signal, executed apps should score higher than rejected.
    """
    print("\nRunning backtesting...")
    
    status_groups = {
        "executed": [s for s in scored if s["status"] == "Исполнена"],
        "approved": [s for s in scored if s["status"] == "Одобрена"],
        "pending": [s for s in scored if s["status"] == "Сформировано поручение"],
        "rejected": [s for s in scored if s["status"] == "Отклонена"],
        "withdrawn": [s for s in scored if s["status"] == "Отозвано"],
    }
    
    group_stats = {}
    for name, group in status_groups.items():
        if not group:
            continue
        scores = [s["score"] for s in group]
        group_stats[name] = {
            "count": len(group),
            "mean_score": round(sum(scores) / len(scores), 2),
            "median_score": round(sorted(scores)[len(scores) // 2], 2),
            "min_score": round(min(scores), 2),
            "max_score": round(max(scores), 2),
        }
    
    # Point-biserial: executed (1) vs rejected (0)
    exec_scores = [s["score"] for s in status_groups.get("executed", [])]
    rej_scores = [s["score"] for s in status_groups.get("rejected", [])]
    
    correlation = None
    if exec_scores and rej_scores:
        all_scores = exec_scores + rej_scores
        all_labels = [1] * len(exec_scores) + [0] * len(rej_scores)
        n = len(all_scores)
        mean_score = sum(all_scores) / n
        mean_label = sum(all_labels) / n
        
        cov = sum((s - mean_score) * (l - mean_label) for s, l in zip(all_scores, all_labels)) / n
        std_score = (sum((s - mean_score) ** 2 for s in all_scores) / n) ** 0.5
        std_label = (sum((l - mean_label) ** 2 for l in all_labels) / n) ** 0.5
        
        if std_score > 0 and std_label > 0:
            correlation = round(cov / (std_score * std_label), 4)
    
    exec_mean = group_stats.get("executed", {}).get("mean_score", 0)
    rej_mean = group_stats.get("rejected", {}).get("mean_score", 0)
    delta = round(exec_mean - rej_mean, 2) if exec_mean and rej_mean else None
    
    print(f"  Executed mean: {exec_mean}, Rejected mean: {rej_mean}, Delta: {delta}")
    if correlation is not None:
        print(f"  Point-biserial correlation (exec vs rej): {correlation}")
    
    return {
        "by_status": group_stats,
        "executed_vs_rejected": {
            "delta": delta,
            "point_biserial_correlation": correlation,
            "note": "Positive delta means executed apps score higher than rejected (model has signal)"
        }
    }


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
    
    # Load raw apps for sensitivity analysis (need original features)
    apps = []
    with open(INPUT_CSV, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            apps.append(row)
    # Restore anomaly scores
    anomaly_csv = os.path.join(OUTPUT_DIR, "..", "ml_outputs", "anomaly_scores.csv")
    anomaly_dict = {}
    if os.path.exists(anomaly_csv):
        with open(anomaly_csv, "r", encoding="utf-8") as f:
            next(f)
            for line in f:
                parts = line.strip().split(',')
                if len(parts) == 2:
                    anomaly_dict[parts[0].lstrip('0')] = float(parts[1])
    for app in apps:
        app['anomaly_score'] = anomaly_dict.get(app.get("app_number", "").lstrip('0'), 0)
    
    summary["sensitivity"] = run_sensitivity_analysis(apps)
    summary["backtesting"] = run_backtesting(scored)
    
    save_results(scored, summary)
    print_results(scored, summary)
