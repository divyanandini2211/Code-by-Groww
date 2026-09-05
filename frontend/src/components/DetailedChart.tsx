import React, { useState } from 'react';
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
  height = 300 
}) => {
  const [chartMode, setChartMode] = useState<'CANDLESTICK' | 'LINE'>('CANDLESTICK');
  const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null);

  if (!candles || candles.length === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
        Awaiting candle stream for {symbol}...
      </div>
    );
  }

  // Determine scale boundaries - dynamically include referencePrice so checkpoint line never flies off the SVG
  const allHighs = candles.map(c => c.high);
  const allLows = candles.map(c => c.low);
  if (referencePrice) {
    allHighs.push(referencePrice);
    allLows.push(referencePrice);
  }
  const rawMax = Math.max(...allHighs);
  const rawMin = Math.min(...allLows);
  const rawRange = (rawMax - rawMin) || 1.0;
  
  // Add 4% vertical breathing room so neither wicks nor checkpoint line clip at edges
  const maxPrice = rawMax + rawRange * 0.04;
  const minPrice = rawMin - rawRange * 0.04;
  const priceRange = maxPrice - minPrice;

  const width = 800;
  const paddingLeft = 10;
  const paddingRight = 65; // Room for price Y-axis
  const paddingTop = 25;
  const paddingBottom = 40; // Room for volume and timestamps

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  const barWidth = Math.max(3, (chartWidth / candles.length) * 0.7);

  const getY = (price: number) => {
    const rawY = height - paddingBottom - ((price - minPrice) / priceRange) * chartHeight;
    return Math.max(paddingTop + 2, Math.min(height - paddingBottom - 2, rawY));
  };

  // Max volume for volume bars at bottom
  const maxVol = Math.max(...candles.map(c => c.volume), 1);
  const volumeAreaHeight = 35;

  return (
    <div style={{ width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      
      {/* Chart Top Header & Mode Toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {symbol} Intraday Action
          </span>
          <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: '4px', padding: '2px', border: '1px solid var(--border-color)' }}>
            <button
              onClick={() => setChartMode('CANDLESTICK')}
              style={{
                background: chartMode === 'CANDLESTICK' ? 'var(--bg-hover)' : 'transparent',
                color: chartMode === 'CANDLESTICK' ? 'var(--groww-green)' : 'var(--text-muted)',
                padding: '2px 8px',
                borderRadius: '3px',
                fontSize: '11px',
                fontWeight: 600
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
                fontWeight: 600
              }}
            >
              Line
            </button>
          </div>
        </div>

        {/* Hover / Tooltip HUD */}
        {hoveredCandle ? (
          <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
            <span>T: <b style={{ color: 'var(--text-primary)' }}>{hoveredCandle.timestamp}</b></span>
            <span>O: <b style={{ color: 'var(--text-primary)' }}>₹{hoveredCandle.open.toFixed(1)}</b></span>
            <span>H: <b style={{ color: 'var(--groww-green)' }}>₹{hoveredCandle.high.toFixed(1)}</b></span>
            <span>L: <b style={{ color: 'var(--groww-red)' }}>₹{hoveredCandle.low.toFixed(1)}</b></span>
            <span>C: <b style={{ color: hoveredCandle.close >= hoveredCandle.open ? 'var(--groww-green)' : 'var(--groww-red)' }}>₹{hoveredCandle.close.toFixed(1)}</b></span>
            <span>Vol: <b style={{ color: 'var(--text-primary)' }}>{hoveredCandle.volume.toLocaleString()}</b></span>
          </div>
        ) : (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Hover for OHLCV • Ref: ₹{(referencePrice || candles[0].close).toFixed(2)}
          </div>
        )}
      </div>


      {/* High-Resolution Interactive SVG Canvas */}
      <div style={{ width: '100%', position: 'relative' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: '100%', height: `${height}px`, display: 'block', overflow: 'visible' }}
          onMouseLeave={() => setHoveredCandle(null)}
        >
          {/* Horizontal Price Gridlines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
            const priceVal = minPrice + priceRange * pct;
            const yPos = getY(priceVal);
            return (
              <g key={idx}>
                <line
                  x1={paddingLeft}
                  y1={yPos}
                  x2={width - paddingRight}
                  y2={yPos}
                  stroke="var(--border-color)"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                />
                <text
                  x={width - paddingRight + 8}
                  y={yPos + 4}
                  fill="var(--text-muted)"
                  fontSize="10"
                  fontFamily="Inter, sans-serif"
                >
                  ₹{priceVal.toFixed(1)}
                </text>
              </g>
            );
          })}

          {/* Reference Price Baseline (Checkpoint Time / Last Seen) */}
          {referencePrice && (() => {
            const refY = getY(referencePrice);
            const textY = refY <= paddingTop + 12 ? refY + 12 : refY - 5;
            return (
              <g>
                <line
                  x1={paddingLeft}
                  y1={refY}
                  x2={width - paddingRight}
                  y2={refY}
                  stroke="var(--groww-amber)"
                  strokeDasharray="4 4"
                  strokeWidth="1.5"
                  opacity="0.85"
                />
                <rect
                  x={paddingLeft + 4}
                  y={textY - 9}
                  width="180"
                  height="13"
                  fill="var(--bg-card)"
                  opacity="0.85"
                  rx="2"
                />
                <text
                  x={paddingLeft + 6}
                  y={textY}
                  fill="var(--groww-amber)"
                  fontSize="9"
                  fontWeight="bold"
                  fontFamily="Inter, sans-serif"
                >
                  LAST CHECKPOINT (₹{referencePrice.toFixed(1)})
                </text>
              </g>
            );
          })()}

          {/* Volume Bars at Bottom (Individual Green / Red Bars) */}
          {candles.map((c, i) => {
            const x = paddingLeft + (i / (candles.length - 1 || 1)) * chartWidth;
            const volHeight = (c.volume / maxVol) * volumeAreaHeight;
            const isGreen = c.close >= c.open;
            return (
              <rect
                key={`vol-${i}`}
                x={x - barWidth / 2}
                y={height - paddingBottom - volHeight}
                width={barWidth}
                height={volHeight}
                fill={isGreen ? 'rgba(0, 208, 156, 0.25)' : 'rgba(235, 91, 60, 0.25)'}
              />
            );
          })}

          {/* Mode 1: True Financial Japanese Candlesticks (Individual Green & Red Bars) */}
          {chartMode === 'CANDLESTICK' && candles.map((c, i) => {
            const x = paddingLeft + (i / (candles.length - 1 || 1)) * chartWidth;
            const isGreen = c.close >= c.open;
            const candleColor = isGreen ? '#00D09C' : '#EB5B3C';
            
            const highY = getY(c.high);
            const lowY = getY(c.low);
            const openY = getY(c.open);
            const closeY = getY(c.close);

            const bodyTop = Math.min(openY, closeY);
            const bodyHeight = Math.max(2, Math.abs(openY - closeY));

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
                  stroke={candleColor}
                  strokeWidth="1.2"
                />
                {/* Real Candle Body */}
                <rect
                  x={x - barWidth / 2}
                  y={bodyTop}
                  width={barWidth}
                  height={bodyHeight}
                  fill={isGreen ? candleColor : candleColor}
                  rx="1"
                />
              </g>
            );
          })}

          {/* Mode 2: Multi-tone Line + Gradient Fill */}
          {chartMode === 'LINE' && (() => {
            const pts = candles.map((c, i) => {
              const x = paddingLeft + (i / (candles.length - 1 || 1)) * chartWidth;
              const y = getY(c.close);
              return `${x},${y}`;
            }).join(' ');
            const isOverallUp = candles[candles.length - 1].close >= candles[0].close;
            const strokeCol = isOverallUp ? '#00D09C' : '#EB5B3C';

            return (
              <polyline
                fill="none"
                stroke={strokeCol}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={pts}
              />
            );
          })()}

          {/* Timestamps along bottom X-axis */}
          {candles.filter((_, idx) => idx % Math.ceil(candles.length / 6) === 0).map((c, i) => {
            const origIdx = candles.indexOf(c);
            const x = paddingLeft + (origIdx / (candles.length - 1 || 1)) * chartWidth;
            return (
              <text
                key={`ts-${i}`}
                x={x}
                y={height - 12}
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
    </div>
  );
};
