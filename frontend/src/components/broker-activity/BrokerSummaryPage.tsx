import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2, Calendar } from 'lucide-react';
 
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
  const [selectedTicker, setSelectedTicker] = useState<string>(propSelectedStock || 'BBCA');
  const [tickerInput, setTickerInput] = useState<string>(propSelectedStock || 'BBCA');
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

  // dark mode hook used here once per component
  // dark mode hook removed; not needed for current color rules

  // API-driven broker summary data by date
  const [summaryByDate, setSummaryByDate] = useState<Map<string, BrokerSummaryData[]>>(new Map());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Update selectedTicker when prop changes
  useEffect(() => {
    if (propSelectedStock && propSelectedStock !== selectedTicker) {
      setSelectedTicker(propSelectedStock);
      setTickerInput(propSelectedStock);
    }
  }, [propSelectedStock, selectedTicker]);

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

  // Load broker summary data from backend for each selected date
  useEffect(() => {
    const fetchAll = async () => {
      if (!selectedTicker || selectedDates.length === 0) {
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const entries = await Promise.all(
           selectedDates.map(async (date) => {
            // When marketFilter is empty string (All Trade), send it as empty string, not default to 'RG'
            const market = marketFilter || '';
            console.log(`[BrokerSummary] Fetching data for ${selectedTicker} on ${date} with market: ${market || 'All Trade'}`);
            const res = await api.getBrokerSummaryData(selectedTicker, date, market as 'RG' | 'TN' | 'NG' | '');
            console.log(`[BrokerSummary] Response for ${date}:`, {
              success: res?.success,
              hasData: !!res?.data,
              hasBrokerData: !!res?.data?.brokerData,
              brokerDataLength: res?.data?.brokerData?.length || 0,
              error: res?.error,
              path: res?.data?.path
            });
            
            // Check if response is successful
            if (!res || !res.success) {
              console.error(`[BrokerSummary] Failed to fetch data for ${selectedTicker} on ${date}:`, res?.error || 'Unknown error');
              return [date, []] as const;
            }
            
            // Check if brokerData exists
            if (!res.data || !res.data.brokerData || !Array.isArray(res.data.brokerData)) {
              console.warn(`[BrokerSummary] No broker data in response for ${selectedTicker} on ${date}`);
              return [date, []] as const;
            }
            
            const rows: BrokerSummaryData[] = (res.data.brokerData ?? []).map((r: any, idx: number) => {
              // Backend sudah swap kolom Buyer dan Seller, jadi frontend tidak perlu swap lagi
              const mapped = {
                broker: r.BrokerCode ?? r.broker ?? r.BROKER ?? r.code ?? '',
                // Buyer fields - langsung dari BuyerVol, BuyerValue, BuyerAvg (backend sudah swap)
                buyerVol: Number(r.BuyerVol ?? 0),
                buyerValue: Number(r.BuyerValue ?? 0),
                bavg: Number(r.BuyerAvg ?? r.bavg ?? 0),
                // Seller fields - langsung dari SellerVol, SellerValue, SellerAvg (backend sudah swap)
                sellerVol: Number(r.SellerVol ?? 0),
                sellerValue: Number(r.SellerValue ?? 0),
                savg: Number(r.SellerAvg ?? r.savg ?? 0),
                // Net fields
                netBuyVol: Number(r.NetBuyVol ?? 0),
                netBuyValue: Number(r.NetBuyValue ?? 0),
                // Legacy fields for backward compatibility
                nblot: Number(r.NetBuyVol ?? r.nblot ?? 0),
                nbval: Number(r.NetBuyValue ?? r.nbval ?? 0),
                sl: Number(r.SellerVol ?? r.sl ?? 0),
                nslot: -Number(r.SellerVol ?? 0),
                nsval: -Number(r.SellerValue ?? 0)
              };
              
              // Debug first row mapping
              if (idx === 0) {
                console.log(`[BrokerSummary] Sample row mapping for ${date}:`, {
                  original: r,
                  mapped
                });
              }
              
              return mapped;
            }) as BrokerSummaryData[];
            
            console.log(`[BrokerSummary] Mapped ${rows.length} rows for ${selectedTicker} on ${date}`);
            return [date, rows] as const;
           })
        );
        const map = new Map<string, BrokerSummaryData[]>();
        entries.forEach(([date, rows]) => {
          map.set(date, [...rows]); // Convert readonly array to mutable array
          console.log(`[BrokerSummary] Stored ${rows.length} rows for date ${date}`);
        });
        setSummaryByDate(map);
        
        // Log summary
        const totalRows = Array.from(map.values()).reduce((sum, rows) => sum + rows.length, 0);
        console.log(`[BrokerSummary] Total rows loaded: ${totalRows} across ${map.size} dates`);
      } catch (e: any) {
        console.error('[BrokerSummary] Error fetching data:', e);
        setError(e?.message || 'Failed to load broker summary');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAll();
  }, [selectedTicker, selectedDates, marketFilter]);

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
    setSelectedTicker(stock);
    setTickerInput(stock);
    setShowStockSuggestions(false);
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

    // If exact match, select it
    if ((availableStocks || []).includes(value.toUpperCase())) {
      setSelectedTicker(value.toUpperCase());
    }
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
    if (!selectedTicker || selectedDates.length === 0) return null;
    
    // Build view model from API data (for each selected date)
    const allBrokerData = selectedDates.map(date => {
      const rows = summaryByDate.get(date) || [];
      return {
        date,
        buyData: rows,
        sellData: rows
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
            <h3 className="font-semibold text-sm">VALUE - {selectedTicker}</h3>
          </div>
          <div className="w-full">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className={`w-full min-w-[1000px] ${getFontSizeClass()} border-collapse table-auto`}>
                        <thead className="bg-gray-400 dark:bg-gray-700">
                          <tr className="border-b border-[#3a4252]">
                    {selectedDates.map((date) => (
                      <th key={date} className={`text-center py-0 px-2 font-medium text-white border border-[#3a4252] border-r-8 border-r-gray-500 dark:border-r-gray-400 whitespace-nowrap`} colSpan={9}>
                        {formatDisplayDate(date)}
                      </th>
                    ))}
                    <th className="text-center py-0 px-1 font-medium text-white border border-[#3a4252]" colSpan={7}>
                      Total
                    </th>
                  </tr>
                  <tr className="border-b border-[#3a4252] bg-gray-400 dark:bg-gray-700">
                    {selectedDates.map((date) => (
                      <React.Fragment key={`detail-${date}`}>
                        {/* BY Columns */}
                        <th className={`text-left py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>BY</th>
                        <th className={`text-right py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>BLot</th>
                        <th className={`text-right py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>BVal</th>
                        <th className={`text-right py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>BAvg</th>
                        {/* SL Columns */}
                        <th className="text-center py-0 px-1 font-medium text-white bg-gray-400 dark:bg-gray-700 border border-[#3a4252]">#</th>
                        <th className={`text-left py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>SL</th>
                        <th className={`text-right py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>SLot</th>
                        <th className={`text-right py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>SVal</th>
                        <th className={`text-right py-0 px-[3px] font-medium text-white border border-[#3a4252] border-r-8 border-r-gray-500 dark:border-r-gray-400`}>SAvg</th>
                      </React.Fragment>
                    ))}
                    {/* Total Columns - No BAvg and SAvg */}
                    <th className={`text-left py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>BY</th>
                    <th className={`text-right py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>BLot</th>
                    <th className={`text-right py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>BVal</th>
                    <th className="text-center py-0 px-1 font-medium text-white bg-gray-400 dark:bg-gray-700 border border-[#3a4252]">#</th>
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
                    
                    // Calculate total data across all dates (SWAPPED: Buy uses SELL fields, Sell uses BUY fields)
                    const totalBuyData: { [broker: string]: { nblot: number; nbval: number; bavg: number; count: number } } = {};
                    const totalSellData: { [broker: string]: { nslot: number; nsval: number; savg: number; count: number } } = {};
                    
                    allBrokerData.forEach(dateData => {
                      // BUY total uses Buyer metrics
                      dateData.buyData.forEach(b => {
                        if (b.buyerValue > 0) {
                          if (!totalBuyData[b.broker]) {
                            totalBuyData[b.broker] = { nblot: 0, nbval: 0, bavg: 0, count: 0 };
                          }
                          const buyEntry = totalBuyData[b.broker];
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
                          if (!totalSellData[s.broker]) {
                            totalSellData[s.broker] = { nslot: 0, nsval: 0, savg: 0, count: 0 };
                          }
                          const sellEntry = totalSellData[s.broker];
                          if (sellEntry) {
                            sellEntry.nslot += s.sellerVol;
                            sellEntry.nsval += s.sellerValue;
                            sellEntry.savg += s.savg;
                            sellEntry.count += 1;
                          }
                        }
                      });
                    });
                    
                    // Sort total data
                    const sortedTotalBuy = Object.entries(totalBuyData)
                      .filter(([broker]) => brokerFDScreen(broker))
                      .map(([broker, data]) => ({ broker, ...data, bavg: data.bavg / data.count }))
                      .sort((a, b) => b.nbval - a.nbval);
                    const sortedTotalSell = Object.entries(totalSellData)
                      .filter(([broker]) => brokerFDScreen(broker))
                      .map(([broker, data]) => ({ broker, ...data, savg: data.savg / data.count }))
                      .sort((a, b) => b.nsval - a.nsval);
                    
                    // Find max row count across all dates AND total columns
                    let maxRows = 0;
                    selectedDates.forEach(date => {
                      const dateData = allBrokerData.find(d => d.date === date);
                      const buyCount = (dateData?.buyData || []).filter(b => brokerFDScreen(b.broker) && b.buyerValue > 0).length;
                      const sellCount = (dateData?.sellData || []).filter(s => brokerFDScreen(s.broker) && s.sellerValue > 0).length;
                      maxRows = Math.max(maxRows, buyCount, sellCount);
                    });
                    
                    // Also include total broker counts in maxRows (for Total column)
                    const totalBuyCount = sortedTotalBuy.length;
                    const totalSellCount = sortedTotalSell.length;
                    maxRows = Math.max(maxRows, totalBuyCount, totalSellCount);
                    
                    // Render rows
                    return Array.from({ length: maxRows }).map((_, rowIdx) => (
                      <tr key={rowIdx} className="border-b border-[#3a4252]/50 hover:bg-accent/50">
                        {selectedDates.map((date) => {
                          const dateData = allBrokerData.find(d => d.date === date);
                          
                          // Sort brokers for this date: Buy uses BuyerValue, Sell uses SellerValue
                          const sortedByBuyerValue = (dateData?.buyData || [])
                            .filter(b => brokerFDScreen(b.broker))
                            .filter(b => b.buyerValue > 0)
                            .sort((a, b) => b.buyerValue - a.buyerValue);
                          const sortedBySellerValue = (dateData?.sellData || [])
                            .filter(s => brokerFDScreen(s.broker))
                            .filter(s => s.sellerValue > 0)
                            .sort((a, b) => b.sellerValue - a.sellerValue);
                          
                          const buyData = sortedByBuyerValue[rowIdx];
                          const sellData = sortedBySellerValue[rowIdx];
                          
                          return (
                            <React.Fragment key={`${date}-${rowIdx}`}>
                              {/* BY (Buyer) Columns - Using Buyer fields */}
                              <td className={`py-0 px-[3px] border border-[#3a4252] font-bold ${buyData ? getBrokerColorClass(buyData.broker) : ''}`}>
                                {buyData?.broker || '-'}
                              </td>
                              <td className="text-right py-0 px-[3px] text-green-600 border border-[#3a4252] font-bold">
                                {buyData ? formatNumber(buyData.buyerVol / 100) : '-'}
                              </td>
                              <td className="text-right py-0 px-[3px] text-green-600 border border-[#3a4252] font-bold">
                                {buyData ? formatNumber(buyData.buyerValue) : '-'}
                              </td>
                              <td className="text-right py-0 px-[3px] text-green-600 border border-[#3a4252] font-bold">
                                {buyData ? formatAverage(buyData.bavg) : '-'}
                              </td>
                              {/* SL (Seller) Columns - Keep # column */}
                              <td className={`text-center py-0 px-1 text-white border border-[#3a4252] bg-gray-400 dark:bg-gray-700 font-bold ${sellData ? getBrokerColorClass(sellData.broker) : ''}`}>{sellData ? rowIdx + 1 : '-'}</td>
                              <td className={`py-0 px-[3px] border border-[#3a4252] font-bold ${sellData ? getBrokerColorClass(sellData.broker) : ''}`}>
                                {sellData?.broker || '-'}
                              </td>
                              <td className="text-right py-0 px-[3px] text-red-600 border border-[#3a4252] font-bold">
                                {sellData ? formatNumber(sellData.sellerVol / 100) : '-'}
                              </td>
                              <td className="text-right py-0 px-[3px] text-red-600 border border-[#3a4252] font-bold">
                                {sellData ? formatNumber(sellData.sellerValue) : '-'}
                              </td>
                              <td className="text-right py-0 px-[3px] text-red-600 border border-[#3a4252] border-r-8 border-r-gray-500 dark:border-r-gray-400 font-bold">
                                {sellData ? formatAverage(sellData.savg) : '-'}
                              </td>
                            </React.Fragment>
                          );
                        })}
                        {/* Total Columns - No BAvg and SAvg */}
                        {(() => {
                          const totalBuy = sortedTotalBuy[rowIdx];
                          const totalSell = sortedTotalSell[rowIdx];
                          return (
                            <React.Fragment>
                              <td className={`py-0 px-[3px] border border-[#3a4252] font-bold ${totalBuy ? getBrokerColorClass(totalBuy.broker) : ''}`}>
                                {totalBuy?.broker || '-'}
                              </td>
                              <td className="text-right py-0 px-[3px] text-green-600 border border-[#3a4252] font-bold">
                                {totalBuy ? formatNumber(totalBuy.nblot / 100) : '-'}
                              </td>
                              <td className="text-right py-0 px-[3px] text-green-600 border border-[#3a4252] font-bold">
                                {totalBuy ? formatNumber(totalBuy.nbval) : '-'}
                              </td>
                              <td className={`text-center py-0 px-1 text-white border border-[#3a4252] bg-gray-400 dark:bg-gray-700 font-bold ${totalSell ? getBrokerColorClass(totalSell.broker) : ''}`}>{totalSell ? rowIdx + 1 : '-'}</td>
                              <td className={`py-0 px-[3px] border border-[#3a4252] font-bold ${totalSell ? getBrokerColorClass(totalSell.broker) : ''}`}>
                                {totalSell?.broker || '-'}
                              </td>
                              <td className="text-right py-0 px-[3px] text-red-600 border border-[#3a4252] font-bold">
                                {totalSell ? formatNumber(totalSell.nslot / 100) : '-'}
                              </td>
                              <td className="text-right py-0 px-[3px] text-red-600 border border-[#3a4252] font-bold">
                                {totalSell ? formatNumber(totalSell.nsval) : '-'}
                              </td>
                            </React.Fragment>
                          );
                        })()}
                      </tr>
                    ));
                  })()}
                        </tbody>
                      </table>
                    </div>
                </div>
              </div>

        {/* Net Table */}
        <div className="w-full mt-1">
          <div className="bg-muted/50 px-4 py-1.5 border-y border-border">
            <h3 className="font-semibold text-sm">NET - {selectedTicker}</h3>
          </div>
          <div className="w-full">
                    <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className={`w-full min-w-[1000px] ${getFontSizeClass()} border-collapse table-auto`}>
                        <thead className="bg-gray-400 dark:bg-gray-700">
                          <tr className="border-b border-[#3a4252]">
                    {selectedDates.map((date) => (
                      <th key={date} className={`text-center py-0 px-2 font-medium text-white border border-[#3a4252] border-r-8 border-r-gray-500 dark:border-r-gray-400 whitespace-nowrap`} colSpan={9}>
                        {formatDisplayDate(date)}
                      </th>
                    ))}
                    <th className="text-center py-0 px-1 font-medium text-white border border-[#3a4252]" colSpan={7}>
                      Total
                    </th>
                  </tr>
                  <tr className="border-b border-[#3a4252] bg-gray-400 dark:bg-gray-700">
                    {selectedDates.map((date) => (
                      <React.Fragment key={`detail-${date}`}>
                        {/* Net Buy Columns - No # */}
                        <th className={`text-left py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>BY</th>
                        <th className={`text-right py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>BLot</th>
                        <th className={`text-right py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>BVal</th>
                        <th className={`text-right py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>BAvg</th>
                        {/* Net Sell Columns - Keep # */}
                        <th className="text-center py-0 px-1 font-medium text-white bg-gray-400 dark:bg-gray-700 border border-[#3a4252]">#</th>
                        <th className={`text-left py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>SL</th>
                        <th className={`text-right py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>SLot</th>
                        <th className={`text-right py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>SVal</th>
                        <th className={`text-right py-0 px-[3px] font-medium text-white border border-[#3a4252] border-r-8 border-r-gray-500 dark:border-r-gray-400`}>SAvg</th>
                      </React.Fragment>
                    ))}
                    {/* Total Columns - No Avg, No # for Buy */}
                    <th className={`text-left py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>BY</th>
                    <th className={`text-right py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>BLot</th>
                    <th className={`text-right py-0 px-[3px] font-medium text-white border border-[#3a4252]`}>BVal</th>
                    <th className="text-center py-0 px-1 font-medium text-white bg-gray-400 dark:bg-gray-700 border border-[#3a4252]">#</th>
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
                    
                    // Calculate total net data across all dates (SWAPPED: Net Buy uses negative values)
                    const totalNetBuyData: { [broker: string]: { nblot: number; nbval: number; nbavg: number; count: number } } = {};
                    const totalNetSellData: { [broker: string]: { nslot: number; nsval: number; nsavg: number; count: number } } = {};
                    
                    allBrokerData.forEach(dateData => {
                      dateData.buyData.forEach(b => {
                        const netBuyLot = b.netBuyVol || 0;
                        const netBuyVal = b.netBuyValue || 0;
                        
                        if (netBuyVal < 0) { // swapped: net buy uses negatives
                          if (!totalNetBuyData[b.broker]) {
                            totalNetBuyData[b.broker] = { nblot: 0, nbval: 0, nbavg: 0, count: 0 };
                          }
                          const netBuyEntry = totalNetBuyData[b.broker];
                          if (netBuyEntry) {
                            netBuyEntry.nblot += Math.abs(netBuyLot);
                            netBuyEntry.nbval += Math.abs(netBuyVal);
                            netBuyEntry.nbavg += Math.abs((netBuyVal / netBuyLot)) || 0;
                            netBuyEntry.count += 1;
                          }
                        } else if (netBuyVal > 0) { // swapped: net sell uses positives
                          if (!totalNetSellData[b.broker]) {
                            totalNetSellData[b.broker] = { nslot: 0, nsval: 0, nsavg: 0, count: 0 };
                          }
                          const netSellEntry = totalNetSellData[b.broker];
                          if (netSellEntry) {
                            netSellEntry.nslot += netBuyLot;
                            netSellEntry.nsval += netBuyVal;
                            netSellEntry.nsavg += (netBuyVal / netBuyLot) || 0;
                            netSellEntry.count += 1;
                          }
                        }
                      });
                    });
                    
                    // Sort total data
                    const sortedTotalNetBuy = Object.entries(totalNetBuyData)
                      .filter(([broker]) => brokerFDScreen(broker))
                      .map(([broker, data]) => ({ broker, ...data, nbavg: data.nbavg / data.count }))
                      .sort((a, b) => b.nbval - a.nbval);
                    const sortedTotalNetSell = Object.entries(totalNetSellData)
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
                    
                    // Map top 5 net buy brokers to background colors (HSL strings)
                    const netBuyBrokerBgMap = new Map<string, string>();
                    sortedTotalNetBuy.slice(0, 5).forEach((item, idx) => {
                      netBuyBrokerBgMap.set(item.broker, bgColors[idx] || '');
                    });
                    
                    // Map top 5 net sell brokers to background colors (HSL strings)
                    const netSellBrokerBgMap = new Map<string, string>();
                    sortedTotalNetSell.slice(0, 5).forEach((item, idx) => {
                      netSellBrokerBgMap.set(item.broker, bgColors[idx] || '');
                    });
                    
                    // Helper function to get background color style for net buy broker
                    const getNetBuyBgStyle = (broker: string): React.CSSProperties | undefined => {
                      const color = netBuyBrokerBgMap.get(broker);
                      return color ? { backgroundColor: color, color: 'white' } : undefined;
                    };
                    
                    // Helper function to get background color style for net sell broker
                    const getNetSellBgStyle = (broker: string): React.CSSProperties | undefined => {
                      const color = netSellBrokerBgMap.get(broker);
                      return color ? { backgroundColor: color, color: 'white' } : undefined;
                    };
                    
                    // Find max row count across all dates
                    let maxRows = 0;
                    selectedDates.forEach(date => {
                      const dateData = allBrokerData.find(d => d.date === date);
                      const netBuyCount = (dateData?.buyData || []).filter(b => brokerFDScreen(b.broker) && (b.netBuyValue || 0) < 0).length; // swap + F/D filter
                      const netSellCount = (dateData?.buyData || []).filter(b => brokerFDScreen(b.broker) && (b.netBuyValue || 0) > 0).length; // swap + F/D filter
                      maxRows = Math.max(maxRows, netBuyCount, netSellCount);
                    });
                    
                    // Render rows
                    return Array.from({ length: maxRows }).map((_, rowIdx) => {
                      // Cek apakah broker pada row adalah top5
                      // (delete unused block: netBuyData/netSellData functions)
                      return (
                        <tr key={rowIdx} className="border-b border-[#3a4252]/50 hover:bg-accent/50">
                          {selectedDates.map((date) => {
                            const dateData = allBrokerData.find(d => d.date === date);
                            // Sort brokers for this date by NetBuyValue (SWAPPED)
                            const sortedNetBuy = (dateData?.buyData || [])
                              .filter(b => (b.netBuyValue || 0) < 0)
                              .sort((a, b) => Math.abs(b.netBuyValue || 0) - Math.abs(a.netBuyValue || 0));
                            const sortedNetSell = (dateData?.buyData || [])
                              .filter(b => (b.netBuyValue || 0) > 0)
                              .sort((a, b) => (b.netBuyValue || 0) - (a.netBuyValue || 0));
                            const netBuyData = sortedNetBuy[rowIdx];
                            const netSellData = sortedNetSell[rowIdx];
                            // Calculate data...
                            // Calculate NSLot and NSVal (Buy - Sell) for Net Buy
                            const nbLot = netBuyData ? Math.abs(netBuyData.netBuyVol || 0) : 0;
                            const nbVal = netBuyData ? Math.abs(netBuyData.netBuyValue || 0) : 0;
                            const nbAvg = nbLot !== 0 ? nbVal / nbLot : 0;
                            
                            // Calculate for Net Sell
                            const nsLot = netSellData ? Math.abs(netSellData.netBuyVol || 0) : 0;
                            const nsVal = netSellData ? Math.abs(netSellData.netBuyValue || 0) : 0;
                            const nsAvg = nsLot !== 0 ? nsVal / nsLot : 0;
                            
                            // Get background colors for this row
                            const netBuyBgStyle = netBuyData ? getNetBuyBgStyle(netBuyData.broker) : undefined;
                            const netSellBgStyle = netSellData ? getNetSellBgStyle(netSellData.broker) : undefined;
                            
                            return (
                              <React.Fragment key={`${date}-${rowIdx}`}>
                                {/* Net Buy Columns - No # */}
                                <td className={`py-0 px-[3px] border border-[#3a4252] font-bold ${netBuyData ? getBrokerColorClass(netBuyData.broker) : ''}`} style={netBuyBgStyle}>
                                  {netBuyData?.broker || '-'}
                                </td>
                                <td className={`text-right py-0 px-[3px] border border-[#3a4252] font-bold ${netBuyBgStyle ? '' : 'text-green-600'}`} style={netBuyBgStyle}>
                                  {netBuyData ? formatNumber(nbLot / 100) : '-'}
                                </td>
                                <td className={`text-right py-0 px-[3px] border border-[#3a4252] font-bold ${netBuyBgStyle ? '' : 'text-green-600'}`} style={netBuyBgStyle}>
                                  {netBuyData ? formatNumber(nbVal) : '-'}
                                </td>
                                <td className={`text-right py-0 px-[3px] border border-[#3a4252] font-bold ${netBuyBgStyle ? '' : 'text-green-600'}`} style={netBuyBgStyle}>
                                  {netBuyData ? formatAverage(nbAvg) : '-'}
                                </td>
                                {/* Net Sell Columns - Keep # */}
                                <td className={`text-center py-0 px-1 text-white border border-[#3a4252] bg-gray-400 dark:bg-gray-700 font-bold ${netSellData ? getBrokerColorClass(netSellData.broker) : ''}`} style={netSellBgStyle}>{netSellData ? rowIdx + 1 : '-'}</td>
                                <td className={`py-0 px-[3px] border border-[#3a4252] font-bold ${netSellData ? getBrokerColorClass(netSellData.broker) : ''}`} style={netSellBgStyle}>
                                  {netSellData?.broker || '-'}
                                </td>
                                <td className={`text-right py-0 px-[3px] border border-[#3a4252] font-bold ${netSellBgStyle ? '' : 'text-red-600'}`} style={netSellBgStyle}>
                                  {netSellData ? formatNumber(nsLot / 100) : '-'}
                                </td>
                                <td className={`text-right py-0 px-[3px] border border-[#3a4252] font-bold ${netSellBgStyle ? '' : 'text-red-600'}`} style={netSellBgStyle}>
                                  {netSellData ? formatNumber(nsVal) : '-'}
                                </td>
                                <td className={`text-right py-0 px-[3px] border border-[#3a4252] font-bold border-r-8 border-r-gray-500 dark:border-r-gray-400 ${netSellBgStyle ? '' : 'text-red-600'}`} style={netSellBgStyle}>
                                  {netSellData ? formatAverage(nsAvg) : '-'}
                                </td>
                              </React.Fragment>
                            );
                          })}
                          {/* Total Columns - No Avg */}
                          {(() => {
                            const totalNetBuy = sortedTotalNetBuy[rowIdx];
                            const totalNetSell = sortedTotalNetSell[rowIdx];
                            
                            // Get background colors for total columns (top 5 only)
                            const totalNetBuyBgStyle = totalNetBuy && rowIdx < 5 ? { backgroundColor: bgColors[rowIdx] || '', color: 'white' } : undefined;
                            const totalNetSellBgStyle = totalNetSell && rowIdx < 5 ? { backgroundColor: bgColors[rowIdx] || '', color: 'white' } : undefined;
                            
                            return (
                              <React.Fragment>
                                <td className={`py-0 px-[3px] border border-[#3a4252] font-bold ${totalNetBuy ? getBrokerColorClass(totalNetBuy.broker) : ''}`} style={totalNetBuyBgStyle}>
                                  {totalNetBuy?.broker || '-'}
                                </td>
                                <td className={`text-right py-0 px-[3px] border border-[#3a4252] font-bold ${totalNetBuyBgStyle ? '' : 'text-green-600'}`} style={totalNetBuyBgStyle}>
                                  {totalNetBuy ? formatNumber(totalNetBuy.nblot / 100) : '-'}
                                </td>
                                <td className={`text-right py-0 px-[3px] border border-[#3a4252] font-bold ${totalNetBuyBgStyle ? '' : 'text-green-600'}`} style={totalNetBuyBgStyle}>
                                  {totalNetBuy ? formatNumber(totalNetBuy.nbval) : '-'}
                                </td>
                                <td className={`text-center py-0 px-1 text-white border border-[#3a4252] bg-gray-400 dark:bg-gray-700 font-bold ${totalNetSell ? getBrokerColorClass(totalNetSell.broker) : ''}`} style={totalNetSellBgStyle}>{totalNetSell ? rowIdx + 1 : '-'}</td>
                                <td className={`py-0 px-[3px] border border-[#3a4252] font-bold ${totalNetSell ? getBrokerColorClass(totalNetSell.broker) : ''}`} style={totalNetSellBgStyle}>
                                  {totalNetSell?.broker || '-'}
                                </td>
                                <td className={`text-right py-0 px-[3px] border border-[#3a4252] font-bold ${totalNetSellBgStyle ? '' : 'text-red-600'}`} style={totalNetSellBgStyle}>
                                  {totalNetSell ? formatNumber(totalNetSell.nslot / 100) : '-'}
                                </td>
                                <td className={`text-right py-0 px-[3px] border border-[#3a4252] font-bold ${totalNetSellBgStyle ? '' : 'text-red-600'}`} style={totalNetSellBgStyle}>
                                  {totalNetSell ? formatNumber(totalNetSell.nsval) : '-'}
                                </td>
                              </React.Fragment>
                            );
                          })()}
                        </tr>
                      );
                    });
                  })()}
                        </tbody>
                      </table>
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
              {/* Ticker Selection */}
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium whitespace-nowrap">Ticker:</label>
                <div className="relative" ref={dropdownRef}>
                  <Search className="absolute left-3 top-1/2 pointer-events-none -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                  <input
                    type="text"
                    value={tickerInput}
                    onChange={(e) => { handleStockInputChange(e.target.value); setHighlightedStockIndex(0); }}
                    onFocus={() => { setShowStockSuggestions(true); setHighlightedStockIndex(0); }}
                    onKeyDown={(e) => {
                      const suggestions = (tickerInput === '' ? availableStocks : filteredStocks).slice(0, 10);
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
                    placeholder="Code"
                    className="w-24 pl-10 pr-3 py-2 text-sm border border-[#3a4252] rounded-md bg-input text-foreground"
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
                            Available Stocks ({availableStocks.length})
                          </div>
                          {availableStocks.map(stock => (
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
                        <>
                          <div className="px-3 py-2 text-xs text-muted-foreground border-b border-[#3a4252]">
                            {filteredStocks.length} stocks found
                          </div>
                          {filteredStocks.map(stock => (
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
