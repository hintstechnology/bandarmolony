import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Calendar, Plus, X, Grid3X3, Clock, DollarSign, Users, ChevronDown, RotateCcw } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';

interface DoneDetailData {
  trxCode: number;    // TRX_CODE
  trxSess: number;    // TRX_SESS
  trxType: string;    // TRX_TYPE (RG = Regular)
  brkCod2: string;    // BRK_COD2 (Seller broker)
  invTyp2: string;    // INV_TYP2 (Seller investor type)
  brkCod1: string;    // BRK_COD1 (Buyer broker)
  invTyp1: string;    // INV_TYP1 (Buyer investor type)
  stkCode: string;    // STK_CODE
  stkVolm: number;    // STK_VOLM
  stkPric: number;    // STK_PRIC
  trxDate: string;    // TRX_DATE
  trxOrd2: number;    // TRX_ORD2
  trxOrd1: number;    // TRX_ORD1
  trxTime: number;    // TRX_TIME (as number like 85800)
}


// Available stocks from the data
const AVAILABLE_STOCKS = [
  'BBRI', 'BBCA', 'BMRI', 'BBNI', 'TLKM', 'ASII', 'UNVR', 'GGRM', 'ICBP', 'INDF',
  'KLBF', 'ADRO', 'ANTM', 'ITMG', 'PTBA', 'SMGR', 'INTP', 'WIKA', 'WSKT', 'PGAS',
  'YUPI', 'ZYRX', 'ZONE'
];

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
      dates.push(currentDate.toISOString().split('T')[0]);
    }

    // Go to previous day
    currentDate.setDate(currentDate.getDate() - 1);

    // Safety check to prevent infinite loop
    if (dates.length === 0 && currentDate.getTime() < today.getTime() - (30 * 24 * 60 * 60 * 1000)) {
      // If no trading days found in last 30 days, just use today
      dates.push(today.toISOString().split('T')[0]);
      break;
    }
  }

  return dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
};

// Generate realistic done detail data based on CSV structure
const generateDoneDetailData = (stock: string, date: string): DoneDetailData[] => {
  const brokers = ['RG', 'MG', 'BR', 'LG', 'CC', 'AT', 'SD', 'UU', 'TG', 'KK', 'XL', 'XC', 'PC', 'PD', 'DR'];
  const basePrice = stock === 'BBRI' ? 4150 : stock === 'BBCA' ? 2750 : stock === 'BMRI' ? 3200 :
    stock === 'YUPI' ? 1610 : stock === 'ZYRX' ? 148 : stock === 'ZONE' ? 755 : 1500;

  // Create a seed based on stock and date for consistent data
  const seed = stock.charCodeAt(0) + date.split('-').reduce((acc, part) => acc + parseInt(part), 0);

  const data: DoneDetailData[] = [];

  // Generate transactions throughout the day (08:58:00 to 15:00:00)
  const startTime = 8 * 3600 + 58 * 60; // 08:58:00 in seconds
  const endTime = 15 * 3600; // 15:00:00 in seconds

  // Generate 100-300 transactions per day
  const numTransactions = 100 + (seed % 200);

  for (let i = 0; i < numTransactions; i++) {
    const txSeed = seed + i * 17;

    // Random time between start and end
    const timeInSeconds = startTime + (txSeed % (endTime - startTime));
    const hours = Math.floor(timeInSeconds / 3600);
    const minutes = Math.floor((timeInSeconds % 3600) / 60);
    const seconds = timeInSeconds % 60;
    const trxTime = `${hours.toString().padStart(2, '0')}${minutes.toString().padStart(2, '0')}${seconds.toString().padStart(2, '0')}`;

    // Price variation around base price
    const priceVariation = ((txSeed * 7) % 21) - 10; // -10 to +10
    const price = basePrice + (priceVariation * 5);

    // Volume
    const volume = 100 + ((txSeed * 13) % 2000);

    // Brokers
    const buyerBroker = brokers[(txSeed * 3) % brokers.length];
    const sellerBroker = brokers[(txSeed * 5) % brokers.length];

    data.push({
      trxCode: i,  // Sequential number starting from 0
      trxSess: 1,  // Session number as number
      trxType: 'RG',
      brkCod2: sellerBroker, // Seller
      invTyp2: 'I',
      brkCod1: buyerBroker,  // Buyer
      invTyp1: 'I',
      stkCode: stock,
      stkVolm: volume,
      stkPric: price,
      trxDate: date,
      trxOrd2: (txSeed * 11) % 999999,  // Order number as number
      trxOrd1: (txSeed * 19) % 999999,  // Order number as number
      trxTime: parseInt(trxTime)  // Time as number (e.g., 85800)
    });
  }

  return data.sort((a, b) => a.trxTime - b.trxTime);
};

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
  const [showStockSuggestions, setShowStockSuggestions] = useState(false);
  const [layoutMode, setLayoutMode] = useState<'horizontal' | 'vertical'>('horizontal');
  const [filters, setFilters] = useState({
    timeSort: 'latest',
    broker: 'all',
    price: 'all'
  });
  const [dateRangeMode, setDateRangeMode] = useState<'1day' | '3days' | '1week' | 'custom'>('3days');
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  const handleStockSelect = (stock: string) => {
    setSelectedStock(stock);
    setStockInput(stock);
    setShowStockSuggestions(false);
  };

  const handleStockInputChange = (value: string) => {
    setStockInput(value);
    setShowStockSuggestions(true);

    // If exact match, select it
    if (AVAILABLE_STOCKS.includes(value.toUpperCase())) {
      setSelectedStock(value.toUpperCase());
    }
  };

  const filteredStocks = AVAILABLE_STOCKS.filter(stock =>
    stock.toLowerCase().includes(stockInput.toLowerCase())
  );

  // Filter and sort data based on selected filters
  const filterData = (data: DoneDetailData[]): DoneDetailData[] => {
    let filteredData = data.filter(transaction => {
      if (filters.broker !== 'all' && transaction.brkCod1 !== filters.broker && transaction.brkCod2 !== filters.broker) return false;
      if (filters.price !== 'all' && transaction.stkPric.toString() !== filters.price) return false;
      return true;
    });

    // Sort by time
    if (filters.timeSort === 'latest') {
      filteredData.sort((a, b) => b.trxTime - a.trxTime);
    } else {
      filteredData.sort((a, b) => a.trxTime - b.trxTime);
    }

    return filteredData;
  };

  // Get unique values for filter options
  const getUniqueValues = (field: keyof DoneDetailData): string[] => {
    const allData = selectedDates.flatMap(date => generateDoneDetailData(selectedStock, date));
    const uniqueValues = [...new Set(allData.map(item => String(item[field])))];
    return uniqueValues.sort();
  };

  const brokerOptions = [...new Set([
    ...getUniqueValues('brkCod1'),
    ...getUniqueValues('brkCod2')
  ])].sort();
  const priceOptions = getUniqueValues('stkPric').sort((a, b) => parseInt(a) - parseInt(b));

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

  // Render table like IPOT format - showing individual transactions
  const renderTransactionTable = (data: DoneDetailData[], date: string) => {
        return (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <div className="min-w-full px-4 sm:px-0">
        <table className="w-full text-xs border-collapse min-w-[600px]">
              <thead>
                <tr className="border-b border-border bg-muted/50">
              <th className="text-left py-2 px-2 font-medium sticky left-0 bg-muted/50 z-10">Time</th>
              <th className="text-left py-2 px-2 font-medium">Brd</th>
              <th className="text-right py-2 px-2 font-medium">Price</th>
              <th className="text-right py-2 px-2 font-medium">Qty</th>
               <th className="text-center py-2 px-2 font-medium">BBCode</th>
               <th className="text-center py-2 px-2 font-medium">BT</th>
               <th className="text-center py-2 px-2 font-medium">ST</th>
               <th className="text-center py-2 px-2 font-medium">SBCode</th>
                </tr>
              </thead>
              <tbody>
            {data.map((row, idx) => (
              <tr key={idx} className="border-b border-border/50 hover:bg-accent/50">
                <td className="py-1 px-2 font-medium sticky left-0 bg-background z-10 border-r border-border text-foreground">
                  {formatTime(row.trxTime)}
                </td>
                <td className="py-1 px-2 text-red-600 font-medium">
                  {row.trxType}
                </td>
                <td className="py-1 px-2 text-right font-medium">
                  {formatNumber(row.stkPric)}
                </td>
                <td className="py-1 px-2 text-right font-medium">
                  {formatNumber(row.stkVolm)}
                </td>
                <td className="py-1 px-2 text-center text-blue-600">
                  {row.brkCod1}
                </td>
                <td className="py-1 px-2 text-center text-gray-600">
                  {row.invTyp1}
                </td>
                <td className="py-1 px-2 text-center text-gray-600">
                  {row.invTyp2}
                        </td>
                <td className="py-1 px-2 text-center text-red-600">
                  {row.brkCod2}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        );
  };

  // Render horizontal view - pivot-style comparison across dates
  const renderHorizontalView = () => {
    // Get all transactions for all selected dates and apply filters
    const allTransactions: { [date: string]: DoneDetailData[] } = {};
    selectedDates.forEach(date => {
      const rawData = generateDoneDetailData(selectedStock, date);
      allTransactions[date] = filterData(rawData);
    });

    // Get all unique times across all dates
    const allTimes = new Set<number>();
    Object.values(allTransactions).forEach(transactions => {
      transactions.forEach(tx => allTimes.add(tx.trxTime));
    });
    const sortedTimes = Array.from(allTimes).sort((a, b) => a - b);

    // Calculate totals
    const totalTransactions = Object.values(allTransactions).flat().length;
    const totalVolume = Object.values(allTransactions).flat().reduce((sum, t) => sum + t.stkVolm, 0);
    const uniqueBrokers = new Set([
      ...Object.values(allTransactions).flat().map(t => t.brkCod1),
      ...Object.values(allTransactions).flat().map(t => t.brkCod2)
    ]).size;
        
        return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Grid3X3 className="w-5 h-5" />
              Transaction Details - ({selectedStock})
            </CardTitle>

            {/* Filter Section */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-muted-foreground">Sort Time:</label>
                <select
                  className="text-xs bg-background border border-border rounded px-2 py-1"
                  value={filters.timeSort}
                  onChange={(e) => setFilters(prev => ({ ...prev, timeSort: e.target.value }))}
                >
                  <option value="latest">Latest</option>
                  <option value="oldest">Oldest</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-muted-foreground">Broker:</label>
                <select
                  className="text-xs bg-background border border-border rounded px-2 py-1"
                  value={filters.broker}
                  onChange={(e) => setFilters(prev => ({ ...prev, broker: e.target.value }))}
                >
                  <option value="all">All</option>
                  {brokerOptions.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-muted-foreground">Price:</label>
                <select
                  className="text-xs bg-background border border-border rounded px-2 py-1"
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
                className="text-xs"
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
                {/* Get maximum number of transactions across all dates to create enough rows */}
                {(() => {
                  const maxTransactions = Math.max(...selectedDates.map(date => allTransactions[date].length));
                  const rows: React.ReactElement[] = [];

                  for (let rowIdx = 0; rowIdx < maxTransactions; rowIdx++) {
                    rows.push(
                      <tr key={rowIdx} className="border-b border-border/50 hover:bg-accent/50">
                        {selectedDates.map(date => {
                          const transaction = allTransactions[date][rowIdx] || null;
                      return (
                            <React.Fragment key={date}>
                              <td className="py-1 px-1 font-medium border-l-2 border-border text-foreground text-xs">
                                {transaction ? formatTime(transaction.trxTime) : '-'}
                              </td>
                              <td className="py-1 px-1 text-red-600 font-medium text-xs">
                                {transaction?.trxType || '-'}
                              </td>
                              <td className="py-1 px-1 text-center text-blue-600 text-xs">
                                {transaction?.brkCod1 || '-'}
                              </td>
                              <td className="py-1 px-1 text-center text-gray-600 text-xs">
                                {transaction?.invTyp1 || '-'}
                              </td>
                              <td className="py-1 px-1 text-center text-red-600 text-xs">
                                {transaction?.brkCod2 || '-'}
                              </td>
                              <td className="py-1 px-1 text-center text-gray-600 text-xs">
                                {transaction?.invTyp2 || '-'}
                              </td>
                              <td className="py-1 px-1 text-right font-medium text-xs">
                                {transaction ? formatNumber(transaction.stkPric) : '-'}
                              </td>
                              <td className="py-1 px-1 text-right font-medium border-r-2 border-border text-xs">
                                {transaction ? formatNumber(transaction.stkVolm) : '-'}
                        </td>
                            </React.Fragment>
                      );
                    })}
                  </tr>
                    );
                  }

                  return rows;
                })()}
              </tbody>
            </table>
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
                <span className="text-muted-foreground">Max Rows:</span>
                <div className="font-medium">{Math.max(...selectedDates.map(date => allTransactions[date].length))}</div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              {selectedDates.map(date => {
                const dateTransactions = allTransactions[date];
                const dateVolume = dateTransactions.reduce((sum, t) => sum + t.stkVolm, 0);
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

  // Render vertical view - separate table for each date
  const renderVerticalView = () => {
    return (
      <div className="space-y-6">
        {/* Filter Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Grid3X3 className="w-5 h-5" />
                Filters
              </CardTitle>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-muted-foreground">Sort Time:</label>
                  <select
                    className="text-xs bg-background border border-border rounded px-2 py-1"
                    value={filters.timeSort}
                    onChange={(e) => setFilters(prev => ({ ...prev, timeSort: e.target.value }))}
                  >
                    <option value="latest">Latest</option>
                    <option value="oldest">Oldest</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-muted-foreground">Broker:</label>
                  <select
                    className="text-xs bg-background border border-border rounded px-2 py-1"
                    value={filters.broker}
                    onChange={(e) => setFilters(prev => ({ ...prev, broker: e.target.value }))}
                  >
                    <option value="all">All</option>
                    {brokerOptions.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-muted-foreground">Price:</label>
                  <select
                    className="text-xs bg-background border border-border rounded px-2 py-1"
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
                  className="text-xs"
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  Reset
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>
        {selectedDates.map((date) => {
          const rawData = generateDoneDetailData(selectedStock, date);
          const doneDetailData = filterData(rawData);
        
        return (
            <Card key={date}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Grid3X3 className="w-5 h-5" />
                  Done Detail - {selectedStock} ({formatDisplayDate(date)})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {renderTransactionTable(doneDetailData, date)}

                {/* Summary */}
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Transactions: </span>
                      <span className="font-medium">{formatNumber(doneDetailData.length)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Total Volume: </span>
                      <span className="font-medium text-blue-600">
                        {formatNumber(doneDetailData.reduce((sum, tx) => sum + tx.stkVolm, 0))}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Unique Brokers: </span>
                      <span className="font-medium text-purple-600">
                        {new Set([...doneDetailData.map(tx => tx.brkCod1), ...doneDetailData.map(tx => tx.brkCod2)]).size}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Price Range: </span>
                      <span className="font-medium">
                        {doneDetailData.length > 0 ?
                          `${formatNumber(Math.min(...doneDetailData.map(tx => tx.stkPric)))} - ${formatNumber(Math.max(...doneDetailData.map(tx => tx.stkPric)))}`
                          : 'N/A'
                        }
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Avg Price: </span>
                      <span className="font-medium">
                        {doneDetailData.length > 0 ?
                          formatNumber(Math.round(doneDetailData.reduce((sum, tx) => sum + tx.stkPric, 0) / doneDetailData.length))
                          : 'N/A'
                        }
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Avg Volume: </span>
                      <span className="font-medium">
                        {doneDetailData.length > 0 ?
                          formatNumber(Math.round(doneDetailData.reduce((sum, tx) => sum + tx.stkVolm, 0) / doneDetailData.length))
                          : 'N/A'
                        }
                      </span>
                    </div>
                  </div>
                            </div>
              </CardContent>
            </Card>
                      );
                    })}
          </div>
        );
  };


  return (
    <div className="min-h-screen space-y-4 sm:space-y-6 p-2 sm:p-4 lg:p-6">
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
            {/* Row 1: Stock, Date Range, Clear, Last 3 Days, Layout */}
            <div className="flex flex-col xl:flex-row gap-3 sm:gap-4 items-start xl:items-end">
              <div className="flex-1 w-full xl:w-auto">
                <label className="block text-xs sm:text-sm font-medium mb-1 sm:mb-2">Stock:</label>
                <div className="relative" ref={dropdownRef}>
                  <input
                    type="text"
                    value={stockInput}
                    onChange={(e) => handleStockInputChange(e.target.value)}
                    onFocus={() => setShowStockSuggestions(true)}
                    placeholder="Enter stock code..."
                    className="w-full px-2 sm:px-3 py-1 sm:py-2 text-xs sm:text-sm border border-border rounded-md bg-background text-foreground"
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

              <div className="flex-1 w-full xl:w-auto">
                <label className="block text-xs sm:text-sm font-medium mb-1 sm:mb-2">Date Range:</label>
                <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full sm:flex-1 px-2 sm:px-3 py-1 sm:py-2 text-xs sm:text-sm border border-border rounded-md bg-input text-foreground"
                  />
                  <span className="text-xs sm:text-sm text-muted-foreground hidden sm:inline">to</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full sm:flex-1 px-2 sm:px-3 py-1 sm:py-2 text-xs sm:text-sm border border-border rounded-md bg-input text-foreground"
                  />
                  <Button onClick={addDateRange} size="sm" className="w-full sm:w-auto">
                    <Plus className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span className="ml-1 text-xs sm:hidden">Add</span>
                  </Button>
                </div>
              </div>

              <div className="flex-1 w-full xl:w-auto">
                <label className="block text-xs sm:text-sm font-medium mb-1 sm:mb-2">Quick Select:</label>
                <div className="flex flex-col sm:flex-row gap-2">
                <select 
                    className="w-full xl:flex-1 px-2 sm:px-3 py-1 sm:py-2 text-xs sm:text-sm border border-border rounded-md bg-background text-foreground"
                    value={dateRangeMode}
                    onChange={(e) => handleDateRangeModeChange(e.target.value as '1day' | '3days' | '1week' | 'custom')}
                  >
                    <option value="1day">1 Day</option>
                    <option value="3days">3 Days</option>
                    <option value="1week">1 Week</option>
                    <option value="custom">Custom</option>
                </select>
                  {dateRangeMode === 'custom' && (
                    <Button onClick={clearAllDates} variant="outline" size="sm" className="w-full sm:w-auto">
                      <RotateCcw className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                      <span className="text-xs sm:text-sm">Clear</span>
                    </Button>
                  )}
              </div>
            </div>

              <div className="flex-1 w-full xl:w-auto">
                <label className="block text-xs sm:text-sm font-medium mb-1 sm:mb-2">Layout:</label>
                <div className="flex gap-1">
                <Button
                    variant={layoutMode === 'horizontal' ? 'default' : 'outline'}
                  size="sm"
                    onClick={() => setLayoutMode('horizontal')}
                    className="flex-1 text-xs sm:text-sm"
                >
                    <span className="hidden sm:inline">Horizontal</span>
                    <span className="sm:hidden">H</span>
                </Button>
                <Button
                    variant={layoutMode === 'vertical' ? 'default' : 'outline'}
                  size="sm"
                    onClick={() => setLayoutMode('vertical')}
                    className="flex-1 text-xs sm:text-sm"
                  >
                    <span className="hidden sm:inline">Vertical</span>
                    <span className="sm:hidden">V</span>
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
      {layoutMode === 'horizontal' ? renderHorizontalView() : renderVerticalView()}

      {/* Info Card */}
      <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
            <ChevronDown className="w-5 h-5" />
            Done Detail Information & Column Legend
                </CardTitle>
              </CardHeader>
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
      </Card>
    </div>
  );
}