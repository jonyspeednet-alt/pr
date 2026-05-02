import { CandleData } from "../services/geminiService";

export type CandlePattern = 
  | "Doji" 
  | "Hammer" 
  | "Inverted Hammer" 
  | "Bullish Engulfing" 
  | "Bearish Engulfing" 
  | "Morning Star" 
  | "Evening Star" 
  | "Marubozu Bullish" 
  | "Marubozu Bearish"
  | "None";

export interface CandleWithPatterns extends CandleData {
  patterns: CandlePattern[];
}

export function detectCandlePatterns(candles: CandleData[]): CandleWithPatterns[] {
  return candles.map((candle, index) => {
    const patterns: CandlePattern[] = [];
    const prev = index > 0 ? candles[index - 1] : null;
    const secondPrev = index > 1 ? candles[index - 2] : null;

    const bodySize = Math.abs(candle.close - candle.open);
    const candleHeight = candle.high - candle.low;
    const upperWick = candle.high - Math.max(candle.open, candle.close);
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;
    const averageBody = index > 5 
      ? candles.slice(Math.max(0, index - 5), index).reduce((acc, c) => acc + Math.abs(c.close - c.open), 0) / 5
      : bodySize;

    // Doji: Tiny body
    if (bodySize <= candleHeight * 0.1) {
      patterns.push("Doji");
    }

    // Hammer: Small body, long lower wick (2x body), short upper wick
    if (lowerWick >= bodySize * 2 && upperWick <= bodySize * 0.5 && bodySize > 0) {
      patterns.push("Hammer");
    }

    // Inverted Hammer: Small body, long upper wick (2x body), short lower wick
    if (upperWick >= bodySize * 2 && lowerWick <= bodySize * 0.5 && bodySize > 0) {
      patterns.push("Inverted Hammer");
    }

    // Engulfing
    if (prev) {
      const prevBody = Math.abs(prev.close - prev.open);
      const isPrevBearish = prev.close < prev.open;
      const isPrevBullish = prev.close > prev.open;
      const isCurrBullish = candle.close > candle.open;
      const isCurrBearish = candle.close < candle.open;

      // Bullish Engulfing
      if (isPrevBearish && isCurrBullish && candle.open <= prev.close && candle.close >= prev.open) {
        patterns.push("Bullish Engulfing");
      }

      // Bearish Engulfing
      if (isPrevBullish && isCurrBearish && candle.open >= prev.close && candle.close <= prev.open) {
        patterns.push("Bearish Engulfing");
      }
    }

    // Stars (3 candle patterns)
    if (prev && secondPrev) {
      const secondPrevBody = Math.abs(secondPrev.close - secondPrev.open);
      const isSecondPrevBearish = secondPrev.close < secondPrev.open;
      const isSecondPrevBullish = secondPrev.close > secondPrev.open;
      
      const prevBody = Math.abs(prev.close - prev.open);
      const isPrevDoji = prevBody <= (prev.high - prev.low) * 0.1;
      
      const isCurrBullish = candle.close > candle.open;
      const isCurrBearish = candle.close < candle.open;

      // Morning Star
      if (isSecondPrevBearish && isPrevDoji && isCurrBullish && candle.close > (secondPrev.open + secondPrev.close) / 2) {
        patterns.push("Morning Star");
      }

      // Evening Star
      if (isSecondPrevBullish && isPrevDoji && isCurrBearish && candle.close < (secondPrev.open + secondPrev.close) / 2) {
        patterns.push("Evening Star");
      }
    }

    // Marubozu
    if (bodySize > averageBody * 1.5 && upperWick < bodySize * 0.1 && lowerWick < bodySize * 0.1) {
      if (candle.close > candle.open) patterns.push("Marubozu Bullish");
      else patterns.push("Marubozu Bearish");
    }

    return { ...candle, patterns };
  });
}
