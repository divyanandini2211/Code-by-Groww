import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  TrendingUp, Clock, Sparkles, Activity, Plus, Trash2, 
  Search, CheckCircle2, ChevronRight, Zap, RefreshCw, ArrowLeftRight
} from 'lucide-react';
import { api } from './services/api';
import { Stock, Watchlist, IntelligenceResponse, MarketStatus, Candle } from './types';
import { DetailedChart } from './components/DetailedChart';
import { useMarketWebSocket } from './hooks/useMarketWebSocket';

export function App() {
  // Resizable Panel Widths (like VS Code)
  const [leftWidth, setLeftWidth] = useState(240);
  const [splitRatio, setSplitRatio] = useState(55); // Center vs Right percentage (55% / 45%)
  const [isLayoutSwapped, setIsLayoutSwapped] = useState(false); // Can swap Chart & Table positions!
  
  const isDraggingLeft = useRef(false);
  const isDraggingCenter = useRef(false);

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

  // Client Cache
  const cacheRef = useRef<Record<string, IntelligenceResponse>>({});
  const historyCacheRef = useRef<Record<string, Candle[]>>({});

  // WebSocket Live Stream
  const { marketData, isConnected } = useMarketWebSocket();

  // Initial Load
  useEffect(() => {
    loadInitialData();
  }, []);

  // Watchlist selection: Clear display immediately and show loading indicator
  useEffect(() => {
    if (selectedWatchlistId) {
      setIsSwitching(true);
      setIntelligence(null);
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

  // Draggable splitter handlers
  const onMouseDownLeft = () => { isDraggingLeft.current = true; };
  const onMouseDownCenter = () => { isDraggingCenter.current = true; };

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (isDraggingLeft.current) {
      const newW = Math.max(180, Math.min(450, e.clientX));
      setLeftWidth(newW);
    }
    if (isDraggingCenter.current) {
      const availableWidth = window.innerWidth - leftWidth;
      const mouseOffset = e.clientX - leftWidth;
      const newRatio = Math.max(25, Math.min(75, (mouseOffset / availableWidth) * 100));
      setSplitRatio(newRatio);
    }
  }, [leftWidth]);

  const onMouseUp = useCallback(() => {
    isDraggingLeft.current = false;
    isDraggingCenter.current = false;
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
    cacheRef.current = {};
    loadIntelligence(selectedWatchlistId, sinceMinutes);
  };

  const handleSimulateShock = async (symbol: string, shockPct: number) => {
    await api.simulateAnomaly(symbol, shockPct, 3.5);
    cacheRef.current = {};
    loadIntelligence(selectedWatchlistId, sinceMinutes);
    loadStockHistory(symbol);
  };

  const activeStockInfo = intelligence?.ranked_insights?.find(s => s.symbol === selectedStock) || {
    symbol: selectedStock,
    name: selectedStock,
    sector: 'Equities',
    current_price: candles[candles.length - 1]?.close || 1000,
    price_at_last_seen: candles[0]?.close || 1000,
    pct_change_since_seen: 0,
    volume_surge_ratio: 1.0,
    attention_score: 0.2,
    signals: []
  };

  // RENDER COMPONENT: The Smart Ranked Watchlist Table
  const renderWatchlistTable = () => (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden', minHeight: '380px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: '13px' }}>Ranked Watchlist (Sorted by ML Attention Score)</span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {isSwitching ? 'Evaluating...' : `${intelligence?.ranked_insights?.length || 0} Equities Monitored`}
        </span>
      </div>

      {isSwitching ? (
        <div style={{
          height: '320px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          color: 'var(--text-secondary)'
        }}>
          <RefreshCw size={28} color="var(--groww-green)" className="spinner" />
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Loading Watchlist & Calculating ML Attention Scores...</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Fetching checkpoint deltas & volume surge multipliers</div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', fontSize: '10px', textTransform: 'uppercase' }}>
                <th style={{ padding: '10px 14px' }}>TICKER</th>
                <th style={{ padding: '10px 14px' }}>LTP</th>
                <th style={{ padding: '10px 14px' }}>SINCE LAST SEEN</th>
                <th style={{ padding: '10px 14px' }}>VOLUME</th>
                <th style={{ padding: '10px 14px' }}>ATTENTION</th>
                <th style={{ padding: '10px 14px' }}>SIGNALS</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {intelligence?.ranked_insights?.map((stock) => {
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
      )}
    </div>
  );

  // RENDER COMPONENT: The Detailed Financial Chart & Metric Breakdown
  const renderChartDeepDive = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', height: '100%', overflowY: 'auto' }}>
      
      {/* Active Ticker Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: 'var(--bg-secondary)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
        <div>
          <div style={{ fontSize: '10px', color: 'var(--groww-green)', fontWeight: 700 }}>{activeStockInfo.sector?.toUpperCase() || 'EQUITY'}</div>
          <div style={{ fontSize: '20px', fontWeight: 700 }}>{activeStockInfo.name}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>NSE: {activeStockInfo.symbol}</div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '22px', fontWeight: 700 }}>₹{activeStockInfo.current_price.toFixed(2)}</div>
          <span className={`badge ${activeStockInfo.pct_change_since_seen >= 0 ? 'badge-green' : 'badge-red'}`} style={{ fontSize: '12px' }}>
            {activeStockInfo.pct_change_since_seen >= 0 ? '+' : ''}{activeStockInfo.pct_change_since_seen}%
          </span>
        </div>
      </div>

      {/* Detailed Financial Chart (Candlesticks + Volume Bars + Reference Level) */}
      <DetailedChart
        candles={candles}
        symbol={selectedStock}
        referencePrice={activeStockInfo.price_at_last_seen}
        height={260}
      />

      {/* ML Evaluation Metrics Box */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700 }}>ML ANOMALY EVALUATION MATRIX</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginTop: '4px' }}>
          <div style={{ background: 'var(--bg-card)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Price at Checkpoint</div>
            <div style={{ fontSize: '14px', fontWeight: 700, marginTop: '2px' }}>₹{activeStockInfo.price_at_last_seen.toFixed(2)}</div>
          </div>
          <div style={{ background: 'var(--bg-card)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Volume Surge</div>
            <div style={{ fontSize: '14px', fontWeight: 700, marginTop: '2px', color: activeStockInfo.volume_surge_ratio >= 2 ? 'var(--groww-amber)' : 'inherit' }}>
              {activeStockInfo.volume_surge_ratio}x
            </div>
          </div>
          <div style={{ background: 'var(--bg-card)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Attention Score</div>
            <div style={{ fontSize: '14px', fontWeight: 700, marginTop: '2px', color: 'var(--groww-green)' }}>
              {activeStockInfo.attention_score} / 1.0
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden', background: 'var(--bg-primary)', userSelect: isDraggingLeft.current || isDraggingCenter.current ? 'none' : 'auto' }}>
      
      {/* Top Header Bar */}
      <header style={{
        height: '52px',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 18px',
        background: 'var(--bg-secondary)',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'var(--groww-green)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={16} color="#000" />
            </div>
            <span style={{ fontWeight: 700, fontSize: '16px', letterSpacing: '-0.5px' }}>Groww <span style={{ color: 'var(--groww-green)', fontWeight: 500, fontSize: '12px' }}>Smart Watchlist</span></span>
          </div>

          <div className={`badge ${marketStatus?.status === 'OPEN' ? 'badge-green' : 'badge-amber'}`} style={{ padding: '3px 8px', fontSize: '11px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor', display: 'inline-block' }}></span>
            {marketStatus?.status === 'OPEN' ? 'MARKET OPEN (NSE/BSE)' : 'MARKET CLOSED (Replaying Session)'}
          </div>

          <span style={{ fontSize: '11px', color: isConnected ? 'var(--groww-green)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Activity size={12} /> {isConnected ? 'Live WebSocket Active' : 'Connecting...'}
          </span>
        </div>

        {/* Global Controls & Layout Swapper */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          
          {/* Swap Panels Button */}
          <button
            onClick={() => setIsLayoutSwapped(!isLayoutSwapped)}
            title="Swap Table and Detailed Chart positions"
            style={{
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              padding: '6px 10px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              fontWeight: 600
            }}
          >
            <ArrowLeftRight size={13} color="var(--groww-green)" /> 
            {isLayoutSwapped ? 'Default View' : 'Swap Table & Chart'}
          </button>

          {/* Search Bar */}
          <div style={{ position: 'relative', width: '240px' }}>
            <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '9px' }} />
            <input
              type="text"
              placeholder="Search & add stock..."
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
          <div style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)' }}>
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

          {/* Judge Demo Shock Controls */}
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

        {/* WORKSPACE AREA: (Center + Right, with dynamic swap) */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          
          {/* Section A (Default: Table + Executive Briefing, Swappable: Chart) */}
          <div style={{
            width: `${splitRatio}%`,
            minWidth: '320px',
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px'
          }}>
            {!isLayoutSwapped ? (
              <>
                {/* Executive AI Briefing (Google Gemini) */}
                <div style={{
                  background: 'linear-gradient(135deg, rgba(28,34,48,1) 0%, rgba(22,27,38,1) 100%)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '12px 16px',
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
                        style={{ padding: '2px 6px', fontSize: '11px', height: '24px' }}
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

                {renderWatchlistTable()}
              </>
            ) : (
              renderChartDeepDive()
            )}
          </div>

          {/* DRAGGABLE DIVIDER 2 */}
          <div
            onMouseDown={onMouseDownCenter}
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
            title="Drag to resize panels"
          />

          {/* Section B (Default: Detailed Chart, Swappable: Table + Executive Briefing) */}
          <div style={{
            width: `${100 - splitRatio}%`,
            minWidth: '320px',
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            background: 'var(--bg-secondary)'
          }}>
            {!isLayoutSwapped ? (
              renderChartDeepDive()
            ) : (
              <>
                {/* Executive AI Briefing (Google Gemini) */}
                <div style={{
                  background: 'linear-gradient(135deg, rgba(28,34,48,1) 0%, rgba(22,27,38,1) 100%)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '12px 16px',
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
                        style={{ padding: '2px 6px', fontSize: '11px', height: '24px' }}
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

                {renderWatchlistTable()}
              </>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
export default App;
