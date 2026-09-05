import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  TrendingUp, TrendingDown, Clock, Sparkles, Activity, Plus, Trash2, 
  Search, CheckCircle2, ChevronRight, Zap, RefreshCw, GripVertical
} from 'lucide-react';
import { api } from './services/api';
import { Stock, Watchlist, IntelligenceResponse, MarketStatus, Candle } from './types';
import { MiniChart } from './components/MiniChart';
import { useMarketWebSocket } from './hooks/useMarketWebSocket';

export function App() {
  // Resizable Panel Widths (like VS Code)
  const [leftWidth, setLeftWidth] = useState(250);
  const [rightWidth, setRightWidth] = useState(380);
  const isDraggingLeft = useRef(false);
  const isDraggingRight = useRef(false);

  // State
  const [marketStatus, setMarketStatus] = useState<MarketStatus | null>(null);
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [selectedWatchlistId, setSelectedWatchlistId] = useState<string>('');
  const [intelligence, setIntelligence] = useState<IntelligenceResponse | null>(null);
  const [selectedStock, setSelectedStock] = useState<string>('RELIANCE');
  const [candles, setCandles] = useState<Candle[]>([]);
  
  // Controls & Optimizations
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Stock[]>([]);
  const [sinceMinutes, setSinceMinutes] = useState<number>(45);
  const [isSwitching, setIsSwitching] = useState(false);
  const [newWatchlistName, setNewWatchlistName] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // In-Memory Client Cache to make switching between watchlists INSTANT (<5ms)
  const cacheRef = useRef<Record<string, IntelligenceResponse>>({});
  const historyCacheRef = useRef<Record<string, Candle[]>>({});

  // WebSocket Live Stream
  const { marketData, isConnected } = useMarketWebSocket();

  // Initial Load
  useEffect(() => {
    loadInitialData();
  }, []);

  // Watchlist selection with instant cache preview + background sync
  useEffect(() => {
    if (selectedWatchlistId) {
      const cacheKey = `${selectedWatchlistId}_${sinceMinutes}`;
      if (cacheRef.current[cacheKey]) {
        // Instant render from client cache
        setIntelligence(cacheRef.current[cacheKey]);
      } else {
        setIsSwitching(true);
      }
      loadIntelligence(selectedWatchlistId, sinceMinutes);
    }
  }, [selectedWatchlistId, sinceMinutes]);

  // Stock selection with instant cache preview
  useEffect(() => {
    if (selectedStock) {
      if (historyCacheRef.current[selectedStock]) {
        setCandles(historyCacheRef.current[selectedStock]);
      }
      loadStockHistory(selectedStock);
    }
  }, [selectedStock]);

  // Search debounce
  useEffect(() => {
    if (searchQuery.trim().length >= 2) {
      const timer = setTimeout(() => {
        api.searchStocks(searchQuery).then(setSearchResults);
      }, 150);
      return () => clearTimeout(timer);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  // VS Code style draggable splitter handlers
  const onMouseDownLeft = () => { isDraggingLeft.current = true; };
  const onMouseDownRight = () => { isDraggingRight.current = true; };

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (isDraggingLeft.current) {
      const newW = Math.max(180, Math.min(450, e.clientX));
      setLeftWidth(newW);
    }
    if (isDraggingRight.current) {
      const newW = Math.max(280, Math.min(600, window.innerWidth - e.clientX));
      setRightWidth(newW);
    }
  }, []);

  const onMouseUp = useCallback(() => {
    isDraggingLeft.current = false;
    isDraggingRight.current = false;
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  const loadInitialData = async () => {
    try {
      const status = await api.getMarketStatus();
      setMarketStatus(status);

      const lists = await api.getWatchlists();
      setWatchlists(lists);
      if (lists.length > 0) {
        const defaultW = lists.find((l: Watchlist) => l.name.includes('Flagship')) || lists[0];
        setSelectedWatchlistId(defaultW.id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadIntelligence = async (watchlistId: string, mins: number) => {
    try {
      const res = await api.getWatchlistIntelligence(watchlistId, mins);
      setIntelligence(res);
      // Cache response
      cacheRef.current[`${watchlistId}_${mins}`] = res;
    } catch (e) {
      console.error(e);
    } finally {
      setIsSwitching(false);
    }
  };

  const loadStockHistory = async (symbol: string) => {
    try {
      const hist = await api.getStockHistory(symbol, 60);
      setCandles(hist);
      historyCacheRef.current[symbol] = hist;
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
    delete cacheRef.current[`${selectedWatchlistId}_${sinceMinutes}`];
    loadIntelligence(selectedWatchlistId, sinceMinutes);
  };

  const handleRemoveStock = async (symbol: string) => {
    if (!selectedWatchlistId) return;
    await api.removeStockFromWatchlist(selectedWatchlistId, symbol);
    delete cacheRef.current[`${selectedWatchlistId}_${sinceMinutes}`];
    loadIntelligence(selectedWatchlistId, sinceMinutes);
  };

  const handleSaveCheckpoint = async () => {
    await api.saveCheckpoint('divya_user');
    cacheRef.current = {}; // Invalidate old checkpoints
    loadIntelligence(selectedWatchlistId, sinceMinutes);
  };

  const handleSimulateShock = async (symbol: string, shockPct: number) => {
    await api.simulateAnomaly(symbol, shockPct, 3.5);
    cacheRef.current = {};
    loadIntelligence(selectedWatchlistId, sinceMinutes);
    loadStockHistory(symbol);
  };

  const activeStockInfo = intelligence?.ranked_insights.find(s => s.symbol === selectedStock);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden', background: 'var(--bg-primary)', userSelect: isDraggingLeft.current || isDraggingRight.current ? 'none' : 'auto' }}>
      
      {/* Top Header Bar */}
      <header style={{
        height: '54px',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        background: 'var(--bg-secondary)',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'var(--groww-green)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={16} color="#000" />
            </div>
            <span style={{ fontWeight: 700, fontSize: '17px', letterSpacing: '-0.5px' }}>Groww <span style={{ color: 'var(--groww-green)', fontWeight: 500, fontSize: '13px' }}>Smart Watchlist</span></span>
          </div>

          <div className={`badge ${marketStatus?.status === 'OPEN' ? 'badge-green' : 'badge-amber'}`} style={{ padding: '3px 8px', fontSize: '11px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor', display: 'inline-block' }}></span>
            {marketStatus?.status === 'OPEN' ? 'MARKET OPEN (NSE/BSE)' : 'MARKET CLOSED (Replaying Session)'}
          </div>

          <span style={{ fontSize: '11px', color: isConnected ? 'var(--groww-green)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Activity size={12} /> {isConnected ? 'Live Stream 3s' : 'Connecting...'}
          </span>
        </div>

        {/* Global Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ position: 'relative', width: '260px' }}>
            <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '9px' }} />
            <input
              type="text"
              placeholder="Search & add stock (Ctrl+K)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', paddingLeft: '30px', paddingRight: '10px', height: '32px' }}
            />
            {searchResults.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '38px',
                left: 0,
                right: 0,
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                zIndex: 50,
                maxHeight: '220px',
                overflowY: 'auto'
              }}>
                {searchResults.map((s) => (
                  <div
                    key={s.symbol}
                    onClick={() => handleAddStock(s.symbol)}
                    style={{
                      padding: '8px 12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--border-color)'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '12px' }}>{s.symbol}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{s.name}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontWeight: 600, fontSize: '12px' }}>₹{s.current_price}</span>
                      <Plus size={14} color="var(--groww-green)" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleSaveCheckpoint}
            title="Persists current market cursor to Neon DB"
            style={{
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              padding: '6px 12px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              fontWeight: 600
            }}
          >
            <CheckCircle2 size={13} color="var(--groww-green)" /> Mark Checkpoint
          </button>
        </div>
      </header>

      {/* Main Resizable Splitter Layout (VS Code Style) */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        
        {/* LEFT PANEL: Watchlists */}
        <aside style={{
          width: `${leftWidth}px`,
          minWidth: '180px',
          maxWidth: '450px',
          background: 'var(--bg-secondary)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          flexShrink: 0
        }}>
          <div style={{ padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.5px' }}>WATCHLISTS</span>
            <button
              onClick={() => setShowAddModal(!showAddModal)}
              style={{ background: 'transparent', color: 'var(--groww-green)', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '2px', fontWeight: 600 }}
            >
              <Plus size={13} /> New
            </button>
          </div>

          {showAddModal && (
            <div style={{ padding: '10px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <input
                type="text"
                placeholder="Watchlist name..."
                value={newWatchlistName}
                onChange={(e) => setNewWatchlistName(e.target.value)}
                style={{ height: '28px', fontSize: '11px' }}
              />
              <button
                onClick={handleCreateWatchlist}
                style={{ background: 'var(--groww-green)', color: '#000', fontWeight: 600, padding: '4px', borderRadius: '4px', fontSize: '11px' }}
              >
                Add Watchlist
              </button>
            </div>
          )}

          {/* Watchlists List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {watchlists.map((w) => {
              const isSelected = selectedWatchlistId === w.id;
              return (
                <div
                  key={w.id}
                  onClick={() => setSelectedWatchlistId(w.id)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    background: isSelected ? 'var(--bg-hover)' : 'transparent',
                    border: isSelected ? '1px solid var(--border-color)' : '1px solid transparent',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'background 0.1s ease'
                  }}
                >
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <div style={{ fontWeight: 600, fontSize: '12px', color: isSelected ? 'var(--groww-green)' : 'var(--text-primary)' }}>{w.name}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{w.description || 'Custom List'}</div>
                  </div>
                  {isSelected && <ChevronRight size={13} color="var(--groww-green)" />}
                </div>
              );
            })}
          </div>

          {/* Judge Demo Shock Box */}
          <div style={{ padding: '12px', background: 'var(--bg-card)', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 700, color: 'var(--groww-amber)' }}>
              <Zap size={13} /> DEMO CONTROLS
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Shock {selectedStock} to test ML Engine:</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <button
                onClick={() => handleSimulateShock(selectedStock, 2.8)}
                style={{ background: 'var(--groww-green-bg)', color: 'var(--groww-green)', border: '1px solid rgba(0,208,156,0.3)', padding: '5px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}
              >
                +2.8% Spike
              </button>
              <button
                onClick={() => handleSimulateShock(selectedStock, -3.2)}
                style={{ background: 'var(--groww-red-bg)', color: 'var(--groww-red)', border: '1px solid rgba(235,91,60,0.3)', padding: '5px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}
              >
                -3.2% Dump
              </button>
            </div>
          </div>
        </aside>

        {/* DRAGGABLE DIVIDER 1 */}
        <div
          onMouseDown={onMouseDownLeft}
          style={{
            width: '5px',
            background: 'var(--border-color)',
            cursor: 'col-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            transition: 'background 0.2s',
            opacity: 0.6
          }}
          title="Drag to resize panel"
        />

        {/* CENTER PANEL: Ranked Watchlist Table & Executive Briefing */}
        <section style={{ flex: 1, overflowY: 'auto', padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: '16px', minWidth: '400px' }}>
          
          {/* Executive AI Briefing (Google Gemini) */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(28,34,48,1) 0%, rgba(22,27,38,1) 100%)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '14px 18px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--groww-green)', fontWeight: 700, fontSize: '12px' }}>
                <Sparkles size={14} /> WHAT CHANGED SINCE YOU LAST CHECKED
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={13} color="var(--text-muted)" />
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Away window:</span>
                <select
                  value={sinceMinutes}
                  onChange={(e) => setSinceMinutes(Number(e.target.value))}
                  style={{ padding: '2px 6px', fontSize: '11px', height: '26px' }}
                >
                  <option value={15}>15 mins</option>
                  <option value={30}>30 mins</option>
                  <option value={45}>45 mins</option>
                  <option value={60}>1 hour</option>
                  <option value={120}>2 hours</option>
                </select>
              </div>
            </div>

            <p style={{ fontSize: '13px', lineHeight: '1.5', color: 'var(--text-primary)', margin: 0 }}>
              {intelligence?.ai_digest || 'Evaluating multi-variate statistical anomalies and calculating attention scores...'}
            </p>
          </div>

          {/* Ranked Smart Watchlist Table */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: '13px' }}>Ranked Watchlist (Sorted by ML Attention Score)</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {isSwitching ? 'Syncing...' : `${intelligence?.ranked_insights.length || 0} Equities Monitored`}
              </span>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', fontSize: '10px', textTransform: 'uppercase' }}>
                  <th style={{ padding: '10px 14px' }}>TICKER</th>
                  <th style={{ padding: '10px 14px' }}>LTP</th>
                  <th style={{ padding: '10px 14px' }}>SINCE LAST SEEN</th>
                  <th style={{ padding: '10px 14px' }}>VOLUME MULTIPLIER</th>
                  <th style={{ padding: '10px 14px' }}>ATTENTION PRIORITY</th>
                  <th style={{ padding: '10px 14px' }}>SIGNALS</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>ACTION</th>
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
                        transition: 'background 0.08s ease'
                      }}
                    >
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 600, fontSize: '12px' }}>{stock.symbol}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{stock.name}</div>
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 600, fontSize: '12px' }}>
                        ₹{stock.current_price.toFixed(2)}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span className={`badge ${isUp ? 'badge-green' : 'badge-red'}`}>
                          {isUp ? '+' : ''}{stock.pct_change_since_seen}%
                        </span>
                        <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '1px' }}>
                          from ₹{stock.price_at_last_seen.toFixed(2)}
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontWeight: 600, color: stock.volume_surge_ratio >= 2.0 ? 'var(--groww-amber)' : 'var(--text-secondary)' }}>
                          {stock.volume_surge_ratio}x
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ width: '36px', height: '5px', background: 'var(--border-color)', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{
                              width: `${Math.min(stock.attention_score * 100, 100)}%`,
                              height: '100%',
                              background: stock.attention_score > 0.6 ? 'var(--groww-amber)' : 'var(--groww-green)'
                            }}></div>
                          </div>
                          <span style={{ fontWeight: 700, fontSize: '11px' }}>{stock.attention_score}</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                          {stock.signals.length === 0 ? (
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Normal</span>
                          ) : (
                            stock.signals.map((sig) => (
                              <span key={sig} className="badge badge-blue" style={{ fontSize: '9px', padding: '1px 5px' }}>
                                {sig.replace('_', ' ')}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveStock(stock.symbol);
                          }}
                          style={{ background: 'transparent', color: 'var(--text-muted)', padding: '2px' }}
                          title="Remove from watchlist"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* DRAGGABLE DIVIDER 2 */}
        <div
          onMouseDown={onMouseDownRight}
          style={{
            width: '5px',
            background: 'var(--border-color)',
            cursor: 'col-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            transition: 'background 0.2s',
            opacity: 0.6
          }}
          title="Drag to resize panel"
        />

        {/* RIGHT PANEL: Deep Dive & Live Intraday Chart */}
        <aside style={{
          width: `${rightWidth}px`,
          minWidth: '280px',
          maxWidth: '600px',
          background: 'var(--bg-secondary)',
          display: 'flex',
          flexDirection: 'column',
          padding: '16px',
          gap: '14px',
          overflowY: 'auto',
          flexShrink: 0
        }}>
          {activeStockInfo ? (
            <>
              <div>
                <div style={{ fontSize: '10px', color: 'var(--groww-green)', fontWeight: 700 }}>{activeStockInfo.sector.toUpperCase()}</div>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>{activeStockInfo.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>NSE: {activeStockInfo.symbol}</div>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span style={{ fontSize: '22px', fontWeight: 700 }}>₹{activeStockInfo.current_price.toFixed(2)}</span>
                <span className={`badge ${activeStockInfo.pct_change_since_seen >= 0 ? 'badge-green' : 'badge-red'}`}>
                  {activeStockInfo.pct_change_since_seen >= 0 ? '+' : ''}{activeStockInfo.pct_change_since_seen}%
                </span>
              </div>

              {/* Real 1-minute Intraday Chart */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '12px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>1-MIN INTRADAY CANDLE TIMELINE</div>
                <MiniChart candles={candles} height={150} />
              </div>

              {/* Anomaly & Attention Breakdown */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700 }}>ML ANOMALY EVALUATION</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Price at Checkpoint:</span>
                  <span style={{ fontWeight: 600 }}>₹{activeStockInfo.price_at_last_seen.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Volume Surge:</span>
                  <span style={{ fontWeight: 600 }}>{activeStockInfo.volume_surge_ratio}x normal</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Attention Score:</span>
                  <span style={{ fontWeight: 700, color: 'var(--groww-green)' }}>{activeStockInfo.attention_score} / 1.0</span>
                </div>
              </div>
            </>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center', marginTop: '40px' }}>
              Select a stock from the watchlist to inspect intraday chart and metrics.
            </div>
          )}
        </aside>

      </div>
    </div>
  );
}
export default App;
