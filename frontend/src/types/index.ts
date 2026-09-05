export interface Stock {
  symbol: string;
  name: string;
  sector: string;
  exchange: string;
  current_price: number;
  previous_close?: number;
  pct_change?: number;
  fifty_two_week_high: number;
  fifty_two_week_low: number;
}

export interface Watchlist {
  id: string;
  name: string;
  description?: string;
  created_at?: string;
}

export interface StockInsight {
  symbol: string;
  name: string;
  sector: string;
  current_price: number;
  price_at_last_seen: number;
  pct_change_since_seen: number;
  volume_surge_ratio: number;
  attention_score: number;
  signals: string[];
}

export interface IntelligenceResponse {
  reference_time: string;
  current_time: string;
  away_duration: string;
  ai_digest: string;
  ranked_insights: StockInsight[];
}

export interface MarketStatus {
  status: 'OPEN' | 'CLOSED';
  current_time_ist: string;
  virtual_market_time: string;
  is_replay_mode: boolean;
  total_intraday_candles: number;
  replay_cursor_index: number;
  message: string;
}

export interface Candle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
