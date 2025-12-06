import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { X, Calendar, Loader2, Search } from 'lucide-react';
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


const BrokerLegend = ({
  title,
  brokers,
  colorReferenceBrokers,
  brokerVisibility,
  onToggleVisibility,
  onRemoveBroker,
  onRemoveAll,
}: {
  title: string;
  brokers: string[];
  colorReferenceBrokers: string[];
  brokerVisibility: Record<string, boolean>;
  onToggleVisibility: (broker: string) => void;
  onRemoveBroker: (broker: string) => void;
  onRemoveAll?: () => void;
}) => {
  return (
    <div className="rounded-lg border border-[#3a4252] bg-background/70 px-3 py-2">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
        </div>
        {onRemoveAll && brokers.length > 0 && (
          <button
            type="button"
            onClick={onRemoveAll}
            className="text-muted-foreground hover:text-destructive transition-colors"
            aria-label={`Remove all ${title}`}
            title={`Remove all ${title}`}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
        {brokers.length === 0 ? (
          <p className="text-xs text-muted-foreground">No brokers in this group.</p>
        ) : (
          brokers.map((broker) => {
            const isVisible = brokerVisibility[broker] !== false;
            return (
              <div key={broker} className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-[#3a4252] bg-transparent text-primary focus:ring-primary"
                    checked={isVisible}
                    onChange={() => onToggleVisibility(broker)}
                  />
                  <span>{broker}</span>
                </label>
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full border border-border"
                    style={{ backgroundColor: generateBrokerColor(broker, colorReferenceBrokers) }}
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveBroker(broker)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    aria-label={`Remove ${broker}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};


// TradingView-style chart component with dual Y-axis
const TradingViewChart = ({
  candlestickData,
  inventoryData,
  selectedBrokers,
  displayBrokers,
  title: _title,
  volumeData
}: {
  candlestickData: any[],
  inventoryData: InventoryTimeSeries[],
  selectedBrokers: string[],
  displayBrokers?: string[],
  title: string,
  volumeData?: any[]
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
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

    // ALWAYS clear existing chart first - this ensures no stale series remain
    if (chartRef.current) {
      console.log(`🧹 TradingViewChart: Removing existing chart and all series before re-render`);
      try {
      chartRef.current.remove();
      } catch (e) {
        console.error('Error removing chart:', e);
      }
      chartRef.current = null;
    }

    // Only render chart if there are visible brokers OR if we need to show candlestick only
    const brokersToDisplay = Array.isArray(displayBrokers) && displayBrokers.length > 0 ? displayBrokers : [];
    
    // If no brokers to display and no selected brokers, don't render chart at all
    if (brokersToDisplay.length === 0 && selectedBrokers.length === 0) {
      console.log(`🚫 TradingViewChart: No brokers selected - NOT rendering chart`);
      return;
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
        horzLines: { visible: false },
        vertLines: { visible: false }
      },
      rightPriceScale: {
        visible: true,
        borderColor: colors.borderColor,
        scaleMargins: { top: 0.1, bottom: 0.1 }
      },
      leftPriceScale: {
        visible: true, // Show left price scale
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
      // brokersToDisplay already calculated in useEffect above
      // This is just for logging
      console.log(`📊 TradingViewChart: Rendering chart`, {
        displayBrokers,
        brokersToDisplay,
        brokersToDisplayLength: brokersToDisplay.length,
        selectedBrokersLength: selectedBrokers.length
      });

      // If no brokers to display, log it but continue to add candlestick and volume
      if (brokersToDisplay.length === 0 && selectedBrokers.length > 0) {
        console.log(`⚠️ TradingViewChart: No visible brokers to display (displayBrokers=${JSON.stringify(displayBrokers)}, brokersToDisplay.length=${brokersToDisplay.length}), skipping ALL broker series`);
      }

      // Add candlestick series (left Y-axis - Price) to Pane 0
      const candlestickSeries = chart.addSeries(CandlestickSeries, {
        upColor: userColors.bullish,
        downColor: userColors.bearish,
        borderVisible: false,
        wickUpColor: userColors.bullish,
        wickDownColor: userColors.bearish,
        priceScaleId: 'left', // Use left price scale (label harga di kiri)
      }, 0);

      candlestickSeries.setData(candlestickData.map(d => ({
        time: d.time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      })));

      // Add inventory lines for each visible broker to Pane 0
      // Use right price scale for broker series (label broker di kanan)
      
      // Only add broker series if there are visible brokers
      // IMPORTANT: Do NOT add any broker series if brokersToDisplay is empty
      if (brokersToDisplay.length === 0) {
        console.log(`🚫 TradingViewChart: brokersToDisplay is EMPTY - NOT adding any broker series`);
      } else {
        console.log(`✅ TradingViewChart: Adding broker series for ${brokersToDisplay.length} brokers:`, brokersToDisplay);
      let firstBrokerSeries: any = null;
      
      brokersToDisplay.forEach(broker => {
        const brokerColor = generateBrokerColor(broker, selectedBrokers);
        
        // Extract Net Volume data (BuyVol - SellVol) - one line per broker
        const brokerData = inventoryData.map(d => ({
          time: d.time,
          value: d[broker] as number, // Net Volume (BuyVol - SellVol)
        })).filter(d => d.value !== undefined && d.value !== null && !isNaN(d.value) && isFinite(d.value));
        
        console.log(`📊 TradingViewChart: Adding Net Volume series for broker ${broker}:`, {
          dataLength: brokerData.length,
          sampleData: brokerData.slice(0, 3)
        });
        
        // Add one series per broker (Net Volume)
        if (brokerData.length > 0) {
          const lineSeries = chart.addSeries(LineSeries, {
            color: brokerColor,
            lineWidth: 2,
            title: broker,
            priceScaleId: 'right', // Use right price scale (label broker di kanan)
            priceFormat: {
              type: 'custom',
              formatter: (price: number) => formatLotNumber(price),
            },
            lastValueVisible: true, // Show label on axis
            priceLineVisible: false, // Hide connecting line between plotline and label
          }, 0);

          lineSeries.setData(brokerData);
          
          // Store first broker series for zero line
          if (!firstBrokerSeries) {
            firstBrokerSeries = lineSeries;
          }
          
          console.log(`✅ TradingViewChart: Net Volume series added for broker ${broker} with ${brokerData.length} data points`);
        }
      });
      
      // Add zero line (0 lot) horizontal line on right price scale
      if (firstBrokerSeries) {
        firstBrokerSeries.createPriceLine({
          price: 0,
          color: '#6b7280', // Gray color
          lineWidth: 1,
          lineStyle: 0, // Solid line
          axisLabelVisible: false,
          title: '',
        });
        console.log('✅ TradingViewChart: Zero line added at 0 lot');
      }
      } // End of else (brokersToDisplay.length > 0)

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
      
      // Subscribe to crosshair move for hover annotation
      const unsubscribeCrosshair = chart.subscribeCrosshairMove((param) => {
        const tooltip = tooltipRef.current;
        if (!tooltip) return;
        
        if (param.point === undefined || !param.time || param.point.x < 0 || param.point.y < 0) {
          tooltip.style.display = 'none';
          return;
        }
        
        // Convert time to string format for matching
        let timeStr: string = '';
        if (typeof param.time === 'string') {
          timeStr = param.time;
        } else if (typeof param.time === 'number') {
          const date = new Date(param.time * 1000);
          const isoStr = date.toISOString().split('T')[0];
          timeStr = isoStr ? isoStr : '';
        }
        
        // Get candlestick data at hover time
        const candleData = candlestickData.find((d: any) => {
          const dTime = typeof d.time === 'string' ? d.time : new Date(d.time * 1000).toISOString().split('T')[0];
          return dTime === timeStr;
        });
        
        // Get broker data at hover time
        const brokerValues: Array<{ broker: string; value: number; color: string }> = [];
        if (inventoryData && displayBrokers && displayBrokers.length > 0 && timeStr) {
          const brokerDataPoint = inventoryData.find((d: any) => {
            const dTime = typeof d.time === 'string' ? d.time : new Date(d.time * 1000).toISOString().split('T')[0];
            return dTime === timeStr;
          });
          
          if (brokerDataPoint) {
            displayBrokers.forEach(broker => {
              if (brokerDataPoint[broker] !== undefined && brokerDataPoint[broker] !== null) {
                const brokerColor = generateBrokerColor(broker, selectedBrokers);
                brokerValues.push({
                  broker,
                  value: brokerDataPoint[broker] as number,
                  color: brokerColor
                });
              }
            });
          }
        }
        
        // Show tooltip
        tooltip.style.display = 'block';
        tooltip.style.left = `${param.point.x + 10}px`;
        tooltip.style.top = `${param.point.y - 10}px`;
        
        // Format date for display
        const formatDisplayDate = (dateStr: string): string => {
          if (!dateStr) return '';
          try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('id-ID', {
              day: '2-digit',
              month: 'short',
              year: 'numeric'
            });
          } catch {
            return dateStr;
          }
        };
        
        const displayDate = formatDisplayDate(timeStr);
        
        // Update tooltip content
        const priceInfo = candleData ? 
          `O: ${candleData.open?.toFixed(0) || '-'} H: ${candleData.high?.toFixed(0) || '-'} L: ${candleData.low?.toFixed(0) || '-'} C: ${candleData.close?.toFixed(0) || '-'}` : 
          'No price data';
        
        // Format broker info dengan indikator warna plotline (garis horizontal kecil)
        const brokerInfo = brokerValues.length > 0 ? 
          brokerValues.map(b => {
            // Tambahkan indikator warna plotline (garis horizontal kecil)
            return `
              <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
                <div style="width: 20px; height: 2px; background-color: ${b.color}; border-radius: 1px;"></div>
                <span style="color: ${b.color}; font-weight: 500;">${b.broker}</span>
                <span style="color: #9ca3af; margin-left: auto;">${formatLotNumber(b.value)}</span>
              </div>
            `;
          }).join('') : 
          '<div style="color: #9ca3af;">No broker data</div>';
        
        tooltip.innerHTML = `
          <div style="padding: 8px; background: rgba(26, 30, 45, 0.95); border: 1px solid #3a4252; border-radius: 4px; font-size: 12px; color: #d1d5db; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3); min-width: 200px;">
            <div style="margin-bottom: 6px; font-weight: 700; color: #f9fafb; font-size: 13px; border-bottom: 1px solid #3a4252; padding-bottom: 4px;">${displayDate}</div>
            <div style="margin-bottom: 4px; font-weight: 600; color: #f9fafb;">Price:</div>
            <div style="margin-bottom: 8px; color: #9ca3af;">${priceInfo}</div>
            <div style="margin-bottom: 4px; font-weight: 600; color: #f9fafb;">Brokers:</div>
            <div style="color: #9ca3af;">${brokerInfo}</div>
          </div>
        `;
      });
      
      // Store unsubscribe function for cleanup
      (chart as any)._crosshairUnsubscribe = unsubscribeCrosshair;
    } catch (e) {
      console.error('Chart render error:', e);
    }

    // Cleanup function - ensure chart is removed when component unmounts or dependencies change
    return () => {
      if (chartRef.current) {
        // Unsubscribe from crosshair
        if ((chartRef.current as any)._crosshairUnsubscribe) {
          (chartRef.current as any)._crosshairUnsubscribe();
        }
        
        console.log(`🧹 TradingViewChart: Cleanup - removing chart`);
        try {
          chartRef.current.remove();
        } catch (e) {
          console.error('Error removing chart in cleanup:', e);
        }
        chartRef.current = null;
      }
    };
  }, [candlestickData, inventoryData, selectedBrokers, displayBrokers, volumeData, userColors]);

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

      {/* Hover Tooltip */}
      <div
        ref={tooltipRef}
        style={{
          position: 'absolute',
          display: 'none',
          pointerEvents: 'none',
          zIndex: 1000,
        }}
      />

      {/* Axis Labels */}
      {/* Price label di kiri (untuk candlestick yang menggunakan left price scale) */}
      <div
        className="absolute top-1/2 -left-22 text-sm text-muted-foreground font-bold whitespace-nowrap"
        style={{
          transform: 'translateY(-50%) rotate(-90deg)',
          transformOrigin: 'center',
          zIndex: 10
        }}
      >
        Price
      </div>
      {/* Volume (lot) label di kanan (untuk broker series yang menggunakan right price scale) */}
      <div
        className="absolute top-1/2 -right-6 text-sm text-muted-foreground font-bold whitespace-nowrap"
        style={{
          transform: 'translateY(-50%) rotate(90deg)',
          transformOrigin: 'center',
          zIndex: 10
        }}
      >
        Volume (lot)
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
        horzLines: { visible: false },
        vertLines: { visible: false }
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
        horzLines: { visible: false },
        vertLines: { visible: false }
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

const InventoryChart = ({
  inventoryData,
  selectedBrokers,
  displayBrokers,
}: {
  inventoryData: InventoryTimeSeries[],
  selectedBrokers: string[],
  displayBrokers?: string[],
}) => {
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
        horzLines: { visible: false },
        vertLines: { visible: false }
      },
      leftPriceScale: {
        visible: true, // Show left price scale
        borderColor: colors.borderColor,
        scaleMargins: { top: 0.1, bottom: 0.1 }
      },
      rightPriceScale: {
        visible: true, // Show right price scale with labels
        borderColor: colors.borderColor,
        scaleMargins: { top: 0.1, bottom: 0.1 },
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
      // Only display brokers that are visible (from displayBrokers/visibleBrokers)
      // If displayBrokers is provided, use it; otherwise use empty array to show nothing
      const brokersToDisplay = displayBrokers && displayBrokers.length > 0 ? displayBrokers : [];

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

      if (brokersToDisplay.length === 0) {
        console.warn(`⚠️ InventoryChart: No selected brokers`);
        return;
      }

      // Use left price scale for broker series (axis kiri tetap ada)
      let firstBrokerSeries: any = null;

      brokersToDisplay.forEach(broker => {
        const brokerColor = generateBrokerColor(broker, selectedBrokers);
        
        // Extract Net Volume data (BuyVol - SellVol) - one line per broker
        const brokerData = inventoryData
          .map(d => {
            const netValue = d[broker]; // Net Volume (BuyVol - SellVol)
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
              value: typeof netValue === 'number' ? netValue : 0
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
        
        console.log(`📊 InventoryChart: Adding Net Volume series for broker ${broker}:`, {
          dataLength: brokerData.length,
          sampleData: brokerData.slice(0, 3)
        });
        
        // Add one series per broker (Net Volume)
        if (brokerData.length > 0) {
          const lineSeries = chart.addSeries(LineSeries, {
            color: brokerColor,
            lineWidth: 2,
            title: broker,
            priceScaleId: 'right', // Use right price scale (label broker di kanan)
            priceFormat: {
              type: 'custom',
              formatter: (price: number) => formatLotNumber(price),
            },
            lastValueVisible: true, // Show label on axis
            priceLineVisible: false, // Hide connecting line between plotline and label
          });

          lineSeries.setData(brokerData);
          
          // Store first broker series for zero line
          if (!firstBrokerSeries) {
            firstBrokerSeries = lineSeries;
          }
          
          console.log(`✅ InventoryChart: Net Volume series added for broker ${broker} with ${brokerData.length} data points`);
        }
      });

      // Add zero line (0 lot) horizontal line on right price scale
      if (firstBrokerSeries) {
        firstBrokerSeries.createPriceLine({
          price: 0,
          color: '#6b7280', // Gray color
          lineWidth: 1,
          lineStyle: 0, // Solid line
          axisLabelVisible: false,
          title: '',
        });
        console.log('✅ InventoryChart: Zero line added at 0 lot');
      }

      // Ensure both left and right price scales are visible
      chart.applyOptions({
        leftPriceScale: {
          visible: true, // Show left price scale
        },
        rightPriceScale: {
          visible: true, // Show right price scale with labels
        },
      });

      // Fit content after adding all series
      chart.timeScale().fitContent();
      console.log(`✅ InventoryChart: Chart rendered with ${brokersToDisplay.length} series, labels on right side`);
    } catch (e) {
      console.error('Inventory chart render error:', e);
    }
  }, [inventoryData, selectedBrokers, displayBrokers]);

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
  const [selectedTicker, setSelectedTicker] = useState<string>(propSelectedStock || 'BBCA');
  const [selectedBrokers, setSelectedBrokers] = useState<string[]>([]);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [isInitializing, setIsInitializing] = useState(true);
  const [brokerSearch, setBrokerSearch] = useState('');
  const [showBrokerSuggestions, setShowBrokerSuggestions] = useState(false);
  const [highlightedBrokerIndex, setHighlightedBrokerIndex] = useState(-1);
  const [brokerSelectionMode, setBrokerSelectionMode] = useState<{
    top5buy: boolean;
    top5sell: boolean;
    custom: boolean;
  }>({ top5buy: false, top5sell: false, custom: false });
  const [tickerInput, setTickerInput] = useState<string>('');
  const [showStockSuggestions, setShowStockSuggestions] = useState(false);
  const [splitVisualization, setSplitVisualization] = useState(defaultSplitView);
  const [highlightedStockIndex, setHighlightedStockIndex] = useState<number>(-1);
  const [availableStocks, setAvailableStocks] = useState<string[]>([]);
  const [sectorMapping, setSectorMapping] = useState<{ [sector: string]: string[] }>({});
  const [stockSearchTimeout, setStockSearchTimeout] = useState<NodeJS.Timeout | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isDataReady, setIsDataReady] = useState<boolean>(false); // Control when to show charts/tables
  const [shouldFetchData, setShouldFetchData] = useState<boolean>(false); // Control when to fetch data (only when Show button clicked)
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
  const [brokerVisibility, setBrokerVisibility] = useState<Record<string, boolean>>({});
  const [defaultBrokers, setDefaultBrokers] = useState<string[]>([]);
  const [hasUserSelectedBrokers, setHasUserSelectedBrokers] = useState(false);
  const controlMenuRef = useRef<HTMLDivElement>(null);
  const [controlSpacerHeight, setControlSpacerHeight] = useState<number>(72);
  
  // Minimum date allowed: 19/09/2025
  const MIN_DATE = '2025-09-19';

  // Helper function to get actual ticker from selectedTicker (handle sector selection)
  const getActualTicker = useMemo(() => {
    if (!selectedTicker) return '';
    // If it's a sector, get first stock from that sector
    if (selectedTicker.startsWith('[SECTOR] ')) {
      const sectorName = selectedTicker.replace('[SECTOR] ', '');
      const stocksInSector = sectorMapping[sectorName] || [];
      return stocksInSector[0] || '';
    }
    return selectedTicker;
  }, [selectedTicker, sectorMapping]);
  
  // Track previous selectedTicker to detect changes
  const prevSelectedTickerRef = useRef<string>('');
  
  // Reset broker data when active ticker changes (but don't reset on initial load)
  useEffect(() => {
    const currentTicker: string = selectedTicker || '';
    console.log(`[BrokerInventory] selectedTicker effect:`, { currentTicker, prev: prevSelectedTickerRef.current });
    
    // Only reset if ticker actually changed (not on initial mount)
    if (currentTicker && currentTicker !== prevSelectedTickerRef.current) {
      // On initial mount, prevSelectedTickerRef.current will be empty, so we just update the ref
      if (prevSelectedTickerRef.current !== '') {
        console.log(`📊 Active ticker changed from ${prevSelectedTickerRef.current} to ${currentTicker} - resetting data`);
        // Reset all related states when active ticker changes
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
        setHasUserSelectedBrokers(false);
        setDefaultBrokers([]);
      } else {
        console.log(`[BrokerInventory] Initial ticker set: ${currentTicker}`);
      }
    }
    // Always update the ref to track current ticker
    if (currentTicker) {
      prevSelectedTickerRef.current = currentTicker;
    }
  }, [selectedTicker]);

  const syncSelectedBrokersWithAvailable = useCallback((availableList: string[]) => {
    if (!availableList || availableList.length === 0) {
      setSelectedBrokers([]);
      return;
    }
    setSelectedBrokers(prev => {
      const filtered = prev.filter(broker => availableList.includes(broker));

      if (filtered.length > 0 || hasUserSelectedBrokers) {
        return filtered;
      }

      const defaultsInList = defaultBrokers.filter(broker => availableList.includes(broker));
      if (defaultsInList.length > 0) {
        return defaultsInList;
      }

      return availableList.slice(0, Math.min(5, availableList.length));
    });
  }, [defaultBrokers, hasUserSelectedBrokers]);

  useEffect(() => {
    setBrokerVisibility((prev) => {
      const updated = { ...prev };
      let changed = false;

      selectedBrokers.forEach((broker) => {
        if (updated[broker] === undefined) {
          updated[broker] = true;
          changed = true;
        }
      });

      Object.keys(updated).forEach((broker) => {
        if (!selectedBrokers.includes(broker)) {
          delete updated[broker];
          changed = true;
        }
      });

      return changed ? updated : prev;
    });
  }, [selectedBrokers]);

  useEffect(() => {
    if (hideControls) {
      return;
    }

    const updateSpacerHeight = () => {
      if (controlMenuRef.current) {
        const height = controlMenuRef.current.offsetHeight;
        setControlSpacerHeight(Math.max(height + 16, 48));
      }
    };

    updateSpacerHeight();
    window.addEventListener('resize', updateSpacerHeight);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && controlMenuRef.current) {
      resizeObserver = new ResizeObserver(() => updateSpacerHeight());
      resizeObserver.observe(controlMenuRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateSpacerHeight);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [hideControls, selectedTicker, selectedBrokers, startDate, endDate, topBrokersCount]);

const visibleBrokers = useMemo(
    () => {
      const visible = selectedBrokers.filter((broker) => brokerVisibility[broker] !== false);
      console.log(`👁️ visibleBrokers updated:`, {
        selectedBrokers,
        brokerVisibility,
        visible,
        visibleCount: visible.length
      });
      return visible;
    },
    [selectedBrokers, brokerVisibility]
  );

  const handleToggleBrokerVisibility = (broker: string) => {
    setBrokerVisibility((prev) => ({
      ...prev,
      [broker]: !(prev[broker] !== false),
    }));
  };

  // Update selectedTicker when propSelectedStock changes
  useEffect(() => {
    if (propSelectedStock && propSelectedStock !== selectedTicker) {
      console.log(`📊 Dashboard stock changed to ${propSelectedStock}`);
      setSelectedTicker(propSelectedStock);
      setTickerInput('');
      
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
      setHasUserSelectedBrokers(false);
      setDefaultBrokers([]);
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

  // Load initial data (stocks list and sector mapping) on component mount
  useEffect(() => {
    const loadInitialData = async () => {
      if (availableStocks.length > 0) return; // Already loaded
      
      try {
        // Load both stock list and sector mapping in parallel
        const [stockResult, sectorResult] = await Promise.all([
          api.getStockList(),
          api.getSectorMapping()
        ]);
        
        let stocks: string[] = [];
        let sectors: string[] = [];
        let mapping: { [sector: string]: string[] } = {};
        
        if (stockResult.success && stockResult.data?.stocks && Array.isArray(stockResult.data.stocks)) {
          stocks = stockResult.data.stocks;
        }
        
        if (sectorResult.success && sectorResult.data) {
          sectors = sectorResult.data.sectors || [];
          mapping = sectorResult.data.sectorMapping || {};
          setSectorMapping(mapping);
        }
        
        // Remove IDX from ticker list (IDX is now a sector, not a ticker)
        const stocksWithoutIdx = stocks.filter(stock => stock !== 'IDX');
        
        // Add sectors to the list (with prefix to distinguish from stocks)
        const sectorsWithPrefix = sectors.map(sector => `[SECTOR] ${sector}`);
        
        // Combine stocks and sectors, then sort alphabetically
        const allItems = [...stocksWithoutIdx, ...sectorsWithPrefix].sort((a: string, b: string) => a.localeCompare(b));
        
        setAvailableStocks(allItems);
        console.log(`📊 Loaded ${stocksWithoutIdx.length} stocks and ${sectors.length} sectors from API`);
      } catch (error) {
        console.error('Error loading initial data:', error);
        showToast({
          type: 'error',
          title: 'Error Memuat Data',
          message: 'Gagal memuat data awal.'
        });
        // Even if API fails, ensure IDX is available as sector
        setAvailableStocks(['[SECTOR] IDX']);
      }
    };
    
    loadInitialData();
  }, [showToast, availableStocks.length]);

  // Load latest date and set default date range when stock is selected
  useEffect(() => {
    const loadLatestDateForStock = async () => {
      const actualTicker = getActualTicker;
      if (!actualTicker) {
        console.log(`[BrokerInventory] No actual ticker, skipping loadLatestDateForStock`);
        setIsInitializing(false); // Make sure to set isInitializing to false if no ticker
        return;
      }
      
      console.log(`[BrokerInventory] Loading latest date for ticker: ${actualTicker}`);
      try {
        setIsInitializing(true);
        
        // Check if we have cached latest date for this stock
        const cachedDate = cache.latestDate.date;
        const cachedStock = (cache.latestDate as any).stockCode;
        
        let latestDate: string | null = null;
        
        if (cachedDate && cachedStock === actualTicker && Date.now() - cache.latestDate.timestamp < 5 * 60 * 1000) {
          latestDate = cachedDate;
          setLatestDataDate(latestDate);
          console.log(`📊 Using cached latest date for ${actualTicker}: ${latestDate}`);
        } else {
          // Fetch latest date for this specific stock
          console.log(`📊 Fetching latest date for stock: ${actualTicker}`);
          const latestResponse = await api.getLatestStockDate(actualTicker);
          
          if (latestResponse.success && latestResponse.data?.latestDate) {
            latestDate = latestResponse.data.latestDate;
            // Cache with stock code
            cache.latestDate = { 
              date: latestDate, 
              timestamp: Date.now(),
              stockCode: actualTicker 
            } as any;
            // Store latest date in state for validation and display
            setLatestDataDate(latestDate);
            console.log(`📊 Fetched latest date for ${actualTicker}: ${latestDate}`);
          } else {
            console.warn(`⚠️ Could not get latest date for ${actualTicker}`);
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
          
          console.log(`📊 Default date range set for ${actualTicker}: ${startDateStr} to ${latestDate}`);
        } else {
          // Fallback: use today if latest date not available
          const today = new Date();
          const oneMonthAgo = new Date(today);
          oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
          const todayStr = today.toISOString().split('T')[0];
          const oneMonthAgoStr = oneMonthAgo.toISOString().split('T')[0];
          if (todayStr) setEndDate(todayStr);
          if (oneMonthAgoStr) setStartDate(oneMonthAgoStr);
          console.log(`📊 Using fallback date range for ${actualTicker}`);
        }
        
      } catch (error) {
        console.error(`Error loading latest date for ${actualTicker}:`, error);
        // Fallback to current date
        const today = new Date();
        const oneMonthAgo = new Date(today);
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        const todayStr = today.toISOString().split('T')[0];
        const oneMonthAgoStr = oneMonthAgo.toISOString().split('T')[0];
        if (todayStr) setEndDate(todayStr);
        if (oneMonthAgoStr) setStartDate(oneMonthAgoStr);
      } finally {
        console.log(`[BrokerInventory] Setting isInitializing to false for ticker: ${actualTicker}`);
        setIsInitializing(false);
      }
    };
    
    loadLatestDateForStock();
  }, [getActualTicker]);

  // Sync endDate when startDate changes to ensure endDate >= startDate
  useEffect(() => {
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      console.log(`⚠️ Start date ${startDate} is after end date ${endDate}, updating end date to ${startDate}`);
      setEndDate(startDate);
    }
  }, [startDate, endDate]);

  // Load OHLC and volume data only when Show button is clicked
  useEffect(() => {
    if (!shouldFetchData) {
      return; // Don't load data until Show button is clicked
    }
    
    const loadStockData = async () => {
      const actualTicker = getActualTicker;
      if (!actualTicker || !startDate || !endDate || isInitializing) {
        console.log(`[BrokerInventory] Skipping loadStockData:`, { actualTicker, startDate, endDate, isInitializing });
        setShouldFetchData(false);
        setIsDataReady(false);
        return;
      }
      console.log(`[BrokerInventory] Loading stock data for:`, { actualTicker, startDate, endDate });
      
      setIsLoadingData(true);
      setDataError(null);
      
      try {
        // Check cache first (5 minutes TTL)
        const cacheKey = `${actualTicker}-${startDate}-${endDate}`;
        const cachedData = cache.get(cacheKey, cache.stockData, 5 * 60 * 1000);
        
        if (cachedData) {
          console.log(`📊 Using cached stock data for ${actualTicker}`);
          // Ensure cached data is sorted and deduplicated
          const sortedCandlestick = (cachedData.candlestick || [])
            .filter((item: any, index: number, arr: any[]) => {
              // Remove duplicates (keep first occurrence)
              return index === 0 || arr[index - 1].time !== item.time;
            })
            .sort((a: any, b: any) => {
              if (a.time < b.time) return -1;
              if (a.time > b.time) return 1;
              return 0;
            });
          
          const sortedVolume = (cachedData.volume || [])
            .filter((item: any, index: number, arr: any[]) => {
              // Remove duplicates (keep first occurrence)
              return index === 0 || arr[index - 1].time !== item.time;
            })
            .sort((a: any, b: any) => {
              if (a.time < b.time) return -1;
              if (a.time > b.time) return 1;
              return 0;
            });
          
          setOhlcData(sortedCandlestick);
          setVolumeData(sortedVolume);
          setIsLoadingData(false);
          return;
        }
        
        console.log(`📊 Loading stock data for ${actualTicker} from ${startDate} to ${endDate}`);
        
        // Call stock API to get OHLC data (backend already filters by date range)
        const response = await api.getStockData(actualTicker, startDate, endDate, 1000);
        
        if (response.success && response.data?.data) {
          const stockData = response.data.data;
          console.log(`📊 Received ${stockData.length} records for ${actualTicker}`);
          
          // Filter data by date range (additional client-side filter for safety)
          const filteredData = stockData.filter((row: any) => {
            const rowDate = row.Date;
            return rowDate >= startDate && rowDate <= endDate;
          });
          
          // Convert to candlestick format for charts
          // First, create a map to handle duplicates (keep last occurrence)
          const candlestickMap = new Map<string, any>();
          filteredData.forEach((row: any) => {
            const time = row.Date;
            candlestickMap.set(time, {
              time: time,
            open: row.Open || 0,
            high: row.High || 0,
            low: row.Low || 0,
            close: row.Close || 0,
            volume: row.Volume || 0
            });
          });
          
          // Convert map to array, sort by time, and remove duplicates
          const candlestickData = Array.from(candlestickMap.values())
            .sort((a, b) => {
              // Sort by time (ascending)
              if (a.time < b.time) return -1;
              if (a.time > b.time) return 1;
              return 0;
            });
          
          // Convert to volume format for charts (using same deduplication)
          const volumeMap = new Map<string, any>();
          filteredData.forEach((row: any) => {
            const time = row.Date;
            volumeMap.set(time, {
              time: time,
            value: row.Volume || 0,
            color: (row.Close || 0) >= (row.Open || 0) ? '#16a34a' : '#dc2626'
            });
          });
          
          const volumeChartData = Array.from(volumeMap.values())
            .sort((a, b) => {
              // Sort by time (ascending)
              if (a.time < b.time) return -1;
              if (a.time > b.time) return 1;
              return 0;
            });
          
          // Final validation: ensure no duplicates and proper sorting
          const finalCandlestick = candlestickData.filter((item: any, index: number, arr: any[]) => {
            if (index === 0) return true;
            const prevTime = arr[index - 1].time;
            if (prevTime === item.time) {
              console.warn(`⚠️ Duplicate time found in candlestick data: ${item.time} at index ${index}`);
              return false; // Remove duplicate
            }
            if (prevTime > item.time) {
              console.warn(`⚠️ Data not sorted: prev=${prevTime}, current=${item.time} at index ${index}`);
            }
            return true;
          });
          
          const finalVolume = volumeChartData.filter((item: any, index: number, arr: any[]) => {
            if (index === 0) return true;
            const prevTime = arr[index - 1].time;
            if (prevTime === item.time) {
              console.warn(`⚠️ Duplicate time found in volume data: ${item.time} at index ${index}`);
              return false; // Remove duplicate
            }
            return true;
          });
          
          console.log(`📊 Processed data: ${finalCandlestick.length} OHLC records (${candlestickData.length - finalCandlestick.length} duplicates removed), ${finalVolume.length} volume records (${volumeChartData.length - finalVolume.length} duplicates removed)`);
          
          // Cache the cleaned data
          cache.set(cacheKey, { candlestick: finalCandlestick, volume: finalVolume }, cache.stockData);
          
          setOhlcData(finalCandlestick);
          setVolumeData(finalVolume);
          
          // Don't reset shouldFetchData here - let loadBrokerInventory handle it
          
        } else {
          throw new Error(response.error || 'Failed to load stock data');
        }
        
      } catch (error) {
        console.error('Error loading stock data:', error);
        setDataError(error instanceof Error ? error.message : 'Failed to load stock data');
        setShouldFetchData(false);
        setIsDataReady(false);
        showToast({
          type: 'error',
          title: 'Error Memuat Data',
          message: 'Gagal memuat data OHLC dan volume.'
        });
      } finally {
        setIsLoadingData(false);
        setShouldFetchData(false);
      }
    };
    
    loadStockData();
  }, [shouldFetchData, getActualTicker, startDate, endDate, isInitializing, showToast]);
  
  // Reset data when ticker or date range changes (before Show button is clicked)
  // This ensures user doesn't see stale data when changing filters
  const prevTickerRef = useRef<string>('');
  const prevStartDateRef = useRef<string>('');
  const prevEndDateRef = useRef<string>('');
  
  useEffect(() => {
    // Only reset if shouldFetchData is false (user hasn't clicked Show yet)
    // If shouldFetchData is true, data is being loaded, so don't clear it
    if (!shouldFetchData) {
      const tickerChanged = prevTickerRef.current !== getActualTicker;
      const dateChanged = prevStartDateRef.current !== startDate || prevEndDateRef.current !== endDate;
      
      // Only clear data if ticker or date actually changed (not on initial mount)
      if ((tickerChanged || dateChanged) && (prevTickerRef.current !== '' || prevStartDateRef.current !== '')) {
        const hasData = ohlcData.length > 0 || brokerSummaryData.length > 0;
        if (hasData) {
          console.log(`[BrokerInventory] Clearing data because ${tickerChanged ? 'ticker' : 'date'} changed before Show button clicked`);
          setOhlcData([]);
          setVolumeData([]);
          setBrokerSummaryData([]);
          setIsDataReady(false);
          setDataError(null);
          setBrokerDataError(null);
        }
      }
      
      // Update refs
      prevTickerRef.current = getActualTicker || '';
      prevStartDateRef.current = startDate || '';
      prevEndDateRef.current = endDate || '';
    }
  }, [getActualTicker, startDate, endDate, shouldFetchData, ohlcData.length, brokerSummaryData.length]);

  // Load top brokers data for table only when Show button is clicked
  useEffect(() => {
    if (!shouldFetchData) {
      return; // Don't load data until Show button is clicked
    }
    
    const loadTopBrokersData = async () => {
      // Load top brokers data for table (not for chart)
      // Use startDate and endDate from input field (not dependent on ohlcData)
      const actualTicker = getActualTicker;
      if (!actualTicker || !startDate || !endDate || isInitializing) {
        setBrokerSummaryData([]);
        setShouldFetchData(false);
        setIsDataReady(false);
        return;
      }
      
      setIsLoadingBrokerData(true);
      setBrokerDataError(null);
      
      try {
        // Calculate trading days from startDate to endDate (same as BrokerSummaryPage)
        // This ensures date range matches the input field exactly
        const tradingDays: string[] = [];
        if (startDate && endDate) {
          const start = new Date(startDate);
          const end = new Date(endDate);
          const current = new Date(start);
          
          while (current <= end) {
            const dayOfWeek = current.getDay();
            // Only include trading days (Monday to Friday, excluding weekends)
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
              const dateString = current.toISOString().split('T')[0];
              if (dateString) {
                tradingDays.push(dateString);
              }
            }
            current.setDate(current.getDate() + 1);
          }
        }
        
        if (tradingDays.length === 0) {
          console.log('⚠️ No trading days in date range');
          setBrokerSummaryData([]);
          return;
        }
        
        // For sectors, use sector name directly (not first stock) - same as BrokerSummaryPage
        const tickerToFetch = selectedTicker.startsWith('[SECTOR] ') 
          ? selectedTicker.replace('[SECTOR] ', '') 
          : actualTicker;
        
        console.log(`🔄 Loading broker summary data for ${tickerToFetch} from ${startDate} to ${endDate}`);
        console.log(`📊 Using ${tradingDays.length} trading days from date range (calculated from input field)`);
        
        // Load broker summary data for each date using getBrokerSummaryData API (same as BrokerSummaryPage)
        // This provides NetBuyValue and NetSellValue needed for top buyer/seller calculation (NET table)
        const allBrokerData: any[] = [];
        let successfulDates = 0;
        
        // Check if this is a sector (same logic as BrokerSummaryPage)
        const isSector = selectedTicker.startsWith('[SECTOR] ');
        
        for (const dateStr of tradingDays) {
          
          try {
            // Check cache first (5 minutes TTL) - use tickerToFetch for cache key
            const cacheKey = `broker-summary-${tickerToFetch}-${dateStr}`;
            let brokerData: any[] | null = cache.get(cacheKey, cache.topBrokers, 5 * 60 * 1000);
            
            if (!brokerData) {
              // Use getBrokerSummaryData API (same as BrokerSummaryPage) to get buyerValue and sellerValue
              // For sectors, fetch sector data directly (not first stock)
              const response = await api.getBrokerSummaryData(tickerToFetch, dateStr, '');
              
              if (response.success && response.data?.brokerData) {
                const brokers = response.data.brokerData;
                
                // Map broker summary format to our format (same structure as BrokerSummaryPage)
                brokerData = brokers.map((broker: any) => {
                  // For sectors: swap NetBuy and NetSell (because CSV has swap) - same as BrokerSummaryPage
                  let netBuyVol = Number(broker.NetBuyVol ?? 0);
                  let netSellVol = Number(broker.NetSellVol ?? 0);
                  let netBuyValue = Number(broker.NetBuyValue ?? 0);
                  let netSellValue = Number(broker.NetSellValue ?? 0);
                  
                  if (isSector) {
                    // Swap NetBuy and NetSell for sectors (same as BrokerSummaryPage)
                    netBuyVol = Number(broker.NetSellVol ?? 0);
                    netBuyValue = Number(broker.NetSellValue ?? 0);
                    netSellVol = Number(broker.NetBuyVol ?? 0);
                    netSellValue = Number(broker.NetBuyValue ?? 0);
                  }
                  
                  return {
                    broker: broker.BrokerCode ?? broker.broker ?? broker.BROKER ?? broker.code ?? '',
                    BrokerCode: broker.BrokerCode ?? broker.broker ?? broker.BROKER ?? broker.code ?? '',
                    // Net fields (swapped for sectors, same as BrokerSummaryPage NET table)
                    NetBuyVol: netBuyVol,
                    NetSellVol: netSellVol,
                    NetBuyValue: netBuyValue,
                    NetSellValue: netSellValue,
                    // Volume fields (for backward compatibility)
                    TotalVol: Number(broker.BuyerVol ?? 0) + Number(broker.SellerVol ?? 0),
                    SellVol: Number(broker.SellerVol ?? 0),
                    BuyVol: Number(broker.BuyerVol ?? 0),
                    // Value fields (for top buyer/seller calculation - same as BrokerSummaryPage)
                    BuyerValue: Number(broker.BuyerValue ?? 0),
                    SellerValue: Number(broker.SellerValue ?? 0),
                    buyerValue: Number(broker.BuyerValue ?? 0),
                    sellerValue: Number(broker.SellerValue ?? 0),
                    date: dateStr,
                    time: dateStr
                  };
                });
                
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
            console.warn(`⚠️ Error loading broker summary for ${dateStr}:`, error);
          }
        }
        
        // Filter final data by date range (additional safety check)
        const filteredBrokerData = allBrokerData.filter((record: any) => {
          const recordDate = record.date || record.time;
          return recordDate >= startDate && recordDate <= endDate;
        });
        
        console.log(`📊 ===== BROKER SUMMARY DATA LOADING COMPLETE =====`);
        console.log(`📊 Total dates processed: ${tradingDays.length}`);
        console.log(`📊 Successful dates: ${successfulDates}`);
        console.log(`📊 Total broker records (after filtering): ${filteredBrokerData.length}`);
        
        if (filteredBrokerData.length === 0) {
          setBrokerDataError(`No broker summary data found for ${actualTicker} in date range ${startDate} to ${endDate}.`);
        } else {
          setBrokerDataError(null);
        }
        
        setBrokerSummaryData(filteredBrokerData);
        
        // Extract unique brokers from brokerSummaryData and use as fallback/merge for availableBrokersForStock
        // This ensures dropdown shows brokers even if getBrokerInventoryBrokers doesn't return data
        if (filteredBrokerData.length > 0) {
          const uniqueBrokersFromSummary = [...new Set(filteredBrokerData.map((r: any) => r.broker || r.BrokerCode).filter(Boolean))].sort() as string[];
          
          // Always merge brokers from brokerSummaryData with existing availableBrokersForStock
          // This ensures all brokers are available in dropdown
          setAvailableBrokersForStock(prev => {
            if (uniqueBrokersFromSummary.length > 0) {
              const merged = [...new Set([...prev, ...uniqueBrokersFromSummary])].sort();
              if (merged.length > prev.length) {
                console.log(`📊 Merged brokers from brokerSummaryData: ${prev.length} -> ${merged.length} brokers`, {
                  prev: prev.length,
                  fromSummary: uniqueBrokersFromSummary.length,
                  merged: merged.length,
                  newBrokers: uniqueBrokersFromSummary.filter(b => !prev.includes(b))
                });
              }
              return merged;
            }
            return prev;
          });
        }
        
        // Reset shouldFetchData after successful load (will be reset again in loadBrokerInventory)
        
      } catch (error) {
        console.error('Error loading broker summary data:', error);
        setBrokerDataError(error instanceof Error ? error.message : 'Failed to load broker summary data');
        setShouldFetchData(false);
        setIsDataReady(false);
        showToast({
          type: 'error',
          title: 'Error Memuat Data Broker Summary',
          message: 'Gagal memuat data broker summary.'
        });
      } finally {
        setIsLoadingBrokerData(false);
        setShouldFetchData(false);
      }
    };
    
    loadTopBrokersData();
    // Depend on shouldFetchData - only load when Show button is clicked
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldFetchData, getActualTicker, startDate, endDate, isInitializing, showToast]);

  // Load available brokers for selected stock code from broker_inventory folder
  useEffect(() => {
    const loadBrokersForStock = async () => {
      const actualTicker = getActualTicker;
      if (!actualTicker) {
        setAvailableBrokersForStock([]);
        return;
      }
      
      try {
        // Check cache first (10 minutes TTL)
        const cacheKey = `brokers-${actualTicker}`;
        const cachedBrokers = cache.get(cacheKey, cache.brokers, 10 * 60 * 1000);
        
        if (cachedBrokers) {
          console.log(`📊 Using cached brokers for ${actualTicker}:`, cachedBrokers.length);
          setAvailableBrokersForStock(cachedBrokers);
          syncSelectedBrokersWithAvailable(cachedBrokers);
          return;
        }
        
        console.log(`📊 Loading available brokers for stock: ${actualTicker} from broker_inventory`);
        setIsLoadingBrokersForStock(true);
        
        // Get brokers from broker_inventory folder
        const response = await api.getBrokerInventoryBrokers(actualTicker);
        
        if (response.success && response.data?.brokers) {
          const uniqueBrokers = response.data.brokers.sort() as string[];
          
          // Cache the brokers
          cache.set(cacheKey, uniqueBrokers, cache.brokers);
          
          if (uniqueBrokers.length > 0) {
            console.log(`✅ Found ${uniqueBrokers.length} brokers for ${actualTicker} from broker_inventory:`, uniqueBrokers);
            setAvailableBrokersForStock(uniqueBrokers);
            syncSelectedBrokersWithAvailable(uniqueBrokers);
          } else {
            console.log(`⚠️ No brokers found for ${actualTicker} in broker_inventory - will use fallback from brokerSummaryData`);
            // Don't clear availableBrokersForStock here - let brokerSummaryData populate it as fallback
          }
        } else {
          console.log(`⚠️ Failed to load brokers for ${actualTicker} from broker_inventory - will use fallback from brokerSummaryData`);
          // Don't clear availableBrokersForStock here - let brokerSummaryData populate it as fallback
        }
      } catch (error) {
        console.error('Error loading brokers for stock:', error);
        // Don't clear availableBrokersForStock here - let brokerSummaryData populate it as fallback
        // setAvailableBrokersForStock([]);
        // setSelectedBrokers([]);
      } finally {
        setIsLoadingBrokersForStock(false);
      }
    };
    
    loadBrokersForStock();
    // Remove selectedBrokers from dependencies to prevent infinite loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getActualTicker]);

  // Broker search handlers
  const handleBrokerSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const actualTicker = getActualTicker;
    if (!actualTicker || isLoadingBrokersForStock) return; // Don't allow search if no stock selected or loading
    
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
      const newSelectedBrokers = [...selectedBrokers, broker];
      setSelectedBrokers(newSelectedBrokers);
      setHasUserSelectedBrokers(true);
      // Enable custom mode when user manually selects a broker
      setBrokerSelectionMode(prev => ({ ...prev, custom: true }));
      console.log(`📊 Added broker ${broker} to selection. Total selected: ${newSelectedBrokers.length}`, {
        selectedBrokers: newSelectedBrokers,
        willAppearInLegend: true
      });
    }
    // Don't clear search or close suggestions to allow multiple selections
    // setBrokerSearch('');
    // setShowBrokerSuggestions(false);
    setHighlightedBrokerIndex(-1);
  };

  const removeBroker = (broker: string) => {
    // Only remove brokers that are currently selected
    if (selectedBrokers.includes(broker)) {
      console.log(`🗑️ Removing broker: ${broker} from selectedBrokers`);
      const newSelectedBrokers = selectedBrokers.filter(b => b !== broker);
      setSelectedBrokers(newSelectedBrokers);
      setHasUserSelectedBrokers(true);
      console.log(`✅ Broker removed. New selectedBrokers:`, newSelectedBrokers);
      
      // Check if we need to disable modes
      const top5BuySet = new Set(brokerNetStats.topBuyers.slice(0, 5).map(item => item.broker));
      const top5SellSet = new Set(brokerNetStats.topSellers.slice(0, 5).map(item => item.broker));
      
      // If removed broker was from top 5 buy, check if all top 5 buy brokers are gone
      if (top5BuySet.has(broker)) {
        const remainingTop5Buy = newSelectedBrokers.filter(b => top5BuySet.has(b));
        if (remainingTop5Buy.length === 0) {
          setBrokerSelectionMode(prev => ({ ...prev, top5buy: false }));
        }
      }
      
      // If removed broker was from top 5 sell, check if all top 5 sell brokers are gone
      if (top5SellSet.has(broker)) {
        const remainingTop5Sell = newSelectedBrokers.filter(b => top5SellSet.has(b));
        if (remainingTop5Sell.length === 0) {
          setBrokerSelectionMode(prev => ({ ...prev, top5sell: false }));
        }
      }
      
      // If removed broker was custom, check if all custom brokers are gone
      if (!top5BuySet.has(broker) && !top5SellSet.has(broker)) {
        const remainingCustom = newSelectedBrokers.filter(b => !top5BuySet.has(b) && !top5SellSet.has(b));
        if (remainingCustom.length === 0) {
          setBrokerSelectionMode(prev => ({ ...prev, custom: false }));
        }
      }
      
      setBrokerVisibility((prev) => {
        const updated = { ...prev };
        delete updated[broker];
        return updated;
      });
      console.log(`📊 Removed broker ${broker} from selection - series will be updated automatically`);
    }
  };

  const removeAllTop5Buy = () => {
    const top5BuySet = new Set(brokerNetStats.topBuyers.slice(0, 5).map(item => item.broker));
    const brokersToRemove = selectedBrokers.filter(b => top5BuySet.has(b));
    
    if (brokersToRemove.length > 0) {
      const newSelectedBrokers = selectedBrokers.filter(b => !top5BuySet.has(b));
      setSelectedBrokers(newSelectedBrokers);
      setHasUserSelectedBrokers(true);
      setBrokerSelectionMode(prev => ({ ...prev, top5buy: false }));
      
      setBrokerVisibility((prev) => {
        const updated = { ...prev };
        brokersToRemove.forEach(broker => delete updated[broker]);
        return updated;
      });
      console.log(`📊 Removed all Top 5 Buy brokers - series will be updated automatically`);
    }
  };

  const removeAllTop5Sell = () => {
    const top5SellSet = new Set(brokerNetStats.topSellers.slice(0, 5).map(item => item.broker));
    const brokersToRemove = selectedBrokers.filter(b => top5SellSet.has(b));
    
    if (brokersToRemove.length > 0) {
      const newSelectedBrokers = selectedBrokers.filter(b => !top5SellSet.has(b));
      setSelectedBrokers(newSelectedBrokers);
      setHasUserSelectedBrokers(true);
      setBrokerSelectionMode(prev => ({ ...prev, top5sell: false }));
      
      setBrokerVisibility((prev) => {
        const updated = { ...prev };
        brokersToRemove.forEach(broker => delete updated[broker]);
        return updated;
      });
      console.log(`📊 Removed all Top 5 Sell brokers - series will be updated automatically`);
    }
  };

  const removeAllCustom = () => {
    const top5BuySet = new Set(brokerNetStats.topBuyers.slice(0, 5).map(item => item.broker));
    const top5SellSet = new Set(brokerNetStats.topSellers.slice(0, 5).map(item => item.broker));
    const brokersToRemove = selectedBrokers.filter(b => !top5BuySet.has(b) && !top5SellSet.has(b));
    
    if (brokersToRemove.length > 0) {
      const newSelectedBrokers = selectedBrokers.filter(b => top5BuySet.has(b) || top5SellSet.has(b));
      setSelectedBrokers(newSelectedBrokers);
      setHasUserSelectedBrokers(true);
      setBrokerSelectionMode(prev => ({ ...prev, custom: false }));
      
      setBrokerVisibility((prev) => {
        const updated = { ...prev };
        brokersToRemove.forEach(broker => delete updated[broker]);
        return updated;
      });
      console.log(`📊 Removed all Selected Brokers - series will be updated automatically`);
    }
  };

  const handleBrokerKeyDown = (e: React.KeyboardEvent) => {
    if (!showBrokerSuggestions) return;

    // Calculate total items including "Top 5 Buy" and "Top 5 Sell" if they are visible
    const hasQuickSelect = brokerNetStats.topBuyers.length > 0 && brokerSearch === '';
    const quickSelectCount = hasQuickSelect ? 2 : 0; // "Top 5 Buy" and "Top 5 Sell"
    const totalItems = quickSelectCount + filteredBrokers.length;

    if (totalItems === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedBrokerIndex(prev => 
          prev < totalItems - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedBrokerIndex(prev => 
          prev > 0 ? prev - 1 : totalItems - 1
        );
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (highlightedBrokerIndex >= 0) {
          // Handle "Top 5 Buy" (index 0) and "Top 5 Sell" (index 1)
          if (hasQuickSelect) {
            if (highlightedBrokerIndex === 0) {
              // Top 5 Buy
              const top5Buy = brokerNetStats.topBuyers.slice(0, 5).map(item => item.broker);
              const isCurrentlyActive = brokerSelectionMode.top5buy;
              if (isCurrentlyActive) {
                setSelectedBrokers(prev => prev.filter(b => !top5Buy.includes(b)));
                setBrokerSelectionMode(prev => ({ ...prev, top5buy: false }));
              } else {
                setSelectedBrokers(prev => {
                  const newSet = new Set([...prev, ...top5Buy]);
                  return Array.from(newSet);
                });
                setBrokerSelectionMode(prev => ({ ...prev, top5buy: true }));
              }
              setHasUserSelectedBrokers(false);
              setBrokerSearch('');
              return;
            } else if (highlightedBrokerIndex === 1) {
              // Top 5 Sell
              const top5Sell = brokerNetStats.topSellers.slice(0, 5).map(item => item.broker);
              const isCurrentlyActive = brokerSelectionMode.top5sell;
              if (isCurrentlyActive) {
                setSelectedBrokers(prev => prev.filter(b => !top5Sell.includes(b)));
                setBrokerSelectionMode(prev => ({ ...prev, top5sell: false }));
              } else {
                setSelectedBrokers(prev => {
                  const newSet = new Set([...prev, ...top5Sell]);
                  return Array.from(newSet);
                });
                setBrokerSelectionMode(prev => ({ ...prev, top5sell: true }));
              }
              setHasUserSelectedBrokers(false);
              setBrokerSearch('');
              console.log(`✅ Top 5 Sell selected via keyboard:`, {
                top5Sell,
                count: top5Sell.length,
                willAppearInLegend: true,
                mode: 'top5sell'
              });
              return;
            }
          }
          
          // Handle regular brokers (adjust index if quick select is present)
          const brokerIndex = highlightedBrokerIndex - quickSelectCount;
          if (brokerIndex >= 0 && brokerIndex < filteredBrokers.length) {
            const selectedBroker = filteredBrokers[brokerIndex];
          if (selectedBroker && selectedBrokers.includes(selectedBroker)) {
            removeBroker(selectedBroker);
          } else if (selectedBroker) {
            handleBrokerSelect(selectedBroker);
            }
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
        setHighlightedBrokerIndex(totalItems - 1);
        break;
      case 'PageUp':
        e.preventDefault();
        setHighlightedBrokerIndex(prev => Math.max(0, prev - 5));
        break;
      case 'PageDown':
        e.preventDefault();
        setHighlightedBrokerIndex(prev => Math.min(totalItems - 1, prev + 5));
        break;
      case 'Delete':
        e.preventDefault();
        if (highlightedBrokerIndex >= 0) {
          const brokerIndex = highlightedBrokerIndex - quickSelectCount;
          if (brokerIndex >= 0 && brokerIndex < filteredBrokers.length) {
            const selectedBroker = filteredBrokers[brokerIndex];
          if (selectedBroker && selectedBrokers.includes(selectedBroker)) {
            removeBroker(selectedBroker);
            }
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

  const handleBrokerFocus = () => {
    const actualTicker = getActualTicker;
    if (actualTicker && !isLoadingBrokersForStock) {
      setShowBrokerSuggestions(true);
      setHighlightedBrokerIndex(-1);
    }
  };

  const handleBrokerDropdownClose = () => {
    setShowBrokerSuggestions(false);
    setHighlightedBrokerIndex(-1);
  };

  // Handle click outside to close broker dropdown
  useEffect(() => {
    if (!showBrokerSuggestions) {
      return undefined;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // Check both class names to ensure dropdown closes properly
      if (!target.closest('.broker-dropdown-container') && !target.closest('input[role="combobox"]')) {
        handleBrokerDropdownClose();
      }
    };

    // Use a small delay to prevent immediate closing when opening
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showBrokerSuggestions]);

  // Handle click outside to close ticker dropdown
  useEffect(() => {
    if (!showStockSuggestions) {
      return undefined;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowStockSuggestions(false);
        setHighlightedStockIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showStockSuggestions]);


  // Ticker selection handler (single-select)
  const handleStockSelect = (stock: string) => {
    // Single select: just set the selected ticker
    setSelectedTicker(stock);
    setTickerInput('');
    setShowStockSuggestions(false);
    
    // Reset broker data when ticker changes
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
    setHasUserSelectedBrokers(false);
    setDefaultBrokers([]);
  };

  const handleStockInputChange = (value: string) => {
    setTickerInput(value);
    setShowStockSuggestions(true);

    // Clear previous timeout
    if (stockSearchTimeout) {
      clearTimeout(stockSearchTimeout);
      setStockSearchTimeout(null);
    }

    // If stocks not loaded yet, load them (no debounce needed - stocks already loaded on mount)
    // But if for some reason stocks are not loaded, try to load them
    if (availableStocks.length === 0) {
      const timeout = setTimeout(async () => {
        try {
          console.log('[BrokerInventory] Loading stock list on demand...');
          const [stockResult, sectorResult] = await Promise.all([
            api.getStockList(),
            api.getSectorMapping()
          ]);
          
          let stocks: string[] = [];
          let sectors: string[] = [];
          let mapping: { [sector: string]: string[] } = {};
          
          if (stockResult.success && stockResult.data?.stocks && Array.isArray(stockResult.data.stocks)) {
            stocks = stockResult.data.stocks;
          }
          
          if (sectorResult.success && sectorResult.data) {
            sectors = sectorResult.data.sectors || [];
            mapping = sectorResult.data.sectorMapping || {};
            setSectorMapping(mapping);
          }
          
          // Remove IDX from ticker list (IDX is now a sector, not a ticker)
          const stocksWithoutIdx = stocks.filter(stock => stock !== 'IDX');
          
          // Add sectors to the list (with prefix to distinguish from stocks)
          const sectorsWithPrefix = sectors.map(sector => `[SECTOR] ${sector}`);
          
          // Combine stocks and sectors, then sort alphabetically
          const allItems = [...stocksWithoutIdx, ...sectorsWithPrefix].sort((a: string, b: string) => a.localeCompare(b));
          
          setAvailableStocks(allItems);
        } catch (err) {
          console.error('Error loading stocks:', err);
          // Even if API fails, ensure IDX is available as sector
          setAvailableStocks(['[SECTOR] IDX']);
        }
      }, 100); // Short delay only if needed
      setStockSearchTimeout(timeout);
    }

    // If exact match, select it immediately
    const upperValue = value.toUpperCase();
    // Check for exact stock match
    if ((availableStocks || []).includes(upperValue) && selectedTicker !== upperValue) {
      handleStockSelect(upperValue);
      return;
    }
    // Check for exact sector match (case-insensitive)
    const sectorMatch = availableStocks.find(stock => 
      stock.startsWith('[SECTOR] ') && 
      stock.replace('[SECTOR] ', '').toUpperCase() === upperValue &&
      selectedTicker !== stock
    );
    if (sectorMatch) {
      handleStockSelect(sectorMatch);
      return;
    }
  };

  // Separate stocks and sectors for display
  const filteredStocksList = (availableStocks || []).filter(stock => {
    const searchTerm = tickerInput.toLowerCase();
    // Only include stocks (not sectors)
    if (stock.startsWith('[SECTOR] ')) {
      return false;
    }
    // For regular stocks, search normally and exclude if already selected
    return stock.toLowerCase().includes(searchTerm) && selectedTicker !== stock;
  });

  const filteredSectorsList = (availableStocks || []).filter(stock => {
    const searchTerm = tickerInput.toLowerCase();
    // Only include sectors
    if (stock.startsWith('[SECTOR] ')) {
      const sectorName = stock.replace('[SECTOR] ', '').toLowerCase();
      return sectorName.includes(searchTerm) && selectedTicker !== stock;
    }
    return false;
  });
  
  // For backward compatibility (used in exact match check)
  const filteredStocks = [...filteredStocksList, ...filteredSectorsList];

  // Helper function to format display name (remove [SECTOR] prefix for display)
  const formatStockDisplayName = (stock: string): string => {
    if (stock.startsWith('[SECTOR] ')) {
      return stock.replace('[SECTOR] ', '');
    }
    return stock;
  };

  // Close dropdown when clicking outside (removed duplicate - already handled in separate useEffect above)

  // Use real data from API instead of mock data
  // Ensure data is sorted and deduplicated before passing to chart
  const candlestickData = useMemo(() => {
    if (!ohlcData || ohlcData.length === 0) return [];
    
    // Remove duplicates and sort by time
    const seen = new Set<string>();
    const uniqueData = ohlcData.filter((item: any) => {
      const timeKey = String(item.time);
      if (seen.has(timeKey)) {
        console.warn(`⚠️ Removing duplicate time in candlestickData: ${timeKey}`);
        return false;
      }
      seen.add(timeKey);
      return true;
    });
    
    // Sort by time (ascending)
    const sorted = uniqueData.sort((a: any, b: any) => {
      if (a.time < b.time) return -1;
      if (a.time > b.time) return 1;
      return 0;
    });
    
    return sorted;
  }, [ohlcData]);

  // Load broker inventory data (cumulative net flow) for selected brokers
  // Note: brokerInventoryData is set but not currently used - kept for potential future use
  const [_brokerInventoryData, setBrokerInventoryData] = useState<{ [broker: string]: any[] }>({});
  const [isLoadingInventoryData, setIsLoadingInventoryData] = useState(false);

  // Load broker inventory data when Show button is clicked
  useEffect(() => {
    if (!shouldFetchData) {
      return;
    }

    const actualTicker = getActualTicker;
    if (!actualTicker || selectedBrokers.length === 0 || !startDate || !endDate || isInitializing) {
      setShouldFetchData(false);
      setIsDataReady(false);
      return;
    }

    const loadBrokerInventory = async () => {
      setIsLoadingInventoryData(true);
      setIsDataReady(false);
      const inventoryDataMap: { [broker: string]: any[] } = {};

      try {
        console.log(`📊 Loading broker inventory data for ${selectedBrokers.length} brokers from ${startDate} to ${endDate}`);
        
        // Load inventory data for each selected broker
        for (const broker of selectedBrokers) {
          try {
            // Check cache first (5 minutes TTL)
            const cacheKey = `inventory-${actualTicker}-${broker}`;
            let cachedData = cache.get(cacheKey, cache.inventory, 5 * 60 * 1000);
            
            let formattedData: any[] = [];
            
            if (cachedData) {
              console.log(`📊 Using cached inventory data for ${actualTicker}/${broker}`);
              formattedData = cachedData;
            } else {
              const response = await api.getBrokerInventoryData(actualTicker, broker);
              
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
                  
                  const buyVolRaw = row.BuyVol ?? row.buyvol;
                  const sellVolRaw = row.SellVol ?? row.sellvol;
                  const cumulativeBuyRaw = row.CumulativeBuyVol ?? row.cumulativeBuyVol;
                  const cumulativeSellRaw = row.CumulativeSellVol ?? row.cumulativeSellVol;
                  const cumulativeNetBuyRaw = row.CumulativeNetBuyVol ?? row.cumulativeNetBuyVol ?? row.CumulativeNetBuy ?? row.cumulativeNetBuy;
                  
                  const buyVol = typeof buyVolRaw === 'number' ? buyVolRaw : parseFloat(String(buyVolRaw || 0)) || 0;
                  const sellVol = typeof sellVolRaw === 'number' ? sellVolRaw : parseFloat(String(sellVolRaw || 0)) || 0;
                  const netBuyVol = typeof row.NetBuyVol === 'number' ? row.NetBuyVol : parseFloat(String(row.NetBuyVol || 0)) || (buyVol - sellVol);
                  const cumBuyVol = typeof cumulativeBuyRaw === 'number'
                    ? cumulativeBuyRaw
                    : parseFloat(String(cumulativeBuyRaw || 0)) || undefined;
                  const cumSellVol = typeof cumulativeSellRaw === 'number'
                    ? cumulativeSellRaw
                    : parseFloat(String(cumulativeSellRaw || 0)) || undefined;
                  const cumNetBuyVol = typeof cumulativeNetBuyRaw === 'number'
                    ? cumulativeNetBuyRaw
                    : parseFloat(String(cumulativeNetBuyRaw || 0)) || 0;
                  
                  const formattedRow = {
                    ...row,
                    Date: dateStr,
                    time: dateStr, // For chart compatibility
                    NetBuyVol: netBuyVol,
                    BuyVol: buyVol,
                    SellVol: sellVol,
                    CumulativeBuyVol: cumBuyVol !== undefined ? cumBuyVol : cumNetBuyVol,
                    CumulativeSellVol: cumSellVol ?? 0,
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
        setIsDataReady(true);
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
        setIsDataReady(false);
      } finally {
        setIsLoadingInventoryData(false);
        setShouldFetchData(false);
      }
    };

    loadBrokerInventory();
  }, [shouldFetchData, getActualTicker, selectedBrokers, startDate, endDate, isInitializing]);

  // Convert broker summary data to time series format for chart (same as BrokerSummaryPage NET table)
  // Uses NetBuyVol and NetSellVol from brokerSummaryData (same data source as NET table)
  const inventoryData = useMemo(() => {
    if (selectedBrokers.length === 0 || !brokerSummaryData || brokerSummaryData.length === 0) {
      console.log(`📊 Inventory data empty: selectedBrokers=${selectedBrokers.length}, brokerSummaryData length=${brokerSummaryData?.length || 0}`);
      return [];
    }

    console.log(`📊 Converting broker summary data to time series format (NetBuyVol/NetSellVol - same as NET table)`, {
      selectedBrokers,
      brokerSummaryDataLength: brokerSummaryData.length,
      sampleData: brokerSummaryData.slice(0, 3)
    });
    
    // Collect all unique dates from brokerSummaryData
    const allDates = new Set<string>();
    brokerSummaryData.forEach((row: any) => {
      const date = row.date || row.time || row.Date;
        if (date) allDates.add(date);
    });

    const sortedDates = Array.from(allDates).sort();
    const inventorySeries: InventoryTimeSeries[] = [];

    sortedDates.forEach(date => {
      const dayData: InventoryTimeSeries = { time: date };
      
      // For each selected broker, get NetBuyVol and NetSellVol for this date (same as NET table logic)
      selectedBrokers.forEach(broker => {
        // Find broker data for this date
        const brokerDataForDate = brokerSummaryData.filter((row: any) => {
          const rowDate = row.date || row.time || row.Date;
          const rowBroker = row.broker || row.BrokerCode;
          return rowDate === date && rowBroker === broker;
        });
        
        if (brokerDataForDate.length > 0) {
          // Use the first match (should be only one per broker per date)
          const row = brokerDataForDate[0];
          
          // Get NetBuyVol and NetSellVol (same as NET table)
          const netBuyVol = typeof row.NetBuyVol === 'number' ? row.NetBuyVol : parseFloat(String(row.NetBuyVol || 0)) || 0;
          const netSellVol = typeof row.NetSellVol === 'number' ? row.NetSellVol : parseFloat(String(row.NetSellVol || 0)) || 0;
          const netBuyValue = typeof row.NetBuyValue === 'number' ? row.NetBuyValue : parseFloat(String(row.NetBuyValue || 0)) || 0;
          const netSellValue = typeof row.NetSellValue === 'number' ? row.NetSellValue : parseFloat(String(row.NetSellValue || 0)) || 0;
          
          // Determine if broker is NetBuy or NetSell (same logic as NET table per-date)
          // NetBuy: netBuyValue >= netSellValue (prioritize NetBuy if both > 0)
          // NetSell: netSellValue > netBuyValue (prioritize NetSell if both > 0)
          let netVolume = 0;
          if (netBuyValue >= netSellValue && (netBuyVol > 0 || netBuyValue > 0)) {
            // NetBuy: use NetBuyVol (positive value)
            netVolume = netBuyVol;
          } else if (netSellValue > netBuyValue && (netSellVol > 0 || netSellValue > 0)) {
            // NetSell: use -NetSellVol (negative value to show it's NetSell)
            netVolume = -netSellVol;
          } else {
            // Both zero or equal: default to 0
            netVolume = 0;
          }
          
          dayData[broker] = netVolume;
        } else {
          // No data for this broker on this date
          dayData[broker] = 0;
        }
      });
      
      inventorySeries.push(dayData);
    });

    console.log(`📊 Generated ${inventorySeries.length} time series points for ${selectedBrokers.length} brokers (NetBuyVol/NetSellVol - same as NET table)`, {
      sampleSeries: inventorySeries.slice(0, 3),
      hasData: inventorySeries.length > 0,
      firstPointBrokers: inventorySeries[0] ? Object.keys(inventorySeries[0]).filter(k => k !== 'time') : []
    });
    
    return inventorySeries;
  }, [brokerSummaryData, selectedBrokers]);

  const volumeDataForCharts = useMemo(() => {
    if (!volumeData || volumeData.length === 0) return [];
    
    // Remove duplicates and sort by time
    const seen = new Set<string>();
    const uniqueData = volumeData.filter((item: any) => {
      const timeKey = String(item.time);
      if (seen.has(timeKey)) {
        console.warn(`⚠️ Removing duplicate time in volumeData: ${timeKey}`);
        return false;
      }
      seen.add(timeKey);
      return true;
    });
    
    // Sort by time (ascending)
    const sorted = uniqueData.sort((a: any, b: any) => {
      if (a.time < b.time) return -1;
      if (a.time > b.time) return 1;
      return 0;
    });
    
    return sorted;
  }, [volumeData]);

  const brokerNetStats = useMemo(() => {
    if (!brokerSummaryData || brokerSummaryData.length === 0) {
      return {
        netByBroker: new Map<string, number>(),
        buyVolByBroker: new Map<string, number>(),
        sellVolByBroker: new Map<string, number>(),
        topBuyers: [] as Array<{ broker: string; buy: number }>,
        topSellers: [] as Array<{ broker: string; sell: number }>,
        topBuyerSet: new Set<string>(),
        topSellerSet: new Set<string>(),
      };
    }

    const netByBroker = new Map<string, number>();
    const buyVolByBroker = new Map<string, number>();
    const sellVolByBroker = new Map<string, number>();
    
    // Aggregate NetBuy and NetSell per broker (same logic as BrokerSummaryPage NET table)
    const brokerNetBuyTotals: { [broker: string]: { nblot: number; nbval: number } } = {};
    const brokerNetSellTotals: { [broker: string]: { nslot: number; nsval: number } } = {};

    brokerSummaryData.forEach((record) => {
      const broker = record.broker || record.BrokerCode;
      if (!broker) return;

      const netValue = typeof record.NetBuyVol === 'number' ? record.NetBuyVol : parseFloat(record.NetBuyVol || '0') || 0;
      const buyValue = typeof record.BuyVol === 'number'
        ? record.BuyVol
        : parseFloat(String(record.BuyVol || record.TotalVol || 0)) || 0;
      const sellValue = typeof record.SellVol === 'number'
        ? record.SellVol
        : parseFloat(String(record.SellVol || 0)) || 0;
      
      // Get NetBuyValue and NetSellValue (same as BrokerSummaryPage NET table)
      const netBuyValue = typeof record.NetBuyValue === 'number' 
        ? record.NetBuyValue 
        : parseFloat(String(record.NetBuyValue || 0)) || 0;
      const netSellValue = typeof record.NetSellValue === 'number'
        ? record.NetSellValue
        : parseFloat(String(record.NetSellValue || 0)) || 0;

      netByBroker.set(broker, (netByBroker.get(broker) || 0) + netValue);
      buyVolByBroker.set(broker, (buyVolByBroker.get(broker) || 0) + buyValue);
      sellVolByBroker.set(broker, (sellVolByBroker.get(broker) || 0) + sellValue);
      
      // Aggregate NetBuy totals per broker (same as BrokerSummaryPage NET table)
      if (netBuyValue > 0 || netValue > 0) {
        if (!brokerNetBuyTotals[broker]) {
          brokerNetBuyTotals[broker] = { nblot: 0, nbval: 0 };
        }
        brokerNetBuyTotals[broker].nblot += record.NetBuyVol || 0;
        brokerNetBuyTotals[broker].nbval += netBuyValue;
      }
      
      // Aggregate NetSell totals per broker (same as BrokerSummaryPage NET table)
      if (netSellValue > 0) {
        if (!brokerNetSellTotals[broker]) {
          brokerNetSellTotals[broker] = { nslot: 0, nsval: 0 };
        }
        brokerNetSellTotals[broker].nslot += record.NetSellVol || 0;
        brokerNetSellTotals[broker].nsval += netSellValue;
      }
    });

    // Determine final side for each broker based on which total is larger (same as BrokerSummaryPage NET table)
    const totalNetBuyData: { [broker: string]: { nblot: number; nbval: number } } = {};
    const totalNetSellData: { [broker: string]: { nslot: number; nsval: number } } = {};
    
    const allBrokers = new Set([...Object.keys(brokerNetBuyTotals), ...Object.keys(brokerNetSellTotals)]);
    allBrokers.forEach(broker => {
      const netBuyTotal = brokerNetBuyTotals[broker] || { nblot: 0, nbval: 0 };
      const netSellTotal = brokerNetSellTotals[broker] || { nslot: 0, nsval: 0 };
      
      // Compare total NetBuy value vs total NetSell value (same as BrokerSummaryPage NET table)
      if (netBuyTotal.nbval > netSellTotal.nsval) {
        // NetBuy is larger: broker goes to NetBuy side
        totalNetBuyData[broker] = {
          nblot: Math.max(0, netBuyTotal.nblot - netSellTotal.nslot),
          nbval: Math.max(0, netBuyTotal.nbval - netSellTotal.nsval),
        };
      } else if (netSellTotal.nsval > netBuyTotal.nbval) {
        // NetSell is larger: broker goes to NetSell side
        totalNetSellData[broker] = {
          nslot: Math.max(0, netSellTotal.nslot - netBuyTotal.nblot),
          nsval: Math.max(0, netSellTotal.nsval - netBuyTotal.nbval),
        };
      } else {
        // Equal or both zero: default to NetBuy side (or NetSell if NetBuy is 0)
        if (netBuyTotal.nbval > 0) {
          totalNetBuyData[broker] = {
            nblot: netBuyTotal.nblot,
            nbval: netBuyTotal.nbval,
          };
        } else if (netSellTotal.nsval > 0) {
          totalNetSellData[broker] = {
            nslot: netSellTotal.nslot,
            nsval: netSellTotal.nsval,
          };
        }
      }
    });

    // Sort and filter (same as BrokerSummaryPage NET table sortedTotalNetBuy and sortedTotalNetSell)
    const sortedTotalNetBuy = Object.entries(totalNetBuyData)
      .filter(([, data]) => data.nbval > 0) // Only include brokers with positive net value
      .map(([broker, data]) => ({ 
        broker, 
        nblot: data.nblot,
        nbval: data.nbval,
      }))
      .sort((a, b) => b.nbval - a.nbval);
      
    const sortedTotalNetSell = Object.entries(totalNetSellData)
      .filter(([, data]) => data.nsval > 0) // Only include brokers with positive net value
      .map(([broker, data]) => ({ 
        broker, 
        nslot: data.nslot,
        nsval: data.nsval,
      }))
      .sort((a, b) => b.nsval - a.nsval);

    // Top 5 Buy: Top 5 from sortedTotalNetBuy (brokers with highest NetBuy)
    // IMPORTANT: Data has already been swapped for sectors in the mapping step (line 1920-1926)
    // So NetBuyVol/NetSellVol are already correct - no need for additional swap
    const topBuyers = sortedTotalNetBuy
      .slice(0, 5)
      .map(({ broker, nbval, nblot }) => ({ broker, buy: nbval, lot: nblot }));

    // Top 5 Sell: Top 5 from sortedTotalNetSell (brokers with highest NetSell)
    // IMPORTANT: Data has already been swapped for sectors in the mapping step (line 1920-1926)
    // So NetBuyVol/NetSellVol are already correct - no need for additional swap
    const topSellers = sortedTotalNetSell
      .slice(0, 5)
      .map(({ broker, nsval, nslot }) => ({ broker, sell: nsval, lot: nslot }));

    return {
      netByBroker,
      buyVolByBroker,
      sellVolByBroker,
      topBuyers,
      topSellers,
      topBuyerSet: new Set(topBuyers.map(item => item.broker)),
      topSellerSet: new Set(topSellers.map(item => item.broker)),
    };
  }, [brokerSummaryData]);



  // Separate brokers into different groups
  const top5BuyBrokers = useMemo(() => {
    if (!brokerSelectionMode.top5buy) return [];
    return brokerNetStats.topBuyers.slice(0, 5).map(item => item.broker).filter(broker => selectedBrokers.includes(broker));
  }, [brokerSelectionMode.top5buy, brokerNetStats.topBuyers, selectedBrokers]);

  const top5SellBrokers = useMemo(() => {
    if (!brokerSelectionMode.top5sell) return [];
    return brokerNetStats.topSellers.slice(0, 5).map(item => item.broker).filter(broker => selectedBrokers.includes(broker));
  }, [brokerSelectionMode.top5sell, brokerNetStats.topSellers, selectedBrokers]);

  const customBrokers = useMemo(() => {
    // Brokers that are not in top 5 buy or top 5 sell
    const top5BuySet = new Set(brokerNetStats.topBuyers.slice(0, 5).map(item => item.broker));
    const top5SellSet = new Set(brokerNetStats.topSellers.slice(0, 5).map(item => item.broker));
    return selectedBrokers.filter(broker => !top5BuySet.has(broker) && !top5SellSet.has(broker));
  }, [selectedBrokers, brokerNetStats.topBuyers, brokerNetStats.topSellers]);

  // Set default visibility: only first buyer and first seller are visible
  useEffect(() => {
    if (!brokerNetStats || brokerNetStats.topBuyers.length === 0 || brokerNetStats.topSellers.length === 0) {
      return;
    }

    const top5BuyBrokers = brokerNetStats.topBuyers.slice(0, 5).map(item => item.broker);
    const top5SellBrokers = brokerNetStats.topSellers.slice(0, 5).map(item => item.broker);
    const top5BuySet = new Set(top5BuyBrokers);
    const top5SellSet = new Set(top5SellBrokers);

    // Check if top 5 buyers and sellers are selected
    const hasTop5Buy = top5BuyBrokers.every(broker => selectedBrokers.includes(broker));
    const hasTop5Sell = top5SellBrokers.every(broker => selectedBrokers.includes(broker));

    // Apply default visibility if top 5 are selected (regardless of hasUserSelectedBrokers)
    // This ensures visibility is set correctly when top 5 are auto-selected
    if (hasTop5Buy && hasTop5Sell && brokerSelectionMode.top5buy && brokerSelectionMode.top5sell) {
      const firstBuyer = top5BuyBrokers[0];
      const firstSeller = top5SellBrokers[0];

      setBrokerVisibility((prev) => {
        const updated = { ...prev };
        let changed = false;

        // Set visibility: only first buyer and first seller are visible
        selectedBrokers.forEach((broker) => {
          if (broker === firstBuyer || broker === firstSeller) {
            if (updated[broker] !== true) {
              updated[broker] = true;
              changed = true;
            }
          } else if (top5BuySet.has(broker) || top5SellSet.has(broker)) {
            // Other top 5 brokers are not visible by default
            if (updated[broker] !== false) {
              updated[broker] = false;
              changed = true;
            }
          } else {
            // Custom brokers are visible by default
            if (updated[broker] === undefined) {
              updated[broker] = true;
              changed = true;
            }
          }
        });

        return changed ? updated : prev;
      });
    }
  }, [brokerNetStats, selectedBrokers, brokerSelectionMode]);

  useEffect(() => {
    if (!brokerSummaryData.length || !startDate || !endDate) return;

    const candidatePool =
      availableBrokersForStock.length > 0
        ? availableBrokersForStock
        : brokerSummaryData
            .map((record) => (record.broker || record.BrokerCode || '') as string)
            .filter(Boolean);

    if (candidatePool.length === 0) return;

    const candidateSet = new Set(candidatePool);
    const topBuy = brokerNetStats.topBuyers
      .map(({ broker }) => broker)
      .filter((broker): broker is string => Boolean(broker) && candidateSet.has(broker))
      .slice(0, 5);

    const topSell = brokerNetStats.topSellers
      .map(({ broker }) => broker)
      .filter((broker): broker is string => Boolean(broker) && candidateSet.has(broker))
      .slice(0, 5);

    const combinedDefaults = Array.from(new Set([...topBuy, ...topSell]));
    setDefaultBrokers(combinedDefaults);

    if (hasUserSelectedBrokers || combinedDefaults.length === 0) {
      return;
    }

    const hasSameSelection =
      combinedDefaults.length === selectedBrokers.length &&
      combinedDefaults.every((broker) => selectedBrokers.includes(broker));

    if (hasSameSelection) {
      // Even if selection is the same, ensure modes are set correctly
      if (topBuy.length > 0 && topSell.length > 0) {
        const hasTop5Buy = topBuy.every(b => selectedBrokers.includes(b));
        const hasTop5Sell = topSell.every(b => selectedBrokers.includes(b));
        if (hasTop5Buy && !brokerSelectionMode.top5buy) {
          setBrokerSelectionMode(prev => ({ ...prev, top5buy: true }));
        }
        if (hasTop5Sell && !brokerSelectionMode.top5sell) {
          setBrokerSelectionMode(prev => ({ ...prev, top5sell: true }));
        }
      }
      return;
    }

    // Set selected brokers and activate top 5 modes
    // NO auto-fetch - user must click Show button to fetch data
    setSelectedBrokers(combinedDefaults);
    if (topBuy.length > 0) {
      setBrokerSelectionMode(prev => ({ ...prev, top5buy: true }));
    }
    if (topSell.length > 0) {
      setBrokerSelectionMode(prev => ({ ...prev, top5sell: true }));
    }
    setIsDataReady(false);
    // Removed: setShouldFetchData(true) - user must click Show button
  }, [
    brokerSummaryData,
    brokerNetStats,
    availableBrokersForStock,
    startDate,
    endDate,
    hasUserSelectedBrokers,
    selectedBrokers,
    brokerSelectionMode,
  ]);


  // Generate unique colors for brokers (dark colors with high contrast for white text)
  // Ensures each broker gets a unique, highly contrasting color
  const generateUniqueBrokerColor = (broker: string | undefined | null, allBrokers: string[]): string => {
    // Handle undefined/null broker
    if (!broker || typeof broker !== 'string') {
      return 'hsl(0, 0%, 35%)'; // Return dark gray color for invalid broker
    }
    
    const sortedBrokers = [...new Set(allBrokers)].sort();
    const brokerIndex = sortedBrokers.indexOf(broker);
    
    // Create a hash from broker code for more random distribution
    const brokerHash = broker.split('').reduce((acc, char, idx) => {
      return acc + char.charCodeAt(0) * (idx + 1);
    }, 0);
    
    if (brokerIndex === -1) {
      // Fallback for unknown brokers
      const hue = brokerHash % 360;
      return `hsl(${hue}, 75%, 30%)`; // Darker for better text contrast
    }
    
    // Use both brokerIndex and brokerHash to ensure unique colors
    // This combination ensures different brokers get different colors even if they're close in index
    
    // Calculate hue with larger variation to ensure contrast
    // Distribute hues evenly across 360 degrees with minimum spacing
    const totalBrokers = sortedBrokers.length;
    const baseHueStep = 360 / Math.max(totalBrokers, 1);
    const baseHue = (brokerIndex * baseHueStep) % 360;
    
    // Add significant variation from hash to differentiate brokers with similar indices
    // This ensures brokers get unique colors even if they're adjacent in the sorted list
    const hashHueVariation = (brokerHash % 40) - 20; // -20 to +20 degrees variation
    const finalHue = (baseHue + hashHueVariation + 360) % 360;
    
    // Use hash to create more variation in saturation
    // Wider saturation range (65-90%) for better distinction
    const satHash = brokerHash % 26; // 0-25
    const saturation = 65 + satHash; // 65-90% saturation
    
    // Use hash to create more variation in lightness
    // Wider lightness range (22-35%) for better distinction
    const lightHash = (brokerHash * 7) % 14; // 0-13
    const lightness = 22 + lightHash; // 22-35% lightness (dark enough for white text)
    
    return `hsl(${Math.round(finalHue)}, ${saturation}%, ${lightness}%)`;
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

  // Sort and filter brokers for dropdown (sorted by top brokers by date on last date)
  const {
    recommendedBrokers,
    otherBrokers,
    filteredBrokers,
    totalOtherBrokersCount,
  } = useMemo(() => {
    const searchTerm = brokerSearch.toLowerCase();
    
    // Get top 5 buy and top 5 sell brokers
    const top5BuyBrokers = brokerNetStats.topBuyers.slice(0, 5).map(item => item.broker);
    const top5SellBrokers = brokerNetStats.topSellers.slice(0, 5).map(item => item.broker);
    const top5BuySellSet = new Set([...top5BuyBrokers, ...top5SellBrokers]);
    
    // Get top brokers order from last date
    const lastDateData = topBrokersData.length > 0 ? topBrokersData[topBrokersData.length - 1] : null;
    const topBrokersOrderMap = new Map<string, number>();
    if (lastDateData && lastDateData.topBrokers) {
      lastDateData.topBrokers.forEach((brokerData, index) => {
        topBrokersOrderMap.set(brokerData.broker, index);
      });
    }
    
    const recommended = defaultBrokers
      .filter((broker) => availableBrokersForStock.includes(broker))
      .filter((broker) => !selectedBrokers.includes(broker))
      .filter((broker) => broker.toLowerCase().includes(searchTerm));

    // Sort recommended brokers: Top 5 Buy/Sell first (in their original order), then by top brokers order from last date
    const sortedRecommended = [...recommended].sort((a, b) => {
      const aIsTop5 = top5BuySellSet.has(a);
      const bIsTop5 = top5BuySellSet.has(b);
      
      // Top 5 Buy/Sell brokers always come first
      if (aIsTop5 && !bIsTop5) return -1;
      if (!aIsTop5 && bIsTop5) return 1;
      
      // If both are Top 5, maintain their original order (top 5 buy first, then top 5 sell)
      if (aIsTop5 && bIsTop5) {
        const aIndex = top5BuyBrokers.indexOf(a) !== -1 ? top5BuyBrokers.indexOf(a) : top5SellBrokers.indexOf(a) + 5;
        const bIndex = top5BuyBrokers.indexOf(b) !== -1 ? top5BuyBrokers.indexOf(b) : top5SellBrokers.indexOf(b) + 5;
        return aIndex - bIndex;
      }
      
      // For non-Top 5 brokers, sort by top brokers order from last date
      const aOrder = topBrokersOrderMap.has(a) ? topBrokersOrderMap.get(a)! : Infinity;
      const bOrder = topBrokersOrderMap.has(b) ? topBrokersOrderMap.get(b)! : Infinity;
      
      // If both are in top brokers, sort by their order
      if (aOrder !== Infinity && bOrder !== Infinity) {
        return aOrder - bOrder;
      }
      
      // If only one is in top brokers, it comes first
      if (aOrder !== Infinity) return -1;
      if (bOrder !== Infinity) return 1;
      
      // If neither is in top brokers, maintain original order
      return 0;
    });

    const others = availableBrokersForStock
      .filter((broker) => !defaultBrokers.includes(broker))
      .filter((broker) => !selectedBrokers.includes(broker))
      .filter((broker) => broker.toLowerCase().includes(searchTerm));

    // Sort other brokers by top brokers order from last date
    const sortedOthers = [...others].sort((a, b) => {
      const aOrder = topBrokersOrderMap.has(a) ? topBrokersOrderMap.get(a)! : Infinity;
      const bOrder = topBrokersOrderMap.has(b) ? topBrokersOrderMap.get(b)! : Infinity;
      
      // If both are in top brokers, sort by their order
      if (aOrder !== Infinity && bOrder !== Infinity) {
        return aOrder - bOrder;
      }
      
      // If only one is in top brokers, it comes first
      if (aOrder !== Infinity) return -1;
      if (bOrder !== Infinity) return 1;
      
      // If neither is in top brokers, maintain original order
      return 0;
    });

    // Display all brokers (no limit) - ensure all brokers are shown in dropdown
    return {
      recommendedBrokers: sortedRecommended,
      otherBrokers: sortedOthers,
      filteredBrokers: [...sortedRecommended, ...sortedOthers],
      totalOtherBrokersCount: sortedOthers.length,
    };
  }, [availableBrokersForStock, defaultBrokers, brokerSearch, selectedBrokers, brokerNetStats, topBrokersData]);

  return (
    <div className="min-h-screen overflow-x-hidden">
      <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6">
        <div className="space-y-6">

          {/* Controls */}
          {!hideControls && (
            <>
              {/* Pada layar kecil/menengah menu ikut scroll; hanya di layar besar (lg+) yang fixed di top */}
              <div className="bg-[#0a0f20]/95 border-b border-[#3a4252] px-4 py-1.5 backdrop-blur-md shadow-lg lg:fixed lg:top-14 lg:left-20 lg:right-0 lg:z-40">
                <div ref={controlMenuRef} className="flex flex-col md:flex-row md:flex-wrap items-stretch md:items-center gap-3 md:gap-6">
                  {/* Ticker Selection */}
                <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
                  <label className="text-sm font-medium whitespace-nowrap">Ticker:</label>
                  <div className="relative flex-1 md:flex-none" ref={dropdownRef}>
                    <Search className="absolute left-3 top-1/2 pointer-events-none -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                    <input
                      type="text"
                      value={tickerInput || (selectedTicker ? formatStockDisplayName(selectedTicker) : '')}
                      onChange={(e) => { handleStockInputChange(e.target.value); setHighlightedStockIndex(0); }}
                      onFocus={() => { 
                        setTickerInput('');
                        setShowStockSuggestions(true); 
                        setHighlightedStockIndex(0); 
                      }}
                      onKeyDown={(e) => {
                        const suggestions = (tickerInput === '' ? availableStocks.filter(s => selectedTicker !== s) : filteredStocks).slice(0, 10);
                        if (!suggestions.length) return;
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                            setHighlightedStockIndex((prev) => (prev + 1) % suggestions.length);
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                            setHighlightedStockIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
                          } else if (e.key === 'Enter' && showStockSuggestions) {
                          e.preventDefault();
                            const idx = highlightedStockIndex >= 0 ? highlightedStockIndex : 0;
                          const choice = suggestions[idx];
                            if (choice) handleStockSelect(choice);
                        } else if (e.key === 'Escape') {
                            setShowStockSuggestions(false);
                            setHighlightedStockIndex(-1);
                          }
                        }}
                        placeholder={selectedTicker ? formatStockDisplayName(selectedTicker) : "Select ticker"}
                        className="w-32 h-9 pl-10 pr-3 text-sm border border-input rounded-md bg-background text-foreground"
                      />
                      {showStockSuggestions && (
                        <div className="absolute top-full left-0 mt-1 bg-popover border border-[#3a4252] rounded-md shadow-lg z-50 max-h-96 overflow-hidden flex flex-col min-w-[400px]">
                          {availableStocks.length === 0 ? (
                            <div className="px-3 py-[2.06px] text-sm text-muted-foreground flex items-center">
                              <Loader2 className="w-4 h-4 animate-spin mr-2" />
                              Loading stocks...
                            </div>
                          ) : (
                            <div className="flex flex-row h-full max-h-96 overflow-hidden">
                              {/* Left column: Stocks */}
                              <div className="flex-1 border-r border-[#3a4252] overflow-y-auto">
                                {tickerInput === '' ? (
                                  <>
                                    <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252] sticky top-0 bg-popover">
                                      Stocks ({availableStocks.filter(s => {
                                        if (s.startsWith('[SECTOR] ')) return false;
                                        return selectedTicker !== s;
                                      }).length})
                                    </div>
                                    {availableStocks.filter(s => {
                                      if (s.startsWith('[SECTOR] ')) return false;
                                      return selectedTicker !== s;
                                    }).map(stock => (
                                      <div
                                        key={stock}
                                        onClick={() => handleStockSelect(stock)}
                                        className="px-3 py-[2.06px] hover:bg-muted cursor-pointer text-sm"
                                      >
                                        {stock}
                                      </div>
                                    ))}
                                  </>
                                ) : filteredStocksList.length > 0 ? (
                                  <>
                                    <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252] sticky top-0 bg-popover">
                                      Stocks ({filteredStocksList.length})
                                    </div>
                                    {filteredStocksList.map(stock => (
                                      <div
                                        key={stock}
                                        onClick={() => handleStockSelect(stock)}
                                        className="px-3 py-[2.06px] hover:bg-muted cursor-pointer text-sm"
                                      >
                                        {stock}
                                      </div>
                                    ))}
                                  </>
                                ) : (
                                  <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252] sticky top-0 bg-popover">
                                    Stocks (0)
                                  </div>
                                )}
                              </div>
                              {/* Right column: Sectors */}
                              <div className="flex-1 overflow-y-auto">
                                {tickerInput === '' ? (
                                  <>
                                    <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252] sticky top-0 bg-popover">
                                      Sectors ({availableStocks.filter(s => s.startsWith('[SECTOR] ') && selectedTicker !== s).length})
                                    </div>
                                    {availableStocks.filter(s => s.startsWith('[SECTOR] ') && selectedTicker !== s).map(stock => (
                                      <div
                                        key={stock}
                                        onClick={() => handleStockSelect(stock)}
                                        className="px-3 py-[2.06px] hover:bg-muted cursor-pointer text-sm"
                                      >
                                        {formatStockDisplayName(stock)}
                                      </div>
                                    ))}
                                  </>
                                ) : filteredSectorsList.length > 0 ? (
                                  <>
                                    <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252] sticky top-0 bg-popover">
                                      Sectors ({filteredSectorsList.length})
                                    </div>
                                    {filteredSectorsList.map(stock => (
                                      <div
                                        key={stock}
                                        onClick={() => handleStockSelect(stock)}
                                        className="px-3 py-[2.06px] hover:bg-muted cursor-pointer text-sm"
                                      >
                                        {formatStockDisplayName(stock)}
                                      </div>
                                    ))}
                                  </>
                                ) : (
                                  <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252] sticky top-0 bg-popover">
                                    Sectors (0)
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Broker Selection - Multi-select with chips */}
                  <div className="flex flex-row items-center gap-2">
                    <label className="text-sm font-medium whitespace-nowrap">Broker:</label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder={isLoadingBrokersForStock ? "Loading..." : getActualTicker ? `Broker for ${getActualTicker}...` : "Select ticker first..."}
                        value={brokerSearch}
                        disabled={!getActualTicker || isLoadingBrokersForStock}
                        onChange={(e) => { handleBrokerSearchChange(e); }}
                        onFocus={handleBrokerFocus}
                        onKeyDown={handleBrokerKeyDown}
                        className="w-32 h-9 px-3 text-sm border border-input rounded-md bg-background text-foreground"
                        role="combobox"
                        aria-expanded={showBrokerSuggestions}
                        aria-controls="broker-suggestions"
                        aria-autocomplete="list"
                        />
                        {showBrokerSuggestions && getActualTicker && !isLoadingBrokersForStock && (
                          <div id="broker-suggestions" role="listbox" className="broker-dropdown-container absolute top-full left-0 mt-1 bg-popover border border-[#3a4252] rounded-md shadow-lg z-[100] max-h-96 overflow-hidden flex flex-col min-w-[400px]" onMouseDown={(e) => e.stopPropagation()}>
                          {availableBrokersForStock.length === 0 ? (
                            <div className="px-3 py-[2.06px] text-sm text-muted-foreground flex items-center">
                              {isLoadingBrokersForStock ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                  Loading brokers...
                                </>
                              ) : (
                                'No brokers available'
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-row h-full max-h-96 overflow-hidden">
                              {/* Left column: Brokers */}
                              <div className="flex-1 border-r border-[#3a4252] overflow-y-auto">
                                {filteredBrokers.length === 0 ? (
                                  <div className="px-3 py-[2.06px] text-sm text-muted-foreground">
                                    {brokerSearch !== '' ? `No brokers found matching "${brokerSearch}"` : `No brokers available for ${selectedTicker}`}
                                  </div>
                                ) : (
                            <>
                              {recommendedBrokers.length > 0 && (
                                <>
                                  <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252] sticky top-0 bg-popover">
                                    Recommended ({recommendedBrokers.length})
                                  </div>
                                  {recommendedBrokers.map((broker, index) => {
                                    const hasQuickSelect = brokerNetStats.topBuyers.length > 0 && brokerSearch === '';
                                    const quickSelectCount = hasQuickSelect ? 2 : 0;
                                    const globalIndex = quickSelectCount + index;
                                    return (
                                      <div
                                        key={`recommended-${broker}`}
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          // Only handle click if not clicking directly on checkbox
                                          const target = e.target as HTMLElement;
                                          if (target.tagName !== 'INPUT' && !target.closest('input')) {
                                            // Allow selecting individual brokers even after quick select
                                            if (selectedBrokers.includes(broker)) {
                                              // If already selected, remove it
                                              removeBroker(broker);
                                            } else {
                                              // If not selected, add it
                                            handleBrokerSelect(broker);
                                            }
                                            // Keep suggestions open to allow multiple selections
                                          }
                                        }}
                                        onMouseDown={(e) => {
                                          // Prevent mousedown from closing dropdown
                                          e.stopPropagation();
                                        }}
                                        className={`px-3 py-[2.06px] hover:bg-muted cursor-pointer text-sm ${globalIndex === highlightedBrokerIndex ? 'bg-accent' : ''} ${selectedBrokers.includes(broker) ? 'bg-accent/50' : ''}`}
                                        onMouseEnter={() => handleBrokerMouseEnter(globalIndex)}
                                      >
                                        <div className="flex items-center gap-2">
                                          <input
                                            type="checkbox"
                                            checked={selectedBrokers.includes(broker)}
                                            onChange={(e) => {
                                              e.stopPropagation();
                                              if (e.target.checked) {
                                                if (!selectedBrokers.includes(broker)) {
                                                  handleBrokerSelect(broker);
                                                }
                                              } else {
                                                removeBroker(broker);
                                              }
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                            onMouseDown={(e) => e.stopPropagation()}
                                            className="h-4 w-4 rounded border-[#3a4252] bg-transparent text-primary focus:ring-primary cursor-pointer"
                                          />
                                          <div
                                            className="w-2 h-2 rounded-full"
                                            style={{ backgroundColor: generateBrokerColor(broker, selectedBrokers) }}
                                          />
                                          <span>{broker}</span>
                                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground border border-border rounded px-1 py-0.5">
                                            Default
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                      </>
                                    )}
                                    {otherBrokers.length > 0 && (
                                      <>
                                        <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252]">
                                          {recommendedBrokers.length > 0 ? 'All Brokers' : `Brokers (${totalOtherBrokersCount})`}
                                        </div>
                                        {otherBrokers.map((broker, index) => {
                                          const hasQuickSelect = brokerNetStats.topBuyers.length > 0 && brokerSearch === '';
                                          const quickSelectCount = hasQuickSelect ? 2 : 0;
                                          const globalIndex = quickSelectCount + recommendedBrokers.length + index;
                                          return (
                                            <div
                                              key={`option-${broker}`}
                                              onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                // Only handle click if not clicking directly on checkbox
                                                const target = e.target as HTMLElement;
                                                if (target.tagName !== 'INPUT' && !target.closest('input')) {
                                                  // Allow selecting individual brokers even after quick select
                                                  if (selectedBrokers.includes(broker)) {
                                                    // If already selected, remove it
                                                    removeBroker(broker);
                                                  } else {
                                                    // If not selected, add it
                                                    handleBrokerSelect(broker);
                                                  }
                                                  // Keep suggestions open to allow multiple selections
                                                }
                                              }}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                  e.preventDefault();
                                                  e.stopPropagation();
                                                  if (selectedBrokers.includes(broker)) {
                                                    removeBroker(broker);
                                                  } else {
                                                    handleBrokerSelect(broker);
                                                  }
                                                }
                                              }}
                                              onMouseDown={(e) => {
                                                // Prevent mousedown from closing dropdown
                                                e.stopPropagation();
                                              }}
                                              tabIndex={0}
                                              role="option"
                                              aria-selected={selectedBrokers.includes(broker)}
                                              className={`px-3 py-[2.06px] hover:bg-muted cursor-pointer text-sm ${globalIndex === highlightedBrokerIndex ? 'bg-accent' : ''} ${selectedBrokers.includes(broker) ? 'bg-accent/50' : ''}`}
                                              onMouseEnter={() => handleBrokerMouseEnter(globalIndex)}
                                            >
                                              <div className="flex items-center gap-2">
                                                <input
                                                  type="checkbox"
                                                  checked={selectedBrokers.includes(broker)}
                                                  onChange={(e) => {
                                                    e.stopPropagation();
                                                    if (e.target.checked) {
                                                      if (!selectedBrokers.includes(broker)) {
                                                        handleBrokerSelect(broker);
                                                      }
                                                    } else {
                                                      removeBroker(broker);
                                                    }
                                                  }}
                                                  onClick={(e) => e.stopPropagation()}
                                                  onMouseDown={(e) => e.stopPropagation()}
                                                  className="h-4 w-4 rounded border-[#3a4252] bg-transparent text-primary focus:ring-primary cursor-pointer"
                                                />
                                                <div
                                                  className="w-2 h-2 rounded-full"
                                                  style={{ backgroundColor: generateBrokerColor(broker, selectedBrokers) }}
                                                />
                                                {broker}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </>
                                    )}
                                  </>
                                )}
                              </div>
                            {/* Right column: Quick Select */}
                            <div className="flex-1 overflow-y-auto">
                              {brokerNetStats.topBuyers.length > 0 && brokerSearch === '' ? (
                                <>
                                  <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252] sticky top-0 bg-popover">
                                    Quick Select
                                  </div>
                                  <div
                                    onClick={() => {
                                      // Toggle top5buy mode and add/remove top 5 buyers
                                      const top5Buy = brokerNetStats.topBuyers.slice(0, 5).map(item => item.broker);
                                      const isCurrentlyActive = brokerSelectionMode.top5buy;
                                      
                                      if (isCurrentlyActive) {
                                        // Remove top 5 buyers from selection
                                        setSelectedBrokers(prev => prev.filter(b => !top5Buy.includes(b)));
                                        setBrokerSelectionMode(prev => ({ ...prev, top5buy: false }));
                                      } else {
                                        // Add top 5 buyers to selection (merge with existing)
                                        setSelectedBrokers(prev => {
                                          const newSet = new Set([...prev, ...top5Buy]);
                                          return Array.from(newSet);
                                        });
                                        setBrokerSelectionMode(prev => ({ ...prev, top5buy: true }));
                                      }
                                      setHasUserSelectedBrokers(false);
                                      setBrokerSearch('');
                                      console.log(`✅ Top 5 Buy ${isCurrentlyActive ? 'deselected' : 'selected'}:`, {
                                        top5Buy,
                                        count: top5Buy.length,
                                        willAppearInLegend: !isCurrentlyActive
                                      });
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        const top5Buy = brokerNetStats.topBuyers.slice(0, 5).map(item => item.broker);
                                        const isCurrentlyActive = brokerSelectionMode.top5buy;
                                        
                                        if (isCurrentlyActive) {
                                          setSelectedBrokers(prev => prev.filter(b => !top5Buy.includes(b)));
                                          setBrokerSelectionMode(prev => ({ ...prev, top5buy: false }));
                                        } else {
                                          setSelectedBrokers(prev => {
                                            const newSet = new Set([...prev, ...top5Buy]);
                                            return Array.from(newSet);
                                          });
                                          setBrokerSelectionMode(prev => ({ ...prev, top5buy: true }));
                                        }
                                        setHasUserSelectedBrokers(false);
                                        setBrokerSearch('');
                                      }
                                    }}
                                    tabIndex={0}
                                    role="option"
                                    aria-selected={brokerSelectionMode.top5buy}
                                    className={`px-3 py-[2.06px] hover:bg-muted cursor-pointer text-sm font-medium ${highlightedBrokerIndex === 0 ? 'bg-accent' : ''} ${brokerSelectionMode.top5buy ? 'bg-primary/20' : ''}`}
                                  >
                                    📈 Top 5 Buy {brokerSelectionMode.top5buy ? '✓' : ''}
                                  </div>
                                  <div
                                    onClick={() => {
                                      // Toggle top5sell mode and add/remove top 5 sellers
                                      const top5Sell = brokerNetStats.topSellers.slice(0, 5).map(item => item.broker);
                                      const isCurrentlyActive = brokerSelectionMode.top5sell;
                                      
                                      if (isCurrentlyActive) {
                                        // Remove top 5 sellers from selection
                                        setSelectedBrokers(prev => prev.filter(b => !top5Sell.includes(b)));
                                        setBrokerSelectionMode(prev => ({ ...prev, top5sell: false }));
                                      } else {
                                        // Add top 5 sellers to selection (merge with existing)
                                        setSelectedBrokers(prev => {
                                          const newSet = new Set([...prev, ...top5Sell]);
                                          return Array.from(newSet);
                                        });
                                        setBrokerSelectionMode(prev => ({ ...prev, top5sell: true }));
                                      }
                                      setHasUserSelectedBrokers(false);
                                      setBrokerSearch('');
                                      console.log(`✅ Top 5 Sell ${isCurrentlyActive ? 'deselected' : 'selected'}:`, {
                                        top5Sell,
                                        count: top5Sell.length,
                                        willAppearInLegend: !isCurrentlyActive
                                      });
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        const top5Sell = brokerNetStats.topSellers.slice(0, 5).map(item => item.broker);
                                        const isCurrentlyActive = brokerSelectionMode.top5sell;
                                        
                                        if (isCurrentlyActive) {
                                          setSelectedBrokers(prev => prev.filter(b => !top5Sell.includes(b)));
                                          setBrokerSelectionMode(prev => ({ ...prev, top5sell: false }));
                                        } else {
                                          setSelectedBrokers(prev => {
                                            const newSet = new Set([...prev, ...top5Sell]);
                                            return Array.from(newSet);
                                          });
                                          setBrokerSelectionMode(prev => ({ ...prev, top5sell: true }));
                                        }
                                        setHasUserSelectedBrokers(false);
                                        setBrokerSearch('');
                                      }
                                    }}
                                    tabIndex={0}
                                    role="option"
                                    aria-selected={brokerSelectionMode.top5sell}
                                    className={`px-3 py-[2.06px] hover:bg-muted cursor-pointer text-sm font-medium ${highlightedBrokerIndex === 1 ? 'bg-accent' : ''} ${brokerSelectionMode.top5sell ? 'bg-primary/20' : ''}`}
                                  >
                                    📉 Top 5 Sell {brokerSelectionMode.top5sell ? '✓' : ''}
                                  </div>
                                </>
                              ) : (
                                <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252] sticky top-0 bg-popover">
                                  Quick Select
                                </div>
                              )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Date Range */}
                  <div className="flex flex-row items-center gap-2">
                    <label className="text-sm font-medium whitespace-nowrap">Date Range:</label>
                    <div className="flex items-center gap-2">
                    <div 
                      className="relative h-9 w-36 rounded-md border border-input bg-background cursor-pointer hover:bg-accent/50 transition-colors"
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
                            if (startDateRef.current) {
                              startDateRef.current.value = formatDateForInput(startDate);
                            }
                            return;
                          }
                          setStartDate(selectedDate);
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
                      <div className="flex items-center justify-between h-full px-3">
                        <span className="text-sm text-foreground">
                          {startDate ? new Date(startDate).toLocaleDateString('en-GB', { 
                            day: '2-digit', 
                            month: '2-digit', 
                            year: 'numeric' 
                          }) : 'DD/MM/YYYY'}
                        </span>
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                    <span className="text-sm text-muted-foreground whitespace-nowrap">to</span>
                    <div 
                      className="relative h-9 w-36 rounded-md border border-input bg-background cursor-pointer hover:bg-accent/50 transition-colors"
                      onClick={() => triggerDatePicker(endDateRef)}
                    >
                      <input
                        ref={endDateRef}
                        type="date"
                        value={formatDateForInput(endDate)}
                        onChange={(e) => {
                          const selectedDate = e.target.value;
                          
                          if (selectedDate < MIN_DATE) {
                            showToast({
                              type: 'error',
                              title: 'Tanggal Tidak Valid',
                              message: `Tanggal minimum yang bisa dipilih adalah ${new Date(MIN_DATE).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}`
                            });
                            if (endDateRef.current) {
                              endDateRef.current.value = formatDateForInput(endDate);
                            }
                            return;
                          }
                          
                          if (latestDataDate && selectedDate > latestDataDate) {
                            showToast({
                              type: 'error',
                              title: 'Tanggal Tidak Valid',
                              message: `Tanggal maksimum yang tersedia adalah ${new Date(latestDataDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}`
                            });
                            if (endDateRef.current) {
                              endDateRef.current.value = formatDateForInput(endDate);
                            }
                            return;
                          }
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
                      <div className="flex items-center justify-between h-full px-3">
                        <span className="text-sm text-foreground">
                          {endDate ? new Date(endDate).toLocaleDateString('en-GB', { 
                            day: '2-digit', 
                            month: '2-digit', 
                            year: 'numeric' 
                          }) : 'DD/MM/YYYY'}
                        </span>
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                </div>

                  {/* Show Button */}
                  <button
                    onClick={() => {
                      // Set shouldFetchData to true to trigger data fetch
                      setShouldFetchData(true);
                      setIsDataReady(false);
                    }}
                    disabled={isLoadingData || isLoadingBrokerData || selectedBrokers.length === 0 || !startDate || !endDate || !getActualTicker}
                    className="h-9 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium whitespace-nowrap flex items-center justify-center"
                  >
                    Show
                  </button>
                </div>
              </div>
              {/* Spacer untuk header fixed - hanya diperlukan di layar besar (lg+) */}
              <div className="hidden lg:block" style={{ height: `${controlSpacerHeight}px` }} />
            </>
          )}


          {/* Conditional Chart Rendering - Only show when data is ready */}
          {isDataReady && (
            <>
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
              <CardContent>
                <div className="flex flex-col lg:flex-row gap-4">
                  <div className="flex-1 relative">
                  {(isLoadingData || isLoadingInventoryData) && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                      <div className="flex flex-col items-center gap-2">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                        <div className="text-xs text-muted-foreground">Loading broker inventory...</div>
                      </div>
                    </div>
                  )}
                  {!isLoadingData && !isLoadingInventoryData && isDataReady && inventoryData.length === 0 && selectedBrokers.length > 0 && (
                    <div className="flex items-center justify-center h-80 text-muted-foreground">
                      <div className="text-center">
                        <p>No inventory data available for selected brokers</p>
                        <p className="text-xs mt-2">Data may not be available for the selected date range</p>
                      </div>
                    </div>
                  )}
                  {!isLoadingData && !isLoadingInventoryData && isDataReady && inventoryData.length > 0 && selectedBrokers.length > 0 && visibleBrokers.length === 0 && (
                    <div className="flex items-center justify-center h-80 text-muted-foreground">
                      <div className="text-center">
                        <p>No visible brokers</p>
                        <p className="text-xs mt-2">Enable broker visibility in the legend to view chart</p>
                      </div>
                    </div>
                  )}
                  {!isLoadingData && !isLoadingInventoryData && isDataReady && inventoryData.length > 0 && selectedBrokers.length > 0 && visibleBrokers.length > 0 && (
                    <InventoryChart
                      key={`inventory-${visibleBrokers.join('-')}`}
                      inventoryData={inventoryData}
                      selectedBrokers={selectedBrokers}
                      displayBrokers={visibleBrokers}
                    />
                  )}
                  {!isDataReady && !isLoadingData && !isLoadingInventoryData && (
                    <div className="flex items-center justify-center h-80 text-muted-foreground">
                      <div className="text-center">
                        <p>No data loaded</p>
                        <p className="text-xs mt-2">Click Show button to load data</p>
                      </div>
                    </div>
                  )}
                  {selectedBrokers.length === 0 && !isLoadingData && !isLoadingInventoryData && (
                    <div className="flex items-center justify-center h-80 text-muted-foreground">
                      <div className="text-center">
                        <p>No brokers selected</p>
                        <p className="text-xs mt-2">Select brokers above to view cumulative net flow</p>
                      </div>
                    </div>
                  )}
                  </div>
                  <div className="w-full lg:w-64 flex flex-col gap-4">
                    {brokerSelectionMode.top5buy && top5BuyBrokers.length > 0 && (
                    <BrokerLegend
                        title="Top 5 Buyers"
                        brokers={top5BuyBrokers}
                      colorReferenceBrokers={selectedBrokers}
                      brokerVisibility={brokerVisibility}
                      onToggleVisibility={handleToggleBrokerVisibility}
                      onRemoveBroker={removeBroker}
                      onRemoveAll={removeAllTop5Buy}
                    />
                    )}
                    {brokerSelectionMode.top5sell && top5SellBrokers.length > 0 && (
                    <BrokerLegend
                        title="Top 5 Sellers"
                        brokers={top5SellBrokers}
                      colorReferenceBrokers={selectedBrokers}
                      brokerVisibility={brokerVisibility}
                      onToggleVisibility={handleToggleBrokerVisibility}
                      onRemoveBroker={removeBroker}
                      onRemoveAll={removeAllTop5Sell}
                    />
                    )}
                    {brokerSelectionMode.custom && customBrokers.length > 0 && (
                      <BrokerLegend
                        title="Selected Brokers"
                        brokers={customBrokers}
                        colorReferenceBrokers={selectedBrokers}
                        brokerVisibility={brokerVisibility}
                        onToggleVisibility={handleToggleBrokerVisibility}
                        onRemoveBroker={removeBroker}
                        onRemoveAll={removeAllCustom}
                      />
                    )}
                  </div>
                </div>
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
              <CardContent>
                <div className="flex flex-col lg:flex-row gap-4">
                  <div className="flex-1 relative">
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
                    {!isLoadingData && !isLoadingInventoryData && inventoryData.length > 0 && selectedBrokers.length > 0 && visibleBrokers.length === 0 && (
                      <div className="flex items-center justify-center h-80 text-muted-foreground">
                        <div className="text-center">
                          <p>No visible brokers</p>
                          <p className="text-xs mt-2">Enable broker visibility in the legend to view chart</p>
                        </div>
                      </div>
                    )}
                    {!isLoadingData && !isLoadingInventoryData && inventoryData.length > 0 && selectedBrokers.length > 0 && visibleBrokers.length > 0 && (
                      <InventoryChart
                        key={`inventory-split-${visibleBrokers.join('-')}`}
                        inventoryData={inventoryData}
                        selectedBrokers={selectedBrokers}
                        displayBrokers={visibleBrokers}
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
                  </div>
                  <div className="w-full lg:w-64 flex flex-col gap-4">
                    {brokerSelectionMode.top5buy && top5BuyBrokers.length > 0 && (
                    <BrokerLegend
                        title="Top 5 Buyers"
                        brokers={top5BuyBrokers}
                      colorReferenceBrokers={selectedBrokers}
                      brokerVisibility={brokerVisibility}
                      onToggleVisibility={handleToggleBrokerVisibility}
                      onRemoveBroker={removeBroker}
                      onRemoveAll={removeAllTop5Buy}
                    />
                    )}
                    {brokerSelectionMode.top5sell && top5SellBrokers.length > 0 && (
                    <BrokerLegend
                        title="Top 5 Sellers"
                        brokers={top5SellBrokers}
                      colorReferenceBrokers={selectedBrokers}
                      brokerVisibility={brokerVisibility}
                      onToggleVisibility={handleToggleBrokerVisibility}
                      onRemoveBroker={removeBroker}
                      onRemoveAll={removeAllTop5Sell}
                    />
                    )}
                    {brokerSelectionMode.custom && customBrokers.length > 0 && (
                      <BrokerLegend
                        title="Selected Brokers"
                        brokers={customBrokers}
                        colorReferenceBrokers={selectedBrokers}
                        brokerVisibility={brokerVisibility}
                        onToggleVisibility={handleToggleBrokerVisibility}
                        onRemoveBroker={removeBroker}
                        onRemoveAll={removeAllCustom}
                      />
                    )}
                  </div>
                </div>
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
                <CardContent>
                  <div className="flex flex-col lg:flex-row gap-4">
                    <div className="flex-1 relative">
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
                    
                    {selectedBrokers.length === 0 && !isLoadingData && !isLoadingInventoryData && (
                      <div className="flex items-center justify-center h-[600px] text-muted-foreground">
                        <div className="text-center">
                          <p>No brokers selected</p>
                          <p className="text-xs mt-2">Select brokers above to view chart</p>
                        </div>
                      </div>
                    )}
                    
                    {selectedBrokers.length > 0 && visibleBrokers.length === 0 && !isLoadingData && !isLoadingInventoryData && (
                      <div className="flex items-center justify-center h-[600px] text-muted-foreground">
                        <div className="text-center">
                          <p>No visible brokers</p>
                          <p className="text-xs mt-2">Enable broker visibility in the legend to view chart</p>
                        </div>
                      </div>
                    )}
                    
                    {selectedBrokers.length > 0 && visibleBrokers.length > 0 && (
                    <TradingViewChart
                        key={`brokers-${visibleBrokers.join('-')}`}
                      candlestickData={candlestickData}
                      inventoryData={inventoryData}
                      selectedBrokers={selectedBrokers}
                      displayBrokers={visibleBrokers}
                      title={`${selectedTicker} Inventory Analysis`}
                      volumeData={volumeDataForCharts}
                    />
                    )}
                    </div>
                    <div className="w-full lg:w-64 flex flex-col gap-4">
                      {brokerSelectionMode.top5buy && top5BuyBrokers.length > 0 && (
                      <BrokerLegend
                          title="Top 5 Buyers"
                          brokers={top5BuyBrokers}
                        colorReferenceBrokers={selectedBrokers}
                        brokerVisibility={brokerVisibility}
                        onToggleVisibility={handleToggleBrokerVisibility}
                        onRemoveBroker={removeBroker}
                      />
                      )}
                      {brokerSelectionMode.top5sell && top5SellBrokers.length > 0 && (
                      <BrokerLegend
                          title="Top 5 Sellers"
                          brokers={top5SellBrokers}
                        colorReferenceBrokers={selectedBrokers}
                        brokerVisibility={brokerVisibility}
                        onToggleVisibility={handleToggleBrokerVisibility}
                        onRemoveBroker={removeBroker}
                      />
                      )}
                      {brokerSelectionMode.custom && customBrokers.length > 0 && (
                        <BrokerLegend
                          title="Selected Brokers"
                          brokers={customBrokers}
                          colorReferenceBrokers={selectedBrokers}
                          brokerVisibility={brokerVisibility}
                          onToggleVisibility={handleToggleBrokerVisibility}
                          onRemoveBroker={removeBroker}
                        />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

              {/* Top Brokers Table - Only show when data is ready */}
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
            </>
          )}

        </div>
      </div>
    </div>
  );
});

