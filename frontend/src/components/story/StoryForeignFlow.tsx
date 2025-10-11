import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Calendar, TrendingUp, TrendingDown, Users, Globe, Building2, Briefcase, ArrowUpDown, ChevronDown, X } from 'lucide-react';
import { createChart, IChartApi, ISeriesApi, ColorType, LineStyle, CandlestickData, HistogramData, CandlestickSeries, HistogramSeries, CrosshairMode, PriceScaleMode } from 'lightweight-charts';
import { useUserChartColors } from '../../hooks/useUserChartColors';

// Data interfaces
interface PriceData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ForeignFlowData {
  time: string;
  netBuy: number;
  netValue: number;
  buyVolume: number;
  sellVolume: number;
  flowStrength: number;
}

interface VolumeData {
  time: string;
  volume: number;
  value: number;
}

// Mock data generation functions
const generatePriceData = (ticker: string, timeframe: string): PriceData[] => {
  const data: PriceData[] = [];
  const now = new Date();
  
  // Calculate number of candles based on timeframe
  let numCandles: number;
  let candleInterval: number; // days per candle
  
  switch (timeframe) {
    case '1D':
      numCandles = 30; // 30 days of daily candles
      candleInterval = 1;
      break;
    case '5D':
      numCandles = 24; // 24 weeks of 5-day candles
      candleInterval = 5;
      break;
    case '1M':
      numCandles = 12; // 12 months of monthly candles
      candleInterval = 30;
      break;
    case '3M':
      numCandles = 8; // 8 quarters of 3-month candles
      candleInterval = 90;
      break;
    case '6M':
      numCandles = 4; // 4 half-years of 6-month candles
      candleInterval = 180;
      break;
    case '1Y':
      numCandles = 3; // 3 years of yearly candles
      candleInterval = 365;
      break;
    default:
      numCandles = 30;
      candleInterval = 1;
  }
  
  let basePrice = 1000;
  
  for (let i = numCandles - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - (i * candleInterval));
    
    // Generate realistic OHLC data
    const volatility = 0.02 * Math.sqrt(candleInterval); // Higher volatility for longer timeframes
    const trend = Math.sin(i * 0.1) * 0.01; // Slight trend
    
    const open = basePrice;
    const high = open + Math.random() * volatility * open + trend * open;
    const low = open - Math.random() * volatility * open + trend * open;
    const close = low + Math.random() * (high - low);
    
    // Update base price for next candle
    basePrice = close;
    
    data.push({
      time: date.toISOString().split('T')[0],
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume: Math.floor(Math.random() * 1000000 * candleInterval) + 100000,
    });
  }
  
  return data;
};

const generateForeignFlowData = (ticker: string, timeframe: string): ForeignFlowData[] => {
  const data: ForeignFlowData[] = [];
  const now = new Date();
  
  // Calculate number of data points based on timeframe
  let numPoints: number;
  let interval: number; // days per data point
  
  switch (timeframe) {
    case '1D':
      numPoints = 30;
      interval = 1;
      break;
    case '5D':
      numPoints = 24;
      interval = 5;
      break;
    case '1M':
      numPoints = 12;
      interval = 30;
      break;
    case '3M':
      numPoints = 8;
      interval = 90;
      break;
    case '6M':
      numPoints = 4;
      interval = 180;
      break;
    case '1Y':
      numPoints = 3;
      interval = 365;
      break;
    default:
      numPoints = 30;
      interval = 1;
  }
  
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

const generateVolumeData = (ticker: string, timeframe: string): VolumeData[] => {
  const data: VolumeData[] = [];
  const now = new Date();
  
  // Calculate number of data points based on timeframe
  let numPoints: number;
  let interval: number; // days per data point
  
  switch (timeframe) {
    case '1D':
      numPoints = 30;
      interval = 1;
      break;
    case '5D':
      numPoints = 24;
      interval = 5;
      break;
    case '1M':
      numPoints = 12;
      interval = 30;
      break;
    case '3M':
      numPoints = 8;
      interval = 90;
      break;
    case '6M':
      numPoints = 4;
      interval = 180;
      break;
    case '1Y':
      numPoints = 3;
      interval = 365;
      break;
    default:
      numPoints = 30;
      interval = 1;
  }
  
  for (let i = numPoints - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - (i * interval));
    
    data.push({
      time: date.toISOString().split('T')[0],
      volume: Math.floor(Math.random() * 2000000 * interval) + 200000,
      value: Math.floor(Math.random() * 1000000000 * interval) + 100000000,
    });
  }
  
  return data;
};

// Individual chart component for split view
const IndividualChart = ({ 
  data, 
  chartType, 
  title, 
  color, 
  height = 200 
}: { 
  data: any[], 
  chartType: 'candlestick' | 'histogram', 
  title: string,
  color?: string,
  height?: number
}) => {
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

    if (!data.length) return;

    try {
      if (chartType === 'candlestick') {
        const candlestickSeries = chartRef.current.addSeries(CandlestickSeries, {
          upColor: userColors.bullish,
          downColor: userColors.bearish,
          borderVisible: false,
          wickUpColor: userColors.bullish,
          wickDownColor: userColors.bearish,
        });

        candlestickSeries.setData(data.map(d => ({
          time: d.time,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        })));
      } else {
        const histogramSeries = chartRef.current.addSeries(HistogramSeries, {
          color: color || '#3b82f6',
          priceFormat: { type: 'volume' },
        });

        histogramSeries.setData(data.map(d => ({
          time: d.time,
          value: d.value || d.netBuy || d.volume,
          color: d.color || (d.value >= 0 ? userColors.bullish : userColors.bearish),
        })));
      }

      chartRef.current.timeScale().fitContent();
    } catch (e) {
      console.error('Individual chart render error:', e);
    }
  }, [data, chartType, color, height, userColors]);

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
    <div className="w-full relative">
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
      <div ref={containerRef} className="w-full" style={{ height: `${height}px` }} />
    </div>
  );
};

// TradingView-style chart with multiple panes
const TradingViewMultiPaneChart = ({ 
  candlestickData, 
  foreignFlowData, 
  volumeData 
}: { 
  candlestickData: any[], 
  foreignFlowData: any[], 
  volumeData: any[] 
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
      axisTextColor: isDark ? '#d1d5db' : '#6b7280',
      separatorColor: isDark ? '#4b5563' : '#e5e7eb',
      separatorHoverColor: isDark ? '#6b7280' : '#d1d5db'
    };
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Clean up existing chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }
    
    const width = el.clientWidth || 800;
    const height = el.clientHeight || 650;
    const colors = getThemeColors();
    
    // Create chart with separate panes
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

    if (!candlestickData.length) return;

    try {
      // Pane 0 (Main): Price Action - Candlestick Chart
      const candlestickSeries = chartRef.current.addSeries(CandlestickSeries, {
        upColor: userColors.bullish,
        downColor: userColors.bearish,
        borderVisible: false,
        wickUpColor: userColors.bullish,
        wickDownColor: userColors.bearish,
      }, 0); // Pane index 0

      candlestickSeries.setData(candlestickData.map(d => ({
        time: d.time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      })));

      // Pane 1: Foreign Flow Analysis
      const foreignFlowSeries = chartRef.current.addSeries(HistogramSeries, {
        color: '#3b82f6',
        priceFormat: { type: 'volume' },
      }, 1); // Pane index 1

      foreignFlowSeries.setData(foreignFlowData.map(d => ({
        time: d.time,
        value: d.netBuy,
        color: d.netBuy >= 0 ? userColors.bullish : userColors.bearish,
      })));

      // Pane 2: Volume Analysis
      const volumeSeries = chartRef.current.addSeries(HistogramSeries, {
        color: '#8b5cf6',
        priceFormat: { type: 'volume' },
      }, 2); // Pane index 2

      volumeSeries.setData(volumeData.map(d => ({
        time: d.time,
        value: d.volume,
        color: d.buyVolume > d.sellVolume ? userColors.bullish : userColors.bearish,
      })));

      // Force separate panes by setting heights
      setTimeout(() => {
        const panes = chartRef.current?.panes();
        if (panes && panes.length >= 3) {
          // Set pane heights - 5:1:1 ratio (Price:Foreign Flow:Volume) - Price lebih tinggi
          panes[0].setHeight(450); // Main price chart - 5 parts (75%)
          panes[1].setHeight(75); // Foreign flow - 1 part (12.5%)
          panes[2].setHeight(75); // Volume - 1 part (12.5%)
        }
      }, 200);

      chartRef.current.timeScale().fitContent();
    } catch (e) {
      console.error('Multi-pane chart render error:', e);
    }
  }, [candlestickData, foreignFlowData, volumeData, userColors]);

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
      
      {/* Y-axis titles - positioned for 5:1:1 ratio */}
      <div className="absolute -left-4 top-36 text-sm font-bold text-muted-foreground transform -rotate-90 origin-left whitespace-nowrap z-10">
        Price
      </div>
      <div className="absolute -left-4 top-110 text-sm font-bold text-muted-foreground transform -rotate-90 origin-left whitespace-nowrap z-10">
        Foreign Flow
      </div>
      <div className="absolute -left-4 top-140 text-sm font-bold text-muted-foreground transform -rotate-90 origin-left whitespace-nowrap z-10">
        Volume
      </div>
      
      {/* X-axis title */}
      <div className="absolute -bottom-4 left-1/2 transform -translate-x-1/2 text-sm font-bold text-muted-foreground z-10">
        Date
      </div>
      
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
};

export function StoryForeignFlow() {
  const [tickerInput, setTickerInput] = useState('BBCA');
  const [selectedTicker, setSelectedTicker] = useState('BBCA');
  const [showStockSuggestions, setShowStockSuggestions] = useState(false);
  const [layoutMode, setLayoutMode] = useState<'split' | 'combined'>('combined');

  const stocks = ['BBCA', 'BBRI', 'BMRI', 'BBNI', 'TLKM', 'ASII', 'UNVR', 'GGRM', 'ICBP', 'INDF', 'KLBF', 'ADRO', 'ANTM', 'ITMG', 'PTBA', 'SMGR', 'INTP', 'WIKA', 'WSKT', 'PGAS'];

  // Filter stocks based on input
  const filteredStocks = stocks.filter(stock => 
    stock.toLowerCase().includes(tickerInput.toLowerCase())
  );

  const handleStockSelect = (stock: string) => {
    setTickerInput(stock);
    setSelectedTicker(stock);
    setShowStockSuggestions(false);
  };

  const handleStockInputChange = (value: string) => {
    setTickerInput(value.toUpperCase());
    setShowStockSuggestions(true);
    // Auto-select if exact match
    if (stocks.includes(value.toUpperCase())) {
      setSelectedTicker(value.toUpperCase());
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.stock-dropdown-container')) {
        setShowStockSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Generate data based on selected ticker and timeframe
  const priceData = generatePriceData(selectedTicker, '1D');
  const foreignFlowData = generateForeignFlowData(selectedTicker, '1D');
  const volumeData = generateVolumeData(selectedTicker, '1D');

  // Convert to candlestick format for TradingView chart
  const candlestickData = priceData.map(d => ({
    time: d.time as any,
    open: d.open,
    high: d.high,
    low: d.low,
    close: d.close,
    volume: d.volume,
  }));

  // Convert foreign flow data to TradingView format
  const foreignFlowChartData = foreignFlowData.map(d => ({
    time: d.time as any,
    netBuy: d.netBuy,
    netValue: d.netValue,
    buyVolume: d.buyVolume,
    sellVolume: d.sellVolume,
    flowStrength: d.flowStrength,
  }));

  // Convert volume data to TradingView format
  const volumeChartData = volumeData.map(d => ({
    time: d.time as any,
    volume: d.volume,
    value: d.value,
    buyVolume: d.volume * 0.6,
    sellVolume: d.volume * 0.4,
  }));

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <div className="flex items-center gap-2">
                <label className="font-medium">Stock:</label>
                <div className="relative stock-dropdown-container">
                  <input
                    type="text"
                    value={tickerInput}
                    onChange={(e) => handleStockInputChange(e.target.value)}
                    onFocus={() => setShowStockSuggestions(true)}
                    placeholder="Enter stock code..."
                    className="px-3 py-1 border border-border rounded-md bg-background text-foreground w-40"
                  />
                  {showStockSuggestions && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                      {tickerInput === '' ? (
                        <>
                          <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
                            All Stocks
                          </div>
                          {stocks.map(stock => (
                            <div
                              key={stock}
                              onClick={() => handleStockSelect(stock)}
                              className="px-3 py-2 hover:bg-muted cursor-pointer text-sm"
                            >
                              {stock}
                            </div>
                          ))}
                        </>
                      ) : filteredStocks.length > 0 ? (
                        filteredStocks.map(stock => (
                          <div
                            key={stock}
                            onClick={() => handleStockSelect(stock)}
                            className="px-3 py-2 hover:bg-muted cursor-pointer text-sm"
                          >
                            {stock}
                          </div>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          No stocks found
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <label className="font-medium">Layout:</label>
              <div className="flex gap-1">
                <Button
                  variant={layoutMode === 'combined' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setLayoutMode('combined')}
                >
                  Combine
                </Button>
                <Button
                  variant={layoutMode === 'split' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setLayoutMode('split')}
                >
                  Split
                </Button>
              </div>
            </div>
          </div>
          </CardContent>
        </Card>

      {/* Main Chart Layout */}
      <div className="space-y-4">
        {layoutMode === 'combined' ? (
          /* Combined TradingView Chart with Multiple Panes */
            <Card>
              <CardHeader>
              <CardTitle>{selectedTicker} - Foreign Flow Analysis</CardTitle>
              <p className="text-sm text-muted-foreground">Price action, foreign flow, and volume analysis</p>
              </CardHeader>
              <CardContent>
              <TradingViewMultiPaneChart 
                candlestickData={candlestickData}
                foreignFlowData={foreignFlowChartData}
                volumeData={volumeChartData}
              />
              </CardContent>
            </Card>
        ) : (
          /* Split View - Individual Charts */
          <div className="space-y-4">
            {/* Price Chart */}
            <Card>
              <CardHeader>
                <CardTitle>{selectedTicker} - Price Action</CardTitle>
                <p className="text-sm text-muted-foreground">Candlestick chart showing price movement</p>
              </CardHeader>
              <CardContent>
                <IndividualChart 
                  data={candlestickData}
                  chartType="candlestick"
                  title="Price"
                  height={300}
                />
            </CardContent>
          </Card>

            {/* Foreign Flow Chart */}
          <Card>
            <CardHeader>
                <CardTitle>{selectedTicker} - Foreign Flow</CardTitle>
                <p className="text-sm text-muted-foreground">Foreign investor buying and selling activity</p>
            </CardHeader>
            <CardContent>
                <IndividualChart 
                  data={foreignFlowChartData.map(d => ({
                    time: d.time,
                    value: d.netBuy
                  }))}
                  chartType="histogram"
                  title="Foreign Flow"
                  color="#3b82f6"
                  height={200}
                />
            </CardContent>
          </Card>

            {/* Volume Chart */}
          <Card>
            <CardHeader>
                <CardTitle>{selectedTicker} - Volume</CardTitle>
                <p className="text-sm text-muted-foreground">Trading volume analysis</p>
            </CardHeader>
            <CardContent>
                <IndividualChart 
                  data={volumeChartData.map(d => ({
                    time: d.time,
                    value: d.volume
                  }))}
                  chartType="histogram"
                  title="Volume"
                  color="#8b5cf6"
                  height={200}
                />
            </CardContent>
          </Card>
        </div>
        )}
      </div>
    </div>
  );
}