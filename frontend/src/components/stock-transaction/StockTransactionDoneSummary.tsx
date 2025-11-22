import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { ChevronDown, TrendingUp, Calendar, Search, Loader2 } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { api } from '../../services/api';
import { STOCK_LIST, searchStocks } from '../../data/stockList';

interface PriceData {
  price: number;
  bFreq: number;
  bLot: number;
  bOrd: number;
  sLot: number;
  sFreq: number;
  sOrd: number;
  tFreq: number;
  tLot: number;
  tOrd: number;
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
  bFreq: number;
  bLot: number;
  bLotPerFreq: number; // BLot/Freq
  bOrd: number;
  bLotPerOrd: number; // BLot/Ord
  sLot: number;
  sFreq: number;
  sLotPerFreq: number; // SLot/Freq
  sOrd: number;
  sLotPerOrd: number; // SLot/Ord
  tFreq: number;
  tLot: number;
  tOrd: number;
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

// Generate broker breakdown data (DEPRECATED - using real data from API now)
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
          const bOrd = (priceSeed * 111) % 500;
          const sOrd = (priceSeed * 222) % 500;
          
          data.push({
            broker,
            price,
            bFreq,
            bLot,
            bLotPerFreq: bFreq > 0 ? bLot / bFreq : 0,
            bOrd,
            bLotPerOrd: bOrd > 0 ? bLot / bOrd : 0,
            sLot,
            sFreq,
            sLotPerFreq: sFreq > 0 ? sLot / sFreq : 0,
            sOrd,
            sLotPerOrd: sOrd > 0 ? sLot / sOrd : 0,
            tFreq: bFreq + sFreq,
            tLot: bLot + sLot,
            tOrd: bOrd + sOrd
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

// Format ratio (for BLot/Freq, SLot/Freq, etc.)
const formatRatio = (numerator: number, denominator: number): string => {
  if (denominator === 0 || !denominator) return '-';
  const ratio = numerator / denominator;
  if (ratio >= 1e6) {
    return (ratio / 1e6).toFixed(2) + 'M';
  } else if (ratio >= 1e3) {
    return (ratio / 1e3).toFixed(2) + 'K';
  } else {
    return ratio.toFixed(2);
  }
};


// Helper function to calculate totals
const calculateTotals = (data: PriceData[]) => {
  return data.reduce((totals, row) => ({
    bFreq: totals.bFreq + row.bFreq,
    bLot: totals.bLot + row.bLot,
    bOrd: totals.bOrd + row.bOrd,
    sLot: totals.sLot + row.sLot,
    sFreq: totals.sFreq + row.sFreq,
    sOrd: totals.sOrd + row.sOrd,
    tFreq: totals.tFreq + row.tFreq,
    tLot: totals.tLot + row.tLot,
    tOrd: totals.tOrd + row.tOrd
  }), { bFreq: 0, bLot: 0, bOrd: 0, sLot: 0, sFreq: 0, sOrd: 0, tFreq: 0, tLot: 0, tOrd: 0 });
};

// Helper function to calculate broker breakdown totals for a specific date (DEPRECATED - using real data now)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const calculateBrokerBreakdownTotals = (_stock: string, _date: string) => {
  const data = generateBrokerBreakdownData(_stock, _date);
  return data.reduce((totals, row) => ({
    bFreq: totals.bFreq + row.bFreq,
    bLot: totals.bLot + row.bLot,
    bOrd: totals.bOrd + (row.bOrd || 0),
    sLot: totals.sLot + row.sLot,
    sFreq: totals.sFreq + row.sFreq,
    sOrd: totals.sOrd + (row.sOrd || 0),
    tFreq: totals.tFreq + row.tFreq,
    tLot: totals.tLot + row.tLot,
    tOrd: totals.tOrd + (row.tOrd || 0)
  }), { bFreq: 0, bLot: 0, bOrd: 0, sLot: 0, sFreq: 0, sOrd: 0, tFreq: 0, tLot: 0, tOrd: 0 });
};

// Helper function to get all unique prices across all dates (no sorting, preserve CSV order)
// Returns prices in the order they appear in CSV (first date's order)
const getAllUniquePrices = (_stock: string, dates: string[], priceDataByDate: { [date: string]: PriceData[] }): number[] => {
  const priceSet = new Set<number>();
  const priceOrder: number[] = []; // Preserve order from CSV
  
  // Collect prices from all dates, preserving order from first date
  dates.forEach(date => {
    const data = priceDataByDate[date] || [];
    data.forEach(item => {
      if (item.price && !priceSet.has(item.price)) {
        priceSet.add(item.price);
        priceOrder.push(item.price);
      }
    });
  });
  
  return priceOrder; // Return in CSV order, no sorting
};

// Helper function to get data for specific price and date
const getDataForPriceAndDate = (_stock: string, date: string, price: number, priceDataByDate: { [date: string]: PriceData[] }): PriceData | null => {
  const data = priceDataByDate[date] || [];
  return data.find(item => item.price === price) || null;
};


// Helper function to find max values across all dates for horizontal layout
const findMaxValuesHorizontal = (_stock: string, dates: string[], priceDataByDate: { [date: string]: PriceData[] }) => {
  let maxBFreq = 0, maxBLot = 0, maxBOrd = 0, maxSLot = 0, maxSFreq = 0, maxSOrd = 0, maxTFreq = 0, maxTLot = 0, maxTOrd = 0;
  
  dates.forEach(date => {
    const data = priceDataByDate[date] || [];
    data.forEach(item => {
      if (item.bFreq > maxBFreq) maxBFreq = item.bFreq;
      if (item.bLot > maxBLot) maxBLot = item.bLot;
      if (item.bOrd > maxBOrd) maxBOrd = item.bOrd;
      if (item.sLot > maxSLot) maxSLot = item.sLot;
      if (item.sFreq > maxSFreq) maxSFreq = item.sFreq;
      if (item.sOrd > maxSOrd) maxSOrd = item.sOrd;
      if (item.tFreq > maxTFreq) maxTFreq = item.tFreq;
      if (item.tLot > maxTLot) maxTLot = item.tLot;
      if (item.tOrd > maxTOrd) maxTOrd = item.tOrd;
    });
  });
  
  return { maxBFreq, maxBLot, maxBOrd, maxSLot, maxSFreq, maxSOrd, maxTFreq, maxTLot, maxTOrd };
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
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [selectedStock, setSelectedStock] = useState(propSelectedStock || 'BBCA');
  const [viewMode] = useState<'summary' | 'broker'>('summary'); // Always summary, no toggle
  
  // Real data states
  const [priceDataByDate, setPriceDataByDate] = useState<{ [date: string]: PriceData[] }>({});
  const [brokerDataByDate, setBrokerDataByDate] = useState<{ [date: string]: BrokerBreakdownData[] }>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableStocks] = useState<string[]>(STOCK_LIST);
  const [_availableDates] = useState<string[]>([]);
  const [shouldFetchData, setShouldFetchData] = useState<boolean>(false);
  const [isDataReady, setIsDataReady] = useState<boolean>(false);
  
  // UI states
  const [stockInput, setStockInput] = useState(propSelectedStock || 'BBCA');
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
  // Broker selection states
  const [brokerInput, setBrokerInput] = useState('');
  const [selectedBrokers, setSelectedBrokers] = useState<string[]>([]);
  const [showBrokerSuggestions, setShowBrokerSuggestions] = useState(false);
  const [highlightedBrokerIndex, setHighlightedBrokerIndex] = useState<number>(-1);
  const [availableBrokers, setAvailableBrokers] = useState<string[]>([]);
  const dropdownBrokerRef = useRef<HTMLDivElement>(null);
  
  // Filter states - Default: F/D=All, Board=RG
  const [invFilter, setInvFilter] = useState<'F' | 'D' | ''>(''); // Default: All (empty = all)
  const [boardFilter, setBoardFilter] = useState<'RG' | 'TN' | 'NG' | ''>('RG'); // Default: RG
  const [showOrdColumns, setShowOrdColumns] = useState<boolean>(true); // Show/hide Ord columns
  
  // Menu container ref for responsive layout
  const menuContainerRef = useRef<HTMLDivElement>(null);
  const [isMenuTwoRows, setIsMenuTwoRows] = useState<boolean>(false);

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
  
  // Handle broker selection
  const handleBrokerSelect = (broker: string) => {
    if (!selectedBrokers.includes(broker)) {
      setSelectedBrokers([...selectedBrokers, broker]);
    }
    setBrokerInput('');
    setShowBrokerSuggestions(false);
  };

  const handleRemoveBroker = (broker: string) => {
    setSelectedBrokers(selectedBrokers.filter(b => b !== broker));
  };
  
  // Load available brokers on mount
  useEffect(() => {
    const loadBrokers = async () => {
      try {
        const response = await api.getBrokerList();
        if (response.success && response.data?.brokers) {
          setAvailableBrokers(response.data.brokers.sort());
        }
      } catch (error) {
        console.error('Error loading brokers:', error);
      }
    };
    loadBrokers();
  }, []);
  
  // Monitor menu height to detect if it wraps to 2 rows
  useEffect(() => {
    const checkMenuHeight = () => {
      if (menuContainerRef.current) {
        const menuHeight = menuContainerRef.current.offsetHeight;
        setIsMenuTwoRows(menuHeight > 50);
      }
    };

    checkMenuHeight();
    window.addEventListener('resize', checkMenuHeight);
    
    let resizeObserver: ResizeObserver | null = null;
    if (menuContainerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        checkMenuHeight();
      });
      resizeObserver.observe(menuContainerRef.current);
    }

    return () => {
      window.removeEventListener('resize', checkMenuHeight);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [selectedBrokers, selectedStock, startDate, endDate]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const removeDate = (dateToRemove: string) => {
    if (selectedDates.length > 1) {
      setSelectedDates(selectedDates.filter(date => date !== dateToRemove));
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleDateRangeModeChange = (mode: '1day' | '3days' | '1week' | 'custom') => {
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const clearAllDates = () => {
    setSelectedDates(getTradingDays(1));
    const oneDay = getTradingDays(1);
    if (oneDay.length > 0) {
      setStartDate(oneDay[0]);
      setEndDate(oneDay[0]);
    }
  };

  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowStockSuggestions(false);
      }
      if (dropdownBrokerRef.current && !dropdownBrokerRef.current.contains(event.target as Node)) {
        setShowBrokerSuggestions(false);
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
      bFreq: Number(item.BidCount),      // BFreq dari BidCount
      bLot: Number(item.BidVolume),      // BLot dari BidVolume
      bOrd: Number(item.UniqueBidBrokers) || 0,  // BOrd dari UniqueBidBrokers
      sLot: Number(item.AskVolume),      // SLot dari AskVolume
      sFreq: Number(item.AskCount),       // SFreq dari AskCount
      sOrd: Number(item.UniqueAskBrokers) || 0,  // SOrd dari UniqueAskBrokers
      tFreq: parseInt(String(item.TotalCount), 10),     // TFreq dari TotalCount - ensure integer
      tLot: Number(item.TotalVolume),    // TLot dari TotalVolume
      tOrd: (Number(item.UniqueBidBrokers) || 0) + (Number(item.UniqueAskBrokers) || 0)  // TOrd = BOrd + SOrd
    }));
  };

  // Convert backend broker breakdown data to frontend format
  // CSV format: Price,BFreq,BLot,BLot/Freq,BOrd,BLot/Ord,SLot,SFreq,SLot/Freq,SOrd,SLot/Ord,TFreq,TLot,TOrd
  const convertBackendBrokerToFrontend = (backendData: any[]): BrokerBreakdownData[] => {
    return backendData.map(item => ({
      price: Number(item.Price) || 0,
      broker: String(item.Broker || ''),
      bFreq: Number(item.BFreq) || 0,
      bLot: Number(item.BLot) || 0,
      bLotPerFreq: Number(item['BLot/Freq'] || item.BLotPerFreq) || 0,
      bOrd: Number(item.BOrd) || 0,
      bLotPerOrd: Number(item['BLot/Ord'] || item.BLotPerOrd) || 0,
      sLot: Number(item.SLot) || 0,
      sFreq: Number(item.SFreq) || 0,
      sLotPerFreq: Number(item['SLot/Freq'] || item.SLotPerFreq) || 0,
      sOrd: Number(item.SOrd) || 0,
      sLotPerOrd: Number(item['SLot/Ord'] || item.SLotPerOrd) || 0,
      tFreq: Number(item.TFreq) || 0,
      tLot: Number(item.TLot) || 0,
      tOrd: Number(item.TOrd) || 0
    }));
  };

  // No need to load stocks from API anymore - using static list

  // Update selectedStock when prop changes
  useEffect(() => {
    if (propSelectedStock && propSelectedStock !== selectedStock) {
      setSelectedStock(propSelectedStock);
    }
  }, [propSelectedStock, selectedStock]);

  // Fetch data when shouldFetchData is true
  useEffect(() => {
    const fetchData = async () => {
      if (!shouldFetchData) {
        return;
      }
      
      if (!selectedStock || selectedDates.length === 0) {
        console.log('Skipping fetch - missing stock or dates:', { selectedStock, selectedDates });
        setShouldFetchData(false);
        return;
      }

      console.log('Starting to fetch data for:', { selectedStock, selectedDates, selectedBrokers, invFilter, boardFilter });
      setLoading(true);
      setError(null);
      setIsDataReady(false);

      try {
        // Determine broker parameter: if empty, use 'All', otherwise use first selected broker
        const brokerParam = selectedBrokers.length === 0 ? 'All' : selectedBrokers[0];
        // Determine fd parameter: if empty, use 'all', otherwise use lowercase
        const fdParam = invFilter === '' ? 'all' : invFilter.toLowerCase();
        // Determine board parameter: if empty (All Trade), use 'all', otherwise use lowercase
        const boardParam = boardFilter === '' ? 'all' : boardFilter.toLowerCase();
        
        console.log('API parameters:', { brokerParam, fdParam, boardParam });
        
        // Fetch broker breakdown data for all selected dates
        const promises = selectedDates.map(date => 
          api.getDoneSummaryBrokerBreakdown(selectedStock, date, brokerParam, fdParam, boardParam)
        );
        
        const results = await Promise.allSettled(promises);
        
        const newPriceDataByDate: { [date: string]: PriceData[] } = {};
        const newBrokerDataByDate: { [date: string]: BrokerBreakdownData[] } = {};
        
        results.forEach((result, index) => {
          const date = selectedDates[index];
          if (!date) return;
          
          if (result.status === 'fulfilled' && result.value.success && result.value.data?.records) {
            const records = result.value.data.records;
            
            // Convert CSV records to PriceData format (for summary view)
            // CSV columns: Price, BFreq, BLot, BLot/Freq, BOrd, BLot/Ord, SLot, SFreq, SLot/Freq, SOrd, SLot/Ord, TFreq, TLot, TOrd
            // Preserve order from CSV (no filtering, no sorting)
            const priceData: PriceData[] = records.map((row: any) => ({
              price: Number(row.Price) || 0,
              bFreq: Number(row.BFreq) || 0,
              bLot: Number(row.BLot) || 0,
              bOrd: Number(row.BOrd) || 0,
              sLot: Number(row.SLot) || 0,
              sFreq: Number(row.SFreq) || 0,
              sOrd: Number(row.SOrd) || 0,
              tFreq: Number(row.TFreq) || 0,
              tLot: Number(row.TLot) || 0,
              tOrd: Number(row.TOrd) || 0
            }));
            
            // Convert to BrokerBreakdownData format (for broker breakdown view)
            // Preserve order from CSV (no filtering, no sorting)
            const brokerData: BrokerBreakdownData[] = records.map((row: any) => ({
              broker: brokerParam,
              price: Number(row.Price) || 0,
              bFreq: Number(row.BFreq) || 0,
              bLot: Number(row.BLot) || 0,
              bLotPerFreq: Number(row['BLot/Freq']) || 0,
              bOrd: Number(row.BOrd) || 0,
              bLotPerOrd: Number(row['BLot/Ord']) || 0,
              sLot: Number(row.SLot) || 0,
              sFreq: Number(row.SFreq) || 0,
              sLotPerFreq: Number(row['SLot/Freq']) || 0,
              sOrd: Number(row.SOrd) || 0,
              sLotPerOrd: Number(row['SLot/Ord']) || 0,
              tFreq: Number(row.TFreq) || 0,
              tLot: Number(row.TLot) || 0,
              tOrd: Number(row.TOrd) || 0
            }));
            
            newPriceDataByDate[date] = priceData;
            newBrokerDataByDate[date] = brokerData;
          } else {
            // No data for this date
            newPriceDataByDate[date] = [];
            newBrokerDataByDate[date] = [];
          }
        });
        
        setPriceDataByDate(newPriceDataByDate);
        setBrokerDataByDate(newBrokerDataByDate);
        setIsDataReady(true);

      } catch (error) {
        console.error('Error fetching data:', error);
        setError('Failed to load data');
        setIsDataReady(false);
        showToast({
          type: 'error',
          title: 'Error',
          message: 'Failed to load data. Please try again.'
        });
      } finally {
        setLoading(false);
        setShouldFetchData(false);
      }
    };

    fetchData();
  }, [shouldFetchData, selectedStock, selectedDates, selectedBrokers, invFilter, boardFilter, showToast]);


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
              <table className="w-full text-[13px] border-collapse" style={{ tableLayout: 'auto', width: 'auto' }}>
              <thead>
                {/* Main Header Row - Dates */}
                <tr className="border-t-2 border-white bg-[#3a4252]">
                  {selectedDates.map((date, dateIndex) => (
                    <th key={date} colSpan={14} className={`text-center py-[1px] px-[8.24px] font-bold text-white whitespace-nowrap ${dateIndex === 0 ? 'border-l-2 border-white' : ''} ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`}>
                      {formatDisplayDate(date)}
                    </th>
                  ))}
                  <th colSpan={14} className={`text-center py-[1px] px-[4.2px] font-bold text-white border-r-2 border-white ${selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`}>
                    Total
                  </th>
                </tr>
                {/* Sub Header Row - Metrics */}
                <tr className="bg-[#3a4252]">
                  {selectedDates.map((date, dateIndex) => (
                    <React.Fragment key={date}>
                      <th className={`text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`}>Price</th>
                      <th className="text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap">BFreq</th>
                      <th className="text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap">BLot</th>
                      <th className="text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap">BLot/Freq</th>
                      <th className="text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap">BOrd</th>
                      <th className="text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap">BLot/Ord</th>
                      <th className="text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap">SLot</th>
                      <th className="text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap">SFreq</th>
                      <th className="text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap">SLot/Freq</th>
                      <th className="text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap">SOrd</th>
                      <th className="text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap">SLot/Ord</th>
                      <th className="text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap">TFreq</th>
                      <th className="text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap">TLot</th>
                      <th className={`text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`}>TOrd</th>
                    </React.Fragment>
                  ))}
                  <th className={`text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap ${selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`}>Price</th>
                  <th className="text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap">BFreq</th>
                  <th className="text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap">BLot</th>
                  <th className="text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap">BLot/Freq</th>
                  <th className="text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap">BOrd</th>
                  <th className="text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap">BLot/Ord</th>
                  <th className="text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap">SLot</th>
                  <th className="text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap">SFreq</th>
                  <th className="text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap">SLot/Freq</th>
                  <th className="text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap">SOrd</th>
                  <th className="text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap">SLot/Ord</th>
                  <th className="text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap">TFreq</th>
                  <th className="text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap">TLot</th>
                  <th className="text-center py-[1px] px-[7px] font-bold text-white whitespace-nowrap border-r-2 border-white">TOrd</th>
                </tr>
              </thead>
              <tbody>
                {allPrices.map((price) => {
                  return (
                  <tr key={price} className="hover:bg-accent/50">
                    {selectedDates.map((date, dateIndex) => {
                      // Get data for this specific date and price (only if exists in CSV for this date)
                      const dateData = priceDataByDate[date] || [];
                      const data = dateData.find(item => item.price === price) || null;
                      
                      // If no data for this price in this date, show empty cells
                      if (!data) {
                        return (
                          <React.Fragment key={date}>
                            <td className={`text-center py-[1px] px-[6px] font-bold text-white ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                              -
                            </td>
                            <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>-</td>
                            <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>-</td>
                            <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>-</td>
                            <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>-</td>
                            <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>-</td>
                            <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>-</td>
                            <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>-</td>
                            <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>-</td>
                            <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>-</td>
                            <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>-</td>
                            <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>-</td>
                            <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>-</td>
                            <td className={`text-right py-[1px] px-[6px] font-bold text-white ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>-</td>
                          </React.Fragment>
                        );
                      }
                      
                      return (
                        <React.Fragment key={date}>
                          {/* Price */}
                          <td className={`text-center py-[1px] px-[6px] font-bold text-white ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {formatNumber(price)}
                          </td>
                          {/* BFreq */}
                          <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {data ? formatNumberWithAbbreviation(data.bFreq) : '-'}
                          </td>
                          {/* BLot */}
                          <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {data ? formatNumberWithAbbreviation(data.bLot) : '-'}
                          </td>
                          {/* BLot/Freq */}
                          <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {data ? formatRatio(data.bLot, data.bFreq) : '-'}
                          </td>
                          {/* BOrd */}
                          <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {data ? formatNumberWithAbbreviation(data.bOrd) : '-'}
                          </td>
                          {/* BLot/Ord */}
                          <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {data ? formatRatio(data.bLot, data.bOrd) : '-'}
                          </td>
                          {/* SLot */}
                          <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {data ? formatNumberWithAbbreviation(data.sLot) : '-'}
                          </td>
                          {/* SFreq */}
                          <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {data ? formatNumberWithAbbreviation(data.sFreq) : '-'}
                          </td>
                          {/* SLot/Freq */}
                          <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {data ? formatRatio(data.sLot, data.sFreq) : '-'}
                          </td>
                          {/* SOrd */}
                          <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {data ? formatNumberWithAbbreviation(data.sOrd) : '-'}
                          </td>
                          {/* SLot/Ord */}
                          <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {data ? formatRatio(data.sLot, data.sOrd) : '-'}
                          </td>
                          {/* TFreq */}
                          <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {data ? formatNumberWithAbbreviation(data.tFreq) : '-'}
                          </td>
                          {/* TLot */}
                          <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {data ? formatNumberWithAbbreviation(data.tLot) : '-'}
                          </td>
                          {/* TOrd */}
                          <td className={`text-right py-[1px] px-[6px] font-bold text-white ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {data ? formatNumberWithAbbreviation(data.tOrd) : '-'}
                          </td>
                        </React.Fragment>
                      );
                    })}
                    {/* Grand Total Column for each row */}
                    <td className={`text-center py-[1px] px-[5px] font-bold text-white ${selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatNumber(price)}
                    </td>
                    <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                        const data = getDataForPriceAndDate(selectedStock, date, price, priceDataByDate);
                        return sum + (data?.bFreq || 0);
                      }, 0))}
                    </td>
                    <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                        const data = getDataForPriceAndDate(selectedStock, date, price, priceDataByDate);
                        return sum + (data?.bLot || 0);
                      }, 0))}
                    </td>
                    <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatRatio(
                        selectedDates.reduce((sum, date) => {
                          const data = getDataForPriceAndDate(selectedStock, date, price, priceDataByDate);
                          return sum + (data?.bLot || 0);
                        }, 0),
                        selectedDates.reduce((sum, date) => {
                        const data = getDataForPriceAndDate(selectedStock, date, price, priceDataByDate);
                        return sum + (data?.bFreq || 0);
                        }, 0)
                      )}
                    </td>
                    <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                        const data = getDataForPriceAndDate(selectedStock, date, price, priceDataByDate);
                        return sum + (data?.bOrd || 0);
                      }, 0))}
                    </td>
                    <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatRatio(
                        selectedDates.reduce((sum, date) => {
                          const data = getDataForPriceAndDate(selectedStock, date, price, priceDataByDate);
                          return sum + (data?.bLot || 0);
                        }, 0),
                        selectedDates.reduce((sum, date) => {
                          const data = getDataForPriceAndDate(selectedStock, date, price, priceDataByDate);
                          return sum + (data?.bOrd || 0);
                        }, 0)
                      )}
                    </td>
                    <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                        const data = getDataForPriceAndDate(selectedStock, date, price, priceDataByDate);
                        return sum + (data?.sLot || 0);
                      }, 0))}
                    </td>
                    <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                        const data = getDataForPriceAndDate(selectedStock, date, price, priceDataByDate);
                        return sum + (data?.sFreq || 0);
                      }, 0))}
                    </td>
                    <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatRatio(
                        selectedDates.reduce((sum, date) => {
                          const data = getDataForPriceAndDate(selectedStock, date, price, priceDataByDate);
                          return sum + (data?.sLot || 0);
                        }, 0),
                        selectedDates.reduce((sum, date) => {
                          const data = getDataForPriceAndDate(selectedStock, date, price, priceDataByDate);
                          return sum + (data?.sFreq || 0);
                        }, 0)
                      )}
                    </td>
                    <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                        const data = getDataForPriceAndDate(selectedStock, date, price, priceDataByDate);
                        return sum + (data?.sOrd || 0);
                      }, 0))}
                    </td>
                    <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatRatio(
                        selectedDates.reduce((sum, date) => {
                          const data = getDataForPriceAndDate(selectedStock, date, price, priceDataByDate);
                          return sum + (data?.sLot || 0);
                        }, 0),
                        selectedDates.reduce((sum, date) => {
                          const data = getDataForPriceAndDate(selectedStock, date, price, priceDataByDate);
                          return sum + (data?.sOrd || 0);
                        }, 0)
                      )}
                    </td>
                    <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                        const data = getDataForPriceAndDate(selectedStock, date, price, priceDataByDate);
                        return sum + (data?.tFreq || 0);
                      }, 0))}
                    </td>
                    <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                        const data = getDataForPriceAndDate(selectedStock, date, price, priceDataByDate);
                        return sum + (data?.tLot || 0);
                      }, 0))}
                    </td>
                    <td className="text-right py-[1px] px-[7px] font-bold text-white border-r-2 border-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                        const data = getDataForPriceAndDate(selectedStock, date, price, priceDataByDate);
                        return sum + (data?.tOrd || 0);
                      }, 0))}
                    </td>
                  </tr>
                  );
                }).filter(Boolean)}
                {/* Total Row */}
                <tr className="border-t-2 border-white font-bold">
                  {selectedDates.map((date, dateIndex) => {
                    const dateData = priceDataByDate[date] || [];
                    const totals = calculateTotals(dateData);
                    return (
                      <React.Fragment key={date}>
                        {/* Price - empty for Total row */}
                        <td className={`text-center py-[1px] px-[6px] font-bold text-white ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`}>
                          -
                        </td>
                        {/* BFreq */}
                        <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatNumberWithAbbreviation(totals.bFreq)}
                        </td>
                        {/* BLot */}
                        <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatNumberWithAbbreviation(totals.bLot)}
                        </td>
                        {/* BLot/Freq */}
                        <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatRatio(totals.bLot, totals.bFreq)}
                        </td>
                        {/* BOrd */}
                        <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatNumberWithAbbreviation(totals.bOrd)}
                        </td>
                        {/* BLot/Ord */}
                        <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatRatio(totals.bLot, totals.bOrd)}
                        </td>
                        {/* SLot */}
                        <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatNumberWithAbbreviation(totals.sLot)}
                        </td>
                        {/* SFreq */}
                        <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatNumberWithAbbreviation(totals.sFreq)}
                        </td>
                        {/* SLot/Freq */}
                        <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatRatio(totals.sLot, totals.sFreq)}
                        </td>
                        {/* SOrd */}
                        <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatNumberWithAbbreviation(totals.sOrd)}
                        </td>
                        {/* SLot/Ord */}
                        <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatRatio(totals.sLot, totals.sOrd)}
                        </td>
                        {/* TFreq */}
                        <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatNumberWithAbbreviation(totals.tFreq)}
                        </td>
                        {/* TLot */}
                        <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatNumberWithAbbreviation(totals.tLot)}
                        </td>
                        {/* TOrd */}
                        <td className={`text-right py-[1px] px-[6px] font-bold text-white ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatNumberWithAbbreviation(totals.tOrd)}
                        </td>
                      </React.Fragment>
                    );
                  })}
                  {/* Grand Total Column */}
                  <td className={`text-center py-[1px] px-[5px] font-bold text-white ${selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`}>
                    TOTAL
                  </td>
                  <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                      const dateData = priceDataByDate[date] || [];
                      const totals = calculateTotals(dateData);
                      return sum + totals.bFreq;
                    }, 0))}
                          </td>
                  <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                      const dateData = priceDataByDate[date] || [];
                      const totals = calculateTotals(dateData);
                      return sum + totals.bLot;
                    }, 0))}
                  </td>
                  <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatRatio(
                      selectedDates.reduce((sum, date) => {
                        const dateData = priceDataByDate[date] || [];
                        const totals = calculateTotals(dateData);
                        return sum + totals.bLot;
                      }, 0),
                      selectedDates.reduce((sum, date) => {
                      const dateData = priceDataByDate[date] || [];
                      const totals = calculateTotals(dateData);
                      return sum + totals.bFreq;
                      }, 0)
                    )}
                  </td>
                  <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                      const dateData = priceDataByDate[date] || [];
                      const totals = calculateTotals(dateData);
                      return sum + totals.bOrd;
                    }, 0))}
                          </td>
                  <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatRatio(
                      selectedDates.reduce((sum, date) => {
                        const dateData = priceDataByDate[date] || [];
                        const totals = calculateTotals(dateData);
                        return sum + totals.bLot;
                      }, 0),
                      selectedDates.reduce((sum, date) => {
                        const dateData = priceDataByDate[date] || [];
                        const totals = calculateTotals(dateData);
                        return sum + totals.bOrd;
                      }, 0)
                    )}
                  </td>
                  <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                      const dateData = priceDataByDate[date] || [];
                      const totals = calculateTotals(dateData);
                      return sum + totals.sLot;
                    }, 0))}
                          </td>
                  <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                      const dateData = priceDataByDate[date] || [];
                      const totals = calculateTotals(dateData);
                      return sum + totals.sFreq;
                    }, 0))}
                          </td>
                  <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatRatio(
                      selectedDates.reduce((sum, date) => {
                        const dateData = priceDataByDate[date] || [];
                        const totals = calculateTotals(dateData);
                        return sum + totals.sLot;
                      }, 0),
                      selectedDates.reduce((sum, date) => {
                        const dateData = priceDataByDate[date] || [];
                        const totals = calculateTotals(dateData);
                        return sum + totals.sFreq;
                      }, 0)
                    )}
                  </td>
                  <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                      const dateData = priceDataByDate[date] || [];
                      const totals = calculateTotals(dateData);
                      return sum + totals.sOrd;
                    }, 0))}
                          </td>
                  <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatRatio(
                      selectedDates.reduce((sum, date) => {
                        const dateData = priceDataByDate[date] || [];
                        const totals = calculateTotals(dateData);
                        return sum + totals.sLot;
                      }, 0),
                      selectedDates.reduce((sum, date) => {
                        const dateData = priceDataByDate[date] || [];
                        const totals = calculateTotals(dateData);
                        return sum + totals.sOrd;
                      }, 0)
                    )}
                  </td>
                  <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                      const dateData = priceDataByDate[date] || [];
                      const totals = calculateTotals(dateData);
                      return sum + totals.tFreq;
                    }, 0))}
                        </td>
                  <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                      const dateData = priceDataByDate[date] || [];
                      const totals = calculateTotals(dateData);
                      return sum + totals.tLot;
                    }, 0))}
                  </td>
                  <td className="text-right py-[1px] px-[7px] font-bold text-white border-r-2 border-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                      const dateData = priceDataByDate[date] || [];
                      const totals = calculateTotals(dateData);
                      return sum + totals.tOrd;
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
              <table className="w-full text-[13px] border-collapse" style={{ tableLayout: 'auto', width: 'auto' }}>
              <thead>
                {/* Main Header Row - Dates */}
                <tr className="border-t-2 border-white bg-[#3a4252]">
                  <th rowSpan={2} className="text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap border-l-2 border-white sticky left-0 z-30 bg-[#3a4252]">Price</th>
                  <th rowSpan={2} className="text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap sticky left-[80px] z-30 bg-[#3a4252]">Broker</th>
                  {selectedDates.map((date, dateIndex) => (
                    <th key={date} colSpan={14} className={`text-center py-[1px] px-[8.24px] font-bold text-white whitespace-nowrap ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`}>
                      {formatDisplayDate(date)}
                    </th>
                  ))}
                  <th colSpan={14} className={`text-center py-[1px] px-[4.2px] font-bold text-white border-r-2 border-white border-l-[10px] border-white`}>
                    Total
                  </th>
                </tr>
                {/* Sub Header Row - Metrics */}
                <tr className="bg-[#3a4252]">
                  {selectedDates.map((date, dateIndex) => (
                    <React.Fragment key={date}>
                      <th className="text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap">Price</th>
                      <th className="text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap">BFreq</th>
                      <th className="text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap">BLot</th>
                      <th className="text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap">BLot/Freq</th>
                      <th className="text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap">BOrd</th>
                      <th className="text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap">BLot/Ord</th>
                      <th className="text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap">SLot</th>
                      <th className="text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap">SFreq</th>
                      <th className="text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap">SLot/Freq</th>
                      <th className="text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap">SOrd</th>
                      <th className="text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap">SLot/Ord</th>
                      <th className="text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap">TFreq</th>
                      <th className="text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap">TLot</th>
                      <th className={`text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`}>TOrd</th>
                    </React.Fragment>
                  ))}
                  <th className={`text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap ${selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`}>Price</th>
                  <th className="text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap">BFreq</th>
                  <th className="text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap">BLot</th>
                  <th className="text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap">BLot/Freq</th>
                  <th className="text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap">BOrd</th>
                  <th className="text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap">BLot/Ord</th>
                  <th className="text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap">SLot</th>
                  <th className="text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap">SFreq</th>
                  <th className="text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap">SLot/Freq</th>
                  <th className="text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap">SOrd</th>
                  <th className="text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap">SLot/Ord</th>
                  <th className="text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap">TFreq</th>
                  <th className="text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap">TLot</th>
                  <th className="text-center py-[1px] px-[7px] font-bold text-white whitespace-nowrap border-r-2 border-white">TOrd</th>
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
                  
                  const totalBOrd = selectedDates.reduce((sum, date) => {
                    const data = getBrokerData(date);
                    return sum + (data?.bOrd || 0);
                  }, 0);
                  
                  const totalSLot = selectedDates.reduce((sum, date) => {
                    const data = getBrokerData(date);
                    return sum + (data?.sLot || 0);
                  }, 0);
                  
                  const totalSFreq = selectedDates.reduce((sum, date) => {
                    const data = getBrokerData(date);
                    return sum + (data?.sFreq || 0);
                  }, 0);
                  
                  const totalSOrd = selectedDates.reduce((sum, date) => {
                    const data = getBrokerData(date);
                    return sum + (data?.sOrd || 0);
                  }, 0);
                  
                  const totalTFreq = selectedDates.reduce((sum, date) => {
                    const data = getBrokerData(date);
                    return sum + (data?.tFreq || 0);
                  }, 0);
                  
                  const totalTLot = selectedDates.reduce((sum, date) => {
                    const data = getBrokerData(date);
                    return sum + (data?.tLot || 0);
                  }, 0);
                  
                  const totalTOrd = selectedDates.reduce((sum, date) => {
                    const data = getBrokerData(date);
                    return sum + (data?.tOrd || 0);
                  }, 0);
                  
                  return (
                  <tr key={idx} className="hover:bg-accent/50">
                    {/* Price - sticky column */}
                    <td className="text-center py-[1px] px-[6px] font-bold text-white border-l-2 border-white sticky left-0 z-20 bg-[#1a1f2e]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatNumber(combination.price)}
                    </td>
                    {/* Broker - sticky column */}
                    <td className="text-center py-[1px] px-[6px] font-bold text-white sticky left-[80px] z-20 bg-[#1a1f2e]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {combination.broker}
                    </td>
                    {selectedDates.map((date, dateIndex) => {
                      const data = getBrokerData(date);
                      return (
                        <React.Fragment key={date}>
                          {/* Price */}
                          <td className="text-center py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {formatNumber(combination.price)}
                          </td>
                          {/* BFreq */}
                          <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {data ? formatNumberWithAbbreviation(data.bFreq) : '-'}
                          </td>
                          {/* BLot */}
                          <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {data ? formatNumberWithAbbreviation(data.bLot) : '-'}
                          </td>
                          {/* BLot/Freq */}
                          <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {data ? formatRatio(data.bLot, data.bFreq) : '-'}
                          </td>
                          {/* BOrd */}
                          <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {data ? formatNumberWithAbbreviation(data.bOrd) : '-'}
                          </td>
                          {/* BLot/Ord */}
                          <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {data ? formatRatio(data.bLot, data.bOrd) : '-'}
                          </td>
                          {/* SLot */}
                          <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {data ? formatNumberWithAbbreviation(data.sLot) : '-'}
                          </td>
                          {/* SFreq */}
                          <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {data ? formatNumberWithAbbreviation(data.sFreq) : '-'}
                          </td>
                          {/* SLot/Freq */}
                          <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {data ? formatRatio(data.sLot, data.sFreq) : '-'}
                          </td>
                          {/* SOrd */}
                          <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {data ? formatNumberWithAbbreviation(data.sOrd) : '-'}
                          </td>
                          {/* SLot/Ord */}
                          <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {data ? formatRatio(data.sLot, data.sOrd) : '-'}
                          </td>
                          {/* TFreq */}
                          <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {data ? formatNumberWithAbbreviation(data.tFreq) : '-'}
                          </td>
                          {/* TLot */}
                          <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {data ? formatNumberWithAbbreviation(data.tLot) : '-'}
                          </td>
                          {/* TOrd */}
                          <td className={`text-right py-[1px] px-[6px] font-bold text-white ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {data ? formatNumberWithAbbreviation(data.tOrd) : '-'}
                          </td>
                        </React.Fragment>
                      );
                    })}
                    {/* Grand Total Column for each row */}
                    <td className={`text-center py-[1px] px-[5px] font-bold text-white ${selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatNumber(combination.price)}
                      </td>
                    <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatNumberWithAbbreviation(totalBFreq)}
                      </td>
                    <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatNumberWithAbbreviation(totalBLot)}
                      </td>
                    <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatRatio(totalBLot, totalBFreq)}
                      </td>
                    <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatNumberWithAbbreviation(totalBOrd)}
                      </td>
                    <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatRatio(totalBLot, totalBOrd)}
                    </td>
                    <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatNumberWithAbbreviation(totalSLot)}
                    </td>
                    <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatNumberWithAbbreviation(totalSFreq)}
                    </td>
                    <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatRatio(totalSLot, totalSFreq)}
                    </td>
                    <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatNumberWithAbbreviation(totalSOrd)}
                    </td>
                    <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatRatio(totalSLot, totalSOrd)}
                    </td>
                    <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatNumberWithAbbreviation(totalTFreq)}
                    </td>
                    <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatNumberWithAbbreviation(totalTLot)}
                    </td>
                    <td className="text-right py-[1px] px-[7px] font-bold text-white border-r-2 border-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatNumberWithAbbreviation(totalTOrd)}
                      </td>
                  </tr>
                  );
                })}
                {/* Total Row */}
                <tr className="border-t-2 border-white font-bold">
                  {/* Price - sticky column */}
                  <td className="text-center py-[1px] px-[6px] font-bold text-white border-l-2 border-white sticky left-0 z-20 bg-[#1a1f2e]">
                    TOTAL
                  </td>
                  {/* Broker - sticky column */}
                  <td className="text-center py-[1px] px-[6px] font-bold text-white sticky left-[80px] z-20 bg-[#1a1f2e]">
                    ALL
                  </td>
                  {selectedDates.map((date, dateIndex) => {
                    // Calculate totals from brokerDataByDate
                    const data = brokerDataByDate[date] || [];
                    const totals = data.reduce((acc, row) => ({
                      bFreq: acc.bFreq + (row.bFreq || 0),
                      bLot: acc.bLot + (row.bLot || 0),
                      bOrd: acc.bOrd + (row.bOrd || 0),
                      sLot: acc.sLot + (row.sLot || 0),
                      sFreq: acc.sFreq + (row.sFreq || 0),
                      sOrd: acc.sOrd + (row.sOrd || 0),
                      tFreq: acc.tFreq + (row.tFreq || 0),
                      tLot: acc.tLot + (row.tLot || 0),
                      tOrd: acc.tOrd + (row.tOrd || 0)
                    }), { bFreq: 0, bLot: 0, bOrd: 0, sLot: 0, sFreq: 0, sOrd: 0, tFreq: 0, tLot: 0, tOrd: 0 });
                    return (
                      <React.Fragment key={date}>
                        {/* Price - empty for Total row */}
                        <td className="text-center py-[1px] px-[6px] font-bold text-white">
                          -
                        </td>
                        {/* BFreq */}
                        <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatNumberWithAbbreviation(totals.bFreq)}
                        </td>
                        {/* BLot */}
                        <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatNumberWithAbbreviation(totals.bLot)}
                        </td>
                        {/* BLot/Freq */}
                        <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatRatio(totals.bLot, totals.bFreq)}
                        </td>
                        {/* BOrd */}
                        <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatNumberWithAbbreviation(totals.bOrd)}
                        </td>
                        {/* BLot/Ord */}
                        <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatRatio(totals.bLot, totals.bOrd)}
                        </td>
                        {/* SLot */}
                        <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatNumberWithAbbreviation(totals.sLot)}
                        </td>
                        {/* SFreq */}
                        <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatNumberWithAbbreviation(totals.sFreq)}
                        </td>
                        {/* SLot/Freq */}
                        <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatRatio(totals.sLot, totals.sFreq)}
                        </td>
                        {/* SOrd */}
                        <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatNumberWithAbbreviation(totals.sOrd)}
                        </td>
                        {/* SLot/Ord */}
                        <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatRatio(totals.sLot, totals.sOrd)}
                        </td>
                        {/* TFreq */}
                        <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatNumberWithAbbreviation(totals.tFreq)}
                        </td>
                        {/* TLot */}
                        <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatNumberWithAbbreviation(totals.tLot)}
                        </td>
                        {/* TOrd */}
                        <td className={`text-right py-[1px] px-[6px] font-bold text-white ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatNumberWithAbbreviation(totals.tOrd)}
                        </td>
                      </React.Fragment>
                    );
                  })}
                  {/* Grand Total Column */}
                  <td className={`text-center py-[1px] px-[5px] font-bold text-white ${selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`}>
                    TOTAL
                  </td>
                  <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                      const data = brokerDataByDate[date] || [];
                      const totals = data.reduce((acc, row) => ({
                        bFreq: acc.bFreq + (row.bFreq || 0),
                        bLot: acc.bLot + (row.bLot || 0),
                        bOrd: acc.bOrd + (row.bOrd || 0),
                        sLot: acc.sLot + (row.sLot || 0),
                        sFreq: acc.sFreq + (row.sFreq || 0),
                        sOrd: acc.sOrd + (row.sOrd || 0),
                        tFreq: acc.tFreq + (row.tFreq || 0),
                        tLot: acc.tLot + (row.tLot || 0),
                        tOrd: acc.tOrd + (row.tOrd || 0)
                      }), { bFreq: 0, bLot: 0, bOrd: 0, sLot: 0, sFreq: 0, sOrd: 0, tFreq: 0, tLot: 0, tOrd: 0 });
                      return sum + totals.bFreq;
                    }, 0))}
                  </td>
                  <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                      const data = brokerDataByDate[date] || [];
                      const totals = data.reduce((acc, row) => ({
                        bFreq: acc.bFreq + (row.bFreq || 0),
                        bLot: acc.bLot + (row.bLot || 0),
                        bOrd: acc.bOrd + (row.bOrd || 0),
                        sLot: acc.sLot + (row.sLot || 0),
                        sFreq: acc.sFreq + (row.sFreq || 0),
                        sOrd: acc.sOrd + (row.sOrd || 0),
                        tFreq: acc.tFreq + (row.tFreq || 0),
                        tLot: acc.tLot + (row.tLot || 0),
                        tOrd: acc.tOrd + (row.tOrd || 0)
                      }), { bFreq: 0, bLot: 0, bOrd: 0, sLot: 0, sFreq: 0, sOrd: 0, tFreq: 0, tLot: 0, tOrd: 0 });
                      return sum + totals.bLot;
                    }, 0))}
                          </td>
                  <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatRatio(
                      selectedDates.reduce((sum, date) => {
                        const data = brokerDataByDate[date] || [];
                        const totals = data.reduce((acc, row) => ({
                          bFreq: acc.bFreq + (row.bFreq || 0),
                          bLot: acc.bLot + (row.bLot || 0),
                          bOrd: acc.bOrd + (row.bOrd || 0),
                          sLot: acc.sLot + (row.sLot || 0),
                          sFreq: acc.sFreq + (row.sFreq || 0),
                          sOrd: acc.sOrd + (row.sOrd || 0),
                          tFreq: acc.tFreq + (row.tFreq || 0),
                          tLot: acc.tLot + (row.tLot || 0),
                          tOrd: acc.tOrd + (row.tOrd || 0)
                        }), { bFreq: 0, bLot: 0, bOrd: 0, sLot: 0, sFreq: 0, sOrd: 0, tFreq: 0, tLot: 0, tOrd: 0 });
                        return sum + totals.bLot;
                      }, 0),
                      selectedDates.reduce((sum, date) => {
                        const data = brokerDataByDate[date] || [];
                        const totals = data.reduce((acc, row) => ({
                          bFreq: acc.bFreq + (row.bFreq || 0),
                          bLot: acc.bLot + (row.bLot || 0),
                          bOrd: acc.bOrd + (row.bOrd || 0),
                          sLot: acc.sLot + (row.sLot || 0),
                          sFreq: acc.sFreq + (row.sFreq || 0),
                          sOrd: acc.sOrd + (row.sOrd || 0),
                          tFreq: acc.tFreq + (row.tFreq || 0),
                          tLot: acc.tLot + (row.tLot || 0),
                          tOrd: acc.tOrd + (row.tOrd || 0)
                        }), { bFreq: 0, bLot: 0, bOrd: 0, sLot: 0, sFreq: 0, sOrd: 0, tFreq: 0, tLot: 0, tOrd: 0 });
                      return sum + totals.bFreq;
                      }, 0)
                    )}
                  </td>
                  <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                      const data = brokerDataByDate[date] || [];
                      const totals = data.reduce((acc, row) => ({
                        bFreq: acc.bFreq + (row.bFreq || 0),
                        bLot: acc.bLot + (row.bLot || 0),
                        bOrd: acc.bOrd + (row.bOrd || 0),
                        sLot: acc.sLot + (row.sLot || 0),
                        sFreq: acc.sFreq + (row.sFreq || 0),
                        sOrd: acc.sOrd + (row.sOrd || 0),
                        tFreq: acc.tFreq + (row.tFreq || 0),
                        tLot: acc.tLot + (row.tLot || 0),
                        tOrd: acc.tOrd + (row.tOrd || 0)
                      }), { bFreq: 0, bLot: 0, bOrd: 0, sLot: 0, sFreq: 0, sOrd: 0, tFreq: 0, tLot: 0, tOrd: 0 });
                      return sum + totals.bOrd;
                    }, 0))}
                          </td>
                  <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatRatio(
                      selectedDates.reduce((sum, date) => {
                        const data = brokerDataByDate[date] || [];
                        const totals = data.reduce((acc, row) => ({
                          bFreq: acc.bFreq + (row.bFreq || 0),
                          bLot: acc.bLot + (row.bLot || 0),
                          bOrd: acc.bOrd + (row.bOrd || 0),
                          sLot: acc.sLot + (row.sLot || 0),
                          sFreq: acc.sFreq + (row.sFreq || 0),
                          sOrd: acc.sOrd + (row.sOrd || 0),
                          tFreq: acc.tFreq + (row.tFreq || 0),
                          tLot: acc.tLot + (row.tLot || 0),
                          tOrd: acc.tOrd + (row.tOrd || 0)
                        }), { bFreq: 0, bLot: 0, bOrd: 0, sLot: 0, sFreq: 0, sOrd: 0, tFreq: 0, tLot: 0, tOrd: 0 });
                        return sum + totals.bLot;
                      }, 0),
                      selectedDates.reduce((sum, date) => {
                        const data = brokerDataByDate[date] || [];
                        const totals = data.reduce((acc, row) => ({
                          bFreq: acc.bFreq + (row.bFreq || 0),
                          bLot: acc.bLot + (row.bLot || 0),
                          bOrd: acc.bOrd + (row.bOrd || 0),
                          sLot: acc.sLot + (row.sLot || 0),
                          sFreq: acc.sFreq + (row.sFreq || 0),
                          sOrd: acc.sOrd + (row.sOrd || 0),
                          tFreq: acc.tFreq + (row.tFreq || 0),
                          tLot: acc.tLot + (row.tLot || 0),
                          tOrd: acc.tOrd + (row.tOrd || 0)
                        }), { bFreq: 0, bLot: 0, bOrd: 0, sLot: 0, sFreq: 0, sOrd: 0, tFreq: 0, tLot: 0, tOrd: 0 });
                        return sum + totals.bOrd;
                      }, 0)
                    )}
                  </td>
                  <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                      const data = brokerDataByDate[date] || [];
                      const totals = data.reduce((acc, row) => ({
                        bFreq: acc.bFreq + (row.bFreq || 0),
                        bLot: acc.bLot + (row.bLot || 0),
                        bOrd: acc.bOrd + (row.bOrd || 0),
                        sLot: acc.sLot + (row.sLot || 0),
                        sFreq: acc.sFreq + (row.sFreq || 0),
                        sOrd: acc.sOrd + (row.sOrd || 0),
                        tFreq: acc.tFreq + (row.tFreq || 0),
                        tLot: acc.tLot + (row.tLot || 0),
                        tOrd: acc.tOrd + (row.tOrd || 0)
                      }), { bFreq: 0, bLot: 0, bOrd: 0, sLot: 0, sFreq: 0, sOrd: 0, tFreq: 0, tLot: 0, tOrd: 0 });
                      return sum + totals.sLot;
                    }, 0))}
                          </td>
                  <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                      const data = brokerDataByDate[date] || [];
                      const totals = data.reduce((acc, row) => ({
                        bFreq: acc.bFreq + (row.bFreq || 0),
                        bLot: acc.bLot + (row.bLot || 0),
                        bOrd: acc.bOrd + (row.bOrd || 0),
                        sLot: acc.sLot + (row.sLot || 0),
                        sFreq: acc.sFreq + (row.sFreq || 0),
                        sOrd: acc.sOrd + (row.sOrd || 0),
                        tFreq: acc.tFreq + (row.tFreq || 0),
                        tLot: acc.tLot + (row.tLot || 0),
                        tOrd: acc.tOrd + (row.tOrd || 0)
                      }), { bFreq: 0, bLot: 0, bOrd: 0, sLot: 0, sFreq: 0, sOrd: 0, tFreq: 0, tLot: 0, tOrd: 0 });
                      return sum + totals.sFreq;
                    }, 0))}
                          </td>
                  <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatRatio(
                      selectedDates.reduce((sum, date) => {
                        const data = brokerDataByDate[date] || [];
                        const totals = data.reduce((acc, row) => ({
                          bFreq: acc.bFreq + (row.bFreq || 0),
                          bLot: acc.bLot + (row.bLot || 0),
                          bOrd: acc.bOrd + (row.bOrd || 0),
                          sLot: acc.sLot + (row.sLot || 0),
                          sFreq: acc.sFreq + (row.sFreq || 0),
                          sOrd: acc.sOrd + (row.sOrd || 0),
                          tFreq: acc.tFreq + (row.tFreq || 0),
                          tLot: acc.tLot + (row.tLot || 0),
                          tOrd: acc.tOrd + (row.tOrd || 0)
                        }), { bFreq: 0, bLot: 0, bOrd: 0, sLot: 0, sFreq: 0, sOrd: 0, tFreq: 0, tLot: 0, tOrd: 0 });
                        return sum + totals.sLot;
                      }, 0),
                      selectedDates.reduce((sum, date) => {
                        const data = brokerDataByDate[date] || [];
                        const totals = data.reduce((acc, row) => ({
                          bFreq: acc.bFreq + (row.bFreq || 0),
                          bLot: acc.bLot + (row.bLot || 0),
                          bOrd: acc.bOrd + (row.bOrd || 0),
                          sLot: acc.sLot + (row.sLot || 0),
                          sFreq: acc.sFreq + (row.sFreq || 0),
                          sOrd: acc.sOrd + (row.sOrd || 0),
                          tFreq: acc.tFreq + (row.tFreq || 0),
                          tLot: acc.tLot + (row.tLot || 0),
                          tOrd: acc.tOrd + (row.tOrd || 0)
                        }), { bFreq: 0, bLot: 0, bOrd: 0, sLot: 0, sFreq: 0, sOrd: 0, tFreq: 0, tLot: 0, tOrd: 0 });
                        return sum + totals.sFreq;
                      }, 0)
                    )}
                  </td>
                  <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                      const data = brokerDataByDate[date] || [];
                      const totals = data.reduce((acc, row) => ({
                        bFreq: acc.bFreq + (row.bFreq || 0),
                        bLot: acc.bLot + (row.bLot || 0),
                        bOrd: acc.bOrd + (row.bOrd || 0),
                        sLot: acc.sLot + (row.sLot || 0),
                        sFreq: acc.sFreq + (row.sFreq || 0),
                        sOrd: acc.sOrd + (row.sOrd || 0),
                        tFreq: acc.tFreq + (row.tFreq || 0),
                        tLot: acc.tLot + (row.tLot || 0),
                        tOrd: acc.tOrd + (row.tOrd || 0)
                      }), { bFreq: 0, bLot: 0, bOrd: 0, sLot: 0, sFreq: 0, sOrd: 0, tFreq: 0, tLot: 0, tOrd: 0 });
                      return sum + totals.sOrd;
                    }, 0))}
                  </td>
                  <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatRatio(
                      selectedDates.reduce((sum, date) => {
                        const data = brokerDataByDate[date] || [];
                        const totals = data.reduce((acc, row) => ({
                          bFreq: acc.bFreq + (row.bFreq || 0),
                          bLot: acc.bLot + (row.bLot || 0),
                          bOrd: acc.bOrd + (row.bOrd || 0),
                          sLot: acc.sLot + (row.sLot || 0),
                          sFreq: acc.sFreq + (row.sFreq || 0),
                          sOrd: acc.sOrd + (row.sOrd || 0),
                          tFreq: acc.tFreq + (row.tFreq || 0),
                          tLot: acc.tLot + (row.tLot || 0),
                          tOrd: acc.tOrd + (row.tOrd || 0)
                        }), { bFreq: 0, bLot: 0, bOrd: 0, sLot: 0, sFreq: 0, sOrd: 0, tFreq: 0, tLot: 0, tOrd: 0 });
                        return sum + totals.sLot;
                      }, 0),
                      selectedDates.reduce((sum, date) => {
                        const data = brokerDataByDate[date] || [];
                        const totals = data.reduce((acc, row) => ({
                          bFreq: acc.bFreq + (row.bFreq || 0),
                          bLot: acc.bLot + (row.bLot || 0),
                          bOrd: acc.bOrd + (row.bOrd || 0),
                          sLot: acc.sLot + (row.sLot || 0),
                          sFreq: acc.sFreq + (row.sFreq || 0),
                          sOrd: acc.sOrd + (row.sOrd || 0),
                          tFreq: acc.tFreq + (row.tFreq || 0),
                          tLot: acc.tLot + (row.tLot || 0),
                          tOrd: acc.tOrd + (row.tOrd || 0)
                        }), { bFreq: 0, bLot: 0, bOrd: 0, sLot: 0, sFreq: 0, sOrd: 0, tFreq: 0, tLot: 0, tOrd: 0 });
                        return sum + totals.sOrd;
                      }, 0)
                    )}
                  </td>
                  <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                      const data = brokerDataByDate[date] || [];
                      const totals = data.reduce((acc, row) => ({
                        bFreq: acc.bFreq + (row.bFreq || 0),
                        bLot: acc.bLot + (row.bLot || 0),
                        bOrd: acc.bOrd + (row.bOrd || 0),
                        sLot: acc.sLot + (row.sLot || 0),
                        sFreq: acc.sFreq + (row.sFreq || 0),
                        sOrd: acc.sOrd + (row.sOrd || 0),
                        tFreq: acc.tFreq + (row.tFreq || 0),
                        tLot: acc.tLot + (row.tLot || 0),
                        tOrd: acc.tOrd + (row.tOrd || 0)
                      }), { bFreq: 0, bLot: 0, bOrd: 0, sLot: 0, sFreq: 0, sOrd: 0, tFreq: 0, tLot: 0, tOrd: 0 });
                      return sum + totals.tFreq;
                    }, 0))}
                          </td>
                  <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                      const data = brokerDataByDate[date] || [];
                      const totals = data.reduce((acc, row) => ({
                        bFreq: acc.bFreq + (row.bFreq || 0),
                        bLot: acc.bLot + (row.bLot || 0),
                        bOrd: acc.bOrd + (row.bOrd || 0),
                        sLot: acc.sLot + (row.sLot || 0),
                        sFreq: acc.sFreq + (row.sFreq || 0),
                        sOrd: acc.sOrd + (row.sOrd || 0),
                        tFreq: acc.tFreq + (row.tFreq || 0),
                        tLot: acc.tLot + (row.tLot || 0),
                        tOrd: acc.tOrd + (row.tOrd || 0)
                      }), { bFreq: 0, bLot: 0, bOrd: 0, sLot: 0, sFreq: 0, sOrd: 0, tFreq: 0, tLot: 0, tOrd: 0 });
                      return sum + totals.tLot;
                    }, 0))}
                  </td>
                  <td className="text-right py-[1px] px-[7px] font-bold text-white border-r-2 border-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                      const data = brokerDataByDate[date] || [];
                      const totals = data.reduce((acc, row) => ({
                        bFreq: acc.bFreq + (row.bFreq || 0),
                        bLot: acc.bLot + (row.bLot || 0),
                        bOrd: acc.bOrd + (row.bOrd || 0),
                        sLot: acc.sLot + (row.sLot || 0),
                        sFreq: acc.sFreq + (row.sFreq || 0),
                        sOrd: acc.sOrd + (row.sOrd || 0),
                        tFreq: acc.tFreq + (row.tFreq || 0),
                        tLot: acc.tLot + (row.tLot || 0),
                        tOrd: acc.tOrd + (row.tOrd || 0)
                      }), { bFreq: 0, bLot: 0, bOrd: 0, sLot: 0, sFreq: 0, sOrd: 0, tFreq: 0, tLot: 0, tOrd: 0 });
                      return sum + totals.tOrd;
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


  const formatDateForInput = (date: string | undefined) => {
    return date || '';
  };

  const triggerDatePicker = (inputRef: React.RefObject<HTMLInputElement>) => {
    inputRef.current?.showPicker?.();
  };

  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);

  return (
    <div className="w-full">
      {/* Top Controls - Compact without Card */}
      <div className="fixed top-14 left-20 right-0 z-40 bg-[#0a0f20] border-b border-[#3a4252] px-4 py-1">
        <div ref={menuContainerRef} className="flex flex-col md:flex-row md:flex-wrap items-center gap-2 md:gap-x-7 md:gap-y-0.2">
          {/* Ticker Selection */}
          <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
            <label className="text-sm font-medium whitespace-nowrap">Ticker:</label>
            <div className="relative flex-1 md:flex-none" ref={dropdownRef}>
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
                className="w-full md:w-32 h-9 pl-10 pr-3 text-sm border border-input rounded-md bg-background text-foreground"
                role="combobox"
                aria-expanded={showStockSuggestions}
                aria-controls="stock-suggestions"
                aria-autocomplete="list"
              />
              {showStockSuggestions && (
                <div id="stock-suggestions" role="listbox" className="absolute top-full left-0 right-0 mt-1 bg-popover border border-[#3a4252] rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                  {stockInput === '' ? (
                    <>
                      <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252]">
                        Available Stocks ({STOCK_LIST.length})
                      </div>
                      {STOCK_LIST.slice(0, 20).map(stock => (
                        <div
                          key={stock}
                          onClick={() => handleStockSelect(stock)}
                          className="px-3 py-[2.06px] hover:bg-muted cursor-pointer text-sm"
                        >
                          {stock}
                        </div>
                      ))}
                      {STOCK_LIST.length > 20 && (
                        <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-t border-[#3a4252]">
                          ... and {STOCK_LIST.length - 20} more stocks
                        </div>
                      )}
                    </>
                  ) : filteredStocks.length > 0 ? (
                    <>
                      <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252]">
                        {filteredStocks.length} stocks found
                      </div>
                      {filteredStocks.slice(0, 20).map(stock => (
                        <div
                          key={stock}
                          onClick={() => handleStockSelect(stock)}
                          className="px-3 py-[2.06px] hover:bg-muted cursor-pointer text-sm"
                        >
                          {stock}
                        </div>
                      ))}
                      {filteredStocks.length > 20 && (
                        <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-t border-[#3a4252]">
                          ... and {filteredStocks.length - 20} more results
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="px-3 py-[2.06px] text-sm text-muted-foreground">
                      No stocks found
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Broker Selection - Multi-select with chips */}
          <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
            <label className="text-sm font-medium whitespace-nowrap">Broker:</label>
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              {/* Selected Broker Chips */}
              {selectedBrokers.map(broker => (
                <div
                  key={broker}
                  className="flex items-center gap-1 px-2 h-9 bg-primary/20 text-primary rounded-md text-sm"
                >
                  <span>{broker}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveBroker(broker)}
                    className="hover:bg-primary/30 rounded px-1"
                    aria-label={`Remove ${broker}`}
                  >
                    ×
                  </button>
                </div>
              ))}
              {/* Broker Input */}
              <div className="relative flex-1 md:flex-none" ref={dropdownBrokerRef}>
                <input
                  type="text"
                  value={brokerInput}
                  onChange={(e) => {
                    const v = e.target.value.toUpperCase();
                    setBrokerInput(v);
                    setShowBrokerSuggestions(true);
                    setHighlightedBrokerIndex(0);
                  }}
                  onFocus={() => setShowBrokerSuggestions(true)}
                  onKeyDown={(e) => {
                    const filteredBrokers = brokerInput === '' 
                      ? availableBrokers.filter(b => !selectedBrokers.includes(b))
                      : availableBrokers.filter(b => 
                          b.toLowerCase().includes(brokerInput.toLowerCase()) && 
                          !selectedBrokers.includes(b)
                        );
                    const suggestions = filteredBrokers.slice(0, 10);
                    
                    if (e.key === 'ArrowDown' && suggestions.length) {
                      e.preventDefault();
                      setHighlightedBrokerIndex((prev) => (prev + 1) % suggestions.length);
                    } else if (e.key === 'ArrowUp' && suggestions.length) {
                      e.preventDefault();
                      setHighlightedBrokerIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
                    } else if (e.key === 'Enter' && showBrokerSuggestions) {
                      e.preventDefault();
                      const idx = highlightedBrokerIndex >= 0 ? highlightedBrokerIndex : 0;
                      const choice = suggestions[idx];
                      if (choice) handleBrokerSelect(choice);
                    } else if (e.key === 'Escape') {
                      setShowBrokerSuggestions(false);
                      setHighlightedBrokerIndex(-1);
                    }
                  }}
                  placeholder="Add broker"
                  className="w-full md:w-32 h-9 px-3 text-sm border border-input rounded-md bg-background text-foreground"
                  role="combobox"
                  aria-expanded={showBrokerSuggestions}
                  aria-controls="broker-suggestions"
                  aria-autocomplete="list"
                />
                {showBrokerSuggestions && (
                  <div id="broker-suggestions" role="listbox" className="absolute top-full left-0 right-0 mt-1 bg-popover border border-[#3a4252] rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                    {availableBrokers.length === 0 ? (
                      <div className="px-3 py-[2.06px] text-sm text-muted-foreground flex items-center">
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Loading brokers...
                      </div>
                    ) : brokerInput === '' ? (
                      <>
                        <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252]">
                          Available Brokers ({availableBrokers.filter(b => !selectedBrokers.includes(b)).length})
                        </div>
                        {availableBrokers.filter(b => !selectedBrokers.includes(b)).map(broker => (
                          <div
                            key={broker}
                            onClick={() => handleBrokerSelect(broker)}
                            className="px-3 py-[2.06px] hover:bg-muted cursor-pointer text-sm"
                          >
                            {broker}
                          </div>
                        ))}
                      </>
                    ) : (() => {
                      const filteredBrokers = availableBrokers.filter(b => 
                        b.toLowerCase().includes(brokerInput.toLowerCase()) && 
                        !selectedBrokers.includes(b)
                      );
                      return (
                        <>
                          <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252]">
                            {filteredBrokers.length} broker(s) found
                          </div>
                          {filteredBrokers.length > 0 ? (
                            filteredBrokers.map((broker, idx) => (
                              <div
                                key={broker}
                                onClick={() => handleBrokerSelect(broker)}
                                className={`px-3 py-[2.06px] hover:bg-muted cursor-pointer text-sm ${idx === highlightedBrokerIndex ? 'bg-accent' : ''}`}
                                onMouseEnter={() => setHighlightedBrokerIndex(idx)}
                              >
                                {broker}
                              </div>
                            ))
                          ) : (
                            <div className="px-3 py-[2.06px] text-sm text-muted-foreground">
                              No brokers found
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Date Range */}
          <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
            <label className="text-sm font-medium whitespace-nowrap">Date Range:</label>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div 
                className="relative h-9 flex-1 md:w-36 rounded-md border border-input bg-background cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => triggerDatePicker(startDateRef)}
              >
                <input
                  ref={startDateRef}
                  type="date"
                  value={formatDateForInput(startDate)}
                  onChange={(e) => {
                    const selectedDate = new Date(e.target.value);
                    const dayOfWeek = selectedDate.getDay();
                    if (dayOfWeek === 0 || dayOfWeek === 6) {
                      showToast({
                        type: 'warning',
                        title: 'Peringatan',
                        message: 'Tidak bisa memilih hari Sabtu atau Minggu'
                      });
                      return;
                    }
                    setStartDate(e.target.value);
                    if (!endDate || new Date(e.target.value) > new Date(endDate)) {
                      setEndDate(e.target.value);
                    }
                  }}
                  onKeyDown={(e) => e.preventDefault()}
                  onPaste={(e) => e.preventDefault()}
                  onInput={(e) => e.preventDefault()}
                  max={formatDateForInput(endDate)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  style={{ caretColor: 'transparent' }}
                />
                <div className="flex items-center justify-between h-full px-3">
                  <span className="text-sm text-foreground">
                    {startDate ? new Date(startDate).toLocaleDateString('en-GB', { 
                      day: '2-digit', 
                      month: '2-digit', 
                      year: 'numeric' 
                    }) : 'DD/MM/YYYY'}
                  </span>
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
              <span className="text-sm text-muted-foreground whitespace-nowrap hidden md:inline">to</span>
              <div 
                className="relative h-9 flex-1 md:w-36 rounded-md border border-input bg-background cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => triggerDatePicker(endDateRef)}
              >
                <input
                  ref={endDateRef}
                  type="date"
                  value={formatDateForInput(endDate)}
                  onChange={(e) => {
                    const selectedDate = new Date(e.target.value);
                    const dayOfWeek = selectedDate.getDay();
                    if (dayOfWeek === 0 || dayOfWeek === 6) {
                      showToast({
                        type: 'warning',
                        title: 'Peringatan',
                        message: 'Tidak bisa memilih hari Sabtu atau Minggu'
                      });
                      return;
                    }
                    const newEndDate = e.target.value;
                    setEndDate(newEndDate);
                    if (startDate && new Date(newEndDate) < new Date(startDate)) {
                      setStartDate(newEndDate);
                    }
                  }}
                  onKeyDown={(e) => e.preventDefault()}
                  onPaste={(e) => e.preventDefault()}
                  onInput={(e) => e.preventDefault()}
                  min={formatDateForInput(startDate)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  style={{ caretColor: 'transparent' }}
                />
                <div className="flex items-center justify-between h-full px-3">
                  <span className="text-sm text-foreground">
                    {endDate ? new Date(endDate).toLocaleDateString('en-GB', { 
                      day: '2-digit', 
                      month: '2-digit', 
                      year: 'numeric' 
                    }) : 'DD/MM/YYYY'}
                  </span>
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            </div>
          </div>

          {/* F/D Filter (Foreign/Domestic) */}
          <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
            <label className="text-sm font-medium whitespace-nowrap">F/D:</label>
            <select
              value={invFilter}
              onChange={(e) => {
                setInvFilter(e.target.value as 'F' | 'D' | '');
              }}
              className="h-9 px-3 border border-[#3a4252] rounded-md bg-background text-foreground text-sm w-full md:w-auto"
            >
              <option value="">All</option>
              <option value="F">Foreign</option>
              <option value="D">Domestic</option>
            </select>
          </div>

          {/* Board Filter (RG/TN/NG) */}
          <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
            <label className="text-sm font-medium whitespace-nowrap">Board:</label>
            <select
              value={boardFilter}
              onChange={(e) => {
                setBoardFilter(e.target.value as 'RG' | 'TN' | 'NG' | '');
              }}
              className="h-9 px-3 border border-[#3a4252] rounded-md bg-background text-foreground text-sm w-full md:w-auto"
            >
              <option value="">All Trade</option>
              <option value="RG">RG</option>
              <option value="TN">TN</option>
              <option value="NG">NG</option>
            </select>
          </div>

          {/* Ord Checklist */}
          <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
            <label className="text-sm font-medium whitespace-nowrap">Show Ord:</label>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showOrdColumns}
                onChange={(e) => setShowOrdColumns(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
            </div>
          </div>

          {/* Show Button */}
          <button
            onClick={() => {
              // Generate date array from startDate and endDate
              let datesToUse: string[] = [];
              if (startDate && endDate) {
                const start = new Date(startDate);
                const end = new Date(endDate);
                
                if (start <= end) {
                  const dateArray: string[] = [];
                  const currentDate = new Date(start);
                  
                  while (currentDate <= end) {
                    const dayOfWeek = currentDate.getDay();
                    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                      const year = currentDate.getFullYear();
                      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
                      const day = String(currentDate.getDate()).padStart(2, '0');
                      const dateString = `${year}-${month}-${day}`;
                      dateArray.push(dateString);
                    }
                    currentDate.setDate(currentDate.getDate() + 1);
                  }
                  
                  datesToUse = dateArray.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
                  
                  // Check if total trading dates exceed 7
                  if (datesToUse.length > 7) {
                    showToast({
                      type: 'warning',
                      title: 'Terlalu Banyak Tanggal',
                      message: 'Maksimal 7 hari trading yang bisa dipilih (tidak termasuk weekend)',
                    });
                    return;
                  }
                }
              }
              
              setSelectedDates(datesToUse);
              
              // Clear existing data before fetching new data
              setPriceDataByDate({});
              setBrokerDataByDate({});
              setIsDataReady(false);
              
              // Trigger fetch
              setShouldFetchData(true);
            }}
            disabled={loading || !selectedStock || !startDate || !endDate}
            className="h-9 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium whitespace-nowrap flex items-center justify-center w-full md:w-auto"
          >
            Show
          </button>
        </div>
      </div>

      {/* Spacer for fixed menu - responsive based on menu rows */}
      <div className={isMenuTwoRows ? "h-[60px] md:h-[50px]" : "h-[38px] md:h-[35px]"}></div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-16 pt-4">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Loading bid/ask data...</span>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="flex items-center justify-center py-8 pt-4">
          <div className="text-sm text-destructive">{error}</div>
        </div>
      )}

      {/* Main Data Display */}
      <div className="pt-2">
        {!loading && !error && isDataReady && renderHorizontalSummaryView()}
      </div>
    </div>
  );
}
