"""
Analyze rejection reasons from plem.kz registry data (2021 + 2024).
Categorizes free-text rejection reasons into actionable categories per subsidy type.

Input:  data/external/subsidy_plem_kz/registry_2024.csv
        data/external/subsidy_plem_kz/registry_2021.csv
Output: data/processed/rejection_reasons.json
        agroscore/public/data/rejection_reasons.json
"""

import os
import csv
import json
import re
from collections import defaultdict, Counter

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REGISTRY_2024 = os.path.join(BASE, "external/subsidy_plem_kz/registry_2024.csv")
REGISTRY_2021 = os.path.join(BASE, "external/subsidy_plem_kz/registry_2021.csv")
OUTPUT_DIR = os.path.join(os.path.dirname(BASE), "data/processed")
FRONTEND_DIR = os.path.join(os.path.dirname(BASE), "agroscore/public/data")

# ═══════════════════════════════════════════════════════════════
# REJECTION REASON CATEGORIES
# ═══════════════════════════════════════════════════════════════

CATEGORIES = {
    "document_missing": {
        "label_ru": "Отсутствие документов",
        "label_en": "Missing documents",
        "keywords": [
            "не прикреплен", "не приобщен", "не загружается", "отсутствует документ",
            "не прикреплена", "не приобщена", "отсутствует копия", "не предоставлен",
            "не приложен", "не приложена", "не представлен", "не представлена",
            "отсутствует электронная", "не загружен",
        ],
        "advice_ru": "Убедитесь, что все обязательные документы загружены в систему перед подачей заявки",
    },
    "document_mismatch": {
        "label_ru": "Несоответствие данных в документах",
        "label_en": "Document data mismatch",
        "keywords": [
            "не соответствует", "несоответствие данных", "некорректно",
            "не совпадает", "расхождение", "различаются", "не сходятся",
            "указана неверно", "указано неверно", "ошибка в данных",
        ],
        "advice_ru": "Перепроверьте все числовые данные (суммы, объемы, поголовье) в документах — они должны совпадать между собой и с заявкой",
    },
    "payment_issue": {
        "label_ru": "Проблемы с платежными документами",
        "label_en": "Payment document issues",
        "keywords": [
            "оплата", "платежное поручение", "банковская выписка", "счет фактур",
            "ЭСФ", "эсф", "платеж", "без штампа банка", "оплачен",
            "перевод средств", "чек", "контрольно-кассов",
        ],
        "advice_ru": "Подготовьте полный пакет платежных документов: ЭСФ, платежные поручения со штампом банка, банковские выписки",
    },
    "criteria_mismatch": {
        "label_ru": "Несоответствие критериям субсидии",
        "label_en": "Subsidy criteria not met",
        "keywords": [
            "критериям", "условием является", "обязательным требованием",
            "не соответствует критериям", "не отвечает требованиям",
            "не выполнено условие", "требованиям правил",
        ],
        "advice_ru": "Изучите критерии Приложения 2 Правил субсидирования для вашего типа субсидии перед подачей",
    },
    "animal_id_issue": {
        "label_ru": "Проблемы с идентификацией животных",
        "label_en": "Animal identification issues",
        "keywords": [
            "ИНЖ", "идентификаци", "ИБСПР", "ИСЖ", "племенное свидетельство",
            "бирк", "номер животного", "не проходит", "не зарегистрирован",
            "племенной сертификат", "инвентарный номер",
        ],
        "advice_ru": "Проверьте регистрацию всех животных в ИСЖ/ИБСПР и соответствие ИНЖ номеров в документах",
    },
    "volume_mismatch": {
        "label_ru": "Расхождение объемов/количества",
        "label_en": "Volume/quantity discrepancy",
        "keywords": [
            "объем", "количество голов", "поголовь", "килограмм",
            "тонн", "литр", "живой вес", "не менее 200",
            "реализованный объем", "фактический объем",
        ],
        "advice_ru": "Убедитесь, что объемы в заявке точно соответствуют данным в ЭСФ и актах приема-передачи",
    },
    "contract_issue": {
        "label_ru": "Проблемы с договорами/актами",
        "label_en": "Contract/act issues",
        "keywords": [
            "договор", "акт приеме", "акт-приеме", "приложение №",
            "акт карантинир", "контракт", "соглашение",
            "акте приема", "акт передачи",
        ],
        "advice_ru": "Проверьте комплектность договора: все приложения, акты приема-передачи, описи должны быть приложены",
    },
    "registration_issue": {
        "label_ru": "Проблемы с регистрацией предприятия",
        "label_en": "Enterprise registration issues",
        "keywords": [
            "регистрац", "кооператив", "БИН", "лицензи",
            "свидетельство о регистрации", "юридическое лицо",
        ],
        "advice_ru": "Убедитесь, что ваше предприятие/кооператив зарегистрировано в соответствующих системах",
    },
    "budget_exhausted": {
        "label_ru": "Исчерпание бюджета",
        "label_en": "Budget exhausted",
        "keywords": [
            "бюджет", "средства выделен", "лимит", "финансирован",
            "бюджетных средств",
        ],
        "advice_ru": "Подавайте заявку в начале года, когда бюджет еще не исчерпан",
    },
}


def extract_reason(solution_text: str) -> str:
    """Extract the actual rejection reason from the Solution field."""
    if not solution_text or len(solution_text.strip()) < 10:
        return ""
    
    text = solution_text.strip()
    
    # Try to extract after "Причина отказа:"
    if "Причина отказа:" in text:
        text = text.split("Причина отказа:", 1)[1].strip()
    elif "причина отказа:" in text.lower():
        idx = text.lower().index("причина отказа:")
        text = text[idx + len("причина отказа:"):].strip()
    
    # Remove boilerplate suffix
    for suffix in [
        "В случае устранения причины отказа",
        "Вы имеете право на повторное обращение",
        "Вы имеете право обжаловать",
    ]:
        if suffix in text:
            text = text[:text.index(suffix)].strip()
    
    # Remove trailing punctuation
    text = text.rstrip(".,;: ")
    
    return text


def classify_reason(reason_text: str) -> list:
    """Classify a rejection reason into one or more categories."""
    if not reason_text:
        return ["other"]
    
    text_lower = reason_text.lower()
    matched = []
    
    for cat_id, cat_info in CATEGORIES.items():
        for keyword in cat_info["keywords"]:
            if keyword.lower() in text_lower:
                matched.append(cat_id)
                break
    
    return matched if matched else ["other"]


def extract_subsidy_code(bid_number: str) -> str:
    """Extract subsidy type code from BidNumber (first 5 digits)."""
    if bid_number and len(bid_number) >= 5:
        return bid_number[:5]
    return "unknown"


# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

def run():
    print("=" * 60)
    print("REJECTION REASON ANALYSIS")
    print("=" * 60)
    
    # Load all records from both registries
    all_records = []
    
    for filepath, year in [(REGISTRY_2024, "2024"), (REGISTRY_2021, "2021")]:
        if not os.path.exists(filepath):
            print(f"  WARNING: {filepath} not found, skipping")
            continue
        
        count = 0
        rejected = 0
        with open(filepath, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                count += 1
                status = row.get("BidStatus", "").strip()
                
                all_records.append({
                    "year": year,
                    "bid_number": row.get("BidNumber", ""),
                    "subsidy_code": extract_subsidy_code(row.get("BidNumber", "")),
                    "subsidy_name": row.get("SubsidiesName", ""),
                    "state": row.get("State", ""),
                    "enterprise": row.get("Enterprise", ""),
                    "status": status,
                    "amount": row.get("SubsidiesOwedSum", "0"),
                    "solution": row.get("Solution", ""),
                })
                
                if status == "Отклонена":
                    rejected += 1
        
        print(f"\n  {year}: {count:,} records, {rejected:,} rejected")
    
    print(f"\n  Total records: {len(all_records):,}")
    
    # ── Aggregate by subsidy code ──────────────────────────────────
    code_data = defaultdict(lambda: {
        "name": "",
        "total": 0,
        "rejected": 0,
        "approved": 0,
        "reasons": [],
        "category_counts": Counter(),
        "category_examples": defaultdict(list),
        "by_oblast": defaultdict(lambda: {"total": 0, "rejected": 0}),
    })
    
    for rec in all_records:
        code = rec["subsidy_code"]
        cd = code_data[code]
        cd["total"] += 1
        cd["name"] = rec["subsidy_name"][:100] if rec["subsidy_name"] else code
        
        oblast = rec["state"]
        cd["by_oblast"][oblast]["total"] += 1
        
        if rec["status"] == "Исполнена" or rec["status"] == "Принята":
            cd["approved"] += 1
        elif rec["status"] == "Отклонена":
            cd["rejected"] += 1
            cd["by_oblast"][oblast]["rejected"] += 1
            
            reason = extract_reason(rec["solution"])
            if reason and len(reason) > 15:
                categories = classify_reason(reason)
                cd["reasons"].append({
                    "text": reason[:300],
                    "categories": categories,
                    "oblast": oblast,
                    "year": rec["year"],
                })
                for cat in categories:
                    cd["category_counts"][cat] += 1
                    if len(cd["category_examples"][cat]) < 3:
                        cd["category_examples"][cat].append(reason[:200])
    
    # ── Build output JSON ──────────────────────────────────────────
    print("\n\n  Building output...")
    
    output = {
        "meta": {
            "sources": ["registry_2024.csv (95K records)", "registry_2021.csv (30K records)"],
            "total_records": len(all_records),
            "total_rejected": sum(cd["rejected"] for cd in code_data.values()),
            "total_with_reasons": sum(len(cd["reasons"]) for cd in code_data.values()),
            "categories": {
                cat_id: {
                    "label_ru": info["label_ru"],
                    "label_en": info["label_en"],
                    "advice_ru": info["advice_ru"],
                }
                for cat_id, info in CATEGORIES.items()
            },
        },
        "by_subsidy_code": {},
    }
    
    # Global category stats
    global_cats = Counter()
    total_categorized = 0
    
    for code in sorted(code_data.keys()):
        cd = code_data[code]
        if cd["total"] < 5:
            continue
        
        rejection_rate = cd["rejected"] / max(cd["total"], 1)
        
        # Build category breakdown
        categories = {}
        total_reasons = sum(cd["category_counts"].values())
        
        for cat_id in sorted(cd["category_counts"].keys(), key=lambda x: cd["category_counts"][x], reverse=True):
            count = cd["category_counts"][cat_id]
            categories[cat_id] = {
                "count": count,
                "pct": round(count / max(total_reasons, 1) * 100, 1),
                "examples": cd["category_examples"][cat_id],
            }
            global_cats[cat_id] += count
            total_categorized += count
        
        # Oblast breakdown (top 5 by rejection rate)
        oblast_stats = {}
        for oblast, odata in cd["by_oblast"].items():
            if odata["total"] >= 3:
                oblast_stats[oblast] = {
                    "total": odata["total"],
                    "rejected": odata["rejected"],
                    "rejection_rate": round(odata["rejected"] / odata["total"] * 100, 1),
                }
        
        # Sort oblasts by rejection rate desc, take top 5
        top_oblasts = dict(sorted(
            oblast_stats.items(),
            key=lambda x: x[1]["rejection_rate"],
            reverse=True,
        )[:5])
        
        # Generate advice based on top categories
        top_cats = sorted(cd["category_counts"].items(), key=lambda x: x[1], reverse=True)[:3]
        advice = []
        for cat_id, _ in top_cats:
            if cat_id in CATEGORIES:
                advice.append(CATEGORIES[cat_id]["advice_ru"])
            elif cat_id == "other":
                advice.append("Внимательно изучите требования Правил субсидирования для данного типа субсидии")
        
        output["by_subsidy_code"][code] = {
            "name": cd["name"],
            "total_applications": cd["total"],
            "rejected": cd["rejected"],
            "approved": cd["approved"],
            "rejection_rate_pct": round(rejection_rate * 100, 1),
            "reasons_analyzed": len(cd["reasons"]),
            "categories": categories,
            "top_risk_oblasts": top_oblasts,
            "advice": advice,
        }
    
    # Add global stats
    output["meta"]["global_category_distribution"] = {
        cat_id: {
            "count": global_cats[cat_id],
            "pct": round(global_cats[cat_id] / max(total_categorized, 1) * 100, 1),
        }
        for cat_id in sorted(global_cats.keys(), key=lambda x: global_cats[x], reverse=True)
    }
    
    # ── Save ───────────────────────────────────────────────────────
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(FRONTEND_DIR, exist_ok=True)
    
    # Save to data/processed/
    out_path = os.path.join(OUTPUT_DIR, "rejection_reasons.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"\n  Saved: {out_path}")
    
    # Save to frontend
    frontend_path = os.path.join(FRONTEND_DIR, "rejection_reasons.json")
    with open(frontend_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"  Saved: {frontend_path}")
    
    # ── Print summary ─────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("RESULTS")
    print("=" * 60)
    
    total_rej = output["meta"]["total_rejected"]
    total_reasons = output["meta"]["total_with_reasons"]
    print(f"\n  Total rejected: {total_rej:,}")
    print(f"  With parsed reasons: {total_reasons}")
    
    print(f"\n  Global rejection reason categories:")
    for cat_id, stats in output["meta"]["global_category_distribution"].items():
        label = CATEGORIES.get(cat_id, {}).get("label_ru", cat_id)
        print(f"    {label}: {stats['count']} ({stats['pct']}%)")
    
    print(f"\n  Top 10 subsidy codes by rejection rate:")
    sorted_codes = sorted(
        output["by_subsidy_code"].items(),
        key=lambda x: x[1]["rejection_rate_pct"],
        reverse=True,
    )
    for code, data in sorted_codes[:10]:
        print(f"    {code}: {data['rejection_rate_pct']:>5.1f}% rejected "
              f"({data['rejected']:>5}/{data['total_applications']:>6}) "
              f"| reasons: {data['reasons_analyzed']:>3} "
              f"| {data['name'][:50]}")
    
    print(f"\n  Codes with most analyzed reasons:")
    sorted_by_reasons = sorted(
        output["by_subsidy_code"].items(),
        key=lambda x: x[1]["reasons_analyzed"],
        reverse=True,
    )
    for code, data in sorted_by_reasons[:10]:
        if data["reasons_analyzed"] > 0:
            top_cat = max(data["categories"].items(), key=lambda x: x[1]["count"])[0] if data["categories"] else "none"
            label = CATEGORIES.get(top_cat, {}).get("label_ru", top_cat)
            print(f"    {code}: {data['reasons_analyzed']:>3} reasons | "
                  f"top: {label} | {data['name'][:50]}")


if __name__ == "__main__":
    run()
