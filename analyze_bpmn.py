"""
Analyze the AS-IS BPMN diagram for the livestock subsidy process.
Uses Tesseract OCR with tiled processing to handle the large image (21026x6102).
"""

import cv2
import numpy as np
from PIL import Image
import pytesseract
import json
import os

IMAGE_PATH = "1.AS IS Приобретение маточного поголовья КРС, овец, баранов-производителей.png"

def preprocess_tile(tile):
    """Enhance a tile for OCR."""
    gray = cv2.cvtColor(tile, cv2.COLOR_BGR2GRAY)
    # Mild sharpen
    kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
    gray = cv2.filter2D(gray, -1, kernel)
    # Binarize
    binary = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                    cv2.THRESH_BINARY, 21, 10)
    return binary

def extract_swim_lanes(img):
    """Detect horizontal swim lane separators."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Detect edges
    edges = cv2.Canny(gray, 30, 100)
    
    # Look for long horizontal lines
    h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (img.shape[1] // 3, 1))
    h_lines = cv2.morphologyEx(edges, cv2.MORPH_OPEN, h_kernel)
    
    # Accumulate y-coordinates
    row_sums = np.sum(h_lines > 0, axis=1)
    threshold = img.shape[1] // 5
    
    line_ys = np.where(row_sums > threshold)[0]
    
    if len(line_ys) == 0:
        return []
    
    # Cluster nearby y values
    clusters = []
    current = [line_ys[0]]
    for y in line_ys[1:]:
        if y - current[-1] < 20:
            current.append(y)
        else:
            clusters.append(int(np.mean(current)))
            current = [y]
    clusters.append(int(np.mean(current)))
    
    return clusters

def analyze_by_vertical_sections(img, n_cols=10):
    """Split image into vertical columns and OCR each."""
    h, w = img.shape[:2]
    col_w = w // n_cols
    results = []
    
    for i in range(n_cols):
        x_start = i * col_w
        x_end = min((i + 1) * col_w, w)
        section = img[:, x_start:x_end]
        
        # Preprocess
        processed = preprocess_tile(section)
        
        # OCR with Russian
        config = r'--oem 3 --psm 6 -l rus+eng'
        try:
            text = pytesseract.image_to_string(processed, config=config)
        except Exception as e:
            text = f"[ERROR: {e}]"
        
        results.append({
            'section': i + 1,
            'x_range': f"{x_start}-{x_end}",
            'text': text.strip()
        })
        print(f"  Section {i+1}/{n_cols} done")
    
    return results

def analyze_by_horizontal_lanes(img, lane_boundaries):
    """OCR each swim lane separately."""
    h, w = img.shape[:2]
    boundaries = [0] + lane_boundaries + [h]
    results = []
    
    for i in range(len(boundaries) - 1):
        y_start = max(0, boundaries[i] - 5)
        y_end = min(h, boundaries[i + 1] + 5)
        
        lane = img[y_start:y_end, :]
        lane_h, lane_w = lane.shape[:2]
        
        # If lane is very wide, process in horizontal chunks
        chunk_w = 4000  # max width per chunk
        lane_texts = []
        
        for cx in range(0, lane_w, chunk_w):
            cx_end = min(cx + chunk_w, lane_w)
            chunk = lane[:, cx:cx_end]
            
            processed = preprocess_tile(chunk)
            config = r'--oem 3 --psm 6 -l rus+eng'
            try:
                text = pytesseract.image_to_string(processed, config=config)
                if text.strip():
                    lane_texts.append(text.strip())
            except Exception as e:
                lane_texts.append(f"[ERROR: {e}]")
        
        results.append({
            'lane': i + 1,
            'y_range': f"{y_start}-{y_end}",
            'height': y_end - y_start,
            'text': '\n'.join(lane_texts)
        })
        print(f"  Lane {i+1}/{len(boundaries)-1} done (y: {y_start}-{y_end})")
    
    return results

def extract_text_grid(img, grid_cols=10, grid_rows=5):
    """Process image in a grid of tiles for detailed text extraction with positions."""
    h, w = img.shape[:2]
    tile_h = h // grid_rows
    tile_w = w // grid_cols
    
    all_text = []
    
    for row in range(grid_rows):
        for col in range(grid_cols):
            y_start = row * tile_h
            y_end = min((row + 1) * tile_h, h)
            x_start = col * tile_w
            x_end = min((col + 1) * tile_w, w)
            
            tile = img[y_start:y_end, x_start:x_end]
            processed = preprocess_tile(tile)
            
            config = r'--oem 3 --psm 6 -l rus+eng'
            try:
                text = pytesseract.image_to_string(processed, config=config).strip()
            except Exception as e:
                text = f"[ERROR: {e}]"
            
            if text and text not in ['[ERROR', '']:
                all_text.append({
                    'row': row + 1,
                    'col': col + 1,
                    'x_range': f"{x_start}-{x_end}",
                    'y_range': f"{y_start}-{y_end}",
                    'text': text
                })
    
    return all_text

def main():
    print(f"Loading image: {IMAGE_PATH}")
    img = cv2.imread(IMAGE_PATH)
    if img is None:
        print(f"ERROR: Could not load image at {IMAGE_PATH}")
        return
    
    h, w = img.shape[:2]
    print(f"Image dimensions: {w} x {h}")
    
    # 1. Detect swim lanes
    print("\n" + "="*80)
    print("STEP 1: Detecting swim lanes")
    print("="*80)
    lanes = extract_swim_lanes(img)
    print(f"Detected {len(lanes)} lane boundaries: {lanes}")
    
    # 2. OCR by vertical sections (10 columns)
    print("\n" + "="*80)
    print("STEP 2: Vertical section analysis (10 columns)")
    print("="*80)
    sections = analyze_by_vertical_sections(img, n_cols=10)
    
    for s in sections:
        print(f"\n--- Section {s['section']} (x: {s['x_range']}) ---")
        if s['text']:
            # Print first 400 chars
            print(s['text'][:400])
            if len(s['text']) > 400:
                print(f"  ... [{len(s['text'])} total chars]")
        else:
            print("[No text detected]")
    
    # 3. OCR by swim lanes (if detected)
    lane_results = []
    if len(lanes) >= 2:
        print("\n" + "="*80)
        print("STEP 3: Swim lane analysis")
        print("="*80)
        lane_results = analyze_by_horizontal_lanes(img, lanes)
        
        for lr in lane_results:
            print(f"\n--- Lane {lr['lane']} (y: {lr['y_range']}, height: {lr['height']}px) ---")
            if lr['text']:
                print(lr['text'][:500])
                if len(lr['text']) > 500:
                    print(f"  ... [{len(lr['text'])} total chars]")
            else:
                print("[No text detected]")
    
    # 4. Grid-based detailed extraction
    print("\n" + "="*80)
    print("STEP 4: Grid-based text extraction (10x5)")
    print("="*80)
    grid_texts = extract_text_grid(img, grid_cols=10, grid_rows=5)
    
    for gt in grid_texts:
        print(f"\n[R{gt['row']},C{gt['col']}] (x:{gt['x_range']}, y:{gt['y_range']})")
        print(f"  {gt['text'][:200]}")
    
    # 5. Save results
    results = {
        'image_size': {'width': w, 'height': h},
        'swim_lane_boundaries': lanes,
        'vertical_sections': sections,
        'swim_lane_texts': lane_results,
        'grid_texts': grid_texts,
    }
    
    output_path = 'data/bpmn_analysis.json'
    os.makedirs('data', exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    
    print(f"\n✅ Full results saved to {output_path}")
    print(f"   Sections: {len(sections)}, Lanes: {len(lane_results)}, Grid cells with text: {len(grid_texts)}")

if __name__ == '__main__':
    main()
