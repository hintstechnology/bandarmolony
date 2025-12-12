import { useState, useRef, useEffect, useMemo } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Undo2, Search, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../../services/api';

interface AccumulationData {
  symbol: string;
  price: number;
  volume: number;
  suspend: boolean;
  specialNotice: string;
  dates: { [key: string]: number | null }; // W4, W3, W2, W1, D4, D3, D2, D1, D0
  percent1d: number; // Percent1D column
  volumeChanges: { // Volume change columns
    vol1d: number;    // VPercent1D
    vol3d: number;    // VPercent3D
    vol5d: number;    // VPercent5D
    vol10d: number;   // VPercent10D
    vol20d: number;   // VPercent20D
    vol50d: number;   // VPercent50D
    vol100d: number;  // VPercent100D
  };
  movingAverage: { [key: string]: number | null }; // Moving average data
  maIndicators: { // Moving average indicators (v/x)
    ma5: string;     // AboveMA5
    ma10: string;     // AboveMA10
    ma20: string;     // AboveMA20
    ma50: string;     // AboveMA50
    ma100: string;    // AboveMA100
    ma200: string;    // AboveMA200
  };
}

// Convert backend CSV data to frontend format
const convertBackendToFrontend = (backendData: any[]): AccumulationData[] => {
  return backendData.map(item => ({
    symbol: item.Symbol || '',
    price: Number(item.Price) || 0,
    volume: Number(item.Volume) || 0,
    suspend: false, // Not in CSV, default to false
    specialNotice: '', // Not in CSV, default to empty
    dates: {
      'W-4': Number(item.W4) || null,
      'W-3': Number(item.W3) || null,
      'W-2': Number(item.W2) || null,
      'W-1': Number(item.W1) || null,
      'D-4': Number(item.D4) || null,
      'D-3': Number(item.D3) || null,
      'D-2': Number(item.D2) || null,
      'D-1': Number(item.D1) || null,
      'D0': Number(item.D0) || null,
    },
    percent1d: Number(item.Percent1D) || 0,
    volumeChanges: {
      vol1d: Number(item.VPercent1D) || 0,
      vol3d: Number(item.VPercent3D) || 0,
      vol5d: Number(item.VPercent5D) || 0,
      vol10d: Number(item.VPercent10D) || 0,
      vol20d: Number(item.VPercent20D) || 0,
      vol50d: Number(item.VPercent50D) || 0,
      vol100d: Number(item.VPercent100D) || 0,
    },
    movingAverage: {
      'W-4': Number(item.W4) || null,
      'W-3': Number(item.W3) || null,
      'W-2': Number(item.W2) || null,
      'W-1': Number(item.W1) || null,
      'D-4': Number(item.D4) || null,
      'D-3': Number(item.D3) || null,
      'D-2': Number(item.D2) || null,
      'D-1': Number(item.D1) || null,
      'D0': Number(item.D0) || null,
    },
    maIndicators: {
      ma5: item.AboveMA5 || 'x',
      ma10: item.AboveMA10 || 'x',
      ma20: item.AboveMA20 || 'x',
      ma50: item.AboveMA50 || 'x',
      ma100: item.AboveMA100 || 'x',
      ma200: item.AboveMA200 || 'x',
    }
  }));
};

// Format number with K, M, B abbreviations
const formatNumberWithAbbreviation = (num: number | null): string => {
  if (num === null || num === 0) return '-';
  const absNum = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  
  if (absNum >= 1e9) {
    return sign + (absNum / 1e9).toFixed(1) + 'B';
  } else if (absNum >= 1e6) {
    return sign + (absNum / 1e6).toFixed(1) + 'M';
  } else if (absNum >= 1e3) {
    return sign + (absNum / 1e3).toFixed(1) + 'K';
  } else {
    return num.toFixed(1);
  }
};

// Normalize function - scales values to 0-100 range
const normalizeValue = (value: number | null, min: number, max: number): number | null => {
  if (value === null) return null;
  if (max === min) return 50; // If all values are the same, return middle
  return ((value - min) / (max - min)) * 100;
};

// Get normalized color based on 0-100 scale
const getNormalizedColor = (value: number | null): string => {
  if (value === null) return 'bg-muted';
  if (value >= 80) return 'bg-red-100 dark:bg-red-900/20';
  if (value >= 60) return 'bg-orange-100 dark:bg-orange-900/20';
  if (value >= 40) return 'bg-yellow-100 dark:bg-yellow-900/20';
  if (value >= 20) return 'bg-blue-100 dark:bg-blue-900/20';
  return 'bg-purple-100 dark:bg-purple-900/20';
};

// Format Moving Average indicators
const formatMovingAverage = (value: string): { symbol: string; color: string } => {
  if (value === '1' || value === 'v') {
    return { symbol: 'v', color: 'text-green-600' };
  } else if (value === '0' || value === 'x') {
    return { symbol: 'x', color: 'text-red-600' };
  }
  return { symbol: value, color: 'text-muted-foreground' };
};

const getTextColor = (value: number | null): string => {
  if (value === null) return 'text-muted-foreground';
  if (value >= 0) return 'text-green-500 dark:text-green-400';
  return 'text-red-500 dark:text-red-400';
};

const getPercent1dColor = (value: number): string => {
  if (value >= 5) return 'text-green-500 dark:text-green-400';
  if (value >= 0) return 'text-green-500 dark:text-green-400';
  if (value >= -5) return 'text-red-500 dark:text-red-400';
  return 'text-red-500 dark:text-red-400';
};

export function StoryAccumulationDistribution() {
  const [data, setData] = useState<AccumulationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [normalize, setNormalize] = useState(false);
  const [movingAverage, setMovingAverage] = useState(false);
  const [volumeChange, setVolumeChange] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [tickerInput, setTickerInput] = useState('');
  const [selectedTickers, setSelectedTickers] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const controlMenuRef = useRef<HTMLDivElement>(null);
  const [controlSpacerHeight, setControlSpacerHeight] = useState<number>(72);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  // Load data from API
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Get available dates first
        const datesResponse = await api.getAccumulationDistributionDates();
        if (!datesResponse.success || !datesResponse.data?.dates || datesResponse.data.dates.length === 0) {
          throw new Error('No accumulation distribution data available');
        }
        
        // Get the latest date (most recent CSV file)
        const latestDate = datesResponse.data.dates.sort().pop();
        if (!latestDate) {
          throw new Error('No valid dates found');
        }
        
        // Set last update from filename
        setLastUpdate(latestDate || '');
        
        // Get data for the latest date
        const dataResponse = await api.getAccumulationDistributionData(latestDate);
        if (!dataResponse.success || !dataResponse.data) {
          throw new Error('Failed to load accumulation distribution data');
        }
        
        // Convert backend data to frontend format
        const convertedData = convertBackendToFrontend(dataResponse.data.accumulationData || []);
        setData(convertedData);
        
      } catch (err: any) {
        console.error('Error loading accumulation distribution data:', err);
        setError(err.message || 'Failed to load data');
        setData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Update spacer height for fixed control menu
  useEffect(() => {
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
  }, [normalize, movingAverage, volumeChange, selectedTickers, tickerInput]);

  const dates = data.length > 0 ? Object.keys(data[0]?.dates || {}) : [];
  
  // Get all volume change columns
  const volumeColumns = ['vol1d', 'vol3d', 'vol5d', 'vol10d', 'vol20d', 'vol50d', 'vol100d'];
  
  // Get all MA indicator columns
  const maColumns = ['ma5', 'ma10', 'ma20', 'ma50', 'ma100', 'ma200'];
  
  // Format volume change column names
  const getVolumeColumnName = (volKey: string) => {
    return volKey.replace('vol', 'V%');
  };
  
  // Format MA column names
  const getMAColumnName = (maKey: string) => {
    return `>${maKey}`;
  };
  
  // Get unique tickers for filter dropdown
  const allTickers = [...new Set(data.map(item => item.symbol))].sort();
  const filteredTickers = (tickerInput
    ? allTickers.filter(ticker => ticker.toLowerCase().includes(tickerInput.toLowerCase()))
    : []).slice(0, 10);
  
  // Filter data based on ticker selection
  const filteredData = selectedTickers.length === 0
    ? data 
    : data.filter(item => selectedTickers.includes(item.symbol));
  
  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };
  
  const sortedData = [...filteredData].sort((a, b) => {
    if (!sortConfig) return 0;
    
    let aValue: any;
    let bValue: any;
    
    switch (sortConfig.key) {
      case 'symbol':
        aValue = a.symbol;
        bValue = b.symbol;
        break;
      case 'price':
        aValue = a.price;
        bValue = b.price;
        break;
      case 'percent1d':
        aValue = a.percent1d;
        bValue = b.percent1d;
        break;
      case 'volume':
        aValue = a.volume;
        bValue = b.volume;
        break;
      default:
        // For date columns, volume change columns, or MA columns
        if (volumeColumns.includes(sortConfig.key)) {
          aValue = a.volumeChanges[sortConfig.key as keyof typeof a.volumeChanges] || 0;
          bValue = b.volumeChanges[sortConfig.key as keyof typeof b.volumeChanges] || 0;
        } else if (maColumns.includes(sortConfig.key)) {
          aValue = a.maIndicators[sortConfig.key as keyof typeof a.maIndicators] || '';
          bValue = b.maIndicators[sortConfig.key as keyof typeof b.maIndicators] || '';
        } else {
          // For date columns
          aValue = a.dates[sortConfig.key] || 0;
          bValue = b.dates[sortConfig.key] || 0;
        }
        break;
    }
    
    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  // Pagination calculations
  const totalPages = Math.ceil(sortedData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedData = sortedData.slice(startIndex, endIndex);

  // Calculate min/max for normalization once (not in every row render) - memoized for performance
  const allValues = useMemo(() => {
    return data.flatMap(item => Object.values(item.dates).filter(v => v !== null)) as number[];
  }, [data]);
  const minValue = allValues.length > 0 ? Math.min(...allValues) : 0;
  const maxValue = allValues.length > 0 ? Math.max(...allValues) : 0;

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedTickers, sortConfig, normalize, movingAverage, volumeChange]);

  const formatPrice = (price: number): string => {
    return new Intl.NumberFormat('id-ID').format(price);
  };

  const resetSettings = () => {
    setNormalize(false);
    setMovingAverage(false);
    setVolumeChange(false);
    setSortConfig(null);
    setTickerInput('');
    setSelectedTickers([]);
    setShowDropdown(false);
    setCurrentPage(1);
  };

  const handleTickerSelect = (ticker: string) => {
    if (selectedTickers.includes(ticker)) {
      setSelectedTickers(selectedTickers.filter(t => t !== ticker));
    } else {
      setSelectedTickers([...selectedTickers, ticker]);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <Card className="p-4">
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading accumulation distribution data...</p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <Card className="p-4">
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <p className="text-red-500 mb-4">Error: {error}</p>
              <Button onClick={() => window.location.reload()} variant="outline">
                Retry
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Control Bar */}
      <div className="bg-[#0a0f20]/95 border-b border-[#3a4252] px-4 py-1.5 backdrop-blur-md shadow-lg lg:fixed lg:top-14 lg:left-20 lg:right-0 lg:z-40">
        <div ref={controlMenuRef} className="flex flex-col md:flex-row md:flex-wrap items-stretch md:items-center gap-3 md:gap-6">
          <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
            <label htmlFor="tickerFilter" className="text-sm font-medium whitespace-nowrap">
              Ticker:
            </label>
            {selectedTickers.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedTickers.map(ticker => (
                  <span
                    key={ticker}
                    className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-md cursor-pointer hover:bg-primary/20"
                    onClick={() => handleTickerSelect(ticker)}
                  >
                    {ticker} ×
                  </span>
                ))}
              </div>
            )}
            <div className="relative flex-1 md:flex-none" ref={dropdownRef}>
              <Search className="absolute left-3 top-1/2 pointer-events-none -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <input
                type="text"
                id="tickerFilter"
                placeholder="Ticker code"
                value={tickerInput}
                onChange={(e) => {
                  setTickerInput(e.target.value);
                  if (e.target.value === '') {
                    setShowDropdown(false);
                    setHighlightedIndex(-1);
                  } else {
                    setShowDropdown(true);
                  }
                }}
                onFocus={() => {
                  if (tickerInput) {
                    setShowDropdown(true);
                  }
                }}
                onKeyDown={(e) => {
                  if (!filteredTickers.length) return;
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setShowDropdown(true);
                    setHighlightedIndex((prev) => (prev + 1) % filteredTickers.length);
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setShowDropdown(true);
                    setHighlightedIndex((prev) => (prev <= 0 ? filteredTickers.length - 1 : prev - 1));
                  } else if (e.key === 'Enter') {
                    if (highlightedIndex >= 0) {
                      e.preventDefault();
                      const ticker = filteredTickers[highlightedIndex];
                      handleTickerSelect(ticker || '');
                      setTickerInput('');
                      setShowDropdown(false);
                      setHighlightedIndex(-1);
                    }
                  } else if (e.key === 'Escape') {
                    setShowDropdown(false);
                    setHighlightedIndex(-1);
                  }
                }}
                className="w-full sm:w-64 h-9 pl-10 pr-3 text-sm border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground"
              />
              {tickerInput && (
                <button
                  onClick={() => {
                    setTickerInput('');
                    setShowDropdown(false);
                  }}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  ✕
                </button>
              )}
              {showDropdown && tickerInput && (
                <div className="absolute top-full left-0 right-0 bg-popover border border-[#3a4252] rounded-md shadow-lg z-30 max-h-40 overflow-y-auto">
                  {filteredTickers.map((ticker, idx) => (
                    <div
                      key={ticker}
                      className={`px-3 py-1 cursor-pointer text-sm ${idx === highlightedIndex ? 'bg-muted' : 'hover:bg-muted'}`}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      onMouseLeave={() => setHighlightedIndex(-1)}
                      onClick={() => {
                        handleTickerSelect(ticker || '');
                        setTickerInput('');
                        setShowDropdown(false);
                        setHighlightedIndex(-1);
                      }}
                    >
                      {ticker}
                    </div>
                  ))}
                  {filteredTickers.length === 0 && (
                    <div className="px-3 py-1 text-sm text-muted-foreground">
                      No tickers found
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
            <label className="text-sm font-medium whitespace-nowrap">Options:</label>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="normalize"
                  checked={normalize}
                  onChange={(e) => setNormalize(e.target.checked)}
                  className="w-4 h-4 text-primary bg-background border border-border rounded focus:ring-primary focus:ring-2 hover:border-primary/50 transition-colors"
                />
                <label htmlFor="normalize" className="text-sm font-medium">Normalize</label>
              </div>
              
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="movingAverage"
                  checked={movingAverage}
                  onChange={(e) => setMovingAverage(e.target.checked)}
                  className="w-4 h-4 text-primary bg-background border border-border rounded focus:ring-primary focus:ring-2 hover:border-primary/50 transition-colors"
                />
                <label htmlFor="movingAverage" className="text-sm font-medium">Moving Average</label>
              </div>
              
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="volumeChange"
                  checked={volumeChange}
                  onChange={(e) => setVolumeChange(e.target.checked)}
                  className="w-4 h-4 text-primary bg-background border border-border rounded focus:ring-primary focus:ring-2 hover:border-primary/50 transition-colors"
                />
                <label htmlFor="volumeChange" className="text-sm font-medium">Volume Change</label>
              </div>
              
              <Button onClick={resetSettings} variant="outline" size="sm" className="flex items-center gap-2 h-8">
                <Undo2 className="w-4 h-4 rotate-180" />
                Reset
              </Button>
            </div>
          </div>
          
          {lastUpdate && (
            <div className="text-right w-full md:w-auto md:ml-auto">
              <p className="text-sm text-muted-foreground">
                Last Update: <span className="font-medium text-foreground">{lastUpdate}</span>
              </p>
            </div>
          )}
        </div>
      </div>
      {/* Spacer untuk header fixed - hanya diperlukan di layar besar (lg+) */}
      <div className="hidden lg:block" style={{ height: `${controlSpacerHeight}px` }} />

      {/* Market Maker Analysis Summary Table */}
      <Card className="p-0 bg-card">
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <div className="w-full">
            {/* Header */}
            <div className="bg-muted border-b border-border sticky top-0 z-20">
              <div className="flex w-full">
                <div 
                  className="flex-1 p-1 border-r border-border font-medium text-xs bg-muted flex items-center justify-center cursor-pointer hover:bg-muted/80 min-w-[60px]"
                  onClick={() => handleSort('symbol')}
                >
                  <span>Symbol</span>
                  <div className="ml-0.5 flex flex-col">
                    <span className={`text-[8px] ${sortConfig?.key === 'symbol' && sortConfig.direction === 'asc' ? 'text-primary' : 'text-muted-foreground'}`}>↑</span>
                    <span className={`text-[8px] ${sortConfig?.key === 'symbol' && sortConfig.direction === 'desc' ? 'text-primary' : 'text-muted-foreground'}`}>↓</span>
                </div>
                </div>
                {dates.map((date) => (
                  <div 
                    key={date} 
                    className={`flex-1 p-1 border-r border-border font-medium text-xs text-center bg-muted flex items-center justify-center cursor-pointer hover:bg-muted/80 min-w-[50px] ${
                      date.startsWith('W-') ? 'bg-blue-500/10 dark:bg-blue-500/20' : ''
                    }`}
                    onClick={() => handleSort(date)}
                  >
                    <span>{date}</span>
                    <div className="ml-0.5 flex flex-col">
                      <span className={`text-[8px] ${sortConfig?.key === date && sortConfig.direction === 'asc' ? 'text-primary' : 'text-muted-foreground'}`}>↑</span>
                      <span className={`text-[8px] ${sortConfig?.key === date && sortConfig.direction === 'desc' ? 'text-primary' : 'text-muted-foreground'}`}>↓</span>
                    </div>
                  </div>
                ))}
                <div 
                  className="flex-1 p-1 border-r border-border font-medium text-xs text-center bg-muted flex items-center justify-center cursor-pointer hover:bg-muted/80 min-w-[50px]"
                  onClick={() => handleSort('percent1d')}
                >
                  <span>%1D</span>
                  <div className="ml-0.5 flex flex-col">
                    <span className={`text-[8px] ${sortConfig?.key === 'percent1d' && sortConfig.direction === 'asc' ? 'text-primary' : 'text-muted-foreground'}`}>↑</span>
                    <span className={`text-[8px] ${sortConfig?.key === 'percent1d' && sortConfig.direction === 'desc' ? 'text-primary' : 'text-muted-foreground'}`}>↓</span>
                  </div>
                </div>
                {volumeChange && volumeColumns.map((volKey) => (
                  <div 
                    key={volKey}
                    className="flex-1 p-1 border-r border-border font-medium text-xs text-center bg-muted flex items-center justify-center cursor-pointer hover:bg-muted/80 min-w-[50px]"
                    onClick={() => handleSort(volKey)}
                  >
                    <span>{getVolumeColumnName(volKey)}</span>
                    <div className="ml-0.5 flex flex-col">
                      <span className={`text-[8px] ${sortConfig?.key === volKey && sortConfig.direction === 'asc' ? 'text-primary' : 'text-muted-foreground'}`}>↑</span>
                      <span className={`text-[8px] ${sortConfig?.key === volKey && sortConfig.direction === 'desc' ? 'text-primary' : 'text-muted-foreground'}`}>↓</span>
                    </div>
                  </div>
                ))}
                {movingAverage && maColumns.map((maKey) => (
                  <div 
                    key={maKey}
                    className="flex-1 p-1 border-r border-border font-medium text-xs text-center bg-muted flex items-center justify-center min-w-[50px]"
                  >
                    <span>{getMAColumnName(maKey)}</span>
                  </div>
                ))}
                <div 
                  className="flex-1 p-1 border-r border-border font-medium text-xs text-center bg-muted flex items-center justify-center cursor-pointer hover:bg-muted/80 min-w-[60px]"
                  onClick={() => handleSort('price')}
                >
                  <span>Price</span>
                  <div className="ml-0.5 flex flex-col">
                    <span className={`text-[8px] ${sortConfig?.key === 'price' && sortConfig.direction === 'asc' ? 'text-primary' : 'text-muted-foreground'}`}>↑</span>
                    <span className={`text-[8px] ${sortConfig?.key === 'price' && sortConfig.direction === 'desc' ? 'text-primary' : 'text-muted-foreground'}`}>↓</span>
                  </div>
                </div>
                <div 
                  className="flex-1 p-1 font-medium text-xs text-center bg-muted flex items-center justify-center cursor-pointer hover:bg-muted/80 min-w-[60px]"
                  onClick={() => handleSort('volume')}
                >
                  <span>Volume</span>
                  <div className="ml-0.5 flex flex-col">
                    <span className={`text-[8px] ${sortConfig?.key === 'volume' && sortConfig.direction === 'asc' ? 'text-primary' : 'text-muted-foreground'}`}>↑</span>
                    <span className={`text-[8px] ${sortConfig?.key === 'volume' && sortConfig.direction === 'desc' ? 'text-primary' : 'text-muted-foreground'}`}>↓</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Data Rows */}
              {paginatedData.map((row) => {
                return (
                <div key={row.symbol} className={`flex w-full border-b border-border hover:bg-muted/20 ${
                  row.suspend ? 'bg-red-500/10 dark:bg-red-500/20' : ''
                }`}>
                  <div className="flex-1 p-1 border-r border-border font-medium text-xs bg-card flex items-center justify-center min-w-[60px]">
                    <span>{row.symbol}</span>
                    </div>
                    {dates.map((date) => {
                    let displayValue: number | null = row.dates[date] ?? null;
                    
                    // Use moving average if enabled
                    if (movingAverage) {
                      displayValue = row.movingAverage[date] ?? null;
                    }
                    
                    // Normalize if enabled
                    if (normalize && displayValue !== null) {
                      displayValue = normalizeValue(displayValue, minValue, maxValue);
                    }
                    
                      return (
                        <div 
                          key={`${row.symbol}-${date}`}
                        className={`flex-1 p-1 border-r border-border text-center text-xs min-w-[50px] ${
                          normalize ? getNormalizedColor(displayValue) : ''
                        } ${getTextColor(displayValue)}`}
                      >
                        {normalize 
                          ? (displayValue !== null ? displayValue.toFixed(1) : '-')
                          : formatNumberWithAbbreviation(displayValue)
                        }
                        </div>
                      );
                    })}
                  <div className={`flex-1 p-1 border-r border-border text-center text-xs min-w-[50px] ${getPercent1dColor(row.percent1d)}`}>
                    {row.percent1d >= 0 ? '+' : ''}{row.percent1d.toFixed(1)}%
                  </div>
                  {volumeChange && volumeColumns.map((volKey) => (
                    <div 
                      key={volKey}
                      className={`flex-1 p-1 border-r border-border text-center text-xs min-w-[50px] ${getTextColor(row.volumeChanges[volKey as keyof typeof row.volumeChanges])}`}
                    >
                      {(row.volumeChanges[volKey as keyof typeof row.volumeChanges] >= 0 ? '+' : '') + row.volumeChanges[volKey as keyof typeof row.volumeChanges].toFixed(1) + '%'}
                    </div>
                  ))}
                  {movingAverage && maColumns.map((maKey) => {
                    const maValue = row.maIndicators[maKey as keyof typeof row.maIndicators];
                    const formatted = formatMovingAverage(maValue);
                    return (
                    <div 
                      key={maKey}
                        className={`flex-1 p-1 border-r border-border text-center text-xs font-bold min-w-[50px] ${formatted.color}`}
                    >
                        {formatted.symbol}
                    </div>
                    );
                  })}
                  <div className="flex-1 p-1 border-r border-border text-center text-xs bg-card min-w-[60px]">
                    {formatPrice(row.price)}
                  </div>
                  <div className="flex-1 p-1 text-center text-xs bg-card min-w-[60px]">
                    {formatPrice(row.volume)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pagination Controls */}
          {sortedData.length > 0 && (
            <div className="border-t border-border bg-muted/30 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Items per page:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-2 py-1 text-sm border border-border rounded-md bg-background text-foreground"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                  <option value={500}>500</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Showing {startIndex + 1} - {Math.min(endIndex, sortedData.length)} of {sortedData.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="p-2 border border-border rounded-md bg-background text-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent transition-colors"
                  aria-label="First page"
                >
                  <ChevronFirst className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="p-2 border border-border rounded-md bg-background text-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent transition-colors"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-foreground px-2">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 border border-border rounded-md bg-background text-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent transition-colors"
                  aria-label="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="p-2 border border-border rounded-md bg-background text-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent transition-colors"
                  aria-label="Last page"
                >
                  <ChevronLast className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </Card>
    </div>
  );
}
