const API_BASE = 'http://127.0.0.1:8000/api/v1';

export const api = {
  getMarketStatus: async () => {
    const res = await fetch(`${API_BASE}/market/status`);
    return res.json();
  },

  getStocks: async () => {
    const res = await fetch(`${API_BASE}/market/stocks`);
    return res.json();
  },

  searchStocks: async (query: string) => {
    const res = await fetch(`${API_BASE}/market/search?query=${encodeURIComponent(query)}`);
    return res.json();
  },

  getStockHistory: async (symbol: string, limit: number = 60) => {
    const res = await fetch(`${API_BASE}/market/stocks/${symbol}/history?limit=${limit}`);
    return res.json();
  },

  getWatchlists: async () => {
    const res = await fetch(`${API_BASE}/watchlists/`);
    return res.json();
  },

  createWatchlist: async (name: string, description: string = '') => {
    const res = await fetch(`${API_BASE}/watchlists/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    });
    return res.json();
  },

  addStockToWatchlist: async (watchlistId: string, symbol: string) => {
    const res = await fetch(`${API_BASE}/watchlists/${watchlistId}/stocks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol }),
    });
    return res.json();
  },

  removeStockFromWatchlist: async (watchlistId: string, symbol: string) => {
    const res = await fetch(`${API_BASE}/watchlists/${watchlistId}/stocks/${symbol}`, {
      method: 'DELETE',
    });
    return res.json();
  },

  getWatchlistIntelligence: async (watchlistId: string, sinceMinutes?: number) => {
    const url = sinceMinutes !== undefined
      ? `${API_BASE}/watchlists/${watchlistId}/intelligence?since_minutes_ago=${sinceMinutes}`
      : `${API_BASE}/watchlists/${watchlistId}/intelligence`;
    const res = await fetch(url);
    return res.json();
  },

  saveCheckpoint: async (userId: string = 'default_user') => {
    const res = await fetch(`${API_BASE}/watchlists/checkpoint?user_id=${userId}`, {
      method: 'POST',
    });
    return res.json();
  },

  simulateAnomaly: async (symbol: string, priceShockPct: number, volumeMultiplier: number) => {
    const res = await fetch(
      `${API_BASE}/market/simulate-anomaly?symbol=${symbol}&price_shock_pct=${priceShockPct}&volume_multiplier=${volumeMultiplier}`,
      { method: 'POST' }
    );
    return res.json();
  },

  seekReplay: async (index: number) => {
    const res = await fetch(`${API_BASE}/market/replay/seek?index=${index}`, {
      method: 'POST',
    });
    return res.json();
  },
};
