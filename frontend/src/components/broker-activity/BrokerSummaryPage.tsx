import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { X, Plus, RotateCcw, Calendar } from 'lucide-react';
import { getBrokerBackgroundClass, getBrokerTextClass, useDarkMode } from '../../utils/brokerColors';

interface BrokerSummaryData {
  broker: string;
  nblot: number;
  nbval: number;
  bavg: number;
  sl: number;
  nslot: number;
  nsval: number;
  savg: number;
}

// Sample issuers universe for suggestions
const TICKERS = [
  'BBCA','BBRI','BMRI','BBNI','ARTO','BACA','TLKM','ISAT','FREN','EXCL',
  'ASII','GOTO','ANTM','MDKA','ADRO','UNVR','ICBP','INDF','PGAS','MEDC',
  'KLBF','INAF','ADHI','WIKA','JSMR','TOWR','SMGR','INCO','ANTM','UNTR'
];

// Foreign brokers (red background)
const FOREIGN_BROKERS = [
  'AG', 'AH', 'AI', 'AK', 'AO', 'AT', 'AZ', 'BB', 'BK', 'BQ', 'CC', 'CD', 'CP', 
  'DH', 'DP', 'DR', 'DU', 'DX', 'EP', 'FS', 'GR', 'GW', 'HD', 'HP', 'IF', 'II', 
  'KI', 'KK', 'KZ', 'LG', 'MG', 'MU', 'NI', 'OD', 'PD', 'PP', 'QA', 'RB', 'RF', 
  'RX', 'SQ', 'SS', 'TP', 'XA', 'XC', 'XL', 'YB', 'YJ', 'YO', 'YP', 'YU', 'ZP'
];

// Government brokers (green background)
const GOVERNMENT_BROKERS = ['CC', 'NI', 'OD', 'DX'];

// Generate broker summary data for a specific date and ticker
const generateBrokerSummaryData = (date: string, ticker: string): BrokerSummaryData[] => {
  const brokers = ['LG', 'MG', 'BR', 'RG', 'CC', 'UQ', 'MI', 'KS', 'DA', 'SS', 'NI', 'OD', 'DX', 'AG', 'AH', 'AI'];
  
  return brokers.map(broker => {
    // Create deterministic seed based on date and ticker
    const seed = ticker.charCodeAt(0) + (date ?? '').split('-').reduce((acc, part) => acc + parseInt(part || '0', 10), 0);
    const random = (seed * 9301 + 49297) % 233280 / 233280;
    
    const baseVolume = 100 + (random * 500);
    const price = 2000 + (random * 3000);
    
    return {
      broker,
      nblot: Math.round(baseVolume * (0.5 + random * 0.5)),
      nbval: Math.round(baseVolume * price * (0.5 + random * 0.5)),
      bavg: Math.round(price * (0.9 + random * 0.2)),
      sl: Math.round(baseVolume * 0.1),
      nslot: Math.round(-baseVolume * (0.3 + random * 0.4)),
      nsval: Math.round(-baseVolume * price * (0.3 + random * 0.4)),
      savg: Math.round(price * (0.95 + random * 0.1))
    };
  });
};

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
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  } else if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toLocaleString();
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
  const [tickerInput, setTickerInput] = useState('BBCA');
  const [selectedTicker, setSelectedTicker] = useState<string>('BBCA');
  const [showTickerSuggestions, setShowTickerSuggestions] = useState(false);
  const [highlightedTickerIndex, setHighlightedTickerIndex] = useState<number>(-1);
  const [dateRangeMode, setDateRangeMode] = useState<'1day' | '3days' | '1week' | 'custom'>('3days');

  // dark mode hook used here once per component
  const isDarkMode = useDarkMode();

  const addDateRange = () => {
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      // Check if range is valid
      if (start <= end) {
        const newDates: string[] = [];
        const current = new Date(start);
        
        while (current <= end) {
          newDates.push(current.toISOString().split('T')[0] ?? '');
          current.setDate(current.getDate() + 1);
        }
        
        setSelectedDates(prev => {
          const combined = [...prev, ...newDates];
          return [...new Set(combined)].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
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

  const renderHorizontalView = () => {
    if (!selectedTicker || selectedDates.length === 0) return null;
    
    // Get all broker data for all selected dates
    const allBrokerData = selectedDates.map(date => ({
      date,
      buyData: generateBrokerSummaryData(date, selectedTicker),
      sellData: generateBrokerSummaryData(date, selectedTicker).map(broker => ({
            ...broker,
            nblot: Math.abs(broker.nslot),
            nbval: Math.abs(broker.nsval),
            bavg: broker.savg,
            nslot: broker.nslot,
            nsval: broker.nsval,
            savg: broker.savg
      }))
          }));

    // Get unique brokers
    const brokers = allBrokerData[0]?.buyData.map(b => b.broker) || [];
          
          return (
      <div className="space-y-6">
        {/* Combined Buy & Sell Side Table */}
                <Card>
                  <CardHeader>
            <CardTitle>
              BUY & SELL SIDE - {selectedTicker}
            </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto rounded-md">
              <table className="w-full min-w-[1200px] text-xs border-collapse">
                        <thead className="bg-background">
                          <tr className="border-b border-border">
                    <th className="text-left py-2 px-2 font-medium sticky left-0 bg-background z-10 border border-border">Broker</th>
                    {selectedDates.map((date) => (
                      <th key={date} className={`text-center py-2 px-2 font-medium border border-border`} colSpan={6}>
                        {formatDisplayDate(date)}
                      </th>
                    ))}
                    <th className="text-center py-2 px-2 font-medium border border-border" colSpan={6}>
                      Total
                    </th>
                  </tr>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-2 font-medium sticky left-0 bg-background z-10 border border-border"></th>
                    {selectedDates.map((date) => (
                      <React.Fragment key={`sub-${date}`}>
                        <th className={`text-right py-2 px-2 font-medium text-green-600 border border-border`}>BLot</th>
                        <th className={`text-right py-2 px-2 font-medium text-green-600 border border-border`}>BVal</th>
                        <th className={`text-right py-2 px-2 font-medium border border-border`}>BAvg</th>
                        <th className={`text-right py-2 px-2 font-medium text-red-600 border border-border`}>SLot</th>
                        <th className={`text-right py-2 px-2 font-medium text-red-600 border border-border`}>SVal</th>
                        <th className={`text-right py-2 px-2 font-medium border border-border`}>SAvg</th>
                      </React.Fragment>
                    ))}
                    <th className="text-right py-2 px-2 font-medium text-green-600 border border-border">BLot</th>
                    <th className="text-right py-2 px-2 font-medium text-green-600 border border-border">BVal</th>
                    <th className="text-right py-2 px-2 font-medium text-green-600 border border-border">BAvg</th>
                    <th className="text-right py-2 px-2 font-medium text-red-600 border border-border">SLot</th>
                    <th className="text-right py-2 px-2 font-medium text-red-600 border border-border">SVal</th>
                    <th className="text-right py-2 px-2 font-medium text-red-600 border border-border">SAvg</th>
                          </tr>
                        </thead>
                        <tbody>
                  {brokers.map((broker, brokerIdx) => {
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
                    
                    const totalBAvg = selectedDates.reduce((sum, date) => {
                      const dateData = allBrokerData.find(d => d.date === date);
                      const brokerData = dateData?.buyData.find(b => b.broker === broker);
                      return sum + (brokerData?.bavg || 0);
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
                    
                    const totalSAvg = selectedDates.reduce((sum, date) => {
                      const dateData = allBrokerData.find(d => d.date === date);
                      const brokerData = dateData?.sellData.find(b => b.broker === broker);
                      return sum + (brokerData?.savg || 0);
                    }, 0);
                    
                    return (
                      <tr key={broker} className={`border-b border-border/50 hover:bg-accent/50 ${getBrokerRowClass(broker, allBrokerData[0]?.buyData[brokerIdx] || {} as BrokerSummaryData, isDarkMode)}`}>
                        <td className="py-2 px-2 font-medium sticky left-0 bg-background z-10 border border-border">{broker}</td>
                        {selectedDates.map((date) => {
                          const dateData = allBrokerData.find(d => d.date === date);
                          const buyData = dateData?.buyData.find(b => b.broker === broker);
                          const sellData = dateData?.sellData.find(b => b.broker === broker);
                          return (
                            <React.Fragment key={`${date}-${broker}`}>
                              <td className={`text-right py-2 px-2 text-green-600 border border-border`}>{formatNumber(buyData?.nblot || 0)}</td>
                              <td className={`text-right py-2 px-2 text-green-600 border border-border`}>{formatNumber(buyData?.nbval || 0)}</td>
                              <td className={`text-right py-2 px-2 border border-border`}>{formatNumber(buyData?.bavg || 0)}</td>
                              <td className={`text-right py-2 px-2 text-red-600 border border-border`}>{formatNumber(Math.abs(sellData?.nslot || 0))}</td>
                              <td className={`text-right py-2 px-2 text-red-600 border border-border`}>{formatNumber(Math.abs(sellData?.nsval || 0))}</td>
                              <td className={`text-right py-2 px-2 border border-border`}>{formatNumber(sellData?.savg || 0)}</td>
                            </React.Fragment>
                          );
                        })}
                        <td className="text-right py-2 px-2 font-bold text-green-600 border border-border">{formatNumber(totalBLot)}</td>
                        <td className="text-right py-2 px-2 font-bold text-green-600 border border-border">{formatNumber(totalBVal)}</td>
                        <td className="text-right py-2 px-2 font-bold text-green-600 border border-border">{formatNumber(totalBAvg)}</td>
                        <td className="text-right py-2 px-2 font-bold text-red-600 border border-border">{formatNumber(totalSLot)}</td>
                        <td className="text-right py-2 px-2 font-bold text-red-600 border border-border">{formatNumber(totalSVal)}</td>
                        <td className="text-right py-2 px-2 font-bold text-red-600 border border-border">{formatNumber(totalSAvg)}</td>
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
              NET - {selectedTicker}
            </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto rounded-md">
              <table className="w-full min-w-[800px] text-xs border-collapse">
                        <thead className="bg-background">
                          <tr className="border-b border-border">
                    <th className="text-left py-2 px-2 font-medium sticky left-0 bg-background z-10 border border-border">Broker</th>
                    {selectedDates.map((date) => (
                      <th key={date} className={`text-center py-2 px-2 font-medium border border-border`} colSpan={2}>
                        {formatDisplayDate(date)}
                      </th>
                    ))}
                    <th className="text-center py-2 px-2 font-medium border border-border" colSpan={2}>
                      Total
                    </th>
                  </tr>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-2 font-medium sticky left-0 bg-background z-10 border border-border"></th>
                    {selectedDates.map((date) => (
                      <React.Fragment key={`net-sub-${date}`}>
                        <th className={`text-right py-2 px-2 font-medium border border-border`}>NBLot</th>
                        <th className={`text-right py-2 px-2 font-medium border border-border`}>NBVal</th>
                      </React.Fragment>
                    ))}
                    <th className="text-right py-2 px-2 font-medium border border-border">NBLot</th>
                    <th className="text-right py-2 px-2 font-medium border border-border">NBVal</th>
                          </tr>
                        </thead>
                        <tbody>
                  {brokers.map((broker, brokerIdx) => {
                    // Calculate net totals for this broker across all dates
                    const totalNBLot = selectedDates.reduce((sum, date) => {
                      const dateData = allBrokerData.find(d => d.date === date);
                      const buyData = dateData?.buyData.find(b => b.broker === broker);
                      const sellData = dateData?.sellData.find(b => b.broker === broker);
                      const netLot = (buyData?.nblot || 0) + (sellData?.nslot || 0); // nslot is already negative
                      return sum + netLot;
                    }, 0);
                    
                    const totalNBVal = selectedDates.reduce((sum, date) => {
                      const dateData = allBrokerData.find(d => d.date === date);
                      const buyData = dateData?.buyData.find(b => b.broker === broker);
                      const sellData = dateData?.sellData.find(b => b.broker === broker);
                      const netVal = (buyData?.nbval || 0) + (sellData?.nsval || 0); // nsval is already negative
                      return sum + netVal;
                    }, 0);
                    
                    return (
                      <tr key={broker} className={`border-b border-border/50 hover:bg-accent/50 ${getBrokerRowClass(broker, allBrokerData[0]?.buyData[brokerIdx] || {} as BrokerSummaryData, isDarkMode)}`}>
                        <td className="py-2 px-2 font-medium sticky left-0 bg-background z-10 border border-border">{broker}</td>
                        {selectedDates.map((date) => {
                          const dateData = allBrokerData.find(d => d.date === date);
                          const buyData = dateData?.buyData.find(b => b.broker === broker);
                          const sellData = dateData?.sellData.find(b => b.broker === broker);
                          const netLot = (buyData?.nblot || 0) + (sellData?.nslot || 0);
                          const netVal = (buyData?.nbval || 0) + (sellData?.nsval || 0);
                          return (
                            <React.Fragment key={`net-${date}-${broker}`}>
                              <td className={`text-right py-2 px-2 border border-border ${netLot >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatNumber(netLot)}</td>
                              <td className={`text-right py-2 px-2 border border-border ${netVal >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatNumber(netVal)}</td>
                            </React.Fragment>
                          );
                        })}
                        <td className={`text-right py-2 px-2 font-bold border border-border ${totalNBLot >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatNumber(totalNBLot)}</td>
                        <td className={`text-right py-2 px-2 font-bold border border-border ${totalNBVal >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatNumber(totalNBVal)}</td>
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
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Date Range Selection (Max 7 Days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Row 1: Ticker, Date Range, Quick Select, Layout */}
            <div className="flex flex-col gap-4 md:grid md:grid-cols-2 lg:flex lg:flex-row items-center lg:items-end">
              {/* Ticker Selection */}
              <div className="flex-1 min-w-0 w-full">
                <label className="block text-sm font-medium mb-2">Ticker:</label>
                <div className="relative">
                  <input
                    type="text"
                    value={tickerInput}
                    onChange={(e) => {
                      const v = e.target.value.toUpperCase();
                      setTickerInput(v);
                      setShowTickerSuggestions(true);
                      setHighlightedTickerIndex(0);
                      if (!v) setSelectedTicker('');
                    }}
                    onFocus={() => setShowTickerSuggestions(true)}
                    onKeyDown={(e) => {
                      const suggestions = TICKERS
                        .filter(t => t.toLowerCase().includes(tickerInput.toLowerCase()))
                        .slice(0, 10);
                      if (!suggestions.length) return;
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setHighlightedTickerIndex(prev => {
                          const next = prev + 1;
                          return next >= suggestions.length ? 0 : next;
                        });
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setHighlightedTickerIndex(prev => {
                          const next = prev - 1;
                          return next < 0 ? suggestions.length - 1 : next;
                        });
                      } else if (e.key === 'Enter' && showTickerSuggestions) {
                        e.preventDefault();
                        const idx = highlightedTickerIndex >= 0 ? highlightedTickerIndex : 0;
                        const choice = suggestions[idx];
                        if (choice) {
                          setTickerInput(choice);
                          setSelectedTicker(choice);
                          setShowTickerSuggestions(false);
                          setHighlightedTickerIndex(-1);
                        }
                      } else if (e.key === 'Escape') {
                        setShowTickerSuggestions(false);
                        setHighlightedTickerIndex(-1);
                      }
                    }}
                    placeholder="Enter ticker code..."
                    className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm"
                    role="combobox"
                    aria-expanded={showTickerSuggestions}
                    aria-controls="ticker-suggestions"
                    aria-autocomplete="list"
                  />
                  {!!tickerInput && (
                    <button
                      className="absolute right-2 top-2.5 text-muted-foreground"
                      onClick={() => {
                        setTickerInput('');
                        setSelectedTicker('');
                        setShowTickerSuggestions(false);
                      }}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  {showTickerSuggestions && (
                    (() => {
                      const suggestions = TICKERS
                        .filter(t => t.toLowerCase().includes(tickerInput.toLowerCase()))
                        .slice(0, 10);
                      return (
                        <div id="ticker-suggestions" role="listbox" className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-md border border-border bg-background shadow">
                          {suggestions.map((t, idx) => (
                            <button
                              key={t}
                              role="option"
                              aria-selected={idx === highlightedTickerIndex}
                              className={`w-full text-left px-3 py-2 text-sm ${idx === highlightedTickerIndex ? 'bg-accent' : 'hover:bg-accent'}`}
                              onMouseEnter={() => setHighlightedTickerIndex(idx)}
                              onMouseDown={(e) => { e.preventDefault(); }}
                              onClick={() => {
                                setTickerInput(t);
                                setSelectedTicker(t);
                                setShowTickerSuggestions(false);
                                setHighlightedTickerIndex(-1);
                              }}
                            >
                              {t}
                            </button>
                          ))}
                          {suggestions.length === 0 && (
                            <div className="px-3 py-2 text-sm text-muted-foreground">No results</div>
                          )}
                        </div>
                      );
                    })()
                  )}
                </div>
              </div>

              {/* Date Range */}
              <div className="flex-1 min-w-0 w-full md:col-span-2">
                <label className="block text-sm font-medium mb-2">Date Range:</label>
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-2 w-full">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-md bg-input text-foreground text-sm"
                  />
                  <span className="text-sm text-muted-foreground text-center whitespace-nowrap sm:px-2">to</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-md bg-input text-foreground text-sm"
                  />
                  <Button onClick={addDateRange} size="sm" className="w-auto justify-self-center">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Quick Select */}
              <div className="flex-1 min-w-0 w-full">
                <label className="block text-sm font-medium mb-2">Quick Select:</label>
                <div className="flex gap-2">
                  <select 
                    className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm"
                    value={dateRangeMode}
                    onChange={(e) => handleDateRangeModeChange(e.target.value as '1day' | '3days' | '1week' | 'custom')}
                  >
                    <option value="1day">1 Day</option>
                    <option value="3days">3 Days</option>
                    <option value="1week">1 Week</option>
                    <option value="custom">Custom</option>
                  </select>
                    <Button onClick={clearAllDates} variant="outline" size="sm">
                      <RotateCcw className="w-4 h-4 mr-1" />
                    Reset
                    </Button>
                </div>
              </div>

            </div>

            {/* Row 2: Selected Dates */}
            <div>
              <label className="text-sm font-medium">Selected Dates:</label>
              <div className="flex flex-wrap gap-2 mt-2">
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
          </div>
        </CardContent>
      </Card>

      {/* Main Data Display */}
      {renderHorizontalView()}
    </div>
  );
}
