import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { ChevronDown, Calendar, Search, Loader2 } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { api } from '../../services/api';
import { STOCK_LIST, loadStockList, searchStocks } from '../../data/stockList';

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

// Helper function to get color class based on comparison
// Returns: 'text-green-500' for greater, 'text-red-500' for smaller, 'text-yellow-500' for equal
const getComparisonColor = (buyValue: number, sellValue: number, isBuy: boolean): string => {
  if (buyValue === sellValue) return 'text-yellow-500';
  if (isBuy) {
    return buyValue > sellValue ? 'text-green-500' : 'text-red-500';
  } else {
    return sellValue > buyValue ? 'text-green-500' : 'text-red-500';
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

// Helper function to get all unique prices across all dates (sorted from highest to lowest)
// Returns prices sorted in descending order
const getAllUniquePrices = (_stock: string, dates: string[], stockPriceDataByDate: { [date: string]: PriceData[] }): number[] => {
  const priceSet = new Set<number>();

  // Collect all unique prices from all dates
  dates.forEach(date => {
    const data = stockPriceDataByDate[date] || [];
    data.forEach(item => {
      if (item.price) {
        priceSet.add(item.price);
      }
    });
  });

  // Convert to array and sort from highest to lowest
  return Array.from(priceSet).sort((a, b) => b - a);
};

// Helper function to get data for specific price and date
const getDataForPriceAndDate = (_stock: string, date: string, price: number, stockPriceDataByDate: { [date: string]: PriceData[] }): PriceData | null => {
  const data = stockPriceDataByDate[date] || [];
  return data.find(item => item.price === price) || null;
};


// Helper function to find max values across all dates for horizontal layout
const findMaxValuesHorizontal = (_stock: string, dates: string[], stockPriceDataByDate: { [date: string]: PriceData[] }) => {
  let maxBFreq = 0, maxBLot = 0, maxBOrd = 0, maxSLot = 0, maxSFreq = 0, maxSOrd = 0, maxTFreq = 0, maxTLot = 0, maxTOrd = 0;

  dates.forEach(date => {
    const data = stockPriceDataByDate[date] || [];
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

// Page ID for menu preferences
const PAGE_ID = 'stock-transaction-done-summary';

// Interface for user preferences
interface UserPreferences {
  selectedStocks: string[];
  selectedBrokers: string[];
  invFilter: 'F' | 'D' | '';
  boardFilter: 'RG' | 'TN' | 'NG' | '';
  showFrequency: boolean;
  showOrdColumns: boolean;
  startDate?: string;
  endDate?: string;
}

// Import menu preferences service
import { menuPreferencesService } from '../../services/menuPreferences';

// Utility functions for saving/loading preferences (now using cookies)
const loadPreferences = (): Partial<UserPreferences> | null => {
  try {
    const cached = menuPreferencesService.getCachedPreferences(PAGE_ID);
    if (cached) {
      return cached as Partial<UserPreferences>;
    }
  } catch (error) {
    console.warn('Failed to load cached preferences:', error);
  }
  return null;
};

const savePreferences = (prefs: Partial<UserPreferences>) => {
  menuPreferencesService.savePreferences(PAGE_ID, prefs);
};

interface StockTransactionDoneSummaryProps {
  selectedStock?: string;
  disableTickerSelection?: boolean; // When true, only use propSelectedStock and hide ticker selection UI
}

export function StockTransactionDoneSummary({ selectedStock: propSelectedStock, disableTickerSelection = false }: StockTransactionDoneSummaryProps) {
  const { showToast } = useToast();

  // Load preferences from cookies on mount
  const savedPrefs = loadPreferences();

  // Load preferences from cookies on mount
  useEffect(() => {
    const prefs = menuPreferencesService.loadPreferences(PAGE_ID);
    if (prefs['showFrequency'] !== undefined) {
      setShowFrequency(prefs['showFrequency']);
    }
    if (prefs['showOrdColumns'] !== undefined) {
      setShowOrdColumns(prefs['showOrdColumns']);
    }
    if (prefs['invFilter'] !== undefined) {
      setInvFilter(prefs['invFilter']);
    }
    if (prefs['boardFilter'] !== undefined) {
      setBoardFilter(prefs['boardFilter']);
    }
  }, []);

  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [selectedStocks, setSelectedStocks] = useState<string[]>(() => {
    // Try to load from preferences first
    if (savedPrefs?.selectedStocks && savedPrefs.selectedStocks.length > 0) {
      return savedPrefs.selectedStocks;
    }
    // Fallback to prop or default
    if (propSelectedStock) {
      return [propSelectedStock];
    }
    return ['BBCA'];
  });

  // Real data states - changed to store data per stock
  const [priceDataByStockAndDate, setPriceDataByStockAndDate] = useState<{ [stock: string]: { [date: string]: PriceData[] } }>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [_availableDates] = useState<string[]>([]);
  const [shouldFetchData, setShouldFetchData] = useState<boolean>(false);
  const [isDataReady, setIsDataReady] = useState<boolean>(false);

  // UI states
  const [stockInput, setStockInput] = useState('');
  const [showStockSuggestions, setShowStockSuggestions] = useState(false);
  const [highlightedStockIndex, setHighlightedStockIndex] = useState<number>(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [startDate, setStartDate] = useState(() => {
    // Try to load from preferences first
    if (savedPrefs?.startDate) {
      return savedPrefs.startDate;
    }
    // Fallback to default
    const threeDays = getLastThreeTradingDays();
    if (threeDays.length > 0) {
      const sortedDates = [...threeDays].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      return sortedDates[0];
    }
    return '';
  });
  const [endDate, setEndDate] = useState(() => {
    // Try to load from preferences first
    if (savedPrefs?.endDate) {
      return savedPrefs.endDate;
    }
    // Fallback to default
    const threeDays = getLastThreeTradingDays();
    if (threeDays.length > 0) {
      const sortedDates = [...threeDays].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      return sortedDates[sortedDates.length - 1];
    }
    return '';
  });
  // Broker selection states
  const [brokerInput, setBrokerInput] = useState('');
  const [selectedBrokers, setSelectedBrokers] = useState<string[]>(() => {
    // Try to load from preferences first
    if (savedPrefs?.selectedBrokers && savedPrefs.selectedBrokers.length > 0) {
      return savedPrefs.selectedBrokers;
    }
    // Fallback to empty
    return [];
  });
  const [showBrokerSuggestions, setShowBrokerSuggestions] = useState(false);
  const [highlightedBrokerIndex, setHighlightedBrokerIndex] = useState<number>(-1);
  const [availableBrokers, setAvailableBrokers] = useState<string[]>([]);
  const dropdownBrokerRef = useRef<HTMLDivElement>(null);

  // Filter states - Default: F/D=All, Board=RG
  const [invFilter, setInvFilter] = useState<'F' | 'D' | ''>(() => {
    // Try to load from preferences first
    if (savedPrefs?.invFilter !== undefined) {
      return savedPrefs.invFilter;
    }
    // Fallback to default
    return '';
  }); // Default: All (empty = all)
  const [boardFilter, setBoardFilter] = useState<'RG' | 'TN' | 'NG' | ''>(() => {
    // Try to load from preferences first
    if (savedPrefs?.boardFilter) {
      return savedPrefs.boardFilter;
    }
    // Fallback to default
    return 'RG';
  }); // Default: RG
  const [showFrequency, setShowFrequency] = useState<boolean>(() => {
    // Try to load from preferences first
    if (savedPrefs?.showFrequency !== undefined) {
      return savedPrefs.showFrequency;
    }
    // Fallback to default
    return true;
  }); // Show/hide Frequency columns (BFreq, SFreq, TFreq, BLot/F, SLot/F)
  const [showOrdColumns, setShowOrdColumns] = useState<boolean>(() => {
    // Try to load from preferences first
    if (savedPrefs?.showOrdColumns !== undefined) {
      return savedPrefs.showOrdColumns;
    }
    // Fallback to default
    return true;
  }); // Show/hide Ord columns

  // Menu container ref for responsive layout
  const menuContainerRef = useRef<HTMLDivElement>(null);
  const [isMenuTwoRows, setIsMenuTwoRows] = useState<boolean>(false);

  // Helper functions
  const handleStockSelect = (stock: string) => {
    if (disableTickerSelection) {
      // Ignore selection if ticker selection is disabled
      return;
    }
    if (!selectedStocks.includes(stock)) {
      setSelectedStocks([...selectedStocks, stock]);
    }
    setStockInput('');
    setShowStockSuggestions(false);
  };

  const handleRemoveStock = (stock: string) => {
    if (disableTickerSelection) {
      // Ignore removal if ticker selection is disabled
      return;
    }
    setSelectedStocks(selectedStocks.filter(s => s !== stock));
  };

  const handleStockInputChange = (value: string) => {
    setStockInput(value);
    setShowStockSuggestions(true);
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

  // Load stock list from backend on mount
  useEffect(() => {
    loadStockList();
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
  }, [selectedBrokers, selectedStocks, startDate, endDate]);


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


  // No need to load stocks from API anymore - using static list

  // Update selectedStocks when prop changes
  // If disableTickerSelection is true, always force selectedStocks to match propSelectedStock
  useEffect(() => {
    if (disableTickerSelection && propSelectedStock) {
      // Force to use only propSelectedStock
      setSelectedStocks([propSelectedStock]);
    } else if (propSelectedStock && !selectedStocks.includes(propSelectedStock)) {
      setSelectedStocks([propSelectedStock]);
    }
  }, [propSelectedStock, selectedStocks, disableTickerSelection]);

  // Save preferences to localStorage with debounce to reduce write operations
  useEffect(() => {
    const timeout = setTimeout(() => {
      const preferences: Partial<UserPreferences> = {
        selectedStocks,
        selectedBrokers,
        invFilter,
        boardFilter,
        showFrequency,
        showOrdColumns,
      };
      // Only include dates if they have values
      if (startDate) {
        preferences.startDate = startDate;
      }
      if (endDate) {
        preferences.endDate = endDate;
      }
      savePreferences(preferences);
    }, 500); // Debounce 500ms to reduce localStorage writes

    return () => clearTimeout(timeout);
  }, [selectedStocks, selectedBrokers, invFilter, boardFilter, showFrequency, showOrdColumns, startDate, endDate]);

  // Auto-load data from saved preferences on mount (after initial data is loaded)
  useEffect(() => {
    // Only auto-load if we have saved preferences with dates
    if (!savedPrefs?.startDate || !savedPrefs?.endDate) {
      return; // No saved preferences, don't auto-load
    }

    const savedStartDate = savedPrefs.startDate;
    const savedEndDate = savedPrefs.endDate;

    // Wait a bit to ensure initial data (stocks, brokers) are loaded
    const timer = setTimeout(() => {
      // Generate date array from saved startDate and endDate (only trading days)
      const startParts = savedStartDate.split('-').map(Number);
      const endParts = savedEndDate.split('-').map(Number);

      if (startParts.length === 3 && endParts.length === 3) {
        const startYear = startParts[0];
        const startMonth = startParts[1];
        const startDay = startParts[2];
        const endYear = endParts[0];
        const endMonth = endParts[1];
        const endDay = endParts[2];

        if (startYear !== undefined && startMonth !== undefined && startDay !== undefined &&
          endYear !== undefined && endMonth !== undefined && endDay !== undefined) {
          const start = new Date(startYear, startMonth - 1, startDay);
          const end = new Date(endYear, endMonth - 1, endDay);

          // Check if range is valid
          if (start <= end) {
            // Generate date array (only trading days)
            const dateArray: string[] = [];
            const currentDate = new Date(start);

            while (currentDate <= end) {
              const dayOfWeek = currentDate.getDay();
              // Skip weekends (Saturday = 6, Sunday = 0)
              if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                // Format as YYYY-MM-DD in local timezone
                const year = currentDate.getFullYear();
                const month = String(currentDate.getMonth() + 1).padStart(2, '0');
                const day = String(currentDate.getDate()).padStart(2, '0');
                const dateString = `${year}-${month}-${day}`;
                dateArray.push(dateString);
              }
              // Move to next day
              currentDate.setDate(currentDate.getDate() + 1);
            }

            // Sort by date (oldest first) for display
            const datesToUse = dateArray.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

            // Update selectedDates
            setSelectedDates(datesToUse);

            // Trigger auto-load by setting shouldFetchData to true
            setShouldFetchData(true);
          }
        }
      }
    }, 500); // Small delay to ensure initial data is loaded

    return () => clearTimeout(timer);
  }, []); // Only run once on mount

  // Fetch data when shouldFetchData is true
  useEffect(() => {
    const fetchData = async () => {
      if (!shouldFetchData) {
        return;
      }

      if (selectedStocks.length === 0 || selectedDates.length === 0) {
        console.log('Skipping fetch - missing stocks or dates:', { selectedStocks, selectedDates });
        setShouldFetchData(false);
        return;
      }

      console.log('Starting to fetch data for:', { selectedStocks, selectedDates, selectedBrokers, invFilter, boardFilter });
      setLoading(true);
      setError(null);
      setIsDataReady(false);

      try {
        // Determine fd parameter: if empty, use 'all', otherwise use lowercase
        const fdParam = invFilter === '' ? 'all' : invFilter.toLowerCase();
        // Determine board parameter: if empty (All), use empty string (files without suffix), otherwise use lowercase
        // Blob storage naming: BBCA_20241227.csv (all), BBCA_20241227_RG.csv (RG), etc.
        const boardParam = boardFilter === '' ? '' : boardFilter.toLowerCase();

        // Determine brokers to fetch: if empty, use 'All', otherwise fetch all selected brokers
        const brokersToFetch = selectedBrokers.length === 0 ? ['All'] : selectedBrokers;

        console.log('API parameters:', { brokersToFetch, fdParam, boardParam });

        // Fetch broker breakdown data for all selected stocks, dates and brokers
        const allPromises: Array<{ stock: string; date: string; broker: string; promise: Promise<any> }> = [];

        selectedStocks.forEach(stock => {
          selectedDates.forEach(date => {
            brokersToFetch.forEach(broker => {
              allPromises.push({
                stock,
                date,
                broker,
                promise: api.getDoneSummaryBrokerBreakdown(stock, date, broker, fdParam, boardParam)
              });
            });
          });
        });

        const allResults = await Promise.allSettled(allPromises.map(p => p.promise));

        // Store raw data per stock, date and broker
        const rawDataByStockDateAndBroker: { [stock: string]: { [date: string]: { [broker: string]: any[] } } } = {};

        allResults.forEach((result, index) => {
          const promiseData = allPromises[index];
          if (!promiseData) return;

          const { stock, date, broker } = promiseData;
          if (!stock || !date) return;

          if (!rawDataByStockDateAndBroker[stock]) {
            rawDataByStockDateAndBroker[stock] = {};
          }
          if (!rawDataByStockDateAndBroker[stock][date]) {
            rawDataByStockDateAndBroker[stock][date] = {};
          }

          if (result.status === 'fulfilled' && result.value.success && result.value.data?.records) {
            rawDataByStockDateAndBroker[stock][date][broker] = result.value.data.records;
          } else {
            rawDataByStockDateAndBroker[stock][date][broker] = [];
          }
        });

        // Aggregate data from all brokers per stock and date
        const newPriceDataByStockAndDate: { [stock: string]: { [date: string]: PriceData[] } } = {};

        selectedStocks.forEach(stock => {
          newPriceDataByStockAndDate[stock] = {};

          selectedDates.forEach(date => {
            const brokerDataMap = rawDataByStockDateAndBroker[stock]?.[date] || {};

            // Aggregate data from all brokers by price level
            const aggregatedByPrice = new Map<number, {
              bFreq: number;
              bLot: number;
              bOrd: number;
              sLot: number;
              sFreq: number;
              sOrd: number;
            }>();

            // Collect all prices first to preserve order
            const allPrices = new Set<number>();

            // Process data from each broker
            Object.entries(brokerDataMap).forEach(([_broker, records]) => {
              if (!Array.isArray(records)) return;

              records.forEach((row: any) => {
                const price = Number(row.Price) || 0;
                if (price === 0) return;

                allPrices.add(price);

                if (!aggregatedByPrice.has(price)) {
                  aggregatedByPrice.set(price, {
                    bFreq: 0,
                    bLot: 0,
                    bOrd: 0,
                    sLot: 0,
                    sFreq: 0,
                    sOrd: 0
                  });
                }

                const priceData = aggregatedByPrice.get(price)!;

                // Aggregate buy side - sum all values from all brokers
                priceData.bFreq += Number(row.BFreq) || 0;
                priceData.bLot += Number(row.BLot) || 0;
                priceData.bOrd += Number(row.BOrd) || 0;

                // Aggregate sell side - sum all values from all brokers
                priceData.sLot += Number(row.SLot) || 0;
                priceData.sFreq += Number(row.SFreq) || 0;
                priceData.sOrd += Number(row.SOrd) || 0;
              });
            });

            // Convert aggregated data to PriceData format
            // Sort prices in descending order (highest first)
            const sortedPrices = Array.from(allPrices).sort((a, b) => b - a);

            const priceData: PriceData[] = sortedPrices.map(price => {
              const agg = aggregatedByPrice.get(price)!;
              const tFreq = agg.bFreq + agg.sFreq;
              const tLot = agg.bLot + agg.sLot;
              const tOrd = agg.bOrd + agg.sOrd;

              return {
                price,
                bFreq: agg.bFreq,
                bLot: agg.bLot,
                bOrd: agg.bOrd,
                sLot: agg.sLot,
                sFreq: agg.sFreq,
                sOrd: agg.sOrd,
                tFreq,
                tLot,
                tOrd
              };
            });

            if (!newPriceDataByStockAndDate[stock]) {
              newPriceDataByStockAndDate[stock] = {};
            }
            newPriceDataByStockAndDate[stock][date] = priceData;
          });
        });

        setPriceDataByStockAndDate(newPriceDataByStockAndDate);
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
  }, [shouldFetchData, selectedStocks, selectedDates, selectedBrokers, invFilter, boardFilter, showToast]);


  const formatDisplayDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
  };



  const renderHorizontalSummaryView = (stock: string) => {
    const stockPriceDataByDate = priceDataByStockAndDate[stock] || {};

    console.log('Rendering summary view for stock:', stock, {
      selectedDates,
      stockPriceDataByDate,
      stockPriceDataByDateKeys: Object.keys(stockPriceDataByDate)
    });

    const allPrices = getAllUniquePrices(stock, selectedDates, stockPriceDataByDate);
    console.log('All prices found:', allPrices);

    const maxValues = findMaxValuesHorizontal(stock, selectedDates, stockPriceDataByDate);
    console.log('Max values:', maxValues);

    // Calculate column span based on showFrequency and showOrdColumns
    // Base columns: Price, BLot, SLot, TLot = 4
    // Optional: BFreq, BLot/F (2), SFreq, SLot/F (2), TFreq (1) = 5 (if showFrequency)
    // Optional: BLot/BOr, BOr (2), SOr, SLot/SOr (2), TOr (1) = 5 (if showOrdColumns)
    const baseCols = 4;
    const freqCols = showFrequency ? 5 : 0;
    const ordCols = showOrdColumns ? 5 : 0;
    const colSpan = baseCols + freqCols + ordCols;

    return (
      <Card key={stock}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ChevronDown className="w-5 h-5" />
            {selectedBrokers.length > 0
              ? `${stock} - ${selectedBrokers.join(', ')}`
              : stock}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <div className="min-w-full px-4 sm:px-0 pb-4">
              {/* Ticker label at top left of table */}
              <div className="mb-2">
                <span className="text-sm font-semibold text-foreground">{stock}</span>
              </div>
              <table className="w-full text-[12px] border-collapse" style={{ tableLayout: 'auto', width: 'auto' }}>
                <thead>
                  {/* Main Header Row - Dates */}
                  <tr className="border-t-2 border-white bg-[#3a4252]">
                    {selectedDates.map((date, dateIndex) => (
                      <th key={date} colSpan={colSpan} className={`text-center py-[1px] px-[8.24px] font-bold text-white whitespace-nowrap ${dateIndex === 0 ? 'border-l-2 border-white' : ''} ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`}>
                        {formatDisplayDate(date)}
                      </th>
                    ))}
                    <th colSpan={colSpan} className={`text-center py-[1px] px-[4.2px] font-bold text-white border-r-2 border-white ${selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`}>
                      Total
                    </th>
                  </tr>
                  {/* Sub Header Row - Metrics */}
                  <tr className="bg-[#3a4252]">
                    {selectedDates.map((date, dateIndex) => (
                      <React.Fragment key={date}>
                        <th className={`text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`}>Price</th>
                        {showOrdColumns && (
                          <>
                            <th className="text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap">BLot/BOr</th>
                            <th className="text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap">BOr</th>
                          </>
                        )}
                        {showFrequency && <th className="text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap">BLot/F</th>}
                        {showFrequency && <th className="text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap">BFreq</th>}
                        <th className="text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap">BLot</th>
                        <th className="text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap">SLot</th>
                        {showFrequency && <th className="text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap">SFreq</th>}
                        {showFrequency && <th className="text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap">SLot/F</th>}
                        {showOrdColumns && (
                          <>
                            <th className="text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap">SOr</th>
                            <th className="text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap">SLot/SOr</th>
                          </>
                        )}
                        {showFrequency && <th className="text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap">TFreq</th>}
                        <th className={`text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap ${!showOrdColumns && dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${!showOrdColumns && dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`}>TLot</th>
                        {showOrdColumns && (
                          <th className={`text-center py-[1px] px-[6px] font-bold text-white whitespace-nowrap ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`}>TOr</th>
                        )}
                      </React.Fragment>
                    ))}
                    <th className={`text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap ${selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`}>Price</th>
                    {showOrdColumns && (
                      <>
                        <th className="text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap">BLot/BOr</th>
                        <th className="text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap">BOr</th>
                      </>
                    )}
                    {showFrequency && <th className="text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap">BLot/F</th>}
                    {showFrequency && <th className="text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap">BFreq</th>}
                    <th className="text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap">BLot</th>
                    <th className="text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap">SLot</th>
                    {showFrequency && <th className="text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap">SFreq</th>}
                    {showFrequency && <th className="text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap">SLot/F</th>}
                    {showOrdColumns && (
                      <>
                        <th className="text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap">SOr</th>
                        <th className="text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap">SLot/SOr</th>
                      </>
                    )}
                    {showFrequency && <th className="text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap">TFreq</th>}
                    {showOrdColumns ? (
                      <>
                        <th className="text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap">TLot</th>
                        <th className="text-center py-[1px] px-[7px] font-bold text-white whitespace-nowrap border-r-2 border-white">TOr</th>
                      </>
                    ) : (
                      <th className="text-center py-[1px] px-[7px] font-bold text-white whitespace-nowrap border-r-2 border-white">TLot</th>
                    )}
                  </tr>
                </thead>
                <tbody className="text-[12px]">
                  {allPrices.map((price, priceIndex) => {
                    return (
                      <tr key={price} className={`hover:bg-accent/50 ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`}>
                        {selectedDates.map((date, dateIndex) => {
                          // Get data for this specific date and price (only if exists in CSV for this date)
                          const dateData = stockPriceDataByDate[date] || [];
                          const data = dateData.find(item => item.price === price) || null;

                          // If no data for this price in this date, show empty cells
                          if (!data) {
                            return (
                              <React.Fragment key={date}>
                                <td className={`text-center py-[1px] px-[6px] font-bold text-white ${dateIndex === 0 ? 'border-l-2 border-white' : ''} ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                  -
                                </td>
                                {showOrdColumns && (
                                  <>
                                    <td className={`text-right py-[1px] px-[6px] font-bold text-white ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>-</td>
                                    <td className={`text-right py-[1px] px-[6px] font-bold text-white ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>-</td>
                                  </>
                                )}
                                {showFrequency && <td className={`text-right py-[1px] px-[6px] font-bold text-white ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>-</td>}
                                {showFrequency && <td className={`text-right py-[1px] px-[6px] font-bold text-white ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>-</td>}
                                <td className={`text-right py-[1px] px-[6px] font-bold text-white ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>-</td>
                                <td className={`text-right py-[1px] px-[6px] font-bold text-white ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>-</td>
                                {showFrequency && <td className={`text-right py-[1px] px-[6px] font-bold text-white ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>-</td>}
                                {showFrequency && <td className={`text-right py-[1px] px-[6px] font-bold text-white ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>-</td>}
                                {showOrdColumns && (
                                  <>
                                    <td className={`text-right py-[1px] px-[6px] font-bold text-white ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>-</td>
                                    <td className={`text-right py-[1px] px-[6px] font-bold text-white ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>-</td>
                                  </>
                                )}
                                {showFrequency && <td className={`text-right py-[1px] px-[6px] font-bold text-white ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>-</td>}
                                <td className={`text-right py-[1px] px-[6px] font-bold text-white ${!showOrdColumns && dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${!showOrdColumns && dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>-</td>
                                {showOrdColumns && (
                                  <td className={`text-right py-[1px] px-[6px] font-bold text-white ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>-</td>
                                )}
                              </React.Fragment>
                            );
                          }

                          return (
                            <React.Fragment key={date}>
                              {/* Price */}
                              <td className={`text-center py-[1px] px-[6px] font-bold text-white ${dateIndex === 0 ? 'border-l-2 border-white' : ''} ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {formatNumber(price)}
                              </td>
                              {/* BLot/BOr */}
                              {showOrdColumns && (
                                <>
                                  <td className={`text-right py-[1px] px-[6px] font-bold ${data && data.bOrd > 0 && data.sOrd > 0 ? getComparisonColor(data.bLot / data.bOrd, data.sLot / data.sOrd, true) : 'text-white'} ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {data ? formatRatio(data.bLot, data.bOrd) : '-'}
                                  </td>
                                  {/* BOr */}
                                  <td className={`text-right py-[1px] px-[6px] font-bold ${data ? getComparisonColor(data.bOrd, data.sOrd, true) : 'text-white'} ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {data ? formatNumberWithAbbreviation(data.bOrd) : '-'}
                                  </td>
                                </>
                              )}
                              {/* BLot/Freq */}
                              {showFrequency && (
                                <td className={`text-right py-[1px] px-[6px] font-bold ${data && data.bFreq > 0 && data.sFreq > 0 ? getComparisonColor(data.bLot / data.bFreq, data.sLot / data.sFreq, true) : 'text-white'} ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                  {data ? formatRatio(data.bLot, data.bFreq) : '-'}
                                </td>
                              )}
                              {/* BFreq */}
                              {showFrequency && (
                                <td className={`text-right py-[1px] px-[6px] font-bold ${data ? getComparisonColor(data.bFreq, data.sFreq, true) : 'text-white'} ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                  {data ? formatNumberWithAbbreviation(data.bFreq) : '-'}
                                </td>
                              )}
                              {/* BLot */}
                              <td className={`text-right py-[1px] px-[6px] font-bold text-white ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {data ? formatNumberWithAbbreviation(data.bLot) : '-'}
                              </td>
                              {/* SLot */}
                              <td className={`text-right py-[1px] px-[6px] font-bold text-white ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {data ? formatNumberWithAbbreviation(data.sLot) : '-'}
                              </td>
                              {/* SFreq */}
                              {showFrequency && (
                                <td className={`text-right py-[1px] px-[6px] font-bold ${data ? getComparisonColor(data.bFreq, data.sFreq, false) : 'text-white'} ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                  {data ? formatNumberWithAbbreviation(data.sFreq) : '-'}
                                </td>
                              )}
                              {/* SLot/Freq */}
                              {showFrequency && (
                                <td className={`text-right py-[1px] px-[6px] font-bold ${data && data.bFreq > 0 && data.sFreq > 0 ? getComparisonColor(data.bLot / data.bFreq, data.sLot / data.sFreq, false) : 'text-white'} ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                  {data ? formatRatio(data.sLot, data.sFreq) : '-'}
                                </td>
                              )}
                              {/* SOr */}
                              {showOrdColumns && (
                                <>
                                  <td className={`text-right py-[1px] px-[6px] font-bold ${data ? getComparisonColor(data.bOrd, data.sOrd, false) : 'text-white'} ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {data ? formatNumberWithAbbreviation(data.sOrd) : '-'}
                                  </td>
                                  {/* SLot/SOr */}
                                  <td className={`text-right py-[1px] px-[6px] font-bold ${data && data.bOrd > 0 && data.sOrd > 0 ? getComparisonColor(data.bLot / data.bOrd, data.sLot / data.sOrd, false) : 'text-white'} ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {data ? formatRatio(data.sLot, data.sOrd) : '-'}
                                  </td>
                                </>
                              )}
                              {/* TFreq */}
                              {showFrequency && (
                                <td className={`text-right py-[1px] px-[6px] font-bold text-white ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                  {data ? formatNumberWithAbbreviation(data.tFreq) : '-'}
                                </td>
                              )}
                              {/* TLot */}
                              <td className={`text-right py-[1px] px-[6px] font-bold text-white ${!showOrdColumns && dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${!showOrdColumns && dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {data ? formatNumberWithAbbreviation(data.tLot) : '-'}
                              </td>
                              {/* TOr */}
                              {showOrdColumns && (
                                <td className={`text-right py-[1px] px-[6px] font-bold text-white ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                  {data ? formatNumberWithAbbreviation(data.tOrd) : '-'}
                                </td>
                              )}
                            </React.Fragment>
                          );
                        })}
                        {/* Grand Total Column for each row */}
                        {(() => {
                          const totalBFreq = selectedDates.reduce((sum, date) => {
                            const data = getDataForPriceAndDate(stock, date, price, stockPriceDataByDate);
                            return sum + (data?.bFreq || 0);
                          }, 0);
                          const totalSFreq = selectedDates.reduce((sum, date) => {
                            const data = getDataForPriceAndDate(stock, date, price, stockPriceDataByDate);
                            return sum + (data?.sFreq || 0);
                          }, 0);
                          const totalBLot = selectedDates.reduce((sum, date) => {
                            const data = getDataForPriceAndDate(stock, date, price, stockPriceDataByDate);
                            return sum + (data?.bLot || 0);
                          }, 0);
                          const totalSLot = selectedDates.reduce((sum, date) => {
                            const data = getDataForPriceAndDate(stock, date, price, stockPriceDataByDate);
                            return sum + (data?.sLot || 0);
                          }, 0);
                          const totalBOrd = selectedDates.reduce((sum, date) => {
                            const data = getDataForPriceAndDate(stock, date, price, stockPriceDataByDate);
                            return sum + (data?.bOrd || 0);
                          }, 0);
                          const totalSOrd = selectedDates.reduce((sum, date) => {
                            const data = getDataForPriceAndDate(stock, date, price, stockPriceDataByDate);
                            return sum + (data?.sOrd || 0);
                          }, 0);
                          const totalBLotPerFreq = totalBFreq > 0 ? totalBLot / totalBFreq : 0;
                          const totalSLotPerFreq = totalSFreq > 0 ? totalSLot / totalSFreq : 0;
                          const totalBLotPerOrd = totalBOrd > 0 ? totalBLot / totalBOrd : 0;
                          const totalSLotPerOrd = totalSOrd > 0 ? totalSLot / totalSOrd : 0;

                          return (
                            <>
                              <td className={`text-center py-[1px] px-[5px] font-bold text-white ${selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'} ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {formatNumber(price)}
                              </td>
                              {showOrdColumns && (
                                <>
                                  <td className={`text-right py-[1px] px-[5px] font-bold ${totalBOrd > 0 && totalSOrd > 0 ? getComparisonColor(totalBLotPerOrd, totalSLotPerOrd, true) : 'text-white'} ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {formatRatio(totalBLot, totalBOrd)}
                                  </td>
                                  <td className={`text-right py-[1px] px-[5px] font-bold ${getComparisonColor(totalBOrd, totalSOrd, true)} ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {formatNumberWithAbbreviation(totalBOrd)}
                                  </td>
                                </>
                              )}
                              {showFrequency && (
                                <td className={`text-right py-[1px] px-[5px] font-bold ${totalBFreq > 0 && totalSFreq > 0 ? getComparisonColor(totalBLotPerFreq, totalSLotPerFreq, true) : 'text-white'} ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                  {formatRatio(totalBLot, totalBFreq)}
                                </td>
                              )}
                              {showFrequency && (
                                <td className={`text-right py-[1px] px-[5px] font-bold ${getComparisonColor(totalBFreq, totalSFreq, true)} ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                  {formatNumberWithAbbreviation(totalBFreq)}
                                </td>
                              )}
                              <td className={`text-right py-[1px] px-[5px] font-bold text-white ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {formatNumberWithAbbreviation(totalBLot)}
                              </td>
                              <td className={`text-right py-[1px] px-[5px] font-bold text-white ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {formatNumberWithAbbreviation(totalSLot)}
                              </td>
                              {showFrequency && (
                                <td className={`text-right py-[1px] px-[5px] font-bold ${getComparisonColor(totalBFreq, totalSFreq, false)} ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                  {formatNumberWithAbbreviation(totalSFreq)}
                                </td>
                              )}
                              {showFrequency && (
                                <td className={`text-right py-[1px] px-[5px] font-bold ${totalBFreq > 0 && totalSFreq > 0 ? getComparisonColor(totalBLotPerFreq, totalSLotPerFreq, false) : 'text-white'} ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                  {formatRatio(totalSLot, totalSFreq)}
                                </td>
                              )}
                              {showOrdColumns && (
                                <>
                                  <td className={`text-right py-[1px] px-[5px] font-bold ${getComparisonColor(totalBOrd, totalSOrd, false)} ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {formatNumberWithAbbreviation(totalSOrd)}
                                  </td>
                                  <td className={`text-right py-[1px] px-[5px] font-bold ${totalBOrd > 0 && totalSOrd > 0 ? getComparisonColor(totalBLotPerOrd, totalSLotPerOrd, false) : 'text-white'} ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {formatRatio(totalSLot, totalSOrd)}
                                  </td>
                                </>
                              )}
                              {showFrequency && (
                                <td className={`text-right py-[1px] px-[5px] font-bold text-white ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                  {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                                    const data = getDataForPriceAndDate(stock, date, price, stockPriceDataByDate);
                                    return sum + (data?.tFreq || 0);
                                  }, 0))}
                                </td>
                              )}
                              {showOrdColumns ? (
                                <>
                                  <td className={`text-right py-[1px] px-[5px] font-bold text-white ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                                      const data = getDataForPriceAndDate(stock, date, price, stockPriceDataByDate);
                                      return sum + (data?.tLot || 0);
                                    }, 0))}
                                  </td>
                                  <td className={`text-right py-[1px] px-[7px] font-bold text-white border-r-2 border-white ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                                      const data = getDataForPriceAndDate(stock, date, price, stockPriceDataByDate);
                                      return sum + (data?.tOrd || 0);
                                    }, 0))}
                                  </td>
                                </>
                              ) : (
                                <td className={`text-right py-[1px] px-[7px] font-bold text-white border-r-2 border-white ${priceIndex === allPrices.length - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                  {formatNumberWithAbbreviation(selectedDates.reduce((sum, date) => {
                                    const data = getDataForPriceAndDate(stock, date, price, stockPriceDataByDate);
                                    return sum + (data?.tLot || 0);
                                  }, 0))}
                                </td>
                              )}
                            </>
                          );
                        })()}
                      </tr>
                    );
                  }).filter(Boolean)}
                  {/* Total Row */}
                  <tr className="border-t-2 border-b-2 border-white font-bold">
                    {selectedDates.map((date, dateIndex) => {
                      const dateData = stockPriceDataByDate[date] || [];
                      const totals = calculateTotals(dateData);
                      return (
                        <React.Fragment key={date}>
                          {/* Price - empty for Total row */}
                          <td className={`text-center py-[1px] px-[6px] font-bold text-white ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`}>
                            -
                          </td>
                          {/* BLot/BOr */}
                          {showOrdColumns && (
                            <>
                              <td className={`text-right py-[1px] px-[6px] font-bold ${totals.bOrd > 0 && totals.sOrd > 0 ? getComparisonColor(totals.bLot / totals.bOrd, totals.sLot / totals.sOrd, true) : 'text-white'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {formatRatio(totals.bLot, totals.bOrd)}
                              </td>
                              {/* BOr */}
                              <td className={`text-right py-[1px] px-[6px] font-bold ${getComparisonColor(totals.bOrd, totals.sOrd, true)}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {formatNumberWithAbbreviation(totals.bOrd)}
                              </td>
                            </>
                          )}
                          {/* BLot/Freq */}
                          {showFrequency && (
                            <td className={`text-right py-[1px] px-[6px] font-bold ${totals.bFreq > 0 && totals.sFreq > 0 ? getComparisonColor(totals.bLot / totals.bFreq, totals.sLot / totals.sFreq, true) : 'text-white'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {formatRatio(totals.bLot, totals.bFreq)}
                            </td>
                          )}
                          {/* BFreq */}
                          {showFrequency && (
                            <td className={`text-right py-[1px] px-[6px] font-bold ${getComparisonColor(totals.bFreq, totals.sFreq, true)}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {formatNumberWithAbbreviation(totals.bFreq)}
                            </td>
                          )}
                          {/* BLot */}
                          <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {formatNumberWithAbbreviation(totals.bLot)}
                          </td>
                          {/* SLot */}
                          <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {formatNumberWithAbbreviation(totals.sLot)}
                          </td>
                          {/* SFreq */}
                          {showFrequency && (
                            <td className={`text-right py-[1px] px-[6px] font-bold ${getComparisonColor(totals.bFreq, totals.sFreq, false)}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {formatNumberWithAbbreviation(totals.sFreq)}
                            </td>
                          )}
                          {/* SLot/Freq */}
                          {showFrequency && (
                            <td className={`text-right py-[1px] px-[6px] font-bold ${totals.bFreq > 0 && totals.sFreq > 0 ? getComparisonColor(totals.bLot / totals.bFreq, totals.sLot / totals.sFreq, false) : 'text-white'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {formatRatio(totals.sLot, totals.sFreq)}
                            </td>
                          )}
                          {/* SOr */}
                          {showOrdColumns && (
                            <>
                              <td className={`text-right py-[1px] px-[6px] font-bold ${getComparisonColor(totals.bOrd, totals.sOrd, false)}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {formatNumberWithAbbreviation(totals.sOrd)}
                              </td>
                              {/* SLot/SOr */}
                              <td className={`text-right py-[1px] px-[6px] font-bold ${totals.bOrd > 0 && totals.sOrd > 0 ? getComparisonColor(totals.bLot / totals.bOrd, totals.sLot / totals.sOrd, false) : 'text-white'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {formatRatio(totals.sLot, totals.sOrd)}
                              </td>
                            </>
                          )}
                          {/* TFreq */}
                          {showFrequency && (
                            <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {formatNumberWithAbbreviation(totals.tFreq)}
                            </td>
                          )}
                          {/* TLot */}
                          <td className={`text-right py-[1px] px-[6px] font-bold text-white ${!showOrdColumns && dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${!showOrdColumns && dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {formatNumberWithAbbreviation(totals.tLot)}
                          </td>
                          {/* TOr */}
                          {showOrdColumns && (
                            <td className={`text-right py-[1px] px-[6px] font-bold text-white ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {formatNumberWithAbbreviation(totals.tOrd)}
                            </td>
                          )}
                        </React.Fragment>
                      );
                    })}
                    {/* Grand Total Column */}
                    {(() => {
                      const grandTotalBFreq = selectedDates.reduce((sum, date) => {
                        const dateData = stockPriceDataByDate[date] || [];
                        const totals = calculateTotals(dateData);
                        return sum + totals.bFreq;
                      }, 0);
                      const grandTotalSFreq = selectedDates.reduce((sum, date) => {
                        const dateData = stockPriceDataByDate[date] || [];
                        const totals = calculateTotals(dateData);
                        return sum + totals.sFreq;
                      }, 0);
                      const grandTotalBLot = selectedDates.reduce((sum, date) => {
                        const dateData = stockPriceDataByDate[date] || [];
                        const totals = calculateTotals(dateData);
                        return sum + totals.bLot;
                      }, 0);
                      const grandTotalSLot = selectedDates.reduce((sum, date) => {
                        const dateData = stockPriceDataByDate[date] || [];
                        const totals = calculateTotals(dateData);
                        return sum + totals.sLot;
                      }, 0);
                      const grandTotalBOrd = selectedDates.reduce((sum, date) => {
                        const dateData = stockPriceDataByDate[date] || [];
                        const totals = calculateTotals(dateData);
                        return sum + totals.bOrd;
                      }, 0);
                      const grandTotalSOrd = selectedDates.reduce((sum, date) => {
                        const dateData = stockPriceDataByDate[date] || [];
                        const totals = calculateTotals(dateData);
                        return sum + totals.sOrd;
                      }, 0);
                      const grandTotalBLotPerFreq = grandTotalBFreq > 0 ? grandTotalBLot / grandTotalBFreq : 0;
                      const grandTotalSLotPerFreq = grandTotalSFreq > 0 ? grandTotalSLot / grandTotalSFreq : 0;
                      const grandTotalBLotPerOrd = grandTotalBOrd > 0 ? grandTotalBLot / grandTotalBOrd : 0;
                      const grandTotalSLotPerOrd = grandTotalSOrd > 0 ? grandTotalSLot / grandTotalSOrd : 0;
                      const grandTotalTFreq = selectedDates.reduce((sum, date) => {
                        const dateData = stockPriceDataByDate[date] || [];
                        const totals = calculateTotals(dateData);
                        return sum + totals.tFreq;
                      }, 0);
                      const grandTotalTLot = selectedDates.reduce((sum, date) => {
                        const dateData = stockPriceDataByDate[date] || [];
                        const totals = calculateTotals(dateData);
                        return sum + totals.tLot;
                      }, 0);
                      const grandTotalTOrd = selectedDates.reduce((sum, date) => {
                        const dateData = stockPriceDataByDate[date] || [];
                        const totals = calculateTotals(dateData);
                        return sum + totals.tOrd;
                      }, 0);

                      return (
                        <>
                          <td className={`text-center py-[1px] px-[5px] font-bold text-white ${selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`}>
                            TOTAL
                          </td>
                          {showOrdColumns && (
                            <>
                              <td className={`text-right py-[1px] px-[5px] font-bold ${grandTotalBOrd > 0 && grandTotalSOrd > 0 ? getComparisonColor(grandTotalBLotPerOrd, grandTotalSLotPerOrd, true) : 'text-white'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {formatRatio(grandTotalBLot, grandTotalBOrd)}
                              </td>
                              <td className={`text-right py-[1px] px-[5px] font-bold ${getComparisonColor(grandTotalBOrd, grandTotalSOrd, true)}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {formatNumberWithAbbreviation(grandTotalBOrd)}
                              </td>
                            </>
                          )}
                          {showFrequency && (
                            <td className={`text-right py-[1px] px-[5px] font-bold ${grandTotalBFreq > 0 && grandTotalSFreq > 0 ? getComparisonColor(grandTotalBLotPerFreq, grandTotalSLotPerFreq, true) : 'text-white'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {formatRatio(grandTotalBLot, grandTotalBFreq)}
                            </td>
                          )}
                          {showFrequency && (
                            <td className={`text-right py-[1px] px-[5px] font-bold ${getComparisonColor(grandTotalBFreq, grandTotalSFreq, true)}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {formatNumberWithAbbreviation(grandTotalBFreq)}
                            </td>
                          )}
                          <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {formatNumberWithAbbreviation(grandTotalBLot)}
                          </td>
                          <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {formatNumberWithAbbreviation(grandTotalSLot)}
                          </td>
                          {showFrequency && (
                            <td className={`text-right py-[1px] px-[5px] font-bold ${getComparisonColor(grandTotalBFreq, grandTotalSFreq, false)}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {formatNumberWithAbbreviation(grandTotalSFreq)}
                            </td>
                          )}
                          {showFrequency && (
                            <td className={`text-right py-[1px] px-[5px] font-bold ${grandTotalBFreq > 0 && grandTotalSFreq > 0 ? getComparisonColor(grandTotalBLotPerFreq, grandTotalSLotPerFreq, false) : 'text-white'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {formatRatio(grandTotalSLot, grandTotalSFreq)}
                            </td>
                          )}
                          {showOrdColumns && (
                            <>
                              <td className={`text-right py-[1px] px-[5px] font-bold ${getComparisonColor(grandTotalBOrd, grandTotalSOrd, false)}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {formatNumberWithAbbreviation(grandTotalSOrd)}
                              </td>
                              <td className={`text-right py-[1px] px-[5px] font-bold ${grandTotalBOrd > 0 && grandTotalSOrd > 0 ? getComparisonColor(grandTotalBLotPerOrd, grandTotalSLotPerOrd, false) : 'text-white'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {formatRatio(grandTotalSLot, grandTotalSOrd)}
                              </td>
                            </>
                          )}
                          {showFrequency && (
                            <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {formatNumberWithAbbreviation(grandTotalTFreq)}
                            </td>
                          )}
                          {showOrdColumns ? (
                            <>
                              <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {formatNumberWithAbbreviation(grandTotalTLot)}
                              </td>
                              <td className={`text-right py-[1px] px-[7px] font-bold text-white border-r-2 border-white`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {formatNumberWithAbbreviation(grandTotalTOrd)}
                              </td>
                            </>
                          ) : (
                            <td className={`text-right py-[1px] px-[7px] font-bold text-white border-r-2 border-white`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {formatNumberWithAbbreviation(grandTotalTLot)}
                            </td>
                          )}
                        </>
                      );
                    })()}
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
      {/* On small/medium screens menu scrolls bersama konten. Hanya di layar besar (lg+) yang fixed di top. */}
      <div className="bg-[#0a0f20] border-b border-[#3a4252] px-4 py-1 lg:fixed lg:top-14 lg:left-20 lg:right-0 lg:z-40">
        <div ref={menuContainerRef} className="flex flex-col md:flex-row md:flex-wrap items-center gap-2 md:gap-x-7 md:gap-y-0.2">
          {/* Ticker Selection */}
          <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
            <label className="text-sm font-medium whitespace-nowrap">Ticker:</label>
            <div className="relative flex-1 md:flex-none" ref={dropdownRef}>
              {!disableTickerSelection && <Search className="absolute left-3 top-1/2 pointer-events-none -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />}
              {disableTickerSelection ? (
                <div className="w-full md:w-32 h-9 pl-3 pr-3 flex items-center text-sm border border-input rounded-md bg-muted text-foreground">
                  {propSelectedStock || selectedStocks[0] || 'No ticker selected'}
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    value={stockInput}
                    onChange={(e) => { handleStockInputChange(e.target.value); setHighlightedStockIndex(0); }}
                    onFocus={() => { setShowStockSuggestions(true); setHighlightedStockIndex(0); }}
                    onKeyDown={(e) => {
                      const availableSuggestions = stockInput === ''
                        ? STOCK_LIST.filter(s => !selectedStocks.includes(s))
                        : filteredStocks.filter(s => !selectedStocks.includes(s));
                      const suggestions = availableSuggestions.slice(0, 10);
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
                    placeholder={selectedStocks.length > 0 ? (selectedStocks.length === 1 ? selectedStocks[0] : selectedStocks.join(' | ')) : "Enter stock code..."}
                    className={`w-full md:w-32 h-9 pl-10 pr-3 text-sm border border-input rounded-md bg-background text-foreground ${selectedStocks.length > 0 ? 'placeholder:text-white' : ''}`}
                    role="combobox"
                    aria-expanded={showStockSuggestions}
                    aria-controls="stock-suggestions"
                    aria-autocomplete="list"
                  />
                  {showStockSuggestions && (
                    <div id="stock-suggestions" role="listbox" className="absolute top-full left-0 right-0 mt-1 bg-popover border border-[#3a4252] rounded-md shadow-lg z-50 max-h-96 overflow-hidden flex flex-col">
                      <>
                        {/* Selected Items Section */}
                        {selectedStocks.length > 0 && (
                          <div className="border-b border-[#3a4252] overflow-y-auto" style={{ minHeight: '120px', maxHeight: `${Math.min(selectedStocks.length * 24 + 30, 250)}px` }}>
                            <div className="px-3 py-1 text-xs text-muted-foreground sticky top-0 bg-popover flex items-center justify-between">
                              <span>Selected ({selectedStocks.length})</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedStocks([]);
                                }}
                                className="text-xs text-destructive hover:text-destructive/80 font-medium"
                              >
                                Clear
                              </button>
                            </div>
                            {selectedStocks.map(stock => (
                              <div
                                key={`selected-stock-${stock}`}
                                className="px-3 py-1 hover:bg-muted flex items-center justify-between min-h-[24px]"
                              >
                                <span className="text-sm text-primary">{stock}</span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveStock(stock);
                                  }}
                                  className="text-muted-foreground hover:text-destructive text-sm"
                                  aria-label={`Remove ${stock}`}
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Search Results Section */}
                        <div className="overflow-y-auto flex-1">
                          {stockInput === '' ? (
                            <>
                              <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252] sticky top-0 bg-popover">
                                Available Stocks ({STOCK_LIST.filter(s => !selectedStocks.includes(s)).length})
                              </div>
                              {STOCK_LIST.filter(s => !selectedStocks.includes(s)).slice(0, 20).map((stock, idx) => (
                                <div
                                  key={stock}
                                  onClick={() => handleStockSelect(stock)}
                                  className={`px-3 py-[2.06px] hover:bg-muted cursor-pointer text-sm ${idx === highlightedStockIndex ? 'bg-accent' : ''}`}
                                  onMouseEnter={() => setHighlightedStockIndex(idx)}
                                >
                                  {stock}
                                </div>
                              ))}
                              {STOCK_LIST.filter(s => !selectedStocks.includes(s)).length > 20 && (
                                <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-t border-[#3a4252]">
                                  ... and {STOCK_LIST.filter(s => !selectedStocks.includes(s)).length - 20} more stocks
                                </div>
                              )}
                            </>
                          ) : filteredStocks.filter(s => !selectedStocks.includes(s)).length > 0 ? (
                            <>
                              <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252] sticky top-0 bg-popover">
                                {filteredStocks.filter(s => !selectedStocks.includes(s)).length} stocks found
                              </div>
                              {filteredStocks.filter(s => !selectedStocks.includes(s)).slice(0, 20).map((stock, idx) => (
                                <div
                                  key={stock}
                                  onClick={() => handleStockSelect(stock)}
                                  className={`px-3 py-[2.06px] hover:bg-muted cursor-pointer text-sm ${idx === highlightedStockIndex ? 'bg-accent' : ''}`}
                                  onMouseEnter={() => setHighlightedStockIndex(idx)}
                                >
                                  {stock}
                                </div>
                              ))}
                              {filteredStocks.filter(s => !selectedStocks.includes(s)).length > 20 && (
                                <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-t border-[#3a4252]">
                                  ... and {filteredStocks.filter(s => !selectedStocks.includes(s)).length - 20} more results
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="px-3 py-[2.06px] text-sm text-muted-foreground">
                              No stocks found
                            </div>
                          )}
                        </div>
                      </>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Broker Selection - Multi-select with dropdown only */}
          <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
            <label className="text-sm font-medium whitespace-nowrap">Broker:</label>
            <div className="relative flex-1 md:flex-none" ref={dropdownBrokerRef}>
              <Search className="absolute left-3 top-1/2 pointer-events-none -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
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
                placeholder={selectedBrokers.length > 0 ? (selectedBrokers.length === 1 ? selectedBrokers[0] : selectedBrokers.join(' | ')) : "Add broker"}
                className={`w-full md:w-32 h-9 pl-10 pr-3 text-sm border border-input rounded-md bg-background text-foreground ${selectedBrokers.length > 0 ? 'placeholder:text-white' : ''}`}
                role="combobox"
                aria-expanded={showBrokerSuggestions}
                aria-controls="broker-suggestions"
                aria-autocomplete="list"
              />
              {showBrokerSuggestions && (
                <div id="broker-suggestions" role="listbox" className="absolute top-full left-0 right-0 mt-1 bg-popover border border-[#3a4252] rounded-md shadow-lg z-50 max-h-96 overflow-hidden flex flex-col">
                  {availableBrokers.length === 0 ? (
                    <div className="px-3 py-[2.06px] text-sm text-muted-foreground flex items-center">
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Loading brokers...
                    </div>
                  ) : (
                    <>
                      {/* Selected Items Section */}
                      {selectedBrokers.length > 0 && (
                        <div className="border-b border-[#3a4252] overflow-y-auto" style={{ minHeight: '120px', maxHeight: `${Math.min(selectedBrokers.length * 24 + 30, 250)}px` }}>
                          <div className="px-3 py-1 text-xs text-muted-foreground sticky top-0 bg-popover flex items-center justify-between">
                            <span>Selected ({selectedBrokers.length})</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedBrokers([]);
                              }}
                              className="text-xs text-destructive hover:text-destructive/80 font-medium"
                            >
                              Clear
                            </button>
                          </div>
                          {selectedBrokers.map(broker => (
                            <div
                              key={`selected-broker-${broker}`}
                              className="px-3 py-1 hover:bg-muted flex items-center justify-between min-h-[24px]"
                            >
                              <span className="text-sm text-primary">{broker}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveBroker(broker);
                                }}
                                className="text-muted-foreground hover:text-destructive text-sm"
                                aria-label={`Remove ${broker}`}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Search Results Section */}
                      <div className="overflow-y-auto flex-1">
                        {brokerInput === '' ? (
                          <>
                            <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252] sticky top-0 bg-popover">
                              Available Brokers ({availableBrokers.filter(b => !selectedBrokers.includes(b)).length})
                            </div>
                            {availableBrokers.filter(b => !selectedBrokers.includes(b)).map((broker, idx) => (
                              <div
                                key={broker}
                                onClick={() => handleBrokerSelect(broker)}
                                className={`px-3 py-[2.06px] hover:bg-muted cursor-pointer text-sm ${idx === highlightedBrokerIndex ? 'bg-accent' : ''}`}
                                onMouseEnter={() => setHighlightedBrokerIndex(idx)}
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
                              <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252] sticky top-0 bg-popover">
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
                    </>
                  )}
                </div>
              )}
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
                <div className="flex items-center gap-2 h-full px-3">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">
                    {startDate ? new Date(startDate).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric'
                    }) : 'DD/MM/YYYY'}
                  </span>
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
                <div className="flex items-center gap-2 h-full px-3">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">
                    {endDate ? new Date(endDate).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric'
                    }) : 'DD/MM/YYYY'}
                  </span>
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
              <option value="">All</option>
              <option value="RG">RG</option>
              <option value="TN">TN</option>
              <option value="NG">NG</option>
            </select>
          </div>

          {/* Frequency and Ord Toggles */}
          <div className="flex flex-col gap-1 items-start">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showFrequency}
                onChange={(e) => setShowFrequency(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-[#3a4252] text-primary focus:ring-primary cursor-pointer"
              />
              <span className="text-xs text-foreground whitespace-nowrap">Freq</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showOrdColumns}
                onChange={(e) => setShowOrdColumns(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-[#3a4252] text-primary focus:ring-primary cursor-pointer"
              />
              <span className="text-xs text-foreground whitespace-nowrap">Or</span>
            </label>
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
              setPriceDataByStockAndDate({});
              setIsDataReady(false);

              // Trigger fetch
              setShouldFetchData(true);
            }}
            disabled={loading || selectedStocks.length === 0 || !startDate || !endDate}
            className="h-9 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium whitespace-nowrap flex items-center justify-center w-full md:w-auto"
          >
            Show
          </button>
        </div>
      </div>

      {/* Spacer untuk header fixed - hanya dibutuhkan di layar besar (lg+) */}
      <div className={isMenuTwoRows ? "h-0 lg:h-[60px]" : "h-0 lg:h-[35px]"}></div>

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
      <div className="pt-2 space-y-6">
        {!loading && !error && isDataReady && selectedStocks.map(stock => renderHorizontalSummaryView(stock))}
      </div>
    </div>
  );
}
