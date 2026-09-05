const API_BASE = import.meta.env.VITE_API_BASE_URL || (
  typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
    ? `${window.location.origin}/api/v1`
    : 'http://127.0.0.1:8000/api/v1'
);

const getAuthHeaders = (): HeadersInit => {
  const token = localStorage.getItem('groww_auth_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

export const api = {
  // Auth & Session Endpoints
  checkUsername: async (username: string): Promise<{ available: boolean; reason: string }> => {
    try {
      const res = await fetch(`${API_BASE}/auth/check-username?username=${encodeURIComponent(username)}`);
      return res.json();
    } catch (e) {
      return { available: false, reason: 'Network error checking username' };
    }
  },

  register: async (name: string, email: string, password: string, username: string) => {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, username }),
    });
    return res.json();
  },

  login: async (identifier: string, password: string) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, email: identifier, password }),
    });
    return res.json();
  },

  getCurrentUser: async () => {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return null;
    return res.json();
  },

  logout: async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
    } finally {
      localStorage.removeItem('groww_auth_token');
      localStorage.removeItem('groww_user_profile');
    }
  },

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
    const res = await fetch(`${API_BASE}/watchlists/`, {
      headers: getAuthHeaders(),
    });
    return res.json();
  },

  createWatchlist: async (name: string, description: string = '') => {
    const res = await fetch(`${API_BASE}/watchlists/`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name, description }),
    });
    return res.json();
  },

  addStockToWatchlist: async (watchlistId: string, symbol: string) => {
    const res = await fetch(`${API_BASE}/watchlists/${watchlistId}/stocks`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ symbol }),
    });
    return res.json();
  },

  removeStockFromWatchlist: async (watchlistId: string, symbol: string) => {
    const res = await fetch(`${API_BASE}/watchlists/${watchlistId}/stocks/${symbol}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return res.json();
  },

  getWatchlistIntelligence: async (watchlistId: string, sinceMinutes?: number) => {
    const url = sinceMinutes !== undefined
      ? `${API_BASE}/watchlists/${watchlistId}/intelligence?since_minutes_ago=${sinceMinutes}`
      : `${API_BASE}/watchlists/${watchlistId}/intelligence`;
    const res = await fetch(url, {
      headers: getAuthHeaders(),
    });
    return res.json();
  },

  sendWatchlistChatMessage: async (
    watchlistId: string,
    message: string,
    history?: Array<{ role: string; text: string }>
  ) => {
    const res = await fetch(`${API_BASE}/watchlists/${watchlistId}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ message, history }),
    });
    return res.json();
  },

  saveCheckpoint: async (userId?: string) => {
    const query = userId ? `?user_id=${encodeURIComponent(userId)}` : '';
    const res = await fetch(`${API_BASE}/watchlists/checkpoint${query}`, {
      method: 'POST',
      headers: getAuthHeaders(),
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

  setSimulationSpeed: async (speed: number) => {
    const res = await fetch(`${API_BASE}/market/replay/speed?speed=${speed}`, {
      method: 'POST',
    });
    return res.json();
  },
};
