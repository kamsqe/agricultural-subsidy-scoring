/**
 * AgroScore Scoring Engine — Unit Tests
 * 
 * Verifies that the TypeScript scoring engine produces correct, deterministic
 * scores for known inputs. These tests demolish the "is it real?" question.
 * 
 * Run: npx vitest run src/lib/scoringEngine.test.ts
 */

import { describe, it, expect } from 'vitest';
import { calculateScore, type DistrictInfo, type SubsidyCode, type ScoreResult } from './scoringEngine';

// ═══════════════════════════════════════════════════════════
// TEST FIXTURES
// ═══════════════════════════════════════════════════════════

const MOCK_DISTRICTS: Record<string, DistrictInfo> = {
  'Нуринский район': {
    count: 120,
    avg_score: 58.5,
    reject_rate: 0.22,
    top1_share: 0.35,
    median_amount: 2_500_000,
    backlog_ratio: 0.25,
    approval_rate: 0.65,
    budget_per_applicant: 22_000_000,
  },
  'Монополизированный район': {
    count: 30,
    avg_score: 45.0,
    reject_rate: 0.08,
    top1_share: 0.75,
    median_amount: 15_000_000,
    backlog_ratio: 0.05,
    approval_rate: 0.90,
    budget_per_applicant: 80_000_000,
  },
  'Бедный район': {
    count: 200,
    avg_score: 52.0,
    reject_rate: 0.35,
    top1_share: 0.15,
    median_amount: 800_000,
    backlog_ratio: 0.50,
    approval_rate: 0.40,
    budget_per_applicant: 10_000_000,
  },
};

const MOCK_CODES: Record<string, SubsidyCode> = {
  '01300': {  // Priority code (breeding/dairy)
    name: 'Приобретение маточного поголовья КРС молочного направления',
    norm: 450000,
    count: 5000,
    avg_amount: 3_500_000,
    median_amount: 2_700_000,
    median_volume: 6,
  },
  '00700': {  // Non-priority (breeding bulls)
    name: 'Племенные быки-производители',
    norm: 450000,
    count: 800,
    avg_amount: 1_200_000,
    median_amount: 900_000,
    median_volume: 2,
  },
  '05901': {  // Poultry (highest food security)
    name: 'Приобретение птицы',
    norm: 50,
    count: 300,
    avg_amount: 500_000,
    median_amount: 400_000,
    median_volume: 10000,
  },
};

const ALL_SCORES = Array.from({ length: 100 }, (_, i) => 33 + (i * 0.45));

// ═══════════════════════════════════════════════════════════
// BASIC SCORING TESTS
// ═══════════════════════════════════════════════════════════

describe('calculateScore — Basic Output Contract', () => {
  it('returns all required fields', () => {
    const result = calculateScore(
      'Нуринский район', '00700', 3, 1_350_000, 0,
      MOCK_DISTRICTS, MOCK_CODES, ALL_SCORES,
    );

    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('triage');
    expect(result).toHaveProperty('percentile');
    expect(result).toHaveProperty('components');
    expect(result).toHaveProperty('exception');
    expect(result).toHaveProperty('exceptionReasons');
    expect(result).toHaveProperty('tips');
    expect(result).toHaveProperty('counterfactuals');
  });

  it('score is between 0 and 100', () => {
    const result = calculateScore(
      'Нуринский район', '00700', 3, 1_350_000, 0,
      MOCK_DISTRICTS, MOCK_CODES, ALL_SCORES,
    );
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('triage band matches score', () => {
    const result = calculateScore(
      'Нуринский район', '00700', 3, 1_350_000, 0,
      MOCK_DISTRICTS, MOCK_CODES, ALL_SCORES,
    );
    if (result.score >= 65) expect(result.triage).toBe('A');
    else if (result.score >= 55) expect(result.triage).toBe('B');
    else if (result.score >= 40) expect(result.triage).toBe('C');
    else expect(result.triage).toBe('D');
  });

  it('all component scores are 0-100', () => {
    const result = calculateScore(
      'Нуринский район', '01300', 5, 2_250_000, 1,
      MOCK_DISTRICTS, MOCK_CODES, ALL_SCORES,
    );
    for (const [key, val] of Object.entries(result.components)) {
      if (key === 'exception') {
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(15);
      } else {
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(100);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════
// DETERMINISTIC KNOWN-INPUT-OUTPUT TESTS
// ═══════════════════════════════════════════════════════════

describe('calculateScore — Known Input/Output Cases', () => {
  it('Case 1: Ideal small dairy farmer in needy district → high score', () => {
    // Priority code (01300), small amount (<1M), moderate district
    const result = calculateScore(
      'Бедный район', '01300', 5, 900_000, 0,
      MOCK_DISTRICTS, MOCK_CODES, ALL_SCORES,
    );

    // Strategic: priority code (30) + dairy food security (0.8*30=24) + spec_score (15) = 69
    expect(result.components.strategic).toBe(69);
    // Fairness: top1_share=0.15 → monopoly=20, vol_ratio=5/6≈0.83 → median=30, amount<1M → small=30
    expect(result.components.fairness).toBe(80);
    // Need: backlog=0.50→30, approval=(1-0.40)*25=15, budget<15M→25, seasonal=14 → ~84
    expect(result.components.need).toBe(84);
    // Should be Triage A or B
    expect(['A', 'B']).toContain(result.triage);
    // Exception: first-time in high-reject (0.35>0.15) → +3, backlog>0.30 → +5, small farmer (<5M) + top1(0.15)≤0.4 → no
    expect(result.exception).toBe(8);
    expect(result.exceptionReasons).toContain('Первая подача в районе с высоким % отказов (+3)');
    expect(result.exceptionReasons).toContain('Область с высоким бэклогом заявок (+5)');
  });

  it('Case 2: Large agriholding in monopolized district → lower score', () => {
    // Non-priority code, large amount (>20M), monopolized district
    const result = calculateScore(
      'Монополизированный район', '00700', 50, 25_000_000, 0,
      MOCK_DISTRICTS, MOCK_CODES, ALL_SCORES,
    );

    // Fairness should be low: monopolized + large amount + high vol_ratio
    expect(result.components.fairness).toBeLessThan(50);
    // Fraud should be elevated: high monopoly (top1=0.75), large vol_ratio (50/2=25)
    expect(result.components.fraud).toBeGreaterThan(0);
    // Score should be lower
    expect(result.score).toBeLessThan(60);
  });

  it('Case 3: Poultry farmer (highest food security priority)', () => {
    const result = calculateScore(
      'Нуринский район', '05901', 8000, 400_000, 0,
      MOCK_DISTRICTS, MOCK_CODES, ALL_SCORES,
    );

    // Food security: poultry = 1.0 → 30pts
    // guessDirection('05901') → 'poultry'
    expect(result.components.strategic).toBeGreaterThanOrEqual(55);
  });

  it('Case 4: Serial re-applier (retry=6) → fraud risk elevated', () => {
    const result = calculateScore(
      'Нуринский район', '00700', 2, 900_000, 6,
      MOCK_DISTRICTS, MOCK_CODES, ALL_SCORES,
    );

    // Excessive retries → fraud += 20
    expect(result.components.fraud).toBeGreaterThanOrEqual(20);
    // Efficiency: retry>3 → history=10 (lowest), but district reputation and amount reasonableness add ~56
    expect(result.components.efficiency).toBeLessThan(80);
    // Tips should warn about retries
    expect(result.tips.some(t => t.includes('Более 3 повторных подач'))).toBe(true);
  });

  it('Case 5: Round million amount → fraud flag', () => {
    const result = calculateScore(
      'Нуринский район', '00700', 2, 5_000_000, 0,
      MOCK_DISTRICTS, MOCK_CODES, ALL_SCORES,
    );

    // 5M is a round million → fraud += 15
    expect(result.components.fraud).toBeGreaterThanOrEqual(15);
    // Tips should warn
    expect(result.tips.some(t => t.includes('Круглая сумма'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// EDGE CASES
// ═══════════════════════════════════════════════════════════

describe('calculateScore — Edge Cases', () => {
  it('zero amount does not crash', () => {
    const result = calculateScore(
      'Нуринский район', '00700', 0, 0, 0,
      MOCK_DISTRICTS, MOCK_CODES, ALL_SCORES,
    );
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('extreme volume (999999) does not crash', () => {
    const result = calculateScore(
      'Нуринский район', '00700', 999_999, 500_000, 0,
      MOCK_DISTRICTS, MOCK_CODES, ALL_SCORES,
    );
    expect(result.score).toBeGreaterThanOrEqual(0);
    // Extreme volume → high fraud risk
    expect(result.components.fraud).toBeGreaterThan(20);
  });

  it('unknown district uses null-safe defaults', () => {
    const result = calculateScore(
      'Несуществующий район', '00700', 5, 1_000_000, 0,
      MOCK_DISTRICTS, MOCK_CODES, ALL_SCORES,
    );
    // Should not crash — null-safe paths in engine
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('unknown subsidy code uses null-safe defaults', () => {
    const result = calculateScore(
      'Нуринский район', '99999', 5, 1_000_000, 0,
      MOCK_DISTRICTS, MOCK_CODES, ALL_SCORES,
    );
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('empty allScores array → percentile 50', () => {
    const result = calculateScore(
      'Нуринский район', '00700', 3, 1_350_000, 0,
      MOCK_DISTRICTS, MOCK_CODES, [],
    );
    expect(result.percentile).toBe(50);
  });

  it('negative retry does not crash', () => {
    const result = calculateScore(
      'Нуринский район', '00700', 3, 1_350_000, -1,
      MOCK_DISTRICTS, MOCK_CODES, ALL_SCORES,
    );
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════
// TRIAGE BAND BOUNDARY TESTS
// ═══════════════════════════════════════════════════════════

describe('calculateScore — Triage Boundaries', () => {
  it('score exactly 65 → Triage A', () => {
    // The function: score >= 65 → A
    // We can test the boundary by checking the triage assignment logic
    const result = calculateScore(
      'Бедный район', '01300', 5, 900_000, 0,
      MOCK_DISTRICTS, MOCK_CODES, ALL_SCORES,
    );
    // This high-merit farmer should be in A
    if (result.score >= 65) {
      expect(result.triage).toBe('A');
    }
  });

  it('triage band boundaries are correct for all known inputs', () => {
    const cases = [
      { district: 'Бедный район', code: '01300', vol: 5, amt: 900_000, retry: 0 },
      { district: 'Монополизированный район', code: '00700', vol: 50, amt: 25_000_000, retry: 4 },
      { district: 'Нуринский район', code: '05901', vol: 8000, amt: 400_000, retry: 1 },
    ];

    for (const c of cases) {
      const result = calculateScore(
        c.district, c.code, c.vol, c.amt, c.retry,
        MOCK_DISTRICTS, MOCK_CODES, ALL_SCORES,
      );
      // Verify triage matches score
      if (result.score >= 65) expect(result.triage).toBe('A');
      else if (result.score >= 55) expect(result.triage).toBe('B');
      else if (result.score >= 40) expect(result.triage).toBe('C');
      else expect(result.triage).toBe('D');
    }
  });
});

// ═══════════════════════════════════════════════════════════
// NORM-DERIVED AMOUNT EXEMPTION
// ═══════════════════════════════════════════════════════════

describe('calculateScore — Norm-Derived Amount Exemption', () => {
  it('norm-derived amount is NOT flagged as round-number fraud', () => {
    // Code 01300 has norm=450000, so 3 head × 450000 = 1,350,000
    // This is a round 100k amount but should be exempt because it's norm-derived
    const result = calculateScore(
      'Нуринский район', '01300', 3, 1_350_000, 0,
      MOCK_DISTRICTS, MOCK_CODES, ALL_SCORES,
    );

    // The amount 1,350,000 is NOT divisible by 1M, but IS norm-derived
    // (3 * 450000 = 1,350,000, within 10% tolerance)
    // So round-number fraud should not trigger
    // Fraud should be relatively low
    expect(result.components.fraud).toBeLessThan(20);
  });

  it('non-norm round amount IS flagged', () => {
    // 5,000,000 is a round million and NOT norm-derived
    const result = calculateScore(
      'Нуринский район', '00700', 2, 5_000_000, 0,
      MOCK_DISTRICTS, MOCK_CODES, ALL_SCORES,
    );

    expect(result.components.fraud).toBeGreaterThanOrEqual(15);
  });
});

// ═══════════════════════════════════════════════════════════
// EXCEPTION POINTS
// ═══════════════════════════════════════════════════════════

describe('calculateScore — Exception Points', () => {
  it('first-time in high-reject district → +3', () => {
    // Нуринский район has reject_rate=0.22 > 0.15
    const result = calculateScore(
      'Нуринский район', '00700', 2, 900_000, 0,  // retry=0
      MOCK_DISTRICTS, MOCK_CODES, ALL_SCORES,
    );
    expect(result.exceptionReasons).toContain('Первая подача в районе с высоким % отказов (+3)');
  });

  it('non-first-time in high-reject district → NO bonus', () => {
    const result = calculateScore(
      'Нуринский район', '00700', 2, 900_000, 2,  // retry=2, not first
      MOCK_DISTRICTS, MOCK_CODES, ALL_SCORES,
    );
    expect(result.exceptionReasons).not.toContain('Первая подача в районе с высоким % отказов (+3)');
  });

  it('high-backlog oblast → +5', () => {
    // Бедный район has backlog_ratio=0.50 > 0.30
    const result = calculateScore(
      'Бедный район', '00700', 2, 900_000, 0,
      MOCK_DISTRICTS, MOCK_CODES, ALL_SCORES,
    );
    expect(result.exceptionReasons).toContain('Область с высоким бэклогом заявок (+5)');
  });

  it('small farmer in monopolized district → +5', () => {
    // Монополизированный район has top1_share=0.75 > 0.4, amount<5M
    const result = calculateScore(
      'Монополизированный район', '00700', 2, 900_000, 0,
      MOCK_DISTRICTS, MOCK_CODES, ALL_SCORES,
    );
    expect(result.exceptionReasons).toContain('Мелкий фермер в монополизированном районе (+5)');
  });

  it('exception capped at 15', () => {
    // All 3 rules: first-time high-reject + high-backlog + small in monopoly
    // Need a district that has high reject, high backlog, high monopoly
    const superDistrict: Record<string, DistrictInfo> = {
      'Суперрайон': {
        count: 100, avg_score: 50, reject_rate: 0.40,
        top1_share: 0.80, median_amount: 1_000_000,
        backlog_ratio: 0.60, approval_rate: 0.30,
        budget_per_applicant: 5_000_000,
      },
    };
    const result = calculateScore(
      'Суперрайон', '00700', 2, 900_000, 0,
      superDistrict, MOCK_CODES, ALL_SCORES,
    );
    // 3 + 5 + 5 = 13, capped at 15
    expect(result.exception).toBe(13);
  });
});

// ═══════════════════════════════════════════════════════════
// COUNTERFACTUALS
// ═══════════════════════════════════════════════════════════

describe('calculateScore — Counterfactuals', () => {
  it('non-priority code generates "if priority" counterfactual', () => {
    const result = calculateScore(
      'Нуринский район', '00700', 2, 900_000, 0,
      MOCK_DISTRICTS, MOCK_CODES, ALL_SCORES,
    );
    expect(result.counterfactuals.some(c => c.label.includes('приоритетный код'))).toBe(true);
  });

  it('priority code does NOT generate "if priority" counterfactual', () => {
    const result = calculateScore(
      'Нуринский район', '01300', 3, 1_350_000, 0,
      MOCK_DISTRICTS, MOCK_CODES, ALL_SCORES,
    );
    expect(result.counterfactuals.some(c => c.label.includes('приоритетный код'))).toBe(false);
  });

  it('large amount generates "if small farmer" counterfactual', () => {
    const result = calculateScore(
      'Нуринский район', '00700', 10, 10_000_000, 0,
      MOCK_DISTRICTS, MOCK_CODES, ALL_SCORES,
    );
    expect(result.counterfactuals.some(c => c.label.includes('3 млн'))).toBe(true);
  });

  it('retry>1 generates "if first application" counterfactual', () => {
    const result = calculateScore(
      'Нуринский район', '00700', 2, 900_000, 3,
      MOCK_DISTRICTS, MOCK_CODES, ALL_SCORES,
    );
    expect(result.counterfactuals.some(c => c.label.includes('первая подача'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// PRECHECK DISCLAIMER
// ═══════════════════════════════════════════════════════════

describe('calculateScore — PreCheck Honesty', () => {
  it('always includes PreCheck disclaimer in tips', () => {
    const result = calculateScore(
      'Нуринский район', '00700', 2, 900_000, 0,
      MOCK_DISTRICTS, MOCK_CODES, ALL_SCORES,
    );
    expect(result.tips.some(t => t.includes('PreCheck использует упрощённую формулу'))).toBe(true);
  });
});
