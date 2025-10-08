import React, { useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { createChart, IChartApi, HistogramSeries, ColorType, CrosshairMode } from 'lightweight-charts';
import { useUserChartColors } from '../hooks/useUserChartColors';

interface ForeignFlowProps {
  selectedStock?: string;
}

// Generate foreign flow data (from StoryForeignFlow.tsx)
const generateForeignFlowData = (ticker: string): any[] => {
  const data: any[] = [];
  const now = new Date();
  
  // Generate 30 days of data
  const numPoints = 30;
  const interval = 1; // days per data point
  
  for (let i = numPoints - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - (i * interval));
    
    // Generate foreign flow data with some correlation to price movement
    const netBuy = (Math.random() - 0.5) * 2000000 * Math.sqrt(interval);
    const buyVolume = Math.floor(Math.random() * 1000000 * interval) + 100000;
    const sellVolume = Math.floor(Math.random() * 1000000 * interval) + 100000;
    
    data.push({
      time: date.toISOString().split('T')[0],
      netBuy: Math.round(netBuy),
      netValue: Math.round(netBuy * (1000 + Math.random() * 200)),
      buyVolume: buyVolume,
      sellVolume: sellVolume,
      flowStrength: Math.random() * 100,
    });
  }
  
  return data;
};

export function ForeignFlow({ selectedStock = 'BBRI' }: ForeignFlowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const userColors = useUserChartColors();

  const getThemeColors = () => {
    const isDark = document.documentElement.classList.contains('dark');
    return {
      textColor: isDark ? '#f9fafb' : '#111827',
      gridColor: isDark ? '#4b5563' : '#e5e7eb',
      borderColor: isDark ? '#6b7280' : '#d1d5db',
      axisTextColor: isDark ? '#d1d5db' : '#6b7280',
    };
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }
    
    const width = el.clientWidth || 800;
    const height = el.clientHeight || 300;
    const colors = getThemeColors();
    
    chartRef.current = createChart(el, {
      width,
      height,
      layout: { 
        background: { type: ColorType.Solid, color: 'transparent' }, 
        textColor: colors.axisTextColor,
      },
      grid: { 
        horzLines: { color: colors.gridColor, style: 1 }, 
        vertLines: { color: colors.gridColor, style: 1 } 
      },
      rightPriceScale: { 
        borderColor: colors.borderColor
      },
      timeScale: { 
        borderColor: colors.borderColor,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: any, tickMarkType: any, locale: string) => {
          let date: Date;
          if (typeof time === 'string') {
            date = new Date(time);
          } else {
            date = new Date(time * 1000);
          }
          const day = date.getDate();
          const month = date.toLocaleDateString('en-US', { month: 'short' });
          return `${day} ${month}`;
        }
      },
      crosshair: { mode: CrosshairMode.Normal },
    });

    // Generate foreign flow data
    const foreignFlowData = generateForeignFlowData(selectedStock);

    if (foreignFlowData.length > 0) {
      try {
        const foreignFlowSeries = chartRef.current.addSeries(HistogramSeries, {
          color: '#3b82f6',
          priceFormat: { type: 'volume' },
        });

        foreignFlowSeries.setData(foreignFlowData.map(d => ({
          time: d.time,
          value: d.netBuy,
          color: d.netBuy >= 0 ? userColors.bullish : userColors.bearish,
        })));

        chartRef.current.timeScale().fitContent();
      } catch (e) {
        console.error('Foreign flow chart render error:', e);
      }
    }
  }, [selectedStock, userColors]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr || !chartRef.current) return;
      chartRef.current.applyOptions({
        width: Math.max(1, Math.floor(cr.width)),
        height: Math.max(1, Math.floor(cr.height)),
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, []);

  return (
    <div>
      <div className="h-[300px] w-full relative">
        <style>{`
          #tv-attr-logo {
            display: none !important;
          }
          .tv-attr-logo {
            display: none !important;
          }
          [data-tv-attr-logo] {
            display: none !important;
          }
        `}</style>
        
        {/* Y-axis title */}
        <div className="absolute -left-4 top-1/2 text-sm font-bold text-muted-foreground transform -rotate-90 origin-left whitespace-nowrap z-10">
          Foreign Flow
        </div>
        
        {/* X-axis title */}
        <div className="absolute -bottom-4 left-1/2 transform -translate-x-1/2 text-sm font-bold text-muted-foreground z-10">
          Date
        </div>
        
        <div ref={containerRef} className="h-full w-full" />
      </div>
    </div>
  );
}
