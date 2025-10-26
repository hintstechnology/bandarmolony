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

// Import broker color utilities
// Note: BROKER_COLORS is available but not used in this component - using dynamic color generation instead

// Dynamic color generator based on loaded brokers
const generateBrokerColor = (broker: string, allBrokers: string[] = []): string => {
  // Get all unique brokers and sort them for consistent color assignment
  const sortedBrokers = [...new Set(allBrokers)].sort();
  const brokerIndex = sortedBrokers.indexOf(broker);
  
  if (brokerIndex === -1) {
    // Fallback for unknown brokers
    const hash = broker.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const hue = hash % 360;
    return `hsl(${hue}, 70%, 45%)`;
  }
  
  // Generate pastel colors based on broker position in the sorted list
  const totalBrokers = sortedBrokers.length;
  const hueStep = 360 / Math.max(totalBrokers, 1); // Distribute hues evenly
  const baseHue = (brokerIndex * hueStep) % 360;
  
  // Add some variation to avoid too similar colors
  const variation = (brokerIndex * 7) % 30; // Small variation based on index
  const finalHue = (baseHue + variation) % 360;
  
  // Pastel colors: lower saturation, darker lightness for better contrast
  const satVariation = (brokerIndex * 3) % 15;
  const lightVariation = (brokerIndex * 2) % 10;
  
  const saturation = Math.max(40, Math.min(70, 55 + satVariation)); // Higher saturation for more color
  const lightness = Math.max(20, Math.min(40, 30 + lightVariation)); // Much darker lightness (reduced by 25%)
  
  return `hsl(${finalHue}, ${saturation}%, ${lightness}%)`;
};

// Format lot numbers with K/M/B/T prefixes
const formatLotNumber = (value: number): string => {
  if (value === 0) return '0';
  
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  
  if (absValue >= 1000000000) {
    return `${sign}${(absValue / 1000000000).toFixed(1)}T`;
  } else if (absValue >= 1000000) {
    return `${sign}${(absValue / 1000000).toFixed(1)}M`;
  } else if (absValue >= 1000) {
    return `${sign}${(absValue / 1000).toFixed(1)}K`;
  } else {
    return `${sign}${absValue.toFixed(0)}`;
  }
};

// Generate broker gross/net data for horizontal bar chart
// Removed unused data generation functions to improve performance

// Removed generateTopBrokersData - now using real data from API



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
          color: generateBrokerColor(broker, selectedBrokers),
          lineWidth: 2,
          title: broker,
          priceScaleId: 'left', // Use left price scale
          priceFormat: {
            type: 'custom',
            formatter: (price: number) => formatLotNumber(price),
          },
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const VolumeChart = ({ volumeData, candlestickData, showLabel = true }: { volumeData: any[], candlestickData?: any[], showLabel?: boolean }) => {
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

// Removed unused chart components to improve performance

// Price Chart Component for Split View
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
          color: generateBrokerColor(broker, selectedBrokers),
          lineWidth: 2,
          title: broker,
          priceScaleId: 'right',
          priceFormat: {
            type: 'custom',
            formatter: (price: number) => formatLotNumber(price),
          },
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


export const BrokerInventoryPage = React.memo(function BrokerInventoryPage({ 
  selectedStock: propSelectedStock,
  defaultSplitView = false,
  hideControls = false,
  onlyShowInventoryChart = false
}: { 
  selectedStock?: string;
  defaultSplitView?: boolean;
  hideControls?: boolean;
  onlyShowInventoryChart?: boolean;
}) {
  const { showToast } = useToast();
  
  // State management
  const [selectedTicker, setSelectedTicker] = useState(propSelectedStock || 'BBCA');
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
  const [splitVisualization, setSplitVisualization] = useState(defaultSplitView);
  const [highlightedTickerIndex, setHighlightedTickerIndex] = useState<number>(-1);
  const [isTypingTicker, setIsTypingTicker] = useState(false);
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
  const [topBrokersCount, setTopBrokersCount] = useState<5 | 10 | 15 | 20 | 'all'>(5);

  // Update selectedTicker when propSelectedStock changes
  useEffect(() => {
    if (propSelectedStock && propSelectedStock !== selectedTicker) {
      console.log(`📊 Dashboard stock changed from ${selectedTicker} to ${propSelectedStock}`);
      setSelectedTicker(propSelectedStock);
      
      // Reset all related states when stock changes
      setSelectedBrokers([]);
      setBrokerSummaryData([]);
      setBrokerDataError(null);
      setOhlcData([]);
      setVolumeData([]);
      setDataError(null);
      setAvailableBrokersForStock([]);
      setIsLoadingBrokersForStock(false);
      setBrokerSearch('');
      setShowBrokerSuggestions(false);
      setHighlightedBrokerIndex(-1);
    }
  }, [propSelectedStock, selectedTicker]);



  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  // Sync endDate when startDate changes to ensure endDate >= startDate
  useEffect(() => {
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      console.log(`⚠️ Start date ${startDate} is after end date ${endDate}, updating end date to ${startDate}`);
      setEndDate(startDate);
    }
  }, [startDate, endDate]);

  // Load OHLC and volume data when ticker or date range changes
  useEffect(() => {
    const loadStockData = async () => {
      if (!selectedTicker || !startDate || !endDate) return;
      
      setIsLoadingData(true);
      setDataError(null);
      
      try {
        console.log(`📊 Loading stock data for ${selectedTicker} from ${startDate} to ${endDate}`);
        
        // Call stock API to get OHLC data
        const response = await api.getStockData(selectedTicker, startDate, endDate, 1000);
        
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

  // Load broker summary data using optimized API
  useEffect(() => {
    const loadBrokerData = async () => {
      // Load broker data even if no brokers are selected (for top brokers table)
      if (!selectedTicker || !startDate || !endDate || ohlcData.length === 0) return;
      
      setIsLoadingBrokerData(true);
      setBrokerDataError(null);
      
      try {
        console.log(`🔄 Loading optimized broker data for ${selectedTicker} from ${startDate} to ${endDate}`);
        console.log(`📊 OHLC data available: ${ohlcData.length} records`);
        
        // Get dates from OHLC data instead of generating them
        const ohlcDates = ohlcData.map(d => d.time).sort();
        console.log(`📊 Using ${ohlcDates.length} dates from OHLC data:`, ohlcDates.slice(0, 5), '...');
        
        if (ohlcDates.length === 0) {
          console.log('⚠️ No OHLC dates available');
          setBrokerSummaryData([]);
          return;
        }
        
        // Load broker data for each OHLC date with smart skipping and error protection
        const allBrokerData: any[] = [];
        let successfulDates = 0;
        let consecutiveNotFound = 0;
        let consecutiveErrors = 0;
        const maxConsecutiveNotFound = 5; // Stop after 5 consecutive not found dates
        const maxConsecutiveErrors = 3; // Stop after 3 consecutive errors
        const maxRetries = 2; // Maximum retries per date
        const minDataDays = 30; // Minimum days of data required
        
        console.log(`📊 Starting broker data loading with smart skipping and error protection`);
        console.log(`📊 Max consecutive not found: ${maxConsecutiveNotFound}, Max consecutive errors: ${maxConsecutiveErrors}`);
        console.log(`📊 Processing ${ohlcDates.length} dates from ${ohlcDates[0]} to ${ohlcDates[ohlcDates.length - 1]}`);
        console.log(`📊 Target: Minimum ${minDataDays} days of broker data`);
        
        for (const dateStr of ohlcDates) { // Process all dates, no limit
          let retryCount = 0;
          let dateProcessed = false;
          
          while (retryCount <= maxRetries && !dateProcessed) {
            try {
              // Progress logging every 5 dates (more frequent)
              const currentIndex = ohlcDates.indexOf(dateStr);
              if (currentIndex % 5 === 0 || currentIndex === ohlcDates.length - 1) {
                console.log(`📊 Progress: Processing date ${currentIndex + 1}/${ohlcDates.length} (${dateStr}) - Found ${successfulDates} successful dates, ${consecutiveNotFound} consecutive not found, ${consecutiveErrors} consecutive errors`);
              }
              
              // Convert date from YYYY-MM-DD to YYYYMMDD format for broker API
              const brokerDateStr = dateStr.replace(/-/g, '');
              
              const response = await api.getBrokerSummaryData(selectedTicker, brokerDateStr);
              
              console.log(`📊 Broker API response for ${dateStr} (${brokerDateStr}):`, {
                success: response.success,
                hasData: !!response.data?.brokerData,
                dataLength: response.data?.brokerData?.length || 0,
                consecutiveNotFound: consecutiveNotFound,
                consecutiveErrors: consecutiveErrors,
                retryCount: retryCount
              });
              
              // Reset consecutive errors counter on successful API call
              consecutiveErrors = 0;
              
              if (response.success && response.data?.brokerData) {
                const brokerData = response.data.brokerData;
                
                // Use ALL brokers, not filtered by selectedBrokers
                // For chart, we still need selectedBrokers, but for top brokers table, we use all data
                
                console.log(`📊 Broker data for ${dateStr}:`, {
                  totalBrokers: brokerData.length,
                  brokerNames: brokerData.map((b: any) => b.broker).slice(0, 10)
                });
                
                // Only add data if we have brokers for this date
                if (brokerData.length > 0) {
                  // Add date to each broker record
                  brokerData.forEach((broker: any) => {
                    allBrokerData.push({
                      ...broker,
                      date: dateStr, // Use original OHLC date format
                      time: dateStr // For chart compatibility
                    });
                  });
                  
                  successfulDates++;
                  consecutiveNotFound = 0; // Reset counter on successful date
                  console.log(`✅ Broker data loaded for ${dateStr}: ${brokerData.length} brokers`);
                } else {
                  consecutiveNotFound++;
                  console.log(`⚠️ No broker data found for ${selectedTicker} on ${dateStr} - skipping immediately (${consecutiveNotFound}/${maxConsecutiveNotFound} consecutive not found)`);
                  
                  // Early feedback for no data
                  if (consecutiveNotFound === 1) {
                    console.log(`💡 Tip: No broker data found for ${selectedTicker} on ${dateStr}. This may indicate limited broker activity for this stock.`);
                  }
                  
                  // Check if we should stop due to too many consecutive not found dates
                  // But only if we already have minimum required data
                  if (consecutiveNotFound >= maxConsecutiveNotFound && successfulDates >= minDataDays) {
                    console.log(`🛑 Stopping broker data loading after ${consecutiveNotFound} consecutive not found dates`);
                    console.log(`✅ Already have ${successfulDates} days of data (minimum ${minDataDays} required)`);
                    console.log(`💡 Suggestion: Try selecting different brokers or check if broker data is available for ${selectedTicker}`);
                    break;
                  } else if (consecutiveNotFound >= maxConsecutiveNotFound) {
                    console.log(`⚠️ ${consecutiveNotFound} consecutive not found dates, but only ${successfulDates} days collected (need ${minDataDays})`);
                    console.log(`📊 Continuing to search for more data...`);
                  }
                }
              } else {
                consecutiveNotFound++;
                console.log(`⚠️ No broker data for ${selectedTicker} on ${dateStr} - skipping immediately (${consecutiveNotFound}/${maxConsecutiveNotFound} consecutive not found)`);
                
                // Early feedback for no data
                if (consecutiveNotFound === 1) {
                  console.log(`💡 Tip: No broker data found for ${selectedTicker} on ${dateStr}. This may indicate limited broker activity for this stock.`);
                }
                
                // Check if we should stop due to too many consecutive not found dates
                // But only if we already have minimum required data
                if (consecutiveNotFound >= maxConsecutiveNotFound && successfulDates >= minDataDays) {
                  console.log(`🛑 Stopping broker data loading after ${consecutiveNotFound} consecutive not found dates`);
                  console.log(`✅ Already have ${successfulDates} days of data (minimum ${minDataDays} required)`);
                  console.log(`💡 Suggestion: Try selecting different brokers or check if broker data is available for ${selectedTicker}`);
                  break;
                } else if (consecutiveNotFound >= maxConsecutiveNotFound) {
                  console.log(`⚠️ ${consecutiveNotFound} consecutive not found dates, but only ${successfulDates} days collected (need ${minDataDays})`);
                  console.log(`📊 Continuing to search for more data...`);
                }
              }
              
              dateProcessed = true; // Mark date as processed successfully
              
            } catch (error) {
              consecutiveErrors++;
              retryCount++;
              
              console.warn(`⚠️ Error loading broker data for ${dateStr} (attempt ${retryCount}/${maxRetries + 1}):`, error);
              
              if (retryCount > maxRetries) {
                // Max retries reached, count as not found and move to next date
                consecutiveNotFound++;
                console.log(`⚠️ Max retries reached for ${dateStr}, skipping to next date immediately (${consecutiveNotFound}/${maxConsecutiveNotFound} consecutive not found)`);
                
                // Check if we should stop due to too many consecutive errors
                // But only if we already have minimum required data
                if (consecutiveErrors >= maxConsecutiveErrors && successfulDates >= minDataDays) {
                  console.log(`🛑 Stopping broker data loading after ${consecutiveErrors} consecutive errors`);
                  console.log(`✅ Already have ${successfulDates} days of data (minimum ${minDataDays} required)`);
                  break;
                } else if (consecutiveErrors >= maxConsecutiveErrors) {
                  console.log(`⚠️ ${consecutiveErrors} consecutive errors, but only ${successfulDates} days collected (need ${minDataDays})`);
                  console.log(`📊 Continuing to search for more data...`);
                }
                
                // Check if we should stop due to too many consecutive not found dates
                // But only if we already have minimum required data
                if (consecutiveNotFound >= maxConsecutiveNotFound && successfulDates >= minDataDays) {
                  console.log(`🛑 Stopping broker data loading after ${consecutiveNotFound} consecutive not found dates`);
                  console.log(`✅ Already have ${successfulDates} days of data (minimum ${minDataDays} required)`);
                  break;
                } else if (consecutiveNotFound >= maxConsecutiveNotFound) {
                  console.log(`⚠️ ${consecutiveNotFound} consecutive not found dates, but only ${successfulDates} days collected (need ${minDataDays})`);
                  console.log(`📊 Continuing to search for more data...`);
                }
                
                dateProcessed = true; // Mark date as processed (failed) to move to next date
              } else {
                // Wait before retry to prevent rapid API calls (reduced delay)
                console.log(`⏳ Waiting 500ms before retry ${retryCount + 1} for ${dateStr}...`);
                await new Promise(resolve => setTimeout(resolve, 500));
              }
            }
          }
          
          // Break out of outer loop if we hit the limits
          // But only if we already have minimum required data
          if ((consecutiveNotFound >= maxConsecutiveNotFound || consecutiveErrors >= maxConsecutiveErrors) && successfulDates >= minDataDays) {
            break;
          }
        }
        
        console.log(`📊 ===== BROKER DATA LOADING COMPLETE =====`);
        console.log(`📊 Total OHLC dates processed: ${ohlcDates.length}`);
        console.log(`📊 Successful broker dates: ${successfulDates}`);
        console.log(`📊 Consecutive not found: ${consecutiveNotFound}`);
        console.log(`📊 Consecutive errors: ${consecutiveErrors}`);
        console.log(`📊 Total broker records loaded: ${allBrokerData.length}`);
        console.log(`📊 Sample broker data:`, allBrokerData.slice(0, 3));
        
        if (allBrokerData.length === 0) {
          console.log(`⚠️ No broker data found for ${selectedTicker}`);
          if (consecutiveErrors >= maxConsecutiveErrors) {
            setBrokerDataError(`No broker data found for ${selectedTicker}. Stopped after ${consecutiveErrors} consecutive API errors.`);
          } else if (consecutiveNotFound >= maxConsecutiveNotFound) {
            setBrokerDataError(`No broker data found for ${selectedTicker}. Stopped after ${consecutiveNotFound} consecutive not found dates. Data may not be available for this stock.`);
          } else {
            setBrokerDataError(`No broker data found for ${selectedTicker}. Please check if broker data is available for this stock.`);
          }
        } else {
          setBrokerDataError(null);
          console.log(`✅ Successfully loaded broker data for ${successfulDates} dates with ${allBrokerData.length} total records`);
          
          // Show success message with data summary
          if (successfulDates < minDataDays) {
            console.log(`⚠️ Limited data available: Only ${successfulDates} dates with broker data found (target: ${minDataDays} days)`);
            console.log(`💡 Consider expanding date range or selecting different brokers for more comprehensive analysis`);
          } else {
            console.log(`✅ Sufficient data available: ${successfulDates} days (target: ${minDataDays} days)`);
          }
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
  }, [selectedTicker, startDate, endDate, ohlcData, showToast]);

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
        
        // Try to find available brokers by checking dates from most recent backwards
        const ohlcDates = ohlcData.map(d => d.time).sort().reverse(); // Sort newest first
        let foundBrokers = false;
        let checkedDates = 0;
        const maxDatesToCheck = 5; // Check up to 5 dates
        
        for (const dateStr of ohlcDates.slice(0, maxDatesToCheck)) {
          try {
            checkedDates++;
            console.log(`📊 Checking brokers for ${selectedTicker} on ${dateStr} (${checkedDates}/${maxDatesToCheck})`);
            
            // Convert date from YYYY-MM-DD to YYYYMMDD format for broker API
            const brokerDateStr = dateStr.replace(/-/g, '');
            
            const response = await api.getBrokerSummaryData(selectedTicker, brokerDateStr);
            
            if (response.success && response.data?.brokerData) {
              const brokers = response.data.brokerData.map((broker: any) => broker.broker).filter(Boolean);
              const uniqueBrokers = [...new Set(brokers)].sort() as string[];
              
              if (uniqueBrokers.length > 0) {
                console.log(`✅ Found ${uniqueBrokers.length} brokers for ${selectedTicker} on ${dateStr}:`, uniqueBrokers);
                setAvailableBrokersForStock(uniqueBrokers);
                foundBrokers = true;
                
                // Auto-select default brokers (AK, BK, MG) if none are selected
                if (selectedBrokers.length === 0 && uniqueBrokers.length > 0) {
                  const defaultBrokers = ['AK', 'BK', 'MG'];
                  const availableDefaultBrokers = defaultBrokers.filter(broker => uniqueBrokers.includes(broker));
                  
                  if (availableDefaultBrokers.length > 0) {
                    console.log(`📊 Auto-selecting default brokers:`, availableDefaultBrokers);
                    setSelectedBrokers(availableDefaultBrokers);
                  } else {
                    // Fallback to first 3 brokers if default brokers not available
                    const fallbackBrokers = uniqueBrokers.slice(0, 3) as string[];
                    console.log(`📊 Default brokers not available, selecting first 3 brokers:`, fallbackBrokers);
                    setSelectedBrokers(fallbackBrokers);
                  }
                } else {
                  // Update selected brokers to only include those available for this stock
                  const validSelectedBrokers = selectedBrokers.filter(broker => uniqueBrokers.includes(broker));
                  if (validSelectedBrokers.length !== selectedBrokers.length) {
                    console.log(`📊 Updating selected brokers to match available brokers:`, validSelectedBrokers);
                    setSelectedBrokers(validSelectedBrokers);
                  }
                }
                break; // Found brokers, stop checking
              } else {
                console.log(`⚠️ No brokers found for ${selectedTicker} on ${dateStr} - trying next date`);
              }
            } else {
              console.log(`⚠️ No broker data found for ${selectedTicker} on ${dateStr} - trying next date`);
            }
          } catch (error) {
            console.warn(`⚠️ Error checking brokers for ${dateStr}:`, error);
            console.log(`⚠️ Skipping to next date due to error`);
            // Continue to next date without retry
          }
        }
        
        if (!foundBrokers) {
          console.log(`⚠️ No broker data found for ${selectedTicker} after checking ${checkedDates} dates`);
          setAvailableBrokersForStock([]);
          setSelectedBrokers([]);
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
      console.log(`📊 Added broker ${broker} to selection - series will be updated automatically`);
    }
    setBrokerSearch('');
    setShowBrokerSuggestions(false);
    setHighlightedBrokerIndex(-1);
  };

  const removeBroker = (broker: string) => {
    // Only remove brokers that are currently selected
    if (selectedBrokers.includes(broker)) {
    setSelectedBrokers(selectedBrokers.filter(b => b !== broker));
      console.log(`📊 Removed broker ${broker} from selection - series will be updated automatically`);
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
  const handleTickerSelect = (ticker: string) => {
    setSelectedTicker(ticker);
    setTickerSearch('');
    setIsTypingTicker(false);
    setShowTickerSuggestions(false);
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

  // Generate unique colors for brokers (avoiding white/gray colors)
  const generateUniqueBrokerColor = (broker: string, allBrokers: string[]): string => {
    const sortedBrokers = [...new Set(allBrokers)].sort();
    const brokerIndex = sortedBrokers.indexOf(broker);
    
    if (brokerIndex === -1) {
      // Fallback for unknown brokers
      const hash = broker.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const hue = hash % 360;
      return `hsl(${hue}, 60%, 45%)`;
    }
    
    // Generate darker, vibrant colors (not too bright, suitable for white text)
    const hueStep = 360 / Math.max(sortedBrokers.length, 1);
    const baseHue = (brokerIndex * hueStep) % 360;
    
    // Add variation to avoid similar colors
    const variation = (brokerIndex * 7) % 30;
    const finalHue = (baseHue + variation) % 360;
    
    // Medium saturation, darker lightness for better contrast with white text
    const saturation = 60 + (brokerIndex % 20); // 60-80% saturation
    const lightness = 40 + (brokerIndex % 15); // 40-55% lightness (darker, not too bright)
    
    return `hsl(${finalHue}, ${saturation}%, ${lightness}%)`;
  };

  // Generate Top Brokers data by date from brokerSummaryData
  const topBrokersData = useMemo(() => {
    if (!brokerSummaryData || brokerSummaryData.length === 0) return [];
    
    // Get all unique brokers from the data (not filtered by selectedBrokers)
    const allBrokers = [...new Set(brokerSummaryData.map(r => r.broker).filter(Boolean))];
    
    // Group data by date
    const dataByDate: { [date: string]: any[] } = {};
    brokerSummaryData.forEach(record => {
      const date = record.date || record.time;
      if (!dataByDate[date]) {
        dataByDate[date] = [];
      }
      dataByDate[date].push(record);
    });
    
    // Get unique dates and sort them
    const dates = Object.keys(dataByDate).sort();
    
    // For each date, get top brokers
    return dates.map(date => {
      const brokersForDate = dataByDate[date] || [];
      
      // Calculate total volume (nblot + abs(nslot)) for each broker
      const brokerVolumes: { [broker: string]: { volume: number; netFlow: number; color: string } } = {};
      
      brokersForDate.forEach(record => {
        const broker = record.broker;
        const buyVol = Math.abs(record.nblot || 0);
        const sellVol = Math.abs(record.nslot || 0);
        const volume = buyVol + sellVol;
        const netFlow = record.nblot || 0;
        
        if (!brokerVolumes[broker]) {
          brokerVolumes[broker] = { volume: 0, netFlow: 0, color: generateUniqueBrokerColor(broker, allBrokers) };
        }
        brokerVolumes[broker].volume += volume;
        brokerVolumes[broker].netFlow += netFlow;
      });
      
      // Sort brokers by net flow (nblot) - highest to lowest (Rank 1 = highest net transaction)
      const sortedBrokers = Object.entries(brokerVolumes)
        .sort((a, b) => b[1].netFlow - a[1].netFlow)
        .slice(0, topBrokersCount === 'all' ? Object.keys(brokerVolumes).length : topBrokersCount)
        .map(([broker, data]) => ({
          broker,
          volume: data.volume,
          netFlow: data.netFlow,
          color: data.color
        }));
      
      return {
        date,
        topBrokers: sortedBrokers
      };
    });
  }, [brokerSummaryData, topBrokersCount]);


  return (
    <div className="min-h-screen overflow-x-hidden">
      <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6">
        <div className="space-y-6">

          {/* Controls */}
          {!hideControls && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Broker Inventory Analysis Controls
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Row 1: Ticker, Broker, Date Range */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Ticker Selection */}
              <div>
                <label className="block text-sm font-medium mb-2">Ticker:</label>
                <div className="relative ticker-dropdown">
                  <input
                    type="text"
                    value={isTypingTicker ? tickerSearch : selectedTicker}
                    onChange={(e) => { 
                      const value = e.target.value.toUpperCase();
                      setIsTypingTicker(true);
                      setTickerSearch(value);
                      setShowTickerSuggestions(true);
                      setHighlightedTickerIndex(0);
                    }}
                    onFocus={() => { 
                      if (!isLoadingStocks) { 
                        setIsTypingTicker(true);
                        setShowTickerSuggestions(true); 
                        setHighlightedTickerIndex(0);
                      } 
                    }}
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
                        setIsTypingTicker(false);
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
                  {(tickerSearch || isTypingTicker) && (
                    <button
                      className="absolute right-2 top-2.5 text-muted-foreground hover:bg-accent rounded"
                      onClick={() => { 
                        setTickerSearch(''); 
                        setIsTypingTicker(false);
                        setShowTickerSuggestions(false); 
                      }}
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
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
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
                            onMouseDown={(e) => { 
                              e.preventDefault(); // Prevent input blur
                              if (!selectedBrokers.includes(broker)) {
                                handleBrokerSelect(broker); 
                                // Don't close dropdown immediately, let user see the selection
                                setTimeout(() => {
                                  setShowBrokerSuggestions(false);
                                }, 100);
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
                                  style={{ backgroundColor: generateBrokerColor(broker, selectedBrokers) }}
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
                        max={new Date().toISOString().split('T')[0]}
                    className="flex-1 px-3 py-2 border border-border rounded-md bg-input text-foreground text-sm"
                      />
                  <span className="text-sm text-muted-foreground">to</span>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        min={startDate}
                        max={new Date().toISOString().split('T')[0]}
                    className="flex-1 px-3 py-2 border border-border rounded-md bg-input text-foreground text-sm"
                  />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Available data may vary by date
                    </p>
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
                      borderColor: generateBrokerColor(broker, selectedBrokers),
                      color: generateBrokerColor(broker, selectedBrokers)
                    }}
                  >
                    <div
                      className="w-2 h-2 rounded-full mr-1"
                      style={{ backgroundColor: generateBrokerColor(broker, selectedBrokers) }}
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
          )}


          {/* Conditional Chart Rendering */}
          {onlyShowInventoryChart ? (
            // Only show Broker Inventory Chart
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div>
                    <CardTitle>Broker Cumulative Net Flow</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Broker inventory accumulation starting from 0
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="relative">
                {(isLoadingData || isLoadingBrokerData) && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-2">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                      <div className="text-xs text-muted-foreground">Loading broker...</div>
                    </div>
                  </div>
                )}
                <InventoryChart
                  inventoryData={inventoryData}
                  selectedBrokers={selectedBrokers}
                />
              </CardContent>
            </Card>
          ) : splitVisualization ? (
            // Split View - Separate Charts
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
                  {(isLoadingData || isLoadingBrokerData) && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                      <div className="flex flex-col items-center gap-2">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                        <div className="text-xs text-muted-foreground">Loading stock...</div>
                      </div>
                    </div>
                  )}
                  {!isLoadingData && candlestickData.length > 0 && (
                    <PriceChart candlestickData={candlestickData} />
                  )}
                </CardContent>
              </Card>

              {/* Broker Inventory Chart */}
              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div>
                      <CardTitle>Broker Cumulative Net Flow</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Broker inventory accumulation starting from 0
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">View:</span>
                      <div className="flex items-center gap-1 border border-border rounded-lg p-1">
                        <Button
                          variant={!splitVisualization ? "default" : "ghost"}
                          onClick={() => setSplitVisualization(false)}
                          size="sm"
                          className="px-2 py-1 h-7 text-xs"
                        >
                          Combined
                        </Button>
                        <Button
                          variant={splitVisualization ? "default" : "ghost"}
                          onClick={() => setSplitVisualization(true)}
                          size="sm"
                          className="px-2 py-1 h-7 text-xs"
                        >
                          Split
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="relative">
                  {(isLoadingData || isLoadingBrokerData) && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                      <div className="flex flex-col items-center gap-2">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                        <div className="text-xs text-muted-foreground">Loading broker...</div>
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
                  {(isLoadingData || isLoadingBrokerData) && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                      <div className="flex flex-col items-center gap-2">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                        <div className="text-xs text-muted-foreground">Loading volume...</div>
                      </div>
                    </div>
                  )}
                  {!isLoadingData && volumeDataForCharts.length > 0 && (
                    <VolumeChart volumeData={volumeDataForCharts} candlestickData={candlestickData} showLabel={true} />
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            // Combined View - Original Layout
            <>
              {/* Main TradingView Chart */}
              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div>
                  <CardTitle>{selectedTicker} Inventory Analysis</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Price action (right Y-axis) with broker cumulative net flow (left Y-axis, starting from 0)
                  </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">View:</span>
                      <div className="flex items-center gap-1 border border-border rounded-lg p-1">
                        <Button
                          variant={!splitVisualization ? "default" : "ghost"}
                          onClick={() => setSplitVisualization(false)}
                          size="sm"
                          className="px-2 py-1 h-7 text-xs"
                        >
                          Combined
                        </Button>
                        <Button
                          variant={splitVisualization ? "default" : "ghost"}
                          onClick={() => setSplitVisualization(true)}
                          size="sm"
                          className="px-2 py-1 h-7 text-xs"
                        >
                          Split
                        </Button>
                      </div>
                    </div>
                  </div>
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
                      <div className="flex flex-col items-center gap-3 text-center p-6 max-w-md">
                        <div className="text-4xl">⚠️</div>
                        <div className="text-sm text-muted-foreground">
                          {dataError || brokerDataError}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          Tip: Try adjusting the date range. Data may not be available for all selected dates.
                        </p>
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

      {/* Top Brokers Table */}
          <Card>
            <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Top Brokers by Date</CardTitle>
              <p className="text-sm text-muted-foreground">
                Top brokers by net transaction (nblot) across selected dates for {selectedTicker}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Show:</label>
              <select 
                value={topBrokersCount} 
                onChange={(e) => setTopBrokersCount(e.target.value as 5 | 10 | 15 | 20 | 'all')}
                className="px-3 py-1 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              >
                <option value={5}>Top 5</option>
                <option value={10}>Top 10</option>
                <option value={15}>Top 15</option>
                <option value={20}>Top 20</option>
                <option value="all">All</option>
              </select>
            </div>
          </div>
            </CardHeader>
            <CardContent>
              {isLoadingBrokerData ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
                  <p className="text-sm text-muted-foreground">Loading broker data...</p>
                </div>
              ) : brokerDataError ? (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">{brokerDataError}</p>
                </div>
              ) : topBrokersData.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">No broker data available</p>
                </div>
              ) : (
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
                {topBrokersData.length > 0 && Array.from({ 
                  length: topBrokersCount === 'all' ? (topBrokersData[0]?.topBrokers?.length || 0) : Math.min(topBrokersCount, topBrokersData[0]?.topBrokers?.length || 0) 
                }, (_, rank) => (
                  <tr key={rank} className="border-b border-border/50 hover:bg-accent/50">
                    <td className="py-2 px-3 font-medium text-center">
                      {rank + 1}
                          </td>
                     {topBrokersData.map((dateData) => {
                       const brokerData = dateData.topBrokers[rank];
                       
                      return (
                         <td 
                           key={`${dateData.date}-${rank}`} 
                           className="text-center py-2 px-3 relative"
                           style={brokerData ? { backgroundColor: brokerData.color } : {}}
                         >
                           <div className="relative w-full h-8 flex items-center justify-center">
                             {/* Broker code and volume overlay */}
                             <div className="relative z-10 flex items-center gap-2">
                               {brokerData ? (
                                 <>
                                   <span className="font-medium text-xs text-white">
                                     {brokerData.broker}
                                   </span>
                                   <span className="text-xs font-semibold text-white">
                                     {formatLotNumber(brokerData.netFlow)}
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
              )}
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
});
