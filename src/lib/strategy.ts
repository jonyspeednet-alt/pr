import { CandleData } from "../services/geminiService";
import { calculateRSI, calculateEMA, calculateBollingerBands, calculateMACD, calculateATR, calculateVWAP, calculateStochastic, calculateADX } from "./indicators";
import { detectCandlePatterns } from "./patterns";

export interface SystemAnalysis {
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number; // 0-100
  reasoning: string[];
  keyLevels: {
    support: number[];
    resistance: number[];
  };
  score: number; // Positive for bull, negative for bear
  timestamp?: number;
  atrValue?: number;
  signals?: string[]; // Tactical signals like 'Golden Cross', 'Overbought'
}

function calculateFibonacciLevels(high: number, low: number, isBullish: boolean) {
  const diff = high - low;
  const fibRatios = [0.236, 0.382, 0.5, 0.618, 0.786];
  if (isBullish) {
    // Retracement from high down to low
    return fibRatios.map(ratio => high - (diff * ratio));
  } else {
    // Extension from low up to high
    return fibRatios.map(ratio => low + (diff * ratio));
  }
}

export function performSystemAnalysis(candles: CandleData[]): SystemAnalysis {
  if (candles.length < 50) {
    return {
      direction: 'neutral',
      confidence: 0,
      reasoning: ['Insufficient vector data for neural engine'],
      keyLevels: { support: [], resistance: [] },
      score: 0,
      timestamp: Date.now()
    };
  }

  const lastCandle = candles[candles.length - 1];
  const rsis = calculateRSI(candles);
  const ema20 = calculateEMA(candles, 20);
  const ema50 = calculateEMA(candles, 50);
  const bb = calculateBollingerBands(candles, 20, 2);
  const macd = calculateMACD(candles);
  const atrs = calculateATR(candles, 14);
  const vwaps = calculateVWAP(candles, 20);
  const stoch = calculateStochastic(candles, 14);
  const adxData = calculateADX(candles, 14);
  const patterns = detectCandlePatterns(candles);
  const lastPatterns = patterns[patterns.length - 1].patterns;

  let score = 0;
  const reasoning: string[] = [];
  const signals: string[] = [];

  const currentAtr = atrs.length > 0 ? atrs[atrs.length - 1] : 0;

  // 1. ADX & Trend Strength Analysis
  if (adxData.adx.length > 0) {
    const currentADX = adxData.adx[adxData.adx.length - 1];
    const plusDI = adxData.plusDI[adxData.plusDI.length - 1];
    const minusDI = adxData.minusDI[adxData.minusDI.length - 1];

    if (currentADX > 25) {
      if (plusDI > minusDI) {
        score += 2;
        signals.push('Strong Bullish Trend');
        reasoning.push(`Advisory: Strong bullish trend detected (ADX: ${currentADX.toFixed(1)}). Dominant buy-side pressure.`);
      } else {
        score -= 2;
        signals.push('Strong Bearish Trend');
        reasoning.push(`Advisory: Strong bearish trend detected (ADX: ${currentADX.toFixed(1)}). Dominant sell-side pressure.`);
      }
    } else {
      signals.push('Ranging Market');
      reasoning.push(`Advisory: Market is ranging/consolidating (ADX: ${currentADX.toFixed(1)}). Mean reversion strategies preferred.`);
    }
  }

  // 1. Structural Trend & Moving Averages (EMA & VWAP)
  const currentEma20 = ema20[ema20.length - 1];
  const currentEma50 = ema50[ema50.length - 1];
  const currentVwap = vwaps[vwaps.length - 1];
  const priceToEMA20Delta = ((lastCandle.close - currentEma20) / currentEma20) * 100;
  
  if (lastCandle.close > currentVwap) {
    score += 1.5;
    reasoning.push(`Volume Matrix: Price trading above VWAP ($${currentVwap.toFixed(1)}). Institutional supply absorbed.`);
  } else {
    score -= 1.5;
    reasoning.push(`Volume Matrix: Price trading below VWAP ($${currentVwap.toFixed(1)}). Institutional distribution evident.`);
  }
  
  if (currentEma20 > currentEma50) {
    score += 2;
    signals.push('EMA Golden Alignment');
    reasoning.push(`Microstructure: Alpha positive. EMA(20) leads EMA(50) indicating structural long accumulation.`);
  } else {
    score -= 2;
    signals.push('EMA Death Alignment');
    reasoning.push(`Microstructure: Alpha negative. EMA(20) lags EMA(50) indicating structural distribution phase.`);
  }

  if (Math.abs(priceToEMA20Delta) > 2) {
    reasoning.push(`Mean Reversion Warning: Price deviated ${priceToEMA20Delta.toFixed(2)}% from kinematic mean (EMA20).`);
    score += priceToEMA20Delta > 0 ? -1 : 1;
  }

  // 2. Complex Momentum (RSI & Stochastic Divergence)
  const currentRsi = rsis[rsis.length - 1];
  const prevRsi = rsis[rsis.length - 2];
  const currentStochK = stoch.k[stoch.k.length - 1];
  const currentStochD = stoch.d[stoch.d.length - 1];
  
  if (currentRsi > 70) {
    score -= 1.5;
    signals.push('RSI Overbought');
    reasoning.push(`Oscillator Overextension: RSI at ${currentRsi.toFixed(1)} limits asymmetric upside. Trapped longs likely.`);
  } else if (currentRsi < 30) {
    score += 1.5;
    signals.push('RSI Oversold');
    reasoning.push(`Oscillator Exhaustion: RSI at ${currentRsi.toFixed(1)} indicates seller capitulation. Sweep of lows complete.`);
  }

  // Stoch RSI / Stoch Oscillator logic
  if (currentStochK < 20 && currentStochK > currentStochD) {
    score += 2;
    signals.push('Bullish Stochastic Cross');
    reasoning.push(`Stochastic Matrix: Deep oversold cross bullish. Recovery phase active.`);
  } else if (currentStochK > 80 && currentStochK < currentStochD) {
    score -= 2;
    signals.push('Bearish Stochastic Cross');
    reasoning.push(`Stochastic Matrix: Overbought cross bearish. Distribution phase active.`);
  }

  // 3. Volatility (Bollinger Bands & Standard Deviations)
  if (bb) {
    const lastBB = bb[bb.length - 1];
    const bbWidth = (lastBB.upper - lastBB.lower) / lastBB.lower;
    
    if (bbWidth < 0.02) {
      signals.push('Volatility Squeeze');
      reasoning.push(`Volatility Metrics: standard deviation compression detected (BBW < 2%). Explosive expansion imminent.`);
    }

    if (lastCandle.close > lastBB.upper) {
      score -= 2;
      signals.push('Upper BB Pierce');
      reasoning.push(`Standard Deviation Breakdown: Price pierced upper 2σ band. Algorithmic short-covering/exhaustion probable.`);
    } else if (lastCandle.close < lastBB.lower) {
      score += 2;
      signals.push('Lower BB Pierce');
      reasoning.push(`Standard Deviation Breakdown: Price pierced lower 2σ band. Algorithmic buy-stops triggered.`);
    }
  }

  // MACD Divergence / Crossover
  if (macd) {
    const lastMacd = macd.macd[macd.macd.length - 1];
    const prevMacd = macd.macd[macd.macd.length - 2];
    const lastSignal = macd.signal[macd.signal.length - 1];
    const prevSignal = macd.signal[macd.signal.length - 2];
    
    if (prevMacd < prevSignal && lastMacd >= lastSignal) {
      score += 2.5;
      signals.push('MACD Bullish Cross');
      reasoning.push(`MACD Matrix: Bullish kinematic crossover. Momentum swinging positive.`);
    } else if (prevMacd > prevSignal && lastMacd <= lastSignal) {
      score -= 2.5;
      signals.push('MACD Bearish Cross');
      reasoning.push(`MACD Matrix: Bearish kinematic crossover. Downward velocity increasing.`);
    }
  }

  // 5. Candlestick Patterns
  if (lastPatterns.length > 0) {
    lastPatterns.forEach(p => {
      const pLower = p.toLowerCase();
      if (pLower.includes('hammer') || pLower.includes('morning star') || pLower.includes('engulfing bullish')) {
        score += 2.5;
        signals.push(`Candle: ${p}`);
        reasoning.push(`Pattern Matrix: ${p} structure validated. High algorithmic probability of reversal.`);
      } else if (pLower.includes('shooting star') || pLower.includes('evening star') || pLower.includes('engulfing bearish')) {
        score -= 2.5;
        signals.push(`Candle: ${p}`);
        reasoning.push(`Pattern Matrix: ${p} structure validated. Liquidity sweep targeting lower bounds.`);
      }
    });
  }

  // Final Decision Matrix
  let direction: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (score >= 4) direction = 'bullish';
  else if (score <= -4) direction = 'bearish';

  const confidence = Math.min(Math.max((Math.abs(score) / 12) * 100 + 35, 40), 98);

  return {
    direction,
    confidence,
    reasoning: reasoning.slice(-5), 
    keyLevels: { support: [], resistance: [] }, // Simplified for space
    score,
    timestamp: lastCandle.time,
    atrValue: currentAtr,
    signals
  };
}
