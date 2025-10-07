import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Calendar, Plus, X, RotateCcw } from 'lucide-react';

interface BrokerData {
  brkCode: string;
  rsVal: number;
  hitLot: number;
  rsFreq: number;
  sAvg: number;
}

// Sample broker transaction data
const generateBrokerData = (date: string): BrokerData[] => [
  { brkCode: 'MG', rsVal: 106.653, hitLot: 14.014, rsFreq: 14.014, sAvg: 1.324 },
  { brkCode: 'CIMB', rsVal: 27.9, hitLot: 169.776, rsFreq: 5.431, sAvg: 1.067 },
  { brkCode: 'UOB', rsVal: 69.2, hitLot: 90.661, rsFreq: 360, sAvg: 2.955 },
  { brkCode: 'COIN', rsVal: 6.9, hitLot: 103.766, rsFreq: 16.892, sAvg: 680 },
  { brkCode: 'NH', rsVal: 6.1, hitLot: 26.663, rsFreq: 19, sAvg: 343 },
  { brkCode: 'TRIM', rsVal: 5.9, hitLot: 192.292, rsFreq: 277, sAvg: 303 },
  { brkCode: 'DEWA', rsVal: 3.5, hitLot: 360.518, rsFreq: 234, sAvg: 310 },
  { brkCode: 'BNCA', rsVal: 3.3, hitLot: 3.676, rsFreq: 123, sAvg: 8.093 },
  { brkCode: 'PNLF', rsVal: 2.7, hitLot: 291.203, rsFreq: 1.679, sAvg: 270 },
  { brkCode: 'VRNA', rsVal: 2.6, hitLot: 235.412, rsFreq: 5.104, sAvg: 172 },
  { brkCode: 'SD', rsVal: 2.3, hitLot: 17.099, rsFreq: 161, sAvg: 1.739 },
  { brkCode: 'LMGA', rsVal: 2.3, hitLot: 13.636, rsFreq: 131, sAvg: 1.739 },
  { brkCode: 'DEAL', rsVal: 1.8, hitLot: 10.761, rsFreq: 40, sAvg: 1.570 },
  { brkCode: 'ESA', rsVal: 1.6, hitLot: 20.950, rsFreq: 224, sAvg: 504 },
  { brkCode: 'SSA', rsVal: 1.4, hitLot: 5.159, rsFreq: 23, sAvg: 2.835 },
];

// Sample negative data for sell side
const generateNegativeBrokerData = (date: string): BrokerData[] => [
  { brkCode: 'BREN', rsVal: -19.8, hitLot: -25.571, rsFreq: -1.745, sAvg: 7.743 },
  { brkCode: 'CA', rsVal: -18.3, hitLot: -72.947, rsFreq: -294, sAvg: 2.353 },
  { brkCode: 'PTRO', rsVal: -13.2, hitLot: -34.650, rsFreq: -1.046, sAvg: 5.722 },
  { brkCode: 'TOGA', rsVal: -8.3, hitLot: -78.749, rsFreq: -1.994, sAvg: 1.012 },
  { brkCode: 'CUAN', rsVal: -8.1, hitLot: -52.204, rsFreq: -4.472, sAvg: 1.547 },
  { brkCode: 'AGRO', rsVal: -7.3, hitLot: -37.640, rsFreq: -2.253, sAvg: 1.984 },
  { brkCode: 'PTMR', rsVal: -6.0, hitLot: -160.014, rsFreq: -4, sAvg: 374 },
  { brkCode: 'RHB', rsVal: -4.6, hitLot: -42.400, rsFreq: 106, sAvg: 3.999 },
  { brkCode: 'INCO', rsVal: -4.5, hitLot: -12.265, rsFreq: 261, sAvg: 3.708 },
  { brkCode: 'MAAS', rsVal: -3.8, hitLot: -32.051, rsFreq: -454, sAvg: 1.174 },
];

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
    const buyData = generateBrokerData(selectedDates[0]);
    const sellData = generateNegativeBrokerData(selectedDates[0]);
    
    return (
      <div className="space-y-6">
        {/* Buy Side Horizontal Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-green-600">BUY SIDE - Multi-Date Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <div className="inline-block min-w-full">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-2 font-medium bg-accent/50 sticky left-0 z-10">BRKCode</th>
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
                        <td className="py-1.5 px-2 font-medium bg-background/80 sticky left-0 z-10 border-r border-border">{row.brkCode}</td>
                        {selectedDates.map((date) => {
                          const dayData = generateBrokerData(date).find(d => d.brkCode === row.brkCode) || row;
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
            <CardTitle className="text-red-600">SELL SIDE - Multi-Date Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <div className="inline-block min-w-full">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-2 font-medium bg-accent/50 sticky left-0 z-10">BRKCode</th>
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
                        <td className="py-1.5 px-2 font-medium bg-background/80 sticky left-0 z-10 border-r border-border">{row.brkCode}</td>
                        {selectedDates.map((date) => {
                          const dayData = generateNegativeBrokerData(date).find(d => d.brkCode === row.brkCode) || row;
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