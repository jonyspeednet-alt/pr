import { CandleData } from "./geminiService";

export async function fetchBTCUSDData(interval: string = '1h', limit: number = 50): Promise<CandleData[]> {
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${interval}&limit=${limit}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Binance API error");
    const data = await response.json();

    return data.map((d: any) => ({
      time: d[0],
      open: parseFloat(d[1]),
      high: parseFloat(d[2]),
      low: parseFloat(d[3]),
      close: parseFloat(d[4]),
      volume: parseFloat(d[5]),
    }));
  } catch (error) {
    console.error("Fetch failed:", error);
    throw error;
  }
}

export async function fetchHistoricalData(interval: string = '1h', limit: number = 1000): Promise<CandleData[]> {
  return fetchBTCUSDData(interval, limit);
}

export function subscribeToCandles(interval: string, onUpdate: (candle: CandleData, isFinal: boolean) => void) {
  let ws: WebSocket | null = null;
  let reconnectTimer: any = null;
  let isClosing = false;

  const connect = () => {
    if (isClosing) return;
    
    ws = new WebSocket(`wss://stream.binance.com/ws/btcusdt@kline_${interval}`);
    
    // Add heartbeats to keep connection alive
    let pingInterval: any;

    ws.onopen = () => {
      console.log('Binance WS Connected');
      pingInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ method: "PING", id: 1 }));
        }
      }, 30000);
    };

    ws.onerror = (error) => {
      // Avoid printing raw error object since it just contains {isTrusted: true}
      console.log('Binance WS Error/Disconnect. Retrying or falling back to HTTP...');
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.id === 1 || !message.k) return; // Ignored ping response or invalid message
        
        const k = message.k;
        
        const candle: CandleData = {
          time: k.t,
          open: parseFloat(k.o),
          high: parseFloat(k.h),
          low: parseFloat(k.l),
          close: parseFloat(k.c),
          volume: parseFloat(k.v),
        };

        onUpdate(candle, k.x);
      } catch (err) {
        console.error("WS Message Error:", err);
      }
    };

    ws.onclose = (event) => {
      if (pingInterval) clearInterval(pingInterval);
      if (!isClosing) {
        console.log(`WS Closed (Code: ${event.code}). Reconnecting in 3s...`);
        reconnectTimer = setTimeout(connect, 3000);
      }
    };
  };

  connect();

  return () => {
    isClosing = true;
    if (ws) ws.close();
    if (reconnectTimer) clearTimeout(reconnectTimer);
  };
}
