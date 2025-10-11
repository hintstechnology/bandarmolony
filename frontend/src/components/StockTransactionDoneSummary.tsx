import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Calendar, Plus, X, ChevronDown, RotateCcw, TrendingUp } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';

interface PriceData {
  price: number;
  bFreq: number;
  bLot: number;
  sLot: number;
  sFreq: number;
  tFreq: number;
  tLot: number;
}

interface BrokerBreakdownData {
  broker: string;
  price: number;
  bLot: number;
  sLot: number;
  bFreq: number;
  sFreq: number;
  tFreq: number;
  tLot: number;
}

// Available stocks from the data
const AVAILABLE_STOCKS = [
  'BBRI', 'BBCA', 'BMRI', 'BBNI', 'TLKM', 'ASII', 'UNVR', 'GGRM', 'ICBP', 'INDF', 
  'KLBF', 'ADRO', 'ANTM', 'ITMG', 'PTBA', 'SMGR', 'INTP', 'WIKA', 'WSKT', 'PGAS'
];

// Generate realistic price data based on BBRI.csv structure
const generatePriceData = (stock: string, date: string): PriceData[] => {
  const basePrice = stock === 'BBRI' ? 4150 : stock === 'BBCA' ? 2750 : stock === 'BMRI' ? 3200 : 1500;
  
  // Create a seed based on stock and date for consistent data
  const seed = stock.charCodeAt(0) + date.split('-').reduce((acc, part) => acc + parseInt(part), 0);
  
  const data: PriceData[] = [];
  
  // Generate 15-20 price levels around base price
  for (let i = -10; i <= 10; i++) {
    const price = basePrice + (i * 10);
    const priceSeed = seed + i * 100;
    
    // Skip some prices based on seed (consistent skipping)
    if ((priceSeed % 10) > 2) { // 70% chance of having data
      const bLot = (priceSeed * 123) % 50000000;
      const sLot = (priceSeed * 456) % 50000000;
      const bFreq = (priceSeed * 789) % 5000;
      const sFreq = (priceSeed * 321) % 5000;
      
      data.push({
        price,
        bFreq,
        bLot,
        sLot,
        sFreq,
        tFreq: bFreq + sFreq,
        tLot: bLot + sLot
      });
    }
  }
  
  return data.sort((a, b) => b.price - a.price); // Sort by price descending
};

// Generate broker breakdown data
const generateBrokerBreakdownData = (stock: string, date: string): BrokerBreakdownData[] => {
  const brokers = ['LG', 'MG', 'BR', 'RG', 'CC', 'AT', 'SD', 'MQ', 'UU', 'UQ'];
  const basePrice = stock === 'BBRI' ? 4150 : stock === 'BBCA' ? 2750 : 1500;
  
  // Create a seed based on stock and date for consistent data
  const seed = stock.charCodeAt(0) + date.split('-').reduce((acc, part) => acc + parseInt(part), 0);
  
  const data: BrokerBreakdownData[] = [];
  
  brokers.forEach((broker, brokerIndex) => {
    // Generate 2-4 price levels per broker, but some brokers might have no transactions on some dates
    const brokerSeed = seed + brokerIndex * 100;
    const numPrices = 2 + (brokerSeed % 3);
    
    // Some brokers might have no transactions on certain dates (20% chance)
    const hasTransactions = (brokerSeed % 5) !== 0;
    
    if (hasTransactions) {
      for (let i = 0; i < numPrices; i++) {
        const priceSeed = brokerSeed + i * 10;
        const price = basePrice + ((priceSeed % 21) - 10) * 10;
        
        // Some price levels might have zero transactions
        const hasData = (priceSeed % 4) !== 0; // 75% chance of having data
        
        if (hasData) {
          const bLot = (priceSeed * 123) % 10000000;
          const sLot = (priceSeed * 456) % 10000000;
          const bFreq = (priceSeed * 789) % 1000;
          const sFreq = (priceSeed * 321) % 1000;
          
          data.push({
            broker,
            price,
            bLot,
            sLot,
            bFreq,
            sFreq,
            tFreq: bFreq + sFreq,
            tLot: bLot + sLot
          });
        }
      }
    }
  });
  
  return data.sort((a, b) => a.broker.localeCompare(b.broker) || b.price - a.price);
};

const formatNumber = (num: number): string => {
  return num.toLocaleString();
};

// Helper function to find max values for highlighting
const findMaxValues = (data: PriceData[]) => {
  return {
    maxBLot: Math.max(...data.map(d => d.bLot)),
    maxSLot: Math.max(...data.map(d => d.sLot)),
    maxBFreq: Math.max(...data.map(d => d.bFreq)),
    maxSFreq: Math.max(...data.map(d => d.sFreq)),
    maxTFreq: Math.max(...data.map(d => d.tFreq)),
    maxTLot: Math.max(...data.map(d => d.tLot))
  };
};

// Helper function to calculate totals
const calculateTotals = (data: PriceData[]) => {
  return data.reduce((totals, row) => ({
    bLot: totals.bLot + row.bLot,
    sLot: totals.sLot + row.sLot,
    bFreq: totals.bFreq + row.bFreq,
    sFreq: totals.sFreq + row.sFreq,
    tFreq: totals.tFreq + row.tFreq,
    tLot: totals.tLot + row.tLot
  }), { bLot: 0, sLot: 0, bFreq: 0, sFreq: 0, tFreq: 0, tLot: 0 });
};

// Helper function to calculate broker breakdown totals for a specific date
const calculateBrokerBreakdownTotals = (stock: string, date: string) => {
  const data = generateBrokerBreakdownData(stock, date);
  return data.reduce((totals, row) => ({
    bLot: totals.bLot + row.bLot,
    sLot: totals.sLot + row.sLot,
    bFreq: totals.bFreq + row.bFreq,
    sFreq: totals.sFreq + row.sFreq,
    tFreq: totals.tFreq + row.tFreq,
    tLot: totals.tLot + row.tLot
  }), { bLot: 0, sLot: 0, bFreq: 0, sFreq: 0, tFreq: 0, tLot: 0 });
};

// Helper function to get all unique prices across all dates that have transactions (sorted ascending)
const getAllUniquePrices = (stock: string, dates: string[]): number[] => {
  const allPrices = new Set<number>();
  
  // First, collect all possible prices from all dates
  dates.forEach(date => {
    const data = generatePriceData(stock, date);
    data.forEach(item => allPrices.add(item.price));
  });
  
  // Filter out prices that have no transactions across ALL dates
  const validPrices = Array.from(allPrices).filter(price => {
    // Check if this price has at least one non-zero transaction across all dates
    let hasAnyTransaction = false;
    
    for (const date of dates) {
      const data = getDataForPriceAndDate(stock, date, price);
      if (data && (
        data.bFreq > 0 || data.bLot > 0 || data.sLot > 0 || 
        data.sFreq > 0 || data.tFreq > 0 || data.tLot > 0
      )) {
        hasAnyTransaction = true;
        break; // Found at least one transaction, this price is valid
      }
    }
    
    return hasAnyTransaction;
  });
  
  // Additional filtering: Remove prices that have zero values across all dates
  const finalValidPrices = validPrices.filter(price => {
    let totalTransactions = 0;
    
    for (const date of dates) {
      const data = getDataForPriceAndDate(stock, date, price);
      if (data) {
        totalTransactions += data.bFreq + data.bLot + data.sLot + data.sFreq + data.tFreq + data.tLot;
      }
    }
    
    return totalTransactions > 0;
  });
  
  return finalValidPrices.sort((a, b) => a - b); // Sort ascending (lowest to highest)
};

// Helper function to get data for specific price and date
const getDataForPriceAndDate = (stock: string, date: string, price: number): PriceData | null => {
  const data = generatePriceData(stock, date);
  return data.find(item => item.price === price) || null;
};

// Helper function to find max values across all dates for horizontal layout
const findMaxValuesHorizontal = (stock: string, dates: string[]) => {
  let maxBFreq = 0, maxBLot = 0, maxSLot = 0, maxSFreq = 0, maxTFreq = 0, maxTLot = 0;
  
  dates.forEach(date => {
    const data = generatePriceData(stock, date);
    data.forEach(item => {
      if (item.bFreq > maxBFreq) maxBFreq = item.bFreq;
      if (item.bLot > maxBLot) maxBLot = item.bLot;
      if (item.sLot > maxSLot) maxSLot = item.sLot;
      if (item.sFreq > maxSFreq) maxSFreq = item.sFreq;
      if (item.tFreq > maxTFreq) maxTFreq = item.tFreq;
      if (item.tLot > maxTLot) maxTLot = item.tLot;
    });
  });
  
  return { maxBFreq, maxBLot, maxSLot, maxSFreq, maxTFreq, maxTLot };
};

// Helper function to get broker data for specific price, broker and date
const getBrokerDataForPriceBrokerAndDate = (stock: string, date: string, price: number, broker: string): BrokerBreakdownData | null => {
  const data = generateBrokerBreakdownData(stock, date);
  return data.find(item => item.price === price && item.broker === broker) || null;
};

// Helper function to get all unique price-broker combinations that have transactions
const getAllUniquePriceBrokerCombinations = (stock: string, dates: string[]): Array<{price: number, broker: string}> => {
  const combinations = new Map<string, {price: number, broker: string}>();
  
  // First, collect all possible combinations from all dates
  dates.forEach(date => {
    const data = generateBrokerBreakdownData(stock, date);
    data.forEach(item => {
      const key = `${item.price}-${item.broker}`;
      if (!combinations.has(key)) {
        combinations.set(key, { price: item.price, broker: item.broker });
      }
    });
  });
  
  // Filter out combinations that have no transactions across ALL dates
  const validCombinations = Array.from(combinations.values()).filter(combination => {
    // Check if this combination has at least one non-zero transaction across all dates
    let hasAnyTransaction = false;
    
    for (const date of dates) {
      const data = getBrokerDataForPriceBrokerAndDate(stock, date, combination.price, combination.broker);
      if (data && (
        data.bFreq > 0 || data.bLot > 0 || data.sLot > 0 || 
        data.sFreq > 0 || data.tFreq > 0 || data.tLot > 0
      )) {
        hasAnyTransaction = true;
        break; // Found at least one transaction, this combination is valid
      }
    }
    
    return hasAnyTransaction;
  });
  
  // Additional filtering: Remove combinations that only appear in generateBrokerBreakdownData 
  // but have zero values across all dates
  const finalValidCombinations = validCombinations.filter(combination => {
    let totalTransactions = 0;
    
    for (const date of dates) {
      const data = getBrokerDataForPriceBrokerAndDate(stock, date, combination.price, combination.broker);
      if (data) {
        totalTransactions += data.bFreq + data.bLot + data.sLot + data.sFreq + data.tFreq + data.tLot;
      }
    }
    
    return totalTransactions > 0;
  });
  
  // Sort by price ascending, then by broker
  return finalValidCombinations.sort((a, b) => {
    if (a.price !== b.price) return a.price - b.price;
    return a.broker.localeCompare(b.broker);
  });
};

// Helper function to find max values for broker breakdown horizontal layout
const findMaxValuesBrokerHorizontal = (stock: string, dates: string[]) => {
  let maxBFreq = 0, maxBLot = 0, maxSLot = 0, maxSFreq = 0, maxTFreq = 0, maxTLot = 0;
  
  dates.forEach(date => {
    const data = generateBrokerBreakdownData(stock, date);
    data.forEach(item => {
      if (item.bFreq > maxBFreq) maxBFreq = item.bFreq;
      if (item.bLot > maxBLot) maxBLot = item.bLot;
      if (item.sLot > maxSLot) maxSLot = item.sLot;
      if (item.sFreq > maxSFreq) maxSFreq = item.sFreq;
      if (item.tFreq > maxTFreq) maxTFreq = item.tFreq;
      if (item.tLot > maxTLot) maxTLot = item.tLot;
    });
  });
  
  return { maxBFreq, maxBLot, maxSLot, maxSFreq, maxTFreq, maxTLot };
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

export function StockTransactionDoneSummary() {
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
  const [selectedStock, setSelectedStock] = useState('BBRI');
  const [stockInput, setStockInput] = useState('BBRI');
  const [showStockSuggestions, setShowStockSuggestions] = useState(false);
  const [viewMode, setViewMode] = useState<'summary' | 'broker'>('summary');
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
      
      // Check if range is within 7 days
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays > 7) {
        showToast({
          type: 'warning',
          title: 'Rentang Tanggal Terlalu Panjang',
          message: 'Maksimal rentang tanggal adalah 7 hari',
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
      
      // Remove duplicates, sort by date (newest first), and set
      const uniqueDates = Array.from(new Set([...selectedDates, ...dateArray]));
      const sortedDates = uniqueDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
      setSelectedDates(sortedDates);
      // Switch to custom mode when user manually selects dates
      setDateRangeMode('custom');
      setStartDate('');
      setEndDate('');
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

  // Filter stocks based on input
  const filteredStocks = AVAILABLE_STOCKS.filter(stock => 
    stock.toLowerCase().includes(stockInput.toLowerCase())
  );

  const handleStockSelect = (stock: string) => {
    setStockInput(stock);
    setSelectedStock(stock);
    setShowStockSuggestions(false);
  };

  const handleStockInputChange = (value: string) => {
    setStockInput(value.toUpperCase());
    setShowStockSuggestions(true);
    // Auto-select if exact match
    if (AVAILABLE_STOCKS.includes(value.toUpperCase())) {
      setSelectedStock(value.toUpperCase());
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.stock-dropdown-container')) {
        setShowStockSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const renderHorizontalSummaryView = () => {
    const allPrices = getAllUniquePrices(selectedStock, selectedDates);
    const maxValues = findMaxValuesHorizontal(selectedStock, selectedDates);
    
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ChevronDown className="w-5 h-5" />
            Done Summary - {selectedStock}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                {/* Main Header Row - Dates */}
                <tr className="border-b border-border bg-muted">
                  <th rowSpan={2} className="text-left py-2 px-3 font-medium bg-muted sticky left-0 z-30 border-r-2 border-border min-w-[80px]">Price</th>
                  {selectedDates.map((date) => (
                    <th key={date} colSpan={6} className="text-center py-2 px-1 font-medium border-l border-border">
                      {formatDisplayDate(date)}
                    </th>
                  ))}
                </tr>
                {/* Sub Header Row - Metrics */}
                <tr className="border-b border-border bg-accent">
                  {selectedDates.map((date) => (
                    <React.Fragment key={date}>
                      <th className="text-right py-1 px-1 font-medium text-[10px]">BFreq</th>
                      <th className="text-right py-1 px-1 font-medium text-[10px]">BLot</th>
                      <th className="text-right py-1 px-1 font-medium text-[10px]">SLot</th>
                      <th className="text-right py-1 px-1 font-medium text-[10px]">SFreq</th>
                      <th className="text-right py-1 px-1 font-medium text-[10px]">TFreq</th>
                      <th className="text-right py-1 px-1 font-medium text-[10px] border-r-2 border-border">TLot</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allPrices.map((price) => (
                  <tr key={price} className="border-b border-border/50 hover:bg-accent/50">
                    <td className="py-1.5 px-3 font-medium bg-background sticky left-0 z-30 border-r-2 border-border text-foreground min-w-[80px]">
                      {formatNumber(price)}
                    </td>
                    {selectedDates.map((date) => {
                      const data = getDataForPriceAndDate(selectedStock, date, price);
                      return (
                        <React.Fragment key={date}>
                          <td className={`text-right py-1.5 px-1 ${data && data.bFreq === maxValues.maxBFreq && data.bFreq > 0 ? 'font-bold text-blue-600' : 'text-blue-600'}`}>
                            {data ? formatNumber(data.bFreq) : '-'}
                          </td>
                          <td className={`text-right py-1.5 px-1 ${data && data.bLot === maxValues.maxBLot && data.bLot > 0 ? 'font-bold text-green-600' : 'text-green-600'}`}>
                            {data ? formatNumber(data.bLot) : '-'}
                          </td>
                          <td className={`text-right py-1.5 px-1 ${data && data.sLot === maxValues.maxSLot && data.sLot > 0 ? 'font-bold text-red-600' : 'text-red-600'}`}>
                            {data ? formatNumber(data.sLot) : '-'}
                          </td>
                          <td className={`text-right py-1.5 px-1 ${data && data.sFreq === maxValues.maxSFreq && data.sFreq > 0 ? 'font-bold text-orange-600' : 'text-orange-600'}`}>
                            {data ? formatNumber(data.sFreq) : '-'}
                          </td>
                          <td className={`text-right py-1.5 px-1 ${data && data.tFreq === maxValues.maxTFreq && data.tFreq > 0 ? 'font-bold text-purple-600' : 'text-purple-600'}`}>
                            {data ? formatNumber(data.tFreq) : '-'}
                          </td>
                          <td className={`text-right py-1.5 px-1 border-r-2 border-border ${data && data.tLot === maxValues.maxTLot && data.tLot > 0 ? 'font-bold text-indigo-600' : 'text-indigo-600'}`}>
                            {data ? formatNumber(data.tLot) : '-'}
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                ))}
                {/* Total Row */}
                <tr className="border-t-2 border-border bg-accent/30 font-bold">
                  <td className="py-3 px-3 font-bold bg-accent/30 sticky left-0 z-30 border-r-2 border-border text-foreground min-w-[80px]">TOTAL</td>
                  {selectedDates.map((date) => {
                    const dateData = generatePriceData(selectedStock, date);
                    const totals = calculateTotals(dateData);
                    return (
                      <React.Fragment key={date}>
                        <td className="text-right py-3 px-1 font-bold text-blue-600">
                          {formatNumber(totals.bFreq)}
                        </td>
                        <td className="text-right py-3 px-1 font-bold text-green-600">
                          {formatNumber(totals.bLot)}
                        </td>
                        <td className="text-right py-3 px-1 font-bold text-red-600">
                          {formatNumber(totals.sLot)}
                        </td>
                        <td className="text-right py-3 px-1 font-bold text-orange-600">
                          {formatNumber(totals.sFreq)}
                        </td>
                        <td className="text-right py-3 px-1 font-bold text-purple-600">
                          {formatNumber(totals.tFreq)}
                        </td>
                        <td className="text-right py-3 px-1 border-r-2 border-border font-bold text-indigo-600">
                          {formatNumber(totals.tLot)}
                        </td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderVerticalSummaryView = () => {
    return (
      <div className="space-y-6">
        {/* Done Summary Table for Each Date */}
        {selectedDates.map((date) => {
          const priceData = generatePriceData(selectedStock, date);
          const maxValues = findMaxValues(priceData);
          const totals = calculateTotals(priceData);
          
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
                      <tr className="border-b border-border bg-muted/50">
                        <th className="text-left py-2 px-3 font-medium">Price</th>
                        <th className="text-right py-2 px-3 font-medium">BFreq</th>
                        <th className="text-right py-2 px-3 font-medium">BLot</th>
                        <th className="text-right py-2 px-3 font-medium">SLot</th>
                        <th className="text-right py-2 px-3 font-medium">SFreq</th>
                        <th className="text-right py-2 px-3 font-medium">TFreq</th>
                        <th className="text-right py-2 px-3 font-medium">TLot</th>
                      </tr>
                    </thead>
                    <tbody>
                      {priceData.map((row, idx) => (
                        <tr key={idx} className="border-b border-border/50 hover:bg-accent/50">
                          <td className="py-2 px-3 font-medium text-foreground">
                            {formatNumber(row.price)}
                          </td>
                          <td className={`text-right py-2 px-3 ${row.bFreq === maxValues.maxBFreq && row.bFreq > 0 ? 'font-bold text-blue-600' : 'text-blue-600'}`}>
                            {formatNumber(row.bFreq)}
                          </td>
                          <td className={`text-right py-2 px-3 ${row.bLot === maxValues.maxBLot && row.bLot > 0 ? 'font-bold text-green-600' : 'text-green-600'}`}>
                            {formatNumber(row.bLot)}
                          </td>
                          <td className={`text-right py-2 px-3 ${row.sLot === maxValues.maxSLot && row.sLot > 0 ? 'font-bold text-red-600' : 'text-red-600'}`}>
                            {formatNumber(row.sLot)}
                          </td>
                          <td className={`text-right py-2 px-3 ${row.sFreq === maxValues.maxSFreq && row.sFreq > 0 ? 'font-bold text-orange-600' : 'text-orange-600'}`}>
                            {formatNumber(row.sFreq)}
                          </td>
                          <td className={`text-right py-2 px-3 ${row.tFreq === maxValues.maxTFreq && row.tFreq > 0 ? 'font-bold text-purple-600' : 'text-purple-600'}`}>
                            {formatNumber(row.tFreq)}
                          </td>
                          <td className={`text-right py-2 px-3 ${row.tLot === maxValues.maxTLot && row.tLot > 0 ? 'font-bold text-indigo-600' : 'text-indigo-600'}`}>
                            {formatNumber(row.tLot)}
                          </td>
                        </tr>
                      ))}
                      {/* Total Row */}
                      <tr className="border-t-2 border-border bg-accent/30 font-bold">
                        <td className="py-3 px-3 font-bold text-foreground">TOTAL</td>
                        <td className="text-right py-3 px-3 font-bold text-blue-600">
                          {formatNumber(totals.bFreq)}
                        </td>
                        <td className="text-right py-3 px-3 font-bold text-green-600">
                          {formatNumber(totals.bLot)}
                        </td>
                        <td className="text-right py-3 px-3 font-bold text-red-600">
                          {formatNumber(totals.sLot)}
                        </td>
                        <td className="text-right py-3 px-3 font-bold text-orange-600">
                          {formatNumber(totals.sFreq)}
                        </td>
                        <td className="text-right py-3 px-3 font-bold text-purple-600">
                          {formatNumber(totals.tFreq)}
                        </td>
                        <td className="text-right py-3 px-3 font-bold text-indigo-600">
                          {formatNumber(totals.tLot)}
                        </td>
                      </tr>
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

  const renderHorizontalBrokerBreakdownView = () => {
    const priceBrokerCombinations = getAllUniquePriceBrokerCombinations(selectedStock, selectedDates);
    const maxValues = findMaxValuesBrokerHorizontal(selectedStock, selectedDates);
    
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Broker Breakdown - {selectedStock}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                {/* Main Header Row - Dates */}
                <tr className="border-b border-border bg-muted">
                  <th rowSpan={2} className="text-left py-2 px-3 font-medium bg-muted sticky left-0 z-30 border-r-2 border-border min-w-[80px]">Price</th>
                  <th rowSpan={2} className="text-left py-2 px-3 font-medium bg-muted sticky left-[80px] z-30 border-r-2 border-border min-w-[80px]">Broker</th>
                  {selectedDates.map((date) => (
                    <th key={date} colSpan={6} className="text-center py-2 px-1 font-medium border-l border-border">
                      {formatDisplayDate(date)}
                    </th>
                  ))}
                </tr>
                {/* Sub Header Row - Metrics */}
                <tr className="border-b border-border bg-accent">
                  {selectedDates.map((date) => (
                    <React.Fragment key={date}>
                      <th className="text-right py-1 px-1 font-medium text-[10px]">BFreq</th>
                      <th className="text-right py-1 px-1 font-medium text-[10px]">BLot</th>
                      <th className="text-right py-1 px-1 font-medium text-[10px]">SLot</th>
                      <th className="text-right py-1 px-1 font-medium text-[10px]">SFreq</th>
                      <th className="text-right py-1 px-1 font-medium text-[10px]">TFreq</th>
                      <th className="text-right py-1 px-1 font-medium text-[10px] border-r-2 border-border">TLot</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {priceBrokerCombinations.map((combination, idx) => (
                  <tr key={idx} className="border-b border-border/50 hover:bg-accent/50">
                    <td className="py-1.5 px-3 font-medium bg-background sticky left-0 z-30 border-r-2 border-border text-foreground min-w-[80px]">
                      {formatNumber(combination.price)}
                    </td>
                    <td className="py-1.5 px-3 font-medium bg-background sticky left-[80px] z-30 border-r-2 border-border text-foreground min-w-[80px]">
                      {combination.broker}
                    </td>
                    {selectedDates.map((date) => {
                      const data = getBrokerDataForPriceBrokerAndDate(selectedStock, date, combination.price, combination.broker);
                      return (
                        <React.Fragment key={date}>
                          <td className={`text-right py-1.5 px-1 ${data && data.bFreq === maxValues.maxBFreq && data.bFreq > 0 ? 'font-bold text-blue-600' : 'text-blue-600'}`}>
                            {data ? formatNumber(data.bFreq) : '-'}
                          </td>
                          <td className={`text-right py-1.5 px-1 ${data && data.bLot === maxValues.maxBLot && data.bLot > 0 ? 'font-bold text-green-600' : 'text-green-600'}`}>
                            {data ? formatNumber(data.bLot) : '-'}
                          </td>
                          <td className={`text-right py-1.5 px-1 ${data && data.sLot === maxValues.maxSLot && data.sLot > 0 ? 'font-bold text-red-600' : 'text-red-600'}`}>
                            {data ? formatNumber(data.sLot) : '-'}
                          </td>
                          <td className={`text-right py-1.5 px-1 ${data && data.sFreq === maxValues.maxSFreq && data.sFreq > 0 ? 'font-bold text-orange-600' : 'text-orange-600'}`}>
                            {data ? formatNumber(data.sFreq) : '-'}
                          </td>
                          <td className={`text-right py-1.5 px-1 ${data && data.tFreq === maxValues.maxTFreq && data.tFreq > 0 ? 'font-bold text-purple-600' : 'text-purple-600'}`}>
                            {data ? formatNumber(data.tFreq) : '-'}
                          </td>
                          <td className={`text-right py-1.5 px-1 border-r-2 border-border ${data && data.tLot === maxValues.maxTLot && data.tLot > 0 ? 'font-bold text-indigo-600' : 'text-indigo-600'}`}>
                            {data ? formatNumber(data.tLot) : '-'}
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                ))}
                {/* Total Row */}
                <tr className="border-t-2 border-border bg-accent/30 font-bold">
                  <td className="py-3 px-3 font-bold bg-accent/30 sticky left-0 z-30 border-r-2 border-border text-foreground min-w-[80px]">TOTAL</td>
                  <td className="py-3 px-3 font-bold bg-accent/30 sticky left-[80px] z-30 border-r-2 border-border text-foreground min-w-[80px]">ALL</td>
                  {selectedDates.map((date) => {
                    const totals = calculateBrokerBreakdownTotals(selectedStock, date);
                    return (
                      <React.Fragment key={date}>
                        <td className="text-right py-3 px-1 font-bold text-blue-600">
                          {formatNumber(totals.bFreq)}
                        </td>
                        <td className="text-right py-3 px-1 font-bold text-green-600">
                          {formatNumber(totals.bLot)}
                        </td>
                        <td className="text-right py-3 px-1 font-bold text-red-600">
                          {formatNumber(totals.sLot)}
                        </td>
                        <td className="text-right py-3 px-1 font-bold text-orange-600">
                          {formatNumber(totals.sFreq)}
                        </td>
                        <td className="text-right py-3 px-1 font-bold text-purple-600">
                          {formatNumber(totals.tFreq)}
                        </td>
                        <td className="text-right py-3 px-1 border-r-2 border-border font-bold text-indigo-600">
                          {formatNumber(totals.tLot)}
                        </td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderVerticalBrokerBreakdownView = () => {
    return (
      <div className="space-y-6">
        {selectedDates.map((date) => {
          const brokerData = generateBrokerBreakdownData(selectedStock, date);
          const maxValues = {
            maxBFreq: Math.max(...brokerData.map(d => d.bFreq)),
            maxBLot: Math.max(...brokerData.map(d => d.bLot)),
            maxSLot: Math.max(...brokerData.map(d => d.sLot)),
            maxSFreq: Math.max(...brokerData.map(d => d.sFreq)),
            maxTFreq: Math.max(...brokerData.map(d => d.tFreq)),
            maxTLot: Math.max(...brokerData.map(d => d.tLot))
          };
          const totals = calculateBrokerBreakdownTotals(selectedStock, date);
          
          return (
            <Card key={date}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Broker Breakdown - {selectedStock} ({formatDisplayDate(date)})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="text-left py-2 px-3 font-medium">Price</th>
                        <th className="text-left py-2 px-3 font-medium">Broker</th>
                        <th className="text-right py-2 px-3 font-medium">BFreq</th>
                        <th className="text-right py-2 px-3 font-medium">BLot</th>
                        <th className="text-right py-2 px-3 font-medium">SLot</th>
                        <th className="text-right py-2 px-3 font-medium">SFreq</th>
                        <th className="text-right py-2 px-3 font-medium">TFreq</th>
                        <th className="text-right py-2 px-3 font-medium">TLot</th>
                      </tr>
                    </thead>
                    <tbody>
                      {brokerData.map((row, idx) => (
                        <tr key={idx} className="border-b border-border/50 hover:bg-accent/50">
                          <td className="py-2 px-3 font-medium text-foreground">
                            {formatNumber(row.price)}
                          </td>
                          <td className="py-2 px-3 font-medium text-foreground">
                            {row.broker}
                          </td>
                          <td className={`text-right py-2 px-3 ${row.bFreq === maxValues.maxBFreq && row.bFreq > 0 ? 'font-bold text-blue-600' : 'text-blue-600'}`}>
                            {formatNumber(row.bFreq)}
                          </td>
                          <td className={`text-right py-2 px-3 ${row.bLot === maxValues.maxBLot && row.bLot > 0 ? 'font-bold text-green-600' : 'text-green-600'}`}>
                            {formatNumber(row.bLot)}
                          </td>
                          <td className={`text-right py-2 px-3 ${row.sLot === maxValues.maxSLot && row.sLot > 0 ? 'font-bold text-red-600' : 'text-red-600'}`}>
                            {formatNumber(row.sLot)}
                          </td>
                          <td className={`text-right py-2 px-3 ${row.sFreq === maxValues.maxSFreq && row.sFreq > 0 ? 'font-bold text-orange-600' : 'text-orange-600'}`}>
                            {formatNumber(row.sFreq)}
                          </td>
                          <td className={`text-right py-2 px-3 ${row.tFreq === maxValues.maxTFreq && row.tFreq > 0 ? 'font-bold text-purple-600' : 'text-purple-600'}`}>
                            {formatNumber(row.tFreq)}
                          </td>
                          <td className={`text-right py-2 px-3 ${row.tLot === maxValues.maxTLot && row.tLot > 0 ? 'font-bold text-indigo-600' : 'text-indigo-600'}`}>
                            {formatNumber(row.tLot)}
                          </td>
                        </tr>
                      ))}
                      {/* Total Row */}
                      <tr className="border-t-2 border-border bg-accent/30 font-bold">
                        <td className="py-3 px-3 font-bold text-foreground">TOTAL</td>
                        <td className="py-3 px-3 font-bold text-foreground">ALL</td>
                        <td className="text-right py-3 px-3 font-bold text-blue-600">
                          {formatNumber(totals.bFreq)}
                        </td>
                        <td className="text-right py-3 px-3 font-bold text-green-600">
                          {formatNumber(totals.bLot)}
                        </td>
                        <td className="text-right py-3 px-3 font-bold text-red-600">
                          {formatNumber(totals.sLot)}
                        </td>
                        <td className="text-right py-3 px-3 font-bold text-orange-600">
                          {formatNumber(totals.sFreq)}
                        </td>
                        <td className="text-right py-3 px-3 font-bold text-purple-600">
                          {formatNumber(totals.tFreq)}
                        </td>
                        <td className="text-right py-3 px-3 font-bold text-indigo-600">
                          {formatNumber(totals.tLot)}
                        </td>
                      </tr>
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
            {/* Row 1: Stock, Date Range, Quick Select, View, Layout */}
            <div className="flex flex-col lg:flex-row gap-4 items-end">
            {/* Stock Selection */}
              <div className="flex-1">
                <label className="block text-sm font-medium mb-2">Stock:</label>
                <div className="relative stock-dropdown-container">
                  <input
                    type="text"
                    value={stockInput}
                    onChange={(e) => handleStockInputChange(e.target.value)}
                    onFocus={() => setShowStockSuggestions(true)}
                    placeholder="Enter stock code..."
                    className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
                  />
                  {showStockSuggestions && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                      {stockInput === '' ? (
                        <>
                          <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
                            All Stocks
                          </div>
                          {AVAILABLE_STOCKS.map(stock => (
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
                        filteredStocks.map(stock => (
                          <div
                            key={stock}
                            onClick={() => handleStockSelect(stock)}
                            className="px-3 py-2 hover:bg-muted cursor-pointer text-sm"
                          >
                            {stock}
                          </div>
                        ))
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

              {/* View Mode Toggle */}
              <div className="flex-1">
                <label className="block text-sm font-medium mb-2">View:</label>
                <div className="flex gap-1">
                  <Button
                    variant={viewMode === 'summary' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setViewMode('summary')}
                    className="flex-1"
                  >
                    Summary
                  </Button>
                  <Button
                    variant={viewMode === 'broker' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setViewMode('broker')}
                    className="flex-1"
                  >
                    Broker Breakdown
                  </Button>
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
      {viewMode === 'summary' ? (
        layoutMode === 'horizontal' ? renderHorizontalSummaryView() : renderVerticalSummaryView()
      ) : (
        layoutMode === 'horizontal' ? renderHorizontalBrokerBreakdownView() : renderVerticalBrokerBreakdownView()
      )}
    </div>
  );
}