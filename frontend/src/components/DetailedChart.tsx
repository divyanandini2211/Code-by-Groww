import React, { useState } from 'react';
import { ZoomIn, ZoomOut, Activity } from 'lucide-react';
import { Candle } from '../types';

interface DetailedChartProps {
  candles: Candle[];
  symbol: string;
  referencePrice?: number;
  height?: number;
}

export const DetailedChart: React.FC<DetailedChartProps> = ({ 
  candles, 
  symbol, 
  referencePrice, 
  height = 360 
}) => {
  const [chartMode, setChartMode] = useState<'CANDLESTICK' | 'LINE'>('CANDLESTICK');
  const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [zoomRange, setZoomRange] = useState<number>(25); // Default zoomed-in to 25 candles for high clarity

  if (!candles || candles.length === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
        <Activity size={16} className="spinner" style={{ marginRight: '8px' }} /> Awaiting candle stream for {symbol}...
      </div>
    );
  }

  // Zoomed slice of candles
  const effectiveZoom = Math.min(candles.length, Math.max(10, zoomRange));
  const visibleCandles = candles.slice(-effectiveZoom);

  // SVG dimensions
  const svgWidth = 840;
  const svgHeight = Math.max(340, height);
  const paddingLeft = 14;
  const paddingRight = 72; // Generous space for right-hand Y-axis price tags
  const paddingTop = 26;
  const timeAxisHeight = 26;
  const volumeZoneHeight = 65; // Dedicated lower volume zone
  const separatorY = svgHeight - timeAxisHeight - volumeZoneHeight; // Divider between candles and volume
  const priceZoneHeight = separatorY - paddingTop;
  const chartWidth = svgWidth - paddingLeft - paddingRight;

  // Determine scale boundaries based on VISIBLE candles (prevents squishing)
  const visibleHighs = visibleCandles.map(c => c.high);
  const visibleLows = visibleCandles.map(c => c.low);
  let rawMax = Math.max(...visibleHighs);
  let rawMin = Math.min(...visibleLows);

  // If referencePrice is within reasonable distance, include it; otherwise clamp so it doesn't crush candles
  let isRefPriceVisible = false;
  if (referencePrice) {
    const span = (rawMax - rawMin) || 1.0;
    if (referencePrice >= rawMin - span * 0.4 && referencePrice <= rawMax + span * 0.4) {
      rawMax = Math.max(rawMax, referencePrice);
      rawMin = Math.min(rawMin, referencePrice);
      isRefPriceVisible = true;
    }
  }

  const rawRange = (rawMax - rawMin) || 1.0;
  // 7% vertical breathing room so candles fill the price zone with high visibility
  const maxPrice = rawMax + rawRange * 0.07;
  const minPrice = rawMin - rawRange * 0.07;
  const priceRange = maxPrice - minPrice;

  // Y-coordinate mapping for price zone (Top 75%)
  const getY = (price: number) => {
    const normalized = (price - minPrice) / priceRange;
    return separatorY - (normalized * priceZoneHeight);
  };

  // Y-coordinate mapping for volume zone (Bottom 25%)
  const maxVol = Math.max(...visibleCandles.map(c => c.volume), 10);
  const getVolHeight = (vol: number) => {
    return Math.max(2, (vol / maxVol) * (volumeZoneHeight - 14));
  };
  const volBaseY = svgHeight - timeAxisHeight;

  // Horizontal distribution: Center each candle in its step slot
  const candleCount = visibleCandles.length;
  const stepX = chartWidth / candleCount;
  const barWidth = Math.max(5, Math.min(32, stepX * 0.72));

  // Current latest candle
  const latestCandle = visibleCandles[visibleCandles.length - 1];
  const currentPrice = latestCandle.close;
  const currentY = getY(currentPrice);
  const isUp = currentPrice >= latestCandle.open;
  const currentStroke = isUp ? '#00D09C' : '#EB5B3C';

  return (
    <div style={{ width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      
      {/* Top Controls: Symbol, Zoom Selector, Mode Toggle, and HUD */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {symbol}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Intraday 1-Min</span>
          </div>

          {/* Zoom In / Zoom Out Controls */}
          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-secondary)', borderRadius: '6px', padding: '2px', border: '1px solid var(--border-color)', gap: '2px' }}>
            <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', padding: '0 4px' }}>Zoom:</span>
            {[
              { label: '15m (Close)', count: 15 },
              { label: '25m', count: 25 },
              { label: '40m', count: 40 },
              { label: 'All (60m)', count: 60 }
            ].map((z) => (
              <button
                key={z.count}
                type="button"
                onClick={() => setZoomRange(z.count)}
                style={{
                  background: zoomRange === z.count ? 'var(--groww-green)' : 'transparent',
                  color: zoomRange === z.count ? '#000' : 'var(--text-secondary)',
                  border: 'none',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: zoomRange === z.count ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {z.label}
              </button>
            ))}
            <div style={{ display: 'flex', borderLeft: '1px solid var(--border-color)', marginLeft: '2px', paddingLeft: '2px' }}>
              <button
                type="button"
                onClick={() => setZoomRange(prev => Math.max(10, prev - 10))}
                title="Zoom In (Fewer, larger candles)"
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: '2px 5px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                <ZoomIn size={13} />
              </button>
              <button
                type="button"
                onClick={() => setZoomRange(prev => Math.min(candles.length, prev + 10))}
                title="Zoom Out (More candles)"
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: '2px 5px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                <ZoomOut size={13} />
              </button>
            </div>
          </div>

          {/* Chart Display Mode */}
          <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: '4px', padding: '2px', border: '1px solid var(--border-color)' }}>
            <button
              onClick={() => setChartMode('CANDLESTICK')}
              style={{
                background: chartMode === 'CANDLESTICK' ? 'var(--bg-hover)' : 'transparent',
                color: chartMode === 'CANDLESTICK' ? 'var(--groww-green)' : 'var(--text-muted)',
                padding: '2px 8px',
                borderRadius: '3px',
                fontSize: '11px',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Candles
            </button>
            <button
              onClick={() => setChartMode('LINE')}
              style={{
                background: chartMode === 'LINE' ? 'var(--bg-hover)' : 'transparent',
                color: chartMode === 'LINE' ? 'var(--groww-green)' : 'var(--text-muted)',
                padding: '2px 8px',
                borderRadius: '3px',
                fontSize: '11px',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Line
            </button>
          </div>
        </div>

        {/* Hover / Tooltip HUD */}
        {hoveredCandle ? (
          <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
            <span>Time: <b style={{ color: 'var(--text-primary)' }}>{hoveredCandle.timestamp}</b></span>
            <span>O: <b style={{ color: 'var(--text-primary)' }}>₹{hoveredCandle.open.toFixed(2)}</b></span>
            <span>H: <b style={{ color: 'var(--groww-green)' }}>₹{hoveredCandle.high.toFixed(2)}</b></span>
            <span>L: <b style={{ color: 'var(--groww-red)' }}>₹{hoveredCandle.low.toFixed(2)}</b></span>
            <span>C: <b style={{ color: hoveredCandle.close >= hoveredCandle.open ? 'var(--groww-green)' : 'var(--groww-red)' }}>₹{hoveredCandle.close.toFixed(2)}</b></span>
            <span>Vol: <b style={{ color: 'var(--text-primary)' }}>{hoveredCandle.volume.toLocaleString()}</b></span>
          </div>
        ) : (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>Ref Checkpoint: <b style={{ color: 'var(--groww-amber)' }}>₹{(referencePrice || candles[0].close).toFixed(2)}</b></span>
            <span>•</span>
            <span>LTP: <b style={{ color: currentStroke }}>₹{currentPrice.toFixed(2)}</b></span>
          </div>
        )}
      </div>

      {/* SVG Canvas with Zoomed Candlesticks and Two-Tier Volume Zone */}
      <div style={{ width: '100%', position: 'relative', overflow: 'hidden' }}>
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ width: '100%', height: `${svgHeight}px`, display: 'block', overflow: 'visible' }}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const relX = ((e.clientX - rect.left) / rect.width) * svgWidth;
            const relY = ((e.clientY - rect.top) / rect.height) * svgHeight;
            setHoverPos({ x: relX, y: relY });
          }}
          onMouseLeave={() => {
            setHoveredCandle(null);
            setHoverPos(null);
          }}
        >
          <defs>
            <linearGradient id="areaGradientUp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00D09C" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#00D09C" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="areaGradientDown" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#EB5B3C" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#EB5B3C" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Horizontal Price Gridlines (Price Zone) */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
            const priceVal = minPrice + priceRange * pct;
            const yPos = getY(priceVal);
            return (
              <g key={`grid-${idx}`}>
                <line
                  x1={paddingLeft}
                  y1={yPos}
                  x2={svgWidth - paddingRight}
                  y2={yPos}
                  stroke="var(--border-color)"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                  opacity="0.6"
                />
                <text
                  x={svgWidth - paddingRight + 8}
                  y={yPos + 3.5}
                  fill="var(--text-muted)"
                  fontSize="10"
                  fontFamily="Inter, sans-serif"
                >
                  ₹{priceVal.toFixed(1)}
                </text>
              </g>
            );
          })}

          {/* Zone Separator: Line dividing Candlestick Zone and Volume Zone */}
          <line
            x1={paddingLeft}
            y1={separatorY}
            x2={svgWidth - paddingRight}
            y2={separatorY}
            stroke="var(--border-color)"
            strokeDasharray="2 2"
            strokeWidth="1"
          />
          <text
            x={paddingLeft + 4}
            y={separatorY + 12}
            fill="var(--text-muted)"
            fontSize="9"
            fontWeight="600"
            fontFamily="Inter, sans-serif"
          >
            VOL (1M)
          </text>
          <text
            x={svgWidth - paddingRight + 8}
            y={separatorY + 14}
            fill="var(--text-muted)"
            fontSize="9"
            fontFamily="Inter, sans-serif"
          >
            {maxVol > 1000 ? `${(maxVol / 1000).toFixed(1)}k` : maxVol}
          </text>

          {/* Reference Price Baseline (Checkpoint Time / Last Seen) */}
          {referencePrice && isRefPriceVisible && (() => {
            const refY = getY(referencePrice);
            return (
              <g>
                <line
                  x1={paddingLeft}
                  y1={refY}
                  x2={svgWidth - paddingRight}
                  y2={refY}
                  stroke="var(--groww-amber)"
                  strokeDasharray="4 4"
                  strokeWidth="1.5"
                  opacity="0.9"
                />
                <rect
                  x={svgWidth - paddingRight + 2}
                  y={refY - 8}
                  width="68"
                  height="16"
                  fill="rgba(255, 186, 0, 0.18)"
                  stroke="var(--groww-amber)"
                  strokeWidth="1"
                  rx="3"
                />
                <text
                  x={svgWidth - paddingRight + 6}
                  y={refY + 4}
                  fill="var(--groww-amber)"
                  fontSize="9"
                  fontWeight="bold"
                  fontFamily="Inter, sans-serif"
                >
                  CKPT ₹{referencePrice.toFixed(1)}
                </text>
              </g>
            );
          })()}

          {/* Volume Bars (Dedicated Bottom 25% Zone) */}
          {visibleCandles.map((c, i) => {
            const x = paddingLeft + (i + 0.5) * stepX;
            const volH = getVolHeight(c.volume);
            const isGreen = c.close >= c.open;
            return (
              <rect
                key={`vol-${i}`}
                x={x - barWidth / 2}
                y={volBaseY - volH}
                width={barWidth}
                height={volH}
                fill={isGreen ? 'rgba(0, 208, 156, 0.45)' : 'rgba(235, 91, 60, 0.45)'}
                rx="1"
              />
            );
          })}

          {/* Mode 1: True Financial Japanese Candlesticks (Prominent Zoomed Bodies & Wicks) */}
          {chartMode === 'CANDLESTICK' && visibleCandles.map((c, i) => {
            const x = paddingLeft + (i + 0.5) * stepX;
            const isGreen = c.close >= c.open;
            const candleStroke = isGreen ? '#00D09C' : '#EB5B3C';
            const candleFill = isGreen ? 'rgba(0, 208, 156, 0.9)' : 'rgba(235, 91, 60, 0.9)';
            
            const highY = getY(c.high);
            const lowY = getY(c.low);
            const openY = getY(c.open);
            const closeY = getY(c.close);

            const bodyTop = Math.min(openY, closeY);
            const bodyHeight = Math.max(2.5, Math.abs(openY - closeY));

            const isHovered = hoveredCandle === c;

            return (
              <g 
                key={`candle-${i}`}
                onMouseEnter={() => setHoveredCandle(c)}
                style={{ cursor: 'crosshair' }}
              >
                {/* Upper and Lower Wick */}
                <line
                  x1={x}
                  y1={highY}
                  x2={x}
                  y2={lowY}
                  stroke={candleStroke}
                  strokeWidth={barWidth > 12 ? '1.8' : '1.2'}
                  strokeLinecap="round"
                />

                {/* Candle Body */}
                <rect
                  x={x - barWidth / 2}
                  y={bodyTop}
                  width={barWidth}
                  height={bodyHeight}
                  fill={candleFill}
                  stroke={candleStroke}
                  strokeWidth="1.2"
                  rx={barWidth > 10 ? 2 : 1}
                  filter={isHovered ? 'drop-shadow(0 0 6px rgba(0,210,144,0.6))' : 'none'}
                />
              </g>
            );
          })}

          {/* Mode 2: Multi-tone Line + Gradient Fill */}
          {chartMode === 'LINE' && (() => {
            const pts = visibleCandles.map((c, i) => {
              const x = paddingLeft + (i + 0.5) * stepX;
              const y = getY(c.close);
              return `${x},${y}`;
            }).join(' ');

            const isOverallUp = visibleCandles[visibleCandles.length - 1].close >= visibleCandles[0].close;
            const strokeCol = isOverallUp ? '#00D09C' : '#EB5B3C';

            // Area polygon closing to separator
            const firstX = paddingLeft + 0.5 * stepX;
            const lastX = paddingLeft + (visibleCandles.length - 0.5) * stepX;
            const areaPts = `${firstX},${separatorY} ${pts} ${lastX},${separatorY}`;

            return (
              <g>
                <polygon
                  points={areaPts}
                  fill={isOverallUp ? 'url(#areaGradientUp)' : 'url(#areaGradientDown)'}
                />
                <polyline
                  fill="none"
                  stroke={strokeCol}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={pts}
                />
              </g>
            );
          })()}

          {/* Live Price Horizontal Line across the chart */}
          {latestCandle && (
            <g>
              <line
                x1={paddingLeft}
                y1={currentY}
                x2={svgWidth - paddingRight}
                y2={currentY}
                stroke={currentStroke}
                strokeDasharray="3 3"
                strokeWidth="1.5"
                opacity="0.9"
              />
              {/* Pulsing dot on the latest candle */}
              <circle
                cx={paddingLeft + (visibleCandles.length - 0.5) * stepX}
                cy={currentY}
                r="4.5"
                fill={currentStroke}
                stroke="var(--bg-card)"
                strokeWidth="1.5"
              />
              {/* Live Price Tag Pill on Y-Axis */}
              <rect
                x={svgWidth - paddingRight + 2}
                y={currentY - 9}
                width="68"
                height="18"
                fill={isUp ? 'var(--groww-green)' : 'var(--groww-red)'}
                rx="3"
              />
              <text
                x={svgWidth - paddingRight + 6}
                y={currentY + 4}
                fill="#000"
                fontSize="10"
                fontWeight="bold"
                fontFamily="Inter, sans-serif"
              >
                ₹{currentPrice.toFixed(2)}
              </text>
            </g>
          )}

          {/* Crosshair Cursor on Mouse Move */}
          {hoverPos && hoverPos.x >= paddingLeft && hoverPos.x <= svgWidth - paddingRight && hoverPos.y >= paddingTop && hoverPos.y <= separatorY && (
            <g pointerEvents="none">
              <line
                x1={hoverPos.x}
                y1={paddingTop}
                x2={hoverPos.x}
                y2={volBaseY}
                stroke="var(--text-muted)"
                strokeDasharray="2 2"
                strokeWidth="1"
                opacity="0.6"
              />
              <line
                x1={paddingLeft}
                y1={hoverPos.y}
                x2={svgWidth - paddingRight}
                y2={hoverPos.y}
                stroke="var(--text-muted)"
                strokeDasharray="2 2"
                strokeWidth="1"
                opacity="0.6"
              />
            </g>
          )}

          {/* Timestamps along bottom X-axis */}
          {visibleCandles.filter((_, idx) => idx % Math.max(1, Math.ceil(visibleCandles.length / 7)) === 0).map((c, i) => {
            const origIdx = visibleCandles.indexOf(c);
            const x = paddingLeft + (origIdx + 0.5) * stepX;
            return (
              <text
                key={`ts-${i}`}
                x={x}
                y={svgHeight - 8}
                fill="var(--text-muted)"
                fontSize="10"
                textAnchor="middle"
                fontFamily="Inter, sans-serif"
              >
                {c.timestamp}
              </text>
            );
          })}
        </svg>
      </div>

      {/* Sub-Footer: Zoom status and live update badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', color: 'var(--text-muted)', paddingTop: '2px' }}>
        <span>Showing <b>{visibleCandles.length}</b> zoomed candles • 1-min interval</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--groww-green)' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--groww-green)', display: 'inline-block' }}></span>
          Live Candle Stream Active
        </span>
      </div>
    </div>
  );
};
