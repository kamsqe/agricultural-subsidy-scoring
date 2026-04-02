import { useState, useEffect } from 'react';
import AppTable, { type App } from './AppTable';
import InspectorCard from './InspectorCard';
import PreCheck from './PreCheck';
import AiAssistant from './AiAssistant';
import MacroRoi from './MacroRoi';
import OblastDecentralization from './OblastDecentralization';
import PolicyConfigurator from './PolicyConfigurator';
import AnomalyRadar from './AnomalyRadar';
import PdfToPython from './PdfToPython';
import ProactiveFinder from './ProactiveFinder';

export default function Workspace() {
  const [selectedApp, setSelectedApp] = useState<App | null>(null);
  const [activeTab, setActiveTab] = useState<'registry' | 'precheck' | 'proactive' | 'analytics' | 'fraud' | 'policy'>('registry');
  const [summaryData, setSummaryData] = useState<any>(null);

  useEffect(() => {
    fetch('/data/scoring_summary.json')
      .then(r => r.json())
      .then(data => setSummaryData(data))
      .catch(e => console.error("Failed to load summary", e));
  }, []);

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-200 font-sans flex flex-col">
      {/* Workspace Header */}
      <header className="bg-[#0b121a] border-b border-slate-800 px-4 py-2.5 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <a href="/" className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity">
            <div className="w-7 h-7 rounded-md bg-indigo-600 flex items-center justify-center font-bold text-white text-xs shadow-[0_0_15px_rgba(79,70,229,0.5)]">
              Ag
            </div>
            <h1 className="text-base font-bold tracking-tight text-white">AgroScore</h1>
          </a>
          
          <nav className="hidden lg:flex items-center gap-0.5 border-l border-slate-800 pl-3">
            <button 
              onClick={() => setActiveTab('registry')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === 'registry' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
            >
              Реестр
            </button>
            <button 
              onClick={() => setActiveTab('precheck')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === 'precheck' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
            >
              Pre-Check
            </button>
            <button 
              onClick={() => setActiveTab('proactive')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === 'proactive' ? 'bg-slate-800 text-indigo-400' : 'text-slate-400 hover:text-indigo-400/80 hover:bg-slate-800/50'}`}
            >
              Проактивный
            </button>
            <button 
              onClick={() => setActiveTab('analytics')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === 'analytics' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
            >
              Аналитика
            </button>
            <button 
              onClick={() => setActiveTab('fraud')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === 'fraud' ? 'bg-slate-800 text-amber-400' : 'text-slate-400 hover:text-amber-400/80 hover:bg-slate-800/50'}`}
            >
              Анти-Фрод
            </button>
            <button 
              onClick={() => setActiveTab('policy')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === 'policy' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400 hover:text-emerald-400/80 hover:bg-slate-800/50'}`}
            >
              Политика
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <a href="/" className="text-xs text-slate-500 hover:text-white flex items-center gap-1 transition-colors">
            <span>← Презентация</span>
          </a>
          <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] text-slate-400">
            УСХ
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1920px] mx-auto w-full p-4 md:p-6 overflow-hidden flex flex-col">
        {activeTab === 'registry' && (
          <div className="flex flex-col lg:flex-row gap-6 h-full min-h-[800px]">
             {/* Left Panel: App Table */}
             <div className="lg:w-2/3 flex flex-col">
               <AppTable onRowClick={setSelectedApp} selectedAppId={selectedApp?.r} />
             </div>

             {/* Right Panel: Inspector */}
             <div className="lg:w-1/3 sticky top-0 self-start h-[calc(100vh-80px)] overflow-y-auto">
               <InspectorCard appData={selectedApp} minimal={true} />
             </div>
          </div>
        )}

        {activeTab === 'precheck' && (
          <div className="max-w-4xl mx-auto w-full mt-8">
            <PreCheck />
          </div>
        )}

        {activeTab === 'proactive' && (
          <div className="max-w-7xl mx-auto w-full mt-4">
            <ProactiveFinder />
          </div>
        )}

        {activeTab === 'analytics' && summaryData && (
          <div className="max-w-7xl mx-auto w-full mt-8 flex flex-col gap-12 pb-24">
            <div>
              <h2 className="text-2xl font-bold mb-6">Децентрализация Бюджетов</h2>
              <OblastDecentralization data={summaryData.by_oblast} />
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-6">Макро-экономический Эффект</h2>
              <MacroRoi />
            </div>
          </div>
        )}

        {activeTab === 'fraud' && summaryData && (
          <div className="max-w-6xl mx-auto w-full mt-8 pb-24">
            <AnomalyRadar 
              mlAnomaliesDetected={summaryData?.fraud_analysis?.ml_anomalies_detected || 0} 
              onInvestigate={(app) => {
                setSelectedApp(app);
                setActiveTab('registry');
              }}
            />
          </div>
        )}

        {activeTab === 'policy' && (
          <div className="max-w-6xl mx-auto w-full mt-8 pb-24 grid lg:grid-cols-2 gap-8 items-start">
             <PolicyConfigurator />
             <PdfToPython />
          </div>
        )}
      </main>

      <AiAssistant />
    </div>
  );
}
