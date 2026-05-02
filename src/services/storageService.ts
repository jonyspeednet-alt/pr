import { CandleData } from "./geminiService";
import { CandleWithPatterns } from "../lib/patterns";

const CANDLE_KEY = 'btc_sniper_candles';
const PREDICTION_KEY = 'btc_sniper_predictions';

export function saveCandles(candles: CandleData[]) {
  try {
    // Keep only last 200 candles in local storage to prevent size issues
    const dataToSave = candles.slice(-200);
    localStorage.setItem(CANDLE_KEY, JSON.stringify(dataToSave));
  } catch (e) {
    console.error("Failed to save candles to local storage", e);
  }
}

export function loadSavedCandles(): CandleData[] {
  try {
    const saved = localStorage.getItem(CANDLE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    return [];
  }
}

export function savePrediction(prediction: any) {
  try {
    const saved = localStorage.getItem(PREDICTION_KEY);
    const history = saved ? JSON.parse(saved) : [];
    const newHistory = [{ ...prediction, timestamp: new Date().getTime() }, ...history].slice(0, 50);
    localStorage.setItem(PREDICTION_KEY, JSON.stringify(newHistory));
  } catch (e) {
    console.error("Failed to save prediction", e);
  }
}

export function loadPredictionHistory(): any[] {
  try {
    const saved = localStorage.getItem(PREDICTION_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    return [];
  }
}
