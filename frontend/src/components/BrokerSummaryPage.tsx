import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Calendar, Plus, X, RotateCcw } from 'lucide-react';

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

// Top 5 brokers for color coding
const topBrokers = ['LG', 'MG', 'BR', 'RG', 'CC'];

// Sample issuers universe for suggestions
const TICKERS = [
  'BBCA','BBRI','BMRI','BBNI','ARTO','BACA','TLKM','ISAT','FREN','EXCL',
  'ASII','GOTO','ANTM','MDKA','ADRO','UNVR','ICBP','INDF','PGAS','MEDC',
  'CPIN','JPFA','INCO','TPIA','TKIM','INKP','BRIS','SIDO','ERAA','ESSA'
];

// Sample broker summary data with variations by date and ticker filter
const generateBrokerSummaryData = (date: string, ticker: string): BrokerSummaryData[] => {
  const baseData = [
    { broker: 'LG', nblot: 55.643, nbval: 152.8, bavg: 2746.7, sl: 2, nslot: -42.843, nsval: -117.6, savg: 2741.4 },
    { broker: 'MG', nblot: 55.292, nbval: 146.0, bavg: 2741.6, sl: 2, nslot: -54.306, nsval: -149.0, savg: 3730.7 },
    { broker: 'BR', nblot: 31.651, nbval: 86.7, bavg: 2741.5, sl: 3, nslot: -33.653, nsval: -93.8, savg: 2740.8 },
    { broker: 'RG', nblot: 25.066, nbval: 68.6, bavg: 2741.6, sl: 4, nslot: -31.840, nsval: -87.3, savg: 2741.3 },
    { broker: 'CC', nblot: 23.966, nbval: 65.6, bavg: 2742.0, sl: 5, nslot: -21.711, nsval: -59.5, savg: 2741.0 },
    { broker: 'AT', nblot: 11.454, nbval: 31.3, bavg: 2740.7, sl: 7, nslot: -19.538, nsval: -53.4, savg: 2740.7 },
    { broker: 'SD', nblot: 9.599, nbval: 26.2, bavg: 2739.5, sl: 8, nslot: -10.251, nsval: -28.0, savg: 2738.4 },
    { broker: 'MQ', nblot: 9.000, nbval: 24.6, bavg: 2740.9, sl: 9, nslot: -14.121, nsval: -38.6, savg: 2731.4 },
    { broker: 'UU', nblot: 5.549, nbval: 24.0, bavg: 2742.7, sl: 10, nslot: -4.758, nsval: -13.0, savg: 2741.6 },
    { broker: 'UQ', nblot: 6.175, nbval: 16.9, bavg: 2738.1, sl: 11, nslot: -3.347, nsval: -9.1, savg: 2740.2 },
    { broker: 'TG', nblot: 6.594, nbval: 17.6, bavg: 2741.5, sl: 12, nslot: -4.434, nsval: -12.1, savg: 2740.5 },
    { broker: 'PG', nblot: 5.503, nbval: 16.0, bavg: 2739.1, sl: 13, nslot: -2.354, nsval: -6.4, savg: 2740.5 },
    { broker: 'NI', nblot: 6.578, nbval: 15.8, bavg: 2741.4, sl: 14, nslot: -2.000, nsval: -5.5, savg: 2740.9 },
    { broker: 'SN', nblot: 6.888, nbval: 14.9, bavg: 2742.1, sl: 14, nslot: -439, nsval: -1.2, savg: 2740.9 },
    { broker: 'NR', nblot: 6.000, nbval: 14.9, bavg: 2740.6, sl: 16, nslot: -1.057, nsval: -2.9, savg: 2738.8 },
  ];

  // Add date/ticker-based variation to simulate broker participation by issuer
  const dateVariation = new Date(date).getDate() % 5;
  const multiplier = 0.8 + (dateVariation * 0.1);
  const tickerImpact = 0.7 + (seededRandom(ticker) * 0.8);

  const filtered = baseData.filter(row => seededRandom(ticker + row.broker) > 0.35);

  return filtered.map(row => ({
    ...row,
    nblot: row.nblot * multiplier * tickerImpact,
    nbval: row.nbval * multiplier * tickerImpact,
    nslot: row.nslot * multiplier * tickerImpact,
    nsval: row.nsval * multiplier * tickerImpact,
  }));
};

// Helper function to get last 3 days including today (sorted newest first)
const getLastThreeDays = (): string[] => {
  const dates: string[] = [];
  const today = new Date();
  
  for (let i = 0; i < 3; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    dates.push(date.toISOString().split('T')[0]);
  }
  
  // Sort from newest to oldest
  return dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
};


// Deterministic pseudo-random generator based on string seed
const seededRandom = (seed: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0) / 4294967295;
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

const getBrokerRowClass = (broker: string, data: BrokerSummaryData): string => {
  return 'hover:bg-accent/50';
};


export function BrokerSummaryPage() {
  const [selectedDates, setSelectedDates] = useState<string[]>(getLastThreeDays());
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [tickerInput, setTickerInput] = useState('');
  const [selectedTicker, setSelectedTicker] = useState<string>('');
  const [showTickerSuggestions, setShowTickerSuggestions] = useState(false);

  const addDateRange = () => {
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      // Check if range is valid
      if (start > end) {
        alert('Start date must be before end date');
        return;
      }
      
      // Check if range is within 7 days
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays > 7) {
        alert('Maximum 7 days range allowed');
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
      
      // Remove duplicates, sort by date (newest first), and set
      const uniqueDates = Array.from(new Set([...selectedDates, ...dateArray]));
      const sortedDates = uniqueDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
      setSelectedDates(sortedDates);
      setStartDate('');
      setEndDate('');
    }
  };

  const removeDate = (dateToRemove: string) => {
    if (selectedDates.length > 1) {
      setSelectedDates(selectedDates.filter(date => date !== dateToRemove));
    }
  };

  const formatDisplayDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
  };

  const clearAllDates = () => {
    setSelectedDates([selectedDates[0]]); // Keep at least one date
  };

  const resetToLastThreeDays = () => {
    setSelectedDates(getLastThreeDays());
  };

  const renderHorizontalView = () => {
    if (!selectedTicker) return null;
    const buyData = generateBrokerSummaryData(selectedDates[0], selectedTicker);
    const sellData = generateBrokerSummaryData(selectedDates[0], selectedTicker).map(broker => ({
      ...broker,
      nblot: Math.abs(broker.nslot), // Convert sell to positive for display
      nbval: Math.abs(broker.nsval),
      bavg: broker.savg,
      nslot: broker.nslot,
      nsval: broker.nsval,
      savg: broker.savg
    }));
    
    return (
      <div className="space-y-6">
        {/* Buy Side Horizontal Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-green-600">BUY SIDE - {selectedTicker}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <div className="inline-block min-w-full">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-2 font-medium bg-accent/50 sticky left-0 z-10">Broker</th>
                      {selectedDates.map((date) => (
                        <th key={date} colSpan={4} className="text-center py-2 px-1 font-medium border-l border-border">
                          {formatDisplayDate(date)}
                        </th>
                      ))}
                    </tr>
                    <tr className="border-b border-border bg-accent/30">
                      <th className="text-left py-1 px-2 font-medium bg-accent/50 sticky left-0 z-10"></th>
                      {selectedDates.map((date) => (
                        <React.Fragment key={date}>
                          <th className="text-right py-1 px-1 font-medium text-[10px]">NBLot</th>
                          <th className="text-right py-1 px-1 font-medium text-[10px]">NBVal</th>
                          <th className="text-right py-1 px-1 font-medium text-[10px]">BAvg</th>
                          <th className="text-right py-1 px-1 font-medium text-[10px] border-r border-border">Net</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {buyData.map((row, idx) => (
                      <tr key={idx} className={`border-b border-border/50 hover:bg-accent/50 ${getBrokerRowClass(row.broker, row)}`}>
                        <td className="py-1.5 px-2 font-medium bg-background/80 sticky left-0 z-10 border-r border-border">{row.broker}</td>
                        {selectedDates.map((date) => {
                          const dayData = generateBrokerSummaryData(date, selectedTicker).find(d => d.broker === row.broker) || row;
                          const netPosition = dayData.nblot + dayData.nslot;
                          return (
                            <React.Fragment key={date}>
                              <td className="text-right py-1.5 px-1 text-green-600">{formatValue(dayData.nblot)}</td>
                              <td className="text-right py-1.5 px-1 text-green-600">{formatValue(dayData.nbval)}</td>
                              <td className="text-right py-1.5 px-1">{formatValue(dayData.bavg)}</td>
                              <td className={`text-right py-1.5 px-1 border-r border-border font-medium ${netPosition >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {netPosition >= 0 ? '+' : ''}{formatValue(netPosition)}
                              </td>
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
            <CardTitle className="text-red-600">SELL SIDE - {selectedTicker}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <div className="inline-block min-w-full">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-2 font-medium bg-accent/50 sticky left-0 z-10">Broker</th>
                      {selectedDates.map((date) => (
                        <th key={date} colSpan={4} className="text-center py-2 px-1 font-medium border-l border-border">
                          {formatDisplayDate(date)}
                        </th>
                      ))}
                    </tr>
                    <tr className="border-b border-border bg-accent/30">
                      <th className="text-left py-1 px-2 font-medium bg-accent/50 sticky left-0 z-10"></th>
                      {selectedDates.map((date) => (
                        <React.Fragment key={date}>
                          <th className="text-right py-1 px-1 font-medium text-[10px]">NSLot</th>
                          <th className="text-right py-1 px-1 font-medium text-[10px]">NSVal</th>
                          <th className="text-right py-1 px-1 font-medium text-[10px]">SAvg</th>
                          <th className="text-right py-1 px-1 font-medium text-[10px] border-r border-border">Net</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sellData.map((row, idx) => (
                      <tr key={idx} className={`border-b border-border/50 hover:bg-accent/50 ${getBrokerRowClass(row.broker, row)}`}>
                        <td className="py-1.5 px-2 font-medium bg-background/80 sticky left-0 z-10 border-r border-border">{row.broker}</td>
                        {selectedDates.map((date) => {
                          const dayData = generateBrokerSummaryData(date, selectedTicker).find(d => d.broker === row.broker) || row;
                          const netPosition = dayData.nblot + dayData.nslot;
                          return (
                            <React.Fragment key={date}>
                              <td className="text-right py-1.5 px-1 text-red-600">{formatValue(dayData.nslot)}</td>
                              <td className="text-right py-1.5 px-1 text-red-600">{formatValue(dayData.nsval)}</td>
                              <td className="text-right py-1.5 px-1">{formatValue(dayData.savg)}</td>
                              <td className={`text-right py-1.5 px-1 border-r border-border font-medium ${netPosition >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {netPosition >= 0 ? '+' : ''}{formatValue(netPosition)}
                              </td>
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
            {/* Selected Dates */}
            <div>
              <label className="text-sm font-medium">Selected Dates:</label>
              <div className="flex flex-wrap items-center gap-2 mt-2">
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
                {selectedDates.length > 1 && (
                  <Button onClick={clearAllDates} variant="outline" size="sm">
                    <RotateCcw className="w-3 h-3 mr-1" />
                    Clear All
                  </Button>
                )}
                <Button onClick={resetToLastThreeDays} variant="outline" size="sm">
                  <Calendar className="w-3 h-3 mr-1" />
                  Last 3 Days
                </Button>

                {/* Ticker Autocomplete (compact, inline) */}
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
                    placeholder="Ticker..."
                    className="px-3 py-1.5 border border-border rounded-md bg-input text-foreground w-32"
                  />
                  {!!tickerInput && (
                    <button
                      className="absolute right-1 top-1.5 text-muted-foreground"
                      onClick={() => { setTickerInput(''); setSelectedTicker(''); setShowTickerSuggestions(false); }}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                  {showTickerSuggestions && (
                    <div className="absolute z-20 mt-1 w-40 max-h-56 overflow-auto rounded-md border border-border bg-background shadow">
                      {TICKERS.filter(t => t.toLowerCase().includes(tickerInput.toLowerCase())).slice(0, 10).map(t => (
                        <button
                          key={t}
                          className="w-full text-left px-3 py-1.5 hover:bg-accent"
                          onClick={() => {
                            setSelectedTicker(t);
                            setTickerInput(t);
                            setShowTickerSuggestions(false);
                          }}
                        >
                          {t}
                        </button>
                      ))}
                      {TICKERS.filter(t => t.toLowerCase().includes(tickerInput.toLowerCase())).length === 0 && (
                        <div className="px-3 py-1.5 text-sm text-muted-foreground">No results</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Add Date Range */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
              <div>
                <label className="text-sm font-medium">Start Date:</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md bg-input text-foreground"
                />
              </div>
              <div>
                <label className="text-sm font-medium">End Date:</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md bg-input text-foreground"
                />
              </div>
              <Button onClick={addDateRange} size="sm">
                <Plus className="w-4 h-4 mr-1" />
                Add Range
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Data Display */}
      {renderHorizontalView()}
    </div>
  );
}