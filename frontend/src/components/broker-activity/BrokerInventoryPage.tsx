import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { X, Calendar } from 'lucide-react';
// Removed unused Recharts imports
// Removed unused imports
import { api } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
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

// Available tickers (now using API data)
// const AVAILABLE_TICKERS = [
//   'BBCA', 'BBRI', 'BMRI', 'BBNI', 'ARTO', 'BACA', 'TLKM', 'ISAT', 'FREN', 'EXCL',
//   'ASII', 'GOTO', 'ANTM', 'MDKA', 'ADRO', 'UNVR', 'ICBP', 'INDF', 'PGAS', 'MEDC',
//   'CPIN', 'JPFA', 'INCO', 'TPIA', 'TKIM', 'INKP', 'BRIS', 'SIDO', 'ERAA', 'ESSA'
// ];

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

// Generate broker gross/net data for horizontal bar chart
// Removed unused data generation functions to improve performance

// Generate Top Brokers data for each date (general, not per ticker)
const generateTopBrokersData = (dates: string[], count: 5 | 10 | 15 | 20 | 'all') => {
  const allBrokers = ['LG', 'MG', 'BR', 'RG', 'CC', 'AK', 'BK', 'DH', 'KZ', 'YU', 'ZP', 'AG', 'NI', 'PD', 'SQ', 'SS', 'CIMB', 'UOB', 'COIN', 'NH'];
  
  // First, determine the color mapping based on the first date's top 5
  const firstDate = dates[0];
  if (!firstDate) return [];
  
  const firstDateSeed = firstDate.split('-').reduce((acc, part) => acc + parseInt(part), 0);
  
  const firstDateBrokerVolumes = allBrokers.map(broker => {
    const brokerSeed = firstDateSeed + broker.charCodeAt(0) + broker.charCodeAt(1);
    const volume = Math.floor((brokerSeed * 9301 + 49297) % 233280 / 233280 * 1000000 + 10000);
    return { broker, volume };
  });
  
  // Get top 5 from first date to establish color mapping
  const firstDateTop5 = firstDateBrokerVolumes
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 5);
  
  // Create color mapping for all brokers based on first date's top 5
  const brokerColorMap = new Map();
  firstDateTop5.forEach((brokerData) => {
    brokerColorMap.set(brokerData.broker, getBrokerColor(brokerData.broker));
  });
  
  // Assign colors to remaining brokers
  allBrokers.forEach((broker) => {
    if (!brokerColorMap.has(broker)) {
      brokerColorMap.set(broker, getBrokerColor(broker));
    }
  });
  
  return dates.map(date => {
    // Create deterministic seed based on date only (not ticker)
    const seed = date.split('-').reduce((acc, part) => acc + parseInt(part), 0);
    
    // Generate random volume for each broker
    const brokerVolumes = allBrokers.map(broker => {
      const brokerSeed = seed + broker.charCodeAt(0) + broker.charCodeAt(1);
      const volume = Math.floor((brokerSeed * 9301 + 49297) % 233280 / 233280 * 1000000 + 10000);
      return { broker, volume };
    });
    
    // Sort by volume descending and take top N based on count
    const topN = brokerVolumes
      .sort((a, b) => b.volume - a.volume)
      .slice(0, count === 'all' ? allBrokers.length : count)
      .map(item => ({
        broker: item.broker,
        volume: item.volume,
        color: brokerColorMap.get(item.broker) // Use color from first date mapping
      }));
    
    return {
      date,
      topBrokers: topN
    };
  });
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
        const brokerData = inventoryData.map(d => ({
          time: d.time,
          value: d[broker] as number,
        })).filter(d => d.value !== undefined && d.value !== null);
        
        console.log(`📊 Adding series for broker ${broker}:`, {
          brokerDataLength: brokerData.length,
          sampleData: brokerData.slice(0, 3),
          hasData: brokerData.length > 0
        });
        
        if (brokerData.length > 0) {
          const lineSeries = chart.addSeries(LineSeries, {
            color: getBrokerColor(broker),
            lineWidth: 2,
            title: broker,
            priceScaleId: 'left', // Use left price scale
          }, 0);

          lineSeries.setData(brokerData);
        } else {
          console.warn(`⚠️ No data found for broker ${broker}`);
        }
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
        const brokerData = inventoryData.map(d => ({
          time: d.time,
          value: d[broker] as number,
        })).filter(d => d.value !== undefined && d.value !== null);
        
        console.log(`📊 InventoryChart: Adding series for broker ${broker}:`, {
          brokerDataLength: brokerData.length,
          sampleData: brokerData.slice(0, 3),
          hasData: brokerData.length > 0
        });
        
        if (brokerData.length > 0) {
          const lineSeries = chart.addSeries(LineSeries, {
            color: getBrokerColor(broker),
            lineWidth: 2,
            title: broker,
            priceScaleId: 'right',
          });

          lineSeries.setData(brokerData);
        } else {
          console.warn(`⚠️ InventoryChart: No data found for broker ${broker}`);
        }
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


export const BrokerInventoryPage = React.memo(function BrokerInventoryPage() {
  const { showToast } = useToast();
  
  // State management
  const [selectedTicker, setSelectedTicker] = useState('BBCA');
  const [selectedBrokers, setSelectedBrokers] = useState<string[]>([]);
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
  const [highlightedBrokerIndex, setHighlightedBrokerIndex] = useState(-1);
  const [tickerSearch, setTickerSearch] = useState('');
  const [showTickerSuggestions, setShowTickerSuggestions] = useState(false);
  const [splitVisualization, setSplitVisualization] = useState(false);
  const [highlightedTickerIndex, setHighlightedTickerIndex] = useState<number>(-1);
  const [topBrokersCount, setTopBrokersCount] = useState<5 | 10 | 15 | 20 | 'all'>('all');
  const [availableStocks, setAvailableStocks] = useState<string[]>([]);
  const [isLoadingStocks, setIsLoadingStocks] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isLoadingBrokerData, setIsLoadingBrokerData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [brokerDataError, setBrokerDataError] = useState<string | null>(null);
  const [ohlcData, setOhlcData] = useState<any[]>([]);
  const [volumeData, setVolumeData] = useState<any[]>([]);
  const [brokerSummaryData, setBrokerSummaryData] = useState<any[]>([]);
  const [availableBrokersForStock, setAvailableBrokersForStock] = useState<string[]>([]);
  const [isLoadingBrokersForStock, setIsLoadingBrokersForStock] = useState(false);



  const formatDisplayDate = (dateString: string): string => {
    const date = new Date(dateString);
    const isNewYear = date.getMonth() === 0 && date.getDate() === 1; // January 1st
    
    return date.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: isNewYear ? 'numeric' : undefined
    });
  };


  // Load available stocks and broker dates on component mount
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setIsLoadingStocks(true);
        
        // Load available stocks
        const response = await api.getStockList();
        if (response.success && response.data?.stocks) {
          setAvailableStocks(response.data.stocks);
          console.log(`📊 Loaded ${response.data.stocks.length} stocks from API`);
        } else {
          console.warn('⚠️ No stocks data received from API');
        }
        
      } catch (error) {
        console.error('Error loading initial data:', error);
        showToast({
          type: 'error',
          title: 'Error Memuat Data',
          message: 'Gagal memuat data awal.'
        });
      } finally {
        setIsLoadingStocks(false);
      }
    };
    
    loadInitialData();
  }, [showToast]);

  // Load OHLC and volume data when ticker or date range changes
  useEffect(() => {
    const loadStockData = async () => {
      if (!selectedTicker || !startDate || !endDate) return;
      
      setIsLoadingData(true);
      setDataError(null);
      
      try {
        console.log(`📊 Loading stock data for ${selectedTicker} from ${startDate} to ${endDate}`);
        
        // Call stock API to get OHLC data
        const response = await api.getStockData(selectedTicker, {
          startDate,
          endDate,
          limit: 1000 // Get up to 1000 records
        });
        
        if (response.success && response.data?.data) {
          const stockData = response.data.data;
          console.log(`📊 Received ${stockData.length} records for ${selectedTicker}`);
          
          // Convert to candlestick format for charts
          const candlestickData = stockData.map((row: any) => ({
            time: row.Date,
            open: row.Open || 0,
            high: row.High || 0,
            low: row.Low || 0,
            close: row.Close || 0,
            volume: row.Volume || 0
          }));
          
          // Convert to volume format for charts
          const volumeChartData = stockData.map((row: any) => ({
            time: row.Date,
            value: row.Volume || 0,
            color: (row.Close || 0) >= (row.Open || 0) ? '#16a34a' : '#dc2626'
          }));
          
          setOhlcData(candlestickData);
          setVolumeData(volumeChartData);
          
          console.log(`📊 Processed data: ${candlestickData.length} OHLC records, ${volumeChartData.length} volume records`);
          
        } else {
          throw new Error(response.error || 'Failed to load stock data');
        }
        
      } catch (error) {
        console.error('Error loading stock data:', error);
        setDataError(error instanceof Error ? error.message : 'Failed to load stock data');
        showToast({
          type: 'error',
          title: 'Error Memuat Data',
          message: 'Gagal memuat data OHLC dan volume.'
        });
      } finally {
        setIsLoadingData(false);
      }
    };
    
    loadStockData();
  }, [selectedTicker, startDate, endDate, showToast]);

  // Load broker summary data when ticker, date range, or selected brokers change
  useEffect(() => {
    const loadBrokerData = async () => {
      if (!selectedTicker || !startDate || !endDate || selectedBrokers.length === 0 || ohlcData.length === 0) return;
      
      setIsLoadingBrokerData(true);
      setBrokerDataError(null);
      
      try {
        console.log(`📊 Loading broker summary data for ${selectedTicker} from ${startDate} to ${endDate}`);
        console.log(`📊 OHLC data available: ${ohlcData.length} records`);
        
        // Get dates from OHLC data instead of generating them
        const ohlcDates = ohlcData.map(d => d.time).sort();
        console.log(`📊 Using ${ohlcDates.length} dates from OHLC data:`, ohlcDates.slice(0, 5), '...');
        
        if (ohlcDates.length === 0) {
          console.log('⚠️ No OHLC dates available');
          setBrokerSummaryData([]);
          return;
        }
        
        // Load broker data for each OHLC date
        const allBrokerData: any[] = [];
        let successfulDates = 0;
        
        for (const dateStr of ohlcDates.slice(0, 30)) { // Limit to 30 days for performance
          try {
            // Convert date from YYYY-MM-DD to YYYYMMDD format for broker API
            const brokerDateStr = dateStr.replace(/-/g, '');
            
            const response = await api.getBrokerSummaryData(selectedTicker, brokerDateStr);
            
            console.log(`📊 Broker API response for ${dateStr} (${brokerDateStr}):`, {
              success: response.success,
              hasData: !!response.data?.brokerData,
              dataLength: response.data?.brokerData?.length || 0
            });
            
            if (response.success && response.data?.brokerData) {
              const brokerData = response.data.brokerData;
              
              // Filter for selected brokers only
              const filteredBrokerData = brokerData.filter((broker: any) => 
                selectedBrokers.includes(broker.broker)
              );
              
              console.log(`📊 Broker filtering for ${dateStr}:`, {
                totalBrokers: brokerData.length,
                selectedBrokers: selectedBrokers,
                filteredBrokers: filteredBrokerData.length,
                brokerNames: brokerData.map((b: any) => b.broker).slice(0, 5)
              });
              
              // Only add data if we have brokers for this date
              if (filteredBrokerData.length > 0) {
                // Add date to each broker record
                filteredBrokerData.forEach((broker: any) => {
                  allBrokerData.push({
                    ...broker,
                    date: dateStr, // Use original OHLC date format
                    time: dateStr // For chart compatibility
                  });
                });
                
                successfulDates++;
                console.log(`✅ Broker data loaded for ${dateStr}: ${filteredBrokerData.length} brokers (${filteredBrokerData.map((b: any) => b.broker).join(', ')})`);
              } else {
                console.log(`⚠️ No selected brokers found for ${selectedTicker} on ${dateStr} - skipping`);
              }
            } else {
              console.log(`⚠️ No broker data for ${selectedTicker} on ${dateStr} - skipping`);
            }
          } catch (error) {
            console.warn(`⚠️ Error loading broker data for ${dateStr}:`, error);
            // Continue to next date instead of stopping
          }
        }
        
        console.log(`📊 Total broker data loaded: ${allBrokerData.length} records across ${successfulDates} successful dates`);
        console.log(`📊 Sample broker data:`, allBrokerData.slice(0, 3));
        
        if (allBrokerData.length === 0) {
          console.log(`⚠️ No broker data found for selected brokers: ${selectedBrokers.join(', ')}`);
          setBrokerDataError(`No broker data found for selected brokers: ${selectedBrokers.join(', ')}`);
        } else {
          setBrokerDataError(null);
        }
        
        setBrokerSummaryData(allBrokerData);
        
        console.log(`📊 Broker summary data set: ${allBrokerData.length} records`);
        
      } catch (error) {
        console.error('Error loading broker data:', error);
        setBrokerDataError(error instanceof Error ? error.message : 'Failed to load broker data');
        showToast({
          type: 'error',
          title: 'Error Memuat Data Broker',
          message: 'Gagal memuat data broker summary.'
        });
      } finally {
        setIsLoadingBrokerData(false);
      }
    };
    
    loadBrokerData();
  }, [selectedTicker, startDate, endDate, selectedBrokers, ohlcData, showToast]);

  // Load available brokers for selected stock code
  useEffect(() => {
    const loadBrokersForStock = async () => {
      if (!selectedTicker || ohlcData.length === 0) {
        setAvailableBrokersForStock([]);
        return;
      }
      
      try {
        console.log(`📊 Loading available brokers for stock: ${selectedTicker}`);
        setIsLoadingBrokersForStock(true);
        
        // Get the most recent date from OHLC data
        const mostRecentDate = ohlcData[ohlcData.length - 1]?.time; // OHLC data is sorted oldest first
        
        if (mostRecentDate) {
          // Convert date from YYYY-MM-DD to YYYYMMDD format for broker API
          const brokerDateStr = mostRecentDate.replace(/-/g, '');
          
          const response = await api.getBrokerSummaryData(selectedTicker, brokerDateStr);
          
          if (response.success && response.data?.brokerData) {
            const brokers = response.data.brokerData.map((broker: any) => broker.broker).filter(Boolean);
            const uniqueBrokers = [...new Set(brokers)].sort() as string[];
            
            console.log(`📊 Found ${uniqueBrokers.length} brokers for ${selectedTicker} on ${mostRecentDate}:`, uniqueBrokers);
            setAvailableBrokersForStock(uniqueBrokers);
            
            // Auto-select first 3 brokers if none are selected
            if (selectedBrokers.length === 0 && uniqueBrokers.length > 0) {
              const autoSelectedBrokers = uniqueBrokers.slice(0, 3) as string[];
              console.log(`📊 Auto-selecting brokers:`, autoSelectedBrokers);
              setSelectedBrokers(autoSelectedBrokers);
            } else {
              // Update selected brokers to only include those available for this stock
              const validSelectedBrokers = selectedBrokers.filter(broker => uniqueBrokers.includes(broker));
              if (validSelectedBrokers.length !== selectedBrokers.length) {
                console.log(`📊 Updating selected brokers to match available brokers:`, validSelectedBrokers);
                setSelectedBrokers(validSelectedBrokers);
              }
            }
          } else {
            console.log(`⚠️ No broker data found for ${selectedTicker} on ${mostRecentDate}`);
            setAvailableBrokersForStock([]);
            setSelectedBrokers([]);
          }
        }
      } catch (error) {
        console.error('Error loading brokers for stock:', error);
        setAvailableBrokersForStock([]);
      } finally {
        setIsLoadingBrokersForStock(false);
      }
    };
    
    loadBrokersForStock();
  }, [selectedTicker, ohlcData, selectedBrokers]);

  // Broker search handlers
  const handleBrokerSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedTicker || isLoadingBrokersForStock) return; // Don't allow search if no stock selected or loading
    
    const value = e.target.value.toUpperCase();
    setBrokerSearch(value);
    setShowBrokerSuggestions(true);
    setHighlightedBrokerIndex(-1); // Reset highlighted index when search changes
  };

  const handleBrokerSelect = (broker: string) => {
    // Only allow brokers that are available for the selected stock
    if (!availableBrokersForStock.includes(broker)) {
      console.warn(`⚠️ Broker ${broker} is not available for stock ${selectedTicker}`);
      return;
    }
    
    if (!selectedBrokers.includes(broker)) {
      setSelectedBrokers([...selectedBrokers, broker]);
      console.log(`📊 Added broker ${broker} to selection`);
    }
    setBrokerSearch('');
    setShowBrokerSuggestions(false);
    setHighlightedBrokerIndex(-1);
  };

  const removeBroker = (broker: string) => {
    // Only remove brokers that are currently selected
    if (selectedBrokers.includes(broker)) {
      setSelectedBrokers(selectedBrokers.filter(b => b !== broker));
      console.log(`📊 Removed broker ${broker} from selection`);
    }
  };

  const handleBrokerKeyDown = (e: React.KeyboardEvent) => {
    if (!showBrokerSuggestions || filteredBrokers.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedBrokerIndex(prev => 
          prev < filteredBrokers.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedBrokerIndex(prev => 
          prev > 0 ? prev - 1 : filteredBrokers.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedBrokerIndex >= 0 && highlightedBrokerIndex < filteredBrokers.length) {
          const selectedBroker = filteredBrokers[highlightedBrokerIndex];
          if (selectedBroker && selectedBrokers.includes(selectedBroker)) {
            removeBroker(selectedBroker);
          } else if (selectedBroker) {
            handleBrokerSelect(selectedBroker);
          }
        }
        break;
      case ' ':
        e.preventDefault();
        if (highlightedBrokerIndex >= 0 && highlightedBrokerIndex < filteredBrokers.length) {
          const selectedBroker = filteredBrokers[highlightedBrokerIndex];
          if (selectedBroker && selectedBrokers.includes(selectedBroker)) {
            removeBroker(selectedBroker);
          } else if (selectedBroker) {
            handleBrokerSelect(selectedBroker);
          }
        }
        break;
      case 'Escape':
        e.preventDefault();
        setShowBrokerSuggestions(false);
        setHighlightedBrokerIndex(-1);
        break;
      case 'Tab':
        // Allow default tab behavior but close dropdown
        setShowBrokerSuggestions(false);
        setHighlightedBrokerIndex(-1);
        break;
      case 'Home':
        e.preventDefault();
        setHighlightedBrokerIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setHighlightedBrokerIndex(filteredBrokers.length - 1);
        break;
      case 'PageUp':
        e.preventDefault();
        setHighlightedBrokerIndex(prev => Math.max(0, prev - 5));
        break;
      case 'PageDown':
        e.preventDefault();
        setHighlightedBrokerIndex(prev => Math.min(filteredBrokers.length - 1, prev + 5));
        break;
      case 'Delete':
        e.preventDefault();
        if (highlightedBrokerIndex >= 0 && highlightedBrokerIndex < filteredBrokers.length) {
          const selectedBroker = filteredBrokers[highlightedBrokerIndex];
          if (selectedBroker && selectedBrokers.includes(selectedBroker)) {
            removeBroker(selectedBroker);
          }
        }
        break;
      case 'Backspace':
        // Allow default backspace behavior for input field
        break;
      case 'ArrowLeft':
      case 'ArrowRight':
        // Allow default arrow behavior for input field
        break;
    }
  };

  const handleBrokerMouseEnter = (index: number) => {
    setHighlightedBrokerIndex(index);
  };

  const handleBrokerMouseLeave = () => {
    setHighlightedBrokerIndex(-1);
  };

  const handleBrokerFocus = () => {
    if (selectedTicker && !isLoadingBrokersForStock) {
      setShowBrokerSuggestions(true);
      setHighlightedBrokerIndex(-1);
    }
  };

  const handleBrokerBlur = () => {
    // Delay hiding suggestions to allow for click events
    setTimeout(() => {
      setShowBrokerSuggestions(false);
      setHighlightedBrokerIndex(-1);
    }, 150);
  };

  const handleBrokerDropdownClose = () => {
    setShowBrokerSuggestions(false);
    setHighlightedBrokerIndex(-1);
  };

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.broker-dropdown-container')) {
        handleBrokerDropdownClose();
      }
    };

    if (showBrokerSuggestions) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showBrokerSuggestions]);

  // Ticker search handlers
  const handleTickerSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isLoadingStocks) return; // Don't allow search if stocks are loading
    
    const value = e.target.value.toUpperCase();
    setTickerSearch(value);
    setShowTickerSuggestions(true);
  };

  const handleTickerSelect = (ticker: string) => {
    setSelectedTicker(ticker);
    setTickerSearch('');
    setShowTickerSuggestions(false);
    setHighlightedTickerIndex(-1);
    // Reset broker search when ticker changes
    setBrokerSearch('');
    setShowBrokerSuggestions(false);
    setHighlightedBrokerIndex(-1);
    setAvailableBrokersForStock([]);
    setIsLoadingBrokersForStock(false);
    setSelectedBrokers([]);
    setBrokerSummaryData([]);
    setBrokerDataError(null);
    setOhlcData([]);
    setVolumeData([]);
    setDataError(null);
  };

  const filteredBrokers = availableBrokersForStock.filter(broker =>
    broker.toLowerCase().includes(brokerSearch.toLowerCase()) &&
    !selectedBrokers.includes(broker)
  );

  const filteredTickers = availableStocks.filter(ticker =>
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

  // Use real data from API instead of mock data
  const candlestickData = useMemo(() => {
    return ohlcData;
  }, [ohlcData]);

  // Convert broker summary data to cumulative net flow series
  const inventoryData = useMemo(() => {
    if (!brokerSummaryData || brokerSummaryData.length === 0) return [];
    
    console.log(`📊 Converting ${brokerSummaryData.length} broker records to cumulative series`);
    
    // Group data by date
    const dataByDate: { [date: string]: any[] } = {};
    brokerSummaryData.forEach(record => {
      const date = record.date || record.time;
      if (!dataByDate[date]) {
        dataByDate[date] = [];
      }
      dataByDate[date].push(record);
    });
    
    // Create cumulative series for each broker
    const brokerCumulative: { [broker: string]: number } = {};
    const inventorySeries: InventoryTimeSeries[] = [];
    
    // Sort dates chronologically
    const sortedDates = Object.keys(dataByDate).sort();
    
    sortedDates.forEach(date => {
      const dayData: InventoryTimeSeries = { time: date };
      
      // Initialize all selected brokers for this date
      selectedBrokers.forEach(broker => {
        if (!brokerCumulative[broker]) {
          brokerCumulative[broker] = 0;
        }
        // Set current cumulative value for this broker
        dayData[broker] = brokerCumulative[broker];
      });
      
      // Process each broker record for this date
      dataByDate[date]?.forEach(record => {
        const broker = record.broker;
        const netBuyVol = record.nblot || 0; // NetBuyVol from API
        
        // Only process brokers that are in selectedBrokers
        if (selectedBrokers.includes(broker)) {
          // Add to cumulative
          brokerCumulative[broker] += netBuyVol;
          
          // Update day data with new cumulative value
          dayData[broker] = brokerCumulative[broker] || 0;
        }
      });
      
      inventorySeries.push(dayData);
    });
    
    console.log(`📊 Generated ${inventorySeries.length} cumulative series points`);
    console.log(`📊 Broker cumulative totals for selected brokers:`, Object.entries(brokerCumulative).filter(([broker]) => selectedBrokers.includes(broker)));
    
    // Debug: Log sample data structure
    if (inventorySeries.length > 0) {
      console.log(`📊 Sample inventory data structure:`, {
        firstRecord: inventorySeries[0],
        selectedBrokers: selectedBrokers,
        availableBrokers: Object.keys(inventorySeries[0] || {}).filter(key => key !== 'time')
      });
    }
    
    return inventorySeries;
  }, [brokerSummaryData, selectedBrokers]);

  const volumeDataForCharts = useMemo(() => {
    return volumeData;
  }, [volumeData]);

  // Removed unused data generation functions to improve performance


  const topBrokersData = useMemo(() => {
    if (!startDate || !endDate) return [];
    // Generate dates between startDate and endDate
    const dates: string[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    const current = new Date(start);
    
    while (current <= end) {
      dates.push(current.toISOString().split('T')[0] ?? '');
      current.setDate(current.getDate() + 1);
    }
    
    return generateTopBrokersData(dates, topBrokersCount);
  }, [startDate, endDate, topBrokersCount]);


  return (
    <div className="min-h-screen overflow-x-hidden">
      <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6">
        <div className="space-y-6">

          {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Broker Inventory Analysis Controls
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Row 1: Ticker, Broker, Date Range, Visualization */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Ticker Selection */}
              <div>
                <label className="block text-sm font-medium mb-2">Ticker:</label>
                <div className="relative">
                  <input
                    type="text"
                    value={tickerSearch || selectedTicker}
                    onChange={(e) => { handleTickerSearchChange(e); setHighlightedTickerIndex(0); }}
                    onFocus={() => { if (!isLoadingStocks) { setShowTickerSuggestions(true); setHighlightedTickerIndex(0); } }}
                    onKeyDown={(e) => {
                      const suggestions = filteredTickers.slice(0, 10);
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
                    placeholder={isLoadingStocks ? "Loading stocks..." : "Enter ticker code..."}
                    disabled={isLoadingStocks}
                    className={`w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm ${isLoadingStocks ? 'opacity-50 cursor-not-allowed' : ''}`}
                    role="combobox"
                    aria-expanded={showTickerSuggestions}
                    aria-controls="ticker-suggestions"
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
                  {showTickerSuggestions && !isLoadingStocks && (
                    (() => {
                      const suggestions = filteredTickers.slice(0, 10);
                      return (
                        <div id="ticker-suggestions" role="listbox" className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-md border border-border bg-background shadow">
                          {suggestions.map((t, idx) => (
                            <button
                              key={t}
                              role="option"
                              aria-selected={idx === highlightedTickerIndex}
                              className={`w-full text-left px-3 py-2 text-sm ${idx === highlightedTickerIndex ? 'bg-accent' : 'hover:bg-accent'}`}
                              onMouseEnter={() => setHighlightedTickerIndex(idx)}
                              onMouseDown={(e) => { e.preventDefault(); }}
                              onClick={() => {
                                handleTickerSelect(t);
                                setShowTickerSuggestions(false);
                                setHighlightedTickerIndex(-1);
                              }}
                            >
                              {t}
                            </button>
                          ))}
                          {suggestions.length === 0 && !isLoadingStocks && (
                            <div className="px-3 py-2 text-sm text-muted-foreground">
                              {availableStocks.length === 0 ? 'No stocks available' : 'No results'}
                            </div>
                          )}
                        </div>
                      );
                    })()
                  )}
                </div>
                
                {/* Ticker loading info */}
                {isLoadingStocks ? (
                  <div className="mt-2 text-xs text-muted-foreground">
                    <span>Loading stocks from API...</span>
                  </div>
                ) : availableStocks.length > 0 ? (
                  <div className="mt-2 text-xs text-muted-foreground">
                    <span>
                      {availableStocks.length} stocks available
                    </span>
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-warning">
                    <span>No stocks available from API</span>
                  </div>
                )}
              </div>

              {/* Broker Selection */}
              <div>
                <label className="block text-sm font-medium mb-2">Broker:</label>
                <div className="relative broker-dropdown-container">
                  <input
                    type="text"
                    placeholder={isLoadingBrokersForStock ? "Loading brokers..." : selectedTicker ? `Broker for ${selectedTicker}...` : "Select stock first..."}
                    value={brokerSearch}
                    disabled={!selectedTicker || isLoadingBrokersForStock}
                    className={`w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm ${!selectedTicker || isLoadingBrokersForStock ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onChange={(e) => { handleBrokerSearchChange(e); }}
                    onFocus={handleBrokerFocus}
                    onBlur={handleBrokerBlur}
                    onKeyDown={handleBrokerKeyDown}
                  />
                  {showBrokerSuggestions && selectedTicker && !isLoadingBrokersForStock && (
                    <div className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-md border border-border bg-background shadow">
                      {filteredBrokers.length > 0 ? (
                        filteredBrokers.slice(0, 10).map((broker, index) => (
                          <button
                            key={broker}
                            className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                              index === highlightedBrokerIndex 
                                ? 'bg-accent text-accent-foreground' 
                                : 'hover:bg-accent hover:text-accent-foreground'
                            } ${selectedBrokers.includes(broker) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                            onClick={() => { 
                              if (!selectedBrokers.includes(broker)) {
                                handleBrokerSelect(broker); 
                                setShowBrokerSuggestions(false); 
                              }
                            }}
                            onDoubleClick={() => {
                              if (selectedBrokers.includes(broker)) {
                                removeBroker(broker);
                              }
                            }}
                            onMouseEnter={() => handleBrokerMouseEnter(index)}
                            onMouseLeave={handleBrokerMouseLeave}
                            disabled={selectedBrokers.includes(broker)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center">
                                <div
                                  className="w-2 h-2 rounded-full mr-2"
                                  style={{ backgroundColor: getBrokerColor(broker) }}
                                />
                                {broker}
                              </div>
                              {selectedBrokers.includes(broker) && (
                                <span className="text-xs text-muted-foreground">✓ Selected</span>
                              )}
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          No brokers available for {selectedTicker}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                {/* Broker availability info */}
                {selectedTicker && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {isLoadingBrokersForStock ? (
                      <span>Loading brokers for {selectedTicker}...</span>
                    ) : availableBrokersForStock.length > 0 ? (
                      <span>
                        {availableBrokersForStock.length} broker{availableBrokersForStock.length !== 1 ? 's' : ''} available for {selectedTicker}
                      </span>
                    ) : (
                      <span className="text-warning">
                        No brokers available for {selectedTicker}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Date Range */}
              <div>
                    <label className="block text-sm font-medium mb-2">Date Range:</label>
                <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                    className="flex-1 px-3 py-2 border border-border rounded-md bg-input text-foreground text-sm"
                      />
                  <span className="text-sm text-muted-foreground">to</span>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                    className="flex-1 px-3 py-2 border border-border rounded-md bg-input text-foreground text-sm"
                  />
                    </div>
                  </div>

              {/* Visualization Mode Toggle */}
            <div>
                <label className="block text-sm font-medium mb-2">Visualization:</label>
                <div className="flex items-center gap-1 border border-border rounded-lg p-1">
                  <Button
                    variant={!splitVisualization ? "default" : "ghost"}
                    onClick={() => setSplitVisualization(false)}
                    size="sm"
                    className="px-3 py-1 h-8 text-xs flex-1"
                  >
                    Combined
                  </Button>
                  <Button
                    variant={splitVisualization ? "default" : "ghost"}
                    onClick={() => setSplitVisualization(true)}
                    size="sm"
                    className="px-3 py-1 h-8 text-xs flex-1"
                  >
                    Split
                  </Button>
              </div>
            </div>
          </div>

          {/* Selected Brokers Display */}
          {selectedBrokers.length > 0 ? (
              <div>
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
          ) : selectedTicker ? (
            <div className="text-sm text-muted-foreground">
              No brokers selected. Select brokers above to view cumulative net flow.
            </div>
                ) : (
                  <div className="mt-2 text-xs text-warning">
                    <span>No stocks available from API</span>
                  </div>
                )}

          </div>
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
                <CardContent className="relative">
                  {/* Loading overlay */}
                  {(isLoadingData || isLoadingBrokerData) && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                      <div className="flex flex-col items-center gap-2">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                        <div className="text-xs text-muted-foreground">
                          {isLoadingData ? 'Loading stock...' : 'Loading broker...'}
                        </div>
                      </div>
                    </div>
                  )}
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
                <CardContent className="relative">
                  {/* Loading overlay */}
                  {(isLoadingData || isLoadingBrokerData) && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                      <div className="flex flex-col items-center gap-2">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                        <div className="text-xs text-muted-foreground">
                          {isLoadingData ? 'Loading stock...' : 'Loading broker...'}
                        </div>
                      </div>
                    </div>
                  )}
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
                <CardContent className="relative">
                  {/* Loading overlay */}
                  {(isLoadingData || isLoadingBrokerData) && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                      <div className="flex flex-col items-center gap-2">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                        <div className="text-xs text-muted-foreground">
                          {isLoadingData ? 'Loading stock...' : 'Loading broker...'}
                        </div>
                      </div>
                    </div>
                  )}
                  <VolumeChart volumeData={volumeDataForCharts} candlestickData={candlestickData} showLabel={true} />
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
                <CardContent className="relative">
                  {/* Loading overlay */}
                  {(isLoadingData || isLoadingBrokerData) && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                      <div className="flex flex-col items-center gap-3">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                        <div className="text-sm text-muted-foreground">
                          {isLoadingData ? 'Loading stock data...' : 'Loading broker data...'}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Error overlay */}
                  {(dataError || brokerDataError) && !isLoadingData && !isLoadingBrokerData && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                      <div className="flex flex-col items-center gap-3 text-center p-6">
                        <div className="text-4xl">⚠️</div>
                        <div className="text-sm text-muted-foreground">
                          {dataError || brokerDataError}
                        </div>
                        <Button 
                          onClick={() => window.location.reload()} 
                          variant="outline" 
                          size="sm"
                        >
                          Retry
                        </Button>
                      </div>
                    </div>
                  )}
                  
                  <TradingViewChart
                    candlestickData={candlestickData}
                    inventoryData={inventoryData}
                    selectedBrokers={selectedBrokers}
                    title={`${selectedTicker} Inventory Analysis`}
                    volumeData={volumeDataForCharts}
                  />
                </CardContent>
              </Card>
            </>
          )}            

      {/* Top 10 Brokers Table */}
          <Card>
            <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Top Brokers by Date</CardTitle>
              <p className="text-sm text-muted-foreground">
                Top brokers across selected dates (general market data)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Show:</label>
              <select 
                value={topBrokersCount} 
                onChange={(e) => setTopBrokersCount(e.target.value as 5 | 10 | 15 | 20 | 'all')}
                className="px-3 py-1 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              >
                <option value={5} className="bg-background text-foreground">Top 5</option>
                <option value={10} className="bg-background text-foreground">Top 10</option>
                <option value={15} className="bg-background text-foreground">Top 15</option>
                <option value={20} className="bg-background text-foreground">Top 20</option>
                <option value="all" className="bg-background text-foreground">All</option>
              </select>
            </div>
          </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
                  <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-2 px-3 font-medium">Rank</th>
                  {topBrokersData.map((dateData) => (
                    <th key={dateData.date} className="text-center py-2 px-2 font-medium">
                      {formatDisplayDate(dateData.date)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                {Array.from({ length: topBrokersCount === 'all' ? 20 : topBrokersCount }, (_, rank) => (
                  <tr key={rank} className="border-b border-border/50 hover:bg-accent/50">
                    <td className="py-2 px-3 font-medium text-center">
                      {rank + 1}
                          </td>
                     {topBrokersData.map((dateData) => {
                       const brokerData = dateData.topBrokers[rank];
                       // Check if this broker was in top 5 of the first date
                       const firstDateTop5Brokers = topBrokersData[0]?.topBrokers.slice(0, 5).map(b => b.broker) || [];
                       const isTop5FromFirstDate = brokerData && firstDateTop5Brokers.includes(brokerData.broker);
                       
                       // Calculate total volume for this date to determine bar width
                       const totalVolume = dateData.topBrokers.reduce((sum, broker) => sum + (broker.volume || 0), 0);
                       const barWidth = brokerData && totalVolume > 0 ? (brokerData.volume / totalVolume) * 100 : 0;
                       
                      return (
                         <td 
                           key={`${dateData.date}-${rank}`} 
                           className={`text-center py-2 px-3 relative min-w-[120px] ${
                             brokerData && isTop5FromFirstDate 
                               ? 'text-white' 
                               : 'text-foreground'
                           }`}
                           style={{
                             backgroundColor: brokerData && isTop5FromFirstDate 
                               ? brokerData.color 
                               : 'transparent'
                           }}
                         >
                           <div className="relative w-full h-8 flex items-center justify-center">
                             {/* Transparent horizontal bar chart for non-top5 brokers */}
                             {brokerData && !isTop5FromFirstDate && (
                               <div 
                                 className="absolute left-0 top-0 h-full rounded-r"
                                 style={{ 
                                   width: `${barWidth}%`,
                                   backgroundColor: brokerData.color,
                                   opacity: 0.3
                                 }}
                               />
                             )}
                             
                             {/* Broker code and volume overlay */}
                             <div className="relative z-10 flex items-center gap-2">
                               {brokerData ? (
                                 <>
                                   <span className="font-medium text-xs">
                                     {brokerData.broker}
                                   </span>
                                   <span className="text-xs opacity-80">
                                     {brokerData.volume.toLocaleString()}
                                   </span>
                                 </>
                               ) : (
                                 <span className="text-muted-foreground">-</span>
                               )}
                             </div>
                            </div>
                          </td>
                      );
                    })}
                  </tr>
                ))}
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
