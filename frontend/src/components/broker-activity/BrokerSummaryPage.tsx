import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2, Calendar, X } from 'lucide-react';
 
import { api } from '../../services/api';

interface BrokerSummaryData {
  broker: string;
  buyerVol: number;   // BuyerVol (for BLot in BUY table)
  buyerValue: number; // BuyerValue (for BVal in BUY table)
  bavg: number;       // BuyerAvg (for BAvg in BUY table)
  sellerVol: number;  // SellerVol (for SLot in SELL table)
  sellerValue: number; // SellerValue (for SVal in SELL table)
  savg: number;       // SellerAvg (for SAvg in SELL table)
  nblot: number;      // NetBuyVol (for NBLot in NET table) - legacy
  nbval: number;      // NetBuyValue (for NBVal in NET table) - legacy
  netBuyVol: number;  // NetBuyVol (for NBLot in NET table)
  netBuyValue: number; // NetBuyValue (for NBVal in NET table)
  // Legacy fields for backward compatibility
  sl: number;
  nslot: number;
  nsval: number;
}

// Note: TICKERS constant removed - now using dynamic stock loading from API

// Foreign brokers (red background)
const FOREIGN_BROKERS = [
  "AG", "AH", "AI", "AK", "BK", "BQ", "CG", "CS", "DP", "DR", "DU", "FS", "GW", "HD", "KK", 
  "KZ", "LH", "LG", "LS", "MS", "NI", "RB", "RX", "TX", "YP", "YU", "ZP"
];

// Government brokers (green background)
const GOVERNMENT_BROKERS = ['CC', 'NI', 'OD', 'DX'];

// Note: local generator removed in favor of backend API

// Get last trading days (excluding weekends)
const getLastTradingDays = (count: number): string[] => {
  const today = new Date();
  const dates: string[] = [];
  let daysBack = 0;
  
  while (dates.length < count) {
    const date = new Date(today);
    date.setDate(date.getDate() - daysBack);
    const dayOfWeek = date.getDay();
    
    // Skip weekends (Saturday = 6, Sunday = 0)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
    dates.push(date.toISOString().split('T')[0] ?? '');
    }
    daysBack++;
  }
  
  return dates;
};

// Get last three trading days
const getLastThreeDays = (): string[] => {
  return getLastTradingDays(3);
};

const formatNumber = (value: number): string => {
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  
  if (absValue >= 1000000000) {
    return `${sign}${(absValue / 1000000000).toFixed(1)}B`;
  } else if (absValue >= 1000000) {
    return `${sign}${(absValue / 1000000).toFixed(1)}M`;
  } else if (absValue >= 1000) {
    return `${sign}${(absValue / 1000).toFixed(1)}K`;
  }
  return value.toLocaleString();
};

const formatLot = (value: number): string => {
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  
  if (absValue >= 1000000000) {
    return `${sign}${(absValue / 1000000000).toFixed(3)}B`;
  } else if (absValue >= 1000000) {
    return `${sign}${(absValue / 1000000).toFixed(3)}M`;
  } else {
    // Untuk ribuan (< 1 juta), tampilkan format lengkap dengan separator koma
    const formatted = absValue.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
    return `${sign}${formatted}`;
  }
};

const formatAverage = (value: number): string => {
  return value.toLocaleString('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
};

const formatDisplayDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

interface BrokerSummaryPageProps {
  selectedStock?: string;
}

export function BrokerSummaryPage({ selectedStock: propSelectedStock }: BrokerSummaryPageProps) {
  const [selectedDates, setSelectedDates] = useState<string[]>(() => {
    const threeDays = getLastThreeDays();
    if (threeDays.length > 0) {
      const sortedDates = [...threeDays].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      return sortedDates;
    }
    return [];
  });
  const [startDate, setStartDate] = useState(() => {
    const threeDays = getLastThreeDays();
    if (threeDays.length > 0) {
      const sortedDates = [...threeDays].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      return sortedDates[0] ?? '';
    }
    return '';
  });
  const [endDate, setEndDate] = useState(() => {
    const threeDays = getLastThreeDays();
    if (threeDays.length > 0) {
      const sortedDates = [...threeDays].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      return sortedDates[sortedDates.length - 1] ?? '';
    }
    return '';
  });
  // Multiple emiten selection (max 5)
  const [selectedTickers, setSelectedTickers] = useState<string[]>(() => {
    if (propSelectedStock) {
      return [propSelectedStock];
    }
    return [];
  });
  const [tickerInput, setTickerInput] = useState<string>('');
  const [fdFilter, setFdFilter] = useState<'All' | 'Foreign' | 'Domestic'>('All');
  const [marketFilter, setMarketFilter] = useState<'RG' | 'TN' | 'NG' | ''>('');
  
  // Stock selection state
  const [availableStocks, setAvailableStocks] = useState<string[]>([]);
  const [showStockSuggestions, setShowStockSuggestions] = useState(false);
  const [highlightedStockIndex, setHighlightedStockIndex] = useState<number>(-1);
  const [stockSearchTimeout, setStockSearchTimeout] = useState<NodeJS.Timeout | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);

  // API-driven broker summary data by ticker and date
  // Structure: Map<ticker, Map<date, BrokerSummaryData[]>>
  const [summaryByTickerAndDate, setSummaryByTickerAndDate] = useState<Map<string, Map<string, BrokerSummaryData[]>>>(new Map());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Update selectedTickers when prop changes
  useEffect(() => {
    if (propSelectedStock && !selectedTickers.includes(propSelectedStock)) {
      setSelectedTickers([propSelectedStock]);
      setTickerInput('');
    }
  }, [propSelectedStock, selectedTickers]);

  // Load available stocks when dates change
  useEffect(() => {
    const loadAvailableStocks = async () => {
      if (selectedDates.length === 0) return;

      try {
        // Load stocks for the first selected date
        if (selectedDates[0]) {
          // When marketFilter is empty string (All Trade), send it as empty string
          const market = marketFilter || '';
          const stocksResult = await api.getBrokerSummaryStocks(selectedDates[0], market as 'RG' | 'TN' | 'NG' | '');
          if (stocksResult.success && stocksResult.data?.stocks) {
            setAvailableStocks(stocksResult.data.stocks);
          }
        }
      } catch (err) {
        console.error('Error loading available stocks:', err);
        // Don't show error toast for stocks loading, just log it
      }
    };

    loadAvailableStocks();
  }, [selectedDates, marketFilter]);

  // Load broker summary data from backend for each selected ticker and date
  useEffect(() => {
    const fetchAll = async () => {
      if (selectedTickers.length === 0 || selectedDates.length === 0) {
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const market = marketFilter || '';
        const newMap = new Map<string, Map<string, BrokerSummaryData[]>>();
        
        // Fetch data for each ticker
        await Promise.all(
          selectedTickers.map(async (ticker) => {
            const tickerMap = new Map<string, BrokerSummaryData[]>();
            
            // Fetch data for each date for this ticker
            await Promise.all(
              selectedDates.map(async (date) => {
                console.log(`[BrokerSummary] Fetching data for ${ticker} on ${date} with market: ${market || 'All Trade'}`);
                const res = await api.getBrokerSummaryData(ticker, date, market as 'RG' | 'TN' | 'NG' | '');
                console.log(`[BrokerSummary] Response for ${ticker} on ${date}:`, {
                  success: res?.success,
                  hasData: !!res?.data,
                  hasBrokerData: !!res?.data?.brokerData,
                  brokerDataLength: res?.data?.brokerData?.length || 0,
                  error: res?.error,
                  path: res?.data?.path
                });
                
                // Check if response is successful
                if (!res || !res.success) {
                  console.error(`[BrokerSummary] Failed to fetch data for ${ticker} on ${date}:`, res?.error || 'Unknown error');
                  tickerMap.set(date, []);
                  return;
                }
                
                // Check if brokerData exists
                if (!res.data || !res.data.brokerData || !Array.isArray(res.data.brokerData)) {
                  console.warn(`[BrokerSummary] No broker data in response for ${ticker} on ${date}`);
                  tickerMap.set(date, []);
                  return;
                }
                
                const rows: BrokerSummaryData[] = (res.data.brokerData ?? []).map((r: any, idx: number) => {
                  const mapped = {
                    broker: r.BrokerCode ?? r.broker ?? r.BROKER ?? r.code ?? '',
                    buyerVol: Number(r.BuyerVol ?? 0),
                    buyerValue: Number(r.BuyerValue ?? 0),
                    bavg: Number(r.BuyerAvg ?? r.bavg ?? 0),
                    sellerVol: Number(r.SellerVol ?? 0),
                    sellerValue: Number(r.SellerValue ?? 0),
                    savg: Number(r.SellerAvg ?? r.savg ?? 0),
                    netBuyVol: Number(r.NetBuyVol ?? 0),
                    netBuyValue: Number(r.NetBuyValue ?? 0),
                    nblot: Number(r.NetBuyVol ?? r.nblot ?? 0),
                    nbval: Number(r.NetBuyValue ?? r.nbval ?? 0),
                    sl: Number(r.SellerVol ?? r.sl ?? 0),
                    nslot: -Number(r.SellerVol ?? 0),
                    nsval: -Number(r.SellerValue ?? 0)
                  };
                  
                  if (idx === 0) {
                    console.log(`[BrokerSummary] Sample row mapping for ${ticker} on ${date}:`, {
                      original: r,
                      mapped
                    });
                  }
                  
                  return mapped;
                }) as BrokerSummaryData[];
                
                console.log(`[BrokerSummary] Mapped ${rows.length} rows for ${ticker} on ${date}`);
                tickerMap.set(date, [...rows]);
              })
            );
            
            newMap.set(ticker, tickerMap);
            const totalRowsForTicker = Array.from(tickerMap.values()).reduce((sum, rows) => sum + rows.length, 0);
            console.log(`[BrokerSummary] Stored ${totalRowsForTicker} total rows for ticker ${ticker} across ${tickerMap.size} dates`);
          })
        );
        
        setSummaryByTickerAndDate(newMap);
        
        // Log summary
        const totalRows = Array.from(newMap.values()).reduce(
          (sum, tickerMap) => sum + Array.from(tickerMap.values()).reduce((s, rows) => s + rows.length, 0),
          0
        );
        console.log(`[BrokerSummary] Total rows loaded: ${totalRows} across ${newMap.size} tickers`);
      } catch (e: any) {
        console.error('[BrokerSummary] Error fetching data:', e);
        setError(e?.message || 'Failed to load broker summary');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAll();
  }, [selectedTickers, selectedDates, marketFilter]);

  // clearAllDates removed with Reset button

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowStockSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (stockSearchTimeout) {
        clearTimeout(stockSearchTimeout);
      }
    };
  }, [stockSearchTimeout]);

  const handleStockSelect = (stock: string) => {
    if (selectedTickers.includes(stock)) {
      // Already selected, do nothing or show message
      setShowStockSuggestions(false);
      setTickerInput('');
      return;
    }
    
    if (selectedTickers.length >= 5) {
      alert('Maksimal 5 emiten yang bisa dipilih');
      setShowStockSuggestions(false);
      setTickerInput('');
      return;
    }
    
    setSelectedTickers([...selectedTickers, stock]);
    setTickerInput('');
    setShowStockSuggestions(false);
  };

  const handleRemoveTicker = (stock: string) => {
    setSelectedTickers(selectedTickers.filter(t => t !== stock));
  };

  const handleStockInputChange = (value: string) => {
    setTickerInput(value);
    setShowStockSuggestions(true);

    // Clear previous timeout
    if (stockSearchTimeout) {
      clearTimeout(stockSearchTimeout);
    }

    // Set new timeout for debounced stock loading
    const timeout = setTimeout(async () => {
      // Load stocks if not already loaded and user is typing
      if (availableStocks.length === 0 && selectedDates.length > 0 && selectedDates[0]) {
        try {
          const stocksResult = await api.getBrokerSummaryStocks(selectedDates[0]);
          if (stocksResult.success && stocksResult.data?.stocks) {
            setAvailableStocks(stocksResult.data.stocks);
          }
        } catch (err) {
          console.error('Error loading stocks:', err);
        }
      }
    }, 300); // 300ms debounce

    setStockSearchTimeout(timeout);

    // Note: No auto-select on exact match for multiple selection
  };

  const filteredStocks = (availableStocks || []).filter(stock =>
    stock.toLowerCase().includes(tickerInput.toLowerCase())
  );

  // Helper function to trigger date picker
  const triggerDatePicker = (inputRef: React.RefObject<HTMLInputElement>) => {
    if (inputRef.current) {
      inputRef.current.showPicker();
    }
  };

  // Helper function to format date for input (YYYY-MM-DD)
  const formatDateForInput = (date: string) => {
    return date; // Already in YYYY-MM-DD format
  };

  // Font size fixed to normal (no menu)
  const getFontSizeClass = () => 'text-[13px]';

  // Helper function to filter brokers by F/D
  const brokerFDScreen = (broker: string): boolean => {
    if (fdFilter === 'Foreign') {
      return FOREIGN_BROKERS.includes(broker) && !GOVERNMENT_BROKERS.includes(broker);
    }
    if (fdFilter === 'Domestic') {
      return (!FOREIGN_BROKERS.includes(broker) || GOVERNMENT_BROKERS.includes(broker));
    }
    return true; // All
  };

  const renderHorizontalView = () => {
    if (selectedTickers.length === 0 || selectedDates.length === 0) return null;
    
    // Build view model from API data (for each ticker and date)
    const allTickerData = selectedTickers.map(ticker => {
      const tickerMap = summaryByTickerAndDate.get(ticker) || new Map<string, BrokerSummaryData[]>();
      return {
        ticker,
        dates: selectedDates.map(date => {
          const rows = tickerMap.get(date) || [];
          return {
            date,
            buyData: rows,
            sellData: rows
          };
        })
      };
    });
    
    return (
      <div className="w-full">
        {isLoading && (
          <div className="text-sm text-muted-foreground px-4 py-1">Loading broker summary...</div>
        )}
        {error && (
          <div className="text-sm text-destructive px-4 py-1">{error}</div>
        )}
        {/* Combined Buy & Sell Side Table */}
        <div className="w-full">
          <div className="bg-muted/50 px-4 py-1.5 border-y border-border">
            <h3 className="font-semibold text-sm">VALUE</h3>
          </div>
          <div className="w-full flex flex-col">
            {/* Level 1: Static Emiten Headers - Fixed at top, outside scroll area */}
            <div className="flex flex-shrink-0">
              {allTickerData.map((tickerData, tickerIdx) => (
                <React.Fragment key={`header-wrapper-${tickerData.ticker}`}>
                  <div 
                    key={`header-${tickerData.ticker}`} 
                    className={`flex-1 text-center py-0 px-2 font-medium text-white whitespace-nowrap bg-[#3a4252] border-t-[3px] border-t-white ${tickerIdx === 0 ? 'border-l-[3px] border-l-white' : 'border-l-[3px] border-l-white'} ${tickerIdx === allTickerData.length - 1 ? 'border-r-[3px] border-r-white' : ''}`}
                    style={tickerIdx < allTickerData.length - 1 ? {
                      borderRight: '3px solid white'
                    } : {}}
                  >
                    {tickerData.ticker}
                  </div>
                  {tickerIdx < allTickerData.length - 1 && (
                    <div 
                      className="bg-transparent"
                      style={{ width: '18px', flexShrink: 0 }}
                    />
                  )}
                </React.Fragment>
              ))}
            </div>
            {/* Level 2 & 3 & Body: Scrollable Content - Each Emiten has its own column */}
            <div className="flex max-h-[520px] overflow-y-auto overflow-x-auto">
              {allTickerData.map((tickerData, tickerIdx) => (
                <React.Fragment key={`scroll-wrapper-${tickerData.ticker}`}>
                  <div 
                    key={`scroll-${tickerData.ticker}`} 
                    className={`flex-1 flex flex-col min-w-0 flex-shrink-0 border-b-[3px] border-b-white ${tickerIdx === 0 ? 'border-l-[3px] border-l-white' : 'border-l-[3px] border-l-white'} ${tickerIdx === allTickerData.length - 1 ? 'border-r-[3px] border-r-white' : ''}`}
                    style={tickerIdx < allTickerData.length - 1 ? {
                      borderRight: '3px solid white'
                    } : {}}
                  >
                  {/* Level 2 & 3 & Body: Scrollable Content inside this emiten column */}
                  <div className="overflow-x-auto flex-1 min-w-0">
                    <table className={`w-full min-w-[600px] ${getFontSizeClass()} border-collapse table-auto`}>
                      <thead className="bg-[#3a4252] sticky top-0 z-10">
                        {/* Level 2: Date Headers + Total per Emiten */}
                        <tr className="border-b border-[#3a4252]">
                          {tickerData.dates.map((dateData, dateIdx) => (
                            <th key={dateData.date} className={`text-center py-0 px-2 font-medium text-white border border-[#3a4252] ${dateIdx < tickerData.dates.length - 1 ? 'border-r-[12px]' : 'border-r-8'} border-r-[#3a4252] whitespace-nowrap`} colSpan={9}>
                              {formatDisplayDate(dateData.date)}
                            </th>
                          ))}
                          <th className="text-center py-0 px-1 font-medium text-white border border-[#3a4252]" colSpan={7}>
                            Total
                          </th>
                        </tr>
                        {/* Level 3: Column Headers */}
                        <tr className="border-b border-[#3a4252] bg-[#3a4252]">
                          {tickerData.dates.map((dateData, dateIdx) => (
                            <React.Fragment key={`detail-${dateData.date}`}>
                              {/* BY Columns */}
                              <th className={`text-left py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>BY</th>
                              <th className={`text-right py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>BLot</th>
                              <th className={`text-right py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>BVal</th>
                              <th className={`text-right py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>BAvg</th>
                              {/* SL Columns */}
                              <th className="text-center py-0 px-1 font-medium text-white bg-[#3a4252] border border-[#3a4252]">#</th>
                              <th className={`text-left py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>SL</th>
                              <th className={`text-right py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>SLot</th>
                              <th className={`text-right py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>SVal</th>
                              <th className={`text-right py-0 px-[3px] font-medium text-white border border-[#3a4252] ${dateIdx < tickerData.dates.length - 1 ? 'border-r-[12px]' : 'border-r-8'} border-r-[#3a4252]`}>SAvg</th>
                            </React.Fragment>
                          ))}
                          {/* Total Columns per Emiten - No BAvg and SAvg */}
                          <th className={`text-left py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>BY</th>
                          <th className={`text-right py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>BLot</th>
                          <th className={`text-right py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>BVal</th>
                          <th className="text-center py-0 px-1 font-medium text-white bg-[#3a4252] border border-[#3a4252]">#</th>
                          <th className={`text-left py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>SL</th>
                          <th className={`text-right py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>SLot</th>
                          <th className={`text-right py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>SVal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          // Get broker text color class
                          const getBrokerColorClass = (brokerCode: string): string => {
                            if (GOVERNMENT_BROKERS.includes(brokerCode)) {
                              return 'text-green-600 font-semibold';
                            }
                            if (FOREIGN_BROKERS.includes(brokerCode)) {
                              return 'text-red-600 font-semibold';
                            }
                            return 'text-white font-semibold';
                          };
                          
                          // Calculate total data for this emiten only
                          const tickerBuyData: { [broker: string]: { nblot: number; nbval: number; bavg: number; count: number } } = {};
                          const tickerSellData: { [broker: string]: { nslot: number; nsval: number; savg: number; count: number } } = {};
                          
                          tickerData.dates.forEach(dateData => {
                            // BUY total uses Buyer metrics
                            dateData.buyData.forEach(b => {
                              if (b.buyerValue > 0) {
                                if (!tickerBuyData[b.broker]) {
                                  tickerBuyData[b.broker] = { nblot: 0, nbval: 0, bavg: 0, count: 0 };
                                }
                                const buyEntry = tickerBuyData[b.broker];
                                if (buyEntry) {
                                  buyEntry.nblot += b.buyerVol;
                                  buyEntry.nbval += b.buyerValue;
                                  buyEntry.bavg += b.bavg;
                                  buyEntry.count += 1;
                                }
                              }
                            });
                            
                            // SELL total uses Seller metrics
                            dateData.sellData.forEach(s => {
                              if (s.sellerValue > 0) {
                                if (!tickerSellData[s.broker]) {
                                  tickerSellData[s.broker] = { nslot: 0, nsval: 0, savg: 0, count: 0 };
                                }
                                const sellEntry = tickerSellData[s.broker];
                                if (sellEntry) {
                                  sellEntry.nslot += s.sellerVol;
                                  sellEntry.nsval += s.sellerValue;
                                  sellEntry.savg += s.savg;
                                  sellEntry.count += 1;
                                }
                              }
                            });
                          });
                          
                          // Sort total data for this ticker
                          const sortedTotalBuy = Object.entries(tickerBuyData)
                            .filter(([broker]) => brokerFDScreen(broker))
                            .map(([broker, data]) => ({ broker, ...data, bavg: data.bavg / data.count }))
                            .sort((a, b) => b.nbval - a.nbval);
                          
                          const sortedTotalSell = Object.entries(tickerSellData)
                            .filter(([broker]) => brokerFDScreen(broker))
                            .map(([broker, data]) => ({ broker, ...data, savg: data.savg / data.count }))
                            .sort((a, b) => b.nsval - a.nsval);
                          
                          // Find max row count for this ticker
                          let maxRows = 0;
                          tickerData.dates.forEach(dateData => {
                            const buyCount = (dateData.buyData || []).filter(b => brokerFDScreen(b.broker) && b.buyerValue > 0).length;
                            const sellCount = (dateData.sellData || []).filter(s => brokerFDScreen(s.broker) && s.sellerValue > 0).length;
                            maxRows = Math.max(maxRows, buyCount, sellCount);
                          });
                          maxRows = Math.max(maxRows, sortedTotalBuy.length, sortedTotalSell.length);
                          
                          // Render rows for this ticker only
                          return Array.from({ length: maxRows }).map((_, rowIdx) => {
                            const totalBuy = sortedTotalBuy[rowIdx];
                            const totalSell = sortedTotalSell[rowIdx];
                            
                            return (
                              <tr key={rowIdx} className="border-b border-[#3a4252]/50 hover:bg-accent/50">
                                {tickerData.dates.map((dateData, dateIdx) => {
                                  // Sort brokers for this date: Buy uses BuyerValue, Sell uses SellerValue
                                  const sortedByBuyerValue = (dateData.buyData || [])
                                    .filter(b => brokerFDScreen(b.broker))
                                    .filter(b => b.buyerValue > 0)
                                    .sort((a, b) => b.buyerValue - a.buyerValue);
                                  const sortedBySellerValue = (dateData.sellData || [])
                                    .filter(s => brokerFDScreen(s.broker))
                                    .filter(s => s.sellerValue > 0)
                                    .sort((a, b) => b.sellerValue - a.sellerValue);
                                  
                                  const buyData = sortedByBuyerValue[rowIdx];
                                  const sellData = sortedBySellerValue[rowIdx];
                                  
                                  return (
                                    <React.Fragment key={`${tickerData.ticker}-${dateData.date}-${rowIdx}`}>
                                      {/* BY (Buyer) Columns - Using Buyer fields */}
                                      <td className={`py-0 px-[3px] border border-[#3a4252] font-bold ${buyData ? getBrokerColorClass(buyData.broker) : ''}`}>
                                        {buyData?.broker || '-'}
                                      </td>
                                      <td className="text-right py-0 px-[3px] text-green-600 border border-[#3a4252] font-bold">
                                        {buyData ? formatLot(buyData.buyerVol / 100) : '-'}
                                      </td>
                                      <td className="text-right py-0 px-[3px] text-green-600 border border-[#3a4252] font-bold">
                                        {buyData ? formatNumber(buyData.buyerValue) : '-'}
                                      </td>
                                      <td className="text-right py-0 px-[3px] text-green-600 border border-[#3a4252] font-bold">
                                        {buyData ? formatAverage(buyData.bavg) : '-'}
                                      </td>
                                      {/* SL (Seller) Columns - Keep # column */}
                                      <td className={`text-center py-0 px-1 text-white border border-[#3a4252] bg-[#3a4252] font-bold ${sellData ? getBrokerColorClass(sellData.broker) : ''}`}>{sellData ? rowIdx + 1 : '-'}</td>
                                      <td className={`py-0 px-[3px] border border-[#3a4252] font-bold ${sellData ? getBrokerColorClass(sellData.broker) : ''}`}>
                                        {sellData?.broker || '-'}
                                      </td>
                                      <td className="text-right py-0 px-[3px] text-red-600 border border-[#3a4252] font-bold">
                                        {sellData ? formatLot(sellData.sellerVol / 100) : '-'}
                                      </td>
                                      <td className="text-right py-0 px-[3px] text-red-600 border border-[#3a4252] font-bold">
                                        {sellData ? formatNumber(sellData.sellerValue) : '-'}
                                      </td>
                                      <td className={`text-right py-0 px-[3px] text-red-600 border border-[#3a4252] font-bold ${dateIdx < tickerData.dates.length - 1 ? 'border-r-[12px]' : 'border-r-8'} border-r-[#3a4252]`}>
                                        {sellData ? formatAverage(sellData.savg) : '-'}
                                      </td>
                                    </React.Fragment>
                                  );
                                })}
                                {/* Total Columns per Emiten - No BAvg and SAvg */}
                                <td className={`py-0 px-[3px] border border-[#3a4252] font-bold ${totalBuy ? getBrokerColorClass(totalBuy.broker) : ''}`}>
                                  {totalBuy?.broker || '-'}
                                </td>
                                <td className="text-right py-0 px-[3px] text-green-600 border border-[#3a4252] font-bold">
                                  {totalBuy ? formatLot(totalBuy.nblot / 100) : '-'}
                                </td>
                                <td className="text-right py-0 px-[3px] text-green-600 border border-[#3a4252] font-bold">
                                  {totalBuy ? formatNumber(totalBuy.nbval) : '-'}
                                </td>
                                <td className={`text-center py-0 px-1 text-white border border-[#3a4252] bg-[#3a4252] font-bold ${totalSell ? getBrokerColorClass(totalSell.broker) : ''}`}>{totalSell ? rowIdx + 1 : '-'}</td>
                                <td className={`py-0 px-[3px] border border-[#3a4252] font-bold ${totalSell ? getBrokerColorClass(totalSell.broker) : ''}`}>
                                  {totalSell?.broker || '-'}
                                </td>
                                <td className="text-right py-0 px-[3px] text-red-600 border border-[#3a4252] font-bold">
                                  {totalSell ? formatLot(totalSell.nslot / 100) : '-'}
                                </td>
                                <td className={`text-right py-0 px-[3px] text-red-600 border border-[#3a4252] font-bold`}>
                                  {totalSell ? formatNumber(totalSell.nsval) : '-'}
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                  </div>
                  {tickerIdx < allTickerData.length - 1 && (
                    <div 
                      className="bg-transparent"
                      style={{ width: '18px', flexShrink: 0 }}
                    />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>

        {/* Net Table */}
        <div className="w-full mt-1">
          <div className="bg-muted/50 px-4 py-1.5 border-y border-border">
            <h3 className="font-semibold text-sm">NET</h3>
          </div>
          <div className="w-full flex flex-col">
            {/* Level 1: Static Emiten Headers - Fixed at top, outside scroll area */}
            <div className="flex flex-shrink-0">
              {allTickerData.map((tickerData, tickerIdx) => (
                <React.Fragment key={`header-net-wrapper-${tickerData.ticker}`}>
                  <div 
                    key={`header-net-${tickerData.ticker}`} 
                    className={`flex-1 text-center py-0 px-2 font-medium text-white whitespace-nowrap bg-[#3a4252] border-t-[3px] border-t-white ${tickerIdx === 0 ? 'border-l-[3px] border-l-white' : 'border-l-[3px] border-l-white'} ${tickerIdx === allTickerData.length - 1 ? 'border-r-[3px] border-r-white' : ''}`}
                    style={tickerIdx < allTickerData.length - 1 ? {
                      borderRight: '3px solid white'
                    } : {}}
                  >
                    {tickerData.ticker}
                  </div>
                  {tickerIdx < allTickerData.length - 1 && (
                    <div 
                      className="bg-transparent"
                      style={{ width: '18px', flexShrink: 0 }}
                    />
                  )}
                </React.Fragment>
              ))}
            </div>
            {/* Level 2 & 3 & Body: Scrollable Content - Each Emiten has its own column */}
            <div className="flex max-h-[520px] overflow-y-auto overflow-x-auto">
              {allTickerData.map((tickerData, tickerIdx) => (
                <React.Fragment key={`scroll-net-wrapper-${tickerData.ticker}`}>
                  <div 
                    key={`scroll-net-${tickerData.ticker}`} 
                    className={`flex-1 flex flex-col min-w-0 flex-shrink-0 border-b-[3px] border-b-white ${tickerIdx === 0 ? 'border-l-[3px] border-l-white' : 'border-l-[3px] border-l-white'} ${tickerIdx === allTickerData.length - 1 ? 'border-r-[3px] border-r-white' : ''}`}
                    style={tickerIdx < allTickerData.length - 1 ? {
                      borderRight: '3px solid white'
                    } : {}}
                  >
                  {/* Level 2 & 3 & Body: Scrollable Content inside this emiten column */}
                  <div className="overflow-x-auto flex-1 min-w-0">
                    <table className={`w-full min-w-[600px] ${getFontSizeClass()} border-collapse table-auto`}>
                      <thead className="bg-[#3a4252] sticky top-0 z-10">
                        {/* Level 2: Date Headers + Total per Emiten */}
                        <tr className="border-b border-[#3a4252]">
                          {tickerData.dates.map((dateData, dateIdx) => (
                            <th key={dateData.date} className={`text-center py-0 px-2 font-medium text-white border border-[#3a4252] ${dateIdx < tickerData.dates.length - 1 ? 'border-r-[12px]' : 'border-r-8'} border-r-[#3a4252] whitespace-nowrap`} colSpan={9}>
                              {formatDisplayDate(dateData.date)}
                            </th>
                          ))}
                          <th className="text-center py-0 px-1 font-medium text-white border border-[#3a4252]" colSpan={7}>
                            Total
                          </th>
                        </tr>
                        {/* Level 3: Column Headers */}
                        <tr className="border-b border-[#3a4252] bg-[#3a4252]">
                          {tickerData.dates.map((dateData, dateIdx) => (
                            <React.Fragment key={`detail-${dateData.date}`}>
                              {/* Net Buy Columns - No # */}
                              <th className={`text-left py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>BY</th>
                              <th className={`text-right py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>BLot</th>
                              <th className={`text-right py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>BVal</th>
                              <th className={`text-right py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>BAvg</th>
                              {/* Net Sell Columns - Keep # */}
                              <th className="text-center py-0 px-1 font-medium text-white bg-[#3a4252] border border-[#3a4252]">#</th>
                              <th className={`text-left py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>SL</th>
                              <th className={`text-right py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>SLot</th>
                              <th className={`text-right py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>SVal</th>
                              <th className={`text-right py-0 px-[3px] font-medium text-white border border-[#3a4252] ${dateIdx < tickerData.dates.length - 1 ? 'border-r-[12px]' : 'border-r-8'} border-r-[#3a4252]`}>SAvg</th>
                            </React.Fragment>
                          ))}
                          {/* Total Columns per Emiten - No Avg, No # for Buy */}
                          <th className={`text-left py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>BY</th>
                          <th className={`text-right py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>BLot</th>
                          <th className={`text-right py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>BVal</th>
                          <th className="text-center py-0 px-1 font-medium text-white bg-[#3a4252] border border-[#3a4252]">#</th>
                          <th className={`text-left py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>SL</th>
                          <th className={`text-right py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>SLot</th>
                          <th className={`text-right py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>SVal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          // Get broker text color class
                          const getBrokerColorClass = (brokerCode: string): string => {
                            if (GOVERNMENT_BROKERS.includes(brokerCode)) {
                              return 'text-green-600 font-semibold';
                            }
                            if (FOREIGN_BROKERS.includes(brokerCode)) {
                              return 'text-red-600 font-semibold';
                            }
                            return 'text-white font-semibold';
                          };
                          
                          // Calculate total net data for this emiten only
                          const tickerNetBuyData: { [broker: string]: { nblot: number; nbval: number; nbavg: number; count: number } } = {};
                          const tickerNetSellData: { [broker: string]: { nslot: number; nsval: number; nsavg: number; count: number } } = {};
                          
                          tickerData.dates.forEach(dateData => {
                            dateData.buyData.forEach(b => {
                              const netBuyLot = b.netBuyVol || 0;
                              const netBuyVal = b.netBuyValue || 0;
                              
                              if (netBuyVal < 0) { // swapped: net buy uses negatives
                                if (!tickerNetBuyData[b.broker]) {
                                  tickerNetBuyData[b.broker] = { nblot: 0, nbval: 0, nbavg: 0, count: 0 };
                                }
                                const netBuyEntry = tickerNetBuyData[b.broker];
                                if (netBuyEntry) {
                                  netBuyEntry.nblot += Math.abs(netBuyLot);
                                  netBuyEntry.nbval += Math.abs(netBuyVal);
                                  netBuyEntry.nbavg += Math.abs((netBuyVal / netBuyLot)) || 0;
                                  netBuyEntry.count += 1;
                                }
                              } else if (netBuyVal > 0) { // swapped: net sell uses positives
                                if (!tickerNetSellData[b.broker]) {
                                  tickerNetSellData[b.broker] = { nslot: 0, nsval: 0, nsavg: 0, count: 0 };
                                }
                                const netSellEntry = tickerNetSellData[b.broker];
                                if (netSellEntry) {
                                  netSellEntry.nslot += netBuyLot;
                                  netSellEntry.nsval += netBuyVal;
                                  netSellEntry.nsavg += (netBuyVal / netBuyLot) || 0;
                                  netSellEntry.count += 1;
                                }
                              }
                            });
                          });
                          
                          // Sort total data for this ticker
                          const sortedTotalNetBuy = Object.entries(tickerNetBuyData)
                            .filter(([broker]) => brokerFDScreen(broker))
                            .map(([broker, data]) => ({ broker, ...data, nbavg: data.nbavg / data.count }))
                            .sort((a, b) => b.nbval - a.nbval);
                          
                          const sortedTotalNetSell = Object.entries(tickerNetSellData)
                            .filter(([broker]) => brokerFDScreen(broker))
                            .map(([broker, data]) => ({ broker, ...data, nsavg: data.nsavg / data.count }))
                            .sort((a, b) => b.nsval - a.nsval);
                          
                          // Generate contrast colors like BrokerInventoryPage (HSL with high saturation)
                          const generateContrastColor = (index: number): string => {
                            const baseHues = [210, 270, 50, 200, 330]; // sky, violet, yellow, cyan, fuchsia
                            const hue = baseHues[index % baseHues.length];
                            const saturation = 60 + (index * 3) % 20; // 60-80% saturation
                            const lightness = 40 + (index * 2) % 15; // 40-55% lightness (darker for contrast)
                            return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
                          };
                          
                          // Generate contrast colors array for top 5
                          const bgColors = Array.from({ length: 5 }, (_, idx) => generateContrastColor(idx));
                          
                          // Create mapping: broker code -> color index (only for top 5)
                          const brokerToColorIndexBuy: { [broker: string]: number } = {};
                          const brokerToColorIndexSell: { [broker: string]: number } = {};
                          
                          sortedTotalNetBuy.slice(0, 5).forEach((item, idx) => {
                            brokerToColorIndexBuy[item.broker] = idx;
                          });
                          
                          sortedTotalNetSell.slice(0, 5).forEach((item, idx) => {
                            brokerToColorIndexSell[item.broker] = idx;
                          });
                          
                          // Helper function to get background color style based on broker code
                          const getNetBuyBgStyleByBroker = (broker: string): React.CSSProperties | undefined => {
                            const colorIdx = brokerToColorIndexBuy[broker];
                            if (colorIdx !== undefined && colorIdx < 5) {
                              return { backgroundColor: bgColors[colorIdx] || '', color: 'white' };
                            }
                            return undefined;
                          };
                          
                          const getNetSellBgStyleByBroker = (broker: string): React.CSSProperties | undefined => {
                            const colorIdx = brokerToColorIndexSell[broker];
                            if (colorIdx !== undefined && colorIdx < 5) {
                              return { backgroundColor: bgColors[colorIdx] || '', color: 'white' };
                            }
                            return undefined;
                          };
                          
                          // Find max row count for this ticker
                          let maxRows = 0;
                          tickerData.dates.forEach(dateData => {
                            const netBuyCount = (dateData.buyData || []).filter(b => brokerFDScreen(b.broker) && (b.netBuyValue || 0) < 0).length;
                            const netSellCount = (dateData.buyData || []).filter(b => brokerFDScreen(b.broker) && (b.netBuyValue || 0) > 0).length;
                            maxRows = Math.max(maxRows, netBuyCount, netSellCount);
                          });
                          maxRows = Math.max(maxRows, sortedTotalNetBuy.length, sortedTotalNetSell.length);
                          
                          // Render rows for this ticker only
                          return Array.from({ length: maxRows }).map((_, rowIdx) => {
                            const totalNetBuy = sortedTotalNetBuy[rowIdx];
                            const totalNetSell = sortedTotalNetSell[rowIdx];
                            
                            // Get background colors for total columns (top 5 only) based on broker code
                            const totalNetBuyBgStyle = totalNetBuy ? getNetBuyBgStyleByBroker(totalNetBuy.broker) : undefined;
                            const totalNetSellBgStyle = totalNetSell ? getNetSellBgStyleByBroker(totalNetSell.broker) : undefined;
                            
                            return (
                              <tr key={rowIdx} className="border-b border-[#3a4252]/50 hover:bg-accent/50">
                                {tickerData.dates.map((dateData, dateIdx) => {
                                  // Sort brokers for this date by NetBuyValue (SWAPPED)
                                  const sortedNetBuy = (dateData.buyData || [])
                                    .filter(b => brokerFDScreen(b.broker) && (b.netBuyValue || 0) < 0)
                                    .sort((a, b) => Math.abs(b.netBuyValue || 0) - Math.abs(a.netBuyValue || 0));
                                  const sortedNetSell = (dateData.buyData || [])
                                    .filter(b => brokerFDScreen(b.broker) && (b.netBuyValue || 0) > 0)
                                    .sort((a, b) => (b.netBuyValue || 0) - (a.netBuyValue || 0));
                                  const netBuyData = sortedNetBuy[rowIdx];
                                  const netSellData = sortedNetSell[rowIdx];
                                  
                                  // Calculate NSLot and NSVal (Buy - Sell) for Net Buy
                                  const nbLot = netBuyData ? Math.abs(netBuyData.netBuyVol || 0) : 0;
                                  const nbVal = netBuyData ? Math.abs(netBuyData.netBuyValue || 0) : 0;
                                  const nbAvg = nbLot !== 0 ? nbVal / nbLot : 0;
                                  
                                  // Calculate for Net Sell
                                  const nsLot = netSellData ? Math.abs(netSellData.netBuyVol || 0) : 0;
                                  const nsVal = netSellData ? Math.abs(netSellData.netBuyValue || 0) : 0;
                                  const nsAvg = nsLot !== 0 ? nsVal / nsLot : 0;
                                  
                                  // Get background colors based on broker code (not row index)
                                  const netBuyBgStyle = netBuyData ? getNetBuyBgStyleByBroker(netBuyData.broker) : undefined;
                                  const netSellBgStyle = netSellData ? getNetSellBgStyleByBroker(netSellData.broker) : undefined;
                                  
                                  return (
                                    <React.Fragment key={`${tickerData.ticker}-${dateData.date}-${rowIdx}`}>
                                      {/* Net Buy Columns - No # */}
                                      <td className={`py-0 px-[3px] border border-[#3a4252] font-bold ${netBuyData ? getBrokerColorClass(netBuyData.broker) : ''}`} style={netBuyBgStyle}>
                                        {netBuyData?.broker || '-'}
                                      </td>
                                      <td className={`text-right py-0 px-[3px] border border-[#3a4252] font-bold ${netBuyBgStyle ? '' : 'text-green-600'}`} style={netBuyBgStyle}>
                                        {netBuyData ? formatLot(nbLot / 100) : '-'}
                                      </td>
                                      <td className={`text-right py-0 px-[3px] border border-[#3a4252] font-bold ${netBuyBgStyle ? '' : 'text-green-600'}`} style={netBuyBgStyle}>
                                        {netBuyData ? formatNumber(nbVal) : '-'}
                                      </td>
                                      <td className={`text-right py-0 px-[3px] border border-[#3a4252] font-bold ${netBuyBgStyle ? '' : 'text-green-600'}`} style={netBuyBgStyle}>
                                        {netBuyData ? formatAverage(nbAvg) : '-'}
                                      </td>
                                      {/* Net Sell Columns - Keep # */}
                                      <td className={`text-center py-0 px-1 text-white border border-[#3a4252] bg-[#3a4252] font-bold ${netSellData ? getBrokerColorClass(netSellData.broker) : ''}`} style={netSellBgStyle}>{netSellData ? rowIdx + 1 : '-'}</td>
                                      <td className={`py-0 px-[3px] border border-[#3a4252] font-bold ${netSellData ? getBrokerColorClass(netSellData.broker) : ''}`} style={netSellBgStyle}>
                                        {netSellData?.broker || '-'}
                                      </td>
                                      <td className={`text-right py-0 px-[3px] border border-[#3a4252] font-bold ${netSellBgStyle ? '' : 'text-red-600'}`} style={netSellBgStyle}>
                                        {netSellData ? formatLot(nsLot / 100) : '-'}
                                      </td>
                                      <td className={`text-right py-0 px-[3px] border border-[#3a4252] font-bold ${netSellBgStyle ? '' : 'text-red-600'}`} style={netSellBgStyle}>
                                        {netSellData ? formatNumber(nsVal) : '-'}
                                      </td>
                                      <td className={`text-right py-0 px-[3px] border border-[#3a4252] font-bold ${dateIdx < tickerData.dates.length - 1 ? 'border-r-[12px]' : 'border-r-8'} border-r-[#3a4252] ${netSellBgStyle ? '' : 'text-red-600'}`} style={netSellBgStyle}>
                                        {netSellData ? formatAverage(nsAvg) : '-'}
                                      </td>
                                    </React.Fragment>
                                  );
                                })}
                                {/* Total Columns per Emiten - No Avg */}
                                <td className={`py-0 px-[3px] border border-[#3a4252] font-bold ${totalNetBuy ? getBrokerColorClass(totalNetBuy.broker) : ''}`} style={totalNetBuyBgStyle}>
                                  {totalNetBuy?.broker || '-'}
                                </td>
                                <td className={`text-right py-0 px-[3px] border border-[#3a4252] font-bold ${totalNetBuyBgStyle ? '' : 'text-green-600'}`} style={totalNetBuyBgStyle}>
                                  {totalNetBuy ? formatLot(totalNetBuy.nblot / 100) : '-'}
                                </td>
                                <td className={`text-right py-0 px-[3px] border border-[#3a4252] font-bold ${totalNetBuyBgStyle ? '' : 'text-green-600'}`} style={totalNetBuyBgStyle}>
                                  {totalNetBuy ? formatNumber(totalNetBuy.nbval) : '-'}
                                </td>
                                <td className={`text-center py-0 px-1 text-white border border-[#3a4252] bg-[#3a4252] font-bold ${totalNetSell ? getBrokerColorClass(totalNetSell.broker) : ''}`} style={totalNetSellBgStyle}>{totalNetSell ? rowIdx + 1 : '-'}</td>
                                <td className={`py-0 px-[3px] border border-[#3a4252] font-bold ${totalNetSell ? getBrokerColorClass(totalNetSell.broker) : ''}`} style={totalNetSellBgStyle}>
                                  {totalNetSell?.broker || '-'}
                                </td>
                                <td className={`text-right py-0 px-[3px] border border-[#3a4252] font-bold ${totalNetSellBgStyle ? '' : 'text-red-600'}`} style={totalNetSellBgStyle}>
                                  {totalNetSell ? formatLot(totalNetSell.nslot / 100) : '-'}
                                </td>
                                <td className={`text-right py-0 px-[3px] border border-[#3a4252] font-bold ${totalNetSellBgStyle ? '' : 'text-red-600'}`} style={totalNetSellBgStyle}>
                                  {totalNetSell ? formatNumber(totalNetSell.nsval) : '-'}
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                  </div>
                  {tickerIdx < allTickerData.length - 1 && (
                    <div 
                      className="bg-transparent"
                      style={{ width: '18px', flexShrink: 0 }}
                    />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full">
      {/* Top Controls - Compact without Card */}
      <div className="bg-background border-b border-[#3a4252] px-4 py-1.5">
            <div className="flex flex-wrap items-center gap-4">
              {/* Ticker Selection - Multiple Selection with Chips */}
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-sm font-medium whitespace-nowrap">Emiten:</label>
                {/* Selected Tickers as Chips */}
                {selectedTickers.map((ticker) => (
                  <div
                    key={ticker}
                    className="flex items-center gap-1 px-2 py-1 bg-primary/20 border border-primary/50 rounded-md text-sm"
                  >
                    <span className="font-medium">{ticker}</span>
                    <button
                      onClick={() => handleRemoveTicker(ticker)}
                      className="hover:bg-primary/30 rounded-full p-0.5 transition-colors"
                      aria-label={`Remove ${ticker}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {/* Ticker Input */}
                {selectedTickers.length < 5 && (
                  <div className="relative" ref={dropdownRef}>
                    <Search className="absolute left-3 top-1/2 pointer-events-none -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                    <input
                      type="text"
                      value={tickerInput}
                      onChange={(e) => { handleStockInputChange(e.target.value); setHighlightedStockIndex(0); }}
                      onFocus={() => { setShowStockSuggestions(true); setHighlightedStockIndex(0); }}
                      onKeyDown={(e) => {
                        const suggestions = (tickerInput === '' ? availableStocks : filteredStocks)
                          .filter(s => !selectedTickers.includes(s))
                          .slice(0, 10);
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
                      placeholder={selectedTickers.length === 0 ? "Code (max 5)" : "Add emiten..."}
                      className="w-32 pl-10 pr-3 py-2 text-sm border border-[#3a4252] rounded-md bg-input text-foreground"
                    />
                    {showStockSuggestions && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-[#3a4252] rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                        {availableStocks.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-muted-foreground flex items-center">
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            Loading stocks...
                          </div>
                        ) : tickerInput === '' ? (
                          <>
                            <div className="px-3 py-2 text-xs text-muted-foreground border-b border-[#3a4252]">
                              Available Stocks ({availableStocks.filter(s => !selectedTickers.includes(s)).length})
                            </div>
                            {availableStocks.filter(s => !selectedTickers.includes(s)).map(stock => (
                              <div
                                key={stock}
                                onClick={() => handleStockSelect(stock)}
                                className="px-3 py-2 hover:bg-muted cursor-pointer text-sm"
                              >
                                {stock}
                              </div>
                            ))}
                          </>
                        ) : filteredStocks.filter(s => !selectedTickers.includes(s)).length > 0 ? (
                          <>
                            <div className="px-3 py-2 text-xs text-muted-foreground border-b border-[#3a4252]">
                              {filteredStocks.filter(s => !selectedTickers.includes(s)).length} stocks found
                            </div>
                            {filteredStocks.filter(s => !selectedTickers.includes(s)).map(stock => (
                              <div
                                key={stock}
                                onClick={() => handleStockSelect(stock)}
                                className="px-3 py-2 hover:bg-muted cursor-pointer text-sm"
                              >
                                {stock}
                              </div>
                            ))}
                          </>
                        ) : (
                          <div className="px-3 py-2 text-sm text-muted-foreground">
                            No stocks found
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {selectedTickers.length >= 5 && (
                  <span className="text-xs text-muted-foreground">(Max 5 emiten)</span>
                )}
              </div>

              {/* Date Range */}
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium whitespace-nowrap">Date Range:</label>
              <div 
                className="relative h-9 w-36 rounded-md border border-input bg-background cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => triggerDatePicker(startDateRef)}
              >
                  <input
                  ref={startDateRef}
                    type="date"
                  value={formatDateForInput(startDate)}
                    onChange={(e) => {
                      const selectedDate = new Date(e.target.value);
                      const dayOfWeek = selectedDate.getDay();
                      if (dayOfWeek === 0 || dayOfWeek === 6) {
                        alert('Tidak bisa memilih hari Sabtu atau Minggu');
                        return;
                      }
                    
                    // Calculate trading days in the new range
                    const start = new Date(e.target.value);
                    const end = new Date(endDate || e.target.value);
                    const tradingDays: string[] = [];
                    const current = new Date(start);
                    
                    while (current <= end) {
                      const dayOfWeek = current.getDay();
                      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                        const dateString = current.toISOString().split('T')[0];
                        if (dateString) tradingDays.push(dateString);
                      }
                      current.setDate(current.getDate() + 1);
                    }
                    
                    // Check if trading days exceed 7
                    if (tradingDays.length > 7) {
                      alert('Maksimal 7 hari kerja yang bisa dipilih');
                      return;
                    }
                    
                      setStartDate(e.target.value);
                    // Auto update end date if not set or if start > end
                    if (!endDate || new Date(e.target.value) > new Date(endDate)) {
                      setEndDate(e.target.value);
                    }
                    setSelectedDates(tradingDays);
                  }}
                  onKeyDown={(e) => e.preventDefault()}
                  onPaste={(e) => e.preventDefault()}
                  onInput={(e) => e.preventDefault()}
                  max={formatDateForInput(endDate)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  style={{ caretColor: 'transparent' }}
                />
                <div className="flex items-center justify-between h-full px-3 py-2">
                  <span className="text-sm text-foreground">
                    {new Date(startDate).toLocaleDateString('en-GB', { 
                      day: '2-digit', 
                      month: '2-digit', 
                      year: 'numeric' 
                    })}
                  </span>
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
                  <span className="text-sm text-muted-foreground">to</span>
              <div 
                className="relative h-9 w-36 rounded-md border border-input bg-background cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => triggerDatePicker(endDateRef)}
              >
                  <input
                  ref={endDateRef}
                    type="date"
                  value={formatDateForInput(endDate)}
                    onChange={(e) => {
                      const selectedDate = new Date(e.target.value);
                      const dayOfWeek = selectedDate.getDay();
                      if (dayOfWeek === 0 || dayOfWeek === 6) {
                        alert('Tidak bisa memilih hari Sabtu atau Minggu');
                        return;
                      }
                    
                    // Calculate trading days in the new range
                    const start = new Date(startDate);
                    const end = new Date(e.target.value);
                    const tradingDays: string[] = [];
                    const current = new Date(start);
                    
                    while (current <= end) {
                      const dayOfWeek = current.getDay();
                      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                        const dateString = current.toISOString().split('T')[0];
                        if (dateString) tradingDays.push(dateString);
                      }
                      current.setDate(current.getDate() + 1);
                    }
                    
                    // Check if trading days exceed 7
                    if (tradingDays.length > 7) {
                      alert('Maksimal 7 hari kerja yang bisa dipilih');
                      return;
                    }
                    
                      setEndDate(e.target.value);
                    setSelectedDates(tradingDays);
                  }}
                  onKeyDown={(e) => e.preventDefault()}
                  onPaste={(e) => e.preventDefault()}
                  onInput={(e) => e.preventDefault()}
                  min={formatDateForInput(startDate)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  style={{ caretColor: 'transparent' }}
                />
                <div className="flex items-center justify-between h-full px-3 py-2">
                  <span className="text-sm text-foreground">
                    {new Date(endDate).toLocaleDateString('en-GB', { 
                      day: '2-digit', 
                      month: '2-digit', 
                      year: 'numeric' 
                    })}
                  </span>
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                </div>
                </div>
              </div>

            {/* F/D Filter - visual only */}
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium whitespace-nowrap">F/D:</label>
                  <select 
                  value={fdFilter}
                  onChange={(e) => setFdFilter(e.target.value as 'All' | 'Foreign' | 'Domestic')}
                  className="px-3 py-1.5 border border-[#3a4252] rounded-md bg-background text-foreground text-sm"
                >
                  <option value="All">All</option>
                  <option value="Foreign">Foreign</option>
                  <option value="Domestic">Domestic</option>
                  </select>
              </div>

            {/* Market Filter - visual only */}
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium whitespace-nowrap">Board:</label>
                <select
                  value={marketFilter}
                  onChange={(e) => setMarketFilter(e.target.value as 'RG' | 'TN' | 'NG' | '')}
                  className="px-3 py-1.5 border border-[#3a4252] rounded-md bg-background text-foreground text-sm"
                >
                  <option value="">All Trade</option>
                  <option value="RG">RG</option>
                  <option value="TN">TN</option>
                  <option value="NG">NG</option>
                </select>
              </div>
              </div>
            </div>

      {/* Main Data Display */}
      {renderHorizontalView()}
    </div>
  );
}
