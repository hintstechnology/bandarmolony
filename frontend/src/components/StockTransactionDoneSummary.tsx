import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Calendar, Plus, X, ChevronDown } from 'lucide-react';

interface PriceData {
  price: number;
  bFreq: number;
  bLot: number;
  sLot: number;
  sFreq: number;
  freq: number;
  lot: number;
  priceColor: 'green' | 'yellow' | 'red';
  sFreqColor: 'green' | 'red';
  bFreqColor: 'green' | 'red';
}

// Sample price data based on the image
const generatePriceData = (date: string): PriceData[] => [
  {
    price: 650,
    bFreq: 0,
    bLot: 0,
    sLot: 43025191,
    sFreq: 8421,
    freq: 8421,
    lot: 43025191,
    priceColor: 'green',
    sFreqColor: 'green',
    bFreqColor: 'red'
  },
  {
    price: 565,
    bFreq: 0,
    bLot: 0,
    sLot: 46255,
    sFreq: 292,
    freq: 292,
    lot: 46255,
    priceColor: 'green',
    sFreqColor: 'green',
    bFreqColor: 'red'
  },
  {
    price: 560,
    bFreq: 669,
    bLot: 267775,
    sLot: 192785,
    sFreq: 762,
    freq: 1431,
    lot: 460560,
    priceColor: 'green',
    sFreqColor: 'green',
    bFreqColor: 'red'
  },
  {
    price: 555,
    bFreq: 1210,
    bLot: 502015,
    sLot: 351699,
    sFreq: 865,
    freq: 2075,
    lot: 853714,
    priceColor: 'yellow',
    sFreqColor: 'red',
    bFreqColor: 'red'
  },
  {
    price: 550,
    bFreq: 1406,
    bLot: 444230,
    sLot: 818031,
    sFreq: 2112,
    freq: 3518,
    lot: 1262261,
    priceColor: 'red',
    sFreqColor: 'green',
    bFreqColor: 'red'
  },
  {
    price: 545,
    bFreq: 3088,
    bLot: 924495,
    sLot: 1423622,
    sFreq: 3108,
    freq: 6196,
    lot: 2348117,
    priceColor: 'red',
    sFreqColor: 'green',
    bFreqColor: 'red'
  },
  {
    price: 540,
    bFreq: 4699,
    bLot: 1271579,
    sLot: 129443,
    sFreq: 140,
    freq: 4839,
    lot: 1401022,
    priceColor: 'red',
    sFreqColor: 'red',
    bFreqColor: 'green'
  },
  {
    price: 535,
    bFreq: 111,
    bLot: 25048,
    sLot: 0,
    sFreq: 0,
    freq: 111,
    lot: 25048,
    priceColor: 'red',
    sFreqColor: 'red',
    bFreqColor: 'red'
  }
];

const formatNumber = (num: number): string => {
  return num.toLocaleString();
};

const getPriceColor = (color: 'green' | 'yellow' | 'red'): string => {
  switch (color) {
    case 'green': return 'text-green-500';
    case 'yellow': return 'text-yellow-500';
    case 'red': return 'text-red-500';
    default: return 'text-foreground';
  }
};

const getFreqColor = (color: 'green' | 'red'): string => {
  switch (color) {
    case 'green': return 'text-green-500';
    case 'red': return 'text-red-500';
    default: return 'text-foreground';
  }
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

export function StockTransactionDoneSummary() {
  const [selectedDates, setSelectedDates] = useState<string[]>(getLastThreeDays());
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedStock, setSelectedStock] = useState('BBRI');

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

  const renderVerticalView = () => {
    return (
      <div className="space-y-6">
        {/* Done Summary Table for Each Date */}
        {selectedDates.map((date) => {
          const priceData = generatePriceData(date);
          
          return (
            <Card key={date}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ChevronDown className="w-5 h-5" />
                  Done Summary - {selectedStock} ({formatDisplayDate(date)})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 font-medium">Price</th>
                        <th className="text-right py-2 font-medium">B Freq</th>
                        <th className="text-right py-2 font-medium">B Lot</th>
                        <th className="text-right py-2 font-medium">S Lot</th>
                        <th className="text-right py-2 font-medium">S Freq</th>
                        <th className="text-right py-2 font-medium">Freq</th>
                        <th className="text-right py-2 font-medium">Lot</th>
                      </tr>
                    </thead>
                    <tbody>
                      {priceData.map((row, idx) => (
                        <tr key={idx} className="border-b border-border/50 hover:bg-accent/50">
                          <td className={`py-2 font-medium ${getPriceColor(row.priceColor)}`}>
                            {row.price}
                          </td>
                          <td className={`text-right py-2 ${getFreqColor(row.bFreqColor)}`}>
                            {formatNumber(row.bFreq)}
                          </td>
                          <td className="text-right py-2 text-foreground">
                            {formatNumber(row.bLot)}
                          </td>
                          <td className="text-right py-2 text-foreground">
                            {formatNumber(row.sLot)}
                          </td>
                          <td className={`text-right py-2 ${getFreqColor(row.sFreqColor)}`}>
                            {formatNumber(row.sFreq)}
                          </td>
                          <td className="text-right py-2 text-foreground">
                            {formatNumber(row.freq)}
                          </td>
                          <td className="text-right py-2 text-foreground">
                            {formatNumber(row.lot)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
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
            Stock Selection & Date Range (Max 7 Days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Stock Selection */}
            <div>
              <label className="text-sm font-medium">Selected Stock:</label>
              <div className="flex gap-2 mt-2">
                <select 
                  value={selectedStock}
                  onChange={(e) => setSelectedStock(e.target.value)}
                  className="px-3 py-2 border border-border rounded-md bg-input text-foreground"
                >
                  <option value="BBRI">BBRI</option>
                  <option value="BBCA">BBCA</option>
                  <option value="BMRI">BMRI</option>
                  <option value="TLKM">TLKM</option>
                  <option value="ASII">ASII</option>
                  <option value="UNVR">UNVR</option>
                </select>
              </div>
            </div>

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
                    <X className="w-3 h-3 mr-1" />
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
      {renderVerticalView()}
    </div>
  );
}