import { useEffect, useRef, useState } from 'react';

export function useMarketWebSocket() {
  const [marketData, setMarketData] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket('ws://127.0.0.1:8000/ws/market');
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setMarketData(data);
      } catch (err) {
        console.error('WS parse error', err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, []);

  return { marketData, isConnected };
}
