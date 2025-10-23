import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Calendar, Plus, X, Grid3X3, ChevronDown, RotateCcw, Search, Loader2 } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { api } from '../../services/api';

interface DoneDetailData {
  STK_CODE: string;   // Stock code
  BRK_COD1: string;   // Buyer broker
  BRK_COD2: string;   // Seller broker
  STK_VOLM: number;   // Volume
  STK_PRIC: number;   // Price
  TRX_DATE: string;   // Transaction date
  TRX_TIME: number;   // Transaction time (as number like 85800)
  INV_TYP1: string;   // Buyer investor type
  INV_TYP2: string;   // Seller investor type
  TYP: string;        // Transaction type
  TRX_CODE: number;   // Transaction code
  TRX_SESS: number;   // Transaction session
  TRX_ORD1: number;   // Order 1
  TRX_ORD2: number;   // Order 2
  [key: string]: any; // Allow additional columns
}


// This will be replaced with API data

// Get last 3 trading days (weekdays only, excluding weekends)
const getLastThreeDays = (): string[] => {
  const dates: string[] = [];
  const today = new Date();
  let currentDate = new Date(today);

  // Start from today and go backwards
  while (dates.length < 3) {
    const dayOfWeek = currentDate.getDay();

    // Skip weekends (Saturday = 6, Sunday = 0)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      const dateString = currentDate.toISOString().split('T')[0];
      if (dateString) {
        dates.push(dateString);
      }
    }

    // Go to previous day
    currentDate.setDate(currentDate.getDate() - 1);

    // Safety check to prevent infinite loop
    if (dates.length === 0 && currentDate.getTime() < today.getTime() - (30 * 24 * 60 * 60 * 1000)) {
      const todayString = today.toISOString().split('T')[0];
      if (todayString) {
        dates.push(todayString);
      }
      break;
    }
  }

  return dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
};

// This will be replaced with real API data fetching

const formatNumber = (num: number): string => {
  return num.toLocaleString();
};

const formatTime = (timeNum: number): string => {
  // Convert number like 85800 to "08:58:00"
  const timeStr = timeNum.toString().padStart(6, '0');
  return `${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}:${timeStr.slice(4, 6)}`;
};

const formatDisplayDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
};


export function StockTransactionDoneDetail() {
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
  
  // Real data state
  const [availableStocks, setAvailableStocks] = useState<string[]>([]);
  const [doneDetailData, setDoneDetailData] = useState<Map<string, DoneDetailData[]>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [showStockSuggestions, setShowStockSuggestions] = useState(false);
  const [highlightedStockIndex, setHighlightedStockIndex] = useState<number>(-1);
  const [filters, setFilters] = useState({
    timeSort: 'latest',
    broker: 'all',
    price: 'all'
  });
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(100); // Limit to 100 items per page
  const [dateRangeMode, setDateRangeMode] = useState<'1day' | '3days' | '1week' | 'custom'>('3days');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [infoOpen, setInfoOpen] = useState(false); // collapsible info, default minimized
  const [stockSearchTimeout, setStockSearchTimeout] = useState<NodeJS.Timeout | null>(null);

  // Load initial data - only dates, no stocks until user selects
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Load available dates only
        const datesResult = await api.getBreakDoneTradeDates();
        if (datesResult.success && datesResult.data?.dates) {
          // Update selected dates to use real available dates
          const realDates = datesResult.data.dates.slice(0, 3); // Take first 3 dates
          setSelectedDates(realDates);
        }

      } catch (err) {
        console.error('Error loading initial data:', err);
        setError('Failed to load initial data');
        showToast({
          type: 'error',
          title: 'Error Memuat Data',
          message: 'Gagal memuat data awal.'
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialData();
  }, [showToast]);

  // Load available stocks when user starts typing or when dates change
  useEffect(() => {
    const loadAvailableStocks = async () => {
      if (selectedDates.length === 0) return;

      try {
        // Load stocks for the first selected date
        if (selectedDates[0]) {
          const stocksResult = await api.getBreakDoneTradeStocks(selectedDates[0]);
          if (stocksResult.success && stocksResult.data?.stocks) {
            setAvailableStocks(stocksResult.data.stocks);
          }
        }
      } catch (err) {
        console.error('Error loading available stocks:', err);
        // Don't show error toast for stocks loading, just log it
      }
    };

    loadAvailableStocks();
  }, [selectedDates]);

  // Load done detail data when stock or dates change
  useEffect(() => {
    const loadDoneDetailData = async () => {
      if (!selectedStock || selectedDates.length === 0) return;

      try {
        setIsLoading(true);
        setError(null);

        const result = await api.getBreakDoneTradeBatch(selectedStock, selectedDates);
        if (result.success && result.data?.dataByDate) {
          const newData = new Map<string, DoneDetailData[]>();
          Object.entries(result.data.dataByDate).forEach(([date, data]: [string, any]) => {
            if (data?.doneTradeData) {
              newData.set(date, data.doneTradeData);
            }
          });
          setDoneDetailData(newData);
        } else {
          setError('Failed to load done detail data');
        }

      } catch (err) {
        console.error('Error loading done detail data:', err);
        setError('Failed to load done detail data');
        showToast({
          type: 'error',
          title: 'Error Memuat Data',
          message: 'Gagal memuat data transaksi.'
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadDoneDetailData();
  }, [selectedStock, selectedDates, showToast]);

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

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (stockSearchTimeout) {
        clearTimeout(stockSearchTimeout);
      }
    };
  }, [stockSearchTimeout]);

  const handleStockSelect = (stock: string) => {
    setSelectedStock(stock);
    setStockInput(stock);
    setShowStockSuggestions(false);
  };

  const handleStockInputChange = (value: string) => {
    setStockInput(value);
    setShowStockSuggestions(true);

    // Clear previous timeout
    if (stockSearchTimeout) {
      clearTimeout(stockSearchTimeout);
    }

    // Set new timeout for debounced stock loading
    const timeout = setTimeout(async () => {
      // Load stocks if not already loaded and user is typing
      if (availableStocks.length === 0 && selectedDates.length > 0 && selectedDates[0]) {
        try {
          const stocksResult = await api.getBreakDoneTradeStocks(selectedDates[0]);
          if (stocksResult.success && stocksResult.data?.stocks) {
            setAvailableStocks(stocksResult.data.stocks);
          }
        } catch (err) {
          console.error('Error loading stocks:', err);
        }
      }
    }, 300); // 300ms debounce

    setStockSearchTimeout(timeout);

    // If exact match, select it
    if ((availableStocks || []).includes(value.toUpperCase())) {
      setSelectedStock(value.toUpperCase());
    }
  };

  const filteredStocks = (availableStocks || []).filter(stock =>
    stock.toLowerCase().includes(stockInput.toLowerCase())
  );

  // Filter and sort data based on selected filters
  const filterData = (data: DoneDetailData[]): DoneDetailData[] => {
    let filteredData = data.filter(transaction => {
      if (filters.broker !== 'all' && transaction.BRK_COD1 !== filters.broker && transaction.BRK_COD2 !== filters.broker) return false;
      if (filters.price !== 'all' && transaction.STK_PRIC.toString() !== filters.price) return false;
      return true;
    });

    // Sort by time
    if (filters.timeSort === 'latest') {
      filteredData.sort((a, b) => b.TRX_TIME - a.TRX_TIME);
    } else {
      filteredData.sort((a, b) => a.TRX_TIME - b.TRX_TIME);
    }

    return filteredData;
  };

  // Pagination logic
  const getPaginatedData = (data: DoneDetailData[]) => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return data.slice(startIndex, endIndex);
  };

  const getTotalPages = (data: DoneDetailData[]) => {
    return Math.ceil(data.length / itemsPerPage);
  };

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters, selectedStock, selectedDates]);

  // Get unique values for filter options
  const getUniqueValues = (field: keyof DoneDetailData): string[] => {
    const allData = selectedDates.flatMap(date => doneDetailData.get(date) || []);
    const uniqueValues = [...new Set(allData.map(item => String(item[field])))];
    return uniqueValues.sort();
  };

  const brokerOptions = [...new Set([
    ...getUniqueValues('BRK_COD1'),
    ...getUniqueValues('BRK_COD2')
  ])].sort();
  const priceOptions = getUniqueValues('STK_PRIC').sort((a, b) => parseInt(a) - parseInt(b));

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

      // Check if total dates would exceed 7
      if (sortedDates.length > 7) {
        showToast({
          type: 'warning',
          title: 'Terlalu Banyak Tanggal',
          message: 'Maksimal 7 tanggal yang bisa dipilih',
        });
        return;
      }

      setSelectedDates(sortedDates);
      // Switch to custom mode when user manually selects dates
      setDateRangeMode('custom');
      // Don't clear the date inputs - keep them for user reference
    }
  };

  const removeDate = (dateToRemove: string) => {
    if (selectedDates.length > 1) {
      setSelectedDates(selectedDates.filter(date => date !== dateToRemove));
      // Switch to custom mode when user manually removes dates
      setDateRangeMode('custom');
    }
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
        const dateString = currentDate.toISOString().split('T')[0];
        if (dateString) {
          dates.push(dateString);
        }
      }

      // Go to previous day
      currentDate.setDate(currentDate.getDate() - 1);

      // Safety check
      if (dates.length === 0 && currentDate.getTime() < today.getTime() - (30 * 24 * 60 * 60 * 1000)) {
        const todayString = today.toISOString().split('T')[0];
        if (todayString) {
          dates.push(todayString);
        }
        break;
      }
    }

    return dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
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


  // Render horizontal view - pivot-style comparison across dates with pagination
  const renderHorizontalView = () => {
    // Get all transactions for all selected dates
    const allTransactions: { [date: string]: DoneDetailData[] } = {};
    selectedDates.forEach(date => {
      const rawData = doneDetailData.get(date) || [];
      allTransactions[date] = filterData(rawData);
    });

    // Get all transactions combined for pagination
    const allCombinedTransactions = selectedDates.flatMap(date => allTransactions[date] || []);
    const paginatedTransactions = getPaginatedData(allCombinedTransactions);
    const totalPages = getTotalPages(allCombinedTransactions);

    // Get all unique times across all dates
    const allTimes = new Set<number>();
    Object.values(allTransactions).forEach(transactions => {
      transactions.forEach(tx => allTimes.add(tx.TRX_TIME));
    });

    // Calculate totals - use allCombinedTransactions for accurate totals
    const totalTransactions = allCombinedTransactions.length;
    const totalVolume = allCombinedTransactions.reduce((sum, t) => sum + t.STK_VOLM, 0);
    const uniqueBrokers = new Set([
      ...allCombinedTransactions.map(t => t.BRK_COD1),
      ...allCombinedTransactions.map(t => t.BRK_COD2)
    ]).size;
    
        
        return (
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex flex-col gap-1 w-full sm:w-auto sm:flex-row sm:items-center">
              <Grid3X3 className="w-5 h-5" />
              Transaction Details - ({selectedStock})
            </CardTitle>

            {/* Filter Section */}
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center w-full">
              <div className="flex flex-col gap-1 w-full sm:w-auto sm:flex-row sm:items-center">
                <label className="text-xs font-medium text-muted-foreground">Sort Time:</label>
                <select
                  className="text-xs bg-background border border-border rounded px-2 h-9 w-full sm:w-auto min-w-[160px]"
                  value={filters.timeSort}
                  onChange={(e) => setFilters(prev => ({ ...prev, timeSort: e.target.value }))}
                >
                  <option value="latest">Latest</option>
                  <option value="oldest">Oldest</option>
                </select>
              </div>

              <div className="flex flex-col gap-1 w-full sm:w-auto sm:flex-row sm:items-center">
                <label className="text-xs font-medium text-muted-foreground">Broker:</label>
                <select
                  className="text-xs bg-background border border-border rounded px-2 h-9 w-full sm:w-auto min-w-[160px]"
                  value={filters.broker}
                  onChange={(e) => setFilters(prev => ({ ...prev, broker: e.target.value }))}
                >
                  <option value="all">All</option>
                  {brokerOptions.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1 w-full sm:w-auto sm:flex-row sm:items-center">
                <label className="text-xs font-medium text-muted-foreground">Price:</label>
                <select
                  className="text-xs bg-background border border-border rounded px-2 h-9 w-full sm:w-auto min-w-[160px]"
                  value={filters.price}
                  onChange={(e) => setFilters(prev => ({ ...prev, price: e.target.value }))}
                >
                  <option value="all">All</option>
                  {priceOptions.map(option => (
                    <option key={option} value={option}>{formatNumber(parseInt(option))}</option>
                  ))}
                </select>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setFilters({ timeSort: 'latest', broker: 'all', price: 'all' })}
                className="w-full sm:w-auto text-xs h-9"
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Reset
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                {/* Date row */}
                <tr className="border-b border-border bg-muted/50">
                  {selectedDates.map(date => (
                    <th key={date} className="text-center py-2 px-1 font-medium bg-blue-50 dark:bg-blue-900/20 border-l border-border" colSpan={8}>
                      {formatDisplayDate(date)}
                    </th>
                  ))}
                </tr>
                {/* Column headers row */}
                <tr className="border-b border-border bg-muted/30">
                  {selectedDates.map(date => (
                    <React.Fragment key={date}>
                      <th className="text-left py-2 px-1 font-medium border-l-2 border-border">Time</th>
                      <th className="text-left py-2 px-1 font-medium">Brd</th>
                      <th className="text-center py-2 px-1 font-medium text-blue-600">BBCode</th>
                      <th className="text-center py-2 px-1 font-medium text-gray-600">BT</th>
                      <th className="text-center py-2 px-1 font-medium text-red-600">SBCode</th>
                      <th className="text-center py-2 px-1 font-medium text-gray-600">ST</th>
                      <th className="text-right py-2 px-1 font-medium">Price</th>
                      <th className="text-right py-2 px-1 font-medium border-r-2 border-border">Qty</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Render paginated transactions */}
                {paginatedTransactions.map((transaction, rowIdx) => (
                  <tr key={rowIdx} className="border-b border-border/50 hover:bg-accent/50">
                    {selectedDates.map(date => {
                      // Find transaction for this date (simplified for horizontal view)
                      const dateTransaction = allTransactions[date]?.find(tx => 
                        tx.TRX_TIME === transaction.TRX_TIME && 
                        tx.STK_PRIC === transaction.STK_PRIC
                      ) || null;
                      
                      return (
                        <React.Fragment key={date}>
                          <td className="py-1 px-1 font-medium border-l-2 border-border text-foreground text-xs">
                            {dateTransaction ? formatTime(dateTransaction.TRX_TIME) : '-'}
                          </td>
                          <td className="py-1 px-1 text-red-600 font-medium text-xs">
                            {dateTransaction?.TYP || '-'}
                          </td>
                          <td className="py-1 px-1 text-center text-blue-600 text-xs">
                            {dateTransaction?.BRK_COD1 || '-'}
                          </td>
                          <td className="py-1 px-1 text-center text-gray-600 text-xs">
                            {dateTransaction?.INV_TYP1 || '-'}
                          </td>
                          <td className="py-1 px-1 text-center text-red-600 text-xs">
                            {dateTransaction?.BRK_COD2 || '-'}
                          </td>
                          <td className="py-1 px-1 text-center text-gray-600 text-xs">
                            {dateTransaction?.INV_TYP2 || '-'}
                          </td>
                          <td className="py-1 px-1 text-right font-medium text-xs">
                            {dateTransaction ? formatNumber(dateTransaction.STK_PRIC) : '-'}
                          </td>
                          <td className="py-1 px-1 text-right font-medium border-r-2 border-border text-xs">
                            {dateTransaction ? formatNumber(dateTransaction.STK_VOLM) : '-'}
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div>
                Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, allCombinedTransactions.length)} of {allCombinedTransactions.length} transactions
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs">Items per page:</label>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="text-xs bg-background border border-border rounded px-2 py-1"
                >
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                  <option value={500}>500</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <span className="px-2 text-sm">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          </div>

          {/* Summary */}
          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium mb-2">Summary</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Total Transactions:</span>
                <div className="font-medium">{formatNumber(totalTransactions)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Total Volume:</span>
                <div className="font-medium">{formatNumber(totalVolume)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Unique Brokers:</span>
                <div className="font-medium">{uniqueBrokers}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Current Page:</span>
                <div className="font-medium">{currentPage} of {totalPages}</div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              {selectedDates.map(date => {
                const dateTransactions = allTransactions[date] || [];
                const dateVolume = dateTransactions.reduce((sum, t) => sum + t.STK_VOLM, 0);
                return (
                  <div key={date} className="p-2 bg-background rounded border">
                    <div className="font-medium text-blue-600">{formatDisplayDate(date)}</div>
                    <div className="text-xs text-muted-foreground">
                      {dateTransactions.length} transactions, {formatNumber(dateVolume)} volume
                    </div>
                  </div>
                );
              })}
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
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Title */}
            <div className="flex items-center gap-2 text-sm sm:text-base font-medium">
              <Calendar className="w-4 h-4 sm:w-5 sm:h-5" />
              Stock Selection & Date Range (Max 7 Days)
            </div>
            
            {/* Menu Controls */}
            <div className="flex flex-wrap items-center gap-4">
              {/* Stock Selection */}
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium whitespace-nowrap">Stock:</label>
                <div className="relative" ref={dropdownRef}>
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
                    className="w-full pl-10 pr-3 py-2 text-sm border border-border rounded-md bg-input text-foreground"
                  />
                  {showStockSuggestions && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                      {availableStocks.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground flex items-center">
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          Loading stocks...
                        </div>
                      ) : stockInput === '' ? (
                        <>
                          <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
                            Available Stocks ({availableStocks.length})
                          </div>
                          {availableStocks.map(stock => (
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
                        <>
                          <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
                            {filteredStocks.length} stocks found
                          </div>
                          {filteredStocks.map(stock => (
                            <div
                              key={stock}
                              onClick={() => handleStockSelect(stock)}
                              className="px-3 py-2 hover:bg-muted cursor-pointer text-sm"
                            >
                              {stock}
                            </div>
                          ))}
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
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium whitespace-nowrap">Date Range:</label>
                <div className="flex items-center gap-2">
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
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium whitespace-nowrap">Quick Select:</label>
                <div className="flex items-center gap-2">
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
                    <Button onClick={clearAllDates} variant="outline" size="sm" className="w-auto">
                      <RotateCcw className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                      <span className="text-sm">Clear</span>
                    </Button>
                  )}
              </div>
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
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading State */}
      {isLoading && (
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            <span>Loading transaction data...</span>
          </CardContent>
        </Card>
      )}

      {/* Error State */}
      {error && !isLoading && (
        <Card>
          <CardContent className="flex items-center justify-center py-8 text-destructive">
            <span>Error: {error}</span>
          </CardContent>
        </Card>
      )}

      {/* Main Data Display */}
      {!isLoading && !error && renderHorizontalView()}

      {/* Info Card */}
      <Card className={infoOpen ? '' : 'my-4'}>
        <CardHeader className={infoOpen ? 'pb-3' : 'pb-6'}>
          <button
            type="button"
            onClick={() => setInfoOpen((o) => !o)}
            className="flex w-full items-center justify-between text-left"
            aria-expanded={infoOpen}
          >
            <CardTitle className="flex items-center gap-2">
              <ChevronDown className={`w-5 h-5 transition-transform ${infoOpen ? 'rotate-180' : ''}`} />
              Done Detail Information & Column Legend
            </CardTitle>
          </button>
        </CardHeader>
        {infoOpen && (
          <CardContent>
            <div className="space-y-4 text-sm text-muted-foreground">
                      <div>
              <p className="font-medium text-foreground mb-2">Column Definitions:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <ul className="space-y-2 ml-4">
                  <li><span className="font-medium text-foreground">Time:</span> Transaction execution time (HH:MM:SS)</li>
                  <li><span className="font-medium text-foreground">Brd:</span> Board type (RG = Regular Board, TN = Cash Market, NG = Negotiated board)</li>
                  <li><span className="font-medium text-foreground">Price:</span> Transaction price per share</li>
                  <li><span className="font-medium text-foreground">Qty:</span> Transaction volume (number of shares)</li>
                </ul>
                <ul className="space-y-2 ml-4">
                  <li><span className="text-blue-600 font-medium">BBCode:</span> Buyer Broker Code (Broker Beli)</li>
                  <li><span className="text-red-600 font-medium">SBCode:</span> Seller Broker Code (Broker Jual)</li>
                  <li><span className="text-gray-600 font-medium">BT:</span> Buyer Type (I=Indonesia, A=Asing)</li>
                  <li><span className="text-gray-600 font-medium">ST:</span> Seller Type (I=Individual, F=Foreign, etc.)</li>
                </ul>
                      </div>
                    </div>

            <div className="pt-2 border-t border-border">
              <p className="font-medium text-foreground mb-2">Layout Options:</p>
              <ul className="space-y-1 ml-4">
                <li><strong>Horizontal:</strong> Combined view showing all transactions across selected dates</li>
                <li><strong>Vertical:</strong> Separate tables for each selected date</li>
              </ul>
      </div>
          </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}