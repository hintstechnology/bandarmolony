import { useState } from 'react';
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

// Generate broker summary data for a specific date and ticker
const generateBrokerSummaryData = (date: string, ticker: string): BrokerSummaryData[] => {
  const brokers = ['LG', 'MG', 'BR', 'RG', 'CC', 'UQ', 'MI', 'KS', 'DA', 'SS'];
  
  return brokers.map(broker => {
    // Create deterministic seed based on date and ticker
    const seed = ticker.charCodeAt(0) + (date ?? '').split('-').reduce((acc, part) => acc + parseInt(part), 0);
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

// Get last three trading days
const getLastThreeDays = (): string[] => {
  const today = new Date();
  const dates: string[] = [];
  
  for (let i = 0; i < 3; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    dates.push(date.toISOString().split('T')[0] ?? '');
  }
  
  return dates;
};

const formatNumber = (value: number): string => {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  } else if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toLocaleString();
};

const getBrokerRowClass = (broker: string, _data: BrokerSummaryData): string => {
  const isDarkMode = useDarkMode();
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
  const [layoutMode, setLayoutMode] = useState<'horizontal' | 'vertical'>('vertical');
  const [dateRangeMode, setDateRangeMode] = useState<'1day' | '3days' | '1week' | 'custom'>('3days');

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

  const formatDisplayDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
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
      const oneWeek = getLastThreeDays().slice(0, 7);
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

  const renderVerticalView = () => {
    if (!selectedTicker || selectedDates.length === 0) return null;
    
    return (
      <div className="space-y-6">
        {selectedDates.map((date) => {
          const buyData = generateBrokerSummaryData(date, selectedTicker);
          const sellData = generateBrokerSummaryData(date, selectedTicker).map(broker => ({
            ...broker,
            nblot: Math.abs(broker.nslot),
            nbval: Math.abs(broker.nsval),
            bavg: broker.savg,
            nslot: broker.nslot,
            nsval: broker.nsval,
            savg: broker.savg
          }));
          
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
                    <CardTitle className="text-green-600">BUY SIDE - {selectedTicker}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left py-2 px-2 font-medium">Broker</th>
                            <th className="text-right py-2 px-2 font-medium">NBLot</th>
                            <th className="text-right py-2 px-2 font-medium">NBVal</th>
                            <th className="text-right py-2 px-2 font-medium">BAvg</th>
                            <th className="text-right py-2 px-2 font-medium">SL</th>
                          </tr>
                        </thead>
                        <tbody>
                          {buyData.map((row, idx) => (
                            <tr key={idx} className={`border-b border-border/50 hover:bg-accent/50 ${getBrokerRowClass(row.broker, row)}`}>
                              <td className="py-2 px-2 font-medium">{row.broker}</td>
                              <td className="text-right py-2 px-2 text-green-600">{formatNumber(row.nblot)}</td>
                              <td className="text-right py-2 px-2 text-green-600">{formatNumber(row.nbval)}</td>
                              <td className="text-right py-2 px-2">{formatNumber(row.bavg)}</td>
                              <td className="text-right py-2 px-2">{formatNumber(row.sl)}</td>
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
                    <CardTitle className="text-red-600">SELL SIDE - {selectedTicker}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left py-2 px-2 font-medium">Broker</th>
                            <th className="text-right py-2 px-2 font-medium">NSLot</th>
                            <th className="text-right py-2 px-2 font-medium">NSVal</th>
                            <th className="text-right py-2 px-2 font-medium">SAvg</th>
                            <th className="text-right py-2 px-2 font-medium">Net</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sellData.map((row, idx) => (
                            <tr key={idx} className={`border-b border-border/50 hover:bg-accent/50 ${getBrokerRowClass(row.broker, row)}`}>
                              <td className="py-2 px-2 font-medium">{row.broker}</td>
                              <td className="text-right py-2 px-2 text-red-600">{formatNumber(row.nslot)}</td>
                              <td className="text-right py-2 px-2 text-red-600">{formatNumber(row.nsval)}</td>
                              <td className="text-right py-2 px-2">{formatNumber(row.savg)}</td>
                              <td className="text-right py-2 px-2 font-medium">
                                {formatNumber(row.nblot + row.nslot)}
                              </td>
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
            {/* Row 1: Ticker, Date Range, Quick Select, Layout */}
            <div className="flex flex-col lg:flex-row gap-4 items-end">
              {/* Ticker Selection */}
              <div className="flex-1">
                <label className="block text-sm font-medium mb-2">Ticker:</label>
                <div className="relative">
                  <input
                    type="text"
                    value={tickerInput}
                    onChange={(e) => {
                      const v = e.target.value.toUpperCase();
                      setTickerInput(v);
                      setShowTickerSuggestions(true);
                      if (!v) setSelectedTicker('');
                    }}
                    onFocus={() => setShowTickerSuggestions(true)}
                    placeholder="Enter ticker code..."
                    className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm"
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
                    <div className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-md border border-border bg-background shadow">
                      {TICKERS
                        .filter(t => t.toLowerCase().includes(tickerInput.toLowerCase()))
                        .slice(0, 10)
                        .map(t => (
                          <button
                            key={t}
                            onClick={() => {
                              setTickerInput(t);
                              setSelectedTicker(t);
                              setShowTickerSuggestions(false);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
                          >
                            {t}
                          </button>
                        ))}
                      {TICKERS.filter(t => t.toLowerCase().includes(tickerInput.toLowerCase())).length === 0 && (
                        <div className="px-3 py-2 text-sm text-muted-foreground">No results</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Date Range */}
              <div className="flex-1">
                <label className="block text-sm font-medium mb-2">Date Range:</label>
                <div className="flex gap-2 items-center">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="flex-1 px-3 py-2 border border-border rounded-md bg-input text-foreground text-sm"
                  />
                  <span className="text-sm text-muted-foreground">to</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="flex-1 px-3 py-2 border border-border rounded-md bg-input text-foreground text-sm"
                  />
                  <Button onClick={addDateRange} size="sm">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Quick Select */}
              <div className="flex-1">
                <label className="block text-sm font-medium mb-2">Quick Select:</label>
                <div className="flex gap-2">
                  <select 
                    className="flex-1 px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm"
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
              <div className="flex-1">
                <label className="block text-sm font-medium mb-2">Layout:</label>
                <div className="flex gap-1">
                  <Button
                    variant={layoutMode === 'horizontal' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setLayoutMode('horizontal')}
                    className="flex-1"
                  >
                    Horizontal
                  </Button>
                  <Button
                    variant={layoutMode === 'vertical' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setLayoutMode('vertical')}
                    className="flex-1"
                  >
                    Vertical
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
      {layoutMode === 'horizontal' ? (
        <div className="text-center py-8 text-muted-foreground">
          Horizontal view is not available in this version
        </div>
      ) : (
        renderVerticalView()
      )}
    </div>
  );
}