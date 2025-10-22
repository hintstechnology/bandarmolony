import { useState, useEffect, useRef } from 'react';
import { Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Search, X, Calendar } from 'lucide-react';
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
import { api } from '../../services/api';
import { toast } from 'sonner';

// Mock data removed - now using real data from API

// Mock data untuk money flow - convert to TradingView format with proper dates
const moneyFlowData = [
  { time: '2024-01-01' as any, moneyFlow: 1200, inflow: 8000, outflow: 6800 },
  { time: '2024-01-02' as any, moneyFlow: 1800, inflow: 9500, outflow: 7700 },
  { time: '2024-01-03' as any, moneyFlow: -600, inflow: 6000, outflow: 6600 },
  { time: '2024-01-04' as any, moneyFlow: 1400, inflow: 8500, outflow: 7100 },
  { time: '2024-01-05' as any, moneyFlow: 2500, inflow: 11000, outflow: 8500 },
  { time: '2024-01-08' as any, moneyFlow: 3500, inflow: 13000, outflow: 9500 },
  { time: '2024-01-09' as any, moneyFlow: 3000, inflow: 12000, outflow: 9000 },
  { time: '2024-01-10' as any, moneyFlow: 4200, inflow: 14000, outflow: 9800 },
  { time: '2024-01-11' as any, moneyFlow: 5000, inflow: 15000, outflow: 10000 },
  { time: '2024-01-12' as any, moneyFlow: 5500, inflow: 16000, outflow: 10500 },
  { time: '2024-01-15' as any, moneyFlow: 6000, inflow: 17000, outflow: 11000 },
  { time: '2024-01-16' as any, moneyFlow: 6500, inflow: 18000, outflow: 11500 },
];

// Mock data removed - now using real holding data from API

// Individual chart component for split view
const IndividualChart = ({ 
  data, 
  chartType, 
  color, 
  height = 200 
}: { 
  data: any[], 
  chartType: 'candlestick' | 'histogram' | 'line', 
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
          const year = date.getFullYear().toString().slice(-2); // Get last 2 digits
          return `${day} ${month} ${year}`;
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
      } else if (chartType === 'line') {
        const lineSeries = chartRef.current.addSeries(LineSeries, {
          color: color || '#3b82f6',
          lineWidth: 2,
          priceFormat: { type: 'volume' },
        });

        lineSeries.setData(data.map(d => ({
          time: d.time,
          value: d.value || d.moneyFlow || d.volume,
        })));
      } else {
        const histogramSeries = chartRef.current.addSeries(HistogramSeries, {
          color: color || '#3b82f6',
          priceFormat: { type: 'volume' },
        });

        histogramSeries.setData(data.map(d => ({
          time: d.time,
          value: d.value || d.moneyFlow || d.volume,
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
  moneyFlowData, 
  volumeData 
}: { 
  candlestickData: any[], 
  moneyFlowData: any[], 
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
    
    // Create chart with panes configuration
    chartRef.current = createChart(el, {
      width,
      height,
      layout: { 
        background: { type: ColorType.Solid, color: 'transparent' }, 
        textColor: colors.axisTextColor,
        panes: {
          separatorColor: colors.separatorColor,
          separatorHoverColor: colors.separatorHoverColor,
          enableResize: true,
        }
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
          const year = date.getFullYear().toString().slice(-2); // Get last 2 digits
          return `${day} ${month} ${year}`;
        }
      },
        crosshair: { mode: CrosshairMode.Normal },
      });

    if (!candlestickData.length) return;

    try {
      // Pane 0 (Main): Price Action - Candlestick Chart
      const candlestickSeries = chartRef.current?.addSeries(CandlestickSeries, {
        upColor: userColors.bullish,
        downColor: userColors.bearish,
        borderVisible: false,
        wickUpColor: userColors.bullish,
        wickDownColor: userColors.bearish,
      }, 0); // Pane index 0

      candlestickSeries?.setData(candlestickData.map(d => ({
        time: d.time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      })));

      // Pane 1: Money Flow Analysis
      const moneyFlowSeries = chartRef.current?.addSeries(LineSeries, {
        color: '#3b82f6',
        lineWidth: 2,
        priceFormat: { type: 'volume' },
      }, 1); // Pane index 1

      moneyFlowSeries?.setData(moneyFlowData.map(d => ({
        time: d.time,
        value: d.moneyFlow,
      })));

      // Pane 2: Volume Analysis
      const volumeSeries = chartRef.current?.addSeries(HistogramSeries, {
        color: '#8b5cf6',
        priceFormat: { type: 'volume' },
      }, 2); // Pane index 2

      volumeSeries?.setData(volumeData.map(d => ({
        time: d.time,
        value: d.volume,
        color: d.buyVolume > d.sellVolume ? userColors.bullish : userColors.bearish,
      })));

      // Force separate panes by setting heights
      setTimeout(() => {
        const panes = chartRef.current?.panes();
        if (panes && panes.length >= 3) {
          // Set pane heights - 6:1:1 ratio (Price:Money Flow:Volume) - Fixed ratio
          panes[0]?.setHeight(450); // Main price chart - 6 parts (64.3%)
          panes[1]?.setHeight(125); // Money flow - 1 part (17.9%) - Tidak gepeng
          panes[2]?.setHeight(125); // Volume - 1 part (17.9%) - Tidak gepeng
        }
      }, 200);

      chartRef.current.timeScale().fitContent();
    } catch (e) {
      console.error('Multi-pane chart render error:', e);
    }
  }, [candlestickData, moneyFlowData, volumeData, userColors]);

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
    <div className="h-[700px] w-full relative">
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
      
      {/* Y-axis titles - positioned for 6:1:1 ratio yang fixed */}
      <div className="absolute -left-4 top-45 text-sm font-bold text-muted-foreground transform -rotate-90 origin-left whitespace-nowrap z-10">
        Price
      </div>
      <div className="absolute -left-4 top-120 text-sm font-bold text-muted-foreground transform -rotate-90 origin-left whitespace-nowrap z-10">
        Money Flow
      </div>
      <div className="absolute -left-4 top-155 text-sm font-bold text-muted-foreground transform -rotate-90 origin-left whitespace-nowrap z-10">
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

export function StoryMarketParticipant() {
  const [selectedStock, setSelectedStock] = useState('BBRI');
  const [stockInput, setStockInput] = useState('BBRI');
  const [showStockSuggestions, setShowStockSuggestions] = useState(false);
  const [layoutMode, setLayoutMode] = useState<'split' | 'combined'>('combined');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

  // Real data state
  const [candlestickDataReal, setCandlestickDataReal] = useState<any[]>([]);
  const [moneyFlowDataReal, setMoneyFlowDataReal] = useState<any[]>([]);
  const [volumeDataReal, setVolumeDataReal] = useState<any[]>([]);
  const [foreignFlowDataReal, setForeignFlowDataReal] = useState<any[]>([]);
  const [holdingDataReal, setHoldingDataReal] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // UI enhancements
  const [availableStocks, setAvailableStocks] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [tempDateRange, setTempDateRange] = useState({ start: '', end: '' });
  const [dataLimit, setDataLimit] = useState(100);
  
  // Cache
  const cacheRef = useRef<Map<string, { data: any; timestamp: number }>>(new Map());
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  const stocks = ['BBRI', 'BBCA', 'BMRI', 'BBNI', 'TLKM', 'ASII', 'UNVR', 'GGRM', 'ICBP', 'INDF', 'KLBF', 'ADRO', 'ANTM', 'ITMG', 'PTBA', 'SMGR', 'INTP', 'WIKA', 'WSKT', 'PGAS'];

  const handleStockSelect = (stock: string) => {
    setStockInput(stock);
    setSelectedStock(stock);
    setShowStockSuggestions(false);
  };

  const handleStockInputChange = (value: string) => {
    setStockInput(value.toUpperCase());
    setShowStockSuggestions(true);
    // Auto-select if exact match
    if (stocks.includes(value.toUpperCase())) {
      setSelectedStock(value.toUpperCase());
    }
  };

  // Check cache
  const getCachedData = (key: string) => {
    const cached = cacheRef.current.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }
    return null;
  };

  // Set cache
  const setCachedData = (key: string, data: any) => {
    cacheRef.current.set(key, { data, timestamp: Date.now() });
  };

  // Fetch real data from API with caching
  const fetchStockData = async (stockCode: string) => {
    try {
      setLoading(true);
      
      // Check cache first
      const cacheKey = `${stockCode}_${dateRange.start}_${dateRange.end}_${dataLimit}`;
      const cachedData = getCachedData(cacheKey);
      
      if (cachedData) {
        console.log('📦 Using cached data for', stockCode);
        setCandlestickDataReal(cachedData.ohlcData);
        setVolumeDataReal(cachedData.volumeData);
        setMoneyFlowDataReal(cachedData.mfiData);
        setForeignFlowDataReal(cachedData.foreignData);
        setHoldingDataReal(cachedData.holdingData || []);
        setLoading(false);
        return;
      }
      
      // Fetch OHLC data
      const ohlcResponse = await api.getStockData(stockCode, dateRange.start, dateRange.end, dataLimit);
      let ohlcData: any[] = [];
      let volumeData: any[] = [];
      
      if (ohlcResponse.success && ohlcResponse.data?.data) {
        ohlcData = ohlcResponse.data.data.map((row: any) => ({
          time: row.Date as any, // Format: YYYY-MM-DD
          open: row.Open,
          high: row.High,
          low: row.Low,
          close: row.Close,
          volume: row.Volume
        }));
        setCandlestickDataReal(ohlcData);
        
        // Extract volume data
        volumeData = ohlcData.map((item: any) => ({
          time: item.time,
          volume: item.volume,
          buyVolume: item.volume * 0.6, // Mock buy/sell split (we don't have this data yet)
          sellVolume: item.volume * 0.4
        }));
        setVolumeDataReal(volumeData);
      } else {
        toast.error(`Failed to fetch OHLC data for ${stockCode}`);
        setCandlestickDataReal([]);
        setVolumeDataReal([]);
      }
      
      // Fetch Money Flow data
      const moneyFlowResponse = await api.getMoneyFlowData(stockCode, dataLimit);
      let mfiData: any[] = [];
      
      if (moneyFlowResponse.success && moneyFlowResponse.data?.data) {
        mfiData = moneyFlowResponse.data.data.map((row: any) => ({
          time: row.Date as any,
          moneyFlow: row.MFI, // MFI value (0-100)
          inflow: row.MFI > 50 ? row.MFI * 100 : 0, // Mock inflow/outflow
          outflow: row.MFI < 50 ? (100 - row.MFI) * 100 : 0
        }));
        setMoneyFlowDataReal(mfiData);
      } else {
        console.warn(`No money flow data for ${stockCode}`);
        setMoneyFlowDataReal([]);
      }
      
      // Fetch Foreign Flow data
      const foreignFlowResponse = await api.getForeignFlowData(stockCode, dataLimit);
      let foreignData: any[] = [];
      
      if (foreignFlowResponse.success && foreignFlowResponse.data?.data) {
        foreignData = foreignFlowResponse.data.data.map((row: any) => ({
          time: row.Date as any,
          buyVol: row.BuyVol,
          sellVol: row.SellVol,
          netBuyVol: row.NetBuyVol
        }));
        setForeignFlowDataReal(foreignData);
        console.log(`✅ Foreign flow data loaded: ${foreignData.length} records`);
      } else {
        console.warn(`No foreign flow data for ${stockCode}`);
        setForeignFlowDataReal([]);
      }
      
      // Fetch Holding/Shareholding data
      const holdingResponse = await api.getHoldingData(stockCode, dataLimit);
      let holdingData: any[] = [];
      
      if (holdingResponse.success && holdingResponse.data?.data) {
        holdingData = holdingResponse.data.data;
        setHoldingDataReal(holdingData);
        console.log(`✅ Holding data loaded: ${holdingData.length} records`);
      } else {
        console.warn(`No holding data for ${stockCode}`);
        setHoldingDataReal([]);
      }
      
      // Cache the data
      setCachedData(cacheKey, {
        ohlcData,
        volumeData,
        mfiData,
        foreignData,
        holdingData
      });
      
    } catch (error) {
      console.error('Error fetching stock data:', error);
      toast.error('Failed to fetch stock data');
    } finally {
      setLoading(false);
    }
  };

  // Load available stocks on mount
  useEffect(() => {
    const loadStocks = async () => {
      try {
        const response = await api.getStockList();
        if (response.success && response.data?.stocks) {
          setAvailableStocks(response.data.stocks);
        }
      } catch (error) {
        console.error('Failed to load stock list:', error);
      }
    };
    loadStocks();
  }, []);

  // Fetch data when selected stock or limit changes (date range controlled by Apply button)
  useEffect(() => {
    if (selectedStock) {
      fetchStockData(selectedStock);
    }
  }, [selectedStock, dataLimit]);
  
  // Separate effect for date range changes
  useEffect(() => {
    if (selectedStock && (dateRange.start || dateRange.end)) {
      fetchStockData(selectedStock);
    }
  }, [dateRange.start, dateRange.end]);

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

  // Use available stocks from API or fallback to default
  const stockList = availableStocks.length > 0 ? availableStocks : stocks;
  const filteredStocksFromAPI = stockList.filter(stock => 
    stock.toLowerCase().includes(stockInput.toLowerCase())
  );
  const MAX_DISPLAYED = 10;
  const hasMore = filteredStocksFromAPI.length > MAX_DISPLAYED;
  const displayedStocks = filteredStocksFromAPI.slice(0, MAX_DISPLAYED);
  const moreCount = filteredStocksFromAPI.length - MAX_DISPLAYED;

  return (
    <div className="space-y-4">
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
                    Available stocks: {availableStocks.length > 0 ? availableStocks.length : stocks.length}
                  </span>
                </label>
                <div className="relative stock-dropdown-container">
                  <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
                  <input
                    type="text"
                    value={stockInput}
                    onChange={(e) => handleStockInputChange(e.target.value)}
                    onFocus={() => setShowStockSuggestions(true)}
                    onKeyDown={(e) => {
                      if (!showStockSuggestions) setShowStockSuggestions(true);
                      if (e.key === 'ArrowDown' && displayedStocks.length) {
                        e.preventDefault();
                        setHighlightedIndex((prev) => (prev + 1) % displayedStocks.length);
                      } else if (e.key === 'ArrowUp' && displayedStocks.length) {
                        e.preventDefault();
                        setHighlightedIndex((prev) => (prev <= 0 ? displayedStocks.length - 1 : prev - 1));
                      } else if (e.key === 'Enter') {
                        if (highlightedIndex >= 0 && displayedStocks[highlightedIndex]) {
                          handleStockSelect(displayedStocks[highlightedIndex]);
                          setHighlightedIndex(-1);
                        }
                      } else if (e.key === 'Escape') {
                        setShowStockSuggestions(false);
                        setHighlightedIndex(-1);
                      }
                    }}
                    placeholder="Enter stock code..."
                    className="pl-9 pr-10 py-1 h-10 border border-border rounded-md bg-background text-foreground w-full"
                  />
                  {stockInput && (
                    <button
                      onClick={() => {
                        setStockInput('');
                        setShowStockSuggestions(true);
                      }}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 w-6 h-6 flex items-center justify-center hover:bg-muted rounded-full transition-colors z-10"
                    >
                      <X className="w-4 h-4 text-muted-foreground" />
                    </button>
                  )}
                  {showStockSuggestions && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-50 max-h-64 overflow-y-auto">
                      {stockInput === '' && (
                        <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
                          All Stocks
                        </div>
                      )}
                      {displayedStocks.length > 0 ? (
                        <>
                          {displayedStocks.map((stock, idx) => (
                          <div
                            key={stock}
                            onClick={() => handleStockSelect(stock)}
                            onMouseEnter={() => setHighlightedIndex(idx)}
                            onMouseLeave={() => setHighlightedIndex(-1)}
                            className={`px-3 py-2 cursor-pointer text-sm ${idx === highlightedIndex ? 'bg-muted' : 'hover:bg-muted'}`}
                          >
                            {stock}
                          </div>
                          ))}
                          {hasMore && (
                            <div className="px-3 py-2 text-xs text-muted-foreground border-t border-border">
                              +{moreCount} more stocks available
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          No stocks found
                        </div>
                      )}
                    </div>
                  )}
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Layout:</label>
              <div className="flex gap-1 border border-border rounded-lg p-1 h-10">
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

            {/* Row 2: Date Range & Data Limit */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-2">Date Range (optional):</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="date"
                      value={tempDateRange.start}
                      onChange={(e) => setTempDateRange(prev => ({ ...prev, start: e.target.value }))}
                      className="pl-3 pr-9 py-1 h-10 border border-border rounded-md bg-background text-foreground w-full cursor-pointer"
                      placeholder="Start date"
                    />
                    <Calendar className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  </div>
                  <span className="flex items-center text-muted-foreground">to</span>
                  <div className="relative flex-1">
                    <input
                      type="date"
                      value={tempDateRange.end}
                      onChange={(e) => setTempDateRange(prev => ({ ...prev, end: e.target.value }))}
                      className="pl-3 pr-9 py-1 h-10 border border-border rounded-md bg-background text-foreground w-full cursor-pointer"
                      placeholder="End date"
                    />
                    <Calendar className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  </div>
                  <Button
                    onClick={() => setDateRange(tempDateRange)}
                    className="h-10 px-4"
                    variant="default"
                  >
                    Apply Date
                  </Button>
                </div>
              </div>
              
              <div className="w-full sm:w-48">
                <label className="block text-sm font-medium mb-2">Data Points:</label>
                <select
                  value={dataLimit}
                  onChange={(e) => setDataLimit(Number(e.target.value))}
                  className="w-full h-10 px-3 border border-border rounded-md bg-background text-foreground"
                >
                  <option value={30}>Last 30 days</option>
                  <option value={60}>Last 60 days</option>
                  <option value={100}>Last 100 days</option>
                  <option value={200}>Last 200 days</option>
                  <option value={365}>Last 1 year</option>
                </select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Chart Layout */}
      <div className="space-y-4">
        {loading ? (
          <Card>
            <CardContent className="p-12 text-center">
              <div className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                <p className="text-muted-foreground">Loading data for {selectedStock}...</p>
              </div>
            </CardContent>
          </Card>
        ) : candlestickDataReal.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-muted-foreground">No data available for {selectedStock}</p>
            </CardContent>
          </Card>
        ) : layoutMode === 'combined' ? (
          /* Combined TradingView Chart with Multiple Panes */
          <Card>
            <CardHeader>
              <CardTitle>{selectedStock} - Market Analysis</CardTitle>
              <p className="text-sm text-muted-foreground">Price action, money flow, and volume analysis</p>
            </CardHeader>
            <CardContent>
              <TradingViewMultiPaneChart 
                candlestickData={candlestickDataReal}
                moneyFlowData={moneyFlowDataReal.length > 0 ? moneyFlowDataReal : moneyFlowData}
                volumeData={volumeDataReal}
              />
            </CardContent>
          </Card>
        ) : (
          /* Split View - Individual Charts */
          <div className="space-y-4">
            {/* Price Chart */}
            <Card>
              <CardHeader>
                <CardTitle>{selectedStock} - Price Action</CardTitle>
                <p className="text-sm text-muted-foreground">Candlestick chart showing price movement</p>
              </CardHeader>
              <CardContent>
                <IndividualChart 
                  data={candlestickDataReal}
                  chartType="candlestick"
                  height={300}
                />
              </CardContent>
            </Card>

            {/* Money Flow Chart */}
        <Card>
          <CardHeader>
                <CardTitle>{selectedStock} - Money Flow Index (MFI)</CardTitle>
                <p className="text-sm text-muted-foreground">MFI indicator (0-100): &lt;20 Oversold, &gt;80 Overbought</p>
          </CardHeader>
          <CardContent>
                <IndividualChart 
                  data={(moneyFlowDataReal.length > 0 ? moneyFlowDataReal : moneyFlowData).map(d => ({
                    time: d.time,
                    value: d.moneyFlow
                  }))}
                  chartType="line"
                  color="#3b82f6"
                  height={200}
                />
          </CardContent>
        </Card>

            {/* Volume Chart */}
            <Card>
              <CardHeader>
                <CardTitle>{selectedStock} - Volume</CardTitle>
                <p className="text-sm text-muted-foreground">Trading volume analysis</p>
              </CardHeader>
              <CardContent>
                <IndividualChart 
                  data={volumeDataReal.map(d => ({
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

        {/* Stacked Bar Charts Section */}
        <div className="space-y-4">
          {/* Foreign Flow Chart */}
          {foreignFlowDataReal.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{selectedStock} - Foreign Flow Analysis</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Foreign investor buying and selling activity. Positive net = Foreign net buy (bullish), Negative net = Foreign net sell (bearish)
                </p>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={foreignFlowDataReal} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis 
                        dataKey="time" 
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <YAxis 
                        yAxisId="left"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                        label={{ value: 'Volume', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
                      />
                      <YAxis 
                        yAxisId="right"
                        orientation="right"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                        label={{ value: 'Net Buy Volume', angle: 90, position: 'insideRight', style: { fontSize: 12 } }}
                      />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: 'hsl(var(--popover))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px',
                          fontSize: '12px'
                        }}
                      />
                      <Legend />
                      <Bar yAxisId="left" dataKey="buyVol" fill="#10b981" name="Foreign Buy" />
                      <Bar yAxisId="left" dataKey="sellVol" fill="#ef4444" name="Foreign Sell" />
                      <Line 
                        yAxisId="right" 
                        type="monotone" 
                        dataKey="netBuyVol" 
                        stroke="#3b82f6" 
                        strokeWidth={2}
                        name="Net Buy Volume"
                        dot={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Local Market Participants Stacked Chart */}
        {holdingDataReal.length > 0 && (
        <Card>
          <CardHeader>
              <CardTitle>{selectedStock} - Local Market Participants Breakdown</CardTitle>
              <p className="text-sm text-muted-foreground">Local investor types distribution over time (percentage ownership)</p>
          </CardHeader>
          <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={holdingDataReal.map(row => ({
                      date: row.date,
                      Corporate: row['local_Corporate_inPercent'] || 0,
                      'Financial Institution': row['local_Financial Institution_inPercent'] || 0,
                      Individual: row['local_Individual_inPercent'] || 0,
                      Insurance: row['local_Insurance_inPercent'] || 0,
                      'Mutual Fund': row['local_Mutual Fund_inPercent'] || 0,
                      Others: row['local_Others_inPercent'] || 0,
                      'Pension Fund': row['local_Pension Fund_inPercent'] || 0,
                      'Securities Company': row['local_Securities Company_inPercent'] || 0
                    }))} 
                    margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis 
                      dataKey="date" 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px',
                        fontSize: '12px'
                      }}
                      formatter={(value: any) => [`${parseFloat(value).toFixed(2)}%`, '']}
                    />
                    <Bar dataKey="Corporate" stackId="local" fill="#3b82f6" name="Corporate" />
                    <Bar dataKey="Financial Institution" stackId="local" fill="#8b5cf6" name="Financial Institution" />
                    <Bar dataKey="Individual" stackId="local" fill="#10b981" name="Individual" />
                    <Bar dataKey="Insurance" stackId="local" fill="#f59e0b" name="Insurance" />
                    <Bar dataKey="Mutual Fund" stackId="local" fill="#ef4444" name="Mutual Fund" />
                    <Bar dataKey="Others" stackId="local" fill="#6b7280" name="Others" />
                    <Bar dataKey="Pension Fund" stackId="local" fill="#84cc16" name="Pension Fund" />
                    <Bar dataKey="Securities Company" stackId="local" fill="#f97316" name="Securities Company" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
          </CardContent>
        </Card>
        )}

          {/* Foreign Market Participants Stacked Chart */}
        {holdingDataReal.length > 0 && (
        <Card>
          <CardHeader>
              <CardTitle>{selectedStock} - Foreign Market Participants Breakdown</CardTitle>
              <p className="text-sm text-muted-foreground">Foreign investor types distribution over time (percentage ownership)</p>
          </CardHeader>
          <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={holdingDataReal.map(row => ({
                      date: row.date,
                      Corporate: row['foreign_Corporate_inPercent'] || 0,
                      'Financial Institution': row['foreign_Financial Institution_inPercent'] || 0,
                      Individual: row['foreign_Individual_inPercent'] || 0,
                      Insurance: row['foreign_Insurance_inPercent'] || 0,
                      'Mutual Fund': row['foreign_Mutual Fund_inPercent'] || 0,
                      Others: row['foreign_Others_inPercent'] || 0,
                      'Pension Fund': row['foreign_Pension Fund_inPercent'] || 0,
                      'Securities Company': row['foreign_Securities Company_inPercent'] || 0
                    }))} 
                    margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis 
                      dataKey="date" 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px',
                        fontSize: '12px'
                      }}
                      formatter={(value: any) => [`${parseFloat(value).toFixed(2)}%`, '']}
                    />
                    <Bar dataKey="Corporate" stackId="foreign" fill="#3b82f6" name="Corporate" />
                    <Bar dataKey="Financial Institution" stackId="foreign" fill="#8b5cf6" name="Financial Institution" />
                    <Bar dataKey="Individual" stackId="foreign" fill="#10b981" name="Individual" />
                    <Bar dataKey="Insurance" stackId="foreign" fill="#f59e0b" name="Insurance" />
                    <Bar dataKey="Mutual Fund" stackId="foreign" fill="#ef4444" name="Mutual Fund" />
                    <Bar dataKey="Others" stackId="foreign" fill="#6b7280" name="Others" />
                    <Bar dataKey="Pension Fund" stackId="foreign" fill="#84cc16" name="Pension Fund" />
                    <Bar dataKey="Securities Company" stackId="foreign" fill="#f97316" name="Securities Company" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
          </CardContent>
        </Card>
        )}

          {/* Combined Local vs Foreign Chart */}
          {holdingDataReal.length > 0 && (
          <Card>
            <CardHeader>
                <CardTitle>{selectedStock} - Local vs Foreign Market Comparison</CardTitle>
                <p className="text-sm text-muted-foreground">Total local vs foreign ownership over time (percentage)</p>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart 
                      data={holdingDataReal.map(row => ({
                        date: row.date,
                        Local: row['local_total_inPercent'] || 0,
                        Foreign: row['foreign_total_inPercent'] || 0
                      }))} 
                      margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
                    >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis 
                      dataKey="date" 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px',
                        fontSize: '12px'
                      }}
                        formatter={(value: any) => [`${parseFloat(value).toFixed(2)}%`, '']}
                    />
                    <Bar dataKey="Local" stackId="combined" fill="#3b82f6" name="Local" />
                    <Bar dataKey="Foreign" stackId="combined" fill="#f59e0b" name="Foreign" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          )}
        </div>
      </div>
    </div>
  );
}
