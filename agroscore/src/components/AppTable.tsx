import { useState, useEffect, useMemo, useCallback } from 'react';

export interface App {
  r: number; s: number; p: number; t: string;
  sc: number; fc: number; nc: number; ec: number; fr: number; ex: number; ano: number;
  o: string; d: string; amt: number; st: string;
  retry: number; cat: string; code: string; vol: number; date: string;
}

interface SubsidyCode { name: string; count: number; avg_amount: number; median_amount: number; }

const TRIAGE_COLORS: Record<string, string> = {
  A: 'text-emerald-400', B: 'text-sky-400', C: 'text-amber-400', D: 'text-red-400',
};

const STATUS_SHORT: Record<string, string> = {
  'Исполнена': 'Исп.',
  'Одобрена': 'Одобр.',
  'Отклонена': 'Откл.',
  'Отозвано': 'Отозв.',
  'Сформировано поручение': 'Поруч.',
  'Получена': 'Получ.',
};

const PAGE_SIZE = 100;

interface AppTableProps {
  onRowClick?: (app: App) => void;
  selectedAppId?: number;
}

export default function AppTable({ onRowClick, selectedAppId }: AppTableProps = {}) {
  const [apps, setApps] = useState<App[]>([]);
  const [codes, setCodes] = useState<Record<string, SubsidyCode>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [oblastFilter, setOblastFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [triageFilter, setTriageFilter] = useState('');
  const [scoreMin, setScoreMin] = useState(0);
  const [scoreMax, setScoreMax] = useState(100);
  const [sortField, setSortField] = useState<'r' | 's' | 'amt' | 'p'>('r');
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(0);

  useEffect(() => {
    Promise.all([
      fetch('/data/all_apps.json').then(r => r.json()),
      fetch('/data/subsidy_codes.json').then(r => r.json()),
    ]).then(([appsData, codesData]) => {
      setApps(appsData);
      setCodes(codesData);
      setLoading(false);
    }).catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const oblasts = useMemo(() => [...new Set(apps.map(a => a.o))].sort(), [apps]);
  const statuses = useMemo(() => [...new Set(apps.map(a => a.st))].sort(), [apps]);

  const filtered = useMemo(() => {
    let result = apps;
    if (oblastFilter) result = result.filter(a => a.o === oblastFilter);
    if (statusFilter) result = result.filter(a => a.st === statusFilter);
    if (triageFilter) result = result.filter(a => a.t === triageFilter);
    if (scoreMin > 0 || scoreMax < 100) result = result.filter(a => a.s >= scoreMin && a.s <= scoreMax);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(a =>
        a.o.toLowerCase().includes(q) ||
        a.d.toLowerCase().includes(q) ||
        a.code.includes(q) ||
        a.cat.toLowerCase().includes(q)
      );
    }
    // Sort
    result = [...result].sort((a, b) => {
      const va = a[sortField], vb = b[sortField];
      return sortAsc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });
    return result;
  }, [apps, oblastFilter, statusFilter, triageFilter, scoreMin, scoreMax, search, sortField, sortAsc]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageApps = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);

  const handleSort = useCallback((field: typeof sortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(field === 'r'); }
    setPage(0);
  }, [sortField, sortAsc]);

  const resetFilters = () => {
    setSearch(''); setOblastFilter(''); setStatusFilter(''); setTriageFilter('');
    setScoreMin(0); setScoreMax(100); setPage(0);
  };

  const exportCSV = () => {
    const headers = ['ID', 'Балл', 'Приоритет', 'Процент', 'Стратегия(S)', 'Справедливость(F)', 'Нужда(N)', 'Эффективность(E)', 'Риск Фрода(FR)', 'Аномалия(ML)', 'Область', 'Район', 'Сумма(KZT)', 'Статус', 'ОКЭД', 'Попыток(Retry)', 'Дата'];
    const rows = filtered.map(a => [
      a.r, a.s.toFixed(2), a.t, a.p, a.sc, a.fc, a.nc, a.ec, a.fr, a.ano,
      `"${a.o}"`, `"${a.d}"`, a.amt, `"${a.st}"`, `"${a.code}"`, a.retry, `"${a.date}"`
    ]);
    const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `agroscore_registry_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) return <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-slate-400">Загрузка 36,651 заявок...</div>;
  if (error) return <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-red-400">Ошибка: {error}</div>;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold cursor-pointer">Все заявки</h3>
          <p className="text-slate-400 text-sm">{filtered.length.toLocaleString()} из {apps.length.toLocaleString()} заявок</p>
        </div>
        <div className="flex gap-4 items-center">
          <button onClick={exportCSV} className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-1.5 px-3 rounded shadow transition-colors flex items-center gap-2">
            <span>📥</span> Экспорт (CSV)
          </button>
          <button onClick={resetFilters} className="text-xs text-slate-500 hover:text-slate-300 transition">Сбросить фильтры</button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-4">
        <input
          type="text" placeholder="Поиск (район, код)..." value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          className="col-span-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-600"
        />
        <select value={oblastFilter} onChange={e => { setOblastFilter(e.target.value); setPage(0); }}
          className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200">
          <option value="">Все области</option>
          {oblasts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0); }}
          className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200">
          <option value="">Все статусы</option>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={triageFilter} onChange={e => { setTriageFilter(e.target.value); setPage(0); }}
          className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200">
          <option value="">Все приоритеты</option>
          <option value="A">A — Высокий</option>
          <option value="B">B — Стандартный</option>
          <option value="C">C — Низкий</option>
          <option value="D">D — Отклонение</option>
        </select>
        <div className="flex gap-1 items-center">
          <input type="number" min={0} max={100} value={scoreMin}
            onChange={e => { setScoreMin(Number(e.target.value)); setPage(0); }}
            className="w-14 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200" placeholder="мин" />
          <span className="text-slate-600 text-xs">–</span>
          <input type="number" min={0} max={100} value={scoreMax}
            onChange={e => { setScoreMax(Number(e.target.value)); setPage(0); }}
            className="w-14 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200" placeholder="макс" />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 border-b border-slate-800">
              <th className="py-2 px-1 text-left cursor-pointer hover:text-slate-300" onClick={() => handleSort('r')}># {sortField === 'r' ? (sortAsc ? '▲' : '▼') : ''}</th>
              <th className="py-2 px-1 text-left cursor-pointer hover:text-slate-300" onClick={() => handleSort('s')}>Балл {sortField === 's' ? (sortAsc ? '▲' : '▼') : ''}</th>
              <th className="py-2 px-1 text-left">Triage</th>
              <th className="py-2 px-1 text-left cursor-pointer hover:text-slate-300" onClick={() => handleSort('p')}>% {sortField === 'p' ? (sortAsc ? '▲' : '▼') : ''}</th>
              <th className="py-2 px-1 text-left">S</th>
              <th className="py-2 px-1 text-left">F</th>
              <th className="py-2 px-1 text-left">N</th>
              <th className="py-2 px-1 text-left">E</th>
              <th className="py-2 px-1 text-left">FR</th>
              <th className="py-2 px-1 text-left">ML-Аномалия</th>
              <th className="py-2 px-1 text-left">Область</th>
              <th className="py-2 px-1 text-left">Район</th>
              <th className="py-2 px-1 text-right cursor-pointer hover:text-slate-300" onClick={() => handleSort('amt')}>Сумма {sortField === 'amt' ? (sortAsc ? '▲' : '▼') : ''}</th>
              <th className="py-2 px-1 text-left">Статус</th>
              <th className="py-2 px-1 text-left">Код</th>
              <th className="py-2 px-1 text-right">Retry</th>
              <th className="py-2 px-1 text-left">Дата</th>
            </tr>
          </thead>
          <tbody>
            {pageApps.map((a) => (
              <tr 
                key={a.r} 
                onClick={() => onRowClick?.(a)}
                className={`border-b border-slate-800/50 transition-colors cursor-pointer ${
                  selectedAppId === a.r 
                    ? 'bg-indigo-900/40 hover:bg-indigo-900/60 border-indigo-500/50' 
                    : 'hover:bg-slate-800/50'
                }`}
              >
                <td className="py-1.5 px-1 text-slate-500 font-mono">{a.r}</td>
                <td className="py-1.5 px-1 font-mono font-bold">
                  <span className={a.s >= 65 ? 'text-emerald-400' : a.s >= 55 ? 'text-sky-400' : a.s >= 40 ? 'text-amber-400' : 'text-red-400'}>
                    {a.s.toFixed(1)}
                  </span>
                </td>
                <td className={`py-1.5 px-1 font-bold ${TRIAGE_COLORS[a.t] || 'text-slate-400'}`}>{a.t}</td>
                <td className="py-1.5 px-1 text-slate-400 font-mono">{a.p}%</td>
                <td className="py-1.5 px-1 text-sky-400/60 font-mono">{a.sc}</td>
                <td className="py-1.5 px-1 text-violet-400/60 font-mono">{a.fc}</td>
                <td className="py-1.5 px-1 text-amber-400/60 font-mono">{a.nc}</td>
                <td className="py-1.5 px-1 text-emerald-400/60 font-mono">{a.ec}</td>
                <td className="py-1.5 px-1 text-red-400/60 font-mono">{a.fr}</td>
                <td className="py-1.5 px-1 font-mono">
                  {a.ano > 70 ? (
                    <span className="bg-red-500/20 text-red-400 px-1 py-0.5 rounded text-xs animate-pulse ring-1 ring-red-500/50">
                      {a.ano}%
                    </span>
                  ) : a.ano > 40 ? (
                    <span className="text-amber-400/80 text-xs">{a.ano}%</span>
                  ) : (
                    <span className="text-slate-600 text-xs">{a.ano}%</span>
                  )}
                </td>
                <td className="py-1.5 px-1 text-slate-300 truncate max-w-[120px]" title={a.o}>{a.o}</td>
                <td className="py-1.5 px-1 text-slate-400 truncate max-w-[100px]" title={a.d}>{a.d}</td>
                <td className="py-1.5 px-1 text-right text-slate-300 font-mono">{(a.amt / 1e6).toFixed(1)}M</td>
                <td className="py-1.5 px-1 text-slate-400" title={a.st}>{STATUS_SHORT[a.st] || a.st.slice(0, 6)}</td>
                <td className="py-1.5 px-1 text-slate-500 font-mono">{a.code}</td>
                <td className="py-1.5 px-1 text-right text-slate-500">{a.retry > 0 ? a.retry : ''}</td>
                <td className="py-1.5 px-1 text-slate-600 font-mono">{a.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <div className="text-xs text-slate-500">
            Стр. {page + 1} из {totalPages} ({filtered.length.toLocaleString()} записей)
          </div>
          <div className="flex gap-1">
            <button onClick={() => setPage(0)} disabled={page === 0}
              className="px-2 py-1 text-xs bg-slate-800 rounded hover:bg-slate-700 disabled:opacity-30 text-slate-300">{'<<'}</button>
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="px-2 py-1 text-xs bg-slate-800 rounded hover:bg-slate-700 disabled:opacity-30 text-slate-300">{'<'}</button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const start = Math.max(0, Math.min(page - 2, totalPages - 5));
              const p = start + i;
              return p < totalPages ? (
                <button key={p} onClick={() => setPage(p)}
                  className={`px-2 py-1 text-xs rounded ${p === page ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                  {p + 1}
                </button>
              ) : null;
            })}
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              className="px-2 py-1 text-xs bg-slate-800 rounded hover:bg-slate-700 disabled:opacity-30 text-slate-300">{'>'}</button>
            <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}
              className="px-2 py-1 text-xs bg-slate-800 rounded hover:bg-slate-700 disabled:opacity-30 text-slate-300">{'>>'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
