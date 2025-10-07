import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Calendar, Plus, X } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, BarChart, Bar, ComposedChart } from 'recharts';
import { getBrokerBackgroundClass, getBrokerTextClass, useDarkMode } from '../utils/brokerColors';
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineSeries,
  AreaSeries,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
} from 'lightweight-charts';
import { useUserChartColors } from '../hooks/useUserChartColors';

interface BrokerInventoryData {
  broker: string;
  nblot: number;
  nbval: number;
  bavg: number;
  gross: number;
  net: number;
}

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
const generateInventoryData = (ticker: string, selectedBrokers: string[], startDate: string, endDate: string) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

  const data: InventoryTimeSeries[] = [];

  for (let i = 0; i <= days; i++) {
    const currentDate = new Date(start);
    currentDate.setDate(start.getDate() + i);
    const timeStr = currentDate.toISOString().split('T')[0];

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
const generateCandlestickData = (ticker: string, startDate: string, endDate: string) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

  const data: any[] = [];
  let basePrice = 2700 + Math.random() * 200; // Base price around 2700-2900

  for (let i = 0; i <= days; i++) {
    const currentDate = new Date(start);
    currentDate.setDate(start.getDate() + i);
    const timeStr = currentDate.toISOString().split('T')[0];

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
const generateVolumeData = (ticker: string, startDate: string, endDate: string) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

  const data: any[] = [];

  for (let i = 0; i <= days; i++) {
    const currentDate = new Date(start);
    currentDate.setDate(start.getDate() + i);
    const timeStr = currentDate.toISOString().split('T')[0];

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
const generateBrokerGrossNetData = (ticker: string, selectedBrokers: string[]) => {
  return selectedBrokers.map(broker => {
    const gross = Math.floor(Math.random() * 100000 + 20000);
    const net = Math.floor((Math.random() - 0.3) * gross); // Net can be positive or negative
    
    return {
      broker,
      gross,
      net,
      grossColor: '#3B82F6',
      netColor: net >= 0 ? '#10B981' : '#EF4444'
    };
  });
};

// Generate broker summary data for bar chart with numbers
const generateBrokerSummaryData = (ticker: string, selectedBrokers: string[]) => {
  return selectedBrokers.map(broker => {
    const value = Math.floor(Math.random() * 50000 + 10000);
    return {
      broker,
      value,
      color: getBrokerColor(broker)
    };
  });
};

// Generate Big 5 Gross & Net table data
const generateBig5TableData = (ticker: string) => {
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
  title,
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

// Broker Gross/Net Horizontal Bar Chart Component
const BrokerGrossNetChart = ({ data }: { data: any[] }) => {
  const maxValue = Math.max(...data.map(d => Math.max(d.gross, Math.abs(d.net))));

  return (
    <div className="space-y-3">
      {data.map((item, index) => (
        <div key={item.broker} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{item.broker}</span>
            <div className="flex gap-4 text-xs">
              <span className="text-blue-600">Gross: {item.gross.toLocaleString()}</span>
              <span className={item.net >= 0 ? 'text-green-600' : 'text-red-600'}>
                Net: {item.net >= 0 ? '+' : ''}{item.net.toLocaleString()}
              </span>
            </div>
          </div>
          <div className="relative h-6 bg-gray-100 rounded">
            {/* Gross Bar */}
            <div 
              className="absolute top-0 left-0 h-3 rounded-l"
              style={{ 
                width: `${(item.gross / maxValue) * 100}%`,
                backgroundColor: item.grossColor 
              }}
            />
            {/* Net Bar */}
            <div 
              className="absolute bottom-0 left-0 h-3 rounded-r"
              style={{ 
                width: `${(Math.abs(item.net) / maxValue) * 100}%`,
                backgroundColor: item.netColor 
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

// Broker Summary Bar Chart Component
const BrokerSummaryChart = ({ data }: { data: any[] }) => {
  const maxValue = Math.max(...data.map(d => d.value));
  
  return (
    <div className="space-y-3">
      {data.map((item, index) => (
        <div key={item.broker} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{item.broker}</span>
            <span className="text-sm font-bold">{item.value.toLocaleString()}</span>
          </div>
          <div className="relative h-6 bg-gray-100 rounded">
            <div 
              className="absolute top-0 left-0 h-full rounded"
              style={{ 
                width: `${(item.value / maxValue) * 100}%`,
                backgroundColor: item.color 
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

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

export function BrokerInventoryPage() {
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
  const candlestickData = useMemo(() =>
    generateCandlestickData(selectedTicker, startDate, endDate),
    [selectedTicker, startDate, endDate]
  );

  const inventoryData = useMemo(() =>
    generateInventoryData(selectedTicker, selectedBrokers, startDate, endDate),
    [selectedTicker, selectedBrokers, startDate, endDate]
  );

  const volumeData = useMemo(() =>
    generateVolumeData(selectedTicker, startDate, endDate),
    [selectedTicker, startDate, endDate]
  );

  const brokerGrossNetData = useMemo(() =>
    generateBrokerGrossNetData(selectedTicker, selectedBrokers),
    [selectedTicker, selectedBrokers]
  );

  const brokerSummaryData = useMemo(() =>
    generateBrokerSummaryData(selectedTicker, selectedBrokers),
    [selectedTicker, selectedBrokers]
  );

  const big5TableData = useMemo(() =>
    generateBig5TableData(selectedTicker),
    [selectedTicker]
  );


  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
        <div className="space-y-6">

          {/* Controls */}
      <Card>
        <CardHeader>
              <CardTitle>Broker Inventory Analysis Controls</CardTitle>
        </CardHeader>
        <CardContent>
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                {/* Ticker Selection */}
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium">Tickers:</label>
                  <div className="relative ticker-dropdown">
                    <input
                      type="text"
                      placeholder="BBCA"
                      value={tickerSearch || selectedTicker}
                      onChange={handleTickerSearchChange}
                      onFocus={() => setShowTickerSuggestions(true)}
                      className="px-3 py-1.5 border border-border rounded-md bg-input text-foreground w-24"
                    />
                    
                    {!!tickerSearch && (
                      <button
                        className="absolute right-1 top-1.5 text-muted-foreground"
                        onClick={() => { setTickerSearch(''); setShowTickerSuggestions(false); }}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                    
                    {showTickerSuggestions && (
                      <div className="absolute z-20 mt-1 w-32 max-h-56 overflow-auto rounded-md border border-border bg-background shadow">
                        {tickerSearch.length === 0 ? (
                          // Show all tickers when empty
                          <div className="p-2">
                            <div className="text-xs text-muted-foreground mb-2">All Tickers:</div>
                            {AVAILABLE_TICKERS.slice(0, 10).map((ticker) => (
                              <div
                                key={ticker}
                                onClick={() => handleTickerSelect(ticker)}
                                className="flex items-center space-x-2 p-2 hover:bg-muted rounded cursor-pointer"
                              >
                                <span className="text-sm">{ticker}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          // Show filtered tickers when typing
                          <div className="p-2">
                            {filteredTickers.slice(0, 10).map((ticker) => (
                              <div
                                key={ticker}
                                onClick={() => handleTickerSelect(ticker)}
                                className="flex items-center space-x-2 p-2 hover:bg-muted rounded cursor-pointer"
                              >
                                <span className="text-sm">{ticker}</span>
                              </div>
                            ))}
                            {filteredTickers.length === 0 && (
                              <div className="p-2 text-sm text-muted-foreground">
                                No tickers found
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
          </div>

                {/* Broker Selection */}
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium">Brokers:</label>
                  <div className="relative broker-dropdown">
                    <input
                      type="text"
                      placeholder="Broker..."
                      value={brokerSearch}
                      onChange={handleBrokerSearchChange}
                      onFocus={() => setShowBrokerSuggestions(true)}
                      className="px-3 py-1.5 border border-border rounded-md bg-input text-foreground w-32"
                    />
                    
                    {!!brokerSearch && (
                      <button
                        className="absolute right-1 top-1.5 text-muted-foreground"
                        onClick={() => { setBrokerSearch(''); setShowBrokerSuggestions(false); }}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                    
                    {showBrokerSuggestions && (
                      <div className="absolute z-20 mt-1 w-40 max-h-56 overflow-auto rounded-md border border-border bg-background shadow">
                        {brokerSearch.length === 0 ? (
                          // Show all brokers when empty
                          <div className="p-2">
                            <div className="text-xs text-muted-foreground mb-2">All Brokers:</div>
                            {AVAILABLE_BROKERS.filter(broker => !selectedBrokers.includes(broker)).slice(0, 10).map((broker) => (
                              <div
                  key={broker}
                                onClick={() => handleBrokerSelect(broker)}
                                className="flex items-center space-x-2 p-2 hover:bg-muted rounded cursor-pointer"
                              >
                      <div 
                        className="w-3 h-3 rounded-full" 
                                  style={{ backgroundColor: getBrokerColor(broker) }}
                                />
                                <span className="text-sm">{broker}</span>
              </div>
                            ))}
              </div>
                        ) : (
                          // Show filtered brokers when typing
                          <div className="p-2">
                            {filteredBrokers.slice(0, 10).map((broker) => (
                              <div
                                key={broker}
                                onClick={() => handleBrokerSelect(broker)}
                                className="flex items-center space-x-2 p-2 hover:bg-muted rounded cursor-pointer"
                              >
                      <div 
                        className="w-3 h-3 rounded-full" 
                                  style={{ backgroundColor: getBrokerColor(broker) }}
                                />
                                <span className="text-sm">{broker}</span>
              </div>
                            ))}
                            {filteredBrokers.length === 0 && (
                              <div className="p-2 text-sm text-muted-foreground">
                                No brokers found
            </div>
                            )}
          </div>
                        )}
                      </div>
                    )}
                  </div>
          </div>

                {/* Date Range */}
                <div className="flex items-center gap-2">
                  <label className="font-medium">Date Range:</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="px-3 py-1 border border-border rounded-md bg-background text-foreground"
                  />
                  <span>to</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="px-3 py-1 border border-border rounded-md bg-background text-foreground"
                  />
              </div>

                {/* Split Visualization Toggle */}
                <div className="flex items-center gap-2">
                  <label className="font-medium">Visualization:</label>
                  <div className="flex gap-1">
                    <Button
                      variant={!splitVisualization ? "default" : "outline"}
                      onClick={() => setSplitVisualization(false)}
                      className="px-3 py-1"
                    >
                      Combined
                    </Button>
                    <Button
                      variant={splitVisualization ? "default" : "outline"}
                      onClick={() => setSplitVisualization(true)}
                      className="px-3 py-1"
                    >
                      Split
                    </Button>
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
                    {big5TableData.map((row, index) => {
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
}