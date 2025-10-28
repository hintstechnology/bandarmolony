import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { RotateCcw, Search, Loader2 } from 'lucide-react';
import { getBrokerTextClass, useDarkMode } from '../../utils/brokerColors';
import { api } from '../../services/api';

interface BrokerSummaryData {
  broker: string;
  nblot: number;      // BuyerVol (for BLot in BUY table)
  nbval: number;      // BuyerValue (for BVal in BUY table)
  bavg: number;       // BuyerAvg (for BAvg in BUY table)
  sl: number;
  nslot: number;      // SellerVol (for SLot in SELL table)
  nsval: number;      // SellerValue (for SVal in SELL table)
  savg: number;       // SellerAvg (for SAvg in SELL table)
  netBuyVol: number;  // NetBuyVol (for NBLot in NET table)
  netBuyValue: number; // NetBuyValue (for NBVal in NET table)
}

// Note: TICKERS constant removed - now using dynamic stock loading from API

// Foreign brokers (red background)
const FOREIGN_BROKERS = [
  'AG', 'AH', 'AI', 'AK', 'AO', 'AT', 'AZ', 'BB', 'BK', 'BQ', 'CC', 'CD', 'CP', 
  'DH', 'DP', 'DR', 'DU', 'DX', 'EP', 'FS', 'GR', 'GW', 'HD', 'HP', 'IF', 'II', 
  'KI', 'KK', 'KZ', 'LG', 'MG', 'MU', 'NI', 'OD', 'PD', 'PP', 'QA', 'RB', 'RF', 
  'RX', 'SQ', 'SS', 'TP', 'XA', 'XC', 'XL', 'YB', 'YJ', 'YO', 'YP', 'YU', 'ZP'
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
  const [fontSize, setFontSize] = useState<'small' | 'normal' | 'large'>('normal');
  
  // Stock selection state
  const [availableStocks, setAvailableStocks] = useState<string[]>([]);
  const [showStockSuggestions, setShowStockSuggestions] = useState(false);
  const [highlightedStockIndex, setHighlightedStockIndex] = useState<number>(-1);
  const [stockSearchTimeout, setStockSearchTimeout] = useState<NodeJS.Timeout | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // dark mode hook used here once per component
  const isDarkMode = useDarkMode();

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
          const stocksResult = await api.getBrokerSummaryStocks(selectedDates[0]);
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
  }, [selectedDates]);

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
            const res = await api.getBrokerSummaryData(selectedTicker, date);
            const rows: BrokerSummaryData[] = (res?.data?.brokerData ?? []).map((r: any) => ({
              broker: r.BrokerCode ?? r.broker ?? r.BROKER ?? r.code ?? '',
              // WORKAROUND: Backend sends nblot/nbval as NetBuyVol/NetBuyValue
              // We need to calculate BuyerVol/BuyerValue from NetBuyVol + SellerVol
              nblot: Number(r.nblot ?? 0) + Number(Math.abs(r.nslot ?? 0)), // NetBuyVol + |SellerVol|
              nbval: Number(r.nbval ?? 0) + Number(Math.abs(r.nsval ?? 0)), // NetBuyValue + |SellerValue|
              bavg: Number(r.bavg ?? 0),
              // SELL side - use absolute values of nslot/nsval
              nslot: Number(Math.abs(r.nslot ?? 0)),
              nsval: Number(Math.abs(r.nsval ?? 0)),
              savg: Number(r.savg ?? 0),
              sl: Number(r.sl ?? 0),
              // NET side - use nblot/nbval directly (these are NetBuyVol/NetBuyValue)
              netBuyVol: Number(r.nblot ?? 0),
              netBuyValue: Number(r.nbval ?? 0)
             })) as BrokerSummaryData[];
             
             return [date, rows] as const;
           })
        );
        const map = new Map<string, BrokerSummaryData[]>();
        entries.forEach(([date, rows]) => map.set(date, rows));
        setSummaryByDate(map);
      } catch (e: any) {
        setError(e?.message || 'Failed to load broker summary');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAll();
  }, [selectedTicker, selectedDates]);

  const clearAllDates = () => {
    // Reset to last 3 trading days
    const threeDays = getLastThreeDays();
    const sortedDates = [...threeDays].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    
    // Always create new array reference to force useEffect trigger
    setSelectedDates([...sortedDates]);
    setStartDate(sortedDates[0] ?? '');
    setEndDate(sortedDates[sortedDates.length - 1] ?? '');
  };

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

  // Get font size class based on selected fontSize
  const getFontSizeClass = () => {
    switch (fontSize) {
      case 'small':
        return 'text-[10px]';
      case 'large':
        return 'text-[16px]';
      default:
        return 'text-[13px]';
    }
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
      <div className="space-y-6">
        {isLoading && (
          <div className="text-sm text-muted-foreground">Loading broker summary...</div>
        )}
        {error && (
          <div className="text-sm text-destructive">{error}</div>
        )}
        {/* Combined Buy & Sell Side Table */}
                <Card>
                  <CardHeader>
            <CardTitle>
              VALUE - {selectedTicker}
            </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto rounded-md max-h-[600px] overflow-y-auto">
              <table className={`w-full min-w-[1000px] ${getFontSizeClass()} border-collapse`}>
                        <thead className="bg-background">
                          <tr className="border-b border-border">
                    {selectedDates.map((date) => (
                      <th key={date} className={`text-center py-1 px-1 font-medium border border-border`} colSpan={9}>
                        {formatDisplayDate(date)}
                      </th>
                    ))}
                    <th className="text-center py-1 px-1 font-medium border border-border" colSpan={7}>
                      Total
                    </th>
                  </tr>
                  <tr className="border-b border-border">
                    {selectedDates.map((date) => (
                      <React.Fragment key={`detail-${date}`}>
                        {/* NBY Columns */}
                        <th className={`text-left py-1 px-1 font-medium text-green-600 border border-border`}>NBY</th>
                        <th className={`text-right py-1 px-1 font-medium text-green-600 border border-border`}>BLot</th>
                        <th className={`text-right py-1 px-1 font-medium text-green-600 border border-border`}>BVal</th>
                        <th className={`text-right py-1 px-1 font-medium border border-border`}>BAvg</th>
                        {/* NSL Columns */}
                        <th className={`text-center py-1 px-1 font-medium text-red-600 border border-border`}>#</th>
                        <th className={`text-left py-1 px-1 font-medium text-red-600 border border-border`}>NSL</th>
                        <th className={`text-right py-1 px-1 font-medium text-red-600 border border-border`}>SLot</th>
                        <th className={`text-right py-1 px-1 font-medium text-red-600 border border-border`}>SVal</th>
                        <th className={`text-right py-1 px-1 font-medium border border-border`}>SAvg</th>
                      </React.Fragment>
                    ))}
                    {/* Total Columns - No BAvg and SAvg */}
                    <th className={`text-left py-1 px-1 font-medium text-green-600 border border-border`}>NBY</th>
                    <th className={`text-right py-1 px-1 font-medium text-green-600 border border-border`}>BLot</th>
                    <th className={`text-right py-1 px-1 font-medium text-green-600 border border-border`}>BVal</th>
                    <th className={`text-center py-1 px-1 font-medium text-red-600 border border-border`}>#</th>
                    <th className={`text-left py-1 px-1 font-medium text-red-600 border border-border`}>NSL</th>
                    <th className={`text-right py-1 px-1 font-medium text-red-600 border border-border`}>SLot</th>
                    <th className={`text-right py-1 px-1 font-medium text-red-600 border border-border`}>SVal</th>
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
                      return getBrokerTextClass(brokerCode, isDarkMode);
                    };
                    
                    // Calculate total data across all dates
                    const totalBuyData: { [broker: string]: { nblot: number; nbval: number; bavg: number; count: number } } = {};
                    const totalSellData: { [broker: string]: { nslot: number; nsval: number; savg: number; count: number } } = {};
                    
                    allBrokerData.forEach(dateData => {
                      dateData.buyData.forEach(b => {
                        if (b.nbval > 0) {
                          if (!totalBuyData[b.broker]) {
                            totalBuyData[b.broker] = { nblot: 0, nbval: 0, bavg: 0, count: 0 };
                          }
                          const buyEntry = totalBuyData[b.broker];
                          if (buyEntry) {
                            buyEntry.nblot += b.nblot;
                            buyEntry.nbval += b.nbval;
                            buyEntry.bavg += b.bavg;
                            buyEntry.count += 1;
                          }
                        }
                      });
                      
                      dateData.sellData.forEach(s => {
                        if (s.nsval > 0) {
                          if (!totalSellData[s.broker]) {
                            totalSellData[s.broker] = { nslot: 0, nsval: 0, savg: 0, count: 0 };
                          }
                          const sellEntry = totalSellData[s.broker];
                          if (sellEntry) {
                            sellEntry.nslot += Math.abs(s.nslot);
                            sellEntry.nsval += Math.abs(s.nsval);
                            sellEntry.savg += s.savg;
                            sellEntry.count += 1;
                          }
                        }
                      });
                    });
                    
                    // Sort total data
                    const sortedTotalBuy = Object.entries(totalBuyData)
                      .map(([broker, data]) => ({ broker, ...data, bavg: data.bavg / data.count }))
                      .sort((a, b) => b.nbval - a.nbval);
                    const sortedTotalSell = Object.entries(totalSellData)
                      .map(([broker, data]) => ({ broker, ...data, savg: data.savg / data.count }))
                      .sort((a, b) => b.nsval - a.nsval);
                    
                    // Find max row count across all dates
                    let maxRows = 0;
                    selectedDates.forEach(date => {
                      const dateData = allBrokerData.find(d => d.date === date);
                      const buyCount = (dateData?.buyData || []).filter(b => b.nbval > 0).length;
                      const sellCount = (dateData?.sellData || []).filter(b => b.nsval > 0).length;
                      maxRows = Math.max(maxRows, buyCount, sellCount);
                    });
                    
                    // Max rows should also consider total data
                    maxRows = Math.max(maxRows, sortedTotalBuy.length, sortedTotalSell.length);
                    
                    // Render rows
                    return Array.from({ length: maxRows }).map((_, rowIdx) => (
                      <tr key={rowIdx} className="border-b border-border/50 hover:bg-accent/50">
                        {selectedDates.map((date) => {
                          const dateData = allBrokerData.find(d => d.date === date);
                          
                          // Sort brokers for this date by BVal (NBY) and SVal (NSL)
                          const sortedByBVal = (dateData?.buyData || [])
                            .filter(b => b.nbval > 0)
                            .sort((a, b) => b.nbval - a.nbval);
                          const sortedBySVal = (dateData?.sellData || [])
                            .filter(b => b.nsval > 0)
                            .sort((a, b) => b.nsval - a.nsval);
                          
                          const buyData = sortedByBVal[rowIdx];
                          const sellData = sortedBySVal[rowIdx];
                          
                          return (
                            <React.Fragment key={`${date}-${rowIdx}`}>
                              {/* NBY (Buyer) Columns - No # column */}
                              <td className={`py-1 px-1 border border-border ${buyData ? getBrokerColorClass(buyData.broker) : ''}`}>
                                {buyData?.broker || '-'}
                              </td>
                              <td className="text-right py-1 px-1 text-green-600 border border-border">
                                {buyData ? formatNumber(buyData.nblot) : '-'}
                              </td>
                              <td className="text-right py-1 px-1 text-green-600 border border-border">
                                {buyData ? formatNumber(buyData.nbval) : '-'}
                              </td>
                              <td className="text-right py-1 px-1 border border-border">
                                {buyData ? formatAverage(buyData.bavg) : '-'}
                              </td>
                              {/* NSL (Seller) Columns - Keep # column */}
                              <td className="text-center py-1 px-1 text-red-600 border border-border">{sellData ? rowIdx + 1 : '-'}</td>
                              <td className={`py-1 px-1 border border-border ${sellData ? getBrokerColorClass(sellData.broker) : ''}`}>
                                {sellData?.broker || '-'}
                              </td>
                              <td className="text-right py-1 px-1 text-red-600 border border-border">
                                {sellData ? formatNumber(Math.abs(sellData.nslot)) : '-'}
                              </td>
                              <td className="text-right py-1 px-1 text-red-600 border border-border">
                                {sellData ? formatNumber(Math.abs(sellData.nsval)) : '-'}
                              </td>
                              <td className="text-right py-1 px-1 border border-border">
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
                              <td className={`py-1 px-1 border border-border ${totalBuy ? getBrokerColorClass(totalBuy.broker) : ''}`}>
                                {totalBuy?.broker || '-'}
                              </td>
                              <td className="text-right py-1 px-1 text-green-600 border border-border">
                                {totalBuy ? formatNumber(totalBuy.nblot) : '-'}
                              </td>
                              <td className="text-right py-1 px-1 text-green-600 border border-border">
                                {totalBuy ? formatNumber(totalBuy.nbval) : '-'}
                              </td>
                              <td className="text-center py-1 px-1 text-red-600 border border-border">{totalSell ? rowIdx + 1 : '-'}</td>
                              <td className={`py-1 px-1 border border-border ${totalSell ? getBrokerColorClass(totalSell.broker) : ''}`}>
                                {totalSell?.broker || '-'}
                              </td>
                              <td className="text-right py-1 px-1 text-red-600 border border-border">
                                {totalSell ? formatNumber(totalSell.nslot) : '-'}
                              </td>
                              <td className="text-right py-1 px-1 text-red-600 border border-border">
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
                  </CardContent>
                </Card>

        {/* Net Table */}
                <Card>
                  <CardHeader>
            <CardTitle>
              NET - {selectedTicker}
            </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto rounded-md max-h-[600px] overflow-y-auto">
              <table className={`w-full min-w-[1000px] ${getFontSizeClass()} border-collapse`}>
                        <thead className="bg-background">
                          <tr className="border-b border-border">
                    {selectedDates.map((date) => (
                      <th key={date} className={`text-center py-1 px-1 font-medium border border-border`} colSpan={10}>
                        {formatDisplayDate(date)}
                      </th>
                    ))}
                    <th className="text-center py-1 px-1 font-medium border border-border" colSpan={8}>
                      Total
                    </th>
                  </tr>
                  <tr className="border-b border-border">
                    {selectedDates.map((date) => (
                      <React.Fragment key={`detail-${date}`}>
                        {/* Net Buy Columns */}
                        <th className={`text-center py-1 px-1 font-medium text-green-600 border border-border`}>#</th>
                        <th className={`text-left py-1 px-1 font-medium text-green-600 border border-border`}>NBY</th>
                        <th className={`text-right py-1 px-1 font-medium text-green-600 border border-border`}>NBLot</th>
                        <th className={`text-right py-1 px-1 font-medium text-green-600 border border-border`}>NBVal</th>
                        <th className={`text-right py-1 px-1 font-medium border border-border`}>NBAvg</th>
                        {/* Net Sell Columns */}
                        <th className={`text-center py-1 px-1 font-medium text-red-600 border border-border`}>#</th>
                        <th className={`text-left py-1 px-1 font-medium text-red-600 border border-border`}>NSL</th>
                        <th className={`text-right py-1 px-1 font-medium text-red-600 border border-border`}>NSLot</th>
                        <th className={`text-right py-1 px-1 font-medium text-red-600 border border-border`}>NSVal</th>
                        <th className={`text-right py-1 px-1 font-medium border border-border`}>NSAvg</th>
                      </React.Fragment>
                    ))}
                    {/* Total Columns - No Avg */}
                    <th className={`text-center py-1 px-1 font-medium text-green-600 border border-border`}>#</th>
                    <th className={`text-left py-1 px-1 font-medium text-green-600 border border-border`}>NBY</th>
                    <th className={`text-right py-1 px-1 font-medium text-green-600 border border-border`}>NBLot</th>
                    <th className={`text-right py-1 px-1 font-medium text-green-600 border border-border`}>NBVal</th>
                    <th className={`text-center py-1 px-1 font-medium text-red-600 border border-border`}>#</th>
                    <th className={`text-left py-1 px-1 font-medium text-red-600 border border-border`}>NSL</th>
                    <th className={`text-right py-1 px-1 font-medium text-red-600 border border-border`}>NSLot</th>
                    <th className={`text-right py-1 px-1 font-medium text-red-600 border border-border`}>NSVal</th>
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
                      return getBrokerTextClass(brokerCode, isDarkMode);
                    };
                    
                    // Calculate total net data across all dates
                    const totalNetBuyData: { [broker: string]: { nblot: number; nbval: number; nbavg: number; count: number } } = {};
                    const totalNetSellData: { [broker: string]: { nslot: number; nsval: number; nsavg: number; count: number } } = {};
                    
                    allBrokerData.forEach(dateData => {
                      dateData.buyData.forEach(b => {
                        const netBuyLot = b.netBuyVol || 0;
                        const netBuyVal = b.netBuyValue || 0;
                        
                        if (netBuyVal > 0) {
                          if (!totalNetBuyData[b.broker]) {
                            totalNetBuyData[b.broker] = { nblot: 0, nbval: 0, nbavg: 0, count: 0 };
                          }
                          const netBuyEntry = totalNetBuyData[b.broker];
                          if (netBuyEntry) {
                            netBuyEntry.nblot += netBuyLot;
                            netBuyEntry.nbval += netBuyVal;
                            netBuyEntry.nbavg += (netBuyVal / netBuyLot) || 0;
                            netBuyEntry.count += 1;
                          }
                        } else if (netBuyVal < 0) {
                          if (!totalNetSellData[b.broker]) {
                            totalNetSellData[b.broker] = { nslot: 0, nsval: 0, nsavg: 0, count: 0 };
                          }
                          const netSellEntry = totalNetSellData[b.broker];
                          if (netSellEntry) {
                            netSellEntry.nslot += Math.abs(netBuyLot);
                            netSellEntry.nsval += Math.abs(netBuyVal);
                            netSellEntry.nsavg += Math.abs((netBuyVal / netBuyLot)) || 0;
                            netSellEntry.count += 1;
                          }
                        }
                      });
                    });
                    
                    // Sort total data
                    const sortedTotalNetBuy = Object.entries(totalNetBuyData)
                      .map(([broker, data]) => ({ broker, ...data, nbavg: data.nbavg / data.count }))
                      .sort((a, b) => b.nbval - a.nbval);
                    const sortedTotalNetSell = Object.entries(totalNetSellData)
                      .map(([broker, data]) => ({ broker, ...data, nsavg: data.nsavg / data.count }))
                      .sort((a, b) => b.nsval - a.nsval);
                    
                    // Define background colors for top 5 brokers
                    const bgColors = [
                      'bg-blue-100 dark:bg-blue-900/30',
                      'bg-purple-100 dark:bg-purple-900/30',
                      'bg-pink-100 dark:bg-pink-900/30',
                      'bg-orange-100 dark:bg-orange-900/30',
                      'bg-cyan-100 dark:bg-cyan-900/30'
                    ];
                    
                    // Map top 5 net buy brokers to background colors
                    const netBuyBrokerBgMap = new Map<string, string>();
                    sortedTotalNetBuy.slice(0, 5).forEach((item, idx) => {
                      netBuyBrokerBgMap.set(item.broker, bgColors[idx] || '');
                    });
                    
                    // Map top 5 net sell brokers to background colors
                    const netSellBrokerBgMap = new Map<string, string>();
                    sortedTotalNetSell.slice(0, 5).forEach((item, idx) => {
                      netSellBrokerBgMap.set(item.broker, bgColors[idx] || '');
                    });
                    
                    // Helper function to get background color for net buy broker
                    const getNetBuyBgClass = (broker: string): string => {
                      return netBuyBrokerBgMap.get(broker) || '';
                    };
                    
                    // Helper function to get background color for net sell broker
                    const getNetSellBgClass = (broker: string): string => {
                      return netSellBrokerBgMap.get(broker) || '';
                    };
                    
                    // Find max row count across all dates
                    let maxRows = 0;
                    selectedDates.forEach(date => {
                      const dateData = allBrokerData.find(d => d.date === date);
                      const netBuyCount = (dateData?.buyData || []).filter(b => (b.netBuyValue || 0) > 0).length;
                      const netSellCount = (dateData?.buyData || []).filter(b => (b.netBuyValue || 0) < 0).length;
                      maxRows = Math.max(maxRows, netBuyCount, netSellCount);
                    });
                    
                    // Max rows should also consider total data
                    maxRows = Math.max(maxRows, sortedTotalNetBuy.length, sortedTotalNetSell.length);
                    
                    // Render rows
                    return Array.from({ length: maxRows }).map((_, rowIdx) => (
                      <tr key={rowIdx} className="border-b border-border/50 hover:bg-accent/50">
                        {selectedDates.map((date) => {
                          const dateData = allBrokerData.find(d => d.date === date);
                          
                          // Sort brokers for this date by NetBuyValue
                          const sortedNetBuy = (dateData?.buyData || [])
                            .filter(b => (b.netBuyValue || 0) > 0)
                            .sort((a, b) => (b.netBuyValue || 0) - (a.netBuyValue || 0));
                          const sortedNetSell = (dateData?.buyData || [])
                            .filter(b => (b.netBuyValue || 0) < 0)
                            .sort((a, b) => Math.abs(b.netBuyValue || 0) - Math.abs(a.netBuyValue || 0));
                          
                          const netBuyData = sortedNetBuy[rowIdx];
                          const netSellData = sortedNetSell[rowIdx];
                          
                          // Calculate NSLot and NSVal (Buy - Sell) for Net Buy
                          const nbLot = netBuyData?.netBuyVol || 0;
                          const nbVal = netBuyData?.netBuyValue || 0;
                          const nbAvg = nbLot !== 0 ? nbVal / nbLot : 0;
                          
                          // Calculate for Net Sell
                          const nsLot = netSellData ? Math.abs(netSellData.netBuyVol || 0) : 0;
                          const nsVal = netSellData ? Math.abs(netSellData.netBuyValue || 0) : 0;
                          const nsAvg = nsLot !== 0 ? nsVal / nsLot : 0;
                          
                          // Get background colors for this row
                          const netBuyBg = netBuyData ? getNetBuyBgClass(netBuyData.broker) : '';
                          const netSellBg = netSellData ? getNetSellBgClass(netSellData.broker) : '';
                          
                          return (
                            <React.Fragment key={`${date}-${rowIdx}`}>
                              {/* Net Buy Columns */}
                              <td className={`text-center py-1 px-1 text-green-600 border border-border ${netBuyBg}`}>{netBuyData ? rowIdx + 1 : '-'}</td>
                              <td className={`py-1 px-1 border border-border ${netBuyBg} ${netBuyData ? getBrokerColorClass(netBuyData.broker) : ''}`}>
                                {netBuyData?.broker || '-'}
                              </td>
                              <td className={`text-right py-1 px-1 text-green-600 border border-border ${netBuyBg}`}>
                                {netBuyData ? formatNumber(nbLot) : '-'}
                              </td>
                              <td className={`text-right py-1 px-1 text-green-600 border border-border ${netBuyBg}`}>
                                {netBuyData ? formatNumber(nbVal) : '-'}
                              </td>
                              <td className={`text-right py-1 px-1 border border-border ${netBuyBg}`}>
                                {netBuyData ? formatAverage(nbAvg) : '-'}
                              </td>
                              {/* Net Sell Columns */}
                              <td className={`text-center py-1 px-1 text-red-600 border border-border ${netSellBg}`}>{netSellData ? rowIdx + 1 : '-'}</td>
                              <td className={`py-1 px-1 border border-border ${netSellBg} ${netSellData ? getBrokerColorClass(netSellData.broker) : ''}`}>
                                {netSellData?.broker || '-'}
                              </td>
                              <td className={`text-right py-1 px-1 text-red-600 border border-border ${netSellBg}`}>
                                {netSellData ? formatNumber(nsLot) : '-'}
                              </td>
                              <td className={`text-right py-1 px-1 text-red-600 border border-border ${netSellBg}`}>
                                {netSellData ? formatNumber(nsVal) : '-'}
                              </td>
                              <td className={`text-right py-1 px-1 border border-border ${netSellBg}`}>
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
                          const totalNetBuyBg = totalNetBuy && rowIdx < 5 ? (bgColors[rowIdx] || '') : '';
                          const totalNetSellBg = totalNetSell && rowIdx < 5 ? (bgColors[rowIdx] || '') : '';
                          
                          return (
                            <React.Fragment>
                              <td className={`text-center py-1 px-1 text-green-600 border border-border ${totalNetBuyBg}`}>{totalNetBuy ? rowIdx + 1 : '-'}</td>
                              <td className={`py-1 px-1 border border-border ${totalNetBuyBg} ${totalNetBuy ? getBrokerColorClass(totalNetBuy.broker) : ''}`}>
                                {totalNetBuy?.broker || '-'}
                              </td>
                              <td className={`text-right py-1 px-1 text-green-600 border border-border ${totalNetBuyBg}`}>
                                {totalNetBuy ? formatNumber(totalNetBuy.nblot) : '-'}
                              </td>
                              <td className={`text-right py-1 px-1 text-green-600 border border-border ${totalNetBuyBg}`}>
                                {totalNetBuy ? formatNumber(totalNetBuy.nbval) : '-'}
                              </td>
                              <td className={`text-center py-1 px-1 text-red-600 border border-border ${totalNetSellBg}`}>{totalNetSell ? rowIdx + 1 : '-'}</td>
                              <td className={`py-1 px-1 border border-border ${totalNetSellBg} ${totalNetSell ? getBrokerColorClass(totalNetSell.broker) : ''}`}>
                                {totalNetSell?.broker || '-'}
                              </td>
                              <td className={`text-right py-1 px-1 text-red-600 border border-border ${totalNetSellBg}`}>
                                {totalNetSell ? formatNumber(totalNetSell.nslot) : '-'}
                              </td>
                              <td className={`text-right py-1 px-1 text-red-600 border border-border ${totalNetSellBg}`}>
                                {totalNetSell ? formatNumber(totalNetSell.nsval) : '-'}
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
                  </CardContent>
                </Card>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Controls */}
      <Card>
        <CardContent className="pt-6 pb-6">
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
                  className="w-24 pl-10 pr-3 py-2 text-sm border border-border rounded-md bg-input text-foreground"
                />
                {showStockSuggestions && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                    {availableStocks.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground flex items-center">
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Loading stocks...
                      </div>
                    ) : tickerInput === '' ? (
                      <>
                        <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
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
                        <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
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
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  const selectedDate = new Date(e.target.value);
                  const dayOfWeek = selectedDate.getDay();
                  if (dayOfWeek === 0 || dayOfWeek === 6) {
                    alert('Tidak bisa memilih hari Sabtu atau Minggu');
                    return;
                  }
                  setStartDate(e.target.value);
                  // Auto update end date if not set or if start > end
                  if (!endDate || new Date(e.target.value) > new Date(endDate)) {
                    setEndDate(e.target.value);
                  }
                  // Auto apply the date range
                  const start = new Date(e.target.value);
                  const end = new Date(endDate || e.target.value);
                  if (start <= end) {
                    const newDates: string[] = [];
                    const current = new Date(start);
                    while (current <= end && newDates.length < 7) {
                      const dayOfWeek = current.getDay();
                      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                        const dateString = current.toISOString().split('T')[0];
                        if (dateString) newDates.push(dateString);
                      }
                      current.setDate(current.getDate() + 1);
                    }
                    setSelectedDates(newDates);
                  }
                }}
                className="px-3 py-2 border border-border rounded-md bg-input text-foreground text-sm"
              />
              <span className="text-sm text-muted-foreground">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  const selectedDate = new Date(e.target.value);
                  const dayOfWeek = selectedDate.getDay();
                  if (dayOfWeek === 0 || dayOfWeek === 6) {
                    alert('Tidak bisa memilih hari Sabtu atau Minggu');
                    return;
                  }
                  setEndDate(e.target.value);
                  // Auto apply the date range
                  const start = new Date(startDate);
                  const end = new Date(e.target.value);
                  if (start <= end) {
                    const newDates: string[] = [];
                    const current = new Date(start);
                    while (current <= end && newDates.length < 7) {
                      const dayOfWeek = current.getDay();
                      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                        const dateString = current.toISOString().split('T')[0];
                        if (dateString) newDates.push(dateString);
                      }
                      current.setDate(current.getDate() + 1);
                    }
                    if (newDates.length > 7) {
                      alert('Maksimal 7 hari kerja yang bisa dipilih');
                      return;
                    }
                    setSelectedDates(newDates);
                  }
                }}
                className="px-3 py-2 border border-border rounded-md bg-input text-foreground text-sm"
              />
            </div>

            {/* Font Size */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium whitespace-nowrap">Font Size:</label>
              <select
                value={fontSize}
                onChange={(e) => setFontSize(e.target.value as 'small' | 'normal' | 'large')}
                className="px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm"
              >
                <option value="small">Small</option>
                <option value="normal">Normal</option>
                <option value="large">Large</option>
              </select>
            </div>

            {/* Reset Button */}
            <Button onClick={clearAllDates} variant="outline" size="sm">
              <RotateCcw className="w-4 h-4 mr-1" />
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Main Data Display */}
      {renderHorizontalView()}
    </div>
  );
}
