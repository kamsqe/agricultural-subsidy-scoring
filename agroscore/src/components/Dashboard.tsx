import { useState, useEffect } from 'react';

interface Summary {
  total_applications: number;
  total_amount_billion: number;
  score_stats: { min: number; max: number; mean: number; median: number };
  score_distribution: Record<string, number>;
  by_status: Record<string, { count: number; avg_score: number; total_amount: number }>;
  by_oblast: Record<string, { count: number; avg_score: number; total_amount: number }>;
  by_category: Record<string, { count: number; avg_score: number }>;
  fraud_analysis: { high_risk_count: number; audit_required_count: number; high_risk_pct: number };
  fifo_vs_merit: {
    pending_count: number;
    fifo: { avg_score: number; small_farmer_count: number; total_amount: number };
    merit: { avg_score: number; small_farmer_count: number; total_amount: number };
    improvement: { avg_score_delta: number; small_farmer_delta: number };
  };
  gini: { current_district_gini: number };
  retry_analysis: { total_retries: number; retry_pct: number; avg_score_first: number; avg_score_retry: number };
}

interface AppRow {
  r: number; s: number; o: string; d: string; dir: string; cat: string;
  st: string; amt: number; sc: number; fc: number; nc: number; ec: number;
  fr: number; retry: number; dt: string;
}

const STATUS_COLORS: Record<string, string> = {
  'Исполнена': 'bg-emerald-500/20 text-emerald-400',
  'Одобрена': 'bg-sky-500/20 text-sky-400',
  'Отклонена': 'bg-red-500/20 text-red-400',
  'Сформировано поручение': 'bg-amber-500/20 text-amber-400',
  'Отозвано': 'bg-slate-500/20 text-slate-400',
  'Получена': 'bg-violet-500/20 text-violet-400',
};

const DIRECTION_LABELS: Record<string, string> = {
  cattle: 'КРС', dairy: 'Молоко', sheep: 'Овцы', poultry: 'Птица',
  horses: 'Лошади', pigs: 'Свиньи', camels: 'Верблюды', meat: 'Мясо',
  breeding: 'Племенное', other: 'Другое',
};

function formatAmount(amt: number): string {
  if (amt >= 1e9) return (amt / 1e9).toFixed(1) + ' млрд';
  if (amt >= 1e6) return (amt / 1e6).toFixed(1) + ' млн';
  if (amt >= 1e3) return (amt / 1e3).toFixed(0) + ' тыс';
  return amt.toString();
}

function ScoreBar({ value, max = 100, color = 'bg-emerald-500' }: { value: number; max?: number; color?: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="w-full bg-slate-800 rounded-full h-2">
      <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function MetricCard({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon?: string }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="text-slate-400 text-sm mb-1">{icon} {label}</div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-slate-500 text-xs mt-1">{sub}</div>}
    </div>
  );
}

function ScoreHistogram({ distribution }: { distribution: Record<string, number> }) {
  const entries = Object.entries(distribution).map(([k, v]) => ({ bucket: parseInt(k), count: v })).sort((a, b) => a.bucket - b.bucket);
  const maxCount = Math.max(...entries.map(e => e.count));

  return (
    <div className="flex items-end gap-1 h-32">
      {entries.map(({ bucket, count }) => (
        <div key={bucket} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="w-full bg-emerald-500/80 rounded-t transition-all hover:bg-emerald-400"
            style={{ height: `${(count / maxCount) * 100}%` }}
            title={`${bucket}-${bucket + 9}: ${count.toLocaleString()}`}
          />
          <span className="text-[10px] text-slate-500">{bucket}</span>
        </div>
      ))}
    </div>
  );
}

function ComparisonCard({ summary }: { summary: Summary }) {
  const { fifo, merit, improvement } = summary.fifo_vs_merit;
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold mb-4">FIFO vs Merit-Based</h3>
      <p className="text-slate-400 text-sm mb-4">
        Симуляция: {summary.fifo_vs_merit.pending_count.toLocaleString()} заявок в очереди, бюджет на 50%
      </p>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-red-950/30 border border-red-900/30 rounded-lg p-4">
          <div className="text-red-400 text-sm font-medium mb-2">FIFO (текущий)</div>
          <div className="text-2xl font-bold text-red-300">{fifo.avg_score}</div>
          <div className="text-red-400/60 text-xs">средний балл</div>
          <div className="mt-2 text-sm text-red-300">{fifo.small_farmer_count} мелких фермеров</div>
        </div>
        <div className="bg-emerald-950/30 border border-emerald-900/30 rounded-lg p-4">
          <div className="text-emerald-400 text-sm font-medium mb-2">Merit (наш подход)</div>
          <div className="text-2xl font-bold text-emerald-300">{merit.avg_score}</div>
          <div className="text-emerald-400/60 text-xs">средний балл</div>
          <div className="mt-2 text-sm text-emerald-300">{merit.small_farmer_count} мелких фермеров</div>
        </div>
      </div>
      <div className="bg-slate-800/50 rounded-lg p-3 text-center">
        <span className="text-emerald-400 font-bold text-lg">+{improvement.avg_score_delta}</span>
        <span className="text-slate-400 text-sm ml-2">средний балл</span>
        <span className="mx-3 text-slate-600">|</span>
        <span className="text-emerald-400 font-bold text-lg">+{improvement.small_farmer_delta}</span>
        <span className="text-slate-400 text-sm ml-2">мелких фермеров</span>
      </div>
    </div>
  );
}

function OblastTable({ by_oblast }: { by_oblast: Summary['by_oblast'] }) {
  const sorted = Object.entries(by_oblast)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.avg_score - a.avg_score);

  const maxScore = Math.max(...sorted.map(o => o.avg_score));
  const minScore = Math.min(...sorted.map(o => o.avg_score));

  return (
    <div className="space-y-1.5">
      {sorted.map((oblast) => {
        const pct = ((oblast.avg_score - minScore) / (maxScore - minScore)) * 100;
        return (
          <div key={oblast.name} className="flex items-center gap-3 text-sm">
            <span className="w-48 text-slate-300 truncate text-right" title={oblast.name}>
              {oblast.name.replace('область', 'обл.').replace('Казахстанская', 'Каз.')}
            </span>
            <div className="flex-1 bg-slate-800 rounded-full h-3 relative">
              <div
                className="bg-gradient-to-r from-amber-500 to-emerald-500 h-3 rounded-full"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-12 text-right font-mono text-slate-200">{oblast.avg_score}</span>
            <span className="w-16 text-right text-slate-500">{oblast.count.toLocaleString()}</span>
          </div>
        );
      })}
    </div>
  );
}

function ApplicationTable({ apps, title }: { apps: AppRow[]; title: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-slate-400">
            <th className="text-left py-2 px-2">#</th>
            <th className="text-left py-2 px-2">Балл</th>
            <th className="text-left py-2 px-2">S</th>
            <th className="text-left py-2 px-2">F</th>
            <th className="text-left py-2 px-2">N</th>
            <th className="text-left py-2 px-2">E</th>
            <th className="text-left py-2 px-2">FR</th>
            <th className="text-left py-2 px-2">Область</th>
            <th className="text-left py-2 px-2">Район</th>
            <th className="text-right py-2 px-2">Сумма</th>
            <th className="text-left py-2 px-2">Статус</th>
            <th className="text-left py-2 px-2">Retry</th>
          </tr>
        </thead>
        <tbody>
          {apps.map((app, i) => (
            <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
              <td className="py-1.5 px-2 text-slate-500 font-mono">{app.r}</td>
              <td className="py-1.5 px-2">
                <span className={`font-bold ${app.s >= 60 ? 'text-emerald-400' : app.s >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                  {app.s.toFixed(1)}
                </span>
              </td>
              <td className="py-1.5 px-2 text-slate-400 font-mono text-xs">{app.sc}</td>
              <td className="py-1.5 px-2 text-slate-400 font-mono text-xs">{app.fc}</td>
              <td className="py-1.5 px-2 text-slate-400 font-mono text-xs">{app.nc}</td>
              <td className="py-1.5 px-2 text-slate-400 font-mono text-xs">{app.ec}</td>
              <td className="py-1.5 px-2 font-mono text-xs">
                <span className={app.fr > 30 ? 'text-red-400' : 'text-slate-500'}>{app.fr}</span>
              </td>
              <td className="py-1.5 px-2 text-slate-300 text-xs truncate max-w-[120px]" title={app.o}>
                {app.o.replace('область', '').replace('Казахстанская', 'Каз.').trim()}
              </td>
              <td className="py-1.5 px-2 text-slate-400 text-xs truncate max-w-[120px]" title={app.d}>{app.d}</td>
              <td className="py-1.5 px-2 text-right text-slate-300 font-mono text-xs">{formatAmount(app.amt)} ₸</td>
              <td className="py-1.5 px-2">
                <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_COLORS[app.st] || 'bg-slate-700 text-slate-300'}`}>
                  {app.st.length > 12 ? app.st.slice(0, 10) + '…' : app.st}
                </span>
              </td>
              <td className="py-1.5 px-2 text-center">
                {app.retry > 0 && <span className="text-amber-400 text-xs">{app.retry}x</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [topApps, setTopApps] = useState<AppRow[]>([]);
  const [bottomApps, setBottomApps] = useState<AppRow[]>([]);
  const [tab, setTab] = useState<'top' | 'bottom'>('top');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/data/scoring_summary.json').then(r => r.json()),
      fetch('/data/top500.json').then(r => r.json()),
      fetch('/data/bottom500.json').then(r => r.json()),
    ]).then(([sum, top, bottom]) => {
      setSummary(sum);
      setTopApps(top);
      setBottomApps(bottom);
      setLoading(false);
    });
  }, []);

  if (loading || !summary) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-slate-400 text-lg">Загрузка данных...</div>
      </div>
    );
  }

  const ss = summary.score_stats;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <header className="mb-10">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-emerald-400 to-sky-400 bg-clip-text text-transparent">
          AgroScore
        </h1>
        <p className="text-slate-400 mt-2">
          Merit-based система ранжирования сельхозсубсидий — {summary.total_applications.toLocaleString()} заявок, {summary.total_amount_billion} млрд ₸
        </p>
      </header>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <MetricCard label="Заявок" value={summary.total_applications.toLocaleString()} sub="36,651 за 2025 год" icon="📋" />
        <MetricCard label="Средний балл" value={ss.mean} sub={`${ss.min} — ${ss.max}`} icon="📊" />
        <MetricCard label="Gini (район)" value={summary.gini.current_district_gini} sub="0 = равенство, 1 = монополия" icon="⚖️" />
        <MetricCard label="Fraud-риск" value={summary.fraud_analysis.high_risk_count} sub={`${summary.fraud_analysis.high_risk_pct}% заявок`} icon="🚨" />
      </div>

      {/* Score Distribution */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Распределение баллов</h3>
          <ScoreHistogram distribution={summary.score_distribution} />
          <div className="flex justify-between text-xs text-slate-500 mt-2">
            <span>Мин: {ss.min}</span>
            <span>Медиана: {ss.median}</span>
            <span>Макс: {ss.max}</span>
          </div>
        </div>
        <ComparisonCard summary={summary} />
      </div>

      {/* Retry Analysis + Status Breakdown */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Retry-анализ</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Повторные подачи</span>
              <span className="text-amber-400 font-bold">{summary.retry_analysis.retry_pct}%</span>
            </div>
            <ScoreBar value={summary.retry_analysis.retry_pct} color="bg-amber-500" />
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="text-xs text-slate-500">Первая подача</div>
                <div className="text-lg font-bold text-emerald-400">{summary.retry_analysis.avg_score_first}</div>
                <div className="text-xs text-slate-500">средний балл</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="text-xs text-slate-500">Повторная подача</div>
                <div className="text-lg font-bold text-amber-400">{summary.retry_analysis.avg_score_retry}</div>
                <div className="text-xs text-slate-500">средний балл</div>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">По статусам</h3>
          <div className="space-y-2">
            {Object.entries(summary.by_status)
              .sort(([, a], [, b]) => b.avg_score - a.avg_score)
              .map(([status, data]) => (
                <div key={status} className="flex items-center gap-2">
                  <span className={`text-xs px-1.5 py-0.5 rounded w-40 text-center ${STATUS_COLORS[status] || ''}`}>
                    {status.length > 18 ? status.slice(0, 16) + '…' : status}
                  </span>
                  <div className="flex-1">
                    <ScoreBar value={data.avg_score} max={70} color={data.avg_score > 57 ? 'bg-emerald-500' : 'bg-amber-500'} />
                  </div>
                  <span className="text-sm font-mono text-slate-300 w-10 text-right">{data.avg_score}</span>
                  <span className="text-xs text-slate-500 w-14 text-right">{data.count.toLocaleString()}</span>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Oblast Rankings */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-8">
        <h3 className="text-lg font-semibold mb-4">Средний балл по областям</h3>
        <OblastTable by_oblast={summary.by_oblast} />
      </div>

      {/* Applications Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-8">
        <div className="flex items-center gap-4 mb-4">
          <h3 className="text-lg font-semibold">Заявки</h3>
          <div className="flex gap-1 bg-slate-800 rounded-lg p-0.5">
            <button
              onClick={() => setTab('top')}
              className={`px-3 py-1 rounded-md text-sm transition ${tab === 'top' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Топ-500
            </button>
            <button
              onClick={() => setTab('bottom')}
              className={`px-3 py-1 rounded-md text-sm transition ${tab === 'bottom' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Низ-500
            </button>
          </div>
          <div className="text-xs text-slate-500 ml-auto">
            S=Strategic F=Fairness N=Need E=Efficiency FR=Fraud
          </div>
        </div>
        <ApplicationTable
          apps={tab === 'top' ? topApps : bottomApps}
          title={tab === 'top' ? 'Топ-500 по баллам' : 'Низшие 500 по баллам'}
        />
      </div>

      {/* Methodology */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-8">
        <h3 className="text-lg font-semibold mb-4">Методология Impact Score</h3>
        <div className="grid md:grid-cols-5 gap-4 text-center">
          {[
            { name: 'Strategic', weight: '20%', desc: 'Соответствие приоритетам АПК', color: 'text-sky-400' },
            { name: 'Fairness', weight: '20%', desc: 'Справедливость распределения', color: 'text-violet-400' },
            { name: 'Need', weight: '20%', desc: 'Региональная потребность', color: 'text-amber-400' },
            { name: 'Efficiency', weight: '20%', desc: 'Потенциал эффективности', color: 'text-emerald-400' },
            { name: 'Fraud', weight: '-10%', desc: 'Штраф за аномалии', color: 'text-red-400' },
          ].map((c) => (
            <div key={c.name} className="bg-slate-800/50 rounded-lg p-3">
              <div className={`font-bold text-lg ${c.color}`}>{c.weight}</div>
              <div className="text-white text-sm font-medium">{c.name}</div>
              <div className="text-slate-500 text-xs mt-1">{c.desc}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 text-xs text-slate-500 text-center">
          + 10% базовый балл (50) = 100% | Данные: 36,651 заявок + 34 региональных фичи (stat.gov.kz) + бюджет/статистика (subsidy.plem.kz)
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center text-slate-600 text-sm py-8">
        <p>AgroScore — Decentrathon 5.0 | AI inDrive | Кейс 2</p>
        <p className="mt-1">Данные: subsidy.plem.kz + stat.gov.kz | {summary.total_applications.toLocaleString()} заявок</p>
      </footer>
    </div>
  );
}
