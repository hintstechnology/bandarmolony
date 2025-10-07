import React, { useState, useRef, useEffect } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';

interface AccumulationData {
  symbol: string;
  price: number;
  volume: number;
  suspend: boolean;
  specialNotice: string;
  dates: { [key: string]: number | null };
  percent1d: number; // %1d column
  volumeChanges: { // Volume change columns
    vol1d: number;
    vol3d: number;
    vol5d: number;
    vol10d: number;
    vol20d: number;
    vol50d: number;
    vol100d: number;
  };
  movingAverage: { [key: string]: number | null }; // Moving average data
  maIndicators: { // Moving average indicators (v/x)
    ma5: string;
    ma10: string;
    ma20: string;
    ma50: string;
    ma100: string;
    ma200: string;
  };
}

// Mock data berdasarkan ilustrasi Market Maker Analysis Summary
const generateMockData = (): AccumulationData[] => {
  const symbols = [
    'SIMP', 'TNCA', 'COCO', 'TBIG', 'HALO', 'HRUM', 'ERAL', 'SULI', 'IMJS', 'MIKA',
    'MTDL', 'MHKI', 'BBCA', 'BBNI', 'BBRI', 'BMRI', 'BRIS', 'BTPS', 'ACES', 'ADRO',
    'AKRA', 'AMRT', 'ANTM', 'ASII', 'BALI', 'BBKP', 'BBTN', 'BCAP', 'BDMN', 'BFIN',
    'BJTM', 'BMTR', 'BNGA', 'BRMS', 'BSDE', 'BTPN', 'BUKA', 'CTRA', 'DMAS', 'ERAA',
    'ESSA', 'EXCL', 'GGRM', 'GOTO', 'ICBP', 'IHSG', 'IMAS', 'INCO', 'INDF', 'INTP',
    'ITMG', 'JPFA', 'JSMR', 'KLBF', 'LPKR', 'LPPF', 'MAPI', 'MDKA', 'MEDC', 'MNCN',
    'MPPA', 'MYOR', 'NIRO', 'PGAS', 'PGJO', 'PTBA', 'PTPP', 'PWON', 'RAJA', 'SCMA',
    'SIDO', 'SMGR', 'SRTG', 'TKIM', 'TLKM', 'TOBA', 'TOWR', 'UNTR', 'UNVR', 'WIKA', 'WSKT'
  ];

  // Columns sesuai dengan gambar: w-4, w-3, w-2, w-1, d-4, d-3, d-2, d-1, d-0
  const dateColumns = [
    'W-4', 'W-3', 'W-2', 'W-1', 'D-4', 'D-3', 'D-2', 'D-1', 'D0'
  ];

  const specialNotices = ['', 'Split', 'Dividend', 'Rights', 'Bonus', 'Suspend'];

  return symbols.map(symbol => {
    const data: { [key: string]: number | null } = {};
    dateColumns.forEach(dateCol => {
      // Generate random accumulation/distribution values (persentase terhadap total transaksi)
      const rand = Math.random();
      if (rand > 0.7) {
        data[dateCol] = Math.floor(Math.random() * 5) + 1; // Strong accumulation (1-5%)
      } else if (rand > 0.4) {
        data[dateCol] = Math.floor(Math.random() * 2); // Weak accumulation/neutral (0-1%)
      } else if (rand > 0.1) {
        data[dateCol] = -Math.floor(Math.random() * 2); // Weak distribution (-1 to 0%)
      } else {
        data[dateCol] = -Math.floor(Math.random() * 5) - 1; // Strong distribution (-5 to -1%)
      }
    });
    
    // Generate %1d (percentage 1 day change)
    const percent1d = (Math.random() - 0.5) * 20; // -10% to +10%
    
    // Generate volume changes (dummy data from CSV)
    const volumeChanges = {
      vol1d: (Math.random() - 0.5) * 200,   // -100% to +100%
      vol3d: (Math.random() - 0.5) * 150,  // -75% to +75%
      vol5d: (Math.random() - 0.5) * 120,  // -60% to +60%
      vol10d: (Math.random() - 0.5) * 100, // -50% to +50%
      vol20d: (Math.random() - 0.5) * 80,   // -40% to +40%
      vol50d: (Math.random() - 0.5) * 60,   // -30% to +30%
      vol100d: (Math.random() - 0.5) * 40   // -20% to +20%
    };
    
    // Generate moving average data
    const movingAverage: { [key: string]: number | null } = {};
    dateColumns.forEach(dateCol => {
      const baseValue = data[dateCol] || 0;
      // Moving average is slightly smoothed version of original data
      movingAverage[dateCol] = baseValue ? baseValue * (0.8 + Math.random() * 0.4) : null;
    });
    
    // Generate moving average indicators (v/x based on price vs MA)
    const price = Math.floor(Math.random() * 1000) + 100;
    const maIndicators = {
      ma5: Math.random() > 0.5 ? 'v' : 'x',
      ma10: Math.random() > 0.5 ? 'v' : 'x',
      ma20: Math.random() > 0.5 ? 'v' : 'x',
      ma50: Math.random() > 0.5 ? 'v' : 'x',
      ma100: Math.random() > 0.5 ? 'v' : 'x',
      ma200: Math.random() > 0.5 ? 'v' : 'x'
    };
    
    return { 
      symbol, 
      price: price, // Random price between 100-1100
      volume: Math.floor(Math.random() * 1000000) + 10000, // 10,000-1,010,000
      suspend: Math.random() > 0.95, // 5% chance of suspension
      specialNotice: specialNotices[Math.floor(Math.random() * specialNotices.length)],
      dates: data,
      percent1d: percent1d,
      volumeChanges: volumeChanges,
      movingAverage: movingAverage,
      maIndicators: maIndicators
    };
  });
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
  const [data] = useState<AccumulationData[]>(generateMockData());
  const [normalize, setNormalize] = useState(false);
  const [movingAverage, setMovingAverage] = useState(false);
  const [volumeChange, setVolumeChange] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [tickerFilter, setTickerFilter] = useState('all');
  const [tickerInput, setTickerInput] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  const dates = Object.keys(data[0]?.dates || {});
  
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
  
  // Filter data based on ticker selection
  const filteredData = tickerFilter === 'all' 
    ? data 
    : data.filter(item => item.symbol.toLowerCase().includes(tickerInput.toLowerCase()));
  
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

  const formatPrice = (price: number): string => {
    return new Intl.NumberFormat('id-ID').format(price);
  };

  const resetSettings = () => {
    setNormalize(false);
    setMovingAverage(false);
    setVolumeChange(false);
    setSortConfig(null);
    setTickerFilter('all');
    setTickerInput('');
    setShowDropdown(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Control Bar */}
      <Card className="p-4">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <label htmlFor="tickerFilter" className="text-sm font-medium">
                Filter Ticker:
              </label>
              <div className="relative" ref={dropdownRef}>
                <input
                  type="text"
                  placeholder="Ticker code"
                  value={tickerInput}
                  onChange={(e) => {
                    setTickerInput(e.target.value);
                    if (e.target.value === '') {
                      setTickerFilter('all');
                      setShowDropdown(false);
                    } else {
                      setTickerFilter('custom');
                      setShowDropdown(true);
                    }
                  }}
                  onFocus={() => {
                    if (tickerInput) {
                      setShowDropdown(true);
                    }
                  }}
                  className="px-3 py-1 border border-border rounded-md text-sm w-64 bg-background text-foreground placeholder:text-muted-foreground"
                />
                {tickerInput && (
                  <button
                    onClick={() => {
                      setTickerInput('');
                      setTickerFilter('all');
                      setShowDropdown(false);
                    }}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    ✕
                  </button>
                )}
                {showDropdown && tickerInput && (
                  <div className="absolute top-full left-0 right-0 bg-background border border-border rounded-md shadow-lg z-30 max-h-40 overflow-y-auto">
                    {allTickers
                      .filter(ticker => ticker.toLowerCase().includes(tickerInput.toLowerCase()))
                      .slice(0, 10)
                      .map(ticker => (
                        <div
                          key={ticker}
                          className="px-3 py-1 hover:bg-muted cursor-pointer text-sm"
                          onClick={() => {
                            setTickerInput(ticker);
                            setTickerFilter('custom');
                            setShowDropdown(false);
                          }}
                        >
                          {ticker}
                        </div>
                      ))}
                    {allTickers.filter(ticker => ticker.toLowerCase().includes(tickerInput.toLowerCase())).length === 0 && (
                      <div className="px-3 py-1 text-sm text-muted-foreground">
                        No tickers found
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {tickerFilter === 'all' ? 'Showing all tickers' : `Filtered: ${filteredData.length} tickers`}
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="normalize"
                checked={normalize}
                onChange={(e) => setNormalize(e.target.checked)}
                className="rounded border-border"
              />
              <label htmlFor="normalize" className="text-sm font-medium">Normalize</label>
            </div>
            
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="movingAverage"
                checked={movingAverage}
                onChange={(e) => setMovingAverage(e.target.checked)}
                className="rounded border-border"
              />
              <label htmlFor="movingAverage" className="text-sm font-medium">Moving Average</label>
          </div>
          
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="volumeChange"
                checked={volumeChange}
                onChange={(e) => setVolumeChange(e.target.checked)}
                className="rounded border-border"
              />
              <label htmlFor="volumeChange" className="text-sm font-medium">Volume Change</label>
          </div>
        </div>
          
          <Button onClick={resetSettings} variant="outline" size="sm">
            Reset Settings
          </Button>
          </div>
        </Card>

      {/* Market Maker Analysis Summary Table */}
      <Card className="p-0 bg-card">
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
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
                {dates.map((date, index) => (
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
              {sortedData.map((row, rowIndex) => {
              // Calculate min/max for normalization
              const allValues = Object.values(row.dates).filter(v => v !== null) as number[];
              const minValue = Math.min(...allValues);
              const maxValue = Math.max(...allValues);
                
                return (
                <div key={row.symbol} className={`flex w-full border-b border-border hover:bg-muted/20 ${
                  row.suspend ? 'bg-red-500/10 dark:bg-red-500/20' : ''
                }`}>
                  <div className="flex-1 p-1 border-r border-border font-medium text-xs bg-card flex items-center justify-center min-w-[60px]">
                    <span>{row.symbol}</span>
                    </div>
                    {dates.map((date) => {
                    let displayValue = row.dates[date];
                    let displayData = row.dates;
                    
                    // Use moving average if enabled
                    if (movingAverage) {
                      displayData = row.movingAverage;
                      displayValue = row.movingAverage[date];
                    }
                    
                    // Normalize if enabled
                    if (normalize && displayValue !== null) {
                      displayValue = normalizeValue(displayValue, minValue, maxValue);
                    }
                    
                    const isHighlighted = date === 'D0' && Math.random() > 0.8;
                      return (
                        <div 
                          key={`${row.symbol}-${date}`}
                        className={`flex-1 p-1 border-r border-border text-center text-xs min-w-[50px] ${
                          normalize ? getNormalizedColor(displayValue) : ''
                        } ${getTextColor(displayValue)} ${
                          isHighlighted ? 'bg-red-500/20 dark:bg-red-500/30' : ''
                        }`}
                      >
                        {displayValue !== null ? displayValue.toFixed(1) : '-'}
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
                  {movingAverage && maColumns.map((maKey) => (
                    <div 
                      key={maKey}
                      className={`flex-1 p-1 border-r border-border text-center text-xs font-bold min-w-[50px] ${row.maIndicators[maKey as keyof typeof row.maIndicators] === 'v' ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}
                    >
                      {row.maIndicators[maKey as keyof typeof row.maIndicators]}
                    </div>
                  ))}
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
        </Card>
    </div>
  );
}