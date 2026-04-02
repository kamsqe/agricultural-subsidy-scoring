import { useState, useEffect } from 'react';
import Simulator from './Simulator';
import AiAssistant from './AiAssistant';

import PolicyConfigurator from './PolicyConfigurator';
import MacroRoi from './MacroRoi';
import OblastDecentralization from './OblastDecentralization';
import TriagePipeline from './TriagePipeline';
import AnomalyRadar from './AnomalyRadar';
import PdfToPython from './PdfToPython';

function ScoreHistogram({ distribution }: { distribution: Record<string, number> }) {
  const entries = Object.entries(distribution).map(([bucket, count]) => ({ bucket: parseInt(bucket), count: count as number })).sort((a, b) => a.bucket - b.bucket);
  const maxCount = Math.max(...entries.map(e => e.count));
  return (
    <div className="flex items-end gap-2 h-28">
      {entries.map(e => (
        <div key={e.bucket} className="flex-1 flex flex-col items-center gap-1">
          <div className="text-[9px] text-slate-500 font-mono">{e.count > 999 ? `${(e.count/1000).toFixed(0)}k` : e.count}</div>
          <div
            className="w-full rounded-t bg-gradient-to-t from-emerald-600 to-emerald-400 transition-all"
            style={{ height: `${Math.max(4, (e.count / maxCount) * 96)}px` }}
          />
          <div className="text-[10px] text-slate-500">{e.bucket}-{e.bucket + 9}</div>
        </div>
      ))}
    </div>
  );
}

function SectionHeader({ num, title, color }: { num: string; title: string; color: string }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center gap-4 mb-10 pb-4 border-b border-slate-800/50">
      <div className={`w-12 h-12 shrink-0 rounded-full flex items-center justify-center font-bold text-white shadow-[0_0_20px_rgba(0,0,0,0.5)] text-xl ${color}`}>
        {num}
      </div>
      <h2 className="text-3xl font-bold text-white tracking-tight">{title}</h2>
    </div>
  );
}

function DatasetAutopsy() {
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 mt-6 text-sm ml-12">
      <div className="grid md:grid-cols-3 gap-4">
        <div>
           <div className="text-slate-500 mb-1">📁 Что дали в Excel</div>
           <ul className="text-slate-300 space-y-1 text-xs">
             <li className="flex gap-2"><span className="text-slate-600">▪</span> Регион / Район</li>
             <li className="flex gap-2"><span className="text-slate-600">▪</span> Запрошенная Сумма</li>
             <li className="flex gap-2"><span className="text-slate-600">▪</span> Исторический Статус</li>
             <li className="flex gap-2"><span className="text-slate-600">▪</span> Тайминг подачи (Месяц)</li>
           </ul>
        </div>
        <div className="border-l border-red-500/20 pl-4">
           <div className="text-red-400 mb-1 font-bold">🔴 Слепая Зона (Невидимо AI)</div>
           <ul className="text-slate-400 space-y-1 text-xs">
             <li className="flex gap-2"><span className="text-red-500/50">✕</span> Скан-копии (Плем. учет)</li>
             <li className="flex gap-2"><span className="text-red-500/50">✕</span> Реальная причина МИО</li>
             <li className="flex gap-2"><span className="text-red-500/50">✕</span> Урожайность / Выживаемость</li>
             <li className="flex gap-2"><span className="text-red-500/50">✕</span> Налоговые отчисления</li>
           </ul>
        </div>
        <div className="border-l border-emerald-500/20 pl-4">
           <div className="text-emerald-400 mb-1 font-bold">🟢 Инъекция AgroScore</div>
           <ul className="text-slate-300 space-y-1 text-xs">
             <li className="flex gap-2"><span className="text-emerald-500">✓</span> Индекс Монополии (stat.gov)</li>
             <li className="flex gap-2"><span className="text-emerald-500">✓</span> Бюджетное давление региона</li>
             <li className="flex gap-2"><span className="text-emerald-500">✓</span> ML-Аномалии Фермера</li>
             <li className="flex gap-2"><span className="text-emerald-500">✓</span> ТЗ Концепции АПК</li>
           </ul>
        </div>
      </div>
      <div className="mt-4 p-3 bg-red-950/20 rounded border border-red-900/30 text-red-200/80 text-xs">
        <b>Архитектурный Вывод:</b> 69% реальных причин отказа лежат в бумажных сканах. Любая ML-модель, обученная предсказывать отказ по оставшимся колонкам, обречена предсказывать только скорость интернета фермера и дефицит бюджета в его регионе.
      </div>
    </div>
  );
}

function IdeaGraveyard() {
  const ideas = [
    {
      title: "Предиктивный AI-классификатор",
      why: "Приводит к Ceiling Effect. Исторический статус 'Одобрено' зависит от наличия транша в регионе, а не от качества фермы. Модель автоматизирует географическую дискриминацию (Data Leakage)."
    },
    {
      title: "ML Кластеризация (K-Means/KNN)",
      why: "Кластеры не имеют юридической силы. Комиссия не может отказать в субсидии с формулировкой 'Фермер попал в Кластер 3'. Закон требует прозрачных цифровых баллов (Rules Engine)."
    },
    {
      title: "Генеративный AI как Скорер (LLM)",
      why: "Галлюцинации недопустимы при распределении 60 млрд тенге. LLM переведен в защищенный статус 'AI-Ассистента' исключительно для извлечения смыслов из юридических PDF."
    },
    {
      title: "Полный AI-Автопилот",
      why: "ТЗ хакатона и Закон РК требуют 'Системы поддержки решений' для Комиссии. Отбирать у человека право подписи до создания государственного Реестра (2027 г.) — это преступление."
    },
    {
      title: "Модели EU CAP / USDA EQIP",
      why: "Квадратичное финансирование и Blockchain-распределение отвергнуты как over-engineering для текущего уровня цифровизации АПК. Взяты лишь базовые концепты merit-based."
    },
    {
      title: "Интеграция с Credit Bureau",
      why: "Отброшено для MVP. Анализ 'AS IS' ГИСС показал отсутствие API-интеграции с ПКБ на момент подачи заявки. Мы строим решение, которое может работать на проде уже завтра."
    }
  ];
  return (
    <div className="mt-16 mb-16 pt-8 pb-12 border-y border-slate-800/50 bg-slate-900/30">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center gap-3 mb-6">
          <h3 className="text-2xl font-bold bg-gradient-to-r from-slate-200 to-slate-400 bg-clip-text text-transparent">Кладбище Подходов</h3>
          <span className="px-2 py-1 text-xs bg-slate-800 text-slate-400 rounded border border-slate-700">Декомпозиция R&D</span>
        </div>
        <p className="text-slate-400 text-sm mb-8 max-w-3xl">
          Ниже представлены 6 ML-стратегий, которые мы формально протестировали и <b>уничтожили</b>. Мы не строим "модель ради модели". Если алгоритм не соответствует правовой реальности или работает как "чёрный ящик", он не пойдет в production.
        </p>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ideas.map((idx, i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 p-5 rounded-xl hover:border-red-900/50 transition-colors shadow-inner">
               <div className="flex items-start gap-2 mb-3">
                  <span className="text-red-500 font-bold mt-0.5 text-lg">✕</span>
                  <h4 className="font-bold text-slate-300 text-sm">{idx.title}</h4>
               </div>
               <p className="text-xs text-slate-500 leading-relaxed pl-7">
                  <b className="text-slate-400">Вердикт:</b> {idx.why}
               </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FifoKiller({ summary }: { summary: Summary }) {
  return (
    <div className="mt-8 mb-12 bg-[#060D14] border border-sky-900/40 rounded-2xl p-6 md:p-10 relative overflow-hidden shadow-2xl">
      <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 blur-[100px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-sky-500/5 blur-[100px] rounded-full pointer-events-none" />
      
      <div className="flex items-center gap-3 mb-6 relative z-10">
        <h3 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-sky-400 bg-clip-text text-transparent tracking-tight">Решение проблемы FIFO: От Потока к Пулу</h3>
      </div>
      
      <p className="text-slate-300 text-sm mb-10 leading-relaxed max-w-4xl relative z-10 border-l-4 border-emerald-500/50 pl-4 py-1">
        Как именно мы защищаем систему от ботов, подающих тысячи заявок в 01:00 ночи? Очень просто: мы уничтожили саму концепцию <span className="font-bold text-red-400">«Гонки Скоростей» (Резервирование по клику)</span>. AgroScore переводит архитектуру ГосУслуг с поточной раздачи на <span className="font-bold text-emerald-400">Механику Ранжированного Пула (Batch Triage)</span>.
      </p>

      <div className="grid lg:grid-cols-2 gap-8 relative z-10">
        {/* Old System / FIFO */}
        <div className="bg-[#111622] border border-red-900/30 rounded-xl p-6 relative shadow-[inset_0_2px_20px_rgba(0,0,0,0.5)]">
          <div className="absolute top-0 right-0 bg-red-900/80 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider shadow-sm">Было (Stream)</div>
          <h4 className="font-bold text-slate-300 mb-6 text-lg flex items-center gap-2">
            <span className="text-red-500 text-xl">⏱️</span> Механика Скорости
          </h4>
          
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-[#0D1117] p-3 rounded border border-slate-800">
               <div className="text-3xl drop-shadow-md">🤖</div>
               <div className="flex-1">
                 <div className="text-sm font-bold text-slate-200">API Бот</div>
                 <div className="text-xs text-red-400 font-mono">Тайминг: 01:00:04</div>
               </div>
               <div className="text-emerald-400 text-[11px] font-bold bg-emerald-500/10 px-2 py-1 rounded uppercase tracking-wider border border-emerald-500/20">Резерв</div>
            </div>
            
            <div className="flex flex-col items-center justify-center opacity-60">
               <div className="w-0.5 h-4 bg-gradient-to-b from-red-500/50 to-red-500"></div>
               <div className="text-[10px] text-red-400 font-mono uppercase border border-red-500/30 bg-red-950/30 px-3 py-0.5 rounded-full">Бюджет Исчерпан</div>
               <div className="w-0.5 h-4 bg-gradient-to-b from-red-500 to-transparent"></div>
            </div>
            
            <div className="flex items-center gap-3 bg-[#0D1117] p-3 rounded border border-slate-800 opacity-40 grayscale">
               <div className="text-3xl">🚜</div>
               <div className="flex-1">
                 <div className="text-sm font-bold text-slate-200">Малый Фермер</div>
                 <div className="text-xs text-slate-500 font-mono">Тайминг: 09:30:15</div>
               </div>
               <div className="text-red-400 text-[11px] font-bold bg-red-500/10 px-2 py-1 rounded uppercase tracking-wider border border-red-500/20">Отказ</div>
            </div>
          </div>
          <div className="mt-6 p-4 bg-[#1A1215] text-red-300/80 text-xs rounded border border-red-900/40 leading-relaxed shadow-inner">
            <b className="text-red-400 font-semibold block mb-1">Уязвимость:</b> Как только ваша заявка касается базы, деньги бронируются. Выигрывает самый быстрый интернет.
          </div>
        </div>

        {/* New System / AgroScore */}
        <div className="bg-[#0B1A1E] border border-emerald-900/50 rounded-xl p-6 relative shadow-[0_5px_25px_rgba(16,185,129,0.05)]">
          <div className="absolute top-0 right-0 bg-emerald-600/80 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider shadow-sm">Стало (Batch)</div>
          <h4 className="font-bold text-slate-300 mb-6 text-lg flex items-center gap-2">
            <span className="text-emerald-400 text-xl">📊</span> Ранжированный Пул
          </h4>
          
          <div className="space-y-4">
            <div className="text-[10px] text-emerald-400/80 text-center font-mono uppercase bg-[#062820] p-2 rounded border border-emerald-900/60 shadow-inner">
              Окно приема заявок: 5 Дней (Сбор в общий котел)
            </div>
            
            <div className="flex items-center gap-3 bg-[#0D1514] p-3 rounded border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.15)] transform -translate-y-1 transition-transform">
               <div className="text-3xl drop-shadow-lg">🚜</div>
               <div className="flex-1">
                 <div className="text-sm font-bold text-emerald-300">Малый Фермер</div>
                 <div className="text-xs text-emerald-500/80 font-mono">Merit-Балл: 92 (Топ пула)</div>
               </div>
               <div className="text-emerald-400 text-[11px] font-bold bg-emerald-500/10 px-2 py-1 rounded uppercase tracking-wider border border-emerald-400/30">Одобрено</div>
            </div>
            
            <div className="flex flex-col items-center justify-center">
               <div className="w-0.5 h-4 bg-gradient-to-b from-slate-700/50 to-slate-700"></div>
               <div className="text-[9px] text-slate-400 font-mono uppercase bg-[#111823] px-3 py-0.5 rounded-full border border-slate-700 shadow-sm">Линия Отсечения Бюджета</div>
               <div className="w-0.5 h-4 bg-gradient-to-b from-slate-700 to-transparent"></div>
            </div>
            
            <div className="flex items-center gap-3 bg-[#0D1117] p-3 rounded border border-slate-800 opacity-60">
               <div className="text-3xl">🤖</div>
               <div className="flex-1">
                 <div className="text-sm font-bold text-slate-300">API Бот</div>
                 <div className="text-xs text-slate-500 font-mono">Merit-Балл: 35 (Дно пула)</div>
               </div>
               <div className="text-slate-400 text-[11px] font-bold bg-slate-800/80 px-2 py-1 rounded uppercase tracking-wider border border-slate-700/50">Ожидание</div>
            </div>
          </div>
          <div className="mt-6 p-4 bg-[#0A1A18] text-emerald-300/80 text-xs rounded border border-emerald-900/40 leading-relaxed shadow-inner">
             <b className="text-emerald-400 font-semibold block mb-1">Решение:</b> Ночная заявка больше не бронирует деньги. Она падает на дно пула из-за низкого балла. Бизнес-модель всегда побеждает скорость клика.
          </div>
        </div>
      </div>

      <div className="mt-10 pt-8 border-t border-sky-900/40 relative z-10 w-full flex justify-center">
        <div className="w-full max-w-4xl">
          <ComparisonCard summary={summary} />
        </div>
      </div>
    </div>
  );
}

function EvidenceDesk() {
  return (
    <div className="mt-16 mb-8 bg-[#0a0a0a] border border-red-500/20 rounded-2xl overflow-hidden shadow-2xl relative">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-600 to-amber-500" />
      <div className="p-6 md:p-10">
        <div className="flex items-center gap-3 mb-6">
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-red-500/10 text-red-500 font-bold border border-red-500/20">!</span>
          <h3 className="text-2xl font-bold text-white tracking-tight">Экспонат Данных: Иллюзия FIFO</h3>
        </div>
        
        <p className="text-slate-400 text-sm mb-8 leading-relaxed max-w-4xl">
          Сравним две реальные строки из хакатонского датасета <code className="bg-slate-800 px-1.5 py-0.5 rounded">Выгрузка по выданным субсидиям 2025.xlsx</code>. Оба фермера подали заявку в первый же день распределения бюджета, находятся в одном регионе и подают на одну и ту же субсидию.
        </p>

        <div className="grid md:grid-cols-2 gap-6 relative">
           {/* VS Badge */}
           <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-900 border border-slate-700 items-center justify-center font-bold text-slate-500 z-10">VS</div>
           
           {/* Farmer A */}
           <div className="bg-slate-900/80 border border-emerald-500/30 rounded-xl p-6 relative overflow-hidden shadow-inner">
             <div className="absolute top-0 right-0 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">Победитель</div>
             <h4 className="font-bold text-slate-200 mb-6 flex items-center gap-2 text-lg">👨‍🌾 Фермер А <span className="text-sm font-normal text-slate-500">(Успел)</span></h4>
             
             <div className="space-y-4 font-mono text-sm">
                <div className="flex justify-between border-b border-slate-800/60 pb-3">
                   <span className="text-slate-500">Дата поступления:</span>
                   <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 rounded">21.01.2025 11:15:40</span>
                </div>
                <div className="flex justify-between border-b border-slate-800/60 pb-3">
                   <span className="text-slate-500">Регион:</span>
                   <span className="text-slate-300">область Абай</span>
                </div>
                <div className="flex justify-between border-b border-slate-800/60 pb-3">
                   <span className="text-slate-500">Статус в Excel:</span>
                   <span className="text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-500/20">Одобрена</span>
                </div>
             </div>
           </div>

           {/* Farmer B */}
           <div className="bg-slate-900/80 border border-red-500/30 rounded-xl p-6 relative overflow-hidden shadow-inner">
             <div className="absolute top-0 right-0 bg-red-500/20 text-red-400 text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">Проигравший</div>
             <h4 className="font-bold text-slate-200 mb-6 flex items-center gap-2 text-lg">👨‍🌾 Фермер Б <span className="text-sm font-normal text-slate-500">(Не успел)</span></h4>
             
             <div className="space-y-4 font-mono text-sm">
                <div className="flex justify-between border-b border-slate-800/60 pb-3">
                   <span className="text-slate-500">Дата поступления:</span>
                   <span className="text-red-400 font-bold bg-red-500/10 px-2 rounded">21.01.2025 14:30:15</span>
                </div>
                <div className="flex justify-between border-b border-slate-800/60 pb-3">
                   <span className="text-slate-500">Регион:</span>
                   <span className="text-slate-300">область Абай</span>
                </div>
                <div className="flex justify-between border-b border-slate-800/60 pb-3">
                   <span className="text-slate-500">Статус в Excel:</span>
                   <span className="text-red-400 bg-red-950/50 px-2 py-0.5 rounded border border-red-500/20">Сформировано поручение</span>
                </div>
             </div>
           </div>
        </div>

        <div className="mt-8 p-6 bg-slate-900/50 border border-slate-700/50 rounded-xl">
           <h4 className="text-xl font-bold text-slate-200 mb-3 tracking-tight">Фермер Б получил отказ не потому, что его бизнес хуже.</h4>
           <p className="text-slate-400 text-sm leading-relaxed mb-6">
              Он не получил субсидию, потому что загружал 10-мегабайтные PDF-сканы через слабый 3G-интернет 3 часа, пока установленный лимит бюджета области доедал городской агрохолдинг.
           </p>
           <div className="border-l-4 border-red-500 pl-5 py-2 bg-red-500/5 rounded-r-lg">
              <p className="text-slate-300 text-sm font-medium italic leading-relaxed">
                 "Обучение нейронной сети классифицировать фермеров на основе этого столбца статусов де-факто означает создание ИИ, который учится <b>награждать высокую скорость домашнего интернета в городах и наказывать жителей удаленных аулов.</b> Это легализация системной дискриминации (Data Leakage), а не Merit-Based скоринг."
              </p>
           </div>
        </div>
      </div>
    </div>
  );
}

function GiniArchitecture() {
  return (
    <div className="mt-16 mb-8 bg-slate-900/80 border border-slate-700/80 rounded-2xl p-8 md:p-10 relative overflow-hidden shadow-2xl">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-slate-600 via-amber-500 to-emerald-500" />
      <div className="flex items-center gap-3 mb-6 relative z-10">
        <h3 className="text-2xl font-bold text-white tracking-tight">Архитектура: Gini-Индекс Монополии</h3>
      </div>
      <p className="text-slate-400 text-sm mb-10 max-w-4xl relative z-10">
        В текущих исторических данных мы обнаружили системную проблему: <b>5% крупнейших заявок забирают большинство бюджетных средств района</b>. Алгоритмы AgroScore используют индекс Джини для автоматического пенализирования абсолютной централизации капитала.
      </p>

      <div className="grid md:grid-cols-[1fr_auto_1fr] gap-8 items-center mb-10 relative z-10">
        {/* Агрохолдинг */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 text-center transform transition-transform hover:-translate-y-1 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
          <div className="text-6xl mb-4">🏭</div>
          <h4 className="text-xl font-bold text-slate-200 mb-2">Агрохолдинг</h4>
          <p className="text-slate-500 text-sm mb-4">Забирает 80% районного бюджета</p>
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
            <div className="bg-amber-500 h-full w-[80%]" />
          </div>
        </div>

        {/* Весы */}
        <div className="flex flex-col items-center gap-2 z-10 hidden md:flex">
          <div className="w-16 h-16 rounded-full bg-slate-900 border-2 border-slate-700 flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.05)]">
            <span className="text-2xl text-slate-400">⚖️</span>
          </div>
          <div className="w-1 h-20 bg-gradient-to-b from-slate-700 to-transparent" />
        </div>

        {/* СМТФ */}
        <div className="bg-slate-950 border border-sky-900/50 rounded-xl p-6 text-center transform transition-transform hover:-translate-y-1 shadow-[0_4px_20px_rgba(14,165,233,0.1)] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-sky-500/10 blur-2xl rounded-full" />
          <div className="text-6xl mb-4 relative z-10">🚜</div>
          <h4 className="text-xl font-bold text-sky-400 mb-2 relative z-10">СМТФ (Малые хозяйства)</h4>
          <p className="text-slate-500 text-sm mb-4 relative z-10">Борются за оставшиеся 20%</p>
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden relative z-10">
             <div className="bg-sky-500 h-full w-[20%]" />
          </div>
        </div>
      </div>

      <div className="bg-[#0D1117] p-5 md:p-6 rounded-lg border border-slate-800 font-mono text-sm shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] relative overflow-hidden">
        <div className="absolute top-0 right-0 bg-slate-800 text-slate-300 text-[10px] uppercase font-bold px-3 py-1 rounded-bl-lg border-l border-b border-slate-700 shadow-sm">Code Hook</div>
        <div className="text-emerald-400 opacity-90"># Penalty for hyper-monopolized district funds</div>
        <div className="text-slate-300 mt-2">
          <span className="text-pink-400">if</span> <span className="text-sky-300">district_top1_share</span> <span className="text-pink-400">&gt;</span> <span className="text-amber-300">0.5</span>:
        </div>
        <div className="text-slate-300 ml-4 border-l-2 border-slate-800 pl-4 py-2 mt-1 bg-slate-900/40 rounded-r">
           <span className="text-slate-500 opacity-80"># У крупнейшего игрока больше 50% бюджета</span><br/>
           <span className="text-sky-300">score</span> <span className="text-pink-400">-=</span> <span className="text-amber-300">20</span>
        </div>
        <div className="mt-5 pt-3 border-t border-slate-800/80 text-xs text-slate-500 font-sans flex items-center gap-2">
          <span className="text-amber-500/70">🔗</span> Опирается на динамический расчет Gini-индекса из базы <code className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-300 border border-slate-700">stat.gov.kz</code>
        </div>
      </div>
    </div>
  );
}

function HonestManifesto() {
  return (
    <div className="space-y-6">
      {/* Node 1: Raw Data & The Trap */}
      <div className="relative">
        <div className="absolute left-6 top-8 bottom-[-24px] w-0.5 bg-slate-800" />
        
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 relative ml-12 hover:border-red-500/50 transition-colors">
          <div className="absolute -left-[54px] top-4 w-8 h-8 rounded-full bg-slate-800 border-2 border-red-500 flex items-center justify-center text-red-500 font-bold z-10 shadow-[0_0_10px_rgba(239,68,68,0.2)]">1</div>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="px-2 py-1 bg-slate-950 text-slate-400 text-xs rounded font-mono border border-slate-800">📊 Dataset.xlsx (36k строк)</span>
            <span className="px-2 py-1 bg-slate-950 text-slate-400 text-xs rounded font-mono border border-slate-800">🖼️ 1. AS IS.png</span>
          </div>
          <h3 className="text-xl font-bold text-slate-200 mb-2">Исходные данные — это очередь, а не метрика эффективности</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            В предоставленных логах <b>нет признаков успешности бизнеса</b> (выживаемость, урожайность). Это лишь фиксация бюрократического процесса (схема "AS IS") выдачи денег по принципу «кто первый встал, того и тапки» (FIFO). Обучение AI-модели на исторических статусах "Одобрена" заставит нейросеть зазубрить исторические ошибки: скорость интернет-соединения фермера и географическое неравенство бюджетов.
          </p>
        </div>
        
        <DatasetAutopsy />
      </div>

      {/* Node 2 - SHAP Transition */}
      <div className="relative pt-6">
        <div className="absolute left-6 top-8 bottom-[-24px] w-0.5 bg-slate-800" />
        <div className="bg-gradient-to-r from-slate-900 to-red-950/20 border border-slate-800 rounded-xl p-6 relative ml-12 hover:border-amber-500/50 transition-colors mt-6">
          <div className="absolute -left-[54px] top-4 w-8 h-8 rounded-full bg-slate-800 border-2 border-amber-500 flex items-center justify-center text-amber-500 font-bold z-10 shadow-[0_0_10px_rgba(245,158,11,0.2)]">2</div>
          <h3 className="text-xl font-bold text-amber-400 mb-2">Ловушка: Предиктивный ML автоматизирует Bias</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            Посмотрите на графики справа <b>(SHAP Audit Engine 👉)</b>. Мы прогнали XGBoost по датасету. AI-аудит доказал математически: главный предиктор отказа — это код региона (Oblast) и месяц подачи. Если мы просто запустим ML на этих данных (как сделают другие команды), мы <b>автоматизируем географическую дискриминацию</b>. Предиктивный бизнес-скоринг невозможен до запуска Единого Аграрного Реестра в 2027 г.
          </p>
        </div>
      </div>

      {/* Node 3 - True Merit */}
      <div className="relative">
        <div className="absolute left-6 top-8 bottom-[-24px] w-0.5 bg-slate-800" />
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 relative ml-12 hover:border-sky-500/50 transition-colors">
          <div className="absolute -left-[54px] top-4 w-8 h-8 rounded-full bg-slate-800 border-2 border-sky-500 flex items-center justify-center text-sky-500 font-bold z-10 shadow-[0_0_10px_rgba(14,165,233,0.2)]">3</div>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="px-2 py-1 bg-slate-950 text-slate-300 text-xs rounded font-mono border border-slate-700">📄 Правила субсидирования.pdf</span>
            <span className="px-2 py-1 bg-slate-950 text-slate-300 text-xs rounded font-mono border border-slate-700">🎯 ТЗ (Тех. Задание)</span>
          </div>
          <h3 className="text-xl font-bold text-sky-400 mb-2">Где настоящий Merit? (Законы $\to$ Математика)</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            Если "заслугу" (Merit) фермера нельзя извлечь из сырого Excel, откуда её взять? Ответ в PDF документах: "Концепция АПК 2021-2030". Государство прямо требует поддержки <b>мелких хозяйств</b> и приоритетных направлений (молоко, птица). Наша задача — не фантазировать с "черным ящиком" AI, а перевести текст ТЗ и законов в прозрачный математический Rules Engine.
          </p>
        </div>
      </div>

      {/* Node 4 - Reality Injection */}
      <div className="relative pt-2">
        <div className="bg-gradient-to-r from-slate-900 to-emerald-950/40 border border-emerald-900/50 rounded-xl p-6 relative ml-12 shadow-[0_0_20px_rgba(16,185,129,0.05)] mb-8">
          <div className="absolute -left-[54px] top-6 w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-slate-900 font-bold z-10 shadow-[0_0_15px_rgba(16,185,129,0.5)]">4</div>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 text-xs rounded font-mono border border-emerald-500/20">🌐 stat.gov.kz</span>
            <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 text-xs rounded font-mono border border-emerald-500/20">🤖 Isolation Forest (Anomaly AI)</span>
            <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 text-xs rounded font-mono border border-emerald-500/20">⚙️ Policy Engine</span>
          </div>
          <h3 className="text-xl font-bold text-emerald-400 mb-2">Архитектура AgroScore</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            Мы вышли за рамки хакатона. Мы скачали внешние данные со stat.gov.kz и внедрили Gini-индекс монополизации районов (чтобы агрохолдинги не забирали 90% бюджета). А Machine Learning (Isolation Forest) используется <b>только как радар аномалий (фрода)</b> для Комиссии. AI должен защищать бюджет, а не решать судьбы людей.
          </p>
        </div>
      </div>

    </div>
  );
}

interface ShapData {
  title: string;
  description: string;
  importances: Record<string, number>;
}

interface Summary {
  total_applications: number;
  total_amount_billion: number;
  score_stats: { min: number; max: number; mean: number; median: number };
  score_distribution: Record<string, number>;
  by_status: Record<string, { count: number; avg_score: number; total_amount: number }>;
  by_oblast: Record<string, { count: number; avg_score: number; total_amount: number }>;
  by_category: Record<string, { count: number; avg_score: number }>;
  fraud_analysis: { high_risk_count: number; audit_required_count: number; high_risk_pct: number; ml_anomalies_detected: number };
  fifo_vs_merit: {
    pending_count: number;
    fifo: { avg_score: number; small_farmer_count: number; total_amount: number };
    merit: { avg_score: number; small_farmer_count: number; total_amount: number };
    improvement: { avg_score_delta: number; small_farmer_delta: number };
  };
  gini: { current_district_gini: number };
  retry_analysis: { total_retries: number; retry_pct: number; avg_score_first: number; avg_score_retry: number };
  triage_distribution: { A: number; B: number; C: number; D: number };
  exception_points?: Record<string, number>;
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

function BiasChart({ data }: { data: ShapData }) {
  if (!data) return null;
  const entries = Object.entries(data.importances).slice(0, 10);
  const totalShap = Object.values(data.importances).reduce((sum, val) => sum + val, 0);
  const maxPct = (entries[0]?.[1] / totalShap) * 100 || 1;

  const getLabel = (key: string) => {
    const map: Record<string, string> = {
      'oblast_code': 'Регион (Область)',
      'budget_per_applicant': 'Давление на бюджет района',
      'oblast_backlog_ratio': 'Исторический бэклог региона',
      'month': 'Тайминг (Месяц подачи)',
      'retry_count': 'Кол-во попыток (Упорство)',
      'subsidy_type_code': 'Тип субсидии',
      'district_reject_rate': 'Репутация района',
      'district_top1_share': 'Монополизированность',
      'amount_log': 'Запрошенная сумма',
      'oblast_reject_rate': 'Историческая доля отказов (Регион)',
      'hour': 'Время подачи (Час)',
      'volume_vs_type_median': 'Относительный объем заявки',
      'is_weekend': 'Подача в выходные',
    };
    return map[key] || key;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-8 mt-8">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-xl font-bold bg-gradient-to-r from-red-400 to-amber-400 bg-clip-text text-transparent">
          Архитектурный Proof: Зачем мы отключили XGBoost
        </h3>
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase cursor-help" title="XGBoost & SHAP Audit Engine">Auditor AI (SHAP)</span>
      </div>
      <p className="text-slate-400 text-sm mb-6 max-w-3xl">
        Мы подали сырой хакатонский датасет в XGBoost, чтобы найти скрытую логику выдачи денег. График ниже показывает <b>реальный вес атрибутов</b>, по которым старая система одобряет субсидии. 
      </p>
      
      <div className="space-y-4">
        {entries.map(([key, val]) => {
          const absolutePct = (val / totalShap) * 100;
          const relativeWidthPct = (absolutePct / maxPct) * 100;
          return (
            <div key={key} className="flex flex-col sm:flex-row sm:items-center gap-2">
               {/* Highlight Month and Oblast red logically */}
              <span className={`w-56 text-sm truncate ${key === 'oblast_code' || key === 'month' ? 'text-red-400 font-bold' : 'text-slate-300'}`} title={getLabel(key)}>{getLabel(key)}</span>
              <div className="flex-1 h-4 bg-slate-800 rounded-sm relative">
                <div 
                  className={`absolute left-0 top-0 bottom-0 rounded-sm ${key === 'oblast_code' || key === 'month' ? 'bg-gradient-to-r from-red-500 to-red-600' : 'bg-gradient-to-r from-amber-600/50 to-amber-500/80'}`}
                  style={{ width: `${Math.max(1, relativeWidthPct)}%` }}
                />
              </div>
              <span className="w-16 text-right text-xs text-slate-500 font-mono">{absolutePct.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
      
      <div className="mt-6 p-5 bg-slate-950 border border-red-500/30 rounded-xl shadow-[inset_0_0_20px_rgba(239,68,68,0.05)]">
        <h4 className="flex items-center gap-2 font-bold text-red-400 mb-2">
            <span className="text-lg">⚠️</span> Вердикт AI-Аудита (Data Leakage Target) 
        </h4>
        <p className="text-sm text-slate-300 leading-relaxed">
            Посмотрите на топ факторы: <span className="text-white font-bold bg-slate-800 px-1 rounded">Регион</span> и <span className="text-white font-bold bg-slate-800 px-1 rounded">Тайминг (Месяц)</span>. 
            Если месяц подачи влияет на успех вашей заявки больше, чем тип бизнеса — это означает, что <b>система выдает деньги пока есть бюджет, а потом отклоняет всех подряд</b>. 
        </p>
        <p className="text-sm text-slate-400 mt-3 pt-3 border-t border-slate-800">
            Обучение предиктивной модели-одобрения на этом датасете легализует коррупцию и географическую дискриминацию (Data Leakage). <b>Вот почему наша команда полностью отказалась от предиктивного ML для принятия бизнес-решений</b> в пользу прозрачного Policy Rules Engine.
        </p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [shap, setShap] = useState<ShapData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/data/scoring_summary.json').then(r => r.json()),
      fetch('/data/shap_importance.json').then(r => r.json()).catch(() => null)
    ]).then(([sum, shapData]) => {
      setSummary(sum);
      setShap(shapData);
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
    <div className="w-full bg-slate-950 min-h-screen text-slate-300">
      
      {/* ═══ SECTION 0: HERO ═══ */}
      <section className="pt-24 pb-16 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-900/20 via-slate-950 to-slate-950" />
        <div className="max-w-7xl mx-auto px-4 relative z-10">
          <header className="mb-16 text-center max-w-4xl mx-auto">
            <h1 className="text-6xl md:text-7xl font-extrabold bg-gradient-to-r from-emerald-400 via-teal-400 to-sky-400 bg-clip-text text-transparent mb-6 tracking-tight">
              AgroScore
            </h1>
            <p className="text-2xl text-slate-300 font-light mb-4">
              AI-Аудируемая Policy Engine для честного распределения субсидий
            </p>
            <p className="text-slate-500">
              Двойная архитектура AI: Предиктивный ML для защиты бюджета • Generative AI (Gemini) для помощи Комиссии
            </p>
            <div className="mt-10 mb-4 flex justify-center">
               <a href="/workspace" className="group relative inline-flex items-center justify-center gap-3 px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:shadow-[0_0_35px_rgba(16,185,129,0.7)] hover:-translate-y-1">
                 <span className="text-2xl">⚡</span>
                 <span className="text-xl tracking-wide uppercase">Войти в B2G Терминал</span>
                 <span className="absolute inset-0 rounded-xl border-2 border-white/20 group-hover:border-white/50 transition-colors"></span>
               </a>
            </div>
          </header>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard label="Бюджет в скоринге" value={`${summary.total_amount_billion} млрд ₸`} sub="Участвовало в симуляции" icon="💰" />
            <MetricCard label="Заявок в анализ" value={summary.total_applications.toLocaleString()} sub="За 2025 год" icon="📋" />
            <MetricCard label="Gini (Монополия)" value={summary.gini.current_district_gini} sub="0 = равенство, 1 = монополия" icon="⚖️" />
            <MetricCard label="ML-Аномалий" value={summary.fraud_analysis.ml_anomalies_detected || 0} sub="Изолировано (Isolation Forest)" icon="🤖" />
          </div>
        </div>
      </section>

      {/* ═══ IMPACT: MacroRoi (moved up — impact-first) ═══ */}
      <MacroRoi />

      {/* ═══ SCORE FORMULA VISUAL ═══ */}
      <section className="py-20 border-t border-slate-800/50">
        <div className="max-w-7xl mx-auto px-4">
          <SectionHeader num="★" title="Формула Impact Score (Прозрачный Rules Engine)" color="bg-indigo-500" />
          <p className="text-slate-400 text-sm mb-10 max-w-4xl -mt-4">
            Каждый из {summary.total_applications.toLocaleString()} заявок получает балл по 5 компонентам. Никаких черных ящиков — формула полностью открыта и аудируема.
          </p>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <div className="bg-slate-900 border border-sky-500/20 rounded-xl p-5 hover:border-sky-500/50 transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">🎯</span>
                <span className="text-xs font-bold uppercase tracking-wider text-sky-400">Strategic</span>
              </div>
              <div className="text-2xl font-black text-sky-400 mb-2">20%</div>
              <p className="text-xs text-slate-500 leading-relaxed">Приоритеты АПК и продовольственная безопасность</p>
            </div>
            <div className="bg-slate-900 border border-violet-500/20 rounded-xl p-5 hover:border-violet-500/50 transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">⚖️</span>
                <span className="text-xs font-bold uppercase tracking-wider text-violet-400">Fairness</span>
              </div>
              <div className="text-2xl font-black text-violet-400 mb-2">20%</div>
              <p className="text-xs text-slate-500 leading-relaxed">Анти-монополия, размер фермера, медианное отклонение</p>
            </div>
            <div className="bg-slate-900 border border-amber-500/20 rounded-xl p-5 hover:border-amber-500/50 transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">📍</span>
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400">Need</span>
              </div>
              <div className="text-2xl font-black text-amber-400 mb-2">20%</div>
              <p className="text-xs text-slate-500 leading-relaxed">Бэклог области, reject rate района, дефицит бюджета</p>
            </div>
            <div className="bg-slate-900 border border-emerald-500/20 rounded-xl p-5 hover:border-emerald-500/50 transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">📊</span>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Efficiency</span>
              </div>
              <div className="text-2xl font-black text-emerald-400 mb-2">20%</div>
              <p className="text-xs text-slate-500 leading-relaxed">История подач, репутация района, обоснованность суммы</p>
            </div>
            <div className="bg-slate-900 border border-red-500/20 rounded-xl p-5 hover:border-red-500/50 transition-colors col-span-2 lg:col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">🛡️</span>
                <span className="text-xs font-bold uppercase tracking-wider text-red-400">Fraud Risk</span>
              </div>
              <div className="text-2xl font-black text-red-400 mb-2">−10%</div>
              <p className="text-xs text-slate-500 leading-relaxed">Круглые суммы, outliers, ночные подачи, повторы</p>
            </div>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row items-center gap-4">
            <div className="font-mono text-sm text-slate-300 flex-1 text-center sm:text-left">
              <span className="text-sky-400">S×0.2</span> + <span className="text-violet-400">F×0.2</span> + <span className="text-amber-400">N×0.2</span> + <span className="text-emerald-400">E×0.2</span> − <span className="text-red-400">FR×0.1</span> + <span className="text-slate-400">Base(5)</span> + <span className="text-yellow-400">Exception(0-15)</span>
            </div>
            <div className="flex items-center gap-4 text-sm shrink-0">
              <div className="text-center">
                <div className="text-lg font-bold text-white">{ss.mean}</div>
                <div className="text-xs text-slate-500">Среднее</div>
              </div>
              <div className="w-px h-8 bg-slate-700" />
              <div className="text-center">
                <div className="text-lg font-bold text-white">{ss.min} — {ss.max}</div>
                <div className="text-xs text-slate-500">Диапазон</div>
              </div>
            </div>
          </div>

          {/* Score Distribution Histogram */}
          <div className="mt-8 bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-slate-400 mb-4">Распределение баллов ({summary.total_applications.toLocaleString()} заявок)</h3>
            <ScoreHistogram distribution={summary.score_distribution} />
          </div>
        </div>
      </section>

      {/* ═══ SECTION 1: PROBLEM (Condensed) ═══ */}
      <section className="py-20 bg-slate-900 border-y border-slate-800/50 shadow-inner">
        <div className="max-w-7xl mx-auto px-4">
          <SectionHeader num="1" title="Проблема: Почему FIFO убивает фермеров" color="bg-red-500" />
          
          <div className="grid lg:grid-cols-12 gap-8 items-start relative z-10">
            <div className="lg:col-span-6 2xl:col-span-5">
              <HonestManifesto />
            </div>
            <div className="lg:col-span-6 2xl:col-span-7 sticky top-24">
              {shap && <BiasChart data={shap} />}
            </div>
          </div>

          <EvidenceDesk />
          <FifoKiller summary={summary} />
          <GiniArchitecture />
          <OblastDecentralization data={summary.by_oblast} />
        </div>
      </section>

      {/* ═══ SECTION 2: SOLUTION (Interactive Tools) ═══ */}
      <section className="py-20 relative overflow-hidden">
        <div className="absolute inset-0 bg-emerald-950/10" />
        <div className="max-w-7xl mx-auto px-4 relative z-10">
          <SectionHeader num="2" title="Решение AgroScore (Двойная Архитектура AI)" color="bg-emerald-500" />

          <div className="grid lg:grid-cols-2 gap-8 mt-10 mb-12 items-start">
            <div className="flex flex-col gap-8 w-full">
              <Simulator />
              <PolicyConfigurator />
            </div>
            <div className="flex flex-col gap-8 w-full">
              <AnomalyRadar mlAnomaliesDetected={summary?.fraud_analysis?.ml_anomalies_detected || 0} onInvestigate={() => { window.location.href = '/workspace'; }} />
              <PdfToPython />
              <TriagePipeline triage={summary.triage_distribution} />
            </div>
          </div>
        </div>
      </section>

      {/* ═══ SECTION 3: ANALYTICS (Trimmed — no AppTable/PreCheck) ═══ */}
      <section className="py-20 bg-[#0B1120] border-t border-slate-800/50">
        <div className="max-w-7xl mx-auto px-4">
          <SectionHeader num="3" title="Аналитика и Калибровка" color="bg-sky-500" />

          {/* Workspace CTA */}
          <a href="/workspace" className="flex items-center gap-4 mb-10 p-4 bg-sky-950/40 border border-sky-800/40 rounded-xl hover:border-sky-500/50 transition-colors group">
            <div className="w-10 h-10 rounded-lg bg-sky-500/10 flex items-center justify-center border border-sky-500/30 group-hover:bg-sky-500/20 transition-colors">
              <span className="text-sky-400">💻</span>
            </div>
            <div className="flex-1">
              <div className="text-sm font-bold text-sky-300">Открыть B2G Терминал</div>
              <div className="text-xs text-slate-500">Полный реестр 36K заявок с инспектором, Pre-Check симулятором и анти-фрод модулем</div>
            </div>
            <span className="text-sky-400/60 group-hover:text-sky-400 transition-colors text-lg">→</span>
          </a>

          {/* Retry Analysis + Status Breakdown */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white">Поведенческий паттерн (Retry-анализ)</h3>
              <p className="text-xs text-slate-500 mb-4 h-8">
                <span className="font-bold text-emerald-500">Зачем за этим следить:</span> Анализ «упорства». Если фермер с низким баллом переподает заявку раз за разом — это маркер потенциальной манипуляции.
              </p>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Доля повторных подач заявок</span>
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
              <h3 className="text-lg font-semibold text-white">Калибровка по старым статусам</h3>
              <p className="text-xs text-slate-500 mb-4 h-8">
                <span className="font-bold text-emerald-500">Доказательство независимости:</span> Даже «Отклоненные» фермеры получают Merit-балл выше 50. Алгоритм судит бизнес-логику, а не наличие бюджета.
              </p>
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
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white">Справедливое распределение (Балл по Областям)</h3>
            <p className="text-xs text-slate-500 mb-4">
              <span className="font-bold text-emerald-500">Тест на Bias:</span> Наш алгоритм нормализует баллы так, чтобы лучшие фермеры побеждали объективно, независимо от скорости местных чиновников.
            </p>
            <OblastTable by_oblast={summary.by_oblast} />
          </div>
        </div>
      </section>

      {/* ═══ R&D: IdeaGraveyard (moved to bottom) ═══ */}
      <IdeaGraveyard />

      {/* ═══ DATA SOURCES STRIP ═══ */}
      <section className="py-12 bg-slate-900/50 border-y border-slate-800/50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-8">
            <h3 className="text-lg font-bold text-slate-300">Источники Данных</h3>
            <p className="text-xs text-slate-500 mt-1">Реальные данные из открытых государственных систем</p>
          </div>
          <div className="grid grid-cols-3 gap-4 max-w-4xl mx-auto">
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 text-center">
              <div className="text-2xl mb-2">🌐</div>
              <div className="text-sm font-bold text-emerald-400">stat.gov.kz</div>
              <div className="text-xs text-slate-500 mt-1">70 xlsx файлов</div>
              <div className="text-xs text-slate-600">20 регионов × 34 признака</div>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 text-center">
              <div className="text-2xl mb-2">📊</div>
              <div className="text-sm font-bold text-sky-400">subsidy.plem.kz</div>
              <div className="text-xs text-slate-500 mt-1">429,231 записей</div>
              <div className="text-xs text-slate-600">API реестра 2019-2024</div>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 text-center">
              <div className="text-2xl mb-2">📋</div>
              <div className="text-sm font-bold text-amber-400">Хакатон Dataset</div>
              <div className="text-xs text-slate-500 mt-1">{summary.total_applications.toLocaleString()} заявок</div>
              <div className="text-xs text-slate-600">Снапшот 2025 года</div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-950 text-center text-slate-600 text-sm py-12 border-t border-slate-900">
        <p className="font-bold text-slate-500">AgroScore — Decentrathon 5.0 | команда AI inDrive | Кейс 2</p>
        <p className="mt-2">Архитектура: Rules Engine + Anomaly Detection + Generative AI</p>
      </footer>

      {/* AI Assistant (floating) */}
      <AiAssistant />
    </div>
  );
}
