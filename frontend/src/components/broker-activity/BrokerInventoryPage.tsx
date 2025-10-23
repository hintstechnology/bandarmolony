import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { X } from 'lucide-react';
// Removed unused Recharts imports
import { getBrokerBackgroundClass, getBrokerTextClass, useDarkMode } from '../../utils/brokerColors';
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineSeries,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
} from 'lightweight-charts';
import { useUserChartColors } from '../../hooks/useUserChartColors';

// Removed unused interface

interface InventoryTimeSeries {
  time: string;
  [brokerCode: string]: string | number;
}

// Available tickers
const AVAILABLE_TICKERS = [
  'BBCA', 'BBRI', 'BMRI', 'BBNI', 'ARTO', 'BACA', 'TLKM', 'ISAT', 'FREN', 'EXCL',
  'ASII', 'GOTO', 'ANTM', 'MDKA', 'ADRO', 'UNVR', 'ICBP', 'INDF', 'PGAS', 'MEDC',
  'CPIN', 'JPFA', 'INCO', 'TPIA', 'TKIM', 'INKP', 'BRIS', 'SIDO', 'ERAA', 'ESSA'
];

// Available brokers
const AVAILABLE_BROKERS = [
  'LG', 'MG', 'BR', 'RG', 'CC', 'AK', 'BK', 'DH', 'KZ', 'YU', 'ZP',
  'AG', 'NI', 'PD', 'SQ', 'SS', 'CIMB', 'UOB', 'COIN', 'NH', 'RG'
];

// Broker colors
const getBrokerColor = (broker: string): string => {
  const colors = {
    LG: '#3B82F6', MG: '#10B981', BR: '#8B5CF6', RG: '#F59E0B', CC: '#EC4899',
    AK: '#22C55E', BK: '#06B6D4', DH: '#8B5CF6', KZ: '#84CC16', YU: '#F97316',
    ZP: '#6B7280', AG: '#EF4444', NI: '#F59E0B', PD: '#10B981', SQ: '#8B5CF6',
    SS: '#DC2626', CIMB: '#059669', UOB: '#7C3AED', COIN: '#EA580C', NH: '#BE185D'
  };
  return colors[broker as keyof typeof colors] || '#6B7280';
};

// Generate inventory data for selected brokers and date range
const generateInventoryData = (_ticker: string, selectedBrokers: string[], startDate: string, endDate: string) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

  const data: InventoryTimeSeries[] = [];

  for (let i = 0; i <= days; i++) {
    const currentDate = new Date(start);
    currentDate.setDate(start.getDate() + i);
    const timeStr = currentDate.toISOString().split('T')[0] ?? '';

    const dayData: InventoryTimeSeries = { time: timeStr };

    selectedBrokers.forEach(broker => {
      // Start from 0, simulate cumulative net flow changes
      const baseValue = i === 0 ? 0 : (Math.random() - 0.5) * 20;
      const trend = Math.sin(i * 0.1) * 10; // Some trend
      const noise = (Math.random() - 0.5) * 5; // Random noise

      dayData[broker] = Math.round(baseValue + trend + noise);
    });

    data.push(dayData);
  }

  return data;
};

// Generate candlestick data for price chart
const generateCandlestickData = (_ticker: string, startDate: string, endDate: string) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

  const data: any[] = [];
  let basePrice = 2700 + Math.random() * 200; // Base price around 2700-2900

  for (let i = 0; i <= days; i++) {
    const currentDate = new Date(start);
    currentDate.setDate(start.getDate() + i);
    const timeStr = currentDate.toISOString().split('T')[0] ?? '';

    const open = basePrice;
    const change = (Math.random() - 0.5) * 20;
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * 10;
    const low = Math.min(open, close) - Math.random() * 10;

    data.push({
      time: timeStr,
      open: Math.round(open),
      high: Math.round(high),
      low: Math.round(low),
      close: Math.round(close),
      volume: Math.floor(Math.random() * 1000000 + 100000)
    });

    basePrice = close; // Next day starts from previous close
  }

  return data;
};

// Generate volume data
const generateVolumeData = (_ticker: string, startDate: string, endDate: string) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

  const data: any[] = [];

  for (let i = 0; i <= days; i++) {
    const currentDate = new Date(start);
    currentDate.setDate(start.getDate() + i);
    const timeStr = currentDate.toISOString().split('T')[0] ?? '';

    // Generate volume with some correlation to price movement
    const baseVolume = Math.floor(Math.random() * 2000000 + 500000);
    const volumeVariation = Math.random() * 0.4 + 0.8; // 0.8 to 1.2 multiplier

    data.push({
      time: timeStr,
      value: Math.floor(baseVolume * volumeVariation),
      color: Math.random() > 0.5 ? '#16a34a' : '#dc2626' // Green or red based on random
    });
  }

  return data;
};

// Generate broker gross/net data for horizontal bar chart
// Removed unused data generation functions to improve performance

// Generate Big 5 Gross & Net table data
const generateBig5TableData = (_ticker: string) => {
const topBrokers = ['LG', 'MG', 'BR', 'RG', 'CC'];

  // Generate data for all brokers first
  const allBrokerData = topBrokers.map(broker => {
    const nblot = Math.floor(Math.random() * 100000 + 20000);
    const nbval = Math.floor(Math.random() * 20 + 5); // Billions
    const bavg = Math.floor(Math.random() * 100 + 2700); // Price around 2700-2800
    
    return {
      broker,
      nblot,
      nbval,
      bavg,
      color: getBrokerColor(broker)
    };
  });
  
  // Calculate total NBLot for proportion calculation
  const totalNblot = allBrokerData.reduce((sum, data) => sum + data.nblot, 0);
  
  // Sort by NBLot descending (largest to smallest) and add totalNblot
  return allBrokerData
    .sort((a, b) => b.nblot - a.nblot) // Sort by NBLot descending
    .map(data => ({
      ...data,
      totalNblot
  }));
};


// TradingView-style chart component with dual Y-axis
const TradingViewChart = ({
  candlestickData,
  inventoryData,
  selectedBrokers,
  title: _title,
  volumeData
}: {
  candlestickData: any[],
  inventoryData: InventoryTimeSeries[],
  selectedBrokers: string[],
  title: string,
  volumeData?: any[]
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const userColors = useUserChartColors();

  // Get theme-aware colors
  const getThemeColors = () => {
    const isDark = document.documentElement.classList.contains('dark');
    return {
      textColor: isDark ? '#f9fafb' : '#111827',
      gridColor: isDark ? '#4b5563' : '#e5e7eb',
      borderColor: isDark ? '#6b7280' : '#d1d5db',
      axisTextColor: isDark ? '#d1d5db' : '#6b7280'
    };
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Clear existing chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const width = el.clientWidth || 800;
    const height = el.clientHeight || 400;
    const colors = getThemeColors();

    chartRef.current = createChart(el, {
      width,
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: colors.axisTextColor
      },
      grid: {
        horzLines: { color: colors.gridColor, style: 1 },
        vertLines: { color: colors.gridColor, style: 1 }
      },
      rightPriceScale: {
        borderColor: colors.borderColor,
        scaleMargins: { top: 0.1, bottom: 0.1 }
      },
      leftPriceScale: {
        visible: true,
        borderColor: colors.borderColor,
        scaleMargins: { top: 0.1, bottom: 0.1 }
      },
      timeScale: {
        borderColor: colors.borderColor,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: any) => {
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

    const chart = chartRef.current!;

    try {
      // Add candlestick series (right Y-axis - Price) to Pane 0
      const candlestickSeries = chart.addSeries(CandlestickSeries, {
        upColor: userColors.bullish,
        downColor: userColors.bearish,
        borderVisible: false,
        wickUpColor: userColors.bullish,
        wickDownColor: userColors.bearish,
        priceScaleId: 'right', // Use right price scale
      }, 0);

      candlestickSeries.setData(candlestickData.map(d => ({
        time: d.time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      })));

      // Add inventory lines for each selected broker (left Y-axis - Net Flow) to Pane 0
      selectedBrokers.forEach(broker => {
        const lineSeries = chart.addSeries(LineSeries, {
          color: getBrokerColor(broker),
          lineWidth: 2,
          title: broker,
          priceScaleId: 'left', // Use left price scale
        }, 0);

        lineSeries.setData(inventoryData.map(d => ({
          time: d.time,
          value: d[broker] as number,
        })));
      });

      // Add volume series to separate pane (Pane 1) if volumeData is provided
      if (volumeData && volumeData.length > 0) {
        const volumeSeries = chart.addSeries(HistogramSeries, {
          color: '#26a69a',
          priceFormat: {
            type: 'volume',
          },
          priceScaleId: 'right',
        }, 1);

        // Compute color based on corresponding candlestick movement
        const upMap: Record<string, boolean> = {};
        candlestickData.forEach((c: any) => {
          const t = c.time;
          upMap[t] = (c.close ?? 0) >= (c.open ?? 0);
        });

        volumeSeries.setData(volumeData.map(d => {
          const up = upMap[d.time] ?? ((d.value ?? 0) >= 0);
          return {
            time: d.time,
            value: d.value,
            color: up ? userColors.bullish : userColors.bearish,
          };
        }));

        // Set volume pane height to be smaller
        const volumePane = chart.panes()[1];
        if (volumePane) {
          volumePane.setHeight(120);
        }
      }

      chart.timeScale().fitContent();
    } catch (e) {
      console.error('Chart render error:', e);
    }
  }, [candlestickData, inventoryData, selectedBrokers, volumeData, userColors]);

  // Resize responsif
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, []);

  return (
    <div className="h-[600px] w-full relative">
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

      {/* Axis Labels */}
      <div
        className="absolute top-1/2 -left-22 text-sm text-muted-foreground font-bold whitespace-nowrap"
        style={{
          transform: 'translateY(-50%) rotate(-90deg)',
          transformOrigin: 'center',
          zIndex: 10
        }}
      >
        Kumulatif Net Flow (lot)
      </div>
      <div
        className="absolute top-1/2 -right-6 text-sm text-muted-foreground font-bold whitespace-nowrap"
        style={{
          transform: 'translateY(-50%) rotate(90deg)',
          transformOrigin: 'center',
          zIndex: 10
        }}
      >
        Price
      </div>
      <div
        className="absolute -bottom-6 left-1/2 text-sm text-muted-foreground font-bold whitespace-nowrap"
        style={{
          transform: 'translateX(-50%)',
          zIndex: 10
        }}
      >
        Timeframe
      </div>

      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
};

// Volume Chart Component
const VolumeChart = ({ volumeData, candlestickData, showLabel = true }: { volumeData: any[], candlestickData?: any[], showLabel?: boolean }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const userColors = useUserChartColors();

  // Get theme-aware colors
  const getThemeColors = () => {
    const isDark = document.documentElement.classList.contains('dark');
    return {
      textColor: isDark ? '#f9fafb' : '#111827',
      gridColor: isDark ? '#4b5563' : '#e5e7eb',
      borderColor: isDark ? '#6b7280' : '#d1d5db',
      axisTextColor: isDark ? '#d1d5db' : '#6b7280'
    };
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Clear existing chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const width = el.clientWidth || 800;
    const height = el.clientHeight || 150;
    const colors = getThemeColors();

    chartRef.current = createChart(el, {
      width,
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: colors.axisTextColor
      },
      grid: {
        horzLines: { color: colors.gridColor, style: 1 },
        vertLines: { color: colors.gridColor, style: 1 }
      },
      rightPriceScale: {
        borderColor: colors.borderColor,
        scaleMargins: { top: 0.1, bottom: 0.1 }
      },
      timeScale: {
        borderColor: colors.borderColor,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: any) => {
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

    const chart = chartRef.current!;

    try {
      // Add volume histogram series
      const volumeSeries = chart.addSeries(HistogramSeries, {
        color: '#26a69a',
        priceFormat: {
          type: 'volume',
        },
        priceScaleId: '',
      });

      // Build price up/down map if candlestickData provided
      const upMap: Record<string, boolean> = {};
      if (candlestickData && Array.isArray(candlestickData)) {
        candlestickData.forEach((c: any) => {
          const t = c.time;
          upMap[t] = (c.close ?? 0) >= (c.open ?? 0);
        });
      }

      volumeSeries.setData(volumeData.map(d => {
        const up = upMap[d.time] ?? (d.value ?? 0) >= 0;
        return {
          time: d.time,
          value: d.value,
          color: up ? userColors.bullish : userColors.bearish,
        };
      }));

      chart.timeScale().fitContent();
    } catch (e) {
      console.error('Volume chart render error:', e);
    }
  }, [volumeData, candlestickData, userColors]);

  // Resize responsif
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, []);

  return (
    <div className="h-32 w-full relative">
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

      {/* Volume Label - Only show if showLabel is true */}
      {showLabel && (
        <div
          className="absolute top-2 -right-6 text-sm text-muted-foreground font-bold whitespace-nowrap"
          style={{
            transform: 'translateY(-50%) rotate(90deg)',
            transformOrigin: 'center',
            zIndex: 10
          }}
        >
          Volume
        </div>
      )}

      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
};

// Individual Chart Components for Split View
const PriceChart = ({ candlestickData }: { candlestickData: any[] }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const userColors = useUserChartColors();

  const getThemeColors = () => {
    const isDark = document.documentElement.classList.contains('dark');
    return {
      textColor: isDark ? '#f9fafb' : '#111827',
      gridColor: isDark ? '#4b5563' : '#e5e7eb',
      borderColor: isDark ? '#6b7280' : '#d1d5db',
      axisTextColor: isDark ? '#d1d5db' : '#6b7280'
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
        textColor: colors.axisTextColor
      },
      grid: {
        horzLines: { color: colors.gridColor, style: 1 },
        vertLines: { color: colors.gridColor, style: 1 }
      },
      rightPriceScale: {
        borderColor: colors.borderColor,
        scaleMargins: { top: 0.1, bottom: 0.1 }
      },
      timeScale: {
        borderColor: colors.borderColor,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: any) => {
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

    const chart = chartRef.current!;

    try {
      const candlestickSeries = chart.addSeries(CandlestickSeries, {
        upColor: userColors.bullish,
        downColor: userColors.bearish,
        borderVisible: false,
        wickUpColor: userColors.bullish,
        wickDownColor: userColors.bearish,
        priceScaleId: 'right',
      });

      candlestickSeries.setData(candlestickData.map(d => ({
        time: d.time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      })));

      chart.timeScale().fitContent();
    } catch (e) {
      console.error('Price chart render error:', e);
    }
  }, [candlestickData, userColors]);

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
    <div className="h-80 w-full relative">
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

      {/* Price Label */}
      <div
        className="absolute top-1/2 -right-6 text-sm text-muted-foreground font-bold whitespace-nowrap"
        style={{
          transform: 'translateY(-50%) rotate(90deg)',
          transformOrigin: 'center',
          zIndex: 10
        }}
      >
        Price
      </div>

      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
};

const InventoryChart = ({ inventoryData, selectedBrokers }: { inventoryData: InventoryTimeSeries[], selectedBrokers: string[] }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const getThemeColors = () => {
    const isDark = document.documentElement.classList.contains('dark');
    return {
      textColor: isDark ? '#f9fafb' : '#111827',
      gridColor: isDark ? '#4b5563' : '#e5e7eb',
      borderColor: isDark ? '#6b7280' : '#d1d5db',
      axisTextColor: isDark ? '#d1d5db' : '#6b7280'
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
        textColor: colors.axisTextColor
      },
      grid: {
        horzLines: { color: colors.gridColor, style: 1 },
        vertLines: { color: colors.gridColor, style: 1 }
      },
      rightPriceScale: {
        borderColor: colors.borderColor,
        scaleMargins: { top: 0.1, bottom: 0.1 }
      },
      timeScale: {
        borderColor: colors.borderColor,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: any) => {
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

    const chart = chartRef.current!;

    try {
      selectedBrokers.forEach(broker => {
        const lineSeries = chart.addSeries(LineSeries, {
          color: getBrokerColor(broker),
          lineWidth: 2,
          title: broker,
          priceScaleId: 'right',
        });

        lineSeries.setData(inventoryData.map(d => ({
          time: d.time,
          value: d[broker] as number,
        })));
      });

      chart.timeScale().fitContent();
    } catch (e) {
      console.error('Inventory chart render error:', e);
    }
  }, [inventoryData, selectedBrokers]);

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
    <div className="h-80 w-full relative">
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

      {/* Inventory Label */}
      <div
        className="absolute top-1/2 -left-22 text-sm text-muted-foreground font-bold whitespace-nowrap"
        style={{
          transform: 'translateY(-50%) rotate(-90deg)',
          transformOrigin: 'center',
          zIndex: 10
        }}
      >
        Kumulatif Net Flow (lot)
      </div>

      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
};

// Removed unused chart components to improve performance

// Broker Footprint Overlay Component
const BrokerFootprintOverlay = ({ nblot, totalNblot, brokerColor }: { nblot: number, totalNblot: number, brokerColor: string }) => {
  // Calculate percentage of this broker's NBLot vs total NBLot
  const percentage = totalNblot > 0 ? (nblot / totalNblot) * 100 : 0;
  
  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-center px-3">
      {/* Single NBLot Proportion Bar - Full height of row */}
      <div className="relative h-full">
        <div
          className="absolute top-0 left-0 h-full rounded"
          style={{
            width: `${percentage}%`,
            backgroundColor: brokerColor,
            opacity: 0.3 // More transparent
          }}
        />
      </div>
    </div>
  );
};

export const BrokerInventoryPage = React.memo(function BrokerInventoryPage() {
  // State management
  const [selectedTicker, setSelectedTicker] = useState('BBCA');
  const [selectedBrokers, setSelectedBrokers] = useState<string[]>(['LG', 'MG', 'BR']);
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [brokerSearch, setBrokerSearch] = useState('');
  const [showBrokerSuggestions, setShowBrokerSuggestions] = useState(false);
  const [tickerSearch, setTickerSearch] = useState('');
  const [showTickerSuggestions, setShowTickerSuggestions] = useState(false);
  const [splitVisualization, setSplitVisualization] = useState(false);
  const [highlightedTickerIndex, setHighlightedTickerIndex] = useState<number>(-1);
  const [highlightedBrokerIndex, setHighlightedBrokerIndex] = useState<number>(-1);

  // Broker search handlers
  const handleBrokerSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase();
    setBrokerSearch(value);
    setShowBrokerSuggestions(true);
  };

  const handleBrokerSelect = (broker: string) => {
    if (!selectedBrokers.includes(broker)) {
      setSelectedBrokers([...selectedBrokers, broker]);
    }
    setBrokerSearch('');
    setShowBrokerSuggestions(false);
  };

  const removeBroker = (broker: string) => {
    setSelectedBrokers(selectedBrokers.filter(b => b !== broker));
  };

  // Ticker search handlers
  const handleTickerSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase();
    setTickerSearch(value);
    setShowTickerSuggestions(true);
  };

  const handleTickerSelect = (ticker: string) => {
    setSelectedTicker(ticker);
    setTickerSearch('');
    setShowTickerSuggestions(false);
  };

  const filteredBrokers = AVAILABLE_BROKERS.filter(broker =>
    broker.toLowerCase().includes(brokerSearch.toLowerCase()) &&
    !selectedBrokers.includes(broker)
  );

  const filteredTickers = AVAILABLE_TICKERS.filter(ticker =>
    ticker.toLowerCase().includes(tickerSearch.toLowerCase())
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.broker-dropdown')) {
        setShowBrokerSuggestions(false);
      }
      if (!target.closest('.ticker-dropdown')) {
        setShowTickerSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Generate data based on current selections
  const candlestickData = useMemo(() => {
    if (!selectedTicker || !startDate || !endDate) return [];
    return generateCandlestickData(selectedTicker, startDate, endDate);
  }, [selectedTicker, startDate, endDate]);

  const inventoryData = useMemo(() => {
    if (!selectedTicker || !startDate || !endDate) return [];
    return generateInventoryData(selectedTicker, selectedBrokers, startDate, endDate);
  }, [selectedTicker, selectedBrokers, startDate, endDate]);

  const volumeData = useMemo(() => {
    if (!selectedTicker || !startDate || !endDate) return [];
    return generateVolumeData(selectedTicker, startDate, endDate);
  }, [selectedTicker, startDate, endDate]);

  // Removed unused data generation functions to improve performance

  const big5TableData = useMemo(() =>
    generateBig5TableData(selectedTicker),
    [selectedTicker]
  );


  return (
    <div className="min-h-screen overflow-x-hidden">
      <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6">
        <div className="space-y-6">

          {/* Controls */}
      <Card>
        <CardHeader>
              <CardTitle>Broker Inventory Analysis Controls</CardTitle>
        </CardHeader>
        <CardContent>
               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Ticker Selection */}
                <div className="flex-1 min-w-0">
                  <label className="block text-sm font-medium mb-2">Ticker:</label>
                  <div className="relative ticker-dropdown">
                    <input
                      type="text"
                      placeholder="BBCA"
                      value={tickerSearch || selectedTicker}
                      onChange={(e) => { handleTickerSearchChange(e); setHighlightedTickerIndex(0); }}
                      onFocus={() => { setShowTickerSuggestions(true); setHighlightedTickerIndex(0); }}
                      onKeyDown={(e) => {
                        const baseList = tickerSearch.length === 0 ? AVAILABLE_TICKERS : filteredTickers;
                        const suggestions = baseList.slice(0, 10);
                        if (!suggestions.length) return;
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setHighlightedTickerIndex(prev => {
                            const next = prev + 1;
                            return next >= suggestions.length ? 0 : next;
                          });
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setHighlightedTickerIndex(prev => {
                            const next = prev - 1;
                            return next < 0 ? suggestions.length - 1 : next;
                          });
                        } else if (e.key === 'Enter' && showTickerSuggestions) {
                          e.preventDefault();
                          const idx = highlightedTickerIndex >= 0 ? highlightedTickerIndex : 0;
                          const choice = suggestions[idx];
                          if (choice) {
                            handleTickerSelect(choice);
                            setShowTickerSuggestions(false);
                            setHighlightedTickerIndex(-1);
                          }
                        } else if (e.key === 'Escape') {
                          setShowTickerSuggestions(false);
                          setHighlightedTickerIndex(-1);
                        }
                      }}
                      className="w-full px-3 py-2 border border-border rounded-md bg-input text-foreground text-sm"
                      role="combobox"
                      aria-expanded={showTickerSuggestions}
                      aria-controls="inv-ticker-suggestions"
                      aria-autocomplete="list"
                    />
                    
                    {!!tickerSearch && (
                      <button
                        className="absolute right-2 top-2.5 text-muted-foreground"
                        onClick={() => { setTickerSearch(''); setShowTickerSuggestions(false); }}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    
                    {showTickerSuggestions && (
                      (() => {
                        const baseList = tickerSearch.length === 0 ? AVAILABLE_TICKERS : filteredTickers;
                        const suggestions = baseList.slice(0, 10);
                        return (
                          <div id="inv-ticker-suggestions" role="listbox" className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-md border border-border bg-background shadow">
                            <div className="p-2">
                              {tickerSearch.length === 0 && (
                                <div className="text-xs text-muted-foreground mb-2">All Tickers:</div>
                              )}
                              {suggestions.map((ticker, idx) => (
                                <div
                                  key={ticker}
                                  role="option"
                                  aria-selected={idx === highlightedTickerIndex}
                                  onMouseEnter={() => setHighlightedTickerIndex(idx)}
                                  onMouseDown={(e) => { e.preventDefault(); }}
                                  onClick={() => { handleTickerSelect(ticker); setShowTickerSuggestions(false); setHighlightedTickerIndex(-1); }}
                                  className={`flex items-center space-x-2 p-2 rounded cursor-pointer ${idx === highlightedTickerIndex ? 'bg-accent' : 'hover:bg-muted'}`}
                                >
                                  <span className="text-sm">{ticker}</span>
                                </div>
                              ))}
                              {suggestions.length === 0 && (
                                <div className="p-2 text-sm text-muted-foreground">No tickers found</div>
                              )}
                            </div>
                          </div>
                        );
                      })()
                    )}
                  </div>
                </div>

                {/* Broker Selection */}
                <div className="flex-1 min-w-0">
                  <label className="block text-sm font-medium mb-2">Broker:</label>
                  <div className="relative broker-dropdown">
                    <input
                      type="text"
                      placeholder="Broker..."
                      value={brokerSearch}
                      onChange={(e) => { handleBrokerSearchChange(e); setHighlightedBrokerIndex(0); }}
                      onFocus={() => { setShowBrokerSuggestions(true); setHighlightedBrokerIndex(0); }}
                      onKeyDown={(e) => {
                        const baseList = brokerSearch.length === 0
                          ? AVAILABLE_BROKERS.filter(b => !selectedBrokers.includes(b))
                          : filteredBrokers;
                        const suggestions = baseList.slice(0, 10);
                        if (!suggestions.length) return;
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setHighlightedBrokerIndex(prev => {
                            const next = prev + 1;
                            return next >= suggestions.length ? 0 : next;
                          });
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setHighlightedBrokerIndex(prev => {
                            const next = prev - 1;
                            return next < 0 ? suggestions.length - 1 : next;
                          });
                        } else if (e.key === 'Enter' && showBrokerSuggestions) {
                          e.preventDefault();
                          const idx = highlightedBrokerIndex >= 0 ? highlightedBrokerIndex : 0;
                          const choice = suggestions[idx];
                          if (choice) {
                            handleBrokerSelect(choice);
                            setShowBrokerSuggestions(false);
                            setHighlightedBrokerIndex(-1);
                          }
                        } else if (e.key === 'Escape') {
                          setShowBrokerSuggestions(false);
                          setHighlightedBrokerIndex(-1);
                        }
                      }}
                      className="w-full px-3 py-2 border border-border rounded-md bg-input text-foreground text-sm"
                      role="combobox"
                      aria-expanded={showBrokerSuggestions}
                      aria-controls="inv-broker-suggestions"
                      aria-autocomplete="list"
                    />
                    
                    {!!brokerSearch && (
                      <button
                        className="absolute right-2 top-2.5 text-muted-foreground"
                        onClick={() => { setBrokerSearch(''); setShowBrokerSuggestions(false); }}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    
                    {showBrokerSuggestions && (
                      (() => {
                        const baseList = brokerSearch.length === 0
                          ? AVAILABLE_BROKERS.filter(b => !selectedBrokers.includes(b))
                          : filteredBrokers;
                        const suggestions = baseList.slice(0, 10);
                        return (
                          <div id="inv-broker-suggestions" role="listbox" className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-md border border-border bg-background shadow">
                            <div className="p-2">
                              {brokerSearch.length === 0 && (
                                <div className="text-xs text-muted-foreground mb-2">All Brokers:</div>
                              )}
                              {suggestions.map((broker, idx) => (
                                <div
                                  key={broker}
                                  role="option"
                                  aria-selected={idx === highlightedBrokerIndex}
                                  onMouseEnter={() => setHighlightedBrokerIndex(idx)}
                                  onMouseDown={(e) => { e.preventDefault(); }}
                                  onClick={() => { handleBrokerSelect(broker); setShowBrokerSuggestions(false); setHighlightedBrokerIndex(-1); }}
                                  className={`flex items-center space-x-2 p-2 rounded cursor-pointer ${idx === highlightedBrokerIndex ? 'bg-accent' : 'hover:bg-muted'}`}
                                >
                                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getBrokerColor(broker) }} />
                                  <span className="text-sm">{broker}</span>
                                </div>
                              ))}
                              {suggestions.length === 0 && (
                                <div className="p-2 text-sm text-muted-foreground">No brokers found</div>
                              )}
                            </div>
                          </div>
                        );
                      })()
                    )}
                  </div>
                </div>

                {/* Date Range */}
                <div className="flex-1 min-w-0">
                  <label className="block text-sm font-medium mb-2">Date Range:</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="flex-1 px-3 py-2 border border-border rounded-md bg-input text-foreground text-sm min-w-0"
                    />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">to</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="flex-1 px-3 py-2 border border-border rounded-md bg-input text-foreground text-sm min-w-0"
                    />
                  </div>
                </div>

                {/* Split Visualization Toggle */}
                <div className="flex-1 min-w-0 w-full lg:w-auto lg:flex-none">
                  <label className="block text-sm font-medium mb-2">Visualization:</label>
                  <div className="flex sm:inline-flex items-center gap-1 border border-border rounded-lg p-1 overflow-x-auto w-full sm:w-auto lg:w-auto justify-center sm:justify-start">
                    <div className="grid grid-cols-2 gap-1 w-full max-w-xs mx-auto sm:flex sm:items-center sm:gap-1 sm:max-w-none sm:mx-0">
                      <Button
                        variant={!splitVisualization ? "default" : "ghost"}
                        onClick={() => setSplitVisualization(false)}
                        size="sm"
                        className="px-3 py-1 h-8 text-xs"
                      >
                        Combined
                      </Button>
                      <Button
                        variant={splitVisualization ? "default" : "ghost"}
                        onClick={() => setSplitVisualization(true)}
                        size="sm"
                        className="px-3 py-1 h-8 text-xs"
                      >
                        Split
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Selected Brokers Display */}
              {selectedBrokers.length > 0 && (
                <div className="mt-4">
                  <label className="text-sm font-medium">Selected Brokers:</label>
              <div className="flex flex-wrap gap-2 mt-2">
                    {selectedBrokers.map(broker => (
                  <Badge 
                    key={broker} 
                    variant="outline"
                    className="border"
                    style={{ 
                      borderColor: getBrokerColor(broker),
                      color: getBrokerColor(broker)
                    }}
                  >
                        <div
                          className="w-2 h-2 rounded-full mr-1"
                          style={{ backgroundColor: getBrokerColor(broker) }}
                        />
                    {broker}
                        <button
                          onClick={() => removeBroker(broker)}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="w-3 h-3" />
                        </button>
                  </Badge>
                ))}
              </div>
            </div>
              )}
            </CardContent>
          </Card>

          {/* Conditional Chart Rendering */}
          {splitVisualization ? (
            // Split View - Individual Charts
            <>
              {/* Price Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>{selectedTicker} Price Action</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Candlestick chart showing price movements
                  </p>
                </CardHeader>
                <CardContent>
                  <PriceChart candlestickData={candlestickData} />
                </CardContent>
              </Card>

              {/* Inventory Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Broker Cumulative Net Flow</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Broker inventory accumulation starting from 0
                  </p>
                </CardHeader>
                <CardContent>
                  <InventoryChart
                    inventoryData={inventoryData}
                    selectedBrokers={selectedBrokers}
                  />
                </CardContent>
              </Card>

              {/* Volume Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Volume</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Trading volume for {selectedTicker}
                  </p>
                </CardHeader>
                <CardContent>
                  <VolumeChart volumeData={volumeData} candlestickData={candlestickData} showLabel={true} />
                </CardContent>
              </Card>
            </>
          ) : (
            // Combined View - Original Layout
            <>
              {/* Main TradingView Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>{selectedTicker} Inventory Analysis</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Price action (right Y-axis) with broker cumulative net flow (left Y-axis, starting from 0)
                  </p>
                </CardHeader>
                <CardContent>
                  <TradingViewChart
                    candlestickData={candlestickData}
                    inventoryData={inventoryData}
                    selectedBrokers={selectedBrokers}
                    title={`${selectedTicker} Inventory Analysis`}
                    volumeData={volumeData}
                  />
        </CardContent>
      </Card>
            </>
          )}            
          {/* Big 5 Gross & Net Table */}
          <Card>
            <CardHeader>
              <CardTitle>Big 5 Gross & Net Analysis</CardTitle>
              <p className="text-sm text-muted-foreground">
                Top 5 brokers by trading volume for {selectedTicker}
              </p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-accent/30">
                      <th className="text-left py-2 px-3 font-medium">NBY</th>
                      <th className="text-right py-2 px-3 font-medium">NBLot</th>
                      <th className="text-right py-2 px-3 font-medium">NBVal</th>
                      <th className="text-right py-2 px-3 font-medium">BAvg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {big5TableData.map((row, _index) => {
                      const isDarkMode = useDarkMode();
                      return (
                        <tr key={row.broker} className={`border-b border-border/50 hover:opacity-80 relative ${getBrokerBackgroundClass(row.broker, isDarkMode)}`}>
                          <td className={`py-3 px-3 font-medium relative z-10 ${getBrokerTextClass(row.broker, isDarkMode)}`}>
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: row.color }}
                            />
                            {row.broker}
            </div>
                        </td>
                        <td className="text-right py-3 px-3 text-green-600 font-medium relative z-10">
                          {row.nblot.toLocaleString()}
                        </td>
                        <td className="text-right py-3 px-3 text-green-600 font-medium relative z-10">
                          {row.nbval}B
                        </td>
                        <td className="text-right py-3 px-3 font-medium relative z-10">
                          {row.bavg.toLocaleString()}
                        </td>
                        {/* Footprint Overlay */}
                        <BrokerFootprintOverlay 
                          nblot={row.nblot}
                          totalNblot={row.totalNblot}
                          brokerColor={row.color}
                        />
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
          </div>
        </CardContent>
      </Card>
        </div>
      </div>
    </div>
  );
});
