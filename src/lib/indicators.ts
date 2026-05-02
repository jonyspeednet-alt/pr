import { CandleData } from "../services/geminiService";

export function calculateRSI(candles: CandleData[], period: number = 14): number[] {
  if (candles.length < period) return [];

  const rsis: number[] = [];
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  rsis.push(avgLoss === 0 ? 100 : 100 - (100 / (rs + 1)));

  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      rsis.push(100);
    } else {
      const currentRS = avgGain / avgLoss;
      rsis.push(100 - (100 / (currentRS + 1)));
    }
  }

  return rsis;
}

export function calculateEMA(candles: CandleData[], period: number): number[] {
  if (candles.length < period) return [];
  const k = 2 / (period + 1);
  const emaValues: number[] = [];
  
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += candles[i].close;
  }
  let prevEMA = sum / period;
  emaValues.push(prevEMA);

  for (let i = period; i < candles.length; i++) {
    const ema = (candles[i].close - prevEMA) * k + prevEMA;
    emaValues.push(ema);
    prevEMA = ema;
  }

  return emaValues;
}

export function calculateSMA(candles: { close: number }[], period: number): number[] {
  if (candles.length < period) return [];
  const smas: number[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1);
    const sum = slice.reduce((acc, c) => acc + c.close, 0);
    smas.push(sum / period);
  }
  return smas;
}

export function calculateBollingerBands(candles: CandleData[], period: number = 20, multiplier: number = 2) {
  if (candles.length < period) return null;
  
  const bands: { middle: number; upper: number; lower: number }[] = [];
  
  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1);
    const middle = slice.reduce((sum, c) => sum + c.close, 0) / period;
    
    const variance = slice.reduce((sum, c) => sum + Math.pow(c.close - middle, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    
    bands.push({
      middle,
      upper: middle + (multiplier * stdDev),
      lower: middle - (multiplier * stdDev)
    });
  }
  
  return bands;
}

export function calculateATR(candles: CandleData[], period: number = 14): number[] {
  if (candles.length < period) return [];

  const trs: number[] = [candles[0].high - candles[0].low]; // Initialize first TR

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;

    const tr1 = high - low;
    const tr2 = Math.abs(high - prevClose);
    const tr3 = Math.abs(low - prevClose);
    const tr = Math.max(tr1, tr2, tr3);
    trs.push(tr);
  }

  // Smooth the ATR using Wilde's Smoothing Method
  const atrs: number[] = [];
  let currentATR = trs.slice(0, period).reduce((sum, tr) => sum + tr, 0) / period;
  atrs.push(currentATR);

  for (let i = period; i < trs.length; i++) {
    currentATR = ((currentATR * (period - 1)) + trs[i]) / period;
    atrs.push(currentATR);
  }

  return atrs;
}

export function calculateVWAP(candles: CandleData[], period: number = 20): number[] {
  const vwaps: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    const windowCandles = candles.slice(Math.max(0, i - period + 1), i + 1);
    let volSum = 0;
    let typVolSum = 0;
    for (const c of windowCandles) {
       const typPrice = (c.high + c.low + c.close) / 3;
       volSum += c.volume;
       typVolSum += typPrice * c.volume;
    }
    vwaps.push(volSum === 0 ? candles[i].close : typVolSum / volSum);
  }
  return vwaps;
}

export function calculateStochastic(candles: CandleData[], period: number = 14): { k: number[], d: number[] } {
  const k: number[] = [];
  const d: number[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      k.push(50);
      continue;
    }
    const chunk = candles.slice(i - period + 1, i + 1);
    const highest = Math.max(...chunk.map(c => c.high));
    const lowest = Math.min(...chunk.map(c => c.low));
    
    const currentK = highest === lowest ? 50 : ((candles[i].close - lowest) / (highest - lowest)) * 100;
    k.push(currentK);
  }
  
  for (let i = 0; i < k.length; i++) {
    if (i < 2) {
      d.push(k[i]);
      continue;
    }
    d.push((k[i] + k[i-1] + k[i-2]) / 3);
  }
  
  return { k, d };
}

export function calculateADX(candles: CandleData[], period: number = 14): { adx: number[]; plusDI: number[]; minusDI: number[] } {
  if (candles.length < period * 2) return { adx: [], plusDI: [], minusDI: [] };

  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const tr: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;

    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);

    const tr1 = candles[i].high - candles[i].low;
    const tr2 = Math.abs(candles[i].high - candles[i - 1].close);
    const tr3 = Math.abs(candles[i].low - candles[i - 1].close);
    tr.push(Math.max(tr1, tr2, tr3));
  }

  const smoothedPlusDM: number[] = [];
  const smoothedMinusDM: number[] = [];
  const smoothedTR: number[] = [];

  let initialPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let initialMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let initialTR = tr.slice(0, period).reduce((a, b) => a + b, 0);

  smoothedPlusDM.push(initialPlusDM);
  smoothedMinusDM.push(initialMinusDM);
  smoothedTR.push(initialTR);

  for (let i = period; i < plusDM.length; i++) {
    const nextPlusDM = smoothedPlusDM[smoothedPlusDM.length - 1] - (smoothedPlusDM[smoothedPlusDM.length - 1] / period) + plusDM[i];
    const nextMinusDM = smoothedMinusDM[smoothedMinusDM.length - 1] - (smoothedMinusDM[smoothedMinusDM.length - 1] / period) + minusDM[i];
    const nextTR = smoothedTR[smoothedTR.length - 1] - (smoothedTR[smoothedTR.length - 1] / period) + tr[i];
    
    smoothedPlusDM.push(nextPlusDM);
    smoothedMinusDM.push(nextMinusDM);
    smoothedTR.push(nextTR);
  }

  const plusDI = smoothedPlusDM.map((p, i) => (p / smoothedTR[i]) * 100);
  const minusDI = smoothedMinusDM.map((m, i) => (m / smoothedTR[i]) * 100);
  const dx = plusDI.map((p, i) => {
    const diff = Math.abs(p - minusDI[i]);
    const sum = p + minusDI[i];
    return sum === 0 ? 0 : (diff / sum) * 100;
  });

  const adx: number[] = [];
  let initialADX = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
  adx.push(initialADX);

  for (let i = period; i < dx.length; i++) {
    const nextADX = ((adx[adx.length - 1] * (period - 1)) + dx[i]) / period;
    adx.push(nextADX);
  }

  return { adx, plusDI, minusDI };
}

export function calculateMACD(candles: CandleData[], fast: number = 12, slow: number = 26, signal: number = 9) {
  if (candles.length < slow + signal) return null;

  const emaFast = calculateEMA(candles, fast);
  const emaSlow = calculateEMA(candles, slow);

  // Align lengths
  const sliceFast = emaFast.slice(emaFast.length - emaSlow.length);
  const macdLine = sliceFast.map((f, i) => f - emaSlow[i]);

  // Calculate Signal Line (EMA of MACD Line)
  // We need to wrap macdLine into a format calculateEMA expects
  const macdData = macdLine.map(m => ({ close: m } as any));
  const signalLine = calculateEMA(macdData, signal);

  if (!signalLine.length) return null;

  const finalMACD = macdLine.slice(macdLine.length - signalLine.length);
  const histogram = finalMACD.map((m, i) => m - signalLine[i]);

  return {
    macd: finalMACD,
    signal: signalLine,
    histogram
  };
}
