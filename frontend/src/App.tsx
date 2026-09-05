import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, TrendingDown, Clock, Sparkles, Activity, Plus, Trash2, 
  Search, ShieldAlert, Play, CheckCircle2, ChevronRight, Zap, RefreshCw
} from 'lucide-react';
import { api } from './services/api';
import { Stock, Watchlist, IntelligenceResponse, MarketStatus, Candle } from './types';
import { MiniChart } from './components/MiniChart';
import { useMarketWebSocket } from './hooks/useMarketWebSocket';

export function App() {
  // State
  const [marketStatus, setMarketStatus] = useState<MarketStatus | null>(null);
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [selectedWatchlistId, setSelectedWatchlistId] = useState<string>('');
  const [intelligence, setIntelligence] = useState<IntelligenceResponse | null>(null);
  const [selectedStock, setSelectedStock] = useState<string>('RELIANCE');
  const [candles, setCandles] = useState<Candle[]>([]);
  
  // Controls
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Stock[]>([]);
  const [sinceMinutes, setSinceMinutes] = useState<number>(45);
  const [isLoading, setIsLoading] = useState(false);
  const [newWatchlistName, setNewWatchlistName] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // WebSocket Live Stream
  const { marketData, isConnected } = useMarketWebSocket();

  // Initial Load
  useEffect(() => {
    loadInitialData();
  }, []);

  // When selected watchlist or duration changes
  useEffect(() => {
    if (selectedWatchlistId) {
      loadIntelligence(selectedWatchlistId, sinceMinutes);
    }
  }, [selectedWatchlistId, sinceMinutes]);

  // When selected stock changes
  useEffect(() => {
    if (selectedStock) {
      loadStockHistory(selectedStock);
    }
  }, [selectedStock]);

  // Search debounce
  useEffect(() => {
    if (searchQuery.trim().length >= 2) {
      api.searchStocks(searchQuery).then(setSearchResults);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  const loadInitialData = async () => {
    setIsLoading(true);
    try {
      const status = await api.getMarketStatus();
      setMarketStatus(status);

      const lists = await api.getWatchlists();
      setWatchlists(lists);
      if (lists.length > 0) {
        // Select Flagship or first
        const defaultW = lists.find((l: Watchlist) => l.name.includes('Flagship')) || lists[0];
        setSelectedWatchlistId(defaultW.id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const loadIntelligence = async (watchlistId: string, mins: number) => {
    try {
      const res = await api.getWatchlistIntelligence(watchlistId, mins);
      setIntelligence(res);
    } catch (e) {
      console.error(e);
    }
  };

  const loadStockHistory = async (symbol: string) => {
    try {
      const hist = await api.getStockHistory(symbol, 60);
      setCandles(hist);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateWatchlist = async () => {
    if (!newWatchlistName.trim()) return;
    const res = await api.createWatchlist(newWatchlistName);
    setWatchlists([res, ...watchlists]);
    setSelectedWatchlistId(res.id);
    setNewWatchlistName('');
    setShowAddModal(false);
  };

  const handleAddStock = async (symbol: string) => {
    if (!selectedWatchlistId) return;
    await api.addStockToWatchlist(selectedWatchlistId, symbol);
    setSearchQuery('');
    setSearchResults([]);
    loadIntelligence(selectedWatchlistId, sinceMinutes);
  };

  const handleRemoveStock = async (symbol: string) => {
    if (!selectedWatchlistId) return;
    await api.removeStockFromWatchlist(selectedWatchlistId, symbol);
    loadIntelligence(selectedWatchlistId, sinceMinutes);
  };

  const handleSaveCheckpoint = async () => {
    await api.saveCheckpoint('divya_user');
    loadIntelligence(selectedWatchlistId, sinceMinutes);
  };

  const handleSimulateShock = async (symbol: string, shockPct: number) => {
    await api.simulateAnomaly(symbol, shockPct, 3.5);
    loadIntelligence(selectedWatchlistId, sinceMinutes);
    loadStockHistory(symbol);
  };

  const activeStockInfo = intelligence?.ranked_insights.find(s => s.symbol === selectedStock);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {/* Top Header Bar */}
      <header style={{
        height: '60px',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        background: 'var(--bg-secondary)',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'var(--groww-green)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={18} color="#000" />
            </div>
            <span style={{ fontWeight: 700, fontSize: '18px', letterSpacing: '-0.5px' }}>Groww <span style={{ color: 'var(--groww-green)', fontWeight: 500, fontSize: '14px' }}>Smart Watchlist</span></span>
          </div>

          {/* Market Status Pill */}
          <div className={`badge ${marketStatus?.status === 'OPEN' ? 'badge-green' : 'badge-amber'}`} style={{ padding: '4px 10px', fontSize: '12px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'currentColor', display: 'inline-block' }}></span>
            {marketStatus?.status === 'OPEN' ? 'MARKET OPEN (NSE/BSE)' : 'MARKET CLOSED (Replaying Session)'}
          </div>

          {/* WebSocket Status */}
          <span style={{ fontSize: '11px', color: isConnected ? 'var(--groww-green)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Activity size={12} /> {isConnected ? 'Live Stream Active' : 'Connecting...'}
          </span>
        </div>

        {/* Global Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ position: 'relative', width: '280px' }}>
            <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '10px' }} />
            <input
              type="text"
              placeholder="Search stocks to add (e.g. TCS, HDFC)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', paddingLeft: '32px' }}
            />
            {searchResults.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '40px',
                left: 0,
                right: 0,
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                zIndex: 20,
                maxHeight: '220px',
                overflowY: 'auto'
              }}>
                {searchResults.map((s) => (
                  <div
                    key={s.symbol}
                    onClick={() => handleAddStock(s.symbol)}
                    style={{
                      padding: '10px 14px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--border-color)'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '13px' }}>{s.symbol}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{s.name} • {s.sector}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600, fontSize: '13px' }}>₹{s.current_price}</span>
                      <Plus size={16} color="var(--groww-green)" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleSaveCheckpoint}
            title="Saves current state to Neon DB so you can return later and see changes"
            style={{
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              padding: '8px 14px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: 600
            }}
          >
            <CheckCircle2 size={14} color="var(--groww-green)" /> Mark Checkpoint
          </button>
        </div>
      </header>

      {/* Main Content Layout */}
      <main style={{ display: 'grid', gridTemplateColumns: '260px 1fr 380px', flex: 1, height: 'calc(100vh - 60px)' }}>
        
        {/* LEFT PANEL: Watchlist Navigation */}
        <aside style={{ borderRight: '1px solid var(--border-color)', background: 'var(--bg-secondary)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.5px' }}>YOUR WATCHLISTS</span>
            <button
              onClick={() => setShowAddModal(!showAddModal)}
              style={{ background: 'transparent', color: 'var(--groww-green)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <Plus size={14} /> New
            </button>
          </div>

          {showAddModal && (
            <div style={{ background: 'var(--bg-card)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <input
                type="text"
                placeholder="Watchlist name..."
                value={newWatchlistName}
                onChange={(e) => setNewWatchlistName(e.target.value)}
              />
              <button
                onClick={handleCreateWatchlist}
                style={{ background: 'var(--groww-green)', color: '#000', fontWeight: 600, padding: '6px', borderRadius: '4px', fontSize: '12px' }}
              >
                Create
              </button>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto' }}>
            {watchlists.map((w) => (
              <div
                key={w.id}
                onClick={() => setSelectedWatchlistId(w.id)}
                style={{
                  padding: '10px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  background: selectedWatchlistId === w.id ? 'var(--bg-hover)' : 'transparent',
                  border: selectedWatchlistId === w.id ? '1px solid var(--border-color)' : '1px solid transparent',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: selectedWatchlistId === w.id ? 'var(--groww-green)' : 'var(--text-primary)' }}>{w.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{w.description || 'Custom list'}</div>
                </div>
                {selectedWatchlistId === w.id && <ChevronRight size={14} color="var(--groww-green)" />}
              </div>
            ))}
          </div>

          {/* Hackathon Judge Interactive Control Sandbox */}
          <div style={{ marginTop: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: 'var(--groww-amber)' }}>
              <Zap size={14} /> JUDGE DEMO CONTROLS
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Simulate price shocks & breakouts to test the ML anomaly engine live:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <button
                onClick={() => handleSimulateShock(selectedStock, 2.8)}
                style={{ background: 'var(--groww-green-bg)', color: 'var(--groww-green)', border: '1px solid rgba(0,208,156,0.3)', padding: '6px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}
              >
                +2.8% Spike
              </button>
              <button
                onClick={() => handleSimulateShock(selectedStock, -3.2)}
                style={{ background: 'var(--groww-red-bg)', color: 'var(--groww-red)', border: '1px solid rgba(235,91,60,0.3)', padding: '6px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}
              >
                -3.2% Dump
              </button>
            </div>
          </div>
        </aside>

        {/* CENTER PANEL: Smart Watchlist & Intelligence Engine */}
        <section style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* AI Executive Briefing Card (Gemini) */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(28,34,48,1) 0%, rgba(22,27,38,1) 100%)',
            border: '1px solid var(--border-color)',
            borderRadius: '10px',
            padding: '18px 20px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--groww-green)', fontWeight: 700, fontSize: '13px' }}>
                <Sparkles size={16} /> WHAT CHANGED SINCE YOU LAST CHECKED
              </div>
              
              {/* Simulation Timeframe Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={14} color="var(--text-muted)" />
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Away window:</span>
                <select
                  value={sinceMinutes}
                  onChange={(e) => setSinceMinutes(Number(e.target.value))}
                  style={{ padding: '4px 8px', fontSize: '12px' }}
                >
                  <option value={15}>Last 15 mins</option>
                  <option value={30}>Last 30 mins</option>
                  <option value={45}>Last 45 mins</option>
                  <option value={60}>Last 1 hour</option>
                  <option value={120}>Last 2 hours</option>
                </select>
              </div>
            </div>

            <p style={{ fontSize: '14px', lineHeight: '1.6', color: 'var(--text-primary)', margin: 0 }}>
              {intelligence?.ai_digest || 'Analyzing market movements and evaluating ML attention scores...'}
            </p>
          </div>

          {/* Smart Watchlist Table */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: '14px' }}>Ranked Watchlist (Sorted by ML Attention Priority)</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{intelligence?.ranked_insights.length || 0} Equities Monitored</span>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', fontSize: '11px' }}>
                  <th style={{ padding: '12px 16px' }}>COMPANY</th>
                  <th style={{ padding: '12px 16px' }}>LTP</th>
                  <th style={{ padding: '12px 16px' }}>SINCE LAST SEEN</th>
                  <th style={{ padding: '12px 16px' }}>VOLUME SURGE</th>
                  <th style={{ padding: '12px 16px' }}>ATTENTION SCORE</th>
                  <th style={{ padding: '12px 16px' }}>SIGNALS</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {intelligence?.ranked_insights.map((stock) => {
                  const isSelected = selectedStock === stock.symbol;
                  const isUp = stock.pct_change_since_seen >= 0;

                  return (
                    <tr
                      key={stock.symbol}
                      onClick={() => setSelectedStock(stock.symbol)}
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        cursor: 'pointer',
                        background: isSelected ? 'var(--bg-hover)' : 'transparent',
                        transition: 'background 0.15s ease'
                      }}
                    >
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 600 }}>{stock.symbol}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{stock.name}</div>
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                        ₹{stock.current_price.toFixed(2)}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span className={`badge ${isUp ? 'badge-green' : 'badge-red'}`}>
                          {isUp ? '+' : ''}{stock.pct_change_since_seen}%
                        </span>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          from ₹{stock.price_at_last_seen.toFixed(2)}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontWeight: 600, color: stock.volume_surge_ratio >= 2.0 ? 'var(--groww-amber)' : 'var(--text-secondary)' }}>
                          {stock.volume_surge_ratio}x
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '40px', height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{
                              width: `${Math.min(stock.attention_score * 100, 100)}%`,
                              height: '100%',
                              background: stock.attention_score > 0.6 ? 'var(--groww-amber)' : 'var(--groww-green)'
                            }}></div>
                          </div>
                          <span style={{ fontWeight: 700, fontSize: '12px' }}>{stock.attention_score}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {stock.signals.length === 0 ? (
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Quiet</span>
                          ) : (
                            stock.signals.map((sig) => (
                              <span key={sig} className="badge badge-blue">
                                {sig.replace('_', ' ')}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveStock(stock.symbol);
                          }}
                          style={{ background: 'transparent', color: 'var(--text-muted)', padding: '4px' }}
                          title="Remove from watchlist"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* RIGHT PANEL: Deep Dive & Live Intraday Chart */}
        <aside style={{ borderLeft: '1px solid var(--border-color)', background: 'var(--bg-secondary)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {activeStockInfo ? (
            <>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--groww-green)', fontWeight: 700, letterSpacing: '0.5px' }}>{activeStockInfo.sector.toUpperCase()}</div>
                <div style={{ fontSize: '20px', fontWeight: 700 }}>{activeStockInfo.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>NSE: {activeStockInfo.symbol}</div>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                <span style={{ fontSize: '24px', fontWeight: 700 }}>₹{activeStockInfo.current_price.toFixed(2)}</span>
                <span className={`badge ${activeStockInfo.pct_change_since_seen >= 0 ? 'badge-green' : 'badge-red'}`} style={{ fontSize: '13px' }}>
                  {activeStockInfo.pct_change_since_seen >= 0 ? '+' : ''}{activeStockInfo.pct_change_since_seen}%
                </span>
              </div>

              {/* Real 1-minute Intraday Chart */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '14px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px' }}>INTRADAY CANDLE TIMELINE (1-MIN BARS)</div>
                <MiniChart candles={candles} height={160} />
              </div>

              {/* Anomaly & Attention Breakdown */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700 }}>ML ENGINE EVALUATION</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Price at Checkpoint:</span>
                  <span style={{ fontWeight: 600 }}>₹{activeStockInfo.price_at_last_seen.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Volume Surge Multiplier:</span>
                  <span style={{ fontWeight: 600 }}>{activeStockInfo.volume_surge_ratio}x typical</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Attention Score (Priority):</span>
                  <span style={{ fontWeight: 700, color: 'var(--groww-green)' }}>{activeStockInfo.attention_score} / 1.0</span>
                </div>
              </div>
            </>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', marginTop: '40px' }}>
              Select a stock from the watchlist to view its intraday chart and ML breakdown.
            </div>
          )}
        </aside>

      </main>
    </div>
  );
}
export default App;
