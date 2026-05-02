import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  BrainCircuit, 
  RefreshCw, 
  History, 
  AlertCircle,
  ChevronRight,
  Target,
  Zap,
  Layers,
  Globe,
  PlayCircle,
  BarChart2,
  X,
  Bell
} from 'lucide-react';
import { fetchBTCUSDData, subscribeToCandles, fetchHistoricalData } from './services/binanceService';
import { analyzeCandles, CandleData, PredictionResult, getMarketSentiment, MarketSentiment } from './services/geminiService';
import { TradingChart } from './components/TradingChart';
import { cn } from './lib/utils';
import { format } from 'date-fns';
import { detectCandlePatterns, CandleWithPatterns } from './lib/patterns';
import { saveCandles, loadSavedCandles, savePrediction, loadPredictionHistory } from './services/storageService';

import { calculateRSI, calculateEMA, calculateBollingerBands, calculateMACD, calculateVWAP, calculateStochastic, calculateADX } from './lib/indicators';
import { performSystemAnalysis, SystemAnalysis } from './lib/strategy';
import { runBacktest, BacktestResult } from './lib/backtest';

interface AppAlert {
  id: number;
  message: string;
  type: 'success' | 'warning' | 'info';
  timestamp: Date;
}

export default function App() {
  const [data, setData] = useState<CandleWithPatterns[]>([]);
  const [systemAnalysis, setSystemAnalysis] = useState<SystemAnalysis | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<'bn' | 'en'>('bn');
  const [timeframe, setTimeframe] = useState('1h');
  const [marketSentiment, setMarketSentiment] = useState<MarketSentiment | null>(null);
  const [alerts, setAlerts] = useState<AppAlert[]>([]);
  const [aiPrediction, setAiPrediction] = useState<PredictionResult | null>(null);
  
  const [showBacktest, setShowBacktest] = useState(false);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [isBacktesting, setIsBacktesting] = useState(false);

  const lastAlertedPatternCandleTime = useRef<number | null>(null);
  const lastAlertedAnalysisTime = useRef<number | null>(null);

  const addAlert = useCallback((message: string, type: 'success' | 'warning' | 'info' = 'info', durationMs: number = 6000) => {
    const id = Date.now() + Math.random();
    setAlerts(prev => [...prev, { id, message, type, timestamp: new Date() }]);
    setTimeout(() => {
      setAlerts(prev => prev.filter(a => a.id !== id));
    }, durationMs);
  }, []);

  useEffect(() => {
    if (data.length === 0) return;
    const last = data[data.length - 1];
    
    // Alert for new patterns
    if (last.patterns && last.patterns.length > 0 && last.time !== lastAlertedPatternCandleTime.current) {
      lastAlertedPatternCandleTime.current = last.time;
      const isBullish = last.patterns[0].toLowerCase().includes('bullish') || last.patterns[0].toLowerCase().includes('hammer');
      addAlert(`New Pattern Detected: ${last.patterns.join(', ')}`, isBullish ? 'success' : 'warning');
    }
  }, [data, addAlert]);

  useEffect(() => {
    if (systemAnalysis && systemAnalysis.confidence >= 75 && data.length > 0) {
      // Use the last candle's time as the unique identifier for this analysis state
      const analysisHash = data[data.length - 1].time;
      if (analysisHash !== lastAlertedAnalysisTime.current) {
        lastAlertedAnalysisTime.current = analysisHash;
        if (systemAnalysis.direction === 'bullish') {
           addAlert(`Strong Bullish Signal Detected (${systemAnalysis.confidence.toFixed(1)}%)`, 'success');
        } else if (systemAnalysis.direction === 'bearish') {
           addAlert(`Strong Bearish Signal Detected (${systemAnalysis.confidence.toFixed(1)}%)`, 'warning');
        }
      }
    }
  }, [systemAnalysis, data, addAlert]);

  const loadInitialData = useCallback(async () => {
    try {
      const candles = await fetchBTCUSDData(timeframe, 150);
      const withPatterns = detectCandlePatterns(candles);
      setData(withPatterns);
      saveCandles(candles);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      console.error(err);
      const saved = loadSavedCandles();
      if (saved.length > 0) {
        setData(detectCandlePatterns(saved));
        setError(lang === 'bn' ? "লাইভ ডেটা লোড করতে সমস্যা হচ্ছে। ক্যাশ ডেটা দেখাচ্ছি।" : "Market data fetch failed. Showing cached data.");
      } else {
        setError(lang === 'bn' ? "ডেটা লোড করতে ব্যর্থ।" : "Failed to fetch market data.");
      }
    }
  }, [lang, timeframe]);

  useEffect(() => {
    async function loadSentiment() {
      try {
        const result = await getMarketSentiment();
        setMarketSentiment(result);
      } catch (err) {
        console.error(err);
      }
    }
    loadSentiment();
  }, []);

  useEffect(() => {
    setData([]);
    loadInitialData();

    const unsubscribe = subscribeToCandles(timeframe, (newCandle, isFinal) => {
      setData(prev => {
        const last = prev[prev.length - 1];
        let updatedData: CandleData[];
        if (last && last.time === newCandle.time) {
          updatedData = [...prev.slice(0, -1), newCandle];
        } else {
          updatedData = [...prev, newCandle].slice(-150);
          if (isFinal) {
            setTimeout(() => {
              saveCandles(updatedData);
            }, 100);
          }
        }
        return detectCandlePatterns(updatedData);
      });
      setLastUpdated(new Date());
    });

    return () => unsubscribe();
  }, [timeframe]); // Only restart on timeframe change

  const handleRunBacktest = async () => {
    setShowBacktest(true);
    setIsBacktesting(true);
    setBacktestResult(null);
    try {
      // Fetch 1000 candles for backtesting
      const btcHistory = await fetchHistoricalData(timeframe, 1000);
      const withPatterns = detectCandlePatterns(btcHistory);
      const results = runBacktest(withPatterns);
      setBacktestResult(results);
    } catch (err) {
      console.error(err);
      setError("Failed to run backtest");
    } finally {
      setIsBacktesting(false);
    }
  };

  const currentPrice = data.length > 0 ? data[data.length - 1].close : 0;
  const priceChange = data.length > 1 ? data[data.length - 1].close - data[data.length - 2].close : 0;
  const priceChangePct = (currentPrice !== 0 && data.length > 1) ? (priceChange / (data[data.length - 2]?.close || 1)) * 100 : 0;

  const detectedPatterns = data.length > 0 ? data[data.length - 1].patterns : [];

  const t = {
    title: lang === 'bn' ? 'BTC স্নাইপার' : 'BTC SNIPER',
    subtitle: lang === 'bn' ? 'AI ক্যান্ডেল অ্যানালিস্ট' : 'AI Candle Analyst',
    live: lang === 'bn' ? 'লাইভ আপডেট' : 'Engine Live',
    interval: lang === 'bn' ? 'টাইম ফ্রেম' : 'Interval',
    prediction: lang === 'bn' ? 'পরবর্তী ক্যান্ডেল প্রেডিকশন' : 'Next Candle Prediction',
    direction: lang === 'bn' ? 'দিকনির্দেশ' : 'Direction Bias',
    magnitude: lang === 'bn' ? 'সম্ভাব্য মুভ' : 'Expected Move',
    confidence: lang === 'bn' ? 'নিশ্চয়তা' : 'Confidence',
    confluence: lang === 'bn' ? 'কনফ্লুয়েন্স সিগন্যাল' : 'Signal Confluence',
    trendStrength: lang === 'bn' ? 'ট্রেন্ড শক্তি' : 'Trend Strength',
    intelligence: lang === 'bn' ? 'মার্কেট ইন্টেলিজেন্স' : 'Market Intelligence',
    patterns: lang === 'bn' ? 'শনাক্তকৃত প্যাটিন' : 'Detected Patterns',
    justification: lang === 'bn' ? 'টেকনিক্যাল কারণ' : 'Technical Justification',
    generate: lang === 'bn' ? 'অ্যানালাইসিস শুরু করুন' : 'Initialize Analysis',
    disclaimer: lang === 'bn' ? 'সতর্কতা: এটি শুধুমাত্র শিক্ষামূলক উদ্দেশ্যে তৈরি। ট্রেডিংয়ে আর্থিক ঝুঁকি থাকে।' : 'DISCLAIMER: AI generated for educational purposes. Trading carries high risk.',
  };

  const getRSI = useCallback(() => {
    if (data.length < 15) return 0;
    const rsiValues = calculateRSI(data);
    return rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : 0;
  }, [data]);

  const currentRSI = useMemo(() => getRSI(), [getRSI]);

  const emaStatus = useMemo(() => {
    if (data.length < 20) return { trend: '---', isBullish: false };
    const ema = calculateEMA(data, 20);
    const lastEma = ema[ema.length - 1];
    const lastPrice = data[data.length - 1].close;
    return {
      trend: lastPrice > lastEma ? 'UP' : 'DOWN',
      isBullish: lastPrice > lastEma
    };
  }, [data]);

  const bbStatus = useMemo(() => {
    if (data.length < 20) return { position: '---' };
    const bands = calculateBollingerBands(data, 20, 2);
    if (!bands) return { position: '---' };
    const last = bands[bands.length - 1];
    const price = data[data.length - 1].close;
    
    if (price > last.upper) return { position: 'OVERBOUGHT' };
    if (price < last.lower) return { position: 'OVERSOLD' };
    return { position: 'NEUTRAL' };
  }, [data]);

  const adxStatus = useMemo(() => {
    if (data.length < 30) return { strength: 0, label: '---' };
    const { adx } = calculateADX(data, 14);
    const lastADX = adx[adx.length - 1] || 0;
    let label = 'LOW VOL';
    if (lastADX > 50) label = 'VERY STRONG';
    else if (lastADX > 25) label = 'TRENDING';
    else if (lastADX > 20) label = 'STABLE';
    return { strength: lastADX, label };
  }, [data]);

  useEffect(() => {
    if (data.length >= 20) {
      setSystemAnalysis(performSystemAnalysis(data));
    }
  }, [data]);

  return (
    <div className="min-h-screen bg-[#050505] text-slate-200 font-sans p-4 lg:p-8 xl:p-12 flex flex-col max-w-7xl mx-auto selection:bg-slate-800 selection:text-white scanlines-overlay">
      {/* ALERTS SYSTEM */}
      <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
        <AnimatePresence>
          {alerts.map(alert => (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              className={cn(
                "w-[350px] sm:w-[450px] p-4 rounded-md shadow-[0_10px_30px_rgba(0,0,0,0.8)] border backdrop-blur-md flex items-start gap-3",
                alert.type === 'success' ? "bg-[#050505]/90 border-emerald-500/30 text-emerald-400" :
                alert.type === 'warning' ? "bg-[#050505]/90 border-rose-500/30 text-rose-400" :
                "bg-[#050505]/90 border-blue-500/30 text-blue-400"
              )}
            >
              <Bell size={16} className={cn("mt-0.5 animate-pulse shrink-0", 
                 alert.type === 'success' ? "text-emerald-500" :
                 alert.type === 'warning' ? "text-rose-500" : "text-blue-500"
              )} />
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest block mb-1 text-slate-500 font-mono">Real-time Alert</span>
                <p className="text-xs font-mono font-medium leading-relaxed">{alert.message}</p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Header Section */}
      <header className="flex flex-col md:flex-row justify-between items-end border-b border-slate-800 pb-8 mb-10 gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_#10b981]"></div>
            <span className="text-[10px] uppercase tracking-[0.3em] font-bold text-slate-500">{t.live} • BTC/USD Analysis</span>
          </div>
          <h1 className="text-4xl lg:text-5xl font-mono tracking-tighter font-black text-white flex items-baseline gap-4 mt-2">
            ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            <span className={cn(
              "text-xl lg:text-3xl font-light font-sans tracking-tight",
              priceChange >= 0 ? "text-emerald-400" : "text-rose-500"
            )}>
              {priceChange >= 0 ? '▲' : '▼'}{Math.abs(priceChangePct).toFixed(2)}%
            </span>
          </h1>
        </div>
        <div className="text-right flex flex-col items-end gap-3">
          <div className="flex items-center">
            {['5m', '15m', '1h', '4h'].map((tf, i, arr) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={cn(
                  "text-[10px] px-4 py-1.5 font-mono transition-all border font-bold tracking-widest uppercase",
                  i === 0 ? "rounded-l-md" : "",
                  i === arr.length - 1 ? "rounded-r-md" : "",
                  i !== 0 ? "-ml-[1px]" : "",
                  timeframe === tf 
                    ? "bg-blue-500/10 text-blue-400 border-blue-500 z-10 relative" 
                    : "bg-[#050505] text-slate-600 border-slate-800 hover:border-slate-600 hover:text-slate-300 relative z-0"
                )}
              >
                {tf}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={handleRunBacktest}
              className="px-4 py-1.5 bg-[#0a0a0a] hover:bg-slate-900 text-blue-500 border border-slate-800 hover:border-slate-700 rounded-md transition-colors flex items-center gap-2 text-[10px] font-bold tracking-widest uppercase"
            >
              <PlayCircle size={13} className="text-blue-500" />
              {lang === 'bn' ? 'ব্যাকটেস্ট' : 'Backtest'}
            </button>
            <button 
              onClick={() => setLang(l => l === 'bn' ? 'en' : 'bn')}
              className="px-4 py-1.5 bg-[#0a0a0a] hover:bg-slate-900 rounded-md transition-colors text-slate-500 hover:text-white border border-slate-800 hover:border-slate-700 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest"
            >
              <Globe size={13} />
              {lang === 'bn' ? 'ENGLISH' : 'বাংলা'}
            </button>
            <button 
              onClick={loadInitialData}
              className="p-1.5 bg-[#0a0a0a] hover:bg-slate-900 rounded-md transition-colors text-slate-500 hover:text-white border border-slate-800 hover:border-slate-700"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="mb-8 p-4 bg-rose-500/10 border border-rose-500/20 rounded-sm flex items-center gap-3 text-rose-500 text-xs">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 pb-12">
        {/* Left Column: Analysis & Logic */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          {/* Main Signal Card */}
          <div className="bg-[#0c0c0c] border border-slate-800 p-8 rounded-lg relative overflow-hidden group shadow-[0_4px_40px_-10px_rgba(0,0,0,0.5)]">
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 blur-[100px] -mr-32 -mt-32 pointer-events-none" />
            
            <div className="relative">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/30 overflow-hidden group-hover:border-blue-500/50 transition-colors">
                    <BrainCircuit size={14} className="text-blue-400 animate-pulse" />
                    <div className="absolute inset-0 bg-blue-500/20 blur-xl animate-spin-slow" />
                  </div>
                  <div className="flex flex-col">
                    <h2 className="text-[10px] tracking-[0.3em] font-bold uppercase text-slate-300">
                      {lang === 'bn' ? 'কোয়ান্টিটেটিভ সিগন্যাল' : 'Neural Core Inference'}
                    </h2>
                    <span className="text-[8px] uppercase tracking-widest text-blue-500/80 font-mono">Matrix Heuristics Online</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={async () => {
                      const loadingToastId = Date.now() + Math.random();
                      try {
                        setAlerts(prev => [...prev, { id: loadingToastId, message: "Running Deep AI Neural Scan (this takes ~5 seconds)...", type: 'info', timestamp: new Date() }]);
                        
                        const result = await analyzeCandles(data, timeframe);
                        setAiPrediction(result);
                        setAlerts(prev => prev.filter(a => a.id !== loadingToastId));
                        
                        addAlert(
                           `[TARGET: ${result.expectedMove}] ${result.reasoning}`, 
                           result.direction === 'bullish' ? 'success' : result.direction === 'bearish' ? 'warning' : 'info', 
                           15000 // Keep it on screen for 15 seconds
                        );
                      } catch (err) {
                        setAlerts(prev => prev.filter(a => a.id !== loadingToastId));
                        addAlert("Neural Scan Failed. Check limit/API Key.", 'warning');
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 text-blue-500 border border-blue-500/30 rounded-full text-[9px] font-bold tracking-widest uppercase hover:bg-blue-500/20 hover:text-blue-400 transition-colors"
                  >
                    <BrainCircuit size={10} />
                    DEEP SCAN
                  </button>
                  <div className="text-[9px] font-mono text-slate-600 bg-slate-950 px-2 py-0.5 border border-slate-800">
                    {timeframe.toUpperCase()}
                  </div>
                </div>
              </div>

              {systemAnalysis ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="space-y-8"
                >
                  <div className="flex items-end justify-between border-b border-slate-800 pb-8">
                    <span className={cn(
                      "text-6xl lg:text-7xl font-mono tracking-tighter leading-none italic font-black",
                      systemAnalysis.direction === 'bullish' ? "text-emerald-500" : systemAnalysis.direction === 'bearish' ? "text-rose-500" : "text-slate-500"
                    )}>
                      {systemAnalysis.direction.toUpperCase()}
                    </span>
                    <div className="text-right">
                      <p className="text-[10px] text-slate-600 uppercase font-bold mb-1 tracking-widest">{t.confidence}</p>
                      <p className="text-2xl font-mono text-white">{systemAnalysis.confidence.toFixed(0)}%</p>
                    </div>
                  </div>

                  {/* SMART SIGNALS CONFLUENCE */}
                  {systemAnalysis.signals && systemAnalysis.signals.length > 0 && (
                    <div className="bg-blue-500/5 border border-blue-500/20 p-4 rounded-md">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-[10px] text-blue-400 font-black uppercase tracking-[0.2em]">{t.confluence}</span>
                        <div className="flex gap-1">
                          {systemAnalysis.signals.slice(0, 3).map((_, i) => (
                            <div key={i} className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {systemAnalysis.signals.map((sig, idx) => (
                          <span key={idx} className="px-2 py-1 bg-slate-950 border border-slate-800 text-[9px] font-mono font-bold text-slate-400 rounded-sm">
                            {sig.toUpperCase()}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-[10px] text-slate-600 uppercase font-bold mb-2 tracking-widest">Calculated Score</p>
                      <p className="text-sm font-mono text-white bg-slate-950 p-2 border border-slate-800 rounded-sm">{systemAnalysis.score.toFixed(1)} / 10</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-600 uppercase font-bold mb-2 tracking-widest">Strength</p>
                      <p className="text-sm font-mono text-white bg-slate-950 p-2 border border-slate-800 rounded-sm">
                        {systemAnalysis.confidence > 80 ? 'STRONG' : systemAnalysis.confidence > 50 ? 'MODERATE' : 'WEAK'}
                      </p>
                    </div>
                    <div>
                       <p className="text-[10px] text-slate-600 uppercase font-bold mb-2 tracking-widest">ATR Volatility</p>
                       <p className="text-sm font-mono text-amber-400 bg-slate-950 p-2 border border-slate-800 rounded-sm">
                         {systemAnalysis.atrValue ? '$' + systemAnalysis.atrValue.toFixed(1) : '---'}
                       </p>
                    </div>
                  </div>

                  {systemAnalysis.atrValue && (
                     <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-md flex items-center justify-between">
                        <div className="flex flex-col">
                           <span className="text-[10px] uppercase font-black tracking-widest text-rose-500 mb-1">Dynamic Stop Loss (2x ATR)</span>
                           <span className="text-slate-400 text-xs font-serif italic">Protect capital against abnormal market variance.</span>
                        </div>
                        <div className="text-xl font-mono text-rose-400 font-bold">
                           ${(currentPrice - (systemAnalysis.direction === 'bullish' ? 1 : -1) * (systemAnalysis.atrValue * 2)).toFixed(2)}
                        </div>
                     </div>
                  )}

                  <div>
                     <p className="text-[10px] text-slate-500 uppercase font-bold mb-3 tracking-widest font-mono flex items-center gap-2">
                       <Layers size={12} className="text-blue-500" />
                       Synthesized Vector Output
                     </p>
                     <div className="bg-[#050505] inset-shadow-sm border border-slate-800/50 p-5 rounded-md space-y-3">
                       {systemAnalysis.reasoning.map((r, idx) => (
                         <div key={idx} className="flex gap-3 text-xs text-slate-300 items-start">
                           <ChevronRight size={14} className="text-blue-500/70 shrink-0 relative top-0.5" />
                           <span className="leading-relaxed font-serif text-[15px] opacity-90">{r}</span>
                         </div>
                       ))}
                     </div>
                  </div>
                </motion.div>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center text-slate-700 gap-6">
                  <div className="relative">
                    <div className="w-16 h-16 border rounded-full border-slate-800 border-t-blue-500/50 animate-spin absolute inset-0 -m-3" />
                    <RefreshCw className="w-10 h-10 animate-pulse text-blue-500 opacity-20" />
                  </div>
                  <div className="text-center space-y-2 mt-4">
                    <p className="text-[10px] uppercase tracking-[0.4em] font-bold text-slate-500 animate-pulse">
                      {lang === 'bn' ? 'অ্যালগরিদম রিডিং' : 'Syncing Quants'}
                    </p>
                    <p className="text-[9px] text-slate-700 font-mono uppercase tracking-widest">Processing Vectors...</p>
                  </div>
                </div>
              )}

              {aiPrediction && (
                 <motion.div
                   initial={{ opacity: 0, y: 20 }}
                   animate={{ opacity: 1, y: 0 }}
                   className="mt-8 pt-8 border-t border-slate-800"
                 >
                   <div className="flex items-center gap-3 mb-6">
                     <div className="p-2 bg-sky-500/10 rounded-lg">
                       <BrainCircuit size={20} className="text-sky-400" />
                     </div>
                     <div>
                       <h3 className="text-sm font-mono text-sky-400 tracking-widest uppercase">Deep AI Projection</h3>
                       <p className="text-[10px] text-slate-500 uppercase tracking-widest">Gemini 2.5 Flash Neural Engine</p>
                     </div>
                   </div>
                   
                   <div className="bg-[#020202] border border-sky-500/20 p-5 rounded-lg shadow-[0_0_30px_rgba(14,165,233,0.05)] relative overflow-hidden">
                     <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                        <BrainCircuit size={100} className="text-sky-500" />
                     </div>
                     
                     <div className="grid grid-cols-2 gap-4 mb-6 relative z-10">
                       <div className="flex flex-col">
                         <span className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">Target Strike</span>
                         <span className="text-2xl font-mono text-white tracking-tighter">{aiPrediction.expectedMove}</span>
                       </div>
                       <div className="flex flex-col items-end">
                         <span className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">AI Confidence</span>
                         <span className="text-2xl font-mono text-sky-400 tracking-tighter">{(aiPrediction.confidence * 100).toFixed(0)}%</span>
                       </div>
                     </div>
                     
                     <div className="relative z-10 mb-4 bg-slate-950/50 p-4 border border-slate-800/50 rounded-md">
                        <p className="text-sm font-serif text-slate-300 leading-relaxed italic border-l-2 border-sky-500/50 pl-4">{aiPrediction.reasoning}</p>
                     </div>
                     
                     <div className="grid grid-cols-5 gap-2 relative z-10">
                        {aiPrediction.projectedPath.map((price, i) => (
                           <div key={i} className="flex flex-col justify-center items-center bg-[#050505] border border-slate-800 py-3 rounded-md">
                              <span className="text-[8px] text-slate-600 uppercase font-black mb-1">+{i+1} Bar</span>
                              <span className={cn(
                                "text-xs font-mono font-bold",
                                i > 0 && price > aiPrediction.projectedPath[i-1] ? 'text-emerald-400' : 'text-rose-400'
                              )}>${price.toFixed(0)}</span>
                           </div>
                        ))}
                     </div>
                   </div>
                 </motion.div>
              )}
            </div>
          </div>

          {/* Market Sentiment Card */}
          <div className="bg-[#0c0c0c] border border-slate-800 p-6 rounded-lg shadow-[0_4px_40px_-10px_rgba(0,0,0,0.5)]">
            <h3 className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold mb-6 flex items-center gap-2">
              <Layers size={13} className="text-purple-500" />
              {lang === 'bn' ? 'মার্কেট সেন্টিমেন্ট (গ্লোবাল)' : 'Macro Sentiment (Global)'}
            </h3>
            {marketSentiment ? (
              <div className="space-y-4">
                <div className="flex justify-between items-end border-b border-slate-800 pb-4">
                  <span className={cn(
                    "text-xl font-black uppercase tracking-widest italic",
                    marketSentiment.sentiment === 'bullish' ? "text-emerald-500" :
                    marketSentiment.sentiment === 'bearish' ? "text-rose-500" : "text-amber-500"
                  )}>
                    {marketSentiment.sentiment}
                  </span>
                  <div className="text-right">
                    <span className="text-[9px] text-slate-600 font-bold uppercase tracking-widest block mb-1">Index Score</span>
                    <span className="text-lg font-mono text-white">{marketSentiment.score}</span>
                  </div>
                </div>
                <p className="text-sm font-serif italic text-slate-400 leading-relaxed border-t border-slate-800/50 pt-4">
                  {marketSentiment.reason}
                </p>
              </div>
            ) : (
              <div className="h-24 flex items-center justify-center border border-dashed border-slate-800 rounded-sm">
                 <RefreshCw size={14} className="text-slate-700 animate-spin opacity-50 block" />
              </div>
            )}
          </div>

          {/* Level Tracker */}
          <div className="bg-transparent border border-slate-800 border-dashed p-6 rounded-lg relative">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Layers size={40} />
            </div>
            <h3 className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold mb-6 flex items-center gap-2 relative z-10">
              <div className="w-1 h-3 bg-blue-500/50" />
              {lang === 'bn' ? 'ক্রিটিক্যাল জোন' : 'Critical Order Zones'}
            </h3>
            
            <div className="space-y-6 relative z-10">
              <div className="space-y-3">
                <div className="flex justify-between items-center bg-[#070707] border border-slate-800/50 px-3 py-1.5 rounded-sm">
                  <span className="text-[9px] text-rose-500 uppercase font-black tracking-widest">{lang === 'bn' ? 'রেজিস্ট্যান্স' : 'Supply (Resistance)'}</span>
                </div>
                <div className="flex justify-end flex-wrap gap-2">
                  {systemAnalysis?.keyLevels?.resistance?.map((price, i) => (
                    <span key={i} className="px-3 py-1 bg-[#050505] border border-rose-500/30 text-rose-400 font-mono text-xs font-bold tabular-nums rounded-sm">
                      ${price.toLocaleString(undefined, {minimumFractionDigits: 1})}
                    </span>
                  )) || <div className="h-6 w-full animate-pulse bg-slate-800/20 rounded-sm" />}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center bg-[#070707] border border-slate-800/50 px-3 py-1.5 rounded-sm">
                  <span className="text-[9px] text-emerald-500 uppercase font-black tracking-widest">{lang === 'bn' ? 'সাপোর্ট' : 'Demand (Support)'}</span>
                </div>
                <div className="flex justify-end flex-wrap gap-2">
                  {systemAnalysis?.keyLevels?.support?.map((price, i) => (
                    <span key={i} className="px-3 py-1 bg-[#050505] border border-emerald-500/30 text-emerald-400 font-mono text-xs font-bold tabular-nums rounded-sm">
                      ${price.toLocaleString(undefined, {minimumFractionDigits: 1})}
                    </span>
                  )) || <div className="h-6 w-full animate-pulse bg-slate-800/20 rounded-sm" />}
                </div>
              </div>
            </div>
          </div>

          {/* Extra Indicators */}
          <div className="bg-transparent border border-slate-800 p-6 rounded-lg">
            <h3 className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold mb-6">{lang === 'bn' ? 'টেকনিকাল ওভারভিউ' : 'Technical Overview'}</h3>
            <div className="grid grid-cols-1 gap-4 opacity-70 hover:opacity-100 transition-opacity">
              <div className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800/50">
                <div className="flex flex-col">
                  <span className="text-[9px] text-slate-600 font-bold uppercase">ADX Trend Power</span>
                  <span className="text-xs font-mono text-slate-300">Trend Intensity</span>
                </div>
                <div className="flex flex-col items-end">
                   <span className={cn(
                    "font-mono text-sm font-bold",
                    adxStatus.strength > 25 ? "text-amber-400" : "text-slate-500"
                  )}>
                    {adxStatus.label}
                  </span>
                  <span className="text-[10px] font-mono text-slate-600">{adxStatus.strength.toFixed(1)}</span>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800/50">
                <div className="flex flex-col">
                  <span className="text-[9px] text-slate-600 font-bold uppercase uppercase">EMA20 Trend</span>
                  <span className="text-xs font-mono text-slate-300">Fast Moving Average</span>
                </div>
                <span className={cn(
                  "font-mono text-sm font-bold",
                  emaStatus.isBullish ? "text-emerald-500" : "text-rose-500"
                )}>
                  {emaStatus.isBullish ? 'BULLISH' : 'BEARISH'}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800/50">
                <div className="flex flex-col">
                  <span className="text-[9px] text-slate-600 font-bold uppercase">RSI Relative</span>
                  <span className="text-xs font-mono text-slate-300">Current Momentum</span>
                </div>
                <span className={cn(
                  "font-mono text-sm font-bold",
                  currentRSI > 70 ? "text-rose-500" : currentRSI < 30 ? "text-emerald-500" : "text-white"
                )}>
                  {currentRSI > 60 ? 'OVERHEATED' : currentRSI < 40 ? 'OVERSOLD' : 'STABLE'}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800/50">
                <div className="flex flex-col">
                  <span className="text-[9px] text-slate-600 font-bold uppercase">Volatility Bands</span>
                  <span className="text-xs font-mono text-slate-300">BBands Position</span>
                </div>
                <span className={cn(
                  "font-mono text-sm font-bold",
                  bbStatus.position === 'OVERBOUGHT' ? "text-rose-500" : bbStatus.position === 'OVERSOLD' ? "text-emerald-500" : "text-white"
                )}>
                  {bbStatus.position}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800/50">
                <div className="flex flex-col">
                  <span className="text-[9px] text-slate-600 font-bold uppercase">Stochastic</span>
                  <span className="text-xs font-mono text-slate-300">Phase Vector</span>
                </div>
                {(() => {
                  if (data.length < 14) return <span className="font-mono text-sm font-bold text-slate-500">---</span>;
                  const stoch = calculateStochastic(data, 14);
                  const currentK = stoch.k[stoch.k.length - 1];
                  const currentD = stoch.d[stoch.d.length - 1];
                  const isBullish = currentK > currentD;
                  
                  return (
                    <span className={cn(
                      "font-mono text-sm font-bold flex gap-2",
                      isBullish ? "text-emerald-400" : "text-rose-400"
                    )}>
                      <span>{currentK.toFixed(0)}</span>
                      <span className="text-slate-600">/</span>
                      <span className="text-slate-400">{currentD.toFixed(0)}</span>
                    </span>
                  );
                })()}
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800/50">
                <div className="flex flex-col">
                  <span className="text-[9px] text-slate-600 font-bold uppercase">MACD Hist</span>
                  <span className="text-xs font-mono text-slate-300">Kinetic Velocity</span>
                </div>
                {(() => {
                  if (data.length < 35) return <span className="font-mono text-sm font-bold text-slate-500">---</span>;
                  const macd = calculateMACD(data);
                  if (!macd) return <span className="font-mono text-sm font-bold text-slate-500">---</span>;
                  const hist = macd.histogram[macd.histogram.length - 1];
                  const prevHist = macd.histogram[macd.histogram.length - 2];
                  
                  const isPositive = hist > 0;
                  const isExpanding = Math.abs(hist) > Math.abs(prevHist);
                  
                  return (
                    <span className={cn(
                      "font-mono text-sm font-bold",
                      isPositive ? (isExpanding ? "text-emerald-400" : "text-emerald-700") : (isExpanding ? "text-rose-400" : "text-rose-700")
                    )}>
                      {isPositive ? 'BULL' : 'BEAR'} {isExpanding ? 'EXPAND' : 'FADE'}
                    </span>
                  );
                })()}
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800/50">
                <div className="flex flex-col">
                  <span className="text-[9px] text-slate-600 font-bold uppercase">VWAP Drift</span>
                  <span className="text-xs font-mono text-slate-300">Volume Anchored</span>
                </div>
                {(() => {
                  if (data.length < 20) return <span className="font-mono text-sm font-bold text-slate-500">---</span>;
                  const vwaps = calculateVWAP(data, 20);
                  const currentVwap = vwaps[vwaps.length - 1];
                  const currentPrice = data[data.length - 1].close;
                  const isAbove = currentPrice > currentVwap;
                  const delta = Math.abs((currentPrice - currentVwap) / currentVwap * 100);
                  
                  return (
                    <span className={cn(
                      "font-mono text-sm font-bold",
                      isAbove ? "text-emerald-400" : "text-rose-400"
                    )}>
                      {isAbove ? '+' : '-'}{delta.toFixed(2)}%
                    </span>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Visualizer */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="bg-[#070707] border border-slate-800 rounded-lg relative overflow-hidden flex flex-col p-4 md:p-8 h-[550px] lg:h-[750px] shadow-[0_4px_40px_-10px_rgba(0,0,0,0.5)]">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="px-3 py-1.5 bg-slate-950 border border-slate-800 text-[10px] font-mono tracking-[0.2em] text-blue-500 font-bold flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                  ALPHA_VIEW V2.5
                </div>
                <div className="hidden sm:block h-[1px] w-12 bg-slate-800"></div>
                <div className="text-[10px] font-mono text-slate-600 hidden sm:block">
                  STREAM_BUFFER: {data.length} NODES
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex flex-col items-end">
                  <span className="text-[8px] text-slate-600 uppercase font-black tracking-widest">Exchange Latency</span>
                  <span className="text-[10px] font-mono text-emerald-500">12ms</span>
                </div>
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-[8px] text-slate-600 uppercase font-black tracking-widest">Last Feed</span>
                  <span className="text-[10px] font-mono text-slate-400">{format(lastUpdated, 'HH:mm:ss')}</span>
                </div>
              </div>
            </div>

            <div className="flex-1 w-full relative">
              {data.length > 0 ? (
                <TradingChart data={data} systemAnalysis={systemAnalysis} marketSentiment={marketSentiment} aiPrediction={aiPrediction} />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-slate-700 bg-slate-950/20">
                  <div className="relative">
                    <RefreshCw className="animate-spin w-10 h-10 opacity-20" />
                    <div className="absolute inset-0 m-auto w-1 h-4 bg-blue-500 rounded-full blur-[2px]" />
                  </div>
                  <span className="text-[10px] tracking-[0.5em] font-black uppercase text-slate-600">{lang === 'bn' ? 'ডেটা ফেচ হচ্ছে...' : 'Ingesting Data Flux...'}</span>
                </div>
              )}
            </div>

            {/* Legend / Overlay */}
            <div className="absolute bottom-8 left-8 flex items-center gap-4 pointer-events-none opacity-40 hover:opacity-100 transition-opacity">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-[2px] bg-emerald-500" />
                <span className="text-[9px] font-mono text-slate-500 uppercase">Bull</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-[2px] bg-rose-500" />
                <span className="text-[9px] font-mono text-slate-500 uppercase">Bear</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-[2px] bg-amber-500" />
                <span className="text-[9px] font-mono text-slate-500 uppercase">EMA20</span>
              </div>
            </div>
          </div>
          
          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[#0c0c0c] border border-slate-800 p-5 rounded-lg flex flex-col justify-between hover:bg-slate-900 transition-colors cursor-pointer group">
              <span className="text-[9px] text-slate-500 uppercase font-bold mb-2 tracking-widest group-hover:text-blue-400 transition-colors">Current RSI</span>
              <span className="text-2xl font-mono tracking-tighter text-white">{currentRSI.toFixed(1)}</span>
            </div>
            <div className="bg-[#0c0c0c] border border-slate-800 p-5 rounded-lg flex flex-col justify-between hover:bg-slate-900 transition-colors cursor-pointer group">
              <span className="text-[9px] text-slate-500 uppercase font-bold mb-2 tracking-widest group-hover:text-amber-400 transition-colors">24h Vol</span>
              <span className="text-2xl font-mono tracking-tighter text-white">{((data[data.length-1]?.volume || 0) / 1000).toFixed(1)}K</span>
            </div>
            <div className="bg-[#0c0c0c] border border-slate-800 p-5 rounded-lg flex flex-col justify-between hover:bg-slate-900 transition-colors cursor-pointer group">
              <span className="text-[9px] text-slate-500 uppercase font-bold mb-2 tracking-widest group-hover:text-emerald-400 transition-colors">Timeframe</span>
              <span className="text-2xl font-mono tracking-tighter text-emerald-500">{timeframe.toUpperCase()}</span>
            </div>
            <div className="bg-[#0c0c0c] border border-slate-800 p-5 rounded-lg flex flex-col justify-between hover:bg-slate-900 transition-colors cursor-pointer group relative overflow-hidden">
              <div className="absolute top-0 right-0 -mr-4 -mt-4 w-12 h-12 bg-blue-500/10 rounded-full blur-xl group-hover:bg-blue-500/20 transition-all" />
              <span className="text-[9px] text-slate-500 uppercase font-black mb-2 tracking-widest group-hover:text-blue-400 transition-colors flex items-center gap-1.5">
                 Neural Link
                 <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping absolute ml-[80px]" />
              </span>
              <span className="text-sm font-mono font-bold tracking-widest text-blue-400 mt-1 animate-pulse">SYNAPSING_</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Bar */}
      <footer className="mt-12 pt-8 border-t border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4 text-[10px] font-mono tracking-[0.2em] text-slate-600 uppercase font-bold text-center">
        <div className="flex flex-wrap justify-center gap-8">
          <div className="flex items-center gap-2">
            <div className="w-1 h-1 bg-slate-700"></div>
            <span>Latency: 14ms</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1 h-1 bg-slate-700"></div>
            <span>Model: Gemini-3-Flash</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1 h-1 bg-slate-700"></div>
            <span>Status: Network Synced</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
          <span>{lang === 'bn' ? 'শেষ আপডেট' : 'Last Analysis'}: {format(lastUpdated, 'HH:mm:ss')} UTC</span>
        </div>
      </footer>

      <div className="mt-8 p-4 border border-slate-800/50 rounded-sm bg-slate-900/10">
        <p className="text-[9px] text-slate-500 leading-relaxed text-center italic tracking-wider uppercase font-bold">
          {t.disclaimer}
        </p>
      </div>

      {showBacktest && (
        <div className="fixed inset-0 z-[99999] bg-[#050505]/90 backdrop-blur-md flex items-center justify-center p-4 sm:p-8">
          <div className="bg-[#0c0c0c] border border-slate-800 max-w-5xl w-full max-h-[90vh] overflow-hidden rounded-xl shadow-[0_0_80px_rgba(0,0,0,0.8)] relative flex flex-col">
            <button onClick={() => setShowBacktest(false)} className="absolute top-6 right-6 text-slate-500 hover:text-white transition-colors bg-slate-900 border border-slate-800 p-2 rounded-full z-10">
              <X size={20} />
            </button>
            <div className="p-8 border-b border-slate-800 bg-[#0a0a0a]">
              <h2 className="text-3xl font-light tracking-tight text-white flex items-center gap-4">
                <BarChart2 className="text-blue-500" size={32} />
                Strategy Backtest 
                <span className="text-[10px] bg-slate-900 text-slate-400 border border-slate-800 px-3 py-1.5 font-mono uppercase tracking-widest rounded-full ml-4">
                  1000 Candles • {timeframe}
                </span>
              </h2>
            </div>
            
            <div className="p-8 overflow-y-auto flex-1 custom-scrollbar">
              {isBacktesting ? (
                 <div className="py-32 flex flex-col items-center justify-center">
                   <div className="relative">
                     <div className="w-24 h-24 border-2 rounded-full border-slate-800 border-t-blue-500/50 animate-spin absolute inset-0 -m-6" />
                     <RefreshCw className="animate-pulse text-blue-500 w-12 h-12 mb-8 opacity-50" />
                   </div>
                   <div className="text-xs font-mono text-slate-400 uppercase tracking-[0.3em] font-bold mt-4">Simulating historical trades...</div>
                 </div>
              ) : backtestResult ? (
                 <div className="space-y-12">
                   <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                      <div className="bg-[#050505] inset-shadow-sm border border-slate-800/80 p-6 rounded-lg flex flex-col justify-between">
                        <span className="text-[10px] text-slate-500 uppercase font-black mb-3 tracking-widest">Win Rate</span>
                        <span className="text-4xl font-mono text-white tracking-tighter">{backtestResult.winRate.toFixed(1)}%</span>
                      </div>
                      <div className="bg-[#050505] inset-shadow-sm border border-slate-800/80 p-6 rounded-lg flex flex-col justify-between">
                        <span className="text-[10px] text-slate-500 uppercase font-black mb-3 tracking-widest">Net Profit</span>
                        <span className={cn("text-4xl font-mono tracking-tighter", backtestResult.netProfitPercent >= 0 ? "text-emerald-500" : "text-rose-500")}>
                          {backtestResult.netProfitPercent >= 0 ? '+' : ''}{backtestResult.netProfitPercent.toFixed(2)}%
                        </span>
                      </div>
                      <div className="bg-[#050505] inset-shadow-sm border border-slate-800/80 p-6 rounded-lg flex flex-col justify-between">
                        <span className="text-[10px] text-slate-500 uppercase font-black mb-3 tracking-widest">Max Drawdown</span>
                        <span className="text-4xl font-mono text-rose-500 tracking-tighter">-{backtestResult.maxDrawdown.toFixed(2)}%</span>
                      </div>
                      <div className="bg-[#050505] inset-shadow-sm border border-slate-800/80 p-6 rounded-lg flex flex-col justify-between">
                        <span className="text-[10px] text-slate-500 uppercase font-black mb-3 tracking-widest">Profit Factor</span>
                        <span className="text-4xl font-mono text-blue-500 tracking-tighter">{backtestResult.profitFactor.toFixed(2)}</span>
                      </div>
                   </div>

                   <div className="bg-[#050505] border border-slate-800 rounded-lg overflow-hidden">
                     <div className="p-5 border-b border-slate-800 bg-[#0a0a0a]">
                       <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Trade Log ({backtestResult.totalTrades} Trades)</span>
                     </div>
                     <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs font-mono">
                           <thead>
                             <tr className="text-slate-500 border-b border-slate-800/50 bg-[#080808]">
                               <th className="py-3 px-4 font-bold tracking-widest uppercase text-[9px]">Type</th>
                               <th className="py-3 px-4 font-bold tracking-widest uppercase text-[9px] bg-[#0c0c0c]/50">Entry Time</th>
                               <th className="py-3 px-4 font-bold tracking-widest uppercase text-[9px] bg-[#0c0c0c]/50">Entry Px</th>
                               <th className="py-3 px-4 font-bold tracking-widest uppercase text-[9px]">Exit Time</th>
                               <th className="py-3 px-4 font-bold tracking-widest uppercase text-[9px]">Exit Px</th>
                               <th className="py-3 px-4 font-bold tracking-widest uppercase text-[9px] text-right">Return</th>
                             </tr>
                           </thead>
                           <tbody className="divide-y divide-slate-800/30">
                             {backtestResult.trades.map((trade, idx) => (
                               <tr key={idx} className="hover:bg-slate-900/40 transition-colors">
                                 <td className="py-3 px-4">
                                   <span className={cn("px-2 py-1 rounded-sm border opacity-90", trade.type === 'long' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20")}>
                                     {trade.type.toUpperCase()}
                                   </span>
                                 </td>
                                 <td className="py-3 px-4 text-slate-400">{format(new Date(trade.entryTime), 'MM/dd HH:mm')}</td>
                                 <td className="py-3 px-4 text-slate-300 font-bold">${trade.entryPrice.toFixed(2)}</td>
                                 <td className="py-3 px-4 text-slate-400">{format(new Date(trade.exitTime), 'MM/dd HH:mm')}</td>
                                 <td className="py-3 px-4 text-slate-300 font-bold">${trade.exitPrice.toFixed(2)}</td>
                                 <td className={cn("py-3 px-4 text-right font-black tracking-widest", trade.profitPercent >= 0 ? "text-emerald-500" : "text-rose-500")}>
                                   {trade.profitPercent >= 0 ? '+' : ''}{(trade.profitPercent * 100).toFixed(2)}%
                                 </td>
                               </tr>
                             ))}
                             {backtestResult.trades.length === 0 && (
                               <tr>
                                 <td colSpan={6} className="py-12 text-center text-slate-600 tracking-widest uppercase font-sans text-sm">No trades executed with current logic.</td>
                               </tr>
                             )}
                           </tbody>
                        </table>
                     </div>
                   </div>
                 </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
