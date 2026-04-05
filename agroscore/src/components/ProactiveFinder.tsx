import { useState, useEffect, useMemo } from 'react';
import { calculateScore, type DistrictInfo, type SubsidyCode } from '../lib/scoringEngine';

// ── Types ────────────────────────────────────────────────────────────

interface FarmerProfile {
  id: string;
  bin: string;
  name: string;
  oblast: string;
  district: string;
  farm_type: string;
  land_hectares: number;
  pasture_hectares: number;
  livestock: {
    cattle: number;
    dairy_cows: number;
    sheep: number;
    goats: number;
    horses: number;
    camels: number;
    poultry: number;
    pigs: number;
  };
  daily_milk_liters: number;
  annual_meat_kg: number;
  mortality_rate_pct: number;
  infrastructure: {
    barns: number;
    barn_capacity: number;
    milking_equipment: boolean;
    feed_storage_tons: number;
  };
  credit_history: 'good' | 'fair' | 'poor';
  previous_subsidies: string[];
  active_subsidy_count: number;
}

interface EligibilityCluster {
  codes: string[];
  requires: Record<string, any>;
  description: string;
}

interface AgroNorms {
  pasture_load_fallback: Record<string, { default: number; unit: string }>;
  mortality_norms_pct: Record<string, any>;
  milk_yield_liters_per_day: Record<string, number>;
  infrastructure: Record<string, number>;
  subsidy_eligibility: Record<string, EligibilityCluster>;
}

interface OblastMedians {
  cattle: number;
  sheep: number;
  horses: number;
  camels: number;
  cattle_range: [number, number];
  sheep_range: [number, number];
  count: number;
}

interface PastureNormsData {
  source: string;
  url: string;
  total_rows: number;
  oblast_medians: Record<string, OblastMedians>;
}

interface Recommendation {
  code: string;
  codeName: string;
  cluster: string;
  clusterDescription: string;
  eligible: boolean;
  reason: string;
  matchedFields: string[];
  recommendedVolume: number;
  estimatedAmount: number;
  impactScore: number;
  triage: string;
  components: Record<string, number>;
  capacityWarnings: string[];
  norm: number;
}

type RecAction = 'new' | 'invited' | 'dismissed';

function normalizeOblast(oblast: string): string {
  return oblast
    .replace(/\s*область$/i, '')
    .replace(/^область\s*/i, '')
    .replace(/^г\./, '')
    .trim();
}

// ── Capacity Analysis ────────────────────────────────────────────────

function getOblastPastureNorms(
  profile: FarmerProfile,
  pastureData: PastureNormsData | null,
  norms: AgroNorms,
): { cattle: number; sheep: number; horses: number; camels: number; source: string; range?: [number, number] } {
  const fb = norms.pasture_load_fallback;
  const fallback = {
    cattle: fb.cattle?.default || 10, sheep: fb.sheep?.default || 2,
    horses: fb.horses?.default || 12, camels: fb.camels?.default || 14,
    source: 'fallback (общенациональный)', range: undefined as [number, number] | undefined,
  };
  if (!pastureData) return fallback;

  const norm = normalizeOblast(profile.oblast);
  const medians = pastureData.oblast_medians;
  const key = Object.keys(medians).find(k => k === norm || normalizeOblast(k) === norm);
  if (!key) return fallback;

  const m = medians[key];
  return { cattle: m.cattle, sheep: m.sheep, horses: m.horses, camels: m.camels, source: `Приказ МСХ №3-1/52, ${key} (${m.count} зон)`, range: m.cattle_range };
}

function getAdultMortalityNorm(norms: AgroNorms, ls: FarmerProfile['livestock']): number {
  const mn = norms.mortality_norms_pct;
  if (ls.cattle > ls.sheep && ls.cattle > ls.poultry) return mn.cattle_dairy?.adult || mn.cattle_meat?.adult || 3;
  if (ls.sheep > ls.cattle && ls.sheep > ls.poultry) return mn.sheep?.adult || 3;
  if (ls.poultry > ls.cattle && ls.poultry > ls.sheep) return typeof mn.poultry_meat === 'number' ? mn.poultry_meat : 7.5;
  if (ls.horses > ls.cattle) return mn.horses_pasture?.foals_to_weaning || 2.3;
  if (ls.pigs > ls.cattle) return mn.pigs?.fattening || 1;
  return mn.cattle_dairy?.adult || 3;
}

function computeCapacity(profile: FarmerProfile, norms: AgroNorms, pastureData: PastureNormsData | null) {
  const ls = profile.livestock;
  const pn = getOblastPastureNorms(profile, pastureData, norms);
  const fb = norms.pasture_load_fallback;

  const landUsed =
    ls.cattle * pn.cattle +
    ls.sheep * pn.sheep +
    ls.goats * pn.sheep +
    ls.horses * pn.horses +
    ls.camels * pn.camels +
    ls.poultry * (fb.poultry?.default || 0.005) +
    ls.pigs * (fb.pigs?.default || 0.02);

  const landUtilization = profile.pasture_hectares > 0
    ? Math.round((landUsed / profile.pasture_hectares) * 100)
    : 0;

  const totalLarge = ls.cattle + ls.horses + ls.camels;
  const totalSmall = ls.sheep + ls.goats;
  const neededCapacity = totalLarge + Math.ceil(totalSmall * 0.3);
  const housingRatio = neededCapacity > 0
    ? profile.infrastructure.barn_capacity / neededCapacity
    : 1;

  const feedNeeded = ls.cattle * 3.0 + ls.sheep * 0.5 + ls.horses * 2.5 + ls.goats * 0.4;
  const feedRatio = feedNeeded > 0
    ? profile.infrastructure.feed_storage_tons / feedNeeded
    : 1;

  const mortalityNorm = getAdultMortalityNorm(norms, ls);
  const mortalityAboveNorm = profile.mortality_rate_pct > mortalityNorm;

  const warnings: string[] = [];
  if (landUtilization > 100) {
    const rangeStr = pn.range ? ` (диапазон ${pn.range[0]}–${pn.range[1]} га/гол по зонам)` : '';
    warnings.push(`Пастбища перегружены: ${landUtilization}% использования${rangeStr}`);
  }
  if (housingRatio < 0.8) warnings.push(`Недостаток помещений: ${Math.round(housingRatio * 100)}% от нормы (мин. 80%)`);
  if (feedRatio < 0.8) warnings.push(`Запасы кормов: ${Math.round(feedRatio * 100)}% от потребности на зиму`);
  if (mortalityAboveNorm) warnings.push(`Падёж ${profile.mortality_rate_pct}% выше нормы ${mortalityNorm}% (Приказ МСХ №3-3/1061)`);
  if (ls.dairy_cows >= 10 && !profile.infrastructure.milking_equipment) {
    warnings.push('Нет доильного оборудования при ≥10 дойных коровах');
  }

  return {
    landUsed: Math.round(landUsed),
    landUtilization,
    housingRatio: Math.round(housingRatio * 100),
    feedRatio: Math.round(feedRatio * 100),
    mortalityAboveNorm,
    mortalityNorm,
    warnings,
    freeHectares: Math.max(0, Math.round(profile.pasture_hectares - landUsed)),
    pastureSource: pn.source,
  };
}

// ── Eligibility Engine ───────────────────────────────────────────────

function checkEligibility(
  profile: FarmerProfile,
  norms: AgroNorms,
  codeData: Record<string, SubsidyCode>,
  districtData: Record<string, DistrictInfo>,
  allScores: number[],
  pastureData: PastureNormsData | null = null,
): Recommendation[] {
  const ls = profile.livestock;
  const infra = profile.infrastructure;
  const totalLivestock = ls.cattle + ls.sheep + ls.goats + ls.horses + ls.camels + ls.poultry + ls.pigs;

  const capacity = computeCapacity(profile, norms, pastureData);
  const recommendations: Recommendation[] = [];

  for (const [clusterKey, cluster] of Object.entries(norms.subsidy_eligibility)) {
    const req = cluster.requires;
    let eligible = true;
    let reason = '';
    const capWarnings: string[] = [];
    const matched: string[] = [];

    if (req.min_cattle !== undefined) {
      if (ls.cattle < req.min_cattle) { eligible = false; reason = `Требуется КРС ≥ ${req.min_cattle} (у вас ${ls.cattle})`; }
      else matched.push(`КРС: ${ls.cattle} ≥ ${req.min_cattle}`);
    }
    if (req.min_dairy_cows !== undefined) {
      if (ls.dairy_cows < req.min_dairy_cows) { eligible = false; reason = `Требуется дойных коров ≥ ${req.min_dairy_cows} (у вас ${ls.dairy_cows})`; }
      else matched.push(`Дойные: ${ls.dairy_cows} ≥ ${req.min_dairy_cows}`);
    }
    if (req.min_sheep !== undefined) {
      if (ls.sheep < req.min_sheep) { eligible = false; reason = `Требуется овец ≥ ${req.min_sheep} (у вас ${ls.sheep})`; }
      else matched.push(`Овцы: ${ls.sheep} ≥ ${req.min_sheep}`);
    }
    if (req.min_horses !== undefined) {
      if (ls.horses < req.min_horses) { eligible = false; reason = `Требуется лошадей ≥ ${req.min_horses} (у вас ${ls.horses})`; }
      else matched.push(`Лошади: ${ls.horses} ≥ ${req.min_horses}`);
    }
    if (req.min_camels !== undefined) {
      if (ls.camels < req.min_camels) { eligible = false; reason = `Требуется верблюдов ≥ ${req.min_camels} (у вас ${ls.camels})`; }
      else matched.push(`Верблюды: ${ls.camels} ≥ ${req.min_camels}`);
    }
    if (req.min_poultry !== undefined) {
      if (ls.poultry < req.min_poultry) { eligible = false; reason = `Требуется птицы ≥ ${req.min_poultry} (у вас ${ls.poultry})`; }
      else matched.push(`Птица: ${ls.poultry} ≥ ${req.min_poultry}`);
    }
    if (req.min_pigs !== undefined) {
      if (ls.pigs < req.min_pigs) { eligible = false; reason = `Требуется свиней ≥ ${req.min_pigs} (у вас ${ls.pigs})`; }
      else matched.push(`Свиньи: ${ls.pigs} ≥ ${req.min_pigs}`);
    }
    if (req.min_livestock_total !== undefined) {
      if (totalLivestock < req.min_livestock_total) { eligible = false; reason = `Требуется поголовье ≥ ${req.min_livestock_total} (у вас ${totalLivestock})`; }
      else matched.push(`Поголовье: ${totalLivestock} ≥ ${req.min_livestock_total}`);
    }
    if (req.min_daily_milk !== undefined) {
      if (profile.daily_milk_liters < req.min_daily_milk) { eligible = false; reason = `Требуется суточный надой ≥ ${req.min_daily_milk} л (у вас ${profile.daily_milk_liters})`; }
      else matched.push(`Надой: ${profile.daily_milk_liters} л ≥ ${req.min_daily_milk}`);
    }
    if (req.milking_equipment === true) {
      if (!infra.milking_equipment) { eligible = false; reason = 'Требуется доильное оборудование'; }
      else matched.push('Доильное оборудование: есть');
    }
    if (req.min_feed_storage !== undefined) {
      if (infra.feed_storage_tons < req.min_feed_storage) { eligible = false; reason = `Требуется хранение кормов ≥ ${req.min_feed_storage} т (у вас ${infra.feed_storage_tons})`; }
      else matched.push(`Корма: ${infra.feed_storage_tons} т ≥ ${req.min_feed_storage}`);
    }
    if (req.credit_not !== undefined) {
      if (profile.credit_history === req.credit_not) { eligible = false; reason = `Кредитная история "${profile.credit_history}" не соответствует`; }
      else matched.push(`Кредит: ${profile.credit_history} (допустимо)`);
    }
    if (req.min_land_hectares !== undefined) {
      if (profile.land_hectares < req.min_land_hectares) { eligible = false; reason = `Требуется земля ≥ ${req.min_land_hectares} га (у вас ${profile.land_hectares})`; }
      else matched.push(`Земля: ${profile.land_hectares} га ≥ ${req.min_land_hectares}`);
    }

    if (eligible && req.min_land_per_head) {
      const haPerHead = req.min_land_per_head as number;
      const maxHeads = Math.floor(capacity.freeHectares / haPerHead);
      if (maxHeads <= 0) capWarnings.push(`Недостаточно пастбищ для дополнительного поголовья (свободно ${capacity.freeHectares} га)`);
      else matched.push(`Свободно ${capacity.freeHectares} га → до ${maxHeads} голов`);
    }
    if (eligible && req.min_land_per_sheep) {
      const haPerHead = req.min_land_per_sheep as number;
      const maxHeads = Math.floor(capacity.freeHectares / haPerHead);
      if (maxHeads <= 0) capWarnings.push(`Недостаточно пастбищ для дополнительного МРС (свободно ${capacity.freeHectares} га)`);
      else matched.push(`Свободно ${capacity.freeHectares} га → до ${maxHeads} МРС`);
    }

    if (eligible) capWarnings.push(...capacity.warnings);

    for (const code of cluster.codes) {
      const cd = codeData[code];
      if (!cd) continue;

      let recVolume = cd.median_volume;
      if (eligible && req.min_land_per_head && capacity.freeHectares > 0) {
        recVolume = Math.min(recVolume, Math.floor(capacity.freeHectares / (req.min_land_per_head as number)));
      }
      if (eligible && req.min_land_per_sheep && capacity.freeHectares > 0) {
        recVolume = Math.min(recVolume, Math.floor(capacity.freeHectares / (req.min_land_per_sheep as number)));
      }
      recVolume = Math.max(1, Math.round(recVolume));

      const estAmount = Math.round(recVolume * cd.norm);
      const retryCount = profile.previous_subsidies.includes(code) ? 1 : 0;
      const scoreResult = calculateScore(profile.district, code, recVolume, estAmount, retryCount, districtData, codeData, allScores);

      recommendations.push({
        code, codeName: cd.name, cluster: clusterKey, clusterDescription: cluster.description,
        eligible, reason: eligible ? 'Все требования выполнены' : reason,
        matchedFields: eligible ? matched : [],
        recommendedVolume: recVolume, estimatedAmount: estAmount,
        impactScore: scoreResult.score, triage: scoreResult.triage,
        components: scoreResult.components,
        capacityWarnings: eligible ? capWarnings : [],
        norm: cd.norm,
      });
    }
  }

  recommendations.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    return b.impactScore - a.impactScore;
  });
  return recommendations;
}

// ── Helpers ──────────────────────────────────────────────────────────

function fmtAmount(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} млрд ₸`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} млн ₸`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} тыс ₸`;
  return `${n} ₸`;
}

function fmtFarmType(t: string): string {
  const map: Record<string, string> = {
    small_cattle: 'Мелкое КРС', medium_cattle: 'Среднее КРС', large_cattle: 'Крупное КРС',
    sheep_focus: 'Овцеводство', poultry: 'Птицеводство', dairy: 'Молочное', mixed: 'Смешанное',
    horse: 'Коневодство', camel: 'Верблюдоводство', pig: 'Свиноводство', honey: 'Пчеловодство',
  };
  return map[t] || t;
}

const TRIAGE_COLORS: Record<string, string> = {
  A: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  B: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  C: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  D: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const ACTION_LABELS: Record<RecAction, { label: string; color: string }> = {
  new: { label: 'Новый', color: 'bg-slate-700 text-slate-300' },
  invited: { label: 'Приглашён', color: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' },
  dismissed: { label: 'Отклонён', color: 'bg-red-500/20 text-red-400 border border-red-500/30' },
};

// ── Sub-components ───────────────────────────────────────────────────

function CapacityBar({ label, value, max, unit, warn }: { label: string; value: number; max: number; unit: string; warn?: boolean }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const color = warn ? (pct > 100 ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-sky-500';
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-400">{label}</span>
        <span className={`font-mono ${pct > 100 ? 'text-red-400' : pct > 80 ? 'text-amber-400' : 'text-slate-300'}`}>
          {value}{unit} / {max}{unit} ({pct}%)
        </span>
      </div>
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-500 w-16 text-right shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[10px] font-mono text-slate-400 w-6 text-right">{Math.round(value)}</span>
    </div>
  );
}

function MethodologyPanel({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="bg-[#0a1018] border border-indigo-900/40 rounded-xl p-5 mb-4 animate-in fade-in">
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-3">Источники данных</h4>
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded bg-emerald-500/20 flex items-center justify-center text-[10px]">🐄</span>
              <span className="text-slate-300">ИСЖ</span>
              <span className="text-slate-600">— поголовье по видам</span>
              <span className="text-[9px] bg-amber-500/10 text-amber-400 px-1 py-0.5 rounded ml-auto">синтетический</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded bg-emerald-500/20 flex items-center justify-center text-[10px]">🗺️</span>
              <span className="text-slate-300">ЕГКН</span>
              <span className="text-slate-600">— земля, пастбища</span>
              <span className="text-[9px] bg-amber-500/10 text-amber-400 px-1 py-0.5 rounded ml-auto">синтетический</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded bg-emerald-500/20 flex items-center justify-center text-[10px]">💳</span>
              <span className="text-slate-300">ПКБ</span>
              <span className="text-slate-600">— кредитная история</span>
              <span className="text-[9px] bg-amber-500/10 text-amber-400 px-1 py-0.5 rounded ml-auto">синтетический</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded bg-sky-500/20 flex items-center justify-center text-[10px]">📊</span>
              <span className="text-slate-300">stat.gov.kz</span>
              <span className="text-slate-600">— районная статистика</span>
              <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-1 py-0.5 rounded ml-auto">реальные</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded bg-sky-500/20 flex items-center justify-center text-[10px]">📋</span>
              <span className="text-slate-300">plem.kz</span>
              <span className="text-slate-600">— нормы субсидий</span>
              <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-1 py-0.5 rounded ml-auto">реальные</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded bg-sky-500/20 flex items-center justify-center text-[10px]">🌾</span>
              <span className="text-slate-300">Приказ МСХ №3-1/52</span>
              <span className="text-slate-600">— нормы пастбищ (253 записи)</span>
              <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-1 py-0.5 rounded ml-auto">реальные</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded bg-sky-500/20 flex items-center justify-center text-[10px]">📉</span>
              <span className="text-slate-300">Приказ МСХ №3-3/1061</span>
              <span className="text-slate-600">— нормы падежа</span>
              <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-1 py-0.5 rounded ml-auto">реальные</span>
            </div>
          </div>
        </div>
        <div>
          <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-3">Как работает движок</h4>
          <div className="space-y-1.5 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[10px] font-bold shrink-0">1</span>
              <span>Профиль фермера → проверка <span className="text-white">22 типов субсидий</span></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[10px] font-bold shrink-0">2</span>
              <span>Для каждого: <span className="text-white">нормы МСХ по области</span> → проверка мощностей</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[10px] font-bold shrink-0">3</span>
              <span>Расчёт <span className="text-white">Impact Score</span> (та же формула, что и в скоринге 36К заявок)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[10px] font-bold shrink-0">4</span>
              <span>Ранжирование → <span className="text-white">приглашение к подаче</span></span>
            </div>
          </div>
          <div className="mt-3 p-2 bg-slate-900/50 rounded-lg border border-slate-800">
            <p className="text-[10px] text-slate-500">
              <span className="text-indigo-400 font-bold">Production:</span> замена синтетических профилей на API ИСЖ/ЕГКН/ПКБ — конфигурационное изменение, логика движка идентична.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────

export default function ProactiveFinder() {
  const [profiles, setProfiles] = useState<FarmerProfile[]>([]);
  const [norms, setNorms] = useState<AgroNorms | null>(null);
  const [pastureNorms, setPastureNorms] = useState<PastureNormsData | null>(null);
  const [districtData, setDistrictData] = useState<Record<string, DistrictInfo>>({});
  const [codeData, setCodeData] = useState<Record<string, SubsidyCode>>({});
  const [allScores, setAllScores] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  const [oblastFilter, setOblastFilter] = useState<string>('');
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [showIneligible, setShowIneligible] = useState(false);
  const [showMethodology, setShowMethodology] = useState(false);
  const [actions, setActions] = useState<Record<string, RecAction>>({});
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([
      fetch('/data/farmer_profiles.json').then(r => r.json()),
      fetch('/data/agro_norms.json').then(r => r.json()),
      fetch('/data/districts.json').then(r => r.json()),
      fetch('/data/subsidy_codes.json').then(r => r.json()),
      fetch('/data/scoring_summary.json').then(r => r.json()),
      fetch('/data/pasture_norms_official.json').then(r => r.json()).catch(() => null),
    ]).then(([profs, nrms, districts, codes, summary, pastureData]) => {
      setProfiles(profs);
      setNorms(nrms);
      setPastureNorms(pastureData as PastureNormsData | null);
      setDistrictData(districts);
      setCodeData(codes);
      const hist = summary.score_distribution as Record<string, number>;
      const approxScores: number[] = [];
      for (const [bucket, count] of Object.entries(hist)) {
        const b = parseInt(bucket);
        for (let i = 0; i < (count as number); i++) approxScores.push(b + 5);
      }
      setAllScores(approxScores);
      setSelectedProfileId(profs[0]?.id || '');
      setLoading(false);
    });
  }, []);

  const oblasts = useMemo(() => {
    const set = new Set(profiles.map(p => p.oblast));
    return Array.from(set).sort();
  }, [profiles]);

  const filteredProfiles = useMemo(() => {
    if (!oblastFilter) return profiles;
    return profiles.filter(p => p.oblast === oblastFilter);
  }, [profiles, oblastFilter]);

  useEffect(() => {
    if (filteredProfiles.length > 0 && !filteredProfiles.find(p => p.id === selectedProfileId)) {
      setSelectedProfileId(filteredProfiles[0].id);
    }
  }, [filteredProfiles]);

  const selectedProfile = useMemo(
    () => profiles.find(p => p.id === selectedProfileId) || null,
    [profiles, selectedProfileId]
  );

  const recommendations = useMemo(() => {
    if (!selectedProfile || !norms) return [];
    return checkEligibility(selectedProfile, norms, codeData, districtData, allScores, pastureNorms);
  }, [selectedProfile, norms, codeData, districtData, allScores, pastureNorms]);

  const capacity = useMemo(() => {
    if (!selectedProfile || !norms) return null;
    return computeCapacity(selectedProfile, norms, pastureNorms);
  }, [selectedProfile, norms, pastureNorms]);

  const eligibleRecs = useMemo(() => recommendations.filter(r => r.eligible), [recommendations]);
  const ineligibleRecs = useMemo(() => recommendations.filter(r => !r.eligible), [recommendations]);
  const totalPotential = useMemo(() => eligibleRecs.reduce((sum, r) => sum + r.estimatedAmount, 0), [eligibleRecs]);

  const actionKey = (profileId: string, code: string) => `${profileId}:${code}`;
  const getAction = (code: string): RecAction => actions[actionKey(selectedProfileId, code)] || 'new';
  const setAction = (code: string, action: RecAction) => {
    setActions(prev => ({ ...prev, [actionKey(selectedProfileId, code)]: action }));
  };
  const toggleExpand = (code: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  };

  const invitedCount = Object.values(actions).filter(a => a === 'invited').length;
  const dismissedCount = Object.values(actions).filter(a => a === 'dismissed').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* TOP BAR: Oblast filter + methodology toggle + action stats */}
      <div className="flex flex-wrap items-center gap-3 bg-[#0b1018] border border-slate-800 rounded-xl px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Область:</span>
          <select
            value={oblastFilter}
            onChange={e => setOblastFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">Все области ({profiles.length})</option>
            {oblasts.map(o => (
              <option key={o} value={o}>{o} ({profiles.filter(p => p.oblast === o).length})</option>
            ))}
          </select>
        </div>
        <div className="w-px h-5 bg-slate-700 hidden sm:block" />
        <button
          onClick={() => setShowMethodology(!showMethodology)}
          className={`text-xs px-3 py-1 rounded-lg border transition-colors ${showMethodology ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300' : 'border-slate-700 text-slate-400 hover:text-white hover:border-slate-600'}`}
        >
          {showMethodology ? '✕ Скрыть методологию' : '? Как работает'}
        </button>
        <div className="ml-auto flex items-center gap-3 text-xs">
          {invitedCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Приглашено: {invitedCount}
            </span>
          )}
          {dismissedCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
              Отклонено: {dismissedCount}
            </span>
          )}
        </div>
      </div>

      <MethodologyPanel show={showMethodology} />

      {/* MAIN LAYOUT */}
      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-[700px]">
        {/* LEFT: Profile Selector + Capacity */}
        <div className="lg:w-[340px] shrink-0 flex flex-col gap-4">
          <div className="bg-[#0d1620] border border-blue-900/30 rounded-xl p-4">
            <h3 className="text-sm font-bold text-white mb-3">Профиль фермера</h3>
            <select
              value={selectedProfileId}
              onChange={e => setSelectedProfileId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 mb-3 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            >
              {filteredProfiles.map(p => (
                <option key={p.id} value={p.id}>
                  {p.id} — {p.name}
                </option>
              ))}
            </select>

            {selectedProfile && (
              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-slate-500">БИН</span><span className="font-mono text-slate-300">{selectedProfile.bin}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Область</span><span className="text-slate-300 text-right max-w-[180px] truncate">{selectedProfile.oblast}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Район</span><span className="text-slate-300 text-right max-w-[180px] truncate">{selectedProfile.district}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Тип</span><span className="text-slate-300">{fmtFarmType(selectedProfile.farm_type)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Земля</span><span className="text-slate-300">{selectedProfile.land_hectares} га (пастб. {selectedProfile.pasture_hectares})</span></div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Кредит</span>
                  <span className={`font-medium ${selectedProfile.credit_history === 'good' ? 'text-emerald-400' : selectedProfile.credit_history === 'fair' ? 'text-amber-400' : 'text-red-400'}`}>
                    {selectedProfile.credit_history === 'good' ? 'Хорошая' : selectedProfile.credit_history === 'fair' ? 'Средняя' : 'Плохая'}
                  </span>
                </div>
                <div className="border-t border-slate-800 pt-2 mt-2">
                  <p className="text-slate-500 mb-1 font-medium">Поголовье</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                    {selectedProfile.livestock.cattle > 0 && <div className="flex justify-between"><span className="text-slate-500">КРС</span><span className="text-slate-300">{selectedProfile.livestock.cattle}</span></div>}
                    {selectedProfile.livestock.dairy_cows > 0 && <div className="flex justify-between"><span className="text-slate-500">Дойные</span><span className="text-slate-300">{selectedProfile.livestock.dairy_cows}</span></div>}
                    {selectedProfile.livestock.sheep > 0 && <div className="flex justify-between"><span className="text-slate-500">Овцы</span><span className="text-slate-300">{selectedProfile.livestock.sheep}</span></div>}
                    {selectedProfile.livestock.goats > 0 && <div className="flex justify-between"><span className="text-slate-500">Козы</span><span className="text-slate-300">{selectedProfile.livestock.goats}</span></div>}
                    {selectedProfile.livestock.horses > 0 && <div className="flex justify-between"><span className="text-slate-500">Лошади</span><span className="text-slate-300">{selectedProfile.livestock.horses}</span></div>}
                    {selectedProfile.livestock.camels > 0 && <div className="flex justify-between"><span className="text-slate-500">Верблюды</span><span className="text-slate-300">{selectedProfile.livestock.camels}</span></div>}
                    {selectedProfile.livestock.poultry > 0 && <div className="flex justify-between"><span className="text-slate-500">Птица</span><span className="text-slate-300">{selectedProfile.livestock.poultry}</span></div>}
                    {selectedProfile.livestock.pigs > 0 && <div className="flex justify-between"><span className="text-slate-500">Свиньи</span><span className="text-slate-300">{selectedProfile.livestock.pigs}</span></div>}
                  </div>
                </div>
                {selectedProfile.daily_milk_liters > 0 && (
                  <div className="flex justify-between"><span className="text-slate-500">Суточный надой</span><span className="text-slate-300">{selectedProfile.daily_milk_liters} л</span></div>
                )}
                <div className="flex justify-between"><span className="text-slate-500">Падёж</span><span className={selectedProfile.mortality_rate_pct > 5 ? 'text-red-400' : 'text-slate-300'}>{selectedProfile.mortality_rate_pct}%</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Субсидии ранее</span><span className="text-slate-300">{selectedProfile.previous_subsidies.length || '—'}</span></div>
              </div>
            )}
          </div>

          {selectedProfile && capacity && (
            <div className="bg-[#0d1620] border border-blue-900/30 rounded-xl p-4">
              <h3 className="text-sm font-bold text-white mb-3">Анализ мощностей</h3>
              <CapacityBar label="Пастбища" value={capacity.landUsed} max={selectedProfile.pasture_hectares} unit=" га" warn />
              <CapacityBar label="Помещения" value={Math.round(selectedProfile.infrastructure.barn_capacity * (capacity.housingRatio / 100))} max={selectedProfile.infrastructure.barn_capacity} unit=" гол" warn />
              <CapacityBar label="Корма (зима)" value={Math.round(selectedProfile.infrastructure.feed_storage_tons)} max={Math.round(selectedProfile.infrastructure.feed_storage_tons / (capacity.feedRatio / 100 || 1))} unit=" т" warn />
              <div className="mt-3 flex items-center gap-2 text-xs">
                <span className="text-slate-500">Свободные пастбища:</span>
                <span className={`font-mono font-medium ${capacity.freeHectares > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{capacity.freeHectares} га</span>
              </div>
              {capacity.pastureSource && (
                <div className="mt-1 text-[10px] text-slate-600 truncate" title={capacity.pastureSource}>
                  Норма: {capacity.pastureSource}
                </div>
              )}
              {capacity.warnings.length > 0 && (
                <div className="mt-3 space-y-1">
                  {capacity.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs text-amber-400"><span className="mt-0.5 shrink-0">⚠</span><span>{w}</span></div>
                  ))}
                </div>
              )}
            </div>
          )}

          {eligibleRecs.length > 0 && (
            <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-4">
              <div className="text-xs text-indigo-300 mb-1">Доступно субсидий</div>
              <div className="text-2xl font-bold text-white">{eligibleRecs.length}</div>
              <div className="text-xs text-indigo-300 mt-2">Потенциальная сумма</div>
              <div className="text-lg font-bold text-white">{fmtAmount(totalPotential)}</div>
            </div>
          )}
        </div>

        {/* RIGHT: Recommendations */}
        <div className="flex-1 min-w-0 overflow-y-auto max-h-[calc(100vh-200px)] pr-1 scrollbar-thin" style={{ scrollbarWidth: 'thin', scrollbarColor: '#334155 transparent' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">Рекомендуемые субсидии</h2>
            <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
              <input type="checkbox" checked={showIneligible} onChange={e => setShowIneligible(e.target.checked)} className="rounded bg-slate-800 border-slate-600" />
              Показать недоступные ({ineligibleRecs.length})
            </label>
          </div>

          {eligibleRecs.length === 0 && (
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-8 text-center">
              <p className="text-slate-400 text-sm">Нет подходящих субсидий для текущего профиля.</p>
              <p className="text-slate-500 text-xs mt-2">Попробуйте выбрать другого фермера или расширить хозяйство.</p>
            </div>
          )}

          <div className="space-y-3">
            {eligibleRecs.map(rec => {
              const act = getAction(rec.code);
              const isExpanded = expandedCards.has(rec.code);
              return (
                <div key={rec.code} className={`bg-[#0d1620] border rounded-xl p-4 transition-colors ${act === 'dismissed' ? 'border-red-900/30 opacity-50' : act === 'invited' ? 'border-emerald-500/30' : 'border-blue-900/30 hover:border-indigo-500/40'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-mono text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">{rec.code}</span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${TRIAGE_COLORS[rec.triage]}`}>{rec.triage}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${ACTION_LABELS[act].color}`}>{ACTION_LABELS[act].label}</span>
                      </div>
                      <p className="text-sm text-white font-medium leading-tight">{rec.codeName}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{rec.clusterDescription}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-bold text-white">{rec.impactScore}</div>
                      <div className="text-[10px] text-slate-500">Impact Score</div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                    <div><span className="text-slate-500 block">Рек. объём</span><span className="text-slate-200 font-medium">{rec.recommendedVolume.toLocaleString()}</span></div>
                    <div><span className="text-slate-500 block">Норма</span><span className="text-slate-200 font-medium">{rec.norm.toLocaleString()} ₸</span></div>
                    <div><span className="text-slate-500 block">Сумма</span><span className="text-slate-200 font-medium">{fmtAmount(rec.estimatedAmount)}</span></div>
                  </div>

                  {rec.capacityWarnings.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {rec.capacityWarnings.map((w, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">⚠ {w}</span>
                      ))}
                    </div>
                  )}

                  {/* Actions + Explainability toggle */}
                  <div className="mt-3 pt-3 border-t border-slate-800 flex items-center gap-2">
                    {act !== 'invited' && (
                      <button onClick={() => setAction(rec.code, 'invited')} className="text-[11px] px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors">
                        Пригласить к подаче
                      </button>
                    )}
                    {act !== 'dismissed' && (
                      <button onClick={() => setAction(rec.code, 'dismissed')} className="text-[11px] px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-red-900/50 text-slate-400 hover:text-red-400 border border-slate-700 hover:border-red-500/30 transition-colors">
                        Отклонить
                      </button>
                    )}
                    {act !== 'new' && (
                      <button onClick={() => setAction(rec.code, 'new')} className="text-[11px] px-2 py-1.5 text-slate-500 hover:text-slate-300 transition-colors">
                        Сбросить
                      </button>
                    )}
                    <button
                      onClick={() => toggleExpand(rec.code)}
                      className="ml-auto text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      {isExpanded ? '▴ Скрыть' : '▾ Почему рекомендуем?'}
                    </button>
                  </div>

                  {/* Expanded explainability */}
                  {isExpanded && (
                    <div className="mt-3 p-3 bg-slate-900/60 rounded-lg border border-slate-800 space-y-3">
                      <div>
                        <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1.5">Соответствие профиля</p>
                        <div className="flex flex-wrap gap-1">
                          {rec.matchedFields.map((f, i) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">✓ {f}</span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1.5">Компоненты Impact Score</p>
                        <div className="space-y-1">
                          <ScoreBar label="Strategic" value={rec.components.strategic} color="bg-sky-500" />
                          <ScoreBar label="Fairness" value={rec.components.fairness} color="bg-violet-500" />
                          <ScoreBar label="Need" value={rec.components.need} color="bg-amber-500" />
                          <ScoreBar label="Efficiency" value={rec.components.efficiency} color="bg-emerald-500" />
                          <ScoreBar label="Fraud" value={rec.components.fraud} color="bg-red-500" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {showIneligible && ineligibleRecs.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-slate-500 mb-3">Недоступные субсидии</h3>
              <div className="space-y-2">
                {ineligibleRecs.map(rec => (
                  <div key={rec.code} className="bg-slate-900/50 border border-slate-800 rounded-lg p-3 opacity-60">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-mono text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded">{rec.code}</span>
                      <span className="text-xs text-slate-400 truncate">{rec.codeName}</span>
                    </div>
                    <p className="text-[11px] text-red-400/70">{rec.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
