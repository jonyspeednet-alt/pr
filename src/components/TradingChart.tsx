import React, { useMemo } from 'react';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Bar,
  Cell,
  ReferenceLine,
  ReferenceArea,
  Scatter,
  Brush,
} from 'recharts';
import { format } from 'date-fns';
import { CandleData, PredictionResult, MarketSentiment } from '../services/geminiService';
import { calculateEMA, calculateVWAP, calculateBollingerBands } from '../lib/indicators';
import { SystemAnalysis } from '../lib/strategy';

interface TradingChartProps {
  data: CandleData[];
  systemAnalysis?: SystemAnalysis | null;
  marketSentiment?: MarketSentiment | null;
  aiPrediction?: PredictionResult | null;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-[#050505]/95 backdrop-blur-xl border border-slate-700/50 p-4 shadow-[0_10px_40px_rgba(0,0,0,0.9)] rounded-lg text-[10px] font-mono tracking-widest min-w-[220px]">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 mb-3">
           <p className="text-slate-400 font-bold uppercase">{format(new Date(label), 'MMM d, yyyy HH:mm')}</p>
           {data.patterns && data.patterns.length > 0 && (
             <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
           )}
        </div>
        <div className="space-y-2.5">
          {data.patterns && data.patterns.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3 pb-3 border-b border-slate-800/50">
              {data.patterns.map((p: string, i: number) => {
                const isBullish = p.toLowerCase().includes('bullish') || p.toLowerCase().includes('hammer');
                return (
                  <span key={i} className={`px-2 py-0.5 rounded-sm text-[8px] font-black uppercase border ${isBullish ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                    {p}
                  </span>
                )
              })}
            </div>
          )}
          {data.isPrediction ? (
            <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-slate-800/80">
              <span className="text-sky-400 font-black text-[10px] uppercase tracking-widest flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
                AI Projected Target
              </span>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 uppercase text-[8px] font-black">Price</span>
                <span className="text-sky-300 font-bold text-lg">${data.close.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <div className="flex flex-col">
                   <span className="text-slate-600 uppercase text-[8px] font-black mb-0.5">Open</span>
                   <span className="text-slate-300 font-bold">${data.open.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
                <div className="flex flex-col">
                   <span className="text-slate-600 uppercase text-[8px] font-black mb-0.5">High</span>
                   <span className="text-slate-300 font-bold">${data.high.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
                <div className="flex flex-col">
                   <span className="text-slate-600 uppercase text-[8px] font-black mb-0.5">Low</span>
                   <span className="text-slate-300 font-bold">${data.low.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
                <div className="flex flex-col">
                   <span className="text-slate-600 uppercase text-[8px] font-black mb-0.5">Close</span>
                   <span className={data.close >= data.open ? "text-emerald-400 font-black" : "text-rose-400 font-black"}>
                     ${data.close.toLocaleString(undefined, {minimumFractionDigits: 2})}
                   </span>
                </div>
              </div>
              
              <div className="pt-3 mt-2 border-t border-slate-800/80 flex justify-between items-center">
                <div className="flex flex-col text-right">
                   <span className="text-slate-600 uppercase text-[8px] font-black mb-0.5">BB Upper</span>
                   <span className="text-sky-500/80 font-bold">${data.bbUpper?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '---'}</span>
                </div>
                <div className="flex flex-col text-right">
                   <span className="text-slate-600 uppercase text-[8px] font-black mb-0.5">BB Lower</span>
                   <span className="text-sky-500/80 font-bold">${data.bbLower?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '---'}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }
  return null;
};

export const TradingChart: React.FC<TradingChartProps> = ({ data, systemAnalysis, marketSentiment, aiPrediction }) => {
  const chartData = useMemo(() => {
    const emaValues = calculateEMA(data, 20);
    const vwaps = calculateVWAP(data, 20);
    const bbValues = calculateBollingerBands(data, 20, 2);

    const base = data.map((item, i) => {
      const bBands = (bbValues && i >= 19) ? bbValues[i - 19] : null;
      return {
        ...item,
        openClose: [Math.min(item.open, item.close), Math.max(item.open, item.close)],
        ohlcRange: [item.low, item.high],
        color: item.close >= item.open ? '#10b981' : '#f43f5e',
        isUp: item.close >= item.open,
        ema: i >= 19 ? emaValues[i - 19] : null,
        vwap: vwaps[i],
        bbUpper: bBands?.upper || null,
        bbLower: bBands?.lower || null,
        isPrediction: false,
        aiPredictionLine: null as number | null
      };
    });

    if (aiPrediction && aiPrediction.projectedPath && aiPrediction.projectedPath.length > 0 && data.length > 0) {
       const lastTime = data[data.length - 1].time;
       // find timeframe interval
       const interval = data.length > 1 ? data[data.length-1].time - data[data.length-2].time : 3600000;
       
       let currentPrice = data[data.length - 1].close;

       // Connect the last actual point to the prediction line
       base[base.length - 1].aiPredictionLine = currentPrice;

       aiPrediction.projectedPath.forEach((pricePoint, index) => {
          base.push({
             time: lastTime + (interval * (index + 1)),
             open: currentPrice,
             high: Math.max(currentPrice, pricePoint) * 1.0005, // fake high
             low: Math.min(currentPrice, pricePoint) * 0.9995,  // fake low
             close: pricePoint,
             volume: 0,
             patterns: [],
             openClose: [Math.min(currentPrice, pricePoint), Math.max(currentPrice, pricePoint)],
             ohlcRange: [Math.min(currentPrice, pricePoint), Math.max(currentPrice, pricePoint)],
             color: pricePoint >= currentPrice ? '#10b981' : '#f43f5e',
             isUp: pricePoint >= currentPrice,
             ema: null,
             isPrediction: true,
             aiPredictionLine: pricePoint
          } as any);
          currentPrice = pricePoint; // forward
       });
    }

    return base;
  }, [data, aiPrediction]);

  if (!data || data.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-700 font-mono text-[10px] tracking-widest uppercase relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/10 via-[#050505] to-[#050505]"></div>
        <div className="flex flex-col items-center gap-4 relative z-10">
          <div className="w-8 h-8 border-2 border-slate-800 border-t-blue-500 rounded-full animate-spin" />
          Initializing neural buffer...
        </div>
      </div>
    );
  }

  const minPrice = useMemo(() => {
    if (!data.length) return 0;
    const lows = chartData.map(d => d.low);
    const supports = [...(systemAnalysis?.keyLevels?.support || [])];
    const all = [...lows, ...supports].filter(v => typeof v === 'number' && !isNaN(v));
    return all.length > 0 ? Math.min(...all) * 0.995 : 0;
  }, [chartData, systemAnalysis]);

  const maxPrice = useMemo(() => {
    if (!data.length) return 100;
    const highs = chartData.map(d => d.high);
    const resistances = [...(systemAnalysis?.keyLevels?.resistance || [])];
    const all = [...highs, ...resistances].filter(v => typeof v === 'number' && !isNaN(v));
    return all.length > 0 ? Math.max(...all) * 1.005 : 100;
  }, [chartData, systemAnalysis]);

  const lastPrice = data[data.length - 1]?.close;
  const isCurrentlyUp = data.length > 0 ? data[data.length - 1].close >= data[data.length - 1].open : true;

  // Decide sentiment color overlay
  const sentimentColor = useMemo(() => {
    if (!marketSentiment) return null;
    switch (marketSentiment.sentiment) {
      case 'bullish': return 'rgba(16, 185, 129, 0.02)';
      case 'bearish': return 'rgba(244, 63, 94, 0.02)';
      default: return 'rgba(56, 189, 248, 0.02)';
    }
  }, [marketSentiment]);

  return (
    <div className="w-full h-full min-h-[500px] relative">
      {/* Background glow based on current price action */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
         <div className={`absolute -top-40 -right-40 w-96 h-96 blur-[120px] rounded-full opacity-10 transition-colors duration-1000 ${isCurrentlyUp ? 'bg-emerald-500' : 'bg-rose-500'}`} />
         <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-blue-500 blur-[120px] rounded-full opacity-[0.03]" />
      </div>

      {lastPrice && (
        <div className="absolute top-6 left-6 z-10 flex flex-col items-start pointer-events-none">
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isCurrentlyUp ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            <div className="text-[9px] text-slate-500 font-bold font-mono uppercase tracking-widest">BTC/USD Live</div>
          </div>
          <div className={`text-4xl font-mono tracking-tighter font-black drop-shadow-md ${isCurrentlyUp ? 'text-emerald-400' : 'text-rose-400'}`}>
            ${lastPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      )}

      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <ComposedChart data={chartData} margin={{ top: 20, right: 60, left: 10, bottom: 20 }}>
          <defs>
            <linearGradient id="colorEma" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#fbbf24" stopOpacity={0}/>
            </linearGradient>
            <pattern id="gridPattern" width="40" height="40" patternUnits="userSpaceOnUse">
              <rect width="40" height="40" fill="none" />
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" strokeWidth="0.5" strokeOpacity="0.3" />
            </pattern>
          </defs>

          {sentimentColor && (
            <ReferenceArea yAxisId="priceAxis" y1={minPrice} y2={maxPrice} {...{ fill: sentimentColor, opacity: 1, isFront: false } as any} />
          )}
          
          <rect width="100%" height="100%" fill="url(#gridPattern)" />

          <XAxis 
            dataKey="time" 
            tickFormatter={(time) => format(new Date(time), 'HH:mm')}
            stroke="#475569"
            fontSize={9}
            fontFamily="monospace"
            tickLine={false}
            axisLine={false}
            dy={20}
            minTickGap={50}
          />
          <YAxis 
            yAxisId="priceAxis"
            domain={[minPrice, maxPrice]} 
            orientation="right"
            stroke="#475569"
            fontSize={9}
            fontFamily="monospace"
            tickLine={false}
            axisLine={false}
            tickFormatter={(val) => val >= 1000 ? `${(val/1000).toFixed(1)}k` : val.toFixed(1)}
            dx={15}
            width={70}
          />
          <YAxis 
            yAxisId="volumeAxis"
            hide
            domain={[0, (data: any) => Math.max(...data.map((d: any) => d.volume)) * 5]} 
          />
          <Tooltip 
            content={<CustomTooltip />} 
            cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '2 4', strokeOpacity: 0.2 }} 
            isAnimationActive={false}
          />
          
          <ReferenceLine 
            yAxisId="priceAxis"
            y={lastPrice} 
            stroke={isCurrentlyUp ? '#10b981' : '#f43f5e'} 
            strokeDasharray="2 4" 
            label={{ 
              position: 'right', 
              value: lastPrice?.toFixed(1), 
              fill: isCurrentlyUp ? '#10b981' : '#f43f5e', 
              fontSize: 10,
              fontWeight: 800,
              offset: 15,
              fontFamily: 'monospace'
            }} 
          />

          <Bar 
            yAxisId="volumeAxis" 
            dataKey="volume" 
            barSize={6} 
            isAnimationActive={false} 
          >
             {chartData.map((entry, index) => (
                <Cell key={`vol-${index}`} fill={entry.isUp ? '#10b981' : '#f43f5e'} fillOpacity={0.15} />
             ))}
          </Bar>

          {/* System Levels */}
          {systemAnalysis?.keyLevels?.resistance?.map((lvl, index) => (
            <React.Fragment key={`sys-res-${index}`}>
              <ReferenceArea
                {...{
                  yAxisId: "priceAxis",
                  y1: lvl * 0.999,
                  y2: lvl * 1.001,
                  fill: "#ef4444",
                  fillOpacity: 0.03,
                  stroke: "#ef4444",
                  strokeOpacity: 0.2,
                  strokeDasharray: "4 4"
                } as any}
              />
            </React.Fragment>
          ))}

          {systemAnalysis?.keyLevels?.support?.map((lvl, index) => (
            <React.Fragment key={`sys-sup-${index}`}>
              <ReferenceArea
                {...{
                  yAxisId: "priceAxis",
                  y1: lvl * 0.999,
                  y2: lvl * 1.001,
                  fill: "#10b981",
                  fillOpacity: 0.03,
                  stroke: "#10b981",
                  strokeOpacity: 0.2,
                  strokeDasharray: "4 4"
                } as any}
              />
            </React.Fragment>
          ))}

          <Line 
            yAxisId="priceAxis"
            type="monotone" 
            dataKey="bbUpper" 
            stroke="#38bdf8" 
            strokeWidth={1} 
            dot={false} 
            strokeOpacity={0.2}
            strokeDasharray="5 5"
            isAnimationActive={false}
          />

          <Line 
            yAxisId="priceAxis"
            type="monotone" 
            dataKey="bbLower" 
            stroke="#38bdf8" 
            strokeWidth={1} 
            dot={false} 
            strokeOpacity={0.2} 
            strokeDasharray="5 5"
            isAnimationActive={false}
          />

          <Line 
            yAxisId="priceAxis"
            type="monotone" 
            dataKey="ema" 
            stroke="#fbbf24" 
            strokeWidth={1.5} 
            dot={false} 
            activeDot={{ r: 4, fill: '#050505', stroke: '#fbbf24', strokeWidth: 2 }} 
            strokeOpacity={0.8}
            isAnimationActive={false}
          />

          <Line 
            yAxisId="priceAxis"
            type="monotone" 
            dataKey="vwap" 
            stroke="#a855f7" 
            strokeWidth={1.5} 
            dot={false} 
            activeDot={{ r: 4, fill: '#050505', stroke: '#a855f7', strokeWidth: 2 }} 
            strokeOpacity={0.5}
            strokeDasharray="2 3"
            isAnimationActive={false}
          />
          
          <Line 
            yAxisId="priceAxis"
            type="monotone" 
            dataKey="aiPredictionLine" 
            stroke="#38bdf8" 
            strokeWidth={2} 
            strokeDasharray="4 4"
            dot={{ r: 3, fill: '#050505', stroke: '#38bdf8', strokeWidth: 1.5 }} 
            activeDot={{ r: 6, fill: '#38bdf8', stroke: '#050505', strokeWidth: 2 }} 
            isAnimationActive={true}
            animationDuration={2000}
            strokeOpacity={0.9}
          />

          {/* Candle Wicks */}
          <Bar 
            yAxisId="priceAxis"
            dataKey="ohlcRange" 
            barSize={2} 
            isAnimationActive={false}
          >
            {chartData.map((entry, index) => (
              <Cell key={`wick-${index}`} fill={entry.color} />
            ))}
          </Bar>

          {/* Candle Bodies */}
          <Bar 
            yAxisId="priceAxis"
            dataKey="openClose" 
            barSize={12} 
            isAnimationActive={false}
            shape={(props: any) => {
              const { x, y, width, height, fill } = props;
              if (x === undefined || y === undefined || height === undefined) return null;
              
              const bodyHeight = Math.max(Math.abs(height), 2);
              const bodyY = height >= 0 ? y : y + height;
              return (
                <rect 
                  x={x} 
                  y={bodyY} 
                  width={width} 
                  height={bodyHeight} 
                  fill={fill} 
                  rx={1}
                />
              );
            }}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Bar>

          <Scatter 
            yAxisId="priceAxis"
            data={chartData.filter(d => d.patterns && d.patterns.length > 0)} 
            dataKey="high"
            fill="#38bdf8"
            isAnimationActive={false}
            shape={(props: any) => {
              const { cx, cy, payload } = props;
              if (cx === undefined || cy === undefined || !payload) return null;
              const activePattern = payload.patterns && payload.patterns.length > 0 ? payload.patterns[0] : null;
              if (!activePattern) return null;
              
              const isBullish = activePattern.toLowerCase().includes('bullish') || activePattern.toLowerCase().includes('hammer');
              const color = isBullish ? '#10b981' : '#f43f5e';
              const bgOpacity = 0.15;

              return (
                <g className="cursor-pointer transition-transform hover:scale-110" style={{ transformOrigin: `${cx}px ${cy}px` }}>
                  <rect x={cx - 30} y={cy - 25} width={60} height={12} rx={2} fill={color} fillOpacity={bgOpacity} stroke={color} strokeWidth={1} strokeOpacity={0.5} />
                  <circle cx={cx} cy={cy - 8} r={2} fill={color} />
                  <line x1={cx} y1={cy - 8} x2={cx} y2={cy - 13} stroke={color} strokeWidth={1} strokeOpacity={0.5} />
                  <text 
                    x={cx} 
                    y={cy - 16} 
                    textAnchor="middle" 
                    fill={color} 
                    fontSize={6} 
                    fontWeight="800"
                    fontFamily="monospace"
                    className="uppercase tracking-widest"
                  >
                    {activePattern.substring(0, 10).replace('Bullish','BULL').replace('Bearish','BEAR').replace('Engulfing', 'ENG')}
                  </text>
                </g>
              );
            }}
          />

          <Brush 
            dataKey="time" 
            height={24} 
            stroke="#1e293b" 
            fill="#020202"
            tickFormatter={(time) => format(new Date(time), 'HH:mm')} 
            startIndex={Math.max(0, chartData.length - 80)} // Show slightly more candles by default for clarity
            travellerWidth={8}
            className="text-[9px] font-mono tracking-widest fill-slate-500"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};
