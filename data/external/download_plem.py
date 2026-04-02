"""
Bulk downloader for subsidy.plem.kz application registries.
Downloads all application records for specified years via the public API.
"""
import json
import urllib.request
import ssl
import time
import os
import csv
import sys

# SSL context (stat.gov.kz uses self-signed cert)
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

API_URL = "https://subsidy.plem.kz/MainPage/MainStatic.aspx/GetRegistrApp"
OUT_DIR = os.path.dirname(os.path.abspath(__file__)) + "/subsidy_plem_kz"
LIMIT = 100  # records per page (max that works)
DELAY = 0.3  # seconds between requests (be respectful)

FIELDS = [
    "RowNum", "SendDate", "State", "Enterprise", "BidNumber",
    "BidStatus", "SubsidiesName", "AkimatUshName", "SubsidiesOwedSum", "Solution"
]


def fetch_page(year: str, page: int) -> list:
    payload = json.dumps({
        "filterData": {
            "lang": 1, "Year": year,
            "State": "", "Enterprise": "", "BidNumber": "",
            "BidStatus": "-1", "SubsidiesName": "", "AkimatUshName": "",
            "Start": page, "Limit": LIMIT
        }
    }).encode()

    req = urllib.request.Request(API_URL, data=payload, headers={"Content-Type": "application/json"})
    resp = urllib.request.urlopen(req, context=CTX, timeout=30)
    data = json.loads(resp.read())
    return data.get("d", [])


def download_year(year: str):
    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR, f"registry_{year}.csv")
    
    # Get total
    first_page = fetch_page(year, 1)
    if not first_page:
        print(f"Year {year}: no data")
        return
    
    total = first_page[0]["Total"]
    pages = first_page[0]["Pages"]
    print(f"Year {year}: {total} records, {pages} pages")
    
    # Check if we already have partial download
    start_page = 1
    existing_rows = 0
    if os.path.exists(out_path):
        with open(out_path, 'r', encoding='utf-8') as f:
            existing_rows = sum(1 for _ in f) - 1  # minus header
        if existing_rows >= total:
            print(f"  Already complete ({existing_rows} rows)")
            return
        start_page = (existing_rows // LIMIT) + 1
        print(f"  Resuming from page {start_page} ({existing_rows} rows already downloaded)")
    
    mode = 'a' if start_page > 1 else 'w'
    with open(out_path, mode, newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS, extrasaction='ignore')
        if start_page == 1:
            writer.writeheader()
            for rec in first_page:
                writer.writerow(rec)
            start_page = 2
        
        for page in range(start_page, pages + 1):
            try:
                records = fetch_page(year, page)
                for rec in records:
                    writer.writerow(rec)
                
                if page % 50 == 0 or page == pages:
                    downloaded = min(page * LIMIT, total)
                    pct = downloaded / total * 100
                    print(f"  Page {page}/{pages} ({pct:.1f}%) - {downloaded}/{total} records")
                
                time.sleep(DELAY)
            except Exception as e:
                print(f"  ERROR on page {page}: {e}")
                time.sleep(2)
                # Retry once
                try:
                    records = fetch_page(year, page)
                    for rec in records:
                        writer.writerow(rec)
                except Exception as e2:
                    print(f"  RETRY FAILED on page {page}: {e2}")
                    break
    
    # Verify
    with open(out_path, 'r', encoding='utf-8') as f:
        final_rows = sum(1 for _ in f) - 1
    print(f"  Done: {final_rows} rows saved to {out_path}")


if __name__ == "__main__":
    years = sys.argv[1:] if len(sys.argv) > 1 else ["2024"]
    for year in years:
        download_year(year)
        print()
