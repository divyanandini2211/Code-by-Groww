import React from 'react';
import { Candle } from '../types';

interface MiniChartProps {
  candles: Candle[];
  color?: string;
  height?: number;
}

export const MiniChart: React.FC<MiniChartProps> = ({ candles, color = '#00D09C', height = 140 }) => {
  if (!candles || candles.length === 0) {
    return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: '12px' }}>Loading chart data...</div>;
  }

  const prices = candles.map((c) => c.close);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice || 1;

  const width = 450;
  const paddingY = 15;
  const chartHeight = height - paddingY * 2;

  // Generate SVG path points
  const points = candles.map((c, i) => {
    const x = (i / (candles.length - 1)) * width;
    const y = height - paddingY - ((c.close - minPrice) / priceRange) * chartHeight;
    return `${x},${y}`;
  }).join(' ');

  const areaPoints = `${points} ${width},${height} 0,${height}`;
  const isPositive = prices[prices.length - 1] >= prices[0];
  const strokeColor = isPositive ? '#00D09C' : '#EB5B3C';
  const fillColor = isPositive ? 'rgba(0, 208, 156, 0.12)' : 'rgba(235, 91, 60, 0.12)';

  return (
    <div style={{ width: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#777', marginBottom: '4px' }}>
        <span>Low: ₹{minPrice.toFixed(2)}</span>
        <span>Current: ₹{prices[prices.length - 1].toFixed(2)}</span>
        <span>High: ₹{maxPrice.toFixed(2)}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: `${height}px`, display: 'block' }}>
        <polygon points={areaPoints} fill={fillColor} />
        <polyline
          fill="none"
          stroke={strokeColor}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
      </svg>
    </div>
  );
};
