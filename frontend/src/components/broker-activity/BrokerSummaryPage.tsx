import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { X, Plus, RotateCcw, Calendar, Search, Loader2 } from 'lucide-react';
import { getBrokerBackgroundClass, getBrokerTextClass, useDarkMode } from '../../utils/brokerColors';
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

// Get last five trading days (1 week)
const getLastFiveDays = (): string[] => {
  return getLastTradingDays(5);
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

// getBrokerRowClass now accepts isDarkMode instead of calling hook inside function
const getBrokerRowClass = (broker: string, _data: BrokerSummaryData, isDarkMode: boolean): string => {
  // Check if broker is government broker (green background)
  if (GOVERNMENT_BROKERS.includes(broker)) {
    return isDarkMode 
      ? 'bg-green-900/30 text-green-100 hover:opacity-80' 
      : 'bg-green-100/50 text-green-800 hover:opacity-80';
  }
  
  // Check if broker is foreign broker (red background)
  if (FOREIGN_BROKERS.includes(broker)) {
    return isDarkMode 
      ? 'bg-red-900/30 text-red-100 hover:opacity-80' 
      : 'bg-red-100/50 text-red-800 hover:opacity-80';
  }
  
  // Default broker styling
  const backgroundClass = getBrokerBackgroundClass(broker, isDarkMode);
  const textClass = getBrokerTextClass(broker, isDarkMode);
  return `${backgroundClass} ${textClass} hover:opacity-80`;
};

export function BrokerSummaryPage() {
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
  const [selectedTicker, setSelectedTicker] = useState<string>('BBCA');
  const [tickerInput, setTickerInput] = useState<string>('BBCA');
  const [dateRangeMode, setDateRangeMode] = useState<'1day' | '3days' | '1week' | 'custom'>('3days');
  const [maxBrokersToShow, setMaxBrokersToShow] = useState<number>(20);
  
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
      if (!selectedTicker || selectedDates.length === 0) return;
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

  const addDateRange = () => {
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      // Check if range is valid
      if (start <= end) {
        const newDates: string[] = [];
        const current = new Date(start);
        
        // Generate date array (excluding weekends)
        while (current <= end) {
          const dayOfWeek = current.getDay();
          if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Skip weekends (Sunday = 0, Saturday = 6)
            const dateString = current.toISOString().split('T')[0];
            if (dateString) {
              newDates.push(dateString);
            }
          }
          current.setDate(current.getDate() + 1);
        }
        
        // Check if the number of weekdays exceeds 7
        if (newDates.length > 7) {
          // Show toast or alert
          alert('Maksimal 7 hari kerja yang bisa dipilih');
          return;
        }
        
        setSelectedDates(prev => {
          const combined = [...prev, ...newDates];
          // Filter out any weekends that might have been added previously
          const filteredDates = combined.filter(date => {
            const dayOfWeek = new Date(date).getDay();
            return dayOfWeek !== 0 && dayOfWeek !== 6;
          });
          return [...new Set(filteredDates)].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
        });
      }
    }
  };

  const removeDate = (dateToRemove: string) => {
    setSelectedDates(prev => prev.filter(date => date !== dateToRemove));
  };

  const handleDateRangeModeChange = (mode: '1day' | '3days' | '1week' | 'custom') => {
    setDateRangeMode(mode);
    
    if (mode === '1day') {
      const oneDay = getLastThreeDays().slice(0, 1);
      setSelectedDates(oneDay);
      setStartDate(oneDay[0] ?? '');
      setEndDate(oneDay[0] ?? '');
    } else if (mode === '3days') {
      const threeDays = getLastThreeDays();
      setSelectedDates(threeDays);
      const sortedDates = [...threeDays].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      setStartDate(sortedDates[0] ?? '');
      setEndDate(sortedDates[sortedDates.length - 1] ?? '');
    } else if (mode === '1week') {
      const oneWeek = getLastFiveDays();
      setSelectedDates(oneWeek);
      const sortedDates = [...oneWeek].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      setStartDate(sortedDates[0] ?? '');
      setEndDate(sortedDates[sortedDates.length - 1] ?? '');
    }
  };

  const clearAllDates = () => {
    setSelectedDates([]);
    setStartDate('');
    setEndDate('');
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

    // Get unique brokers
    const brokers = allBrokerData[0]?.buyData.map(b => b.broker) || [];
    
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
              BUY & SELL SIDE - {selectedTicker} ({Math.min(brokers.length, maxBrokersToShow)}/{brokers.length} brokers)
            </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto rounded-md max-h-[600px] overflow-y-auto">
              <table className="w-full min-w-[1000px] text-[10px] border-collapse">
                        <thead className="bg-background">
                          <tr className="border-b border-border">
                    <th className="text-left py-1 px-1 font-medium sticky left-0 bg-background z-10 border border-border">Broker</th>
                    {selectedDates.map((date) => (
                      <th key={date} className={`text-center py-1 px-1 font-medium border border-border`} colSpan={6}>
                        {formatDisplayDate(date)}
                      </th>
                    ))}
                    <th className="text-center py-1 px-1 font-medium border border-border" colSpan={4}>
                      Total
                    </th>
                  </tr>
                  <tr className="border-b border-border">
                    <th className="text-left py-1 px-1 font-medium sticky left-0 bg-background z-10 border border-border"></th>
                    {selectedDates.map((date) => (
                      <React.Fragment key={`sub-${date}`}>
                        <th className={`text-right py-1 px-1 font-medium text-green-600 border border-border`}>BLot</th>
                        <th className={`text-right py-1 px-1 font-medium text-green-600 border border-border`}>BVal</th>
                        <th className={`text-right py-1 px-1 font-medium border border-border`}>BAvg</th>
                        <th className={`text-right py-1 px-1 font-medium text-red-600 border border-border`}>SLot</th>
                        <th className={`text-right py-1 px-1 font-medium text-red-600 border border-border`}>SVal</th>
                        <th className={`text-right py-1 px-1 font-medium border border-border`}>SAvg</th>
                      </React.Fragment>
                    ))}
                    <th className="text-right py-1 px-1 font-medium text-green-600 border border-border">BLot</th>
                    <th className="text-right py-1 px-1 font-medium text-green-600 border border-border">BVal</th>
                    <th className="text-right py-1 px-1 font-medium text-red-600 border border-border">SLot</th>
                    <th className="text-right py-1 px-1 font-medium text-red-600 border border-border">SVal</th>
                          </tr>
                        </thead>
                        <tbody>
                  {brokers.slice(0, maxBrokersToShow).map((broker, brokerIdx) => {
                    // Calculate totals for this broker across all dates
                    const totalBLot = selectedDates.reduce((sum, date) => {
                      const dateData = allBrokerData.find(d => d.date === date);
                      const brokerData = dateData?.buyData.find(b => b.broker === broker);
                      return sum + (brokerData?.nblot || 0);
                    }, 0);
                    
                    const totalBVal = selectedDates.reduce((sum, date) => {
                      const dateData = allBrokerData.find(d => d.date === date);
                      const brokerData = dateData?.buyData.find(b => b.broker === broker);
                      return sum + (brokerData?.nbval || 0);
                    }, 0);
                    
                    
                    const totalSLot = selectedDates.reduce((sum, date) => {
                      const dateData = allBrokerData.find(d => d.date === date);
                      const brokerData = dateData?.sellData.find(b => b.broker === broker);
                      return sum + Math.abs(brokerData?.nslot || 0);
                    }, 0);
                    
                    const totalSVal = selectedDates.reduce((sum, date) => {
                      const dateData = allBrokerData.find(d => d.date === date);
                      const brokerData = dateData?.sellData.find(b => b.broker === broker);
                      return sum + Math.abs(brokerData?.nsval || 0);
                    }, 0);
                    
                    
                    return (
                      <tr key={broker} className={`border-b border-border/50 hover:bg-accent/50 ${getBrokerRowClass(broker, allBrokerData[0]?.buyData[brokerIdx] || {} as BrokerSummaryData, isDarkMode)}`}>
                        <td className="py-1 px-1 font-medium sticky left-0 bg-background z-10 border border-border">{broker}</td>
                        {selectedDates.map((date) => {
                          const dateData = allBrokerData.find(d => d.date === date);
                          const buyData = dateData?.buyData.find(b => b.broker === broker);
                          const sellData = dateData?.sellData.find(b => b.broker === broker);
                          return (
                            <React.Fragment key={`${date}-${broker}`}>
                              <td className={`text-right py-1 px-1 text-green-600 border border-border`}>{formatNumber(buyData?.nblot || 0)}</td>
                              <td className={`text-right py-1 px-1 text-green-600 border border-border`}>{formatNumber(buyData?.nbval || 0)}</td>
                              <td className={`text-right py-1 px-1 border border-border`}>{formatAverage(buyData?.bavg || 0)}</td>
                              <td className={`text-right py-1 px-1 text-red-600 border border-border`}>{formatNumber(Math.abs(sellData?.nslot || 0))}</td>
                              <td className={`text-right py-1 px-1 text-red-600 border border-border`}>{formatNumber(Math.abs(sellData?.nsval || 0))}</td>
                              <td className={`text-right py-1 px-1 border border-border`}>{formatAverage(sellData?.savg || 0)}</td>
                            </React.Fragment>
                          );
                        })}
                        <td className="text-right py-1 px-1 font-bold text-green-600 border border-border">{formatNumber(totalBLot)}</td>
                        <td className="text-right py-1 px-1 font-bold text-green-600 border border-border">{formatNumber(totalBVal)}</td>
                        <td className="text-right py-1 px-1 font-bold text-red-600 border border-border">{formatNumber(totalSLot)}</td>
                        <td className="text-right py-1 px-1 font-bold text-red-600 border border-border">{formatNumber(totalSVal)}</td>
                            </tr>
                    );
                  })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

        {/* Net Table */}
                <Card>
                  <CardHeader>
            <CardTitle>
              NET - {selectedTicker} ({Math.min(brokers.length, maxBrokersToShow)}/{brokers.length} brokers)
            </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto rounded-md max-h-[600px] overflow-y-auto">
              <table className="w-full min-w-[600px] text-[10px] border-collapse">
                        <thead className="bg-background">
                          <tr className="border-b border-border">
                    <th className="text-left py-1 px-1 font-medium sticky left-0 bg-background z-10 border border-border">Broker</th>
                    {selectedDates.map((date) => (
                      <th key={date} className={`text-center py-1 px-1 font-medium border border-border`} colSpan={2}>
                        {formatDisplayDate(date)}
                      </th>
                    ))}
                    <th className="text-center py-1 px-1 font-medium border border-border" colSpan={2}>
                      Total
                    </th>
                  </tr>
                  <tr className="border-b border-border">
                    <th className="text-left py-1 px-1 font-medium sticky left-0 bg-background z-10 border border-border"></th>
                    {selectedDates.map((date) => (
                      <React.Fragment key={`net-sub-${date}`}>
                        <th className={`text-right py-1 px-1 font-medium border border-border`}>NBLot</th>
                        <th className={`text-right py-1 px-1 font-medium border border-border`}>NBVal</th>
                      </React.Fragment>
                    ))}
                    <th className="text-right py-1 px-1 font-medium border border-border">NBLot</th>
                    <th className="text-right py-1 px-1 font-medium border border-border">NBVal</th>
                          </tr>
                        </thead>
                        <tbody>
                  {brokers.slice(0, maxBrokersToShow).map((broker, brokerIdx) => {
                    // Calculate net totals for this broker across all dates using API NetBuyVol/NetBuyValue
                    const totalNBLot = selectedDates.reduce((sum, date) => {
                      const dateData = allBrokerData.find(d => d.date === date);
                      const brokerData = dateData?.buyData.find(b => b.broker === broker);
                      return sum + (brokerData?.netBuyVol || 0);
                    }, 0);
                    
                    const totalNBVal = selectedDates.reduce((sum, date) => {
                      const dateData = allBrokerData.find(d => d.date === date);
                      const brokerData = dateData?.buyData.find(b => b.broker === broker);
                      return sum + (brokerData?.netBuyValue || 0);
                    }, 0);
                    
                    return (
                      <tr key={broker} className={`border-b border-border/50 hover:bg-accent/50 ${getBrokerRowClass(broker, allBrokerData[0]?.buyData[brokerIdx] || {} as BrokerSummaryData, isDarkMode)}`}>
                        <td className="py-1 px-1 font-medium sticky left-0 bg-background z-10 border border-border">{broker}</td>
                        {selectedDates.map((date) => {
                          const dateData = allBrokerData.find(d => d.date === date);
                          const brokerData = dateData?.buyData.find(b => b.broker === broker);
                          const netLot = brokerData?.netBuyVol || 0;
                          const netVal = brokerData?.netBuyValue || 0;
                          return (
                            <React.Fragment key={`net-${date}-${broker}`}>
                              <td className={`text-right py-1 px-1 border border-border ${netLot >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatNumber(netLot)}</td>
                              <td className={`text-right py-1 px-1 border border-border ${netVal >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatNumber(netVal)}</td>
                            </React.Fragment>
                          );
                        })}
                        <td className={`text-right py-1 px-1 font-bold border border-border ${totalNBLot >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatNumber(totalNBLot)}</td>
                        <td className={`text-right py-1 px-1 font-bold border border-border ${totalNBVal >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatNumber(totalNBVal)}</td>
                            </tr>
                    );
                  })}
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
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
              <span className="text-base font-medium">Date Range Selection (Max 7 Days)</span>
            </div>
            
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
                <div className="flex items-center gap-2">
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
                    }}
                    className="px-3 py-2 border border-border rounded-md bg-input text-foreground text-sm"
                  />
                  <Button onClick={addDateRange} size="sm" className="h-8 w-8 p-0">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Quick Select */}
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium whitespace-nowrap">Quick Select:</label>
                  <select 
                  className="px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm"
                    value={dateRangeMode}
                    onChange={(e) => handleDateRangeModeChange(e.target.value as '1day' | '3days' | '1week' | 'custom')}
                  >
                    <option value="1day">1 Day</option>
                    <option value="3days">3 Days</option>
                    <option value="1week">1 Week</option>
                    <option value="custom">Custom</option>
                  </select>
              </div>

              {/* Max Brokers */}
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium whitespace-nowrap">Max Brokers:</label>
                <select
                  value={maxBrokersToShow}
                  onChange={(e) => setMaxBrokersToShow(Number(e.target.value))}
                  className="px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              {/* Reset Button */}
              <div className="flex items-center gap-2">
                    <Button onClick={clearAllDates} variant="outline" size="sm">
                      <RotateCcw className="w-4 h-4 mr-1" />
                  Reset
                    </Button>
              </div>

              </div>
            </div>

          {/* Selected Dates */}
          <div className="mt-6">
              <label className="text-sm font-medium">Selected Dates:</label>
            <div className="flex flex-wrap gap-2 mt-3">
                {selectedDates.map((date) => (
                  <Badge key={date} variant="secondary" className="px-3 py-1">
                    {formatDisplayDate(date)}
                    {selectedDates.length > 1 && (
                      <button
                        onClick={() => removeDate(date)}
                        className="ml-2 hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </Badge>
                ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Data Display */}
      {renderHorizontalView()}
    </div>
  );
}
