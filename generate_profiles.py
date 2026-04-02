"""
Generate 200 synthetic farmer profiles for the Proactive Subsidy Finder.
Reads real district names from oblast_districts.json.
Output: agroscore/public/data/farmer_profiles.json
"""

import json
import os
import random
import math

BASE = os.path.dirname(os.path.abspath(__file__))
OBLAST_DISTRICTS = os.path.join(BASE, "agroscore/public/data/oblast_districts.json")
OUTPUT = os.path.join(BASE, "agroscore/public/data/farmer_profiles.json")

# Kazakh farm name parts
PREFIXES = ["КХ", "ТОО", "ИП", "КФХ", "СПК"]
NAMES = [
    "Абай-Агро", "Жайлау", "Нұр-Фарм", "Степной", "Алтын Дала",
    "Бейбарыс", "Шаңырақ", "Жұлдыз", "Қазына", "Береке",
    "Тұлпар", "Арай", "Мәңгілік", "Сарыарқа", "Қоңыр",
    "Ақ Бидай", "Көкше", "Жетісу Фарм", "Мұрагер", "Достық",
    "Еңбек", "Отандастар", "Байтерек", "Қайнар", "Жаңа Күн",
    "Алтай-Агро", "Тобыл", "Ертіс", "Сыр-Дария", "Қаратау",
    "Шұбар", "Ақжар", "Көкөзек", "Сайрам", "Бұлақ",
    "Жаңарту", "Мерей", "Қарлығаш", "Маңғыстау Фарм", "Арал",
]


def generate_bin():
    """Generate a realistic 12-digit BIN."""
    year = random.choice(["05", "08", "10", "12", "15", "18", "20"])
    month = f"{random.randint(1, 12):02d}"
    rest = f"{random.randint(10000, 99999):05d}"
    check = str(random.randint(0, 9))
    return f"{year}{month}{random.choice(['4', '5', '6'])}{rest}{check}"


def generate_profile(idx, oblast, district):
    """Generate one farmer profile."""
    
    # Determine farm type
    farm_type = random.choices(
        ["small_cattle", "medium_cattle", "large_cattle", "sheep_focus",
         "poultry", "dairy", "mixed", "horse", "camel", "pig", "honey"],
        weights=[20, 15, 8, 15, 7, 12, 10, 4, 3, 3, 3],
        k=1
    )[0]
    
    prefix = random.choice(PREFIXES)
    name = random.choice(NAMES)
    
    # Base land
    if farm_type in ("small_cattle", "honey"):
        land = random.randint(10, 120)
    elif farm_type in ("medium_cattle", "dairy", "mixed"):
        land = random.randint(100, 1200)
    elif farm_type == "large_cattle":
        land = random.randint(800, 5000)
    elif farm_type == "sheep_focus":
        land = random.randint(50, 2000)
    elif farm_type == "poultry":
        land = random.randint(5, 50)
    elif farm_type == "pig":
        land = random.randint(10, 100)
    elif farm_type == "horse":
        land = random.randint(200, 3000)
    elif farm_type == "camel":
        land = random.randint(300, 4000)
    else:
        land = random.randint(50, 500)
    
    pasture = int(land * random.uniform(0.5, 0.9))
    
    # Livestock
    cattle = 0
    dairy_cows = 0
    sheep = 0
    goats = 0
    horses = 0
    camels = 0
    poultry = 0
    pigs = 0
    
    if farm_type == "small_cattle":
        cattle = random.randint(5, 50)
        dairy_cows = random.randint(0, min(cattle, 20))
        sheep = random.randint(0, 30)
        horses = random.randint(0, 5)
    elif farm_type == "medium_cattle":
        cattle = random.randint(50, 500)
        dairy_cows = random.randint(10, min(cattle, 150))
        sheep = random.randint(0, 100)
        horses = random.randint(0, 20)
    elif farm_type == "large_cattle":
        cattle = random.randint(500, 3000)
        dairy_cows = random.randint(50, min(cattle, 800))
        sheep = random.randint(0, 200)
        horses = random.randint(5, 50)
    elif farm_type == "sheep_focus":
        sheep = random.randint(50, 2000)
        goats = random.randint(0, int(sheep * 0.3))
        cattle = random.randint(0, 30)
        dairy_cows = random.randint(0, min(cattle, 10))
        horses = random.randint(0, 10)
    elif farm_type == "poultry":
        poultry = random.randint(500, 50000)
        cattle = random.randint(0, 5)
    elif farm_type == "dairy":
        cattle = random.randint(30, 300)
        dairy_cows = random.randint(int(cattle * 0.5), cattle)
        sheep = random.randint(0, 20)
    elif farm_type == "mixed":
        cattle = random.randint(20, 200)
        dairy_cows = random.randint(5, min(cattle, 80))
        sheep = random.randint(10, 200)
        goats = random.randint(0, 50)
        horses = random.randint(0, 15)
        poultry = random.randint(0, 200)
    elif farm_type == "horse":
        horses = random.randint(20, 300)
        cattle = random.randint(0, 30)
        sheep = random.randint(0, 50)
    elif farm_type == "camel":
        camels = random.randint(10, 200)
        sheep = random.randint(0, 100)
        horses = random.randint(0, 20)
    elif farm_type == "pig":
        pigs = random.randint(20, 500)
        cattle = random.randint(0, 10)
    elif farm_type == "honey":
        # Beekeepers typically have minimal livestock
        cattle = random.randint(0, 5)
        sheep = random.randint(0, 10)
    
    # Daily milk (liters)
    if dairy_cows > 0:
        yield_per_cow = random.uniform(8, 25)
        daily_milk = round(dairy_cows * yield_per_cow, 1)
    elif horses > 10 and farm_type == "horse":
        daily_milk = round(random.randint(3, 8) * random.uniform(0.3, 0.5) * horses, 1)
    elif camels > 5:
        daily_milk = round(random.randint(2, 5) * random.uniform(0.3, 0.5) * camels, 1)
    else:
        daily_milk = 0
    
    # Annual meat (kg live weight)
    total_livestock = cattle + sheep + goats + horses + camels + pigs
    if total_livestock > 0:
        annual_meat = round(total_livestock * random.uniform(20, 80))
    elif poultry > 0:
        annual_meat = round(poultry * random.uniform(1.5, 3.0))
    else:
        annual_meat = 0
    
    # Mortality rate (% per year)
    # ~30% of profiles will have above-norm mortality
    if random.random() < 0.3:
        mortality = round(random.uniform(4.0, 12.0), 1)  # above norm
    else:
        mortality = round(random.uniform(1.0, 4.0), 1)  # normal range
    
    # Infrastructure
    total_large = cattle + horses + camels
    total_small = sheep + goats
    needed_capacity = total_large + int(total_small * 0.3)  # sheep need less barn space
    
    # ~15% have insufficient barn capacity
    if random.random() < 0.15:
        barn_capacity = max(5, int(needed_capacity * random.uniform(0.3, 0.7)))
    else:
        barn_capacity = max(5, int(needed_capacity * random.uniform(0.8, 1.3)))
    
    barns = max(1, barn_capacity // random.randint(20, 100))
    
    milking_equipment = dairy_cows >= 10 and random.random() < 0.85
    # ~15% of dairy farmers lack equipment
    if dairy_cows >= 10 and random.random() < 0.15:
        milking_equipment = False
    
    # Feed storage
    feed_needed = cattle * 3.0 + sheep * 0.5 + horses * 2.5 + goats * 0.4
    if feed_needed > 0:
        feed_storage = round(feed_needed * random.uniform(0.5, 1.5), 1)
    else:
        feed_storage = round(random.uniform(0, 10), 1)
    
    # Credit history
    credit = random.choices(
        ["good", "fair", "poor"],
        weights=[55, 30, 15],
        k=1
    )[0]
    
    # Previous subsidies (0-5 codes)
    all_codes = [
        "00100", "00400", "00700", "01200", "01300", "01700", "01900",
        "02000", "02200", "03100", "04000", "04500", "05801", "11500"
    ]
    prev_count = random.choices([0, 1, 2, 3, 4], weights=[30, 30, 20, 15, 5], k=1)[0]
    previous_subsidies = random.sample(all_codes, min(prev_count, len(all_codes)))
    
    # Capacity analysis: check if land is sufficient
    land_used = (
        cattle * 3.0 +
        sheep * 0.5 +
        goats * 0.6 +
        horses * 4.0 +
        camels * 6.0 +
        poultry * 0.005 +
        pigs * 0.02
    )
    
    # ~30% will have land overutilization (for interesting recommendations)
    if random.random() < 0.3 and total_livestock > 10:
        # Reduce land to create capacity pressure
        land = max(5, int(land_used * random.uniform(0.4, 0.85)))
        pasture = int(land * random.uniform(0.5, 0.9))
    
    return {
        "id": f"F-{idx:03d}",
        "bin": generate_bin(),
        "name": f"{prefix} «{name}»",
        "oblast": oblast,
        "district": district,
        "farm_type": farm_type,
        "land_hectares": land,
        "pasture_hectares": pasture,
        "livestock": {
            "cattle": cattle,
            "dairy_cows": dairy_cows,
            "sheep": sheep,
            "goats": goats,
            "horses": horses,
            "camels": camels,
            "poultry": poultry,
            "pigs": pigs
        },
        "daily_milk_liters": daily_milk,
        "annual_meat_kg": annual_meat,
        "mortality_rate_pct": mortality,
        "infrastructure": {
            "barns": barns,
            "barn_capacity": barn_capacity,
            "milking_equipment": milking_equipment,
            "feed_storage_tons": feed_storage
        },
        "credit_history": credit,
        "previous_subsidies": previous_subsidies,
        "active_subsidy_count": random.choices([0, 1, 2, 3], weights=[40, 35, 20, 5], k=1)[0]
    }


def main():
    with open(OBLAST_DISTRICTS, "r", encoding="utf-8") as f:
        oblast_districts = json.load(f)
    
    oblasts = list(oblast_districts.keys())
    
    profiles = []
    for i in range(200):
        oblast = random.choice(oblasts)
        districts = oblast_districts[oblast]
        district = random.choice(districts) if districts else ""
        profile = generate_profile(i + 1, oblast, district)
        profiles.append(profile)
    
    # Sort by ID
    profiles.sort(key=lambda p: p["id"])
    
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(profiles, f, ensure_ascii=False, indent=2)
    
    # Stats
    types = {}
    for p in profiles:
        t = p["farm_type"]
        types[t] = types.get(t, 0) + 1
    
    print(f"Generated {len(profiles)} farmer profiles → {OUTPUT}")
    print(f"\nFarm type distribution:")
    for t, c in sorted(types.items(), key=lambda x: -x[1]):
        print(f"  {t}: {c}")
    
    # Capacity stats
    over_capacity = sum(1 for p in profiles
        if (p["livestock"]["cattle"] * 3.0 +
            p["livestock"]["sheep"] * 0.5 +
            p["livestock"]["goats"] * 0.6 +
            p["livestock"]["horses"] * 4.0 +
            p["livestock"]["camels"] * 6.0) > p["pasture_hectares"])
    print(f"\nProfiles with land overutilization: {over_capacity} ({over_capacity/len(profiles)*100:.0f}%)")
    
    high_mortality = sum(1 for p in profiles if p["mortality_rate_pct"] > 5.0)
    print(f"Profiles with above-norm mortality: {high_mortality} ({high_mortality/len(profiles)*100:.0f}%)")
    
    no_milking = sum(1 for p in profiles
        if p["livestock"]["dairy_cows"] >= 10 and not p["infrastructure"]["milking_equipment"])
    print(f"Dairy farms without milking equipment: {no_milking}")


if __name__ == "__main__":
    random.seed(42)  # Reproducible
    main()
