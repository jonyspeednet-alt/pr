import { GoogleGenAI } from "@google/genai";
import { detectCandlePatterns } from "../lib/patterns";
import { calculateRSI, calculateEMA, calculateBollingerBands, calculateMACD, calculateATR, calculateVWAP, calculateStochastic, calculateADX } from "../lib/indicators";

let aiClient: GoogleGenAI | null = null;

function getAiClient() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not defined in the environment.");
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PredictionResult {
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  reasoning: string;
  expectedMove: string;
  projectedPath: number[];
  keyLevels: {
    resistance: number[];
    support: number[];
  };
  smartSignal?: string;
}

export async function analyzeCandles(candles: CandleData[], interval: string = '1h'): Promise<PredictionResult> {
  const ai = getAiClient();
  const candlesWithPatterns = detectCandlePatterns(candles);
  const rsiValues = calculateRSI(candles);
  const ema20 = calculateEMA(candles, 20);
  const bb = calculateBollingerBands(candles, 20, 2);
  const macd = calculateMACD(candles);
  const atr = calculateATR(candles, 14);
  const vwap = calculateVWAP(candles, 20);
  const stoch = calculateStochastic(candles, 14);
  const adxData = calculateADX(candles, 14);
  const lastCandles = candlesWithPatterns.slice(-30);
  
  const dataString = lastCandles.map((c, i) => {
    const historicalIdx = candles.length - lastCandles.length + i;
    const rsiIdx = rsiValues.length - (lastCandles.length - i);
    const emaIdx = ema20.length - (lastCandles.length - i);
    const bbIdx = bb ? bb.length - (lastCandles.length - i) : -1;
    const macdIdx = macd ? macd.histogram.length - (lastCandles.length - i) : -1;
    const atrIdx = atr.length - (lastCandles.length - i);
    const adxIdx = adxData.adx.length - (lastCandles.length - i);
    
    const rsi = rsiIdx >= 0 ? rsiValues[rsiIdx] : 'N/A';
    const ema = emaIdx >= 0 ? ema20[emaIdx] : 'N/A';
    const bBands = bbIdx >= 0 && bb ? bb[bbIdx] : null;
    const mHist = macdIdx >= 0 && macd ? macd.histogram[macdIdx] : 'N/A';
    const aVal = atrIdx >= 0 ? atr[atrIdx] : 'N/A';
    const adxVal = adxIdx >= 0 ? adxData.adx[adxIdx] : 'N/A';
    const vVal = vwap[historicalIdx];
    const sK = stoch.k[historicalIdx];
    
    const rsiStr = typeof rsi === 'number' ? rsi.toFixed(2) : rsi;
    const emaStr = typeof ema === 'number' ? ema.toFixed(2) : ema;
    const bbStr = bBands ? `[U:${bBands.upper.toFixed(2)}, M:${bBands.middle.toFixed(2)}, L:${bBands.lower.toFixed(2)}]` : 'N/A';
    const mStr = typeof mHist === 'number' ? mHist.toFixed(2) : mHist;
    const aStr = typeof aVal === 'number' ? aVal.toFixed(2) : aVal;
    const adxStr = typeof adxVal === 'number' ? adxVal.toFixed(1) : adxVal;
    const vStr = typeof vVal === 'number' ? vVal.toFixed(2) : vVal;
    const sStr = typeof sK === 'number' ? sK.toFixed(1) : sK;
    
    return `T: ${new Date(c.time).toISOString()}, OHLC: [${c.open}, ${c.high}, ${c.low}, ${c.close}], V: ${c.volume.toFixed(0)}, RSI: ${rsiStr}, ADX: ${adxStr}, EMA20: ${emaStr}, VWAP: ${vStr}, ATR: ${aStr}, MACD_H: ${mStr}, STOCH_K: ${sStr}, BB: ${bbStr}, P: [${c.patterns.join(', ')}]`;
  }).join('\n');

  const prompt = `You are an elite autonomous Crypto Quant AI specializing in Order Block and Confluence Analysis.
Analyze the BTCUSD ${interval} timeframe data for high-precision future price prediction.

Market Context (Last 30 Candles + Enriched Indicator Matrix):
${dataString}

Analysis Requirements:
1. Identify Market Phase: Accumulation, Markup, Distribution, or Mark-down (Wyckoff).
2. Confluence Check: Cross-reference ADX trend strength with RSI momentum and Price respect to EMA/VWAP.
3. Liquidity/Traps: Spot any "Liquidity Grab" (long wicks into support/resistance with volume spikes).
4. Future Trajectory: Predict the next 5 candles' close prices using momentum decay and mean-reversion probabilities.

Output JSON EXACTLY:
{
  "direction": "bullish" | "bearish" | "neutral",
  "confidence": 0.0 - 1.0 (float),
  "reasoning": "Professional quantitative analysis of microstructure and targets.",
  "expectedMove": "Price target (e.g. '$68,400')",
  "smartSignal": "Primary tactical signal (e.g. 'Bear Trap', 'Bullish Divergence', 'Golden Cross')",
  "projectedPath": [number, number, number, number, number],
  "keyLevels": { "resistance": [number, number, number], "support": [number, number, number] }
}
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from AI");
    
    const parsed = JSON.parse(text) as PredictionResult;
    // ensure confidence is a percentage if ai gives 0-1
    if (parsed.confidence <= 1) {
       parsed.confidence = parsed.confidence * 100;
    }
    return parsed;
  } catch (error) {
    console.error("AI Analysis failed:", error);
    throw new Error("Market intelligence engine currently limited. Retrying...");
  }
}

export interface MarketSentiment {
  sentiment: 'bullish' | 'bearish' | 'neutral';
  score: number;
  reason: string;
}

export async function getMarketSentiment(): Promise<MarketSentiment> {
  try {
    if (!aiClient) {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is not set.");
      }
      aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }

    const ai = aiClient;
    const prompt = `You are a crypto market analyst. Analyze the current overall market sentiment for Bitcoin (BTC) based on general macro conditions, recent news trends, and typical crypto cycles as of the current time.
Return ONLY a JSON object with the following schema:
{
  "sentiment": "bullish" | "bearish" | "neutral",
  "score": 50,
  "reason": "A short 1-sentence explanation of current sentiment drivers based on news and trends."
}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from AI");
    
    return JSON.parse(text) as MarketSentiment;
  } catch (error) {
    console.error("AI Sentiment failed:", error);
    return {
      sentiment: "neutral",
      score: 50,
      reason: "Could not fetch active market sentiment. GEMINI_API_KEY may be missing or the service is temporarily down."
    };
  }
}
