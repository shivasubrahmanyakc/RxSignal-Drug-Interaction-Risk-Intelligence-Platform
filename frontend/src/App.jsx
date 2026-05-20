import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid,
  PieChart, Pie, Legend,
} from 'recharts';
import './index.css';

/* ─── Error Boundary ───────────────────────────────── */
class ChartBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: false }; }
  static getDerivedStateFromError() { return { err: true }; }
  componentDidCatch(e) { console.warn('[Chart]', e.message); }
  render() {
    return this.state.err
      ? <div className="flex items-center justify-center h-full text-slate-400 text-sm gap-2"><span className="material-symbols-outlined">bar_chart</span>Chart unavailable</div>
      : this.props.children;
  }
}

/* ─── helpers ──────────────────────────────────────── */
const riskColor = s =>
  s > 10 ? { bg:'bg-slate-100',     text:'text-red-600',     border:'border-red-200',     hex:'#ef4444' }
  : s > 5  ? { bg:'bg-slate-100',  text:'text-amber-600',   border:'border-amber-200',   hex:'#f59e0b' }
  :           { bg:'bg-slate-100',text:'text-emerald-600', border:'border-emerald-200', hex:'#10b981' };

const mapTo100 = s =>
  s >= 20 ? Math.min(100, 90 + (s-20))
  : s >= 10 ? 75 + ((s-10)/10)*15
  : s >= 5  ? 40 + ((s-5)/5)*35
  : (s/5)*40;

/* ─── StatCard ─────────────────────────────────────── */
const StatCard = ({ icon, iconBg, iconColor, label, value, sub, badge, badgeBg, badgeText }) => (
  <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col gap-3 hover:shadow-md transition-shadow">
    <div className="flex items-center justify-between">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconBg}`}>
        <span className={`material-symbols-outlined text-[18px] ${iconColor}`}>{icon}</span>
      </div>
      {badge && <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border ${badgeBg} ${badgeText}`}>{badge}</span>}
    </div>
    <div>
      <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1">{label}</p>
      <div className="flex items-end gap-1.5">
        <span className="text-3xl font-black text-slate-900 leading-none">{value}</span>
        {sub && <span className="text-sm font-semibold text-slate-400 pb-0.5">{sub}</span>}
      </div>
    </div>
  </div>
);

/* ─── SemiGauge ────────────────────────────────────── */
const SemiGauge = ({ score }) => {
  const r=80, cx=100, cy=100, circ=Math.PI*r;
  const offset = circ - (circ*score)/100;
  const col = score>75?'#ef4444':score>40?'#f59e0b':'#3b82f6';
  return (
    <div className="relative flex flex-col items-center">
      <svg width="200" height="110" viewBox="0 0 200 110">
        <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}`} fill="none" stroke="#f1f5f9" strokeWidth="14" strokeLinecap="round"/>
        <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}`} fill="none" stroke={col} strokeWidth="14" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset} style={{ transition:'stroke-dashoffset 1.2s ease-out,stroke 0.5s' }}/>
      </svg>
      <div className="absolute bottom-0 flex flex-col items-center">
        <span className="text-4xl font-black" style={{ color:col }}>{score}</span>
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">/ 100 Composite</span>
      </div>
    </div>
  );
};

/* ─── Virtual DrugSelect ───────────────────────────── */
const ITEM_H=36, WIN_SIZE=12;
const DrugSelect = ({ drugs, value, onChange, placeholder, icon }) => {
  const [open,setOpen]         = useState(false);
  const [query,setQuery]       = useState('');
  const [rect,setRect]         = useState(null);
  const [scrollTop,setScrollTop] = useState(0);
  const triggerRef=useRef(null), listRef=useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = e => {
      if (triggerRef.current?.contains(e.target)) return;
      if (document.getElementById('drug-portal-panel')?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown',h);
    return () => document.removeEventListener('mousedown',h);
  }, [open]);

  useEffect(() => { setScrollTop(0); if(listRef.current) listRef.current.scrollTop=0; }, [query]);

  const filtered = query ? drugs.filter(d=>d.toLowerCase().includes(query.toLowerCase())) : drugs;
  const totalH=filtered.length*ITEM_H, viewH=WIN_SIZE*ITEM_H;
  const startIdx=Math.max(0,Math.floor(scrollTop/ITEM_H)-2);
  const endIdx=Math.min(filtered.length,startIdx+WIN_SIZE+4);
  const visible=filtered.slice(startIdx,endIdx);

  const handleOpen=()=>{ if(triggerRef.current) setRect(triggerRef.current.getBoundingClientRect()); setOpen(o=>!o); setQuery(''); setScrollTop(0); };
  const handleSelect=d=>{ onChange(d); setOpen(false); setQuery(''); };
  const handleClear=e=>{ e.stopPropagation(); onChange(''); setQuery(''); };
  const panelStyle=rect?{ position:'fixed',top:rect.bottom+4,left:rect.left,width:Math.max(rect.width,260),zIndex:99999 }:{};

  return (
    <div className="relative">
      <button ref={triggerRef} type="button" onClick={handleOpen}
        className={`w-full flex items-center gap-2 pl-9 pr-3 py-3 bg-white border rounded-xl text-sm font-bold transition-all text-left shadow-sm ${open?'border-blue-400 bg-slate-100':'border-slate-200 hover:border-blue-300 hover:bg-slate-100'}`}>
        <span className="material-symbols-outlined absolute left-3 top-3 text-slate-900 text-[18px]">{icon}</span>
        <span className={value?'text-slate-800 flex-1 truncate':'text-slate-400 flex-1'}>{value||placeholder}</span>
        {value
          ? <span onClick={handleClear} className="material-symbols-outlined text-[16px] text-slate-900 hover:text-red-500 transition-colors flex-shrink-0">close</span>
          : <span className={`material-symbols-outlined text-[16px] text-slate-400 flex-shrink-0 transition-transform duration-200 ${open?'rotate-180':''}`}>expand_more</span>}
      </button>
      {open && ReactDOM.createPortal(
        <div id="drug-portal-panel" style={panelStyle} className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden flex flex-col">
          <div className="p-2 border-b border-white/10 flex-shrink-0">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-2.5 top-[7px] text-slate-900 text-[15px]">search</span>
              <input autoFocus type="text" value={query} onChange={e=>setQuery(e.target.value)}
                placeholder={`Search ${drugs.length.toLocaleString()} drugs…`}
                className="w-full pl-8 pr-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-blue-300/40 text-xs font-medium focus:outline-none focus:border-blue-400"/>
            </div>
          </div>
          <div className="px-3 py-[5px] border-b border-white/5 flex-shrink-0">
            <span className="text-[10px] font-semibold text-blue-300/50">{filtered.length.toLocaleString()} {query?`match${filtered.length!==1?'es':''}` :'drugs total'}</span>
          </div>
          {filtered.length===0
            ? <p className="text-center text-blue-300/40 text-xs py-5">No matches found</p>
            : <div ref={listRef} onScroll={e=>setScrollTop(e.currentTarget.scrollTop)} style={{ height:viewH,overflowY:'auto' }} className="custom-scroll relative flex-shrink-0">
                <div style={{ height:totalH,position:'relative' }}>
                  {visible.map((d,i)=>{
                    const top=(startIdx+i)*ITEM_H;
                    return <button key={d} type="button" onClick={()=>handleSelect(d)}
                      style={{ position:'absolute',top,left:0,right:0,height:ITEM_H }}
                      className={`flex items-center px-4 text-sm font-medium transition-colors text-left ${d===value?'bg-blue-600 text-white':'text-blue-100 hover:bg-white/10'}`}>{d}</button>;
                  })}
                </div>
              </div>}
        </div>, document.body
      )}
    </div>
  );
};

/* ─── NuggetCard ───────────────────────────────────── */
const NuggetCard = ({ icon, iconBg, iconColor, value, label, note }) => (
  <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md transition-all">
    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
      <span className={`material-symbols-outlined text-[28px] ${iconColor}`}>{icon}</span>
    </div>
    <div>
      <p className="text-2xl font-black text-slate-900">{value}</p>
      <p className="text-sm font-bold text-slate-700">{label}</p>
      {note && <p className="text-xs text-slate-400 mt-0.5">{note}</p>}
    </div>
  </div>
);

/* ─── PhaseCard ────────────────────────────────────── */
const PhaseCard = ({ phase, icon, iconBg, iconColor, title, subtitle, bullets }) => (
  <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-all flex flex-col gap-4">
    <div className="flex items-start gap-4">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        <span className={`material-symbols-outlined text-[24px] ${iconColor}`}>{icon}</span>
      </div>
      <div>
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{phase}</span>
        <h3 className="text-base font-black text-slate-900 leading-tight">{title}</h3>
        <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
      </div>
    </div>
    <ul className="space-y-2">
      {bullets.map((b,i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
          <span className="material-symbols-outlined text-slate-900 text-[15px] mt-0.5 flex-shrink-0">check_circle</span>{b}
        </li>
      ))}
    </ul>
  </div>
);

/* ══════════════════════════════════════════════════════
   DASHBOARD — EMPTY STATE
══════════════════════════════════════════════════════ */
const DashboardEmpty = ({ setDrugA, setDrugB }) => (
  <div className="flex flex-col gap-8">
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
          <span className="material-symbols-outlined text-sm text-slate-900">database</span>
        </div>
        <h2 className="text-lg font-black text-slate-900">FAERS Database Coverage</h2>
        <span className="ml-auto text-xs font-bold text-slate-400 bg-slate-100 px-3 py-1 rounded-full">2025 Q4</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <NuggetCard icon="assignment"  iconBg="bg-slate-100"    iconColor="text-blue-600"   value="1.06B"   label="Adverse Event Reports"   note="FDA FAERS 2004–2025"/>
        <NuggetCard icon="medication"  iconBg="bg-slate-100"  iconColor="text-violet-600" value="13,160"  label="Unique Drugs Indexed"     note="All FAERS quarters"/>
        <NuggetCard icon="hub"         iconBg="bg-slate-100"  iconColor="text-orange-500" value="~86M"    label="Drug Pair Combinations"   note="XGBoost + GNN trained"/>
        <NuggetCard icon="verified"    iconBg="bg-slate-100" iconColor="text-emerald-600" value="4 Qtrs" label="2025 Data Coverage"        note="Q1 – Q4 fully loaded"/>
      </div>
    </div>

    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
          <span className="material-symbols-outlined text-sm text-slate-900">account_tree</span>
        </div>
        <h2 className="text-lg font-black text-slate-900">3-Phase AI Pipeline</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <PhaseCard phase="Phase 1 — Historical Evidence" icon="bar_chart" iconBg="bg-slate-100" iconColor="text-blue-600"
          title="PRR Signal Detection" subtitle="Proportional Reporting Ratio from 1.06B FAERS reports"
          bullets={['Queries raw drug-pair co-occurrence counts','PRR > 2 indicates disproportionate reporting','Returns top 10 adverse events by risk score','Covers all MedDRA preferred terms']}/>
        <PhaseCard phase="Phase 2 — Machine Learning" icon="psychology" iconBg="bg-slate-100" iconColor="text-orange-500"
          title="XGBoost Risk Model" subtitle="Gradient-boosted trees on pharmacovigilance features"
          bullets={['Drug frequency, mean risk & interaction features','Log-transform target for heavy-tail distributions','F1: 94.95% — Accuracy: 90.63%','Feature importance reveals key interaction drivers']}/>
        <PhaseCard phase="Phase 3 — Graph Neural Network" icon="hub" iconBg="bg-slate-100" iconColor="text-violet-600"
          title="GraphSAGE GNN" subtitle="PyTorch Geometric on the full drug-AE interaction graph"
          bullets={['3-layer SAGEConv with BatchNorm + Dropout','Pre-computed node embeddings for O(1) inference','F1: 94.56% — Accuracy: 89.90%','Captures second-order drug–drug relationships']}/>
      </div>
    </div>

    <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 rounded-2xl p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
      {[
        { label:'XGBoost F1',   value:'94.95%', sub:'Phase 2', color:'text-orange-400' },
        { label:'XGBoost Acc',  value:'90.63%', sub:'Phase 2', color:'text-orange-300' },
        { label:'GNN F1',       value:'94.56%', sub:'Phase 3', color:'text-violet-400' },
        { label:'GNN Accuracy', value:'89.90%', sub:'Phase 3', color:'text-violet-300' },
      ].map(m => (
        <div key={m.label} className="text-center">
          <p className={`text-3xl font-black ${m.color}`}>{m.value}</p>
          <p className="text-sm font-bold text-white mt-1">{m.label}</p>
          <p className="text-[10px] text-blue-400 uppercase tracking-wider">{m.sub}</p>
        </div>
      ))}
    </div>

    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
          <span className="material-symbols-outlined text-sm text-slate-900">bolt</span>
        </div>
        <h2 className="text-lg font-black text-slate-900">Quick Start — Try These Drug Pairs</h2>
        <span className="text-xs text-slate-400 ml-1">Click to auto-fill ↑</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          { a:'WARFARIN',     b:'ASPIRIN',       risk:'HIGH', why:'Major bleeding risk synergy' },
          { a:'METFORMIN',    b:'INSULIN',        risk:'MOD',  why:'Hypoglycaemia compounding' },
          { a:'ATORVASTATIN', b:'AMLODIPINE',     risk:'LOW',  why:'Common co-prescription' },
          { a:'CLOPIDOGREL',  b:'OMEPRAZOLE',     risk:'MOD',  why:'CYP2C19 metabolic interaction' },
          { a:'LISINOPRIL',   b:'SPIRONOLACTONE', risk:'HIGH', why:'Hyperkalaemia risk' },
          { a:'FLUOXETINE',   b:'TRAMADOL',       risk:'HIGH', why:'Serotonin syndrome risk' },
        ].map(p => (
          <button key={p.a+p.b} onClick={()=>{ setDrugA(p.a); setDrugB(p.b); }}
            className="flex items-center gap-3 bg-white border border-slate-100 rounded-2xl p-4 hover:border-slate-800 hover:shadow-md transition-all text-left">
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-black text-slate-900">{p.a}</span>
                <span className="text-slate-300 font-bold">+</span>
                <span className="text-sm font-black text-slate-900">{p.b}</span>
              </div>
              <p className="text-xs text-slate-400">{p.why}</p>
            </div>
            <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-full flex-shrink-0 ${p.risk==='HIGH'?'bg-slate-100 text-red-600':p.risk==='MOD'?'bg-slate-100 text-amber-600':'bg-slate-100 text-emerald-600'}`}>{p.risk}</span>
          </button>
        ))}
      </div>
    </div>
  </div>
);

/* ══════════════════════════════════════════════════════
   DASHBOARD — RESULTS (ML focus: gauge, features, model comparison)
══════════════════════════════════════════════════════ */
const DashboardResults = ({ results }) => {
  const xgbScore  = results.phase2_xgb?.score  || 0;
  const gnnScore  = results.phase3_gnn?.score  || 0;
  const riskScore = Math.round((mapTo100(xgbScore) + mapTo100(gnnScore)) / 2);
  const topEvents = results.historical_evidence?.slice(0,3) || [];
  const totalEvts = results.historical_evidence?.length || 0;
  const maxPrr    = results.historical_evidence?.[0]?.PRR?.toFixed(1) || '—';
  const xgbC = riskColor(xgbScore);
  const gnnC = riskColor(gnnScore);
  const riskLabel = riskScore>75?'HIGH RISK':riskScore>40?'MODERATE RISK':'LOW RISK';
  const riskHex   = riskScore>75?'#ef4444':riskScore>40?'#f59e0b':'#3b82f6';
  const riskBg    = riskScore>75?'from-red-600 to-rose-700':riskScore>40?'from-amber-500 to-orange-600':'from-blue-600 to-indigo-700';
  const noEvidence = totalEvts === 0;
  const clinicalMsg = riskScore>75
    ? (noEvidence 
        ? 'Theoretical risk inferred via ML based on individual drug profiles. No historical FAERS co-occurrences exist. Clinical review recommended.' 
        : 'Significant interaction risk detected. Clinical review strongly recommended before co-prescribing. Consider therapeutic alternatives or enhanced monitoring.')
    : riskScore>40
    ? (noEvidence
        ? 'Theoretical moderate signal inferred via ML. No historical FAERS data exists.'
        : 'Moderate interaction signal. Prescriber awareness advised. Monitor for adverse effects and consider dose adjustments where applicable.')
    : (noEvidence
        ? 'Low theoretical interaction signal from ML. No historical FAERS data exists.'
        : 'Low interaction signal from current FAERS data. Standard clinical monitoring applies. See Statistical Analysis tab for the full PRR breakdown.');

  return (
    <div className="flex flex-col gap-6">

      {/* Risk result banner */}
      <div className={`relative rounded-3xl overflow-hidden bg-gradient-to-r ${riskBg} p-6 text-white shadow-xl`}>
        <div className="pointer-events-none absolute -top-10 -right-10 w-52 h-52 bg-white/10 rounded-full blur-2xl"></div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <p className="text-white/70 text-[10px] font-black uppercase tracking-widest">AI Analysis Complete</p>
              {noEvidence && (
                <span className="bg-amber-400 text-amber-950 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow-sm">
                  Theoretical ML Prediction
                </span>
              )}
            </div>
            <h2 className="text-2xl font-black">{results.drug_a} + {results.drug_b}</h2>
            <p className="text-white/80 text-sm mt-2 leading-relaxed max-w-xl">{clinicalMsg}</p>
          </div>
          <div className="flex items-center gap-5 flex-shrink-0">
            <div className="text-center">
              <p className="text-6xl font-black leading-none">{riskScore}</p>
              <p className="text-white/70 text-xs font-black uppercase tracking-wider mt-1">/ 100 Composite</p>
            </div>
            <div className="bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-center">
              <p className="text-sm font-black uppercase tracking-wider">{riskLabel}</p>
              <p className="text-white/60 text-xs mt-0.5">Overall Signal</p>
            </div>
          </div>
        </div>
      </div>

      {/* 4 stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon="trending_up" iconBg="bg-slate-100"   iconColor="text-blue-600"
          label="Peak PRR" value={maxPrr} sub="ratio" badge="Phase 1" badgeBg="bg-slate-100" badgeText="text-blue-600"/>
        <StatCard icon="event_note"  iconBg="bg-slate-100" iconColor="text-violet-600"
          label="AE Events" value={totalEvts} sub="found" badge="FAERS" badgeBg="bg-slate-100" badgeText="text-violet-600"/>
        <StatCard icon="psychology"  iconBg={xgbC.bg}      iconColor={xgbC.text}
          label="XGBoost Score" value={xgbScore} sub="risk"
          badge={results.phase2_xgb?.label} badgeBg={xgbC.bg} badgeText={xgbC.text}/>
        <StatCard icon="hub"         iconBg={gnnC.bg}      iconColor={gnnC.text}
          label="GNN Score" value={gnnScore?.toFixed(2)} sub="risk"
          badge={results.phase3_gnn?.label} badgeBg={gnnC.bg} badgeText={gnnC.text}/>
      </div>

      {/* Row: Gauge + Feature Drivers + Top AE Snapshot */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Composite Gauge */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col items-center gap-4">
          <div className="w-full flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-sm text-slate-900">health_and_safety</span>
              </div>
              <span className="font-bold text-slate-800 text-sm">Composite Risk Gauge</span>
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full border"
              style={{ color:riskHex, borderColor:riskHex, background:riskHex+'18' }}>{riskLabel}</span>
          </div>
          <SemiGauge score={riskScore}/>
          <div className="w-full grid grid-cols-2 gap-2">
            <div className="bg-slate-100 rounded-xl p-3 text-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">XGBoost</p>
              <p className="text-xl font-black text-slate-800">{xgbScore}</p>
              <p className={`text-[9px] font-black uppercase mt-0.5 ${xgbC.text}`}>{results.phase2_xgb?.label}</p>
            </div>
            <div className="bg-slate-100 rounded-xl p-3 text-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">GNN</p>
              <p className="text-xl font-black text-slate-800">{gnnScore?.toFixed(2)}</p>
              <p className={`text-[9px] font-black uppercase mt-0.5 ${gnnC.text}`}>{results.phase3_gnn?.label}</p>
            </div>
          </div>
        </div>

        {/* XGBoost Feature Drivers */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
              <span className="material-symbols-outlined text-sm text-slate-900">tune</span>
            </div>
            <span className="font-bold text-slate-800 text-sm">XGBoost Feature Drivers</span>
            <span className="ml-auto text-[10px] font-black uppercase text-slate-400 border border-slate-200 px-2 py-0.5 rounded-full">Phase 2</span>
          </div>
          <p className="text-xs text-slate-400 mb-5 leading-relaxed">
            Three engineered features fed to the gradient-boosted model. Higher normalized % = stronger influence on the risk prediction.
          </p>
          <div className="flex-1 space-y-5">
            {results.phase2_xgb?.feature_drivers?.map((f,i) => (
              <div key={f.name}>
                <div className="flex items-center justify-between mb-1.5">
                  <div>
                    <span className="text-xs font-black text-slate-700">{f.name}</span>
                    <span className="text-[10px] text-slate-400 ml-2">raw = {f.value}</span>
                  </div>
                  <span className="text-xs font-black text-blue-600">{(f.normalized*100).toFixed(1)}%</span>
                </div>
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width:`${Math.min(100,(f.normalized||0)*100)}%`, background:['#3b82f6','#f59e0b','#8b5cf6'][i%3] }}></div>
                </div>
              </div>
            ))}
            {!results.phase2_xgb?.feature_drivers?.length && <p className="text-slate-400 text-sm text-center py-4">No feature data</p>}
          </div>
        </div>

        {/* Top 3 AE snapshot */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
              <span className="material-symbols-outlined text-sm text-slate-900">warning</span>
            </div>
            <span className="font-bold text-slate-800 text-sm">Top Adverse Signals</span>
            <span className="ml-auto text-[10px] font-black uppercase text-slate-400 border border-slate-200 px-2 py-0.5 rounded-full">Phase 1</span>
          </div>
          <p className="text-xs text-slate-400 mb-4 leading-relaxed">
            Highest-ranked adverse events from FAERS. See <strong className="text-blue-600">Statistical Analysis</strong> tab for full PRR table.
          </p>
          {topEvents.length > 0 ? (
            <div className="space-y-3 flex-1">
              {topEvents.map((ev,i) => (
                <div key={i} className={`rounded-2xl p-3 border ${ev.PRR>10?'bg-slate-100 border-red-100':ev.PRR>2?'bg-slate-100 border-amber-100':'bg-slate-100 border-emerald-100'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-black leading-tight ${ev.PRR>10?'text-red-800':ev.PRR>2?'text-amber-800':'text-emerald-800'}`}>{ev.event}</p>
                      <p className={`text-[10px] mt-0.5 ${ev.PRR>10?'text-red-500':ev.PRR>2?'text-amber-500':'text-emerald-500'}`}>{ev.co_occurrences} co-occurrences</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-lg font-black ${ev.PRR>10?'text-red-600':ev.PRR>2?'text-amber-600':'text-emerald-600'}`}>{ev.PRR?.toFixed(1)}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">PRR</p>
                    </div>
                  </div>
                  <div className="mt-2 h-1 bg-white/60 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width:`${Math.min(100,(ev.PRR/20)*100)}%`, background:ev.PRR>10?'#ef4444':ev.PRR>2?'#f59e0b':'#10b981' }}></div>
                  </div>
                </div>
              ))}
              {totalEvts>3 && <p className="text-center text-xs text-blue-500 font-semibold mt-1">+{totalEvts-3} more in Statistical Analysis →</p>}
            </div>
          ) : <div className="flex-1 flex items-center justify-center"><p className="text-slate-400 text-sm text-center">No FAERS co-occurrence data for this pair</p></div>}
        </div>
      </div>

      {/* Model Agreement */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
            <span className="material-symbols-outlined text-sm text-slate-900">compare</span>
          </div>
          <div>
            <p className="font-bold text-slate-800 text-sm">Model Agreement — Phase 2 vs Phase 3</p>
            <p className="text-xs text-slate-400">How XGBoost and GNN compare on this drug pair</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-5">
          {[
            { name:'XGBoost', sub:'Gradient-boosted trees', icon:'psychology', color:'#f59e0b', score:xgbScore, c:xgbC, metrics:'F1: 94.95% · Acc: 90.63% · Recall: 99.35%' },
            { name:'GraphSAGE GNN', sub:'Graph neural network', icon:'hub', color:'#8b5cf6', score:gnnScore, c:gnnC, metrics:'F1: 94.56% · Acc: 89.90% · Recall: 98.88%' },
          ].map(m => (
            <div key={m.name}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]" style={{ color:m.color }}>{m.icon}</span>
                  <span className="text-sm font-black text-slate-800">{m.name}</span>
                  <span className="text-[10px] text-slate-400">{m.sub}</span>
                </div>
                <span className={`text-sm font-black px-3 py-1 rounded-full ${m.c.bg} ${m.c.text}`}>{m.score?.toFixed ? m.score.toFixed(2) : m.score}</span>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden mb-2">
                <div className="h-full rounded-full transition-all duration-1000" style={{ width:`${mapTo100(m.score)}%`, background:m.color }}></div>
              </div>
              <p className="text-xs text-slate-500">{m.metrics}</p>
            </div>
          ))}
        </div>
        <div className="pt-4 border-t border-slate-100 flex items-start gap-3">
          <span className="material-symbols-outlined text-slate-900 text-xl flex-shrink-0 mt-0.5">lightbulb</span>
          <p className="text-sm text-slate-600 leading-relaxed">
            When both models agree (both HIGH or both LOW), confidence is higher. Disagreement may indicate edge-case drug pairs with sparse training data. The composite score averages both into a single 0–100 index.
          </p>
        </div>
      </div>

    </div>
  );
};

/* ══════════════════════════════════════════════════════
   STATISTICAL ANALYSIS TAB (FAERS deep-dive: PRR charts, table, methodology)
══════════════════════════════════════════════════════ */
const StatisticalAnalysisView = ({ results }) => {
  if (!results) return (
    <div className="flex flex-col gap-6">
      <div className="bg-white border border-slate-100 rounded-3xl p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
            <span className="material-symbols-outlined text-slate-900 text-2xl">analytics</span>
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800">Statistical Analysis Engine</h2>
            <p className="text-slate-500 text-sm">Phase 1 — Pharmacovigilance Signal Detection</p>
          </div>
        </div>
        <p className="text-slate-600 text-base leading-relaxed max-w-3xl">
          Applies <strong className="text-slate-900">Proportional Reporting Ratio (PRR)</strong> analysis across <strong className="text-slate-900">1.06 billion</strong> FDA FAERS adverse event reports. Identifies disproportionate drug-pair co-reporting signals ranked by clinical significance.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center">
              <span className="material-symbols-outlined text-slate-900 text-[18px]">functions</span>
            </div>
            <h3 className="font-black text-slate-900">PRR Formula</h3>
          </div>
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-5 text-center mb-4 border border-blue-100">
            <p className="text-2xl font-black text-blue-900 font-mono">PRR = (a/b) ÷ (c/d)</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[['a','Reports: drug pair + AE'],['b','All reports for drug pair'],['c','AE reports (all drugs)'],['d','Total FAERS reports']].map(([k,v]) => (
              <div key={k} className="bg-slate-100 rounded-xl p-3">
                <span className="font-black text-blue-600 text-lg">{k}</span>
                <p className="text-xs text-slate-500 mt-0.5">{v}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center">
              <span className="material-symbols-outlined text-slate-900 text-[18px]">warning</span>
            </div>
            <h3 className="font-black text-slate-900">Signal Threshold Guide</h3>
          </div>
          <div className="space-y-3">
            {[
              { range:'PRR > 10', label:'HIGH SIGNAL', c:'text-red-600 bg-slate-100 border-red-200', desc:'Strong disproportionate reporting — urgent clinical review warranted' },
              { range:'PRR 2–10', label:'MODERATE',    c:'text-amber-600 bg-slate-100 border-amber-200', desc:'Potential interaction signal — requires clinical judgement' },
              { range:'PRR < 2',  label:'LOW SIGNAL',  c:'text-emerald-600 bg-slate-100 border-emerald-200', desc:'No disproportionate reporting detected in FAERS data' },
            ].map(t => (
              <div key={t.range} className={`rounded-xl p-4 border ${t.c}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono font-black text-sm">{t.range}</span>
                  <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${t.c}`}>{t.label}</span>
                </div>
                <p className="text-xs opacity-80">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center">
              <span className="material-symbols-outlined text-slate-900 text-[18px]">source</span>
            </div>
            <h3 className="font-black text-slate-900">Data Source — FDA FAERS</h3>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed mb-4">
            The FDA Adverse Event Reporting System (FAERS) collects voluntary spontaneous adverse event reports from healthcare professionals, consumers, and manufacturers globally.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {[['1.06B+','Total reports'],['2004','Data from year'],['2025 Q4','Latest quarter'],['13,160','Drugs indexed']].map(([v,l]) => (
              <div key={l} className="bg-slate-100 rounded-xl p-3 text-center">
                <p className="text-xl font-black text-blue-600">{v}</p>
                <p className="text-xs text-slate-500 font-semibold">{l}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center">
              <span className="material-symbols-outlined text-slate-900 text-[18px]">calculate</span>
            </div>
            <h3 className="font-black text-slate-900">Composite Risk Score</h3>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed mb-4">Combines all three phases into a single 0–100 index:</p>
          <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl p-5 text-center mb-3 border border-slate-200">
            <p className="text-lg font-black text-slate-800 font-mono">Score = ½·f(XGBoost) + ½·f(GNN)</p>
          </div>
          <p className="text-xs text-slate-500 text-center">≥ 75 = HIGH · 40–74 = MODERATE · {'< 40'} = LOW</p>
        </div>
      </div>
      <div className="bg-slate-100 border border-blue-200 rounded-2xl p-5 flex items-start gap-4">
        <span className="material-symbols-outlined text-slate-900 text-2xl flex-shrink-0 mt-0.5">info</span>
        <div>
          <p className="font-bold text-blue-900 mb-1">Run an analysis to see live statistical results</p>
          <p className="text-sm text-blue-700">Select two drugs on the Dashboard and click Generate Insights. Full PRR charts, distribution analysis, and the complete evidence table will appear here.</p>
        </div>
      </div>
    </div>
  );

  // ── WITH RESULTS ──
  const evidence = results.historical_evidence || [];
  const highRisk = evidence.filter(e => e.PRR > 10);
  const modRisk  = evidence.filter(e => e.PRR > 2 && e.PRR <= 10);
  const lowRisk  = evidence.filter(e => e.PRR <= 2);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="bg-white border border-slate-100 rounded-3xl p-6 flex flex-col md:flex-row items-start md:items-center gap-6 justify-between shadow-sm">
        <div>
          <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">Statistical Analysis Report — FAERS Phase 1</p>
          <h2 className="text-2xl font-black text-slate-800">{results.drug_a} × {results.drug_b}</h2>
          <p className="text-slate-500 text-sm mt-1">{evidence.length} MedDRA adverse events analyzed from FAERS database</p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[{v:highRisk.length,l:'HIGH PRR',c:'text-red-500'},{v:modRisk.length,l:'MOD PRR',c:'text-amber-500'},{v:lowRisk.length,l:'LOW PRR',c:'text-emerald-500'}].map(s => (
            <div key={s.l} className="bg-slate-100 border border-slate-100 rounded-2xl p-4 text-center min-w-[80px]">
              <p className={`text-3xl font-black ${s.c}`}>{s.v}</p>
              <p className="text-slate-400 text-[9px] font-black uppercase tracking-wider mt-1">{s.l}</p>
            </div>
          ))}
        </div>
      </div>

      {/* PRR bar chart + Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
              <span className="material-symbols-outlined text-sm text-slate-900">bar_chart</span>
            </div>
            <div>
              <p className="font-bold text-slate-800 text-sm">PRR by Adverse Event</p>
              <p className="text-xs text-slate-400">Top {Math.min(evidence.length,8)} events by signal strength · RED &gt;10 · AMBER 2–10 · GREEN &lt;2</p>
            </div>
          </div>
          <div className="h-72">
            {evidence.length > 0 ? (
              <ChartBoundary>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={evidence.slice(0,8)} layout="vertical" margin={{ left:10, right:30 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9"/>
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill:'#94a3b8', fontSize:11 }}/>
                    <YAxis dataKey="event" type="category" width={140} axisLine={false} tickLine={false}
                      tick={{ fill:'#64748b', fontSize:10, fontWeight:600 }} tickFormatter={v=>v.length>20?v.slice(0,20)+'…':v}/>
                    <Tooltip cursor={{ fill:'#f8fafc' }} contentStyle={{ borderRadius:'12px', border:'none', boxShadow:'0 4px 20px rgba(0,0,0,0.08)', fontSize:12 }} formatter={val=>[val?.toFixed(2),'PRR']}/>
                    <Bar dataKey="PRR" radius={[0,6,6,0]} barSize={26}>
                      {evidence.slice(0,8).map((ev,i) => <Cell key={i} fill={ev.PRR>10?'#ef4444':ev.PRR>2?'#f59e0b':'#10b981'}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartBoundary>
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
                <span className="material-symbols-outlined text-slate-300 text-4xl">search_off</span>
                <p className="text-slate-500 font-bold text-sm">No FAERS co-occurrence data</p>
                <p className="text-slate-400 text-xs">This drug pair has never been co-reported in FAERS records</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
              <span className="material-symbols-outlined text-sm text-slate-900">donut_large</span>
            </div>
            <div>
              <p className="font-bold text-slate-800 text-sm">Risk Signal Distribution</p>
              <p className="text-xs text-slate-400">Adverse events by PRR category</p>
            </div>
          </div>
          <div className="h-56">
            {(highRisk.length + modRisk.length + lowRisk.length) > 0 ? (
              <ChartBoundary>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={[
                        { name:'HIGH (PRR>10)',  value:highRisk.length },
                        { name:'MOD (PRR 2-10)', value:modRisk.length  },
                        { name:'LOW (PRR<2)',    value:lowRisk.length  },
                      ].filter(d=>d.value>0)}
                      cx="50%" cy="50%" outerRadius={80} innerRadius={48} dataKey="value" paddingAngle={3}>
                      {[
                        { fill:'#ef4444', v:highRisk.length },
                        { fill:'#f59e0b', v:modRisk.length  },
                        { fill:'#10b981', v:lowRisk.length  },
                      ].filter(d=>d.v>0).map((e,i)=><Cell key={i} fill={e.fill}/>)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius:'12px', border:'none', boxShadow:'0 4px 20px rgba(0,0,0,0.08)', fontSize:12 }}/>
                    <Legend formatter={v=><span style={{ fontSize:11, color:'#64748b' }}>{v}</span>}/>
                  </PieChart>
                </ResponsiveContainer>
              </ChartBoundary>
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
                <span className="material-symbols-outlined text-slate-300 text-3xl">donut_small</span>
                <p className="text-slate-400 text-xs">No signal distribution — 0 events recorded</p>
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4">
            {[{v:highRisk.length,l:'HIGH',c:'bg-slate-100 text-red-600'},{v:modRisk.length,l:'MODERATE',c:'bg-slate-100 text-amber-600'},{v:lowRisk.length,l:'LOW',c:'bg-slate-100 text-emerald-600'}].map(s => (
              <div key={s.l} className={`rounded-xl p-3 text-center ${s.c}`}>
                <p className="text-2xl font-black">{s.v}</p>
                <p className="text-[9px] font-black uppercase tracking-wider">{s.l}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Full evidence table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
            <span className="material-symbols-outlined text-sm text-slate-900">table_chart</span>
          </div>
          <div>
            <p className="font-bold text-slate-800 text-sm">Complete Statistical Evidence Table</p>
            <p className="text-xs text-slate-400">{results.drug_a} × {results.drug_b} — all FAERS-reported adverse events with PRR, case counts, and risk scores</p>
          </div>
          <span className="ml-auto text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">{evidence.length} events</span>
        </div>
        {evidence.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b-2 border-slate-100">
                  {['#','MedDRA Preferred Term','Cases','PRR','Risk Score','Signal'].map(h => (
                    <th key={h} className={`pb-3 pr-4 text-xs font-black text-slate-400 uppercase tracking-wider ${['Cases','PRR','Risk Score'].includes(h)?'text-right':''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {evidence.map((ev,i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-100/30 transition-colors group">
                    <td className="py-3 pr-4 text-xs font-bold text-slate-300">{String(i+1).padStart(2,'0')}</td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${ev.PRR>10?'bg-red-400':ev.PRR>2?'bg-amber-400':'bg-emerald-400'}`}></div>
                        <span className="text-sm font-semibold text-slate-800 group-hover:text-blue-700 transition-colors">{ev.event}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-right text-sm font-bold text-slate-600">{ev.co_occurrences?.toLocaleString()}</td>
                    <td className="py-3 pr-4 text-right">
                      <span className={`text-sm font-black ${ev.PRR>10?'text-red-600':ev.PRR>2?'text-amber-600':'text-emerald-600'}`}>{ev.PRR?.toFixed(2)}</span>
                    </td>
                    <td className="py-3 pr-4 text-right">
                      <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full ${ev.risk_score>5?'bg-slate-100 text-red-600':'bg-slate-100 text-blue-600'}`}>{ev.risk_score?.toFixed(2)}</span>
                    </td>
                    <td className="py-3">
                      <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-full ${ev.PRR>10?'bg-slate-100 text-red-600':ev.PRR>2?'bg-slate-100 text-amber-600':'bg-slate-100 text-emerald-600'}`}>
                        {ev.PRR>10?'HIGH':ev.PRR>2?'MOD':'LOW'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-6">
            <div className="bg-slate-100 border border-amber-200 rounded-2xl p-6 flex flex-col md:flex-row gap-6 items-start">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-slate-900 text-2xl">info</span>
              </div>
              <div className="flex-1">
                <h3 className="font-black text-amber-900 text-base mb-1">No FAERS Co-occurrence Data for This Pair</h3>
                <p className="text-amber-800 text-sm leading-relaxed mb-4">
                  <strong>{results.drug_a}</strong> and <strong>{results.drug_b}</strong> have no recorded co-occurrence in the FDA FAERS database. This typically means:
                </p>
                <ul className="space-y-1.5 text-sm text-amber-700 mb-5">
                  <li className="flex items-start gap-2"><span className="material-symbols-outlined text-[15px] mt-0.5 text-slate-900">check_circle</span>These drugs are rarely co-prescribed (different therapeutic areas)</li>
                  <li className="flex items-start gap-2"><span className="material-symbols-outlined text-[15px] mt-0.5 text-slate-900">check_circle</span>Any adverse events were not reported as co-occurring in FAERS spontaneous reports</li>
                  <li className="flex items-start gap-2"><span className="material-symbols-outlined text-[15px] mt-0.5 text-slate-900">check_circle</span>The XGBoost model still returns a risk score ({results.phase2_xgb?.score} — {results.phase2_xgb?.label}) based on individual drug frequency features</li>
                </ul>
                <p className="text-amber-700 text-sm font-bold mb-3">Try these well-studied pairs to see full FAERS data:</p>
                <div className="flex flex-wrap gap-2">
                  {[['WARFARIN','ASPIRIN'],['CLOPIDOGREL','OMEPRAZOLE'],['FLUOXETINE','TRAMADOL'],['LISINOPRIL','SPIRONOLACTONE']].map(([a,b]) => (
                    <span key={a+b} className="text-xs font-bold bg-white border border-amber-300 text-amber-800 px-3 py-1.5 rounded-full">{a} + {b}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════
   NETWORK TOPOLOGY TAB (GNN graph, embeddings, architecture)
══════════════════════════════════════════════════════ */
const NetworkTopologyView = ({ results }) => {
  if (!results) return (
    <div className="flex flex-col gap-6">
      <div className="bg-white border border-slate-100 rounded-3xl p-8 shadow-sm">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
            <span className="material-symbols-outlined text-slate-900 text-2xl">hub</span>
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800">Graph Neural Network — Phase 3</h2>
            <p className="text-slate-500 text-sm">Latent Drug Interaction Graph via GraphSAGE</p>
          </div>
        </div>
        <p className="text-slate-600 text-base leading-relaxed max-w-3xl">
          A <strong className="text-slate-900">3-layer GraphSAGE</strong> model trained on the full FAERS drug–adverse-event bipartite graph. Each drug is encoded as a <strong className="text-slate-900">64-dimensional node embedding</strong>. An edge decoder predicts interaction strength from embedding pairs — inference is O(1).
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { icon:'layers', iconBg:'bg-slate-100', iconColor:'text-blue-600', title:'Model Architecture',
            items:[['Input','2 node features'],['Conv 1','SAGEConv → 256d + BN'],['Conv 2','SAGEConv → 128d + BN'],['Conv 3','SAGEConv → 64d + BN'],['Decoder','FC(128→32→1)'],['Output','expm1(log risk)']]},
          { icon:'model_training', iconBg:'bg-slate-100', iconColor:'text-orange-500', title:'Training Configuration',
            items:[['Loss','MSE on log(risk+1)'],['Dropout','0.30'],['Activation','ReLU'],['Device','CUDA / CPU'],['Inference','O(1) pre-computed z'],['Graph','Bipartite drug–AE']]},
          { icon:'stacked_bar_chart', iconBg:'bg-slate-100', iconColor:'text-violet-600', title:'Graph Statistics',
            items:[['Drug nodes','13,160'],['AE nodes','MedDRA terms'],['Edge weight','Co-reporting risk'],['Features','freq + mean_risk'],['Embedding','64-dimensional'],['Aggregation','Mean pooling']]},
        ].map(card => (
          <div key={card.title} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${card.iconBg}`}>
                <span className={`material-symbols-outlined text-[18px] ${card.iconColor}`}>{card.icon}</span>
              </div>
              <h3 className="font-black text-slate-900">{card.title}</h3>
            </div>
            <div className="space-y-2">
              {card.items.map(([k,v]) => (
                <div key={k} className="flex items-center justify-between text-sm border-b border-slate-50 pb-2 last:border-0 last:pb-0">
                  <span className="font-semibold text-slate-400">{k}</span>
                  <span className="font-black text-slate-800 text-right">{v}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
            <span className="material-symbols-outlined text-sm text-slate-900">monitoring</span>
          </div>
          <h3 className="font-bold text-slate-800">Real Trained Model Performance</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
          {[
            { label:'XGBoost F1',   value:'94.95%', color:'text-orange-500', bg:'bg-slate-100' },
            { label:'XGBoost Acc',  value:'90.63%', color:'text-orange-400', bg:'bg-slate-100' },
            { label:'GNN F1',       value:'94.56%', color:'text-violet-600', bg:'bg-slate-100' },
            { label:'GNN Accuracy', value:'89.90%', color:'text-violet-500', bg:'bg-slate-100' },
          ].map(m => (
            <div key={m.label} className={`rounded-2xl p-5 text-center ${m.bg}`}>
              <p className={`text-3xl font-black ${m.color}`}>{m.value}</p>
              <p className="text-sm font-bold text-slate-700 mt-2">{m.label}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label:'XGBoost Precision', value:'90.93%', color:'text-orange-400' },
            { label:'XGBoost Recall',    value:'99.35%', color:'text-orange-400' },
            { label:'GNN Precision',     value:'90.60%', color:'text-violet-500' },
            { label:'GNN Recall',        value:'98.88%', color:'text-violet-500' },
          ].map(m => (
            <div key={m.label} className="bg-slate-100 rounded-xl p-4 text-center">
              <p className={`text-xl font-black ${m.color}`}>{m.value}</p>
              <p className="text-xs font-bold text-slate-500 mt-1">{m.label}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-slate-100 border border-violet-200 rounded-2xl p-5 flex items-start gap-4">
        <span className="material-symbols-outlined text-slate-900 text-2xl flex-shrink-0 mt-0.5">info</span>
        <div>
          <p className="font-bold text-violet-900 mb-1">Run an analysis to see the live GNN graph</p>
          <p className="text-sm text-violet-700">Select two drugs on the Dashboard and click Generate Insights. The drug node visualization, GNN edge score, and AE node cloud will appear here.</p>
        </div>
      </div>
    </div>
  );

  // ── WITH RESULTS ──
  const gnnScore = results.phase3_gnn?.score ?? 0;
  const xgbScore = results.phase2_xgb?.score ?? 0;
  const gnnHigh  = gnnScore > 10;
  const topEvent = results.historical_evidence?.[0]?.event || '—';
  const gnnC = riskColor(gnnScore);
  const xgbC = riskColor(xgbScore);

  return (
    <div className="flex flex-col gap-6">
      {/* Big node graph */}
      <div className="bg-white border border-slate-100 rounded-3xl p-8 shadow-sm min-h-[440px] flex flex-col relative overflow-hidden">
        <div className="pointer-events-none absolute -top-40 right-0 w-96 h-96 bg-slate-100 rounded-full blur-3xl"></div>
        <div className="relative z-10 flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
            <span className="material-symbols-outlined text-slate-900 text-xl">hub</span>
          </div>
          <div>
            <p className="font-black text-slate-800 text-lg">Latent Graph Embedding</p>
            <p className="text-slate-500 text-xs">GraphSAGE edge prediction: {results.drug_a} ↔ {results.drug_b}</p>
          </div>
          <div className={`ml-auto px-4 py-2 rounded-full text-sm font-black uppercase tracking-wider border ${gnnHigh?'bg-slate-100 text-red-600 border-red-200':'bg-slate-100 text-blue-600 border-blue-200'}`}>
            GNN {results.phase3_gnn?.label}
          </div>
        </div>
        <div className="relative z-10 flex items-center justify-center gap-3 md:gap-8 py-8 flex-1 flex-wrap">
          {/* Drug A */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-28 h-28 md:w-36 md:h-36 rounded-full bg-white shadow-2xl flex flex-col items-center justify-center p-3 border-4 border-slate-200 hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-slate-900 text-3xl mb-1">medication</span>
              <span className="text-[10px] font-black text-slate-700 text-center leading-tight break-all">{results.drug_a}</span>
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Drug A</span>
          </div>
          {/* Edge */}
          <div className="flex flex-col items-center gap-2 flex-1 max-w-[160px]">
            <div className={`w-full h-1 ${gnnHigh?'bg-gradient-to-r from-slate-200 via-red-400 to-slate-200':'bg-slate-200'}`}></div>
            <div className="bg-slate-100 border border-slate-200 rounded-full px-4 py-2 text-center">
              <p className={`text-lg font-black ${gnnHigh?'text-red-500':'text-blue-500'}`}>{gnnScore.toFixed(2)}</p>
              <p className="text-[9px] text-slate-400 uppercase tracking-wider">GNN Score</p>
            </div>
            <div className={`w-full h-1 ${gnnHigh?'bg-gradient-to-r from-slate-200 via-red-400 to-slate-200':'bg-slate-200'}`}></div>
          </div>
          {/* Top AE */}
          <div className="flex flex-col items-center gap-3">
            <div className={`w-32 h-32 md:w-40 md:h-40 rounded-full flex flex-col items-center justify-center p-4 border-4 shadow-2xl hover:scale-105 transition-transform ${topEvent==='—'?'bg-slate-100 border-slate-300 shadow-slate-200':'bg-white border-blue-200 shadow-blue-500/10'}`}>
              <span className={`material-symbols-outlined text-3xl mb-1 ${topEvent==='—'?'text-slate-400':'text-blue-500'}`}>
                {topEvent==='—' ? 'search_off' : 'warning'}
              </span>
              <span className={`text-[9px] font-black text-center leading-tight line-clamp-3 ${topEvent==='—'?'text-slate-400':'text-slate-700'}`}>
                {topEvent==='—' ? 'No historical co-occurrence' : topEvent}
              </span>
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Top AE Signal</span>
          </div>
          {/* Edge */}
          <div className="flex flex-col items-center gap-2 flex-1 max-w-[160px]">
            <div className={`w-full h-1 ${gnnHigh?'bg-gradient-to-r from-slate-200 via-red-400 to-slate-200':'bg-slate-200'}`}></div>
            <span className="text-transparent text-xs">·</span>
            <div className={`w-full h-1 ${gnnHigh?'bg-gradient-to-r from-slate-200 via-red-400 to-slate-200':'bg-slate-200'}`}></div>
          </div>
          {/* Drug B */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-28 h-28 md:w-36 md:h-36 rounded-full bg-white shadow-2xl flex flex-col items-center justify-center p-3 border-4 border-slate-200 hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-slate-900 text-3xl mb-1">vaccines</span>
              <span className="text-[10px] font-black text-slate-700 text-center leading-tight break-all">{results.drug_b}</span>
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Drug B</span>
          </div>
        </div>
      </div>

      {/* Score cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
              <span className="material-symbols-outlined text-sm text-slate-900">hub</span>
            </div>
            <p className="font-bold text-slate-800">GNN Edge Score</p>
          </div>
          <p className={`text-5xl font-black mb-3 ${gnnC.text}`}>{gnnScore.toFixed(2)}</p>
          <span className={`text-xs font-black uppercase px-3 py-1.5 rounded-full ${gnnC.bg} ${gnnC.text}`}>{results.phase3_gnn?.label}</span>
          <p className="text-xs text-slate-400 mt-4">GraphSAGE decoder: expm1(fc output)</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
              <span className="material-symbols-outlined text-sm text-slate-900">psychology</span>
            </div>
            <p className="font-bold text-slate-800">XGBoost Score</p>
          </div>
          <p className={`text-5xl font-black mb-3 ${xgbC.text}`}>{xgbScore?.toFixed(2)}</p>
          <span className={`text-xs font-black uppercase px-3 py-1.5 rounded-full ${xgbC.bg} ${xgbC.text}`}>{results.phase2_xgb?.label}</span>
          <p className="text-xs text-slate-400 mt-4">Gradient-boosted trees: expm1(prediction)</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
              <span className="material-symbols-outlined text-sm text-slate-900">tune</span>
            </div>
            <p className="font-bold text-slate-800">Feature Importance</p>
          </div>
          <div className="space-y-4">
            {results.phase2_xgb?.feature_drivers?.map(f => (
              <div key={f.name}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-600">{f.name}</span>
                  <span className="text-xs font-black text-slate-800">{f.value}</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full transition-all duration-700" style={{ width:`${Math.min(100,(f.normalized||0)*100)}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AE node cloud */}
      {results.historical_evidence?.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
              <span className="material-symbols-outlined text-sm text-slate-900">warning</span>
            </div>
            <div>
              <p className="font-bold text-slate-800 text-sm">Adverse Event Graph Nodes</p>
              <p className="text-xs text-slate-400">All AE nodes connected to this drug pair in the interaction graph</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {results.historical_evidence.map((ev,i) => (
              <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-full text-xs font-semibold border transition-all hover:shadow-sm ${ev.PRR>10?'bg-slate-100 border-red-200 text-red-700':ev.PRR>2?'bg-slate-100 border-amber-200 text-amber-700':'bg-slate-100 border-emerald-200 text-emerald-700'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${ev.PRR>10?'bg-red-500':ev.PRR>2?'bg-amber-500':'bg-emerald-500'}`}></div>
                {ev.event}
                <span className="font-black opacity-70">PRR {ev.PRR?.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/* ══════════════════════════════════════════════════════
   MAIN APP
══════════════════════════════════════════════════════ */
export default function App() {
  const [drugs,setDrugs]           = useState([]);
  const [drugA,setDrugA]           = useState('');
  const [drugB,setDrugB]           = useState('');
  const [loading,setLoading]       = useState(false);
  const [results,setResults]       = useState(null);
  const [error,setError]           = useState(null);
  const [activeView,setActiveView] = useState('Dashboard');

  useEffect(() => {
    fetch('http://localhost:8000/api/drugs')
      .then(r=>r.json())
      .then(d=>setDrugs(d.drugs||[]))
      .catch(console.error);
  }, []);

  const handlePredict = async e => {
    e.preventDefault();
    if (!drugA||!drugB) return setError('Please select two drugs.');
    if (drugA===drugB) return setError('Please select two different drugs.');
    setError(null); setLoading(true); setResults(null);
    try {
      const res = await fetch('http://localhost:8000/api/predict', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ drug_a:drugA, drug_b:drugB }),
      });
      if (!res.ok) throw new Error('Prediction failed.');
      setResults(await res.json());
    } catch(err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const navTabs = ['Dashboard','Statistical Analysis','Network Topology'];

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900">

      {/* NAV */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-100 px-6 py-3">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center shadow-lg shadow-slate-900/30">
              <span className="material-symbols-outlined text-white text-[20px]">pill</span>
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-black tracking-tight text-slate-900 leading-none">RxSignal</p>
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest">FAERS v4.2</p>
            </div>
          </div>
          <nav className="flex items-center gap-1 bg-slate-100 rounded-full p-1">
            {navTabs.map(t => (
              <button key={t} onClick={()=>setActiveView(t)}
                className={`px-4 py-2 rounded-full text-xs font-bold transition-all duration-200 ${activeView===t?'bg-slate-900 text-white shadow-md shadow-slate-900/20':'text-slate-500 hover:text-slate-800'}`}>
                {t}
              </button>
            ))}
          </nav>
          <div className="flex-shrink-0 hidden md:flex items-center gap-2 bg-slate-100 border border-emerald-200 px-3 py-1.5 rounded-full">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-xs font-bold text-emerald-700">Backend Live</span>
          </div>
        </div>
      </header>

      {/* BODY */}
      <main className="max-w-screen-2xl mx-auto px-4 md:px-6 py-6 flex flex-col gap-6">

        {/* Drug input banner — always visible */}
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-100 relative overflow-hidden">
          <div className="pointer-events-none absolute -top-40 -right-20 w-96 h-96 bg-slate-100 rounded-full blur-3xl"></div>
          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 bg-slate-100 px-3 py-1 rounded-full">AI Risk Engine</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-black text-slate-800 leading-tight mb-2">Drug Interaction<br/>Risk Assessment</h1>
              <p className="text-sm text-slate-500 font-medium leading-relaxed max-w-sm">
                Powered by XGBoost + PyTorch GNN trained on <span className="text-slate-700 font-bold">1.06B FAERS records</span>. Select two drugs to generate full pharmacovigilance insights.
              </p>
            </div>
            <form onSubmit={handlePredict}>
              {error && <div className="mb-4 bg-slate-100 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-2">{error}</div>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Drug A</label>
                  <DrugSelect drugs={drugs} value={drugA} onChange={setDrugA} placeholder="e.g. Aspirin" icon="medication"/>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Drug B</label>
                  <DrugSelect drugs={drugs} value={drugB} onChange={setDrugB} placeholder="e.g. Warfarin" icon="vaccines"/>
                </div>
              </div>
              <div className="flex gap-3">
                <button type="submit" disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 bg-slate-900 hover:bg-black text-white disabled:opacity-60 font-black py-3 px-6 rounded-xl transition-all shadow-lg shadow-slate-900/30 text-sm">
                  {loading
                    ? <><span className="material-symbols-outlined text-sm animate-spin">refresh</span>Analyzing…</>
                    : <><span className="material-symbols-outlined text-sm">bolt</span>Generate Insights</>}
                </button>
                {results && (
                  <button type="button" onClick={()=>{ setResults(null); setDrugA(''); setDrugB(''); }}
                    className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-sm transition-all">
                    Reset
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mb-6">
              <span className="material-symbols-outlined text-4xl text-slate-900 animate-spin">refresh</span>
            </div>
            <h2 className="text-xl font-bold text-blue-600 mb-2">Processing Neural Networks…</h2>
            <p className="text-slate-400 text-sm">Running XGBoost + GNN inference on FAERS data</p>
          </div>
        )}

        {/* Tab content */}
        {!loading && (
          <>
            {activeView==='Dashboard'            && (results ? <DashboardResults results={results}/> : <DashboardEmpty setDrugA={setDrugA} setDrugB={setDrugB}/>)}
            {activeView==='Statistical Analysis' && <StatisticalAnalysisView results={results}/>}
            {activeView==='Network Topology'     && <NetworkTopologyView results={results}/>}
          </>
        )}
      </main>
    </div>
  );
}
