import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { X, Calendar, RotateCcw } from 'lucide-react';
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
const generateBrokerColor = (broker: string | undefined | null, allBrokers: string[] = []): string => {
  // Handle undefined/null broker
  if (!broker || typeof broker !== 'string') {
    return 'hsl(0, 0%, 50%)'; // Return gray color for invalid broker
  }
  
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
      const firstInventoryItem = inventoryData[0];
      console.log(`📊 InventoryChart render:`, {
        inventoryDataLength: inventoryData.length,
        selectedBrokers,
        sampleInventoryData: inventoryData.slice(0, 3),
        inventoryDataKeys: firstInventoryItem ? Object.keys(firstInventoryItem) : []
      });

      if (inventoryData.length === 0) {
        console.warn(`⚠️ InventoryChart: No inventory data provided`);
        return;
      }

      if (selectedBrokers.length === 0) {
        console.warn(`⚠️ InventoryChart: No selected brokers`);
        return;
      }

      selectedBrokers.forEach(broker => {
        // Extract broker-specific data from inventoryData
        const brokerData = inventoryData
          .map(d => {
            const brokerValue = d[broker];
            // Convert time to proper format (lightweight-charts expects YYYY-MM-DD string)
            let timeValue: string = String(d.time || '');
            
            // Ensure time is in YYYY-MM-DD format
            const rawTime: any = d.time;
            if (typeof rawTime === 'string') {
              timeValue = rawTime;
              // Check format
              if (!/^\d{4}-\d{2}-\d{2}$/.test(timeValue)) {
                // Try to parse and reformat
                const date = new Date(timeValue);
                if (!isNaN(date.getTime())) {
                  const isoStr = date.toISOString().split('T')[0];
                  timeValue = isoStr || timeValue;
                }
              }
            } else if (rawTime && typeof rawTime === 'object' && 'toISOString' in rawTime) {
              // Date object
              const dateObj = rawTime as Date;
              const isoStr = dateObj.toISOString().split('T')[0];
              timeValue = isoStr || '';
            } else if (typeof rawTime === 'number') {
              // Unix timestamp
              const date = new Date(rawTime * 1000);
              const isoStr = date.toISOString().split('T')[0];
              timeValue = isoStr || '';
            }
            
            return {
              time: timeValue,
              value: typeof brokerValue === 'number' ? brokerValue : 0
            };
          })
          .filter(d => {
            // Filter out invalid data points
            const isValid = d.time && !isNaN(d.value) && isFinite(d.value);
            return isValid;
          })
          .sort((a, b) => {
            // Sort by time
            return a.time.localeCompare(b.time);
          });
        
        console.log(`📊 InventoryChart: Adding series for broker ${broker}:`, {
          brokerDataLength: brokerData.length,
          sampleData: brokerData.slice(0, 5),
          hasData: brokerData.length > 0,
          firstValue: brokerData[0]?.value,
          lastValue: brokerData[brokerData.length - 1]?.value
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
          console.log(`✅ InventoryChart: Series added for broker ${broker} with ${brokerData.length} data points`);
        } else {
          console.warn(`⚠️ InventoryChart: No valid data found for broker ${broker}`);
        }
      });

      // Fit content after adding all series
      chart.timeScale().fitContent();
      console.log(`✅ InventoryChart: Chart rendered with ${selectedBrokers.length} series`);
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


// Cache mechanism
const cache = {
  brokers: new Map<string, { data: string[]; timestamp: number }>(),
  inventory: new Map<string, { data: any[]; timestamp: number }>(),
  stockData: new Map<string, { data: any[]; timestamp: number }>(),
  topBrokers: new Map<string, { data: any[]; timestamp: number }>(),
  latestDate: { date: null as string | null, timestamp: 0 },
  
  get(key: string, cacheMap: Map<string, any>, ttl: number = 5 * 60 * 1000): any | null {
    const cached = cacheMap.get(key);
    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.data;
    }
    return null;
  },
  
  set(key: string, data: any, cacheMap: Map<string, any>): void {
    cacheMap.set(key, { data, timestamp: Date.now() });
  },
  
  clear(): void {
    cache.brokers.clear();
    cache.inventory.clear();
    cache.stockData.clear();
    cache.topBrokers.clear();
  }
};

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
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [dateRangeMode, setDateRangeMode] = useState<'1day' | '3days' | '1week' | 'custom'>('custom');
  const [selectedDatesForDisplay, setSelectedDatesForDisplay] = useState<string[]>([]); // For displaying selected dates as badges
  const [isInitializing, setIsInitializing] = useState(true);
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
  // Sector Filter states
  const [sectorFilter, setSectorFilter] = useState<string>('All'); // 'All' or sector name
  const [availableSectors, setAvailableSectors] = useState<string[]>([]); // List of available sectors
  const [stockToSectorMap, setStockToSectorMap] = useState<{ [stock: string]: string }>({}); // Stock code -> sector name mapping
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isLoadingBrokerData, setIsLoadingBrokerData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [brokerDataError, setBrokerDataError] = useState<string | null>(null);
  const [ohlcData, setOhlcData] = useState<any[]>([]);
  const [volumeData, setVolumeData] = useState<any[]>([]);
  const [brokerSummaryData, setBrokerSummaryData] = useState<any[]>([]); // Still used for top brokers table
  const [availableBrokersForStock, setAvailableBrokersForStock] = useState<string[]>([]);
  const [isLoadingBrokersForStock, setIsLoadingBrokersForStock] = useState(false);
  const [topBrokersCount, setTopBrokersCount] = useState<5 | 10 | 15 | 20 | 'all'>(5);
  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);
  const [latestDataDate, setLatestDataDate] = useState<string | null>(null);
  
  // Minimum date allowed: 19/09/2025
  const MIN_DATE = '2025-09-19';

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

  // Helper function to trigger date picker
  const triggerDatePicker = (inputRef: React.RefObject<HTMLInputElement>) => {
    if (inputRef.current) {
      inputRef.current.showPicker();
    }
  };

  // Helper function to format date for input (YYYY-MM-DD)
  const formatDateForInput = (date: string | undefined) => {
    return date || ''; // Already in YYYY-MM-DD format, return empty string if undefined
  };

  // Helper functions for date management (from BrokerInventory.tsx)
  const getTradingDays = (count: number): string[] => {
    const dates: string[] = [];
    const today = new Date();
    let currentDate = new Date(today);
    
    while (dates.length < count) {
      const dayOfWeek = currentDate.getDay();
      
      // Skip weekends (Saturday = 6, Sunday = 0)
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        const dateStr = currentDate.toISOString().split('T')[0];
        if (dateStr) {
          dates.push(dateStr);
        }
      }
      
      // Go to previous day
      currentDate.setDate(currentDate.getDate() - 1);
      
      // Safety check
      if (dates.length === 0 && currentDate.getTime() < today.getTime() - (30 * 24 * 60 * 60 * 1000)) {
        const todayStr = today.toISOString().split('T')[0];
        if (todayStr) {
          dates.push(todayStr);
        }
        break;
      }
    }
    
    return dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  };

  const getLastThreeDays = (): string[] => {
    return getTradingDays(3);
  };

  // Handler for date range mode change (from BrokerInventory.tsx)
  const handleDateRangeModeChange = (mode: '1day' | '3days' | '1week' | 'custom') => {
    setDateRangeMode(mode);
    
    // Only auto-set dates for quick select modes, not custom
    if (mode === '1day') {
      const oneDay = getLastThreeDays().slice(0, 1);
      const sortedDates = [...oneDay].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      if (sortedDates.length > 0) {
        setStartDate(sortedDates[0]);
        setEndDate(sortedDates[0]);
        setSelectedDatesForDisplay(sortedDates);
      }
    } else if (mode === '3days') {
      const threeDays = getLastThreeDays();
      const sortedDates = [...threeDays].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      if (sortedDates.length > 0) {
        setStartDate(sortedDates[0]);
        setEndDate(sortedDates[sortedDates.length - 1]);
        setSelectedDatesForDisplay(sortedDates);
      }
    } else if (mode === '1week') {
      const oneWeek = getLastThreeDays().slice(0, 7);
      const sortedDates = [...oneWeek].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      if (sortedDates.length > 0) {
        setStartDate(sortedDates[0]);
        setEndDate(sortedDates[sortedDates.length - 1]);
        setSelectedDatesForDisplay(sortedDates);
      }
    } else if (mode === 'custom') {
      // For custom mode, don't auto-set dates, let user input manually
      // Keep current dates but update selectedDatesForDisplay based on date range
      if (startDate && endDate) {
        const dates: string[] = [];
        const start = new Date(startDate);
        const end = new Date(endDate);
        const current = new Date(start);
        
        while (current <= end) {
          const dayOfWeek = current.getDay();
          if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            const dateStr = current.toISOString().split('T')[0];
            if (dateStr) dates.push(dateStr);
          }
          current.setDate(current.getDate() + 1);
        }
        
        setSelectedDatesForDisplay(dates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime()));
      }
    }
  };

  // Update selectedDatesForDisplay when startDate or endDate changes (for custom mode)
  useEffect(() => {
    if (dateRangeMode === 'custom' && startDate && endDate) {
      const dates: string[] = [];
      const start = new Date(startDate);
      const end = new Date(endDate);
      const current = new Date(start);
      
      while (current <= end) {
        const dayOfWeek = current.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          const dateStr = current.toISOString().split('T')[0];
          if (dateStr) dates.push(dateStr);
        }
        current.setDate(current.getDate() + 1);
      }
      
      setSelectedDatesForDisplay(dates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime()));
    }
  }, [startDate, endDate, dateRangeMode]);

  // Load initial data (stocks list only) on component mount
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
        
        // Load sector mapping for sector filter
        const sectorResponse = await api.getSectorMapping();
        if (sectorResponse.success && sectorResponse.data) {
          setStockToSectorMap(sectorResponse.data.stockToSector);
          setAvailableSectors(['All', ...sectorResponse.data.sectors]);
          console.log(`[BrokerInventory] Loaded sector mapping: ${Object.keys(sectorResponse.data.stockToSector).length} stocks, ${sectorResponse.data.sectors.length} sectors`);
        } else {
          console.warn('[BrokerInventory] Failed to load sector mapping, sector filter will not work');
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

  // Load latest date and set default date range when stock is selected
  useEffect(() => {
    const loadLatestDateForStock = async () => {
      if (!selectedTicker) {
        return;
      }
      
      try {
        setIsInitializing(true);
        
        // Check if we have cached latest date for this stock
        const cachedDate = cache.latestDate.date;
        const cachedStock = (cache.latestDate as any).stockCode;
        
        let latestDate: string | null = null;
        
        if (cachedDate && cachedStock === selectedTicker && Date.now() - cache.latestDate.timestamp < 5 * 60 * 1000) {
          latestDate = cachedDate;
          setLatestDataDate(latestDate);
          console.log(`📊 Using cached latest date for ${selectedTicker}: ${latestDate}`);
        } else {
          // Fetch latest date for this specific stock
          console.log(`📊 Fetching latest date for stock: ${selectedTicker}`);
          const latestResponse = await api.getLatestStockDate(selectedTicker);
          
          if (latestResponse.success && latestResponse.data?.latestDate) {
            latestDate = latestResponse.data.latestDate;
            // Cache with stock code
            cache.latestDate = { 
              date: latestDate, 
              timestamp: Date.now(),
              stockCode: selectedTicker 
            } as any;
            // Store latest date in state for validation and display
            setLatestDataDate(latestDate);
            console.log(`📊 Fetched latest date for ${selectedTicker}: ${latestDate}`);
          } else {
            console.warn(`⚠️ Could not get latest date for ${selectedTicker}`);
            setLatestDataDate(null);
          }
        }
        
        if (latestDate) {
          // Set end date to latest date
          setEndDate(latestDate);
          
          // Set start date to 1 month before latest date
          const latest = new Date(latestDate);
          const oneMonthAgo = new Date(latest);
          oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
          const startDateStr = oneMonthAgo.toISOString().split('T')[0];
          if (startDateStr) {
            setStartDate(startDateStr);
          }
          
          console.log(`📊 Default date range set for ${selectedTicker}: ${startDateStr} to ${latestDate}`);
        } else {
          // Fallback: use today if latest date not available
          const today = new Date();
          const oneMonthAgo = new Date(today);
          oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
          const todayStr = today.toISOString().split('T')[0];
          const oneMonthAgoStr = oneMonthAgo.toISOString().split('T')[0];
          if (todayStr) setEndDate(todayStr);
          if (oneMonthAgoStr) setStartDate(oneMonthAgoStr);
          console.log(`📊 Using fallback date range for ${selectedTicker}`);
        }
        
      } catch (error) {
        console.error(`Error loading latest date for ${selectedTicker}:`, error);
        // Fallback to current date
        const today = new Date();
        const oneMonthAgo = new Date(today);
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        const todayStr = today.toISOString().split('T')[0];
        const oneMonthAgoStr = oneMonthAgo.toISOString().split('T')[0];
        if (todayStr) setEndDate(todayStr);
        if (oneMonthAgoStr) setStartDate(oneMonthAgoStr);
      } finally {
        setIsInitializing(false);
      }
    };
    
    loadLatestDateForStock();
  }, [selectedTicker]);

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
      if (!selectedTicker || !startDate || !endDate || isInitializing) return;
      
      setIsLoadingData(true);
      setDataError(null);
      
      try {
        // Check cache first (5 minutes TTL)
        const cacheKey = `${selectedTicker}-${startDate}-${endDate}`;
        const cachedData = cache.get(cacheKey, cache.stockData, 5 * 60 * 1000);
        
        if (cachedData) {
          console.log(`📊 Using cached stock data for ${selectedTicker}`);
          setOhlcData(cachedData.candlestick);
          setVolumeData(cachedData.volume);
          setIsLoadingData(false);
          return;
        }
        
        console.log(`📊 Loading stock data for ${selectedTicker} from ${startDate} to ${endDate}`);
        
        // Call stock API to get OHLC data (backend already filters by date range)
        const response = await api.getStockData(selectedTicker, startDate, endDate, 1000);
        
        if (response.success && response.data?.data) {
          const stockData = response.data.data;
          console.log(`📊 Received ${stockData.length} records for ${selectedTicker}`);
          
          // Filter data by date range (additional client-side filter for safety)
          const filteredData = stockData.filter((row: any) => {
            const rowDate = row.Date;
            return rowDate >= startDate && rowDate <= endDate;
          });
          
          // Convert to candlestick format for charts
          const candlestickData = filteredData.map((row: any) => ({
            time: row.Date,
            open: row.Open || 0,
            high: row.High || 0,
            low: row.Low || 0,
            close: row.Close || 0,
            volume: row.Volume || 0
          }));
          
          // Convert to volume format for charts
          const volumeChartData = filteredData.map((row: any) => ({
            time: row.Date,
            value: row.Volume || 0,
            color: (row.Close || 0) >= (row.Open || 0) ? '#16a34a' : '#dc2626'
          }));
          
          // Cache the data
          cache.set(cacheKey, { candlestick: candlestickData, volume: volumeChartData }, cache.stockData);
          
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
  }, [selectedTicker, startDate, endDate, isInitializing, showToast]);

  // Load top brokers data for table using top_broker API
  useEffect(() => {
    const loadTopBrokersData = async () => {
      // Load top brokers data for table (not for chart)
      if (!selectedTicker || !startDate || !endDate || ohlcData.length === 0 || isInitializing) {
        setBrokerSummaryData([]);
        return;
      }
      
      setIsLoadingBrokerData(true);
      setBrokerDataError(null);
      
      try {
        // Get dates from OHLC data (already filtered by date range)
        const ohlcDates = ohlcData.map(d => d.time).sort();
        
        if (ohlcDates.length === 0) {
          console.log('⚠️ No OHLC dates available');
          setBrokerSummaryData([]);
          return;
        }
        
        console.log(`🔄 Loading top brokers data for ${selectedTicker} from ${startDate} to ${endDate}`);
        console.log(`📊 Using ${ohlcDates.length} dates from OHLC data (filtered by date range)`);
        
        // Load top brokers for each date using top_broker API (with caching)
        const allBrokerData: any[] = [];
        let successfulDates = 0;
        
        for (const dateStr of ohlcDates) {
          // Filter dates within range (additional safety check)
          if (dateStr < startDate || dateStr > endDate) {
            continue;
          }
          
          try {
            // Check cache first (5 minutes TTL)
            const cacheKey = `top-brokers-${dateStr}`;
            let brokerData: any[] | null = cache.get(cacheKey, cache.topBrokers, 5 * 60 * 1000);
            
            if (!brokerData) {
              const response = await api.getTopBrokers(dateStr);
              
              if (response.success && response.data?.brokers) {
                const brokers = response.data.brokers;
                
                // Map top broker format to our format
                brokerData = brokers.map((broker: any) => ({
                  broker: broker.brokercode || broker.BrokerCode || '',
                  BrokerCode: broker.brokercode || broker.BrokerCode || '',
                  NetBuyVol: broker.netbuyvol || 0,
                  TotalVol: broker.totalvol || 0,
                  date: dateStr,
                  time: dateStr
                }));
                
                // Cache the data
                cache.set(cacheKey, brokerData, cache.topBrokers);
              } else {
                brokerData = [];
              }
            } else {
              // Update dates in cached data to match current date
              brokerData = brokerData.map((b: any) => ({ ...b, date: dateStr, time: dateStr }));
            }
            
            if (brokerData && brokerData.length > 0) {
              allBrokerData.push(...brokerData);
              successfulDates++;
            }
          } catch (error) {
            console.warn(`⚠️ Error loading top brokers for ${dateStr}:`, error);
          }
        }
        
        // Filter final data by date range (additional safety check)
        const filteredBrokerData = allBrokerData.filter((record: any) => {
          const recordDate = record.date || record.time;
          return recordDate >= startDate && recordDate <= endDate;
        });
        
        console.log(`📊 ===== TOP BROKERS DATA LOADING COMPLETE =====`);
        console.log(`📊 Total dates processed: ${ohlcDates.length}`);
        console.log(`📊 Successful dates: ${successfulDates}`);
        console.log(`📊 Total broker records (after filtering): ${filteredBrokerData.length}`);
        
        if (filteredBrokerData.length === 0) {
          setBrokerDataError(`No top broker data found for ${selectedTicker} in date range ${startDate} to ${endDate}.`);
        } else {
          setBrokerDataError(null);
        }
        
        setBrokerSummaryData(filteredBrokerData);
        
      } catch (error) {
        console.error('Error loading top brokers data:', error);
        setBrokerDataError(error instanceof Error ? error.message : 'Failed to load top brokers data');
        showToast({
          type: 'error',
          title: 'Error Memuat Data Top Brokers',
          message: 'Gagal memuat data top brokers.'
        });
      } finally {
        setIsLoadingBrokerData(false);
      }
    };
    
    loadTopBrokersData();
    // Only depend on ohlcData length, not the whole array to prevent unnecessary re-runs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTicker, startDate, endDate, ohlcData.length, isInitializing, showToast]);

  // Load available brokers for selected stock code from broker_inventory folder
  useEffect(() => {
    const loadBrokersForStock = async () => {
      if (!selectedTicker) {
        setAvailableBrokersForStock([]);
        return;
      }
      
      try {
        // Check cache first (10 minutes TTL)
        const cacheKey = `brokers-${selectedTicker}`;
        const cachedBrokers = cache.get(cacheKey, cache.brokers, 10 * 60 * 1000);
        
        if (cachedBrokers) {
          console.log(`📊 Using cached brokers for ${selectedTicker}:`, cachedBrokers.length);
          setAvailableBrokersForStock(cachedBrokers);
          
          // Auto-select default brokers if no brokers are currently selected
          setSelectedBrokers(prevSelected => {
            if (prevSelected.length === 0) {
              const defaultBrokers = ['AK', 'BK', 'MG'];
              const availableDefaultBrokers = defaultBrokers.filter(broker => cachedBrokers.includes(broker));
              
              if (availableDefaultBrokers.length > 0) {
                return availableDefaultBrokers;
              } else {
                return cachedBrokers.slice(0, 3);
              }
            }
            return prevSelected.filter(broker => cachedBrokers.includes(broker));
          });
          
          return;
        }
        
        console.log(`📊 Loading available brokers for stock: ${selectedTicker} from broker_inventory`);
        setIsLoadingBrokersForStock(true);
        
        // Get brokers from broker_inventory folder
        const response = await api.getBrokerInventoryBrokers(selectedTicker);
        
        if (response.success && response.data?.brokers) {
          const uniqueBrokers = response.data.brokers.sort() as string[];
          
          // Cache the brokers
          cache.set(cacheKey, uniqueBrokers, cache.brokers);
          
          if (uniqueBrokers.length > 0) {
            console.log(`✅ Found ${uniqueBrokers.length} brokers for ${selectedTicker} from broker_inventory:`, uniqueBrokers);
            setAvailableBrokersForStock(uniqueBrokers);
            
            // Auto-select default brokers (AK, BK, MG) only if no brokers are currently selected
            // Use functional update to avoid dependency on selectedBrokers
            setSelectedBrokers(prevSelected => {
              if (prevSelected.length === 0) {
                const defaultBrokers = ['AK', 'BK', 'MG'];
                const availableDefaultBrokers = defaultBrokers.filter(broker => uniqueBrokers.includes(broker));
                
                if (availableDefaultBrokers.length > 0) {
                  console.log(`📊 Auto-selecting default brokers:`, availableDefaultBrokers);
                  return availableDefaultBrokers;
                } else {
                  // Fallback to first 3 brokers if default brokers not available
                  const fallbackBrokers = uniqueBrokers.slice(0, 3);
                  console.log(`📊 Default brokers not available, selecting first 3 brokers:`, fallbackBrokers);
                  return fallbackBrokers;
                }
              } else {
                // Update selected brokers to only include those available for this stock
                const validSelectedBrokers = prevSelected.filter(broker => uniqueBrokers.includes(broker));
                if (validSelectedBrokers.length !== prevSelected.length) {
                  console.log(`📊 Updating selected brokers to match available brokers:`, validSelectedBrokers);
                  return validSelectedBrokers;
                }
                // Return unchanged if all selected brokers are still valid
                return prevSelected;
              }
            });
          } else {
            console.log(`⚠️ No brokers found for ${selectedTicker} in broker_inventory`);
            setAvailableBrokersForStock([]);
            setSelectedBrokers([]);
          }
        } else {
          console.log(`⚠️ Failed to load brokers for ${selectedTicker}`);
          setAvailableBrokersForStock([]);
          setSelectedBrokers([]);
        }
      } catch (error) {
        console.error('Error loading brokers for stock:', error);
        setAvailableBrokersForStock([]);
        setSelectedBrokers([]);
      } finally {
        setIsLoadingBrokersForStock(false);
      }
    };
    
    loadBrokersForStock();
    // Remove selectedBrokers from dependencies to prevent infinite loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTicker]);

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

  const filteredTickers = useMemo(() => {
    let filtered = availableStocks.filter(ticker =>
      ticker.toLowerCase().includes(tickerSearch.toLowerCase())
    );
    
    // Filter by sector if sector filter is not 'All'
    if (sectorFilter !== 'All') {
      filtered = filtered.filter(ticker => {
        const stockSector = stockToSectorMap[ticker.toUpperCase()];
        return stockSector === sectorFilter;
      });
    }
    
    return filtered;
  }, [availableStocks, tickerSearch, sectorFilter, stockToSectorMap]);

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

  // Load broker inventory data (cumulative net flow) for selected brokers
  const [brokerInventoryData, setBrokerInventoryData] = useState<{ [broker: string]: any[] }>({});
  const [isLoadingInventoryData, setIsLoadingInventoryData] = useState(false);

  // Load broker inventory data when brokers are selected
  useEffect(() => {
    const loadBrokerInventory = async () => {
      if (!selectedTicker || selectedBrokers.length === 0 || !startDate || !endDate || isInitializing) {
        setBrokerInventoryData({});
        return;
      }

      setIsLoadingInventoryData(true);
      const inventoryDataMap: { [broker: string]: any[] } = {};

      try {
        console.log(`📊 Loading broker inventory data for ${selectedBrokers.length} brokers from ${startDate} to ${endDate}`);
        
        // Load inventory data for each selected broker
        for (const broker of selectedBrokers) {
          try {
            // Check cache first (5 minutes TTL)
            const cacheKey = `inventory-${selectedTicker}-${broker}`;
            let cachedData = cache.get(cacheKey, cache.inventory, 5 * 60 * 1000);
            
            let formattedData: any[] = [];
            
            if (cachedData) {
              console.log(`📊 Using cached inventory data for ${selectedTicker}/${broker}`);
              formattedData = cachedData;
            } else {
              const response = await api.getBrokerInventoryData(selectedTicker, broker);
              
              if (response.success && response.data?.inventoryData) {
                // Convert Date format from YYMMDD to YYYY-MM-DD for chart compatibility
                formattedData = response.data.inventoryData.map((row: any) => {
                  let dateStr = row.Date || row.date || '';
                  
                  // Convert YYMMDD (6 digits) to YYYY-MM-DD
                  // Format dari backend: YYMMDD (contoh: 241031 untuk 31 Oktober 2024)
                  if (dateStr && typeof dateStr === 'string') {
                    // Check if it's already YYYY-MM-DD format
                    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                      // Already in correct format, use as is
                    } else if (dateStr.length === 6 && /^\d{6}$/.test(dateStr)) {
                      // YYMMDD format - convert to YYYY-MM-DD
                      const year = 2000 + parseInt(dateStr.substring(0, 2), 10);
                      const month = dateStr.substring(2, 4);
                      const day = dateStr.substring(4, 6);
                      dateStr = `${year}-${month}-${day}`;
                    } else if (dateStr.length === 8 && /^\d{8}$/.test(dateStr)) {
                      // YYYYMMDD format - convert to YYYY-MM-DD
                      const year = dateStr.substring(0, 4);
                      const month = dateStr.substring(4, 6);
                      const day = dateStr.substring(6, 8);
                      dateStr = `${year}-${month}-${day}`;
                    }
                  }
                  
                  // Ensure CumulativeNetBuyVol is properly parsed (handle case variations)
                  const cumulativeNetBuyVol = row.CumulativeNetBuyVol ?? row.cumulativeNetBuyVol ?? row.CumulativeNetBuy ?? row.cumulativeNetBuy ?? 0;
                  
                  // Ensure numeric values are properly converted
                  const netBuyVol = typeof row.NetBuyVol === 'number' ? row.NetBuyVol : parseFloat(String(row.NetBuyVol || 0)) || 0;
                  const cumNetBuyVol = typeof cumulativeNetBuyVol === 'number' ? cumulativeNetBuyVol : parseFloat(String(cumulativeNetBuyVol || 0)) || 0;
                  
                  const formattedRow = {
                    ...row,
                    Date: dateStr,
                    time: dateStr, // For chart compatibility
                    NetBuyVol: netBuyVol,
                    CumulativeNetBuyVol: cumNetBuyVol // Ensure consistent field name
                  };
                  
                  return formattedRow;
                });
                
                // Cache the full data
                cache.set(cacheKey, formattedData, cache.inventory);
              } else {
                console.warn(`⚠️ No inventory data for broker ${broker}`);
                formattedData = [];
              }
            }
            
            // Filter data by date range
            console.log(`🔍 Filtering data for broker ${broker} by date range: ${startDate} to ${endDate}`);
            console.log(`📊 Total records before filter: ${formattedData.length}`);
            if (formattedData.length > 0) {
              console.log(`📊 Sample dates before filter:`, formattedData.slice(0, 5).map((r: any) => ({
                original: r.Date || r.time || r.date,
                formatted: r.Date,
                cumulative: r.CumulativeNetBuyVol
              })));
            }
            
            const filteredData = formattedData.filter((row: any) => {
              const rowDate = row.Date || row.time || row.date;
              const inRange = rowDate >= startDate && rowDate <= endDate;
              if (!inRange && formattedData.length <= 10) {
                // Log first few out-of-range dates for debugging
                console.log(`⚠️ Date ${rowDate} is out of range (${startDate} to ${endDate})`);
              }
              return inRange;
            });
            
            console.log(`📊 Records after filter: ${filteredData.length}`);
            if (filteredData.length > 0) {
              console.log(`📊 Sample dates after filter:`, filteredData.slice(0, 5).map((r: any) => ({
                date: r.Date,
                cumulative: r.CumulativeNetBuyVol
              })));
            } else if (formattedData.length > 0) {
              console.warn(`⚠️ All ${formattedData.length} records filtered out! Date range: ${startDate} to ${endDate}`);
              console.warn(`📊 Available date range in data:`, {
                earliest: formattedData[formattedData.length - 1]?.Date,
                latest: formattedData[0]?.Date,
                allDates: formattedData.map((r: any) => r.Date).slice(0, 10)
              });
            }
            
            inventoryDataMap[broker] = filteredData;
            console.log(`✅ Loaded ${filteredData.length} records for broker ${broker} (filtered from ${formattedData.length} total)`, {
              sampleRecord: filteredData[0],
              hasCumulativeNetBuyVol: filteredData[0]?.CumulativeNetBuyVol !== undefined,
              cumulativeValue: filteredData[0]?.CumulativeNetBuyVol,
              dateRange: filteredData.length > 0 ? {
                first: filteredData[filteredData.length - 1]?.Date,
                last: filteredData[0]?.Date
              } : null,
              allDates: filteredData.map((r: any) => r.Date).slice(0, 5)
            });
          } catch (error) {
            console.error(`❌ Error loading inventory for broker ${broker}:`, error);
            inventoryDataMap[broker] = [];
          }
        }
        
        setBrokerInventoryData(inventoryDataMap);
        console.log(`📊 Broker inventory data loaded for ${Object.keys(inventoryDataMap).length} brokers (filtered by date range ${startDate} to ${endDate})`);
        console.log(`📊 Inventory data summary:`, {
          brokers: Object.keys(inventoryDataMap),
          recordCounts: Object.entries(inventoryDataMap).map(([broker, data]) => ({
            broker,
            count: (data as any[]).length,
            hasData: (data as any[]).length > 0
          }))
        });
      } catch (error) {
        console.error('Error loading broker inventory:', error);
      } finally {
        setIsLoadingInventoryData(false);
      }
    };

    loadBrokerInventory();
  }, [selectedTicker, selectedBrokers, startDate, endDate, isInitializing]);

  // Convert broker inventory data to time series format for chart
  const inventoryData = useMemo(() => {
    if (selectedBrokers.length === 0 || Object.keys(brokerInventoryData).length === 0) {
      console.log(`📊 Inventory data empty: selectedBrokers=${selectedBrokers.length}, brokerInventoryData keys=${Object.keys(brokerInventoryData).length}`);
      return [];
    }

    const firstBroker = selectedBrokers[0];
    console.log(`📊 Converting broker inventory data to time series format`, {
      selectedBrokers,
      brokerInventoryDataKeys: Object.keys(brokerInventoryData),
      sampleData: firstBroker ? brokerInventoryData[firstBroker]?.slice(0, 3) : undefined
    });
    
    // Collect all unique dates from all brokers
    const allDates = new Set<string>();
    Object.values(brokerInventoryData).forEach(brokerData => {
      brokerData.forEach((row: any) => {
        const date = row.Date || row.time || row.date;
        if (date) allDates.add(date);
      });
    });

    const sortedDates = Array.from(allDates).sort();
    const inventorySeries: InventoryTimeSeries[] = [];

    sortedDates.forEach(date => {
      const dayData: InventoryTimeSeries = { time: date };
      
      // For each selected broker, get cumulative value for this date
      selectedBrokers.forEach(broker => {
        const brokerData = brokerInventoryData[broker] || [];
        // Find the record for this date (or closest previous date)
        let cumulativeValue = 0;
        
        // Try to find exact match first
        const exactMatch = brokerData.find((row: any) => {
          const rowDate = row.Date || row.time || row.date;
          return rowDate === date;
        });
        
        if (exactMatch) {
          // Handle case variations for CumulativeNetBuyVol
          cumulativeValue = exactMatch.CumulativeNetBuyVol ?? 
                           exactMatch.cumulativeNetBuyVol ?? 
                           exactMatch.CumulativeNetBuy ?? 
                           exactMatch.cumulativeNetBuy ?? 
                           0;
          
          // Ensure it's a number
          cumulativeValue = typeof cumulativeValue === 'number' ? cumulativeValue : parseFloat(String(cumulativeValue)) || 0;
        } else {
          // If no exact match, find closest previous date
          for (let i = brokerData.length - 1; i >= 0; i--) {
            const row = brokerData[i];
            const rowDate = row.Date || row.time || row.date;
            if (rowDate && rowDate <= date) {
              cumulativeValue = row.CumulativeNetBuyVol ?? 
                               row.cumulativeNetBuyVol ?? 
                               row.CumulativeNetBuy ?? 
                               row.cumulativeNetBuy ?? 
                               0;
              
              // Ensure it's a number
              cumulativeValue = typeof cumulativeValue === 'number' ? cumulativeValue : parseFloat(String(cumulativeValue)) || 0;
              break;
            }
          }
        }
        
        // Store as number (not undefined)
        dayData[broker] = cumulativeValue;
      });
      
      inventorySeries.push(dayData);
    });

    console.log(`📊 Generated ${inventorySeries.length} time series points for ${selectedBrokers.length} brokers`, {
      sampleSeries: inventorySeries.slice(0, 3),
      hasData: inventorySeries.length > 0,
      firstPointBrokers: inventorySeries[0] ? Object.keys(inventorySeries[0]).filter(k => k !== 'time') : []
    });
    
    return inventorySeries;
  }, [brokerInventoryData, selectedBrokers]);

  const volumeDataForCharts = useMemo(() => {
    return volumeData;
  }, [volumeData]);

  // Generate unique colors for brokers (avoiding white/gray colors)
  const generateUniqueBrokerColor = (broker: string | undefined | null, allBrokers: string[]): string => {
    // Handle undefined/null broker
    if (!broker || typeof broker !== 'string') {
      return 'hsl(0, 0%, 50%)'; // Return gray color for invalid broker
    }
    
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

  // Generate Top Brokers data by date from brokerSummaryData (from top_broker API)
  const topBrokersData = useMemo(() => {
    if (!brokerSummaryData || brokerSummaryData.length === 0) return [];
    
    // Get all unique brokers from the data
    // Filter out undefined/null/empty brokers
    const allBrokers = [...new Set(brokerSummaryData.map(r => r.broker).filter((b): b is string => Boolean(b) && typeof b === 'string'))];
    
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
    
    // For each date, get top brokers (already sorted from top_broker API)
    return dates.map(date => {
      const brokersForDate = dataByDate[date] || [];
      
      // Data from top_broker API already has NetBuyVol and TotalVol
      // Sort by NetBuyVol descending and slice based on topBrokersCount
      const sortedBrokers = brokersForDate
        .filter(record => record.broker && typeof record.broker === 'string')
        .sort((a, b) => (b.NetBuyVol || 0) - (a.NetBuyVol || 0))
        .slice(0, topBrokersCount === 'all' ? brokersForDate.length : topBrokersCount)
        .map((record) => ({
          broker: record.broker || record.BrokerCode || '',
          volume: record.TotalVol || 0,
          netFlow: record.NetBuyVol || 0,
          color: generateUniqueBrokerColor(record.broker || record.BrokerCode || '', allBrokers)
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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Broker Inventory Analysis Controls
            </CardTitle>
            {latestDataDate && (
              <div className="text-sm text-muted-foreground">
                Last update data: <span className="font-medium text-foreground">
                  {new Date(latestDataDate).toLocaleDateString('id-ID', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric'
                  })}
                </span>
              </div>
            )}
          </div>
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
              <div className="md:col-span-2 lg:col-span-1">
                    <label className="block text-sm font-medium mb-2">Date Range:</label>
                <div className="flex items-center gap-2">
                  <div 
                    className="relative h-9 flex-1 rounded-md border border-input bg-background cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => triggerDatePicker(startDateRef)}
                  >
                    <input
                      ref={startDateRef}
                      type="date"
                      value={formatDateForInput(startDate)}
                      onChange={(e) => {
                        const selectedDate = e.target.value;
                        
                        // Validate minimum date (19/09/2025)
                        if (selectedDate < MIN_DATE) {
                          showToast({
                            type: 'error',
                            title: 'Tanggal Tidak Valid',
                            message: `Tanggal minimum yang bisa dipilih adalah ${new Date(MIN_DATE).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}`
                          });
                          // Reset to previous value
                          if (startDateRef.current) {
                            startDateRef.current.value = formatDateForInput(startDate);
                          }
                          return;
                        }
                        
                        // Validate maximum date (latest data date)
                        if (latestDataDate && selectedDate > latestDataDate) {
                          showToast({
                            type: 'error',
                            title: 'Tanggal Tidak Valid',
                            message: `Tanggal maksimum yang tersedia adalah ${new Date(latestDataDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}`
                          });
                          // Reset to previous value
                          if (startDateRef.current) {
                            startDateRef.current.value = formatDateForInput(startDate);
                          }
                          return;
                        }
                        
                        // Set to custom mode when user manually selects date
                        setDateRangeMode('custom');
                        setStartDate(selectedDate);
                        // Auto update end date if not set or if start > end
                        if (!endDate || new Date(selectedDate) > new Date(endDate)) {
                          setEndDate(selectedDate);
                        }
                      }}
                      max={latestDataDate ? formatDateForInput(latestDataDate) : (endDate ? formatDateForInput(endDate) : new Date().toISOString().split('T')[0] || '')}
                      min={MIN_DATE}
                      onKeyDown={(e) => e.preventDefault()}
                      onPaste={(e) => e.preventDefault()}
                      onInput={(e) => e.preventDefault()}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      style={{ caretColor: 'transparent' }}
                    />
                    <div className="flex items-center justify-between h-full px-3 py-2">
                      <span className="text-sm text-foreground">
                        {startDate ? new Date(startDate).toLocaleDateString('en-GB', { 
                          day: '2-digit', 
                          month: '2-digit', 
                          year: 'numeric' 
                        }) : 'Select start date'}
                      </span>
                      <Calendar className="w-4 h-4 text-foreground" />
                    </div>
                  </div>
                  <span className="text-sm text-muted-foreground">to</span>
                  <div 
                    className="relative h-9 flex-1 rounded-md border border-input bg-background cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => triggerDatePicker(endDateRef)}
                  >
                    <input
                      ref={endDateRef}
                      type="date"
                      value={formatDateForInput(endDate)}
                      onChange={(e) => {
                        const selectedDate = e.target.value;
                        
                        // Validate minimum date (19/09/2025)
                        if (selectedDate < MIN_DATE) {
                          showToast({
                            type: 'error',
                            title: 'Tanggal Tidak Valid',
                            message: `Tanggal minimum yang bisa dipilih adalah ${new Date(MIN_DATE).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}`
                          });
                          // Reset to previous value
                          if (endDateRef.current) {
                            endDateRef.current.value = formatDateForInput(endDate);
                          }
                          return;
                        }
                        
                        // Validate maximum date (latest data date)
                        if (latestDataDate && selectedDate > latestDataDate) {
                          showToast({
                            type: 'error',
                            title: 'Tanggal Tidak Valid',
                            message: `Tanggal maksimum yang tersedia adalah ${new Date(latestDataDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}`
                          });
                          // Reset to previous value
                          if (endDateRef.current) {
                            endDateRef.current.value = formatDateForInput(endDate);
                          }
                          return;
                        }
                        
                        // Set to custom mode when user manually selects date
                        setDateRangeMode('custom');
                        setEndDate(selectedDate);
                      }}
                      min={formatDateForInput(startDate || MIN_DATE)}
                      max={latestDataDate ? formatDateForInput(latestDataDate) : new Date().toISOString().split('T')[0]}
                      onKeyDown={(e) => e.preventDefault()}
                      onPaste={(e) => e.preventDefault()}
                      onInput={(e) => e.preventDefault()}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      style={{ caretColor: 'transparent' }}
                    />
                    <div className="flex items-center justify-between h-full px-3 py-2">
                      <span className="text-sm text-foreground">
                        {endDate ? new Date(endDate).toLocaleDateString('en-GB', { 
                          day: '2-digit', 
                          month: '2-digit', 
                          year: 'numeric' 
                        }) : 'Select end date'}
                      </span>
                      <Calendar className="w-4 h-4 text-foreground" />
                    </div>
                  </div>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Available data may vary by date
                    </p>
            </div>

            {/* Quick Select (from BrokerInventory.tsx) */}
            <div className="md:col-span-2 lg:col-span-1">
              <label className="block text-sm font-medium mb-2">Quick Select:</label>
              <div className="flex gap-2">
                <select 
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm"
                  value={dateRangeMode}
                  onChange={(e) => handleDateRangeModeChange(e.target.value as '1day' | '3days' | '1week' | 'custom')}
                >
                  <option value="1day">1 Day</option>
                  <option value="3days">3 Days</option>
                  <option value="1week">1 Week</option>
                  <option value="custom">Custom</option>
                </select>
                {dateRangeMode === 'custom' && (
                  <Button variant="outline" size="sm" onClick={() => { 
                    setStartDate(''); 
                    setEndDate('');
                    setSelectedDatesForDisplay([]);
                  }}>
                    <RotateCcw className="w-4 h-4 mr-1" />
                    Clear
                  </Button>
                )}
              </div>
            </div>
            
            {/* Sector Filter */}
            <div>
              <label className="block text-sm font-medium mb-2">Sector:</label>
              <select
                value={sectorFilter}
                onChange={(e) => setSectorFilter(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm"
              >
                {availableSectors.map(sector => (
                  <option key={sector} value={sector}>{sector}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Selected Dates Display (from BrokerInventory.tsx) */}
          {selectedDatesForDisplay.length > 0 && (
            <div className="mt-4">
              <label className="text-sm font-medium">Selected Dates:</label>
              <div className="flex flex-wrap gap-2 mt-2">
                {selectedDatesForDisplay.map((date) => (
                  <Badge key={date} variant="secondary" className="px-3 py-1">
                    {formatDisplayDate(date)}
                  </Badge>
                ))}
              </div>
            </div>
          )}

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
                {(isLoadingData || isLoadingInventoryData) && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-2">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                      <div className="text-xs text-muted-foreground">Loading broker inventory...</div>
                    </div>
                  </div>
                )}
                {!isLoadingData && !isLoadingInventoryData && inventoryData.length === 0 && selectedBrokers.length > 0 && (
                  <div className="flex items-center justify-center h-80 text-muted-foreground">
                    <div className="text-center">
                      <p>No inventory data available for selected brokers</p>
                      <p className="text-xs mt-2">Data may not be available for the selected date range</p>
                    </div>
                  </div>
                )}
                {!isLoadingData && !isLoadingInventoryData && inventoryData.length > 0 && selectedBrokers.length > 0 && (
                  <InventoryChart
                    inventoryData={inventoryData}
                    selectedBrokers={selectedBrokers}
                  />
                )}
                {selectedBrokers.length === 0 && (
                  <div className="flex items-center justify-center h-80 text-muted-foreground">
                    <div className="text-center">
                      <p>No brokers selected</p>
                      <p className="text-xs mt-2">Select brokers above to view cumulative net flow</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : splitVisualization ? (
            // Split View - Separate Charts
            <>
              {/* Price Chart */}
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex-1 min-w-[200px]">
                      <CardTitle>{selectedTicker} Price Action</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Candlestick chart showing price movements
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
                  <div>
                    <CardTitle>Broker Cumulative Net Flow</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Broker inventory accumulation starting from 0
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="relative">
                  {(isLoadingData || isLoadingInventoryData) && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                      <div className="flex flex-col items-center gap-2">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                        <div className="text-xs text-muted-foreground">Loading broker inventory...</div>
                      </div>
                    </div>
                  )}
                  {!isLoadingData && !isLoadingInventoryData && inventoryData.length === 0 && selectedBrokers.length > 0 && (
                    <div className="flex items-center justify-center h-80 text-muted-foreground">
                      <div className="text-center">
                        <p>No inventory data available for selected brokers</p>
                        <p className="text-xs mt-2">Data may not be available for the selected date range</p>
                      </div>
                    </div>
                  )}
                  {!isLoadingData && !isLoadingInventoryData && inventoryData.length > 0 && selectedBrokers.length > 0 && (
                    <InventoryChart
                      inventoryData={inventoryData}
                      selectedBrokers={selectedBrokers}
                    />
                  )}
                  {selectedBrokers.length === 0 && (
                    <div className="flex items-center justify-center h-80 text-muted-foreground">
                      <div className="text-center">
                        <p>No brokers selected</p>
                        <p className="text-xs mt-2">Select brokers above to view cumulative net flow</p>
                      </div>
                    </div>
                  )}
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
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex-1 min-w-[200px]">
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
                  {(isLoadingData || isLoadingInventoryData) && (
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
