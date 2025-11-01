import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { ChevronDown, TrendingUp, Calendar, Plus, X, Search, RotateCcw } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { api } from '../../services/api';
import { STOCK_LIST, searchStocks } from '../../data/stockList';

interface PriceData {
  price: number;
  bFreq: number;
  bLot: number;
  sLot: number;
  sFreq: number;
  tFreq: number;
  tLot: number;
}

// Backend bid/ask data interface
interface BackendBidAskData {
  StockCode: string;
  Price: number;
  BidVolume: number;
  AskVolume: number;
  NetVolume: number;
  TotalVolume: number;
  BidCount: number;
  AskCount: number;
  TotalCount: number;
  UniqueBidBrokers: number;
  UniqueAskBrokers: number;
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


// Generate realistic price data based on BBRI.csv structure (DEPRECATED - using real data now)
/*
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
*/

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

// Format number with K, M, B abbreviations
const formatNumberWithAbbreviation = (num: number): string => {
  if (num === 0) return '0';
  
  const absNum = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  
  if (absNum >= 1e9) {
    return sign + (absNum / 1e9).toFixed(1) + 'B';
  } else if (absNum >= 1e6) {
    return sign + (absNum / 1e6).toFixed(1) + 'M';
  } else if (absNum >= 1e3) {
    return sign + (absNum / 1e3).toFixed(1) + 'K';
  } else {
    return num.toLocaleString();
  }
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
const getAllUniquePrices = (stock: string, dates: string[], priceDataByDate: { [date: string]: PriceData[] }): number[] => {
  const allPrices = new Set<number>();
  
  // First, collect all possible prices from all dates
  dates.forEach(date => {
    const data = priceDataByDate[date] || [];
    data.forEach(item => allPrices.add(item.price));
  });
  
  // Filter out prices that have no transactions across ALL dates
  const validPrices = Array.from(allPrices).filter(price => {
    // Check if this price has at least one non-zero transaction across all dates
    let hasAnyTransaction = false;
    
    for (const date of dates) {
      const data = getDataForPriceAndDate(stock, date, price, priceDataByDate);
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
      const data = getDataForPriceAndDate(stock, date, price, priceDataByDate);
      if (data) {
        totalTransactions += data.bFreq + data.bLot + data.sLot + data.sFreq + data.tFreq + data.tLot;
      }
    }
    
    return totalTransactions > 0;
  });
  
  return finalValidPrices.sort((a, b) => a - b); // Sort ascending (lowest to highest)
};

// Helper function to get data for specific price and date
const getDataForPriceAndDate = (_stock: string, date: string, price: number, priceDataByDate: { [date: string]: PriceData[] }): PriceData | null => {
  const data = priceDataByDate[date] || [];
  return data.find(item => item.price === price) || null;
};


// Helper function to find max values across all dates for horizontal layout
const findMaxValuesHorizontal = (_stock: string, dates: string[], priceDataByDate: { [date: string]: PriceData[] }) => {
  let maxBFreq = 0, maxBLot = 0, maxSLot = 0, maxSFreq = 0, maxTFreq = 0, maxTLot = 0;
  
  dates.forEach(date => {
    const data = priceDataByDate[date] || [];
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

// Helper function to get broker data for specific price, broker and date (DEPRECATED - moved inside component)
// const getBrokerDataForPriceBrokerAndDate = (stock: string, date: string, price: number, broker: string, brokerDataByDate: { [date: string]: BrokerBreakdownData[] }): BrokerBreakdownData | null => {
//   const data = brokerDataByDate[date] || [];
//   return data.find(item => item.price === price && item.broker === broker) || null;
// };

// Helper function to get-broker data for specific price, broker and date (DEPRECATED)
/*const getBrokerDataForPriceBrokerAndDate = (stock: string, date: string, price: number, broker: string): BrokerBreakdownData | null => {
  // This function is deprecated and will be replaced with in-component function
  return null;
};*/

// Helper function to get all unique price-broker combinations that have transactions (DEPRECATED - not used anymore)
/*const getAllUniquePriceBrokerCombinations = (stock: string, dates: string[]): Array<{price: number, broker: string}> => {
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
      const data = null; // Deprecated function
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
      const data = null; // Deprecated function
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
};*/

// Helper function to find max values for broker breakdown horizontal layout (DEPRECATED)
/*const findMaxValuesBrokerHorizontal = (stock: string, dates: string[]) => {
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
};*/

// Get trading days based on count (excluding today)
const getTradingDays = (count: number): string[] => {
  const dates: string[] = [];
  const today = new Date();
  let currentDate = new Date(today);
  
  // Start from yesterday (exclude today)
  currentDate.setDate(currentDate.getDate() - 1);
  
  while (dates.length < count) {
    const dayOfWeek = currentDate.getDay();
    
    // Skip weekends (Saturday = 6, Sunday = 0)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      const dateStr = currentDate.toISOString().split('T')[0];
      if (dateStr) {
        dates.push(dateStr);
      }
    }
    
    // Go to previous day
    currentDate.setDate(currentDate.getDate() - 1);
    
    // Safety check
    if (dates.length === 0 && currentDate.getTime() < today.getTime() - (30 * 24 * 60 * 60 * 1000)) {
      const yesterdayStr = new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      if (yesterdayStr) {
        dates.push(yesterdayStr);
      }
      break;
    }
  }
  
  return dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
};

// Helper function to get last 3 trading days
const getLastThreeTradingDays = (): string[] => {
  return getTradingDays(3);
};

interface StockTransactionDoneSummaryProps {
  selectedStock?: string;
}

export function StockTransactionDoneSummary({ selectedStock: propSelectedStock }: StockTransactionDoneSummaryProps) {
  const { showToast } = useToast();
  const [selectedDates, setSelectedDates] = useState<string[]>(getLastThreeTradingDays());
  const [selectedStock, setSelectedStock] = useState(propSelectedStock || 'BBRI');
  const [viewMode, setViewMode] = useState<'summary' | 'broker'>('summary');
  
  // Real data states
  const [priceDataByDate, setPriceDataByDate] = useState<{ [date: string]: PriceData[] }>({});
  const [brokerDataByDate, setBrokerDataByDate] = useState<{ [date: string]: BrokerBreakdownData[] }>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableStocks] = useState<string[]>(STOCK_LIST);
  const [_availableDates] = useState<string[]>([]);
  
  // UI states
  const [stockInput, setStockInput] = useState('BBRI');
  const [showStockSuggestions, setShowStockSuggestions] = useState(false);
  const [highlightedStockIndex, setHighlightedStockIndex] = useState<number>(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [startDate, setStartDate] = useState(() => {
    const threeDays = getLastThreeTradingDays();
    if (threeDays.length > 0) {
      const sortedDates = [...threeDays].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      return sortedDates[0];
    }
    return '';
  });
  const [endDate, setEndDate] = useState(() => {
    const threeDays = getLastThreeTradingDays();
    if (threeDays.length > 0) {
      const sortedDates = [...threeDays].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      return sortedDates[sortedDates.length - 1];
    }
    return '';
  });
  const [dateRangeMode, setDateRangeMode] = useState<'1day' | '3days' | '1week' | 'custom'>('3days');

  // Helper functions
  const handleStockSelect = (stock: string) => {
    setSelectedStock(stock);
    setStockInput(stock);
    setShowStockSuggestions(false);
  };

  const handleStockInputChange = (value: string) => {
    setStockInput(value);
    setShowStockSuggestions(true);

    // If exact match, select it
    if (STOCK_LIST.includes(value.toUpperCase())) {
      setSelectedStock(value.toUpperCase());
    }
  };

  const filteredStocks = searchStocks(stockInput);

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
      
      // Check if range is within 7 trading days (excluding weekends)
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays > 14) { // Allow up to 14 calendar days to get 7 trading days
        showToast({
          type: 'warning',
          title: 'Rentang Tanggal Terlalu Panjang',
          message: 'Maksimal rentang tanggal adalah 7 hari trading (tidak termasuk weekend)',
        });
        return;
      }
      
      // Generate date array (excluding weekends)
      const dateArray: string[] = [];
      const currentDate = new Date(start);
      
      while (currentDate <= end) {
        const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 6 = Saturday
        // Skip weekends (Saturday = 6, Sunday = 0)
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        const dateString = currentDate.toISOString().split('T')[0];
          if (dateString) {
        dateArray.push(dateString);
          }
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      // Remove duplicates, sort by date (newest first), and set
      const uniqueDates = Array.from(new Set([...selectedDates, ...dateArray]));
      const sortedDates = uniqueDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

      // Check if total trading dates would exceed 7
      if (sortedDates.length > 7) {
        showToast({
          type: 'warning',
          title: 'Terlalu Banyak Tanggal',
          message: 'Maksimal 7 hari trading yang bisa dipilih (tidak termasuk weekend)',
        });
        return;
      }

      setSelectedDates(sortedDates);
      setDateRangeMode('custom');
    }
  };

  const removeDate = (dateToRemove: string) => {
    if (selectedDates.length > 1) {
      setSelectedDates(selectedDates.filter(date => date !== dateToRemove));
      setDateRangeMode('custom');
    }
  };

  const handleDateRangeModeChange = (mode: '1day' | '3days' | '1week' | 'custom') => {
    setDateRangeMode(mode);
    
    if (mode === 'custom') {
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

  const clearAllDates = () => {
    setSelectedDates(getTradingDays(1));
    setDateRangeMode('1day');
    const oneDay = getTradingDays(1);
    if (oneDay.length > 0) {
      setStartDate(oneDay[0]);
      setEndDate(oneDay[0]);
    }
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


  // Convert backend bid/ask data to frontend format
  const convertBackendToFrontend = (backendData: BackendBidAskData[]): PriceData[] => {
    return backendData.map(item => ({
      price: Number(item.Price),
      bLot: Number(item.BidVolume),      // BLot dari BidVolume
      bFreq: Number(item.BidCount),      // BFreq dari BidCount
      sLot: Number(item.AskVolume),      // SLot dari AskVolume
      sFreq: Number(item.AskCount),       // SFreq dari AskCount
      tLot: Number(item.TotalVolume),    // TLot dari TotalVolume
      tFreq: parseInt(String(item.TotalCount), 10)     // TFreq dari TotalCount - ensure integer
    }));
  };

  // Convert backend broker breakdown data to frontend format
  const convertBackendBrokerToFrontend = (backendData: any[]): BrokerBreakdownData[] => {
    return backendData.map(item => ({
      price: Number(item.Price),
      broker: String(item.Broker),
      bLot: Number(item.BLot) || 0,
      bFreq: Number(item.BFreq) || 0,
      sLot: Number(item.SLot) || 0,
      sFreq: Number(item.SFreq) || 0,
      tLot: Number(item.TLot) || 0,
      tFreq: Number(item.TFreq) || 0
    }));
  };

  // No need to load stocks from API anymore - using static list

  // Update selectedStock when prop changes
  useEffect(() => {
    if (propSelectedStock && propSelectedStock !== selectedStock) {
      setSelectedStock(propSelectedStock);
    }
  }, [propSelectedStock, selectedStock]);

  // Fetch data when selected stock or dates change
  useEffect(() => {
    const fetchData = async () => {
      if (!selectedStock || selectedDates.length === 0) {
        console.log('Skipping fetch - missing stock or dates:', { selectedStock, selectedDates });
        return;
      }

      console.log('Starting to fetch data for:', { selectedStock, selectedDates });
      setLoading(true);
      setError(null);

      try {
        // Fetch bid/ask data for all selected dates
        console.log('Calling API getBidAskBatch...');
        console.log('Selected dates:', selectedDates);
        console.log('Selected stock:', selectedStock);
        console.log('Date format check:', {
          original: selectedDates[0],
          formatted: selectedDates[0]?.replace(/-/g, ''),
          expected: '20251022'
        });
        console.log('API URL would be:', `${(import.meta as any).env?.VITE_API_URL || 'http://localhost:3001'}/api/bidask/stock/${selectedStock}/${selectedDates[0]}`);
        
        // Test individual API call first
        if (selectedDates.length > 0 && selectedDates[0]) {
          console.log('Testing individual API call...');
          try {
            // Convert date format from YYYY-MM-DD to YYYYMMDD
            const formattedDate = selectedDates[0].replace(/-/g, '');
            console.log('Formatted date for API:', formattedDate);
            const testResponse = await api.getBidAskData(selectedStock, formattedDate);
            console.log('Individual API test response:', testResponse);
          } catch (testError) {
            console.error('Individual API test error:', testError);
          }
        }
        
        // Convert dates to YYYYMMDD format for API
        const formattedDates = selectedDates.map(date => date.replace(/-/g, ''));
        console.log('Formatted dates for batch API:', formattedDates);
        
        // Fetch both bid/ask data and broker breakdown data in parallel
        const [response, brokerResponse] = await Promise.all([
          api.getBidAskBatch(selectedStock, formattedDates),
          api.getBrokerBreakdownBatch(selectedStock, formattedDates)
        ]);
        
        // Create a mapping from formatted dates back to original dates
        const dateMapping: { [formatted: string]: string } = {};
        selectedDates.forEach((original, index) => {
          const formatted = formattedDates[index];
          if (formatted) {
            dateMapping[formatted] = original;
          }
        });
        console.log('Date mapping:', dateMapping);
        
        console.log('API Response:', response);
        console.log('Response success:', response.success);
        console.log('Response data:', response.data);
        console.log('Response error:', response.error);
        
        if (response.success && response.data?.dataByDate) {
          console.log('Data by date:', response.data.dataByDate);
          const newPriceDataByDate: { [date: string]: PriceData[] } = {};
          const newBrokerDataByDate: { [date: string]: BrokerBreakdownData[] } = {};
          
          Object.entries(response.data.dataByDate).forEach(([formattedDate, dateData]: [string, any]) => {
            const originalDate = dateMapping[formattedDate] || formattedDate;
            console.log(`Processing formatted date ${formattedDate} -> original date ${originalDate}:`, dateData);
            if (dateData.data && Array.isArray(dateData.data)) {
              console.log(`Raw data for ${originalDate}:`, dateData.data);
              console.log(`Raw data length:`, dateData.data.length);
              console.log(`First raw item:`, dateData.data[0]);
              // Convert backend data to frontend format
              const convertedData = convertBackendToFrontend(dateData.data);
              console.log(`Converted data for ${originalDate}:`, convertedData);
              console.log(`Converted data length:`, convertedData.length);
              console.log(`First converted item:`, convertedData[0]);
              newPriceDataByDate[originalDate] = convertedData;
            } else {
              console.log(`No data for date ${originalDate}:`, dateData);
            }
          });
          
          // Process broker breakdown data if available
          if (brokerResponse.success && brokerResponse.data?.dataByDate) {
            console.log('Broker breakdown data by date:', brokerResponse.data.dataByDate);
            Object.entries(brokerResponse.data.dataByDate).forEach(([formattedDate, dateData]: [string, any]) => {
              const originalDate = dateMapping[formattedDate] || formattedDate;
              console.log(`Processing broker breakdown for ${formattedDate} -> ${originalDate}:`, dateData);
              if (dateData.brokerBreakdownData && Array.isArray(dateData.brokerBreakdownData)) {
                const convertedBrokerData = convertBackendBrokerToFrontend(dateData.brokerBreakdownData);
                console.log(`Converted broker data for ${originalDate}:`, convertedBrokerData);
                newBrokerDataByDate[originalDate] = convertedBrokerData;
              }
            });
          }
          
          console.log('Final priceDataByDate:', newPriceDataByDate);
          console.log('Final brokerDataByDate:', newBrokerDataByDate);
          setPriceDataByDate(newPriceDataByDate);
          setBrokerDataByDate(newBrokerDataByDate);
        } else {
          console.log('No data received or API failed:', response);
          
          // No fallback data - let table be empty if no real data
          console.log('No data available for selected dates');
          setPriceDataByDate({});
          setBrokerDataByDate({});
        }

      } catch (error) {
        console.error('Error fetching data:', error);
        setError('Failed to load data');
        showToast({
          type: 'error',
          title: 'Error',
          message: 'Failed to load data. Please try again.'
        });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedStock, selectedDates, showToast]);


  const formatDisplayDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
  };



  const renderHorizontalSummaryView = () => {
    console.log('Rendering summary view with:', {
      selectedStock,
      selectedDates,
      priceDataByDate,
      priceDataByDateKeys: Object.keys(priceDataByDate)
    });
    
    const allPrices = getAllUniquePrices(selectedStock, selectedDates, priceDataByDate);
    console.log('All prices found:', allPrices);
    
    const maxValues = findMaxValuesHorizontal(selectedStock, selectedDates, priceDataByDate);
    console.log('Max values:', maxValues);
    
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ChevronDown className="w-5 h-5" />
            Done Summary - {selectedStock}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <div className="min-w-full px-4 sm:px-0">
              <table className="w-full text-sm border-collapse min-w-[600px]">
              <thead>
                {/* Main Header Row - Dates */}
                <tr className="border-b border-border bg-muted">
                  <th rowSpan={2} className="text-left py-2 px-3 font-medium bg-muted sticky left-0 z-30 border-r-2 border-border min-w-[80px]">Price</th>
                  {selectedDates.map((date) => (
                    <th key={date} colSpan={6} className="text-center py-2 px-1 font-medium border-l border-border">
                      {formatDisplayDate(date)}
                    </th>
                  ))}
                  <th colSpan={6} className="text-center py-2 px-1 font-medium border-l border-border bg-accent/30">
                    Total
                  </th>
                </tr>
                {/* Sub Header Row - Metrics */}
                <tr className="border-b border-border bg-accent">
                  {selectedDates.map((date) => (
                    <React.Fragment key={date}>
                      <th className="text-right py-1 px-1 font-medium text-[10px]">BLot</th>
                      <th className="text-right py-1 px-1 font-medium text-[10px]">BFreq</th>
                      <th className="text-right py-1 px-1 font-medium text-[10px]">SLot</th>
                      <th className="text-right py-1 px-1 font-medium text-[10px]">SFreq</th>
                      <th className="text-right py-1 px-1 font-medium text-[10px]">TLot</th>
                      <th className="text-right py-1 px-1 font-medium text-[10px] border-r-2 border-border">TFreq</th>
                    </React.Fragment>
                  ))}
                  <th className="text-right py-1 px-1 font-medium text-[10px] bg-accent/30">BLot</th>
                  <th className="text-right py-1 px-1 font-medium text-[10px] bg-accent/30">BFreq</th>
                  <th className="text-right py-1 px-1 font-medium text-[10px] bg-accent/30">SLot</th>
                  <th className="text-right py-1 px-1 font-medium text-[10px] bg-accent/30">SFreq</th>
                  <th className="text-right py-1 px-1 font-medium text-[10px] bg-accent/30">TLot</th>
                  <th className="text-right py-1 px-1 font-medium text-[10px] bg-accent/30 border-r-2 border-border">TFreq</th>
                </tr>
              </thead>
              <tbody>
                {allPrices.map((price) => (
                  <tr key={price} className="border-b border-border/50 hover:bg-accent/50">
                    <td className="py-1.5 px-3 font-medium bg-background sticky left-0 z-30 border-r-2 border-border text-foreground min-w-[80px]">
                      {formatNumber(price)}
                    </td>
                    {selectedDates.map((date) => {
                      const data = getDataForPriceAndDate(selectedStock, date, price, priceDataByDate);
                      console.log(`Data for price ${price} on ${date}:`, data);
                      return (
                        <React.Fragment key={date}>
                          <td className={`text-right py-1.5 px-1 ${data && data.bLot === maxValues.maxBLot && data.bLot > 0 ? 'font-bold text-green-600' : 'text-green-600'}`}>
                            {data ? formatNumberWithAbbreviation(data.bLot) : '-'}
                          </td>
                          <td className={`text-right py-1.5 px-1 ${data && data.bFreq === maxValues.maxBFreq && data.bFreq > 0 ? 'font-bold text-blue-600' : 'text-blue-600'}`}>
                            {data ? formatNumberWithAbbreviation(data.bFreq) : '-'}
                          </td>
                          <td className={`text-right py-1.5 px-1 ${data && data.sLot === maxValues.maxSLot && data.sLot > 0 ? 'font-bold text-red-600' : 'text-red-600'}`}>
                            {data ? formatNumberWithAbbreviation(data.sLot) : '-'}
                          </td>
                          <td className={`text-right py-1.5 px-1 ${data && data.sFreq === maxValues.maxSFreq && data.sFreq > 0 ? 'font-bold text-orange-600' : 'text-orange-600'}`}>
                            {data ? formatNumberWithAbbreviation(data.sFreq) : '-'}
                          </td>
                          <td className={`text-right py-1.5 px-1 ${data && data.tLot === maxValues.maxTLot && data.tLot > 0 ? 'font-bold text-indigo-600' : 'text-indigo-600'}`}>
                            {data ? formatNumberWithAbbreviation(data.tLot) : '-'}
                          </td>
                          <td className={`text-right py-1.5 px-1 border-r-2 border-border ${data && data.tFreq === maxValues.maxTFreq && data.tFreq > 0 ? 'font-bold text-purple-600' : 'text-purple-600'}`}>
                            {data ? formatNumberWithAbbreviation(data.tFreq) : '-'}
                          </td>
                        </React.Fragment>
                      );
                    })}
                    {/* Grand Total Column for each row */}
                    <td className="text-right py-1.5 px-1 text-green-600">
                      {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                        const data = getDataForPriceAndDate(selectedStock, date, price, priceDataByDate);
                        return sum + (data?.bLot || 0);
                      }, 0))}
                    </td>
                    <td className="text-right py-1.5 px-1 text-blue-600">
                      {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                        const data = getDataForPriceAndDate(selectedStock, date, price, priceDataByDate);
                        return sum + (data?.bFreq || 0);
                      }, 0))}
                    </td>
                    <td className="text-right py-1.5 px-1 text-red-600">
                      {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                        const data = getDataForPriceAndDate(selectedStock, date, price, priceDataByDate);
                        return sum + (data?.sLot || 0);
                      }, 0))}
                    </td>
                    <td className="text-right py-1.5 px-1 text-orange-600">
                      {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                        const data = getDataForPriceAndDate(selectedStock, date, price, priceDataByDate);
                        return sum + (data?.sFreq || 0);
                      }, 0))}
                    </td>
                    <td className="text-right py-1.5 px-1 text-indigo-600">
                      {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                        const data = getDataForPriceAndDate(selectedStock, date, price, priceDataByDate);
                        return sum + (data?.tLot || 0);
                      }, 0))}
                    </td>
                    <td className="text-right py-1.5 px-1 text-purple-600 border-r-2 border-border">
                      {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                        const data = getDataForPriceAndDate(selectedStock, date, price, priceDataByDate);
                        return sum + (data?.tFreq || 0);
                      }, 0))}
                    </td>
                  </tr>
                ))}
                {/* Total Row */}
                <tr className="border-t-2 border-border bg-accent/30 font-bold">
                  <td className="py-3 px-3 font-bold bg-accent/30 sticky left-0 z-30 border-r-2 border-border text-foreground min-w-[80px]">TOTAL</td>
                  {selectedDates.map((date) => {
                    const dateData = priceDataByDate[date] || [];
                    const totals = calculateTotals(dateData);
                    return (
                      <React.Fragment key={date}>
                        <td className="text-right py-3 px-1 font-bold text-green-600">
                          {formatNumberWithAbbreviation(totals.bLot)}
                        </td>
                        <td className="text-right py-3 px-1 font-bold text-blue-600">
                          {formatNumberWithAbbreviation(totals.bFreq)}
                        </td>
                        <td className="text-right py-3 px-1 font-bold text-red-600">
                          {formatNumberWithAbbreviation(totals.sLot)}
                        </td>
                        <td className="text-right py-3 px-1 font-bold text-orange-600">
                          {formatNumberWithAbbreviation(totals.sFreq)}
                        </td>
                        <td className="text-right py-3 px-1 font-bold text-indigo-600">
                          {formatNumberWithAbbreviation(totals.tLot)}
                        </td>
                        <td className="text-right py-3 px-1 border-r-2 border-border font-bold text-purple-600">
                          {formatNumberWithAbbreviation(totals.tFreq)}
                        </td>
                      </React.Fragment>
                    );
                  })}
                  {/* Grand Total Column */}
                  <td className="text-right py-3 px-1 font-bold text-green-600 bg-accent/50">
                    {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                      const dateData = priceDataByDate[date] || [];
                      const totals = calculateTotals(dateData);
                      return sum + totals.bLot;
                    }, 0))}
                          </td>
                  <td className="text-right py-3 px-1 font-bold text-blue-600 bg-accent/50">
                    {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                      const dateData = priceDataByDate[date] || [];
                      const totals = calculateTotals(dateData);
                      return sum + totals.bFreq;
                    }, 0))}
                          </td>
                  <td className="text-right py-3 px-1 font-bold text-red-600 bg-accent/50">
                    {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                      const dateData = priceDataByDate[date] || [];
                      const totals = calculateTotals(dateData);
                      return sum + totals.sLot;
                    }, 0))}
                          </td>
                  <td className="text-right py-3 px-1 font-bold text-orange-600 bg-accent/50">
                    {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                      const dateData = priceDataByDate[date] || [];
                      const totals = calculateTotals(dateData);
                      return sum + totals.sFreq;
                    }, 0))}
                          </td>
                  <td className="text-right py-3 px-1 font-bold text-indigo-600 bg-accent/50">
                    {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                      const dateData = priceDataByDate[date] || [];
                      const totals = calculateTotals(dateData);
                      return sum + totals.tLot;
                    }, 0))}
                          </td>
                  <td className="text-right py-3 px-1 font-bold text-purple-600 bg-accent/50 border-r-2 border-border">
                    {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                      const dateData = priceDataByDate[date] || [];
                      const totals = calculateTotals(dateData);
                      return sum + totals.tFreq;
                    }, 0))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
            </div>
                </div>
              </CardContent>
            </Card>
    );
  };


  const renderHorizontalBrokerBreakdownView = () => {
    // Helper function to get all unique price-broker combinations from brokerDataByDate
    const getAllUniqueCombinations = (): Array<{price: number, broker: string}> => {
      const combinations = new Map<string, {price: number, broker: string}>();
      
      selectedDates.forEach(date => {
        const data = brokerDataByDate[date] || [];
        data.forEach(item => {
          const key = `${item.price}-${item.broker}`;
          if (!combinations.has(key)) {
            combinations.set(key, { price: item.price, broker: item.broker });
          }
        });
      });
      
      return Array.from(combinations.values()).sort((a, b) => {
        if (a.price !== b.price) return a.price - b.price;
        return a.broker.localeCompare(b.broker);
      });
    };
    
    const priceBrokerCombinations = getAllUniqueCombinations();
    
    // Calculate max values from brokerDataByDate
    let maxBFreq = 0, maxBLot = 0, maxSLot = 0, maxSFreq = 0, maxTFreq = 0, maxTLot = 0;
    selectedDates.forEach(date => {
      const data = brokerDataByDate[date] || [];
      data.forEach(item => {
        if (item.bFreq > maxBFreq) maxBFreq = item.bFreq;
        if (item.bLot > maxBLot) maxBLot = item.bLot;
        if (item.sLot > maxSLot) maxSLot = item.sLot;
        if (item.sFreq > maxSFreq) maxSFreq = item.sFreq;
        if (item.tFreq > maxTFreq) maxTFreq = item.tFreq;
        if (item.tLot > maxTLot) maxTLot = item.tLot;
      });
    });
    const maxValues = { maxBFreq, maxBLot, maxSLot, maxSFreq, maxTFreq, maxTLot };
    
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Broker Breakdown - {selectedStock}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <div className="min-w-full px-4 sm:px-0">
              <table className="w-full text-sm border-collapse min-w-[600px]">
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
                  <th colSpan={6} className="text-center py-2 px-1 font-medium border-l border-border bg-accent/30">
                    Total
                  </th>
                </tr>
                {/* Sub Header Row - Metrics */}
                <tr className="border-b border-border bg-accent">
                  {selectedDates.map((date) => (
                    <React.Fragment key={date}>
                      <th className="text-right py-1 px-1 font-medium text-[10px]">BLot</th>
                      <th className="text-right py-1 px-1 font-medium text-[10px]">BFreq</th>
                      <th className="text-right py-1 px-1 font-medium text-[10px]">SLot</th>
                      <th className="text-right py-1 px-1 font-medium text-[10px]">SFreq</th>
                      <th className="text-right py-1 px-1 font-medium text-[10px]">TLot</th>
                      <th className="text-right py-1 px-1 font-medium text-[10px] border-r-2 border-border">TFreq</th>
                    </React.Fragment>
                  ))}
                  <th className="text-right py-1 px-1 font-medium text-[10px] bg-accent/30">BLot</th>
                  <th className="text-right py-1 px-1 font-medium text-[10px] bg-accent/30">BFreq</th>
                  <th className="text-right py-1 px-1 font-medium text-[10px] bg-accent/30">SLot</th>
                  <th className="text-right py-1 px-1 font-medium text-[10px] bg-accent/30">SFreq</th>
                  <th className="text-right py-1 px-1 font-medium text-[10px] bg-accent/30">TLot</th>
                  <th className="text-right py-1 px-1 font-medium text-[10px] bg-accent/30 border-r-2 border-border">TFreq</th>
                </tr>
              </thead>
              <tbody>
                {priceBrokerCombinations.map((combination, idx) => {
                  // Calculate totals for this price-broker combination across all dates
                  // Helper function to get broker data for specific price, broker and date
                  const getBrokerData = (date: string): BrokerBreakdownData | null => {
                    const data = brokerDataByDate[date] || [];
                    return data.find(item => item.price === combination.price && item.broker === combination.broker) || null;
                  };
                  
                  const totalBFreq = selectedDates.reduce((sum, date) => {
                    const data = getBrokerData(date);
                    return sum + (data?.bFreq || 0);
                  }, 0);
                  
                  const totalBLot = selectedDates.reduce((sum, date) => {
                    const data = getBrokerData(date);
                    return sum + (data?.bLot || 0);
                  }, 0);
                  
                  const totalSLot = selectedDates.reduce((sum, date) => {
                    const data = getBrokerData(date);
                    return sum + (data?.sLot || 0);
                  }, 0);
                  
                  const totalSFreq = selectedDates.reduce((sum, date) => {
                    const data = getBrokerData(date);
                    return sum + (data?.sFreq || 0);
                  }, 0);
                  
                  const totalTFreq = selectedDates.reduce((sum, date) => {
                    const data = getBrokerData(date);
                    return sum + (data?.tFreq || 0);
                  }, 0);
                  
                  const totalTLot = selectedDates.reduce((sum, date) => {
                    const data = getBrokerData(date);
                    return sum + (data?.tLot || 0);
                  }, 0);
                  
                  return (
                  <tr key={idx} className="border-b border-border/50 hover:bg-accent/50">
                    <td className="py-1.5 px-3 font-medium bg-background sticky left-0 z-30 border-r-2 border-border text-foreground min-w-[80px]">
                      {formatNumber(combination.price)}
                    </td>
                    <td className="py-1.5 px-3 font-medium bg-background sticky left-[80px] z-30 border-r-2 border-border text-foreground min-w-[80px]">
                      {combination.broker}
                    </td>
                    {selectedDates.map((date) => {
                      const data = getBrokerData(date);
                      return (
                        <React.Fragment key={date}>
                          <td className={`text-right py-1.5 px-1 ${data && data.bLot === maxValues.maxBLot && data.bLot > 0 ? 'font-bold text-green-600' : 'text-green-600'}`}>
                            {data ? formatNumber(data.bLot) : '-'}
                          </td>
                            <td className={`text-right py-1.5 px-1 ${data && data.bFreq === maxValues.maxBFreq && data.bFreq > 0 ? 'font-bold text-blue-600' : 'text-blue-600'}`}>
                              {data ? formatNumber(data.bFreq) : '-'}
                          </td>
                          <td className={`text-right py-1.5 px-1 ${data && data.sLot === maxValues.maxSLot && data.sLot > 0 ? 'font-bold text-red-600' : 'text-red-600'}`}>
                            {data ? formatNumber(data.sLot) : '-'}
                          </td>
                          <td className={`text-right py-1.5 px-1 ${data && data.sFreq === maxValues.maxSFreq && data.sFreq > 0 ? 'font-bold text-orange-600' : 'text-orange-600'}`}>
                            {data ? formatNumber(data.sFreq) : '-'}
                          </td>
                          <td className={`text-right py-1.5 px-1 ${data && data.tLot === maxValues.maxTLot && data.tLot > 0 ? 'font-bold text-indigo-600' : 'text-indigo-600'}`}>
                            {data ? formatNumber(data.tLot) : '-'}
                          </td>
                          <td className={`text-right py-1.5 px-1 border-r-2 border-border ${data && data.tFreq === maxValues.maxTFreq && data.tFreq > 0 ? 'font-bold text-purple-600' : 'text-purple-600'}`}>
                            {data ? formatNumber(data.tFreq) : '-'}
                          </td>
                        </React.Fragment>
                      );
                    })}
                      {/* Total Column */}
                      <td className="text-right py-1.5 px-1 font-bold text-green-600 bg-accent/30">
                        {formatNumber(totalBLot)}
                      </td>
                      <td className="text-right py-1.5 px-1 font-bold text-blue-600 bg-accent/30">
                        {formatNumber(totalBFreq)}
                      </td>
                      <td className="text-right py-1.5 px-1 font-bold text-red-600 bg-accent/30">
                        {formatNumber(totalSLot)}
                      </td>
                      <td className="text-right py-1.5 px-1 font-bold text-orange-600 bg-accent/30">
                        {formatNumber(totalSFreq)}
                      </td>
                      <td className="text-right py-1.5 px-1 font-bold text-purple-600 bg-accent/30">
                        {formatNumber(totalTFreq)}
                      </td>
                      <td className="text-right py-1.5 px-1 font-bold text-indigo-600 bg-accent/30 border-r-2 border-border">
                        {formatNumber(totalTLot)}
                      </td>
                  </tr>
                  );
                })}
                {/* Total Row */}
                <tr className="border-t-2 border-border bg-accent/30 font-bold">
                  <td className="py-3 px-3 font-bold bg-accent/30 sticky left-0 z-30 border-r-2 border-border text-foreground min-w-[80px]">TOTAL</td>
                  <td className="py-3 px-3 font-bold bg-accent/30 sticky left-[80px] z-30 border-r-2 border-border text-foreground min-w-[80px]">ALL</td>
                  {selectedDates.map((date) => {
                    // Calculate totals from brokerDataByDate
                    const data = brokerDataByDate[date] || [];
                    const totals = data.reduce((acc, row) => ({
                      bLot: acc.bLot + row.bLot,
                      sLot: acc.sLot + row.sLot,
                      bFreq: acc.bFreq + row.bFreq,
                      sFreq: acc.sFreq + row.sFreq,
                      tFreq: acc.tFreq + row.tFreq,
                      tLot: acc.tLot + row.tLot
                    }), { bLot: 0, sLot: 0, bFreq: 0, sFreq: 0, tFreq: 0, tLot: 0 });
                    return (
                      <React.Fragment key={date}>
                        <td className="text-right py-3 px-1 font-bold text-green-600">
                          {formatNumberWithAbbreviation(totals.bLot)}
                        </td>
                        <td className="text-right py-3 px-1 font-bold text-blue-600">
                          {formatNumberWithAbbreviation(totals.bFreq)}
                        </td>
                        <td className="text-right py-3 px-1 font-bold text-red-600">
                          {formatNumberWithAbbreviation(totals.sLot)}
                        </td>
                        <td className="text-right py-3 px-1 font-bold text-orange-600">
                          {formatNumberWithAbbreviation(totals.sFreq)}
                        </td>
                        <td className="text-right py-3 px-1 font-bold text-indigo-600">
                          {formatNumberWithAbbreviation(totals.tLot)}
                        </td>
                        <td className="text-right py-3 px-1 border-r-2 border-border font-bold text-purple-600">
                          {formatNumberWithAbbreviation(totals.tFreq)}
                        </td>
                      </React.Fragment>
                    );
                  })}
                  {/* Grand Total Column */}
                  <td className="text-right py-3 px-1 font-bold text-green-600 bg-accent/50">
                    {formatNumber(selectedDates.reduce((sum, date) => {
                      const data = brokerDataByDate[date] || [];
                      const totals = data.reduce((acc, row) => ({
                        bLot: acc.bLot + row.bLot,
                        sLot: acc.sLot + row.sLot,
                        bFreq: acc.bFreq + row.bFreq,
                        sFreq: acc.sFreq + row.sFreq,
                        tFreq: acc.tFreq + row.tFreq,
                        tLot: acc.tLot + row.tLot
                      }), { bLot: 0, sLot: 0, bFreq: 0, sFreq: 0, tFreq: 0, tLot: 0 });
                      return sum + totals.bLot;
                    }, 0))}
                          </td>
                  <td className="text-right py-3 px-1 font-bold text-blue-600 bg-accent/50">
                    {formatNumber(selectedDates.reduce((sum, date) => {
                      const totals = calculateBrokerBreakdownTotals(selectedStock, date);
                      return sum + totals.bFreq;
                    }, 0))}
                          </td>
                  <td className="text-right py-3 px-1 font-bold text-red-600 bg-accent/50">
                    {formatNumber(selectedDates.reduce((sum, date) => {
                      const totals = calculateBrokerBreakdownTotals(selectedStock, date);
                      return sum + totals.sLot;
                    }, 0))}
                          </td>
                  <td className="text-right py-3 px-1 font-bold text-orange-600 bg-accent/50">
                    {formatNumber(selectedDates.reduce((sum, date) => {
                      const totals = calculateBrokerBreakdownTotals(selectedStock, date);
                      return sum + totals.sFreq;
                    }, 0))}
                          </td>
                  <td className="text-right py-3 px-1 font-bold text-purple-600 bg-accent/50">
                    {formatNumber(selectedDates.reduce((sum, date) => {
                      const totals = calculateBrokerBreakdownTotals(selectedStock, date);
                      return sum + totals.tFreq;
                    }, 0))}
                          </td>
                  <td className="text-right py-3 px-1 font-bold text-indigo-600 bg-accent/50 border-r-2 border-border">
                    {formatNumber(selectedDates.reduce((sum, date) => {
                      const totals = calculateBrokerBreakdownTotals(selectedStock, date);
                      return sum + totals.tLot;
                    }, 0))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
            </div>
                </div>
              </CardContent>
            </Card>
    );
  };


  return (
    <div className="min-h-screen space-y-4 sm:space-y-6 p-2 sm:p-4 lg:p-6 overflow-x-hidden">
      {/* Top Controls */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2 text-sm sm:text-base font-medium">
              <Calendar className="w-4 h-4 sm:w-5 sm:h-5" />
              Stock Selection & Date Range (Max 7 Days)
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {/* Stock Selection */}
            <div className="flex flex-col gap-2 min-w-0">
              <label className="text-sm font-medium text-foreground">Stock</label>
              <div className="relative min-w-0" ref={dropdownRef}>
                <Search className="absolute left-3 top-1/2 pointer-events-none -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                <input
                  type="text"
                  value={stockInput}
                  onChange={(e) => { handleStockInputChange(e.target.value); setHighlightedStockIndex(0); }}
                  onFocus={() => { setShowStockSuggestions(true); setHighlightedStockIndex(0); }}
                  onKeyDown={(e) => {
                    const suggestions = (stockInput === '' ? availableStocks : filteredStocks).slice(0, 10);
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
                  placeholder="Enter stock code..."
                  className="w-full min-w-0 pl-10 pr-3 py-2 text-sm border border-border rounded-md bg-background text-foreground"
                  role="combobox"
                  aria-expanded={showStockSuggestions}
                  aria-controls="stock-suggestions"
                  aria-autocomplete="list"
                />
                {showStockSuggestions && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                    {stockInput === '' ? (
                      <>
                        <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
                          Available Stocks ({STOCK_LIST.length})
                        </div>
                        {STOCK_LIST.slice(0, 20).map(stock => (
                          <div
                            key={stock}
                            onClick={() => handleStockSelect(stock)}
                            className="px-3 py-2 hover:bg-muted cursor-pointer text-sm"
                          >
                            {stock}
                          </div>
                        ))}
                        {STOCK_LIST.length > 20 && (
                          <div className="px-3 py-2 text-xs text-muted-foreground border-t border-border">
                            ... and {STOCK_LIST.length - 20} more stocks
                          </div>
                        )}
                      </>
                    ) : filteredStocks.length > 0 ? (
                      <>
                        <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
                          {filteredStocks.length} stocks found
                        </div>
                        {filteredStocks.slice(0, 20).map(stock => (
                          <div
                            key={stock}
                            onClick={() => handleStockSelect(stock)}
                            className="px-3 py-2 hover:bg-muted cursor-pointer text-sm"
                          >
                            {stock}
                          </div>
                        ))}
                        {filteredStocks.length > 20 && (
                          <div className="px-3 py-2 text-xs text-muted-foreground border-t border-border">
                            ... and {filteredStocks.length - 20} more results
                          </div>
                        )}
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
            <div className="flex flex-col gap-2 min-w-0">
              <label className="text-sm font-medium text-foreground">Date Range</label>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
                <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:flex-1">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      const selectedDate = new Date(e.target.value);
                      const dayOfWeek = selectedDate.getDay();
                      if (dayOfWeek === 0 || dayOfWeek === 6) {
                        showToast({
                          type: 'warning',
                          title: 'Tanggal Weekend',
                          message: 'Pasar saham tutup pada hari Sabtu dan Minggu. Pilih hari kerja saja.',
                        });
                        return;
                      }
                      setStartDate(e.target.value);
                    }}
                    className="w-full px-3 py-2 text-sm border border-border rounded-md bg-input text-foreground"
                  />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">to</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      const selectedDate = new Date(e.target.value);
                      const dayOfWeek = selectedDate.getDay();
                      if (dayOfWeek === 0 || dayOfWeek === 6) {
                        showToast({
                          type: 'warning',
                          title: 'Tanggal Weekend',
                          message: 'Pasar saham tutup pada hari Sabtu dan Minggu. Pilih hari kerja saja.',
                        });
                        return;
                      }
                      setEndDate(e.target.value);
                    }}
                    className="w-full px-3 py-2 text-sm border border-border rounded-md bg-input text-foreground"
                  />
                </div>
                <Button 
                  onClick={addDateRange} 
                  size="sm" 
                  className="w-full sm:w-auto sm:flex-none sm:h-10 sm:ml-2"
                >
                  <Plus className="w-4 h-4" />
                  <span className="ml-1">Add</span>
                </Button>
              </div>
            </div>

            {/* Quick Select */}
            <div className="flex flex-col gap-2 min-w-0">
              <label className="text-sm font-medium text-foreground">Quick Select</label>
              <div className="flex flex-wrap items-center gap-2">
                <select 
                  className="flex-1 min-w-[160px] px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground"
                  value={dateRangeMode}
                  onChange={(e) => handleDateRangeModeChange(e.target.value as '1day' | '3days' | '1week' | 'custom')}
                >
                  <option value="1day">1 Day</option>
                  <option value="3days">3 Days</option>
                  <option value="1week">1 Week</option>
                  <option value="custom">Custom</option>
                </select>
                {dateRangeMode === 'custom' && (
                  <Button onClick={clearAllDates} variant="outline" size="sm" className="flex-shrink-0 h-10">
                    <RotateCcw className="w-4 h-4 mr-1" />
                    <span className="text-xs">Clear</span>
                  </Button>
                )}
              </div>
            </div>

            {/* View Mode Toggle */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-foreground">View Mode</label>
              <div className="flex items-center gap-1 border border-border rounded-lg p-1">
                <Button
                  variant={viewMode === 'summary' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('summary')}
                  className="h-9 px-3 flex-1 text-xs"
                >
                  Summary
                </Button>
                <Button
                  variant={viewMode === 'broker' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('broker')}
                  className="h-9 px-3 flex-1 text-xs"
                >
                  Broker Breakdown
                </Button>
              </div>
            </div>
          </div>

          {/* Selected Dates */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Selected Dates:</label>
            <div className="flex flex-wrap gap-2">
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

      {/* Loading State */}
      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading bid/ask data...</p>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Error State */}
      {error && (
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <div className="text-center">
              <p className="text-destructive mb-2">Error loading data</p>
              <p className="text-muted-foreground text-sm">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Data Display */}
      {!loading && !error && (
        viewMode === 'summary' ? renderHorizontalSummaryView() : renderHorizontalBrokerBreakdownView()
      )}
    </div>
  );
}
