import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  TrendingUp, Clock, Sparkles, Activity, Plus, Trash2, 
  Search, CheckCircle2, ChevronRight, Zap, RefreshCw,
  PanelLeftClose, PanelLeftOpen, List, User as UserIcon, LogIn, LogOut, ShieldCheck,
  Gauge, FastForward, Play, AlertCircle
} from 'lucide-react';
import { api } from './services/api';
import { Stock, Watchlist, IntelligenceResponse, MarketStatus, Candle, User } from './types';
import { DetailedChart } from './components/DetailedChart';
import { useMarketWebSocket } from './hooks/useMarketWebSocket';

export function App() {
  // Resizable Panel Widths (like VS Code) & Collapsible Sidebar
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [leftWidth, setLeftWidth] = useState(210);
  const [splitRatio, setSplitRatio] = useState(50); // Balanced 50/50 split
  
  const isDraggingLeft = useRef(false);
  const isDraggingCenter = useRef(false);

  // User Session & Authentication State (Connected to Neon DB)
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [priceFlashMap, setPriceFlashMap] = useState<Record<string, 'up' | 'down'>>({});

  // Market Closed Simulation & Speed Multiplier (ML safe limit: 0.5x to 10x)
  const [showSimPromptModal, setShowSimPromptModal] = useState(false);
  const [simSpeed, setSimSpeed] = useState<number>(1.0);
  const [simDate, setSimDate] = useState<string>('Sep 04, 2026');

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

  // Handle Real-Time Live WebSocket Market Updates
  useEffect(() => {
    if (!marketData || !marketData.stocks) return;

    // 1. Update Market Status
    if (marketData.status) {
      setMarketStatus(prev => prev ? { ...prev, status: marketData.status } : null);
    }

    // 2. Track Price Changes & Flash Colors
    const newFlashes: Record<string, 'up' | 'down'> = {};
    marketData.stocks.forEach((tick: { symbol: string; current_price: number }) => {
      const existing = intelligence?.ranked_insights?.find(s => s.symbol === tick.symbol);
      if (existing && existing.current_price !== tick.current_price) {
        newFlashes[tick.symbol] = tick.current_price > existing.current_price ? 'up' : 'down';
      }
    });

    if (Object.keys(newFlashes).length > 0) {
      setPriceFlashMap(prev => ({ ...prev, ...newFlashes }));
      setTimeout(() => {
        setPriceFlashMap({});
      }, 900);
    }

    // 3. Live Update Table Rows without jitter
    setIntelligence(prev => {
      if (!prev || !prev.ranked_insights) return prev;
      const updated = prev.ranked_insights.map(item => {
        const live = marketData.stocks.find((s: { symbol: string; current_price: number }) => s.symbol === item.symbol);
        if (!live) return item;
        const newPct = item.price_at_last_seen > 0
          ? Number((((live.current_price - item.price_at_last_seen) / item.price_at_last_seen) * 100).toFixed(2))
          : item.pct_change_since_seen;
        return {
          ...item,
          current_price: live.current_price,
          pct_change_since_seen: newPct
        };
      });
      return { ...prev, ranked_insights: updated };
    });

    // 4. Live Update Active Stock Candle & Chart Action
    const activeTick = marketData.stocks.find((s: { symbol: string; current_price: number }) => s.symbol === selectedStock);
    if (activeTick && candles.length > 0) {
      setCandles(prev => {
        if (prev.length === 0) return prev;
        const lastCandle = prev[prev.length - 1];
        const newPrice = activeTick.current_price;

        // Extract HH:MM from marketData.virtual_time (IST)
        let tickHHMM = '';
        if (marketData.virtual_time) {
          try {
            const d = new Date(marketData.virtual_time);
            if (!isNaN(d.getTime())) {
              tickHHMM = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
            }
          } catch (_) {}
        }

        // When virtual time advances to a new minute, start a new candle naturally
        if (tickHHMM && lastCandle.timestamp && tickHHMM !== lastCandle.timestamp) {
          const newCandle = {
            timestamp: tickHHMM,
            open: lastCandle.close,
            high: Math.max(lastCandle.close, newPrice),
            low: Math.min(lastCandle.close, newPrice),
            close: newPrice,
            volume: Math.round(300 + Math.random() * 600)
          };
          return [...prev.slice(-59), newCandle];
        }

        // Live intra-minute updates to the active candle
        const updatedLast = {
          ...lastCandle,
          close: newPrice,
          high: Math.max(lastCandle.high, newPrice),
          low: Math.min(lastCandle.low, newPrice)
        };
        return [...prev.slice(0, -1), updatedLast];
      });
    }
  }, [marketData, selectedStock]);

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
      // 1. Check logged-in user profile
      const user = await api.getCurrentUser();
      if (user) {
        setCurrentUser(user);
      }

      const status = await api.getMarketStatus();
      setMarketStatus(status);
      if (status.replay_date) {
        setSimDate(status.replay_date);
      }
      if (status.simulation_speed) {
        setSimSpeed(status.simulation_speed);
      }

      // If user is already logged in or logs in, and market is closed, offer simulation prompt
      if (status.status === 'CLOSED') {
        const hasPrompted = sessionStorage.getItem('groww_sim_prompt_shown');
        if (!hasPrompted && user) {
          setShowSimPromptModal(true);
          sessionStorage.setItem('groww_sim_prompt_shown', 'true');
        }
      }

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

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setIsAuthLoading(true);

    try {
      let res;
      if (authMode === 'REGISTER') {
        res = await api.register(authName, authEmail, authPassword);
      } else {
        res = await api.login(authEmail, authPassword);
      }

      if (res.token && res.user) {
        localStorage.setItem('groww_auth_token', res.token);
        localStorage.setItem('groww_user_profile', JSON.stringify(res.user));
        setCurrentUser(res.user);
        setShowAuthModal(false);
        setAuthPassword('');

        // If market is down when user logs in, show prompt immediately!
        if (marketStatus?.status === 'CLOSED') {
          setShowSimPromptModal(true);
        }

        // Refresh watchlists for user
        const userLists = await api.getWatchlists();
        setWatchlists(userLists);
        cacheRef.current = {};
        if (selectedWatchlistId) {
          loadIntelligence(selectedWatchlistId, sinceMinutes);
        }
      } else {
        setAuthError(res.detail || 'Authentication failed. Check credentials.');
      }
    } catch (err: any) {
      setAuthError(err.message || 'Network error during authentication');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleSpeedChange = async (newSpeed: number) => {
    setSimSpeed(newSpeed);
    try {
      await api.setSimulationSpeed(newSpeed);
    } catch (e) {
      console.error('Speed change error:', e);
    }
  };

  const handleLogout = async () => {
    await api.logout();
    setCurrentUser(null);
    cacheRef.current = {};
    const lists = await api.getWatchlists();
    setWatchlists(lists);
    if (selectedWatchlistId) {
      loadIntelligence(selectedWatchlistId, sinceMinutes);
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
    const trimmed = newWatchlistName.trim();
    if (!trimmed) return;
    try {
      const res = await api.createWatchlist(trimmed);
      if (res && res.id) {
        setWatchlists(prev => [res, ...prev]);
        setSelectedWatchlistId(res.id);
        setNewWatchlistName('');
        setShowAddModal(false);
      } else {
        alert(res?.detail || 'Failed to create watchlist. Please try again.');
      }
    } catch (err: any) {
      console.error('Error creating watchlist:', err);
      alert('Error creating watchlist: ' + (err.message || 'Network error'));
    }
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
    const res = await api.saveCheckpoint(currentUser?.id || 'default_user');
    if (currentUser && res.last_visited_at) {
      setCurrentUser({ ...currentUser, last_checkpoint: res.last_visited_at });
    }
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
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: '12px' }}>Ranked Watchlist (Sorted by ML Attention Score)</span>
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
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Loading Watchlist & Calculating ML Attention Scores...</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Fetching checkpoint deltas & volume surge multipliers</div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '11px' }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', fontSize: '10px', textTransform: 'uppercase' }}>
                <th style={{ padding: '8px 10px' }}>TICKER</th>
                <th style={{ padding: '8px 10px' }}>LTP</th>
                <th style={{ padding: '8px 10px' }}>SINCE LAST SEEN</th>
                <th style={{ padding: '8px 10px' }}>VOLUME</th>
                <th style={{ padding: '8px 10px' }}>ATTENTION</th>
                <th style={{ padding: '8px 10px' }}>SIGNALS</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {intelligence?.ranked_insights?.map((stock) => {
                const isSelected = selectedStock === stock.symbol;
                const isUp = stock.pct_change_since_seen >= 0;

                const isFlashUp = priceFlashMap[stock.symbol] === 'up';
                const isFlashDown = priceFlashMap[stock.symbol] === 'down';

                return (
                  <tr
                    key={stock.symbol}
                    onClick={() => setSelectedStock(stock.symbol)}
                    className={isFlashUp ? 'flash-up' : isFlashDown ? 'flash-down' : ''}
                    style={{
                      borderBottom: '1px solid var(--border-color)',
                      cursor: 'pointer',
                      background: isSelected ? 'var(--bg-hover)' : 'transparent',
                      transition: 'background 0.2s ease'
                    }}
                  >
                    <td style={{ padding: '7px 10px' }}>
                      <div style={{ fontWeight: 600, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {stock.symbol}
                        {isFlashUp && <span style={{ color: 'var(--groww-green)', fontSize: '10px' }}>▲</span>}
                        {isFlashDown && <span style={{ color: 'var(--groww-red)', fontSize: '10px' }}>▼</span>}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{stock.name}</div>
                    </td>
                    <td style={{ padding: '7px 10px', fontWeight: 600, fontSize: '12px', color: isFlashUp ? 'var(--groww-green)' : isFlashDown ? 'var(--groww-red)' : 'inherit' }}>
                      ₹{stock.current_price.toFixed(2)}
                    </td>
                    <td style={{ padding: '7px 10px' }}>
                      <span className={`badge ${isUp ? 'badge-green' : 'badge-red'}`} style={{ padding: '1px 6px', fontSize: '10px' }}>
                        {isUp ? '+' : ''}{stock.pct_change_since_seen}%
                      </span>
                      <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '1px' }}>
                        from ₹{stock.price_at_last_seen.toFixed(2)}
                      </div>
                    </td>
                    <td style={{ padding: '7px 10px' }}>
                      <span style={{ fontWeight: 600, color: stock.volume_surge_ratio >= 2.0 ? 'var(--groww-amber)' : 'var(--text-secondary)' }}>
                        {stock.volume_surge_ratio}x
                      </span>
                    </td>
                    <td style={{ padding: '7px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '32px', height: '4px', background: 'var(--border-color)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{
                            width: `${Math.min(stock.attention_score * 100, 100)}%`,
                            height: '100%',
                            background: stock.attention_score > 0.6 ? 'var(--groww-amber)' : 'var(--groww-green)'
                          }}></div>
                        </div>
                        <span style={{ fontWeight: 700, fontSize: '11px' }}>{stock.attention_score}</span>
                      </div>
                    </td>
                    <td style={{ padding: '7px 10px' }}>
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
                    <td style={{ padding: '7px 10px', textAlign: 'right' }}>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: 'var(--bg-secondary)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
        <div>
          <div style={{ fontSize: '10px', color: 'var(--groww-green)', fontWeight: 700 }}>{activeStockInfo.sector?.toUpperCase() || 'EQUITY'}</div>
          <div style={{ fontSize: '18px', fontWeight: 700 }}>{activeStockInfo.name}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>NSE: {activeStockInfo.symbol}</div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '20px', fontWeight: 700 }}>₹{activeStockInfo.current_price.toFixed(2)}</div>
          <span className={`badge ${activeStockInfo.pct_change_since_seen >= 0 ? 'badge-green' : 'badge-red'}`} style={{ fontSize: '11px', padding: '1px 6px' }}>
            {activeStockInfo.pct_change_since_seen >= 0 ? '+' : ''}{activeStockInfo.pct_change_since_seen}%
          </span>
        </div>
      </div>

      {/* Detailed Financial Chart (Candlesticks + Volume Bars + Reference Level) */}
      <DetailedChart
        candles={candles}
        symbol={selectedStock}
        referencePrice={activeStockInfo.price_at_last_seen}
        height={350}
      />

      {/* ML Evaluation Metrics Box */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700 }}>ML ANOMALY EVALUATION MATRIX</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginTop: '2px' }}>
          <div style={{ background: 'var(--bg-card)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Price at Checkpoint</div>
            <div style={{ fontSize: '13px', fontWeight: 700, marginTop: '2px' }}>₹{activeStockInfo.price_at_last_seen.toFixed(2)}</div>
          </div>
          <div style={{ background: 'var(--bg-card)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Volume Surge</div>
            <div style={{ fontSize: '13px', fontWeight: 700, marginTop: '2px', color: activeStockInfo.volume_surge_ratio >= 2 ? 'var(--groww-amber)' : 'inherit' }}>
              {activeStockInfo.volume_surge_ratio}x
            </div>
          </div>
          <div style={{ background: 'var(--bg-card)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Attention Score</div>
            <div style={{ fontSize: '13px', fontWeight: 700, marginTop: '2px', color: 'var(--groww-green)' }}>
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
        padding: '0 20px',
        background: 'var(--bg-secondary)',
        flexShrink: 0
      }}>
        {/* Left: Brand Logo & Live Speed-Up Slider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'var(--groww-green)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={16} color="#000" />
            </div>
            <span style={{ fontWeight: 700, fontSize: '16px', letterSpacing: '-0.5px' }}>Groww <span style={{ color: 'var(--groww-green)', fontWeight: 500, fontSize: '12px' }}>Smart Watchlist</span></span>
          </div>

          {/* Live Speed-Up Slider */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            padding: '4px 12px',
            borderRadius: '6px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--groww-green)', fontSize: '11px', fontWeight: 600 }}>
              <FastForward size={13} />
              <span style={{ color: 'var(--text-secondary)' }}>Speed:</span>
              <b style={{ color: 'var(--text-primary)', minWidth: '32px' }}>{simSpeed.toFixed(1)}x</b>
            </div>
            
            <input
              type="range"
              min="0.5"
              max="10.0"
              step="0.5"
              value={simSpeed}
              onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
              style={{
                width: '80px',
                accentColor: 'var(--groww-green)',
                cursor: 'pointer',
                height: '4px'
              }}
              title={`Simulation playback speed: ${simSpeed}x (ML safe limit: 10x)`}
            />

            <span style={{
              fontSize: '9px',
              padding: '1px 5px',
              borderRadius: '4px',
              background: simSpeed >= 10 ? 'rgba(235,91,60,0.15)' : 'var(--groww-green-bg)',
              color: simSpeed >= 10 ? 'var(--groww-red)' : 'var(--groww-green)',
              fontWeight: 600,
              letterSpacing: '0.3px'
            }}>
              {simSpeed >= 10 ? 'ML MAX' : 'ML SAFE'}
            </span>
          </div>
        </div>

        {/* Right: Search, Checkpoint, and User Profile */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>

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

          {/* Checkpoint Button */}
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

          {/* User Session Profile / Auth Trigger */}
          {currentUser ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', padding: '4px 10px', borderRadius: '6px' }}>
              <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--groww-green-bg)', border: '1px solid var(--groww-green)', color: 'var(--groww-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}>
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentUser.name}</span>
                <span style={{ fontSize: '9px', color: 'var(--groww-green)' }}>Neon Session Active</span>
              </div>
              <button
                onClick={handleLogout}
                title="Log out of session"
                style={{ background: 'transparent', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '2px', marginLeft: '4px' }}
              >
                <LogOut size={13} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setAuthError('');
                setShowAuthModal(true);
              }}
              style={{
                background: 'var(--groww-green)',
                color: '#000',
                padding: '6px 12px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11px',
                fontWeight: 700
              }}
            >
              <LogIn size={13} color="#000" /> Sign In
            </button>
          )}

        </div>
      </header>

      {/* Full End-to-End Authentication Modal */}
      {showAuthModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(4px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            width: '360px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '24px',
            boxShadow: '0 16px 40px rgba(0,0,0,0.8)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={20} color="var(--groww-green)" />
                <span style={{ fontWeight: 700, fontSize: '15px' }}>
                  {authMode === 'LOGIN' ? 'Sign In to Groww' : 'Create Groww Account'}
                </span>
              </div>
              <button
                onClick={() => setShowAuthModal(false)}
                style={{ background: 'transparent', color: 'var(--text-muted)', fontSize: '16px', fontWeight: 600 }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
              Persist your custom watchlists, checkpoint cursors, and ML alert preferences directly to <b>Neon Cloud DB</b>.
            </p>

            {authError && (
              <div style={{ background: 'var(--groww-red-bg)', color: 'var(--groww-red)', border: '1px solid rgba(235,91,60,0.3)', padding: '8px 10px', borderRadius: '6px', fontSize: '11px' }}>
                {authError}
              </div>
            )}

            <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {authMode === 'REGISTER' && (
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Divya Nandini"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    style={{ width: '100%', height: '34px', fontSize: '12px' }}
                  />
                </div>
              )}

              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="trader@groww.in"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  style={{ width: '100%', height: '34px', fontSize: '12px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Password</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  style={{ width: '100%', height: '34px', fontSize: '12px' }}
                />
              </div>

              <button
                type="submit"
                disabled={isAuthLoading}
                style={{
                  background: 'var(--groww-green)',
                  color: '#000',
                  fontWeight: 700,
                  fontSize: '13px',
                  padding: '10px',
                  borderRadius: '6px',
                  marginTop: '6px',
                  cursor: isAuthLoading ? 'not-allowed' : 'pointer',
                  opacity: isAuthLoading ? 0.7 : 1
                }}
              >
                {isAuthLoading ? 'Syncing with Neon DB...' : authMode === 'LOGIN' ? 'Sign In' : 'Create Account'}
              </button>
            </form>

            <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
              {authMode === 'LOGIN' ? (
                <span>
                  Don't have an account?{' '}
                  <b
                    onClick={() => { setAuthMode('REGISTER'); setAuthError(''); }}
                    style={{ color: 'var(--groww-green)', cursor: 'pointer' }}
                  >
                    Register now
                  </b>
                </span>
              ) : (
                <span>
                  Already registered?{' '}
                  <b
                    onClick={() => { setAuthMode('LOGIN'); setAuthError(''); }}
                    style={{ color: 'var(--groww-green)', cursor: 'pointer' }}
                  >
                    Sign in here
                  </b>
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Market Down Replay Simulation Prompt Modal */}
      {showSimPromptModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(5px)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            width: '450px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '24px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.85)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            {/* Top Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: 'rgba(255, 186, 0, 0.15)',
                  border: '1px solid rgba(255, 186, 0, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <AlertCircle size={20} color="#ffba00" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Market Simulation
                  </h3>
                  <span style={{ fontSize: '11px', color: 'var(--groww-amber)' }}>
                    NSE & BSE Markets Currently Closed
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowSimPromptModal(false)}
                style={{ background: 'transparent', color: 'var(--text-muted)', fontSize: '16px', fontWeight: 600, padding: '2px' }}
              >
                ✕
              </button>
            </div>

            {/* Prompt Banner */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(255,186,0,0.1) 0%, rgba(0,210,144,0.08) 100%)',
              border: '1px solid rgba(255,186,0,0.3)',
              borderRadius: '8px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#ffc107', lineHeight: '1.3' }}>
                "Market is down, use last ({simDate})'s data to simulate?"
              </div>
              <p style={{ margin: 0, fontSize: '12px', lineHeight: '1.45', color: 'var(--text-secondary)' }}>
                Real-time trading hours have concluded. You can replay the full 1-minute historical intraday sequence from <b>{simDate}</b> to watch prices, candle charts, and ML attention signals update dynamically.
              </p>
            </div>

            {/* Speed Slider Section */}
            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Gauge size={15} color="var(--groww-green)" /> Simulation Playback Speed
                </span>
                <span style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: 'var(--groww-green)',
                  background: 'var(--groww-green-bg)',
                  border: '1px solid rgba(0, 210, 144, 0.3)',
                  padding: '2px 8px',
                  borderRadius: '4px'
                }}>
                  {simSpeed.toFixed(1)}x Speed
                </span>
              </div>

              {/* Slider Component */}
              <input
                type="range"
                min="0.5"
                max="10.0"
                step="0.5"
                value={simSpeed}
                onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
                style={{
                  width: '100%',
                  accentColor: 'var(--groww-green)',
                  cursor: 'pointer'
                }}
              />

              {/* Preset Speed Buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '4px' }}>
                {[0.5, 1.0, 2.0, 5.0, 10.0].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSpeedChange(s)}
                    style={{
                      flex: 1,
                      padding: '4px 0',
                      fontSize: '11px',
                      fontWeight: simSpeed === s ? 700 : 500,
                      background: simSpeed === s ? 'var(--groww-green)' : 'var(--bg-secondary)',
                      color: simSpeed === s ? '#000' : 'var(--text-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    {s}x
                  </button>
                ))}
              </div>

              {/* ML Safety Constraint Note */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '11px',
                color: 'var(--groww-green)',
                background: 'rgba(0, 210, 144, 0.08)',
                padding: '8px 10px',
                borderRadius: '6px',
                border: '1px solid rgba(0, 210, 144, 0.2)'
              }}>
                <Zap size={14} color="var(--groww-green)" style={{ flexShrink: 0 }} />
                <span>
                  <b>ML Safe Speed Limit (Max 10x):</b> Keeps tick intervals at &ge;1.0s so the Isolation Forest ML attention model evaluates all stocks without event queue latency.
                </span>
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '2px' }}>
              <button
                type="button"
                onClick={() => setShowSimPromptModal(false)}
                style={{
                  flex: 1,
                  background: 'var(--groww-green)',
                  color: '#000',
                  fontWeight: 700,
                  fontSize: '13px',
                  padding: '11px 16px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  cursor: 'pointer'
                }}
              >
                <Play size={14} color="#000" fill="#000" /> Start Live Simulation ({simSpeed}x)
              </button>

              <button
                type="button"
                onClick={() => setShowSimPromptModal(false)}
                style={{
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-color)',
                  padding: '11px 16px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Resizable Splitter Layout (VS Code Style) */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        
        {/* LEFT PANEL: Watchlists (Collapsible) */}
        <aside style={{
          width: isSidebarCollapsed ? '48px' : `${leftWidth}px`,
          minWidth: isSidebarCollapsed ? '48px' : '170px',
          maxWidth: isSidebarCollapsed ? '48px' : '450px',
          background: 'var(--bg-secondary)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          flexShrink: 0,
          transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
        }}>
          <div style={{
            padding: isSidebarCollapsed ? '12px 0' : '12px 14px',
            display: 'flex',
            justifyContent: isSidebarCollapsed ? 'center' : 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid var(--border-color)'
          }}>
            {!isSidebarCollapsed ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    onClick={() => setIsSidebarCollapsed(true)}
                    title="Collapse sidebar (maximize space)"
                    style={{ background: 'transparent', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '2px', borderRadius: '4px' }}
                  >
                    <PanelLeftClose size={15} />
                  </button>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.5px' }}>WATCHLISTS</span>
                </div>
                <button
                  onClick={() => setShowAddModal(!showAddModal)}
                  title="Create new watchlist"
                  style={{ background: 'transparent', color: 'var(--groww-green)', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '2px', fontWeight: 600 }}
                >
                  <Plus size={13} /> New
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsSidebarCollapsed(false)}
                title="Expand Watchlists panel"
                style={{ background: 'transparent', color: 'var(--groww-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px' }}
              >
                <PanelLeftOpen size={18} />
              </button>
            )}
          </div>

          {!isSidebarCollapsed && showAddModal && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCreateWatchlist();
              }}
              style={{ padding: '10px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '6px' }}
            >
              <input
                type="text"
                autoFocus
                placeholder="Watchlist name..."
                value={newWatchlistName}
                onChange={(e) => setNewWatchlistName(e.target.value)}
                style={{ height: '28px', fontSize: '11px' }}
              />
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="submit"
                  style={{ flex: 1, background: 'var(--groww-green)', color: '#000', fontWeight: 600, padding: '5px', borderRadius: '4px', fontSize: '11px' }}
                >
                  Create Watchlist
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{ background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border-color)', padding: '5px 8px', borderRadius: '4px', fontSize: '11px' }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Watchlists List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: isSidebarCollapsed ? '8px 4px' : '8px 10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {watchlists.map((w) => {
              const isSelected = selectedWatchlistId === w.id;
              if (isSidebarCollapsed) {
                return (
                  <div
                    key={w.id}
                    onClick={() => setSelectedWatchlistId(w.id)}
                    title={`${w.name} - ${w.description || 'Watchlist'}`}
                    style={{
                      height: '36px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      background: isSelected ? 'var(--groww-green-bg)' : 'transparent',
                      border: isSelected ? '1px solid var(--groww-green)' : '1px solid transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isSelected ? 'var(--groww-green)' : 'var(--text-secondary)'
                    }}
                  >
                    <List size={16} />
                  </div>
                );
              }

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

          {/* Judge Demo Shock Controls (only show full when not collapsed) */}
          {!isSidebarCollapsed ? (
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
          ) : (
            <div style={{ padding: '8px 4px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'center' }}>
              <button
                onClick={() => handleSimulateShock(selectedStock, 2.8)}
                title={`Quick Shock: +2.8% Spike on ${selectedStock}`}
                style={{ background: 'var(--groww-green-bg)', color: 'var(--groww-green)', padding: '6px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Zap size={15} />
              </button>
            </div>
          )}
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

        {/* WORKSPACE AREA: (Center: Table & AI Briefing | Right: Detailed Chart & Metrics) */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          
          {/* Section A: What Changed Executive Briefing + Ranked Watchlist Table */}
          <div style={{
            width: `${splitRatio}%`,
            minWidth: '320px',
            overflowY: 'auto',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            {/* Executive AI Briefing (Google Gemini) */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(28,34,48,1) 0%, rgba(22,27,38,1) 100%)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '10px 14px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.25)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
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

              <p style={{ fontSize: '12px', lineHeight: '1.45', color: 'var(--text-primary)', margin: 0 }}>
                {intelligence?.ai_digest || 'Evaluating multi-variate statistical anomalies and calculating attention scores...'}
              </p>
            </div>

            {renderWatchlistTable()}
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

          {/* Section B: Detailed Chart & ML Evaluation Matrix */}
          <div style={{
            width: `${100 - splitRatio}%`,
            minWidth: '320px',
            overflowY: 'auto',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            background: 'var(--bg-secondary)'
          }}>
            {renderChartDeepDive()}
          </div>

        </div>

      </div>

      {/* Bottom Global Status Bar (Institutional Terminal Style) */}
      <footer style={{
        height: '28px',
        background: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        fontSize: '11px',
        color: 'var(--text-muted)',
        flexShrink: 0,
        zIndex: 30
      }}>
        {/* Left: Market Status (Clickable to open simulation modal) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            onClick={() => setShowSimPromptModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              color: marketStatus?.status === 'OPEN' ? 'var(--groww-green)' : '#ffba00',
              fontWeight: 600
            }}
            title="Click to view & configure Market Replay Simulation"
          >
            <span style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: marketStatus?.status === 'OPEN' ? 'var(--groww-green)' : '#ffba00',
              display: 'inline-block'
            }}></span>
            <span>{marketStatus?.status === 'OPEN' ? 'MARKET OPEN (NSE/BSE)' : `MARKET CLOSED (Replaying ${simDate})`}</span>
          </div>

          <span style={{ color: 'var(--border-color)' }}>|</span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Gauge size={13} color="var(--groww-green)" />
            <span>Simulation Speed: <b style={{ color: 'var(--text-primary)' }}>{simSpeed.toFixed(1)}x</b></span>
            <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>(Safe &le; 10x)</span>
          </div>
        </div>

        {/* Right: Live Connection Statuses */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Live WebSocket Connection */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: isConnected ? 'var(--groww-green)' : 'var(--groww-red)'
          }}>
            <Activity size={13} />
            <span>{isConnected ? 'WebSocket Stream: Live' : 'WebSocket: Offline'}</span>
          </div>

          <span style={{ color: 'var(--border-color)' }}>|</span>

          {/* Neon DB Session Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: 'var(--groww-green)',
              display: 'inline-block'
            }}></span>
            <span>{currentUser ? `Neon DB: ${currentUser.name}` : 'Neon Cloud DB: Connected'}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
export default App;
