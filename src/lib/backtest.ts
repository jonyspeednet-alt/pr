import { CandleData } from "../services/geminiService";
import { performSystemAnalysis } from "./strategy";

export interface Trade {
  type: 'long' | 'short';
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  profitPercent: number;
}

export interface BacktestResult {
  totalTrades: number;
  winningTrades: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  netProfitPercent: number;
  trades: Trade[];
}

export function runBacktest(historicalCandles: CandleData[]): BacktestResult {
  const windowSize = 50;
  const trades: Trade[] = [];
  let currentPosition: 'long' | 'short' | null = null;
  let entryPrice = 0;
  let entryTime = 0;
  
  let balance = 10000;
  const initialBalance = balance;
  let peakBalance = balance;
  let maxDrawdown = 0;
  let grossProfit = 0;
  let grossLoss = 0;

  for (let i = windowSize; i < historicalCandles.length - 1; i++) {
    const historicalSlice = historicalCandles.slice(i - windowSize, i + 1);
    const analysis = performSystemAnalysis(historicalSlice);
    const currentCandle = historicalCandles[i];
    const nextCandle = historicalCandles[i + 1];

    if (currentPosition === null) {
      if (analysis.direction === 'bullish' && analysis.confidence > 60) {
        currentPosition = 'long';
        entryPrice = nextCandle.open; 
        entryTime = nextCandle.time;
      } else if (analysis.direction === 'bearish' && analysis.confidence > 60) {
        currentPosition = 'short';
        entryPrice = nextCandle.open;
        entryTime = nextCandle.time;
      }
    } else {
      let exit = false;
      if (currentPosition === 'long' && (analysis.direction === 'bearish' || analysis.confidence < 30)) {
        exit = true;
      } else if (currentPosition === 'short' && (analysis.direction === 'bullish' || analysis.confidence < 30)) {
        exit = true;
      }

      const currentPrice = currentCandle.close;
      const profitPercent = currentPosition === 'long' 
        ? (currentPrice - entryPrice) / entryPrice 
        : (entryPrice - currentPrice) / entryPrice;

      if (profitPercent < -0.05 || profitPercent > 0.10) { 
         exit = true;
      }

      if (exit) {
        const exitPrice = nextCandle.open;
        const finalProfitPercent = currentPosition === 'long' 
          ? (exitPrice - entryPrice) / entryPrice 
          : (entryPrice - exitPrice) / entryPrice;
        
        trades.push({
          type: currentPosition,
          entryTime: entryTime,
          entryPrice,
          exitTime: nextCandle.time,
          exitPrice,
          profitPercent: finalProfitPercent
        });

        const tradeProfit = balance * finalProfitPercent;
        balance += tradeProfit;

        if (tradeProfit > 0) grossProfit += tradeProfit;
        else grossLoss += Math.abs(tradeProfit);

        if (balance > peakBalance) peakBalance = balance;
        const drawdown = (peakBalance - balance) / peakBalance;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;

        currentPosition = null;
      }
    }
  }

  if (currentPosition !== null) {
     const lastCandle = historicalCandles[historicalCandles.length - 1];
     const exitPrice = lastCandle.close;
     const finalProfitPercent = currentPosition === 'long' 
          ? (exitPrice - entryPrice) / entryPrice 
          : (entryPrice - exitPrice) / entryPrice;
        
      trades.push({
        type: currentPosition,
        entryTime: entryTime,
        entryPrice,
        exitTime: lastCandle.time,
        exitPrice,
        profitPercent: finalProfitPercent
      });

      const tradeProfit = balance * finalProfitPercent;
      balance += tradeProfit;

      if (tradeProfit > 0) grossProfit += tradeProfit;
      else grossLoss += Math.abs(tradeProfit);

      if (balance > peakBalance) peakBalance = balance;
      const drawdown = (peakBalance - balance) / peakBalance;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  const winningTrades = trades.filter(t => t.profitPercent > 0).length;
  const winRate = trades.length > 0 ? (winningTrades / trades.length) * 100 : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 999 : 0);
  const netProfitPercent = ((balance - initialBalance) / initialBalance) * 100;

  return {
    totalTrades: trades.length,
    winningTrades,
    winRate,
    profitFactor,
    maxDrawdown: maxDrawdown * 100, 
    netProfitPercent,
    trades
  };
}
