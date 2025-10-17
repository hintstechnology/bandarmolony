import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Calendar, Plus, X, RotateCcw } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { getBrokerBackgroundClass, getBrokerTextClass } from '../../utils/brokerColors';

interface IssuerData {
  ticker: string;
  rsVal: number;
  hitLot: number;
  rsFreq: number;
  sAvg: number;
}

// Deterministic pseudo-random generator based on string seed
const seededRandom = (seed: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0) / 4294967295;
};

// Sample issuers universe
const ISSUERS = [
  'BBCA','BBRI','BMRI','BBNI','ARTO','BACA','TLKM','ISAT','FREN','EXCL',
  'ASII','GOTO','ANTM','MDKA','ADRO','UNVR','ICBP','INDF','PGAS','MEDC',
  'CPIN','JPFA','INCO','TPIA','TKIM','INKP','BRIS','SIDO','ERAA','ESSA'
];

// Generate issuers a broker bought on a date
const generateIssuerBuyData = (date: string, brokerCode: string): IssuerData[] => {
  const dateFactor = 0.8 + ((new Date(date).getDate() % 5) * 0.05);
  const rows: IssuerData[] = [];
  for (const ticker of ISSUERS) {
    const r = seededRandom(brokerCode + ticker + date);
    if (r > 0.45) {
      const intensity = 0.5 + r; // 0.5..1.5
      rows.push({
        ticker,
        rsVal: +(80 * intensity * dateFactor).toFixed(3),
        hitLot: +(100 * intensity * dateFactor).toFixed(3),
        rsFreq: +(200 * intensity * dateFactor).toFixed(3),
        sAvg: +(1000 * intensity).toFixed(3),
      });
    }
  }
  return rows.slice(0, 15);
};

// Generate issuers a broker sold on a date (negative values)
const generateIssuerSellData = (date: string, brokerCode: string): IssuerData[] => {
  const dateFactor = 0.8 + ((new Date(date).getDate() % 5) * 0.05);
  const rows: IssuerData[] = [];
  for (const ticker of ISSUERS) {
    const r = seededRandom('S' + brokerCode + ticker + date);
    if (r > 0.55) {
      const intensity = 0.5 + r; // 0.5..1.5
      rows.push({
        ticker,
        rsVal: -+(50 * intensity * dateFactor).toFixed(3),
        hitLot: -+(80 * intensity * dateFactor).toFixed(3),
        rsFreq: -+(150 * intensity * dateFactor).toFixed(3),
        sAvg: +(900 * intensity).toFixed(3),
      });
    }
  }
  return rows.slice(0, 10);
};

const formatNumber = (num: number): string => {
  if (Math.abs(num) >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toFixed(num >= 10 ? 0 : num >= 1 ? 1 : 2);
};

const formatValue = (value: number): string => {
  return formatNumber(value);
};

// Get trading days based on count
const getTradingDays = (count: number): string[] => {
  const dates: string[] = [];
  const today = new Date();
  let currentDate = new Date(today);
  
  while (dates.length < count) {
    const dayOfWeek = currentDate.getDay();
    
    // Skip weekends (Saturday = 6, Sunday = 0)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      dates.push(currentDate.toISOString().split('T')[0]);
    }
    
    // Go to previous day
    currentDate.setDate(currentDate.getDate() - 1);
    
    // Safety check
    if (dates.length === 0 && currentDate.getTime() < today.getTime() - (30 * 24 * 60 * 60 * 1000)) {
      dates.push(today.toISOString().split('T')[0]);
      break;
    }
  }
  
  return dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
};

// Helper function to get last 3 days including today (sorted newest first)
const getLastThreeDays = (): string[] => {
  return getTradingDays(3);
};

export function BrokerTransaction() {
  const { showToast } = useToast();
  const [selectedDates, setSelectedDates] = useState<string[]>(getLastThreeDays());
  const [startDate, setStartDate] = useState(() => {
    const threeDays = getLastThreeDays();
    if (threeDays.length > 0) {
      const sortedDates = [...threeDays].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      return sortedDates[0];
    }
    return '';
  });
  const [endDate, setEndDate] = useState(() => {
    const threeDays = getLastThreeDays();
    if (threeDays.length > 0) {
      const sortedDates = [...threeDays].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      return sortedDates[sortedDates.length - 1];
    }
    return '';
  });
  const [brokerInput, setBrokerInput] = useState('MG');
  const [selectedBroker, setSelectedBroker] = useState<string>('MG');
  const [showBrokerSuggestions, setShowBrokerSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [layoutMode, setLayoutMode] = useState<'horizontal' | 'vertical'>('horizontal');
  const [dateRangeMode, setDateRangeMode] = useState<'1day' | '3days' | '1week' | 'custom'>('3days');

  const addDateRange = () => {
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      // Check if range is valid
      if (start > end) {
        showToast({
          type: 'warning',
          title: 'Tanggal Tidak Valid',
          message: 'Tanggal mulai harus sebelum tanggal akhir',
        });
        return;
      }
      
      // Generate date array
      const dateArray: string[] = [];
      const currentDate = new Date(start);
      
      while (currentDate <= end) {
        const dateString = currentDate.toISOString().split('T')[0];
        dateArray.push(dateString);
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      // Remove duplicates, sort by date (newest first), and check total limit
      const uniqueDates = Array.from(new Set([...selectedDates, ...dateArray]));
      const sortedDates = uniqueDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
      
      // Check if total dates would exceed 7
      if (sortedDates.length > 7) {
        showToast({
          type: 'warning',
          title: 'Terlalu Banyak Tanggal',
          message: 'Maksimal 7 tanggal yang bisa dipilih',
        });
        return;
      }
      
      setSelectedDates(sortedDates);
      // Switch to custom mode when user manually selects dates
      setDateRangeMode('custom');
      // Don't clear the date inputs - keep them for user reference
    }
  };

  const removeDate = (dateToRemove: string) => {
    if (selectedDates.length > 1) {
      setSelectedDates(selectedDates.filter(date => date !== dateToRemove));
      // Switch to custom mode when user manually removes dates
      setDateRangeMode('custom');
    }
  };

  const formatDisplayDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
  };

  // Handle date range mode change
  const handleDateRangeModeChange = (mode: '1day' | '3days' | '1week' | 'custom') => {
    setDateRangeMode(mode);
    
    if (mode === 'custom') {
      // Don't change dates, just switch to custom mode
      return;
    }
    
    // Apply preset dates based on mode
    let newDates: string[] = [];
    switch (mode) {
      case '1day':
        newDates = getTradingDays(1);
        break;
      case '3days':
        newDates = getTradingDays(3);
        break;
      case '1week':
        newDates = getTradingDays(5);
        break;
    }
    
    setSelectedDates(newDates);
    
    // Set date range to show the selected dates
    if (newDates.length > 0) {
      const sortedDates = [...newDates].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      setStartDate(sortedDates[0]);
      setEndDate(sortedDates[sortedDates.length - 1]);
    }
  };

  // Clear all dates and reset to 1 day
  const clearAllDates = () => {
    setSelectedDates(getTradingDays(1));
    setDateRangeMode('1day');
    const oneDay = getTradingDays(1);
    if (oneDay.length > 0) {
      setStartDate(oneDay[0]);
      setEndDate(oneDay[0]);
    }
  };

  const resetToLastThreeDays = () => {
    setSelectedDates(getLastThreeDays());
    setDateRangeMode('3days');
    const threeDays = getLastThreeDays();
    if (threeDays.length > 0) {
      const sortedDates = [...threeDays].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      setStartDate(sortedDates[0]);
      setEndDate(sortedDates[sortedDates.length - 1]);
    }
  };

  const renderHorizontalView = () => {
    if (!selectedBroker) return null;
    const buyData = generateIssuerBuyData(selectedDates[0], selectedBroker);
    const sellData = generateIssuerSellData(selectedDates[0], selectedBroker);
    
    return (
      <div className="space-y-6">
        {/* Buy Side Horizontal Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-green-600">BUY SIDE - {selectedBroker}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md">
              <div className="inline-block min-w-full">
                <table className="w-full min-w-[900px] text-xs border-collapse">
                  <thead className="bg-background">
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-2 font-medium bg-accent sticky left-0 z-20">Ticker</th>
                      {selectedDates.map((date) => (
                        <th key={date} colSpan={4} className="text-center py-2 px-1 font-medium border-l border-border">
                          {formatDisplayDate(date)}
                        </th>
                      ))}
                    </tr>
                    <tr className="border-b border-border bg-accent/30">
                      <th className="text-left py-1 px-2 font-medium bg-accent sticky left-0 z-20"></th>
                      {selectedDates.map((date) => (
                        <React.Fragment key={date}>
                          <th className="text-right py-1 px-1 font-medium text-[10px]">RSVal</th>
                          <th className="text-right py-1 px-1 font-medium text-[10px]">HitLot</th>
                          <th className="text-right py-1 px-1 font-medium text-[10px]">RSFreq</th>
                          <th className="text-right py-1 px-1 font-medium text-[10px] border-r-2 border-border">SAvg</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {buyData.map((row, idx) => (
                      <tr key={idx} className="border-b border-border/50 hover:bg-accent/50">
                        <td className="py-1.5 px-2 font-medium bg-background sticky left-0 z-20 border-r border-border">{row.ticker}</td>
                        {selectedDates.map((date) => {
                          const dayData = generateIssuerBuyData(date, selectedBroker).find(d => d.ticker === row.ticker) || row;
                          return (
                            <React.Fragment key={date}>
                              <td className="text-right py-1.5 px-1 text-green-600">{formatValue(dayData.rsVal)}</td>
                              <td className="text-right py-1.5 px-1">{formatValue(dayData.hitLot)}</td>
                              <td className="text-right py-1.5 px-1">{formatValue(dayData.rsFreq)}</td>
                              <td className="text-right py-1.5 px-1 border-r-2 border-border">{formatValue(dayData.sAvg)}</td>
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sell Side Horizontal Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-red-600">SELL SIDE - {selectedBroker}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md">
              <div className="inline-block min-w-full">
                <table className="w-full min-w-[900px] text-xs border-collapse">
                  <thead className="bg-background">
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-2 font-medium bg-accent sticky left-0 z-20">Ticker</th>
                      {selectedDates.map((date) => (
                        <th key={date} colSpan={4} className="text-center py-2 px-1 font-medium border-l border-border">
                          {formatDisplayDate(date)}
                        </th>
                      ))}
                    </tr>
                    <tr className="border-b border-border bg-accent/30">
                      <th className="text-left py-1 px-2 font-medium bg-accent sticky left-0 z-20"></th>
                      {selectedDates.map((date) => (
                        <React.Fragment key={date}>
                          <th className="text-right py-1 px-1 font-medium text-[10px]">RSVal</th>
                          <th className="text-right py-1 px-1 font-medium text-[10px]">HitLot</th>
                          <th className="text-right py-1 px-1 font-medium text-[10px]">RSFreq</th>
                          <th className="text-right py-1 px-1 font-medium text-[10px] border-r-2 border-border">SAvg</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sellData.map((row, idx) => (
                      <tr key={idx} className="border-b border-border/50 hover:bg-accent/50">
                        <td className="py-1.5 px-2 font-medium bg-background sticky left-0 z-20 border-r border-border">{row.ticker}</td>
                        {selectedDates.map((date) => {
                          const dayData = generateIssuerSellData(date, selectedBroker).find(d => d.ticker === row.ticker) || row;
                          return (
                            <React.Fragment key={date}>
                              <td className="text-right py-1.5 px-1 text-red-600">{formatValue(dayData.rsVal)}</td>
                              <td className="text-right py-1.5 px-1 text-red-600">{formatValue(dayData.hitLot)}</td>
                              <td className="text-right py-1.5 px-1 text-red-600">{formatValue(dayData.rsFreq)}</td>
                              <td className="text-right py-1.5 px-1 border-r-2 border-border">{formatValue(dayData.sAvg)}</td>
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderVerticalView = () => {
    if (!selectedBroker) return null;
    
    return (
      <div className="space-y-6">
        {selectedDates.map((date) => {
          const buyData = generateIssuerBuyData(date, selectedBroker);
          const sellData = generateIssuerSellData(date, selectedBroker);
          
          return (
            <div key={date} className="space-y-4">
              {/* Date Header */}
              <div className="text-center">
                <h3 className="text-lg font-semibold text-foreground">{formatDisplayDate(date)}</h3>
              </div>
              
              {/* Buy Side and Sell Side side by side */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Buy Side for this date */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-green-600">BUY SIDE - {selectedBroker}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto rounded-md">
                      <table className="w-full min-w-[560px] text-xs">
                        <thead className="bg-background">
                          <tr className="border-b border-border bg-accent/30">
                            <th className="text-left py-2 px-3 font-medium">Ticker</th>
                            <th className="text-right py-2 px-3 font-medium">RSVal</th>
                            <th className="text-right py-2 px-3 font-medium">HitLot</th>
                            <th className="text-right py-2 px-3 font-medium">RSFreq</th>
                            <th className="text-right py-2 px-3 font-medium">SAvg</th>
                          </tr>
                        </thead>
                        <tbody>
                          {buyData.map((row, idx) => (
                            <tr key={idx} className="border-b border-border/50 hover:bg-accent/50">
                              <td className="py-2 px-3 font-medium">{row.ticker}</td>
                              <td className="text-right py-2 px-3 text-green-600">{formatValue(row.rsVal)}</td>
                              <td className="text-right py-2 px-3">{formatValue(row.hitLot)}</td>
                              <td className="text-right py-2 px-3">{formatValue(row.rsFreq)}</td>
                              <td className="text-right py-2 px-3">{formatValue(row.sAvg)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                {/* Sell Side for this date */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-red-600">SELL SIDE - {selectedBroker}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto rounded-md">
                      <table className="w-full min-w-[560px] text-xs">
                        <thead className="bg-background">
                          <tr className="border-b border-border bg-accent/30">
                            <th className="text-left py-2 px-3 font-medium">Ticker</th>
                            <th className="text-right py-2 px-3 font-medium">RSVal</th>
                            <th className="text-right py-2 px-3 font-medium">HitLot</th>
                            <th className="text-right py-2 px-3 font-medium">RSFreq</th>
                            <th className="text-right py-2 px-3 font-medium">SAvg</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sellData.map((row, idx) => (
                            <tr key={idx} className="border-b border-border/50 hover:bg-accent/50">
                              <td className="py-2 px-3 font-medium">{row.ticker}</td>
                              <td className="text-right py-2 px-3 text-red-600">{formatValue(row.rsVal)}</td>
                              <td className="text-right py-2 px-3 text-red-600">{formatValue(row.hitLot)}</td>
                              <td className="text-right py-2 px-3 text-red-600">{formatValue(row.rsFreq)}</td>
                              <td className="text-right py-2 px-3">{formatValue(row.sAvg)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          );
        })}
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
            {/* Row 1: Broker, Date Range, Quick Select, Layout */}
            <div className="flex flex-col gap-4 md:grid md:grid-cols-2 lg:flex lg:flex-row items-center lg:items-end">
              {/* Broker Selection */}
              <div className="flex-1 min-w-0 w-full">
                <label className="block text-sm font-medium mb-2">Broker:</label>
                <div className="relative">
                  <input
                    type="text"
                    value={brokerInput}
                    onChange={(e) => {
                      const v = e.target.value.toUpperCase();
                      setBrokerInput(v);
                      setShowBrokerSuggestions(true);
                      setHighlightedIndex(0);
                      if (!v) setSelectedBroker('');
                    }}
                    onFocus={() => setShowBrokerSuggestions(true)}
                    onKeyDown={(e) => {
                      const all = ['MG','CIMB','UOB','COIN','NH','TRIM','DEWA','BNCA','PNLF','VRNA','SD','LMGA','DEAL','ESA','SSA'];
                      const suggestions = all.filter(b => b.toLowerCase().includes(brokerInput.toLowerCase())).slice(0, 10);
                      if (e.key === 'ArrowDown' && suggestions.length) {
                        e.preventDefault();
                        setHighlightedIndex((prev) => {
                          const next = prev + 1;
                          return next >= suggestions.length ? 0 : next;
                        });
                      } else if (e.key === 'ArrowUp' && suggestions.length) {
                        e.preventDefault();
                        setHighlightedIndex((prev) => {
                          const next = prev - 1;
                          return next < 0 ? suggestions.length - 1 : next;
                        });
                      } else if (e.key === 'Enter' && showBrokerSuggestions) {
                        e.preventDefault();
                        const idx = highlightedIndex >= 0 ? highlightedIndex : 0;
                        const choice = suggestions[idx];
                        if (choice) {
                          setSelectedBroker(choice);
                          setBrokerInput(choice);
                          setShowBrokerSuggestions(false);
                          setHighlightedIndex(-1);
                        }
                      } else if (e.key === 'Escape') {
                        setShowBrokerSuggestions(false);
                        setHighlightedIndex(-1);
                      }
                    }}
                    placeholder="Enter broker code..."
                    className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm"
                    role="combobox"
                    aria-expanded={showBrokerSuggestions}
                    aria-controls="broker-suggestions"
                    aria-autocomplete="list"
                  />
                  {!!brokerInput && (
                    <button
                      className="absolute right-2 top-2.5 text-muted-foreground"
                      onClick={() => { setBrokerInput(''); setSelectedBroker(''); setShowBrokerSuggestions(false); }}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  {showBrokerSuggestions && (
                    (() => {
                      const all = ['MG','CIMB','UOB','COIN','NH','TRIM','DEWA','BNCA','PNLF','VRNA','SD','LMGA','DEAL','ESA','SSA'];
                      const suggestions = all.filter(b => b.toLowerCase().includes(brokerInput.toLowerCase())).slice(0, 10);
                      return (
                        <div id="broker-suggestions" role="listbox" className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-md border border-border bg-background shadow">
                          {suggestions.map((b, idx) => (
                            <button
                              key={b}
                              role="option"
                              aria-selected={idx === highlightedIndex}
                              className={`w-full text-left px-3 py-2 text-sm ${idx === highlightedIndex ? 'bg-accent' : 'hover:bg-accent'}`}
                              onMouseEnter={() => setHighlightedIndex(idx)}
                              onMouseDown={(e) => { e.preventDefault(); }}
                              onClick={() => {
                                setSelectedBroker(b);
                                setBrokerInput(b);
                                setShowBrokerSuggestions(false);
                                setHighlightedIndex(-1);
                              }}
                            >
                              {b}
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
                  {dateRangeMode === 'custom' && (
                    <Button onClick={clearAllDates} variant="outline" size="sm">
                      <RotateCcw className="w-4 h-4 mr-1" />
                      Clear
                    </Button>
                  )}
                </div>
              </div>

              {/* Layout Mode Toggle */}
              <div className="flex-1 min-w-0 w-full lg:w-auto lg:flex-none">
                <label className="block text-sm font-medium mb-2">Layout:</label>
                <div className="flex sm:inline-flex items-center gap-1 border border-border rounded-lg p-1 overflow-x-auto w-full sm:w-auto lg:w-auto justify-center sm:justify-start">
                  <div className="grid grid-cols-2 gap-1 w-full max-w-xs mx-auto sm:flex sm:items-center sm:gap-1 sm:max-w-none sm:mx-0">
                    <Button
                      variant={layoutMode === 'horizontal' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setLayoutMode('horizontal')}
                      className="px-3 py-1 h-8 text-xs"
                    >
                      Horizontal
                    </Button>
                    <Button
                      variant={layoutMode === 'vertical' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setLayoutMode('vertical')}
                      className="px-3 py-1 h-8 text-xs"
                    >
                      Vertical
                    </Button>
                  </div>
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
      {layoutMode === 'horizontal' ? renderHorizontalView() : renderVerticalView()}
    </div>
  );
}
