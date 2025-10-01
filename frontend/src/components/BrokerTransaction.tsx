import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Calendar, Plus, X, RotateCcw } from 'lucide-react';

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

export function BrokerTransaction() {
  const [selectedDates, setSelectedDates] = useState<string[]>(getLastThreeDays());
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [brokerInput, setBrokerInput] = useState('');
  const [selectedBroker, setSelectedBroker] = useState<string>('');
  const [showBrokerSuggestions, setShowBrokerSuggestions] = useState(false);

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
            <div className="overflow-x-auto">
              <div className="inline-block min-w-full">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-2 font-medium bg-accent/50 sticky left-0 z-10">Ticker</th>
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
                          <th className="text-right py-1 px-1 font-medium text-[10px]">RSVal</th>
                          <th className="text-right py-1 px-1 font-medium text-[10px]">HitLot</th>
                          <th className="text-right py-1 px-1 font-medium text-[10px]">RSFreq</th>
                          <th className="text-right py-1 px-1 font-medium text-[10px] border-r border-border">SAvg</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {buyData.map((row, idx) => (
                      <tr key={idx} className="border-b border-border/50 hover:bg-accent/50">
                        <td className="py-1.5 px-2 font-medium bg-background/80 sticky left-0 z-10 border-r border-border">{row.ticker}</td>
                        {selectedDates.map((date) => {
                          const dayData = generateIssuerBuyData(date, selectedBroker).find(d => d.ticker === row.ticker) || row;
                          return (
                            <React.Fragment key={date}>
                              <td className="text-right py-1.5 px-1 text-green-600">{formatValue(dayData.rsVal)}</td>
                              <td className="text-right py-1.5 px-1">{formatValue(dayData.hitLot)}</td>
                              <td className="text-right py-1.5 px-1">{formatValue(dayData.rsFreq)}</td>
                              <td className="text-right py-1.5 px-1 border-r border-border">{formatValue(dayData.sAvg)}</td>
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
            <div className="overflow-x-auto">
              <div className="inline-block min-w-full">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-2 font-medium bg-accent/50 sticky left-0 z-10">Ticker</th>
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
                          <th className="text-right py-1 px-1 font-medium text-[10px]">RSVal</th>
                          <th className="text-right py-1 px-1 font-medium text-[10px]">HitLot</th>
                          <th className="text-right py-1 px-1 font-medium text-[10px]">RSFreq</th>
                          <th className="text-right py-1 px-1 font-medium text-[10px] border-r border-border">SAvg</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sellData.map((row, idx) => (
                      <tr key={idx} className="border-b border-border/50 hover:bg-accent/50">
                        <td className="py-1.5 px-2 font-medium bg-background/80 sticky left-0 z-10 border-r border-border">{row.ticker}</td>
                        {selectedDates.map((date) => {
                          const dayData = generateIssuerSellData(date, selectedBroker).find(d => d.ticker === row.ticker) || row;
                          return (
                            <React.Fragment key={date}>
                              <td className="text-right py-1.5 px-1 text-red-600">{formatValue(dayData.rsVal)}</td>
                              <td className="text-right py-1.5 px-1 text-red-600">{formatValue(dayData.hitLot)}</td>
                              <td className="text-right py-1.5 px-1 text-red-600">{formatValue(dayData.rsFreq)}</td>
                              <td className="text-right py-1.5 px-1 border-r border-border">{formatValue(dayData.sAvg)}</td>
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

                {/* Broker Autocomplete (compact, inline) */}
                <div className="relative">
                  <input
                    type="text"
                    value={brokerInput}
                    onChange={(e) => {
                      const v = e.target.value.toUpperCase();
                      setBrokerInput(v);
                      setShowBrokerSuggestions(true);
                      if (!v) setSelectedBroker('');
                    }}
                    onFocus={() => setShowBrokerSuggestions(true)}
                    placeholder="Broker..."
                    className="px-3 py-1.5 border border-border rounded-md bg-input text-foreground w-32"
                  />
                  {!!brokerInput && (
                    <button
                      className="absolute right-1 top-1.5 text-muted-foreground"
                      onClick={() => { setBrokerInput(''); setSelectedBroker(''); setShowBrokerSuggestions(false); }}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                  {showBrokerSuggestions && (
                    <div className="absolute z-20 mt-1 w-40 max-h-56 overflow-auto rounded-md border border-border bg-background shadow">
                      {['MG','CIMB','UOB','COIN','NH','TRIM','DEWA','BNCA','PNLF','VRNA','SD','LMGA','DEAL','ESA','SSA']
                        .filter(b => b.toLowerCase().includes(brokerInput.toLowerCase()))
                        .slice(0, 10)
                        .map(b => (
                          <button
                            key={b}
                            className="w-full text-left px-3 py-1.5 hover:bg-accent"
                            onClick={() => {
                              setSelectedBroker(b);
                              setBrokerInput(b);
                              setShowBrokerSuggestions(false);
                            }}
                          >
                            {b}
                          </button>
                        ))}
                      {['MG','CIMB','UOB','COIN','NH','TRIM','DEWA','BNCA','PNLF','VRNA','SD','LMGA','DEAL','ESA','SSA']
                        .filter(b => b.toLowerCase().includes(brokerInput.toLowerCase())).length === 0 && (
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