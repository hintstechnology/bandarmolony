import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Calendar, Plus, X, ChevronDown, RotateCcw, TrendingUp, Search } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { api } from '../../services/api';

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

// Available stocks from the data
const AVAILABLE_STOCKS = [
  'BBRI', 'BBCA', 'BMRI', 'BBNI', 'TLKM', 'ASII', 'UNVR', 'GGRM', 'ICBP', 'INDF', 
  'KLBF', 'ADRO', 'ANTM', 'ITMG', 'PTBA', 'SMGR', 'INTP', 'WIKA', 'WSKT', 'PGAS'
];

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
      const dateStr = currentDate.toISOString().split('T')[0];
      if (dateStr) {
        dates.push(dateStr);
      }
    }
    
    // Go to previous day
    currentDate.setDate(currentDate.getDate() - 1);
    
    // Safety check
    if (dates.length === 0 && currentDate.getTime() < today.getTime() - (30 * 24 * 60 * 60 * 1000)) {
      const todayStr = today.toISOString().split('T')[0];
      if (todayStr) {
        dates.push(todayStr);
      }
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
  const [highlightedStockIndex, setHighlightedStockIndex] = useState<number>(-1);
  
  // Real data states
  const [priceDataByDate, setPriceDataByDate] = useState<{ [date: string]: PriceData[] }>({});
  const [_brokerDataByDate, setBrokerDataByDate] = useState<{ [date: string]: BrokerBreakdownData[] }>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableStocks, setAvailableStocks] = useState<string[]>([]);
  const [_availableDates, setAvailableDates] = useState<string[]>([]);

  // Convert backend bid/ask data to frontend format
  const convertBackendToFrontend = (backendData: BackendBidAskData[]): PriceData[] => {
    return backendData.map(item => ({
      price: item.Price,
      bFreq: item.BidCount,
      bLot: item.BidVolume,
      sLot: item.AskVolume,
      sFreq: item.AskCount,
      tFreq: item.BidCount + item.AskCount,
      tLot: item.BidVolume + item.AskVolume
    }));
  };

  // Load available dates and stocks on component mount
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // Load available dates
        const datesResponse = await api.getBidAskDates();
        if (datesResponse.success && datesResponse.data?.dates) {
          setAvailableDates(datesResponse.data.dates);
          
          // Load available stocks for the first date
          if (datesResponse.data.dates.length > 0) {
            const firstDate = datesResponse.data.dates[0];
            if (firstDate) {
              const stocksResponse = await api.getBidAskStocks(firstDate);
              if (stocksResponse.success && stocksResponse.data?.stocks) {
                setAvailableStocks(stocksResponse.data.stocks);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error loading initial data:', error);
        setAvailableStocks(AVAILABLE_STOCKS);
      }
    };

    loadInitialData();
  }, []);

  // Fetch data when selected stock or dates change
  useEffect(() => {
    const fetchData = async () => {
      if (!selectedStock || selectedDates.length === 0) return;

      setLoading(true);
      setError(null);

      try {
        // Fetch bid/ask data for all selected dates
        const response = await api.getBidAskBatch(selectedStock, selectedDates);
        
        if (response.success && response.data?.dataByDate) {
          const newPriceDataByDate: { [date: string]: PriceData[] } = {};
          const newBrokerDataByDate: { [date: string]: BrokerBreakdownData[] } = {};
          
          Object.entries(response.data.dataByDate).forEach(([date, dateData]: [string, any]) => {
            if (dateData.data && Array.isArray(dateData.data)) {
              // Convert backend data to frontend format
              const convertedData = convertBackendToFrontend(dateData.data);
              newPriceDataByDate[date] = convertedData;
              
              // For broker breakdown, we'll use the same data but group by broker
              // This is a simplified version - in real implementation, you might need separate broker data
              const brokerData: BrokerBreakdownData[] = convertedData.map(item => ({
                broker: 'ALL', // Simplified - in real implementation, you'd have broker-specific data
                price: item.price,
                bLot: item.bLot,
                sLot: item.sLot,
                bFreq: item.bFreq,
                sFreq: item.sFreq,
                tFreq: item.tFreq,
                tLot: item.tLot
              }));
              newBrokerDataByDate[date] = brokerData;
            }
          });
          
          setPriceDataByDate(newPriceDataByDate);
          setBrokerDataByDate(newBrokerDataByDate);
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
        if (dateString) {
          dateArray.push(dateString);
        }
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
  const filteredStocks = (availableStocks.length > 0 ? availableStocks : AVAILABLE_STOCKS).filter(stock => 
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
    const allPrices = getAllUniquePrices(selectedStock, selectedDates, priceDataByDate);
    const maxValues = findMaxValuesHorizontal(selectedStock, selectedDates, priceDataByDate);
    
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
                      const data = getDataForPriceAndDate(selectedStock, date, price, priceDataByDate);
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
                    const dateData = priceDataByDate[date] || [];
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
          const priceData = priceDataByDate[date] || [];
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
    <div className="min-h-screen space-y-4 sm:space-y-6 p-2 sm:p-4 lg:p-6 overflow-x-hidden">
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

      {/* Top Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
            <Calendar className="w-4 h-4 sm:w-5 sm:h-5" />
            Stock Selection & Date Range (Max 7 Days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 sm:space-y-4">
            {/* Row 1: Stock, Date Range, Quick Select, View, Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-center lg:items-end">
            {/* Stock Selection */}
              <div className="flex-1 min-w-0 w-full">
                <label className="block text-sm font-medium mb-2">Stock:</label>
                <div className="relative stock-dropdown-container">
                  <Search className="absolute left-3 top-1/2 pointer-events-none -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                  <input
                    type="text"
                    value={stockInput}
                    onChange={(e) => { handleStockInputChange(e.target.value); setHighlightedStockIndex(0); }}
                    onFocus={() => { setShowStockSuggestions(true); setHighlightedStockIndex(0); }}
                    onKeyDown={(e) => {
                      const suggestions = (stockInput === '' ? AVAILABLE_STOCKS : filteredStocks).slice(0, 10);
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
                    className="w-full pl-10 pr-3 py-2 text-sm border border-border rounded-md bg-background text-foreground"
                    role="combobox"
                    aria-expanded={showStockSuggestions}
                    aria-controls="stock-suggestions"
                    aria-autocomplete="list"
                  />
                  {showStockSuggestions && (
                    (() => {
                      const suggestions = (stockInput === '' ? AVAILABLE_STOCKS : filteredStocks).slice(0, 10);
                      return (
                        <div id="stock-suggestions" role="listbox" className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                          {stockInput === '' && (
                            <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">All Stocks</div>
                          )}
                          {suggestions.map((stock, idx) => (
                            <div
                              key={stock}
                              role="option"
                              aria-selected={idx === highlightedStockIndex}
                              onMouseEnter={() => setHighlightedStockIndex(idx)}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleStockSelect(stock)}
                              className={`px-3 py-2 cursor-pointer text-sm ${idx === highlightedStockIndex ? 'bg-accent' : 'hover:bg-muted'}`}
                            >
                              {stock}
                            </div>
                          ))}
                          {suggestions.length === 0 && (
                            <div className="px-3 py-2 text-sm text-muted-foreground">No stocks found</div>
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
                    className="w-full px-3 py-2 text-sm border border-border rounded-md bg-input text-foreground"
                  />
                  <span className="text-sm text-muted-foreground text-center whitespace-nowrap px-2">to</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-md bg-input text-foreground"
                  />
                  <Button onClick={addDateRange} size="sm" className="w-auto justify-self-center">
                    <Plus className="w-4 h-4" />
                    <span className="ml-1">Add</span>
                  </Button>
                </div>
              </div>

              {/* Quick Select */}
              <div className="flex-1 min-w-0 w-full">
                <label className="block text-sm font-medium mb-2">Quick Select:</label>
                <div className="flex flex-col sm:flex-row gap-2">
                <select 
                    className="w-full xl:flex-1 px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground"
                    value={dateRangeMode}
                    onChange={(e) => handleDateRangeModeChange(e.target.value as '1day' | '3days' | '1week' | 'custom')}
                  >
                    <option value="1day">1 Day</option>
                    <option value="3days">3 Days</option>
                    <option value="1week">1 Week</option>
                    <option value="custom">Custom</option>
                </select>
                  {dateRangeMode === 'custom' && (
                    <Button onClick={clearAllDates} variant="outline" size="sm" className="w-auto justify-self-center">
                      <RotateCcw className="w-4 h-4 mr-1" />
                      <span className="text-xs sm:text-sm">Clear</span>
                    </Button>
                  )}
                </div>
              </div>

              {/* View Mode Toggle */}
              <div className="flex-1 min-w-0 w-full lg:w-auto lg:flex-none">
                <label className="block text-sm font-medium mb-2">View:</label>
                <div className="flex sm:inline-flex items-center gap-1 border border-border rounded-lg p-1 overflow-x-auto w-full sm:w-auto lg:w-auto justify-center sm:justify-start">
                  <div className="grid grid-cols-2 gap-1 w-full max-w-xs mx-auto sm:flex sm:items-center sm:gap-1 sm:max-w-none sm:mx-0">
                    <Button
                      variant={viewMode === 'summary' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setViewMode('summary')}
                      className="px-3 py-1 h-8 text-xs"
                    >
                      Summary
                    </Button>
                    <Button
                      variant={viewMode === 'broker' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setViewMode('broker')}
                      className="px-3 py-1 h-8 text-xs"
                    >
                      Broker Breakdown
                    </Button>
                  </div>
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
      {!loading && !error && (
        viewMode === 'summary' ? (
          layoutMode === 'horizontal' ? renderHorizontalSummaryView() : renderVerticalSummaryView()
        ) : (
          layoutMode === 'horizontal' ? renderHorizontalBrokerBreakdownView() : renderVerticalBrokerBreakdownView()
        )
      )}
    </div>
  );
}
