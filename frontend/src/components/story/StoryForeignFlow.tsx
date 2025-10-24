import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { X, Search } from 'lucide-react';
import { createChart, IChartApi, ColorType, CandlestickSeries, HistogramSeries, CrosshairMode } from 'lightweight-charts';
import { useUserChartColors } from '../../hooks/useUserChartColors';
import { api } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';

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

// Backend foreign flow data interface
interface BackendForeignFlowData {
  Date: string;
  BuyVol: number;
  SellVol: number;
  NetBuyVol: number;
}

interface VolumeData {
  time: string;
  volume: number;
  value: number;
}


// Individual chart component for split view
const IndividualChart = ({ 
  data, 
  chartType, 
  color, 
  height = 200 
}: { 
  data: any[], 
  chartType: 'candlestick' | 'histogram', 
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
          panes[0]?.setHeight(450); // Main price chart - 5 parts (75%)
          panes[1]?.setHeight(75); // Foreign flow - 1 part (12.5%)
          panes[2]?.setHeight(75); // Volume - 1 part (12.5%)
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
  const { showToast } = useToast();
  const [selectedTicker, setSelectedTicker] = useState('BBCA');
  const [layoutMode, setLayoutMode] = useState<'split' | 'combined'>('combined');
  
  // Real data states
  const [priceData, setPriceData] = useState<PriceData[]>([]);
  const [foreignFlowData, setForeignFlowData] = useState<ForeignFlowData[]>([]);
  const [volumeData, setVolumeData] = useState<VolumeData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Real stocks from API
  const [availableStocks, setAvailableStocks] = useState<string[]>([]);
  const [stockInput, setStockInput] = useState('BBCA');
  const [showStockSuggestions, setShowStockSuggestions] = useState(false);
  const [highlightedStockIndex, setHighlightedStockIndex] = useState<number>(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fallback stocks if API fails
  const FALLBACK_STOCKS = [
    'BBRI', 'BBCA', 'BMRI', 'BBNI', 'TLKM', 'ASII', 'UNVR', 'GGRM', 'ICBP', 'INDF',
    'KLBF', 'ADRO', 'ANTM', 'ITMG', 'PTBA', 'SMGR', 'INTP', 'WIKA', 'WSKT', 'PGAS',
    'YUPI', 'ZYRX', 'ZONE'
  ];

  // Convert backend foreign flow data to frontend format
  const convertBackendToFrontend = (backendData: BackendForeignFlowData[]): ForeignFlowData[] => {
    return backendData.map(item => ({
      time: item.Date,
      netBuy: item.NetBuyVol,
      netValue: item.NetBuyVol * 1000, // Estimate value (NetBuyVol * average price)
      buyVolume: item.BuyVol,
      sellVolume: item.SellVol,
      flowStrength: Math.abs(item.NetBuyVol) / (item.BuyVol + item.SellVol) * 100 || 0
    }));
  };

  // Load available stocks on component mount
  useEffect(() => {
    const loadAvailableStocks = async () => {
      try {
        // Use the same API as StoryMarketParticipant to get all available stocks
        const response = await api.getStockList();
        if (response.success && response.data?.stocks) {
          setAvailableStocks(response.data.stocks);
        } else {
          setAvailableStocks(FALLBACK_STOCKS);
        }
      } catch (error) {
        console.error('Error loading available stocks:', error);
        setAvailableStocks(FALLBACK_STOCKS);
      }
    };

    loadAvailableStocks();
  }, []);

  // Fetch real data when selected ticker changes
  useEffect(() => {
    const fetchData = async () => {
      if (!selectedTicker) return;

      setLoading(true);
      setError(null);

      try {
        // Fetch stock data (OHLC)
        const stockResponse = await api.getStockData(selectedTicker, undefined, undefined, 30);
        if (stockResponse.success && stockResponse.data?.data) {
          const stockData = stockResponse.data.data.map((item: any) => ({
            time: item.Date,
            open: item.Open,
            high: item.High,
            low: item.Low,
            close: item.Close,
            volume: item.Volume
          }));
          setPriceData(stockData);
        }

        // Fetch foreign flow data
        const foreignFlowResponse = await api.getForeignFlowData(selectedTicker, 30);
        if (foreignFlowResponse.success && foreignFlowResponse.data?.data) {
          const convertedData = convertBackendToFrontend(foreignFlowResponse.data.data);
          setForeignFlowData(convertedData);
        }

        // Generate volume data from stock data
        if (stockResponse.success && stockResponse.data?.data) {
          const volumeData = stockResponse.data.data.map((item: any) => ({
            time: item.Date,
            volume: item.Volume,
            value: item.Volume * item.Close
          }));
          setVolumeData(volumeData);
        }

      } catch (error) {
        console.error('Error fetching data:', error);
        setError('Failed to load data');
        showToast({
          type: 'error',
          title: 'Error',
          message: 'Failed to load data. Please try again.'
        });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedTicker, showToast]);

  // Filter stocks based on input
  const filteredStocks = (availableStocks || []).filter(stock => 
    stock.toLowerCase().includes(stockInput.toLowerCase())
  );

  const handleStockSelect = (stock: string) => {
    setStockInput(stock);
    setSelectedTicker(stock);
    setShowStockSuggestions(false);
    setHighlightedStockIndex(-1);
  };

  const handleStockInputChange = (value: string) => {
    setStockInput(value.toUpperCase());
    setShowStockSuggestions(true);
    setHighlightedStockIndex(-1);
    // Auto-select if exact match
    if (availableStocks.includes(value.toUpperCase())) {
      setSelectedTicker(value.toUpperCase());
    }
  };

  const clearStockInput = () => {
    setStockInput('');
    setShowStockSuggestions(false);
    setHighlightedStockIndex(-1);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setShowStockSuggestions(false);
        setHighlightedStockIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Use real data from state

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
      {/* Loading State */}
      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading foreign flow data...</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error State */}
      {error && (
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <div className="text-center">
              <p className="text-destructive mb-2">Error loading data</p>
              <p className="text-muted-foreground text-sm">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Controls */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4">
            {/* Row 1: Stock Search & Layout */}
            <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-end justify-between">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-2">
                  Stock Search:
                  <span className="ml-2 text-xs text-muted-foreground">
                    Available stocks: {availableStocks.length > 0 ? availableStocks.length : FALLBACK_STOCKS.length}
                  </span>
                </label>
                <div className="relative stock-dropdown-container" ref={dropdownRef}>
                  <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
                  <input
                    type="text"
                    value={stockInput}
                    onChange={(e) => handleStockInputChange(e.target.value)}
                    onFocus={() => setShowStockSuggestions(true)}
                    onKeyDown={(e) => {
                      if (!showStockSuggestions) setShowStockSuggestions(true);
                      if (e.key === 'ArrowDown' && filteredStocks.length) {
                        e.preventDefault();
                        setHighlightedStockIndex((prev) => (prev + 1) % filteredStocks.length);
                      } else if (e.key === 'ArrowUp' && filteredStocks.length) {
                        e.preventDefault();
                        setHighlightedStockIndex((prev) => (prev <= 0 ? filteredStocks.length - 1 : prev - 1));
                      } else if (e.key === 'Enter') {
                        if (highlightedStockIndex >= 0 && filteredStocks[highlightedStockIndex]) {
                          handleStockSelect(filteredStocks[highlightedStockIndex]);
                          setHighlightedStockIndex(-1);
                        }
                      } else if (e.key === 'Escape') {
                        setShowStockSuggestions(false);
                        setHighlightedStockIndex(-1);
                      }
                    }}
                    placeholder="Enter stock code..."
                    className="pl-9 pr-10 py-1 h-10 border border-border rounded-md bg-background text-foreground w-full"
                  />
                  {stockInput && (
                    <button
                      onClick={clearStockInput}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground hover:text-foreground z-10"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  {showStockSuggestions && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                      {stockInput === '' && (
                        <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
                          All Stocks
                        </div>
                      )}
                      {filteredStocks.slice(0, 10).map((stock, idx) => (
                        <div
                          key={`${stock}-${idx}`}
                          onClick={() => handleStockSelect(stock)}
                          onMouseEnter={() => setHighlightedStockIndex(idx)}
                          className={`px-3 py-2 cursor-pointer text-sm ${idx === highlightedStockIndex ? 'bg-muted' : 'hover:bg-muted'}`}
                        >
                          {stock}
                        </div>
                      ))}
                      {filteredStocks.length > 10 && (
                        <div className="px-3 py-2 text-xs text-muted-foreground border-t border-border">
                          +{filteredStocks.length - 10} more
                        </div>
                      )}
                      {filteredStocks.length === 0 && stockInput !== '' && (
                        <div className="px-3 py-2 text-sm text-muted-foreground">No stocks found</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="w-full lg:w-auto">
                <label className="block text-sm font-medium mb-2">Layout:</label>
                <div className="flex gap-1 border border-border rounded-lg p-1 h-10 w-full lg:w-auto">
                  <Button
                    variant={layoutMode === 'combined' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setLayoutMode('combined')}
                    className="flex-1 h-8"
                  >
                    Combine
                  </Button>
                  <Button
                    variant={layoutMode === 'split' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setLayoutMode('split')}
                    className="flex-1 h-8"
                  >
                    Split
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Chart Layout */}
      {!loading && !error && (
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
                  color="#8b5cf6"
                  height={200}
                />
            </CardContent>
          </Card>
          </div>
          )}
        </div>
      )}
    </div>
  );
}
