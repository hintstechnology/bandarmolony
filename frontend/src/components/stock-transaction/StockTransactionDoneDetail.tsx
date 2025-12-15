import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Calendar, Grid3X3, Search, Loader2, GripVertical, X, Settings, Info } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { api } from '../../services/api';
import { STOCK_LIST, searchStocks } from '../../data/stockList';

interface DoneDetailData {
  STK_CODE: string;   // Stock code (not in CSV, but we'll add it from context)
  BRK_COD1: string;   // Buyer broker
  BRK_COD2: string;   // Seller broker
  STK_VOLM: number;   // Volume
  STK_PRIC: number;   // Price
  TRX_DATE: string;   // Transaction date (not in CSV, but we'll add it from context)
  TRX_TIME: number;   // Transaction time (as number like 85800)
  INV_TYP1: string;   // Buyer investor type
  INV_TYP2: string;   // Seller investor type
  TYP: string;        // Transaction type (from TRX_TYPE in CSV)
  TRX_CODE: number;   // Transaction code
  TRX_SESS: number;   // Transaction session
  TRX_ORD1: number;   // Order 1
  TRX_ORD2: number;   // Order 2
  HAKA_HAKI: number;  // HAKA (1) or HAKI (0) - from CSV
  VALUE: number;      // Volume * Price / 100 - from CSV
  [key: string]: any; // Allow additional columns
}


// This will be replaced with API data

// Commented out - not needed for single date CSV processing
// Get last 3 trading days (weekdays only, excluding weekends)
// const getLastThreeDays = (): string[] => {
//   const dates: string[] = [];
//   const today = new Date();
//   let currentDate = new Date(today);

//   // Start from today and go backwards
//   while (dates.length < 3) {
//     const dayOfWeek = currentDate.getDay();

//     // Skip weekends (Saturday = 6, Sunday = 0)
//     if (dayOfWeek !== 0 && dayOfWeek !== 6) {
//       const dateString = currentDate.toISOString().split('T')[0];
//       if (dateString) {
//         dates.push(dateString);
//       }
//     }

//     // Go to previous day
//     currentDate.setDate(currentDate.getDate() - 1);

//     // Safety check to prevent infinite loop
//     if (dates.length === 0 && currentDate.getTime() < today.getTime() - (30 * 24 * 60 * 60 * 1000)) {
//       const todayString = today.toISOString().split('T')[0];
//       if (todayString) {
//         dates.push(todayString);
//       }
//       break;
//     }
//   }

//   return dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
// };

// This will be replaced with real API data fetching


const formatNumber = (num: number): string => {
  return num.toLocaleString();
};

const formatDisplayDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
};


export function StockTransactionDoneDetail() {
  const { showToast } = useToast();
  
  // Helper function to get previous business day (skip weekends)
  const getPreviousBusinessDay = (): string => {
    const today = new Date();
    let previousDay = new Date(today);
    previousDay.setDate(today.getDate() - 1);
    
    // Keep going back until we find a weekday (Monday-Friday, day 1-5)
    while (previousDay.getDay() === 0 || previousDay.getDay() === 6) {
      previousDay.setDate(previousDay.getDate() - 1);
    }
    
    // Format as YYYY-MM-DD
    const year = previousDay.getFullYear();
    const month = String(previousDay.getMonth() + 1).padStart(2, '0');
    const day = String(previousDay.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  // Set default date to previous business day
  const defaultDate = getPreviousBusinessDay();
  
  // Set default date - will be updated when user selects dates
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState(defaultDate);
  const [selectedStock, setSelectedStock] = useState('PTRO');
  const [stockInput, setStockInput] = useState('PTRO');
  
  // Real data state
  const [_availableStocks] = useState<string[]>(STOCK_LIST);
  const [doneDetailData, setDoneDetailData] = useState<Map<string, DoneDetailData[]>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pivotDataFromBackend] = useState<any>(null);
  const [isDataReady, setIsDataReady] = useState<boolean>(false);
  const [customPivotData, setCustomPivotData] = useState<any>(null);
  const [isProcessingPivot, setIsProcessingPivot] = useState(false);
  
  const [showStockSuggestions, setShowStockSuggestions] = useState(false);
  const [highlightedStockIndex, setHighlightedStockIndex] = useState<number>(-1);

  // Filter states (removed - no longer used)
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(100); // Limit to 100 items per page
  const [pivotMode, setPivotMode] = useState<string>('custom');
  const dropdownRef = useRef<HTMLDivElement>(null);
  // const [infoOpen, setInfoOpen] = useState(false); // collapsible info, default minimized (currently unused)

  // Date picker refs
  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);

  // Menu container ref for responsive layout
  const menuContainerRef = useRef<HTMLDivElement>(null);

  // Drag and Drop Pivot Configuration
  const [draggedField, setDraggedField] = useState<string | null>(null);
  const [draggedFromSource, setDraggedFromSource] = useState<'available' | 'rows' | 'columns' | 'filters' | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null); // For reordering within same area
  const [touchDragState, setTouchDragState] = useState<{
    isDragging: boolean;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  const [dropZoneHighlight, setDropZoneHighlight] = useState<'rows' | 'columns' | 'filters' | 'available' | null>(null);
  const [pivotConfig, setPivotConfig] = useState<{
    rows: string[];
    columns: string[];
    valueField: string; // Field untuk value (default: STK_VOLM/Volume)
    aggregations: Array<'SUM' | 'COUNT' | 'AVG' | 'MIN' | 'MAX'>; // Selected aggregations
    filters: Array<{
      field: string;
      values: string[];
      filterType?: 'list' | 'timeRange';
      timeRange?: { start: string; end: string };
    }>;
    sort?: { field: string; direction: 'asc' | 'desc' };
  }>({
    rows: [],
    columns: [],
    valueField: 'STK_VOLM', // Default: Volume
    aggregations: ['COUNT'], // Default: Count
    filters: [],
  });

  // Filter search states
  const [filterSearchTerms, setFilterSearchTerms] = useState<{ [key: string]: string }>({});
  const [openFilterDropdowns, setOpenFilterDropdowns] = useState<{ [key: string]: boolean }>({});

  // Modal state for pivot builder
  const [isPivotBuilderOpen, setIsPivotBuilderOpen] = useState(false);
  const [tempPivotConfig, setTempPivotConfig] = useState(pivotConfig);
  const [tempFilterSearchTerms, setTempFilterSearchTerms] = useState<{ [key: string]: string }>({});
  const [tempOpenFilterDropdowns, setTempOpenFilterDropdowns] = useState<{ [key: string]: boolean }>({});

  // Sync tempPivotConfig when pivotConfig changes (but not when modal opens)
  useEffect(() => {
    if (!isPivotBuilderOpen) {
      setTempPivotConfig(pivotConfig);
      setTempFilterSearchTerms(filterSearchTerms);
      setTempOpenFilterDropdowns(openFilterDropdowns);
    }
  }, [pivotConfig, filterSearchTerms, openFilterDropdowns, isPivotBuilderOpen]);

  // Available fields for pivot
  const availableFields = [
    { id: 'STK_CODE', label: 'Stock Code', type: 'dimension' },
    { id: 'BRK_COD1', label: 'Buyer Broker', type: 'dimension' },
    { id: 'BRK_COD2', label: 'Seller Broker', type: 'dimension' },
    { id: 'TRX_TIME', label: 'Transaction Time', type: 'dimension' },
    { id: 'STK_PRIC', label: 'Price', type: 'dimension' },
    { id: 'INV_TYP1', label: 'Buyer Investor Type', type: 'dimension' },
    { id: 'INV_TYP2', label: 'Seller Investor Type', type: 'dimension' },
    { id: 'TYP', label: 'Transaction Type', type: 'dimension' },
    { id: 'TRX_SESS', label: 'Session', type: 'dimension' },
    { id: 'HAKA_HAKI', label: 'HAKA/HAKI', type: 'dimension' },
    { id: 'STK_VOLM', label: 'Volume', type: 'measure' },
  ];

  // Load data from Azure API when stock or dates change
  useEffect(() => {
    const fetchData = async () => {
      if (!selectedStock || selectedDates.length === 0) {
        setIsDataReady(false);
        return;
      }

      console.log('Fetching data from Azure API:', { selectedStock, selectedDates });
        setIsLoading(true);
        setError(null);
      setIsDataReady(false);

      try {
        // Fetch data for all selected dates
        const result = await api.getBreakDoneTradeBatch(selectedStock, selectedDates);

        if (result.success && result.data?.dataByDate) {
          const newData = new Map<string, DoneDetailData[]>();

          Object.entries(result.data.dataByDate).forEach(([date, data]: [string, any]) => {
            if (data?.doneTradeData && Array.isArray(data.doneTradeData)) {
              // Process data from CSV structure: TRX_CODE,TRX_SESS,TRX_TYPE,BRK_COD2,INV_TYP2,BRK_COD1,INV_TYP1,STK_VOLM,STK_PRIC,TRX_ORD2,TRX_ORD1,TRX_TIME,HAKA_HAKI,VALUE
              const processedData = data.doneTradeData.map((item: any) => {
                // Parse TRX_CODE (might be in format "8628:44:45" or just number)
                const trxCodeStr = String(item.TRX_CODE || '0');
                const trxCode = parseInt(trxCodeStr.split(':')[0] || '0') || 0;

                const processedRow: DoneDetailData = {
                  STK_CODE: selectedStock, // Add stock code from context (not in CSV)
                  BRK_COD1: String(item.BRK_COD1 || ''),
                  BRK_COD2: String(item.BRK_COD2 || ''),
                  STK_VOLM: parseFloat(String(item.STK_VOLM || '0')) || 0,
                  STK_PRIC: parseFloat(String(item.STK_PRIC || '0')) || 0,
                  TRX_DATE: date, // Add date from context (not in CSV)
                  TRX_TIME: parseInt(String(item.TRX_TIME || '0')) || 0,
                  INV_TYP1: String(item.INV_TYP1 || ''),
                  INV_TYP2: String(item.INV_TYP2 || ''),
                  TYP: String(item.TRX_TYPE || ''), // CSV uses TRX_TYPE, we map to TYP
                  TRX_CODE: trxCode,
                  TRX_SESS: parseInt(String(item.TRX_SESS || '0')) || 0,
                  TRX_ORD1: parseInt(String(item.TRX_ORD1 || '0')) || 0,
                  TRX_ORD2: parseInt(String(item.TRX_ORD2 || '0')) || 0,
                  HAKA_HAKI: parseInt(String(item.HAKA_HAKI || '0')) || 0, // From CSV
                  VALUE: parseFloat(String(item.VALUE || '0')) || 0, // From CSV
                };

                return processedRow;
              });

              newData.set(date, processedData);
            }
          });

          setDoneDetailData(newData);
          setIsDataReady(true);

          const totalRecords = Array.from(newData.values()).reduce((sum, arr) => sum + arr.length, 0);
          console.log(`Loaded ${totalRecords} transactions for ${selectedStock} from Azure API`);
        } else {
          setError('Failed to load done detail data');
          setIsDataReady(false);
          showToast({
            type: 'error',
            title: 'Error',
            message: result.error || 'Failed to load data from Azure'
          });
        }
      } catch (err) {
        console.error('Error loading done detail data:', err);
        setError('Failed to load done detail data');
        setIsDataReady(false);
        showToast({
          type: 'error',
          title: 'Error',
          message: 'Failed to load data. Please try again.'
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [selectedStock, selectedDates, showToast]);


  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowStockSuggestions(false);
      }
      // Close filter dropdowns when clicking outside
      const target = event.target as HTMLElement;
      if (!target.closest('[data-filter-dropdown]')) {
        setOpenFilterDropdowns({});
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
    if (STOCK_LIST.includes(value.toUpperCase())) {
      setSelectedStock(value.toUpperCase());
    }
  };

  const filteredStocks = searchStocks(stockInput);


  // Date picker helpers
  const formatDateForInput = (date: string | undefined) => {
    return date || '';
  };

  const triggerDatePicker = (inputRef: React.RefObject<HTMLInputElement>) => {
    inputRef.current?.showPicker?.();
  };

  // Removed filterData - no longer used


  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedStock, selectedDates, pivotMode]);


  // Comment out backend pivot fetch - will process in frontend
  // useEffect(() => {
  //   const loadPivotData = async () => {
  //     if (pivotMode === 'detail' || !selectedStock || selectedDates.length === 0) {
  //       setPivotDataFromBackend(null);
  //       return;
  //     }

  //     try {
  //       setIsLoadingPivot(true);
  //       setError(null);

  //       const result = await api.getBreakDoneTradePivot(
  //         selectedStock,
  //         selectedDates,
  //         pivotMode as any
  //       );

  //       if (result.success && result.data?.pivotData) {
  //         setPivotDataFromBackend(result.data.pivotData);
  //       } else {
  //         setError('Failed to load pivot data');
  //         setPivotDataFromBackend(null);
  //       }
  //     } catch (err) {
  //       console.error('Error loading pivot data:', err);
  //       setError('Failed to load pivot data');
  //       setPivotDataFromBackend(null);
  //     } finally {
  //       setIsLoadingPivot(false);
  //     }
  //   };

  //   loadPivotData();
  // }, [pivotMode, selectedStock, selectedDates]);

  // Generate pivot table from drag and drop config
  const generateCustomPivot = () => {
    if (pivotConfig.rows.length === 0 && pivotConfig.columns.length === 0 && pivotConfig.aggregations.length === 0) {
      setCustomPivotData(null);
        return;
      }

    setIsProcessingPivot(true);

    try {
      // Get all data
      const allData = selectedDates.flatMap(date => doneDetailData.get(date) || []);

      // Apply filters
      let filteredData = allData;
      pivotConfig.filters.forEach(filterConfig => {
        if (filterConfig.filterType === 'timeRange' && filterConfig.timeRange) {
          // Filter by time range
          // Convert time string "HH:MM" to number format (HHMMSS)
          const startTimeStr = filterConfig.timeRange.start;
          const endTimeStr = filterConfig.timeRange.end;
          const startTime = parseInt(startTimeStr.replace(':', '').padEnd(6, '0')) || 0;
          const endTime = parseInt(endTimeStr.replace(':', '').padEnd(6, '0')) || 235959;

          filteredData = filteredData.filter(item => {
            const itemTime = item.TRX_TIME || 0;
            return itemTime >= startTime && itemTime <= endTime;
          });
        } else if (filterConfig.values.length > 0) {
          // Filter by selected values
          filteredData = filteredData.filter(item => {
            const rawValue = item[filterConfig.field as keyof DoneDetailData];

            // Special handling for HAKA_HAKI field
            if (filterConfig.field === 'HAKA_HAKI') {
              const itemValueStr = rawValue === 1 ? 'HAKA' : 'HAKI';
              return filterConfig.values.includes(itemValueStr);
            }

            // For numeric fields like price, compare both as string and number
            const itemValueStr = String(rawValue || '');
            const itemValueNum = typeof rawValue === 'number' ? rawValue : parseFloat(itemValueStr);

            // Check if any selected value matches (as string or number)
            return filterConfig.values.some(selectedValue => {
              const selectedNum = parseFloat(selectedValue);
              // Match as string
              if (itemValueStr === selectedValue) return true;
              // Match as number (for price and other numeric fields)
              if (!isNaN(itemValueNum) && !isNaN(selectedNum) && itemValueNum === selectedNum) return true;
              return false;
            });
          });
        }
      });

      // Group data by row dimensions
      const groupedData: { [key: string]: DoneDetailData[] } = {};

      filteredData.forEach(item => {
        // Create row key from row dimensions
        const rowKey = pivotConfig.rows.length > 0
          ? pivotConfig.rows.map(field => String(item[field as keyof DoneDetailData] || '')).join(' | ')
          : 'Total';

        if (!groupedData[rowKey]) {
          groupedData[rowKey] = [];
        }
        groupedData[rowKey].push(item);
      });

      // Sort row keys if sort is configured
      let sortedRowKeys = Object.keys(groupedData);
      if (pivotConfig.sort && pivotConfig.rows.includes(pivotConfig.sort.field)) {
        const sortField = pivotConfig.sort.field;
        const sortFieldIndex = pivotConfig.rows.indexOf(sortField);
        const sortDirection = pivotConfig.sort.direction;

        sortedRowKeys = sortedRowKeys.sort((a, b) => {
          // Split row keys to get individual field values
          const partsA = a.split(' | ');
          const partsB = b.split(' | ');

          // Get the value for the sort field
          const valueA = partsA[sortFieldIndex] || partsA[0] || a;
          const valueB = partsB[sortFieldIndex] || partsB[0] || b;

          // Try to parse as number first (for Price and other numeric fields)
          const numA = parseFloat(valueA);
          const numB = parseFloat(valueB);

          if (!isNaN(numA) && !isNaN(numB)) {
            // Numeric sort
            // For 'desc': higher values first (numB - numA)
            // For 'asc': lower values first (numA - numB)
            const result = sortDirection === 'desc'
              ? numB - numA  // Descending: high to low
              : numA - numB; // Ascending: low to high
            return result;
          } else {
            // String sort
            const result = sortDirection === 'desc'
              ? valueB.localeCompare(valueA) // Descending: Z to A
              : valueA.localeCompare(valueB); // Ascending: A to Z
            return result;
          }
        });

        // Rebuild groupedData with sorted keys
        const sortedGroupedData: { [key: string]: DoneDetailData[] } = {};
        sortedRowKeys.forEach(key => {
          const data = groupedData[key];
          if (data) {
            sortedGroupedData[key] = data;
          }
        });

        // Update groupedData reference
        Object.keys(groupedData).forEach(key => delete groupedData[key]);
        Object.assign(groupedData, sortedGroupedData);
        sortedRowKeys = Object.keys(sortedGroupedData);
      }

      // If columns are specified, create cross-tabulation
      if (pivotConfig.columns.length > 0) {
        const pivotResult: { [rowKey: string]: { [colKey: string]: any } } = {};

        // Use sortedRowKeys to maintain sort order
        sortedRowKeys.forEach(rowKey => {
          const rowItems = groupedData[rowKey];
          if (!rowItems) return;

          pivotResult[rowKey] = {};

          // Group by column dimensions
          const colGroups: { [key: string]: DoneDetailData[] } = {};
          rowItems.forEach(item => {
            const colKey = pivotConfig.columns.map(field => String(item[field as keyof DoneDetailData] || '')).join(' | ');
            if (!colGroups[colKey]) {
              colGroups[colKey] = [];
            }
            colGroups[colKey].push(item);
          });

          // Calculate values for each column
          Object.keys(colGroups).forEach(colKey => {
            const colItems = colGroups[colKey];
            if (!colItems) return;

            const values: { [key: string]: number } = {};

            pivotConfig.aggregations.forEach((aggregation) => {
              const field = pivotConfig.valueField;
              const valueKey = aggregation; // Use aggregation as key since each aggregation appears only once

              switch (aggregation) {
                case 'SUM':
                  values[valueKey] = colItems.reduce((sum, item) => sum + (Number(item[field as keyof DoneDetailData]) || 0), 0);
                  break;
                case 'COUNT':
                  values[valueKey] = colItems.length;
                  break;
                case 'AVG':
                  const sum = colItems.reduce((sum, item) => sum + (Number(item[field as keyof DoneDetailData]) || 0), 0);
                  values[valueKey] = colItems.length > 0 ? sum / colItems.length : 0;
                  break;
                case 'MIN':
                  values[valueKey] = Math.min(...colItems.map(item => Number(item[field as keyof DoneDetailData]) || 0));
                  break;
                case 'MAX':
                  values[valueKey] = Math.max(...colItems.map(item => Number(item[field as keyof DoneDetailData]) || 0));
        break;
      }
            });

            if (!pivotResult[rowKey]) {
              pivotResult[rowKey] = {};
            }
            pivotResult[rowKey][colKey] = {
              items: colItems,
              values: values,
              count: colItems.length
            };
          });
        });

        setCustomPivotData({ type: 'cross', data: pivotResult, rows: pivotConfig.rows, columns: pivotConfig.columns, values: pivotConfig.aggregations.map(agg => ({ field: pivotConfig.valueField, aggregation: agg })) });
      } else {
        // Simple pivot (rows only, no columns)
        const pivotResult: { [rowKey: string]: any } = {};

        // Use sortedRowKeys to maintain sort order
        sortedRowKeys.forEach(rowKey => {
          const rowItems = groupedData[rowKey];
          if (!rowItems) return;

          const values: { [key: string]: number } = {};

          pivotConfig.aggregations.forEach((aggregation) => {
            const field = pivotConfig.valueField;
            const valueKey = aggregation; // Use aggregation as key since each aggregation appears only once

            switch (aggregation) {
              case 'SUM':
                values[valueKey] = rowItems.reduce((sum, item) => sum + (Number(item[field as keyof DoneDetailData]) || 0), 0);
        break;
              case 'COUNT':
                values[valueKey] = rowItems.length;
        break;
              case 'AVG':
                const sum = rowItems.reduce((sum, item) => sum + (Number(item[field as keyof DoneDetailData]) || 0), 0);
                values[valueKey] = rowItems.length > 0 ? sum / rowItems.length : 0;
                break;
              case 'MIN':
                values[valueKey] = Math.min(...rowItems.map(item => Number(item[field as keyof DoneDetailData]) || 0));
                break;
              case 'MAX':
                values[valueKey] = Math.max(...rowItems.map(item => Number(item[field as keyof DoneDetailData]) || 0));
        break;
    }
          });

          pivotResult[rowKey] = {
            items: rowItems,
            values: values,
            count: rowItems.length
          };
        });

        setCustomPivotData({ type: 'simple', data: pivotResult, rows: pivotConfig.rows, values: pivotConfig.aggregations.map(agg => ({ field: pivotConfig.valueField, aggregation: agg })) });
      }
    } catch (error) {
      console.error('Error generating pivot:', error);
      setCustomPivotData(null);
    } finally {
      setIsProcessingPivot(false);
    }
  };

  // Generate pivot when config changes
  useEffect(() => {
    if (pivotMode === 'custom' && isDataReady) {
      generateCustomPivot();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pivotConfig, pivotMode, isDataReady, selectedDates]);

  // Helper function to get element at touch point
  const getElementAtPoint = (x: number, y: number): Element | null => {
    if (typeof document !== 'undefined') {
      return document.elementFromPoint(x, y);
    }
    return null;
  };

  // Helper function to find drop zone from element
  const findDropZone = (element: Element | null): 'rows' | 'columns' | 'filters' | 'available' | null => {
    if (!element) return null;
    
    let current: Element | null = element;
    while (current) {
      if (current.hasAttribute && current.hasAttribute('data-drop-zone')) {
        const zone = current.getAttribute('data-drop-zone');
        if (zone === 'rows' || zone === 'columns' || zone === 'filters' || zone === 'available') {
          return zone;
        }
      }
      current = current.parentElement;
    }
    return null;
  };

  // Handle drop logic (shared for mouse and touch) - uses regular pivotConfig
  const handleDrop = (
    fieldId: string,
    source: 'available' | 'rows' | 'columns' | 'filters',
    sourceIndex: number | null,
    targetZone: 'rows' | 'columns' | 'filters' | null
  ) => {
    if (!fieldId || !targetZone) {
      return;
    }

    // Don't do anything if dropping in the same zone (unless moving position within same zone - not implemented yet)
    if (source === targetZone && source !== 'available') {
      return;
    }

    setPivotConfig(prev => {
      const newConfig = { ...prev };

      // Remove from source (only if not from available)
      if (source === 'rows' && sourceIndex !== null) {
        newConfig.rows = prev.rows.filter((_, i) => i !== sourceIndex);
        if (prev.sort?.field === fieldId) {
          delete newConfig.sort;
        }
      } else if (source === 'columns' && sourceIndex !== null) {
        newConfig.columns = prev.columns.filter((_, i) => i !== sourceIndex);
      } else if (source === 'filters' && sourceIndex !== null) {
        newConfig.filters = prev.filters.filter((_, i) => i !== sourceIndex);
      }

      // Add to target
      if (targetZone === 'rows') {
        const isInRows = newConfig.rows.includes(fieldId);
        if (!isInRows) {
          newConfig.rows = [...newConfig.rows, fieldId];
        }
      } else if (targetZone === 'columns') {
        const isInColumns = newConfig.columns.includes(fieldId);
        if (!isInColumns) {
          newConfig.columns = [...newConfig.columns, fieldId];
        }
      } else if (targetZone === 'filters') {
        const isInFilters = newConfig.filters.some(f => f.field === fieldId);
        if (!isInFilters) {
          const filterType = fieldId === 'TRX_TIME' ? 'timeRange' : 'list';
          let initialValues: string[] = [];
          
          if (filterType === 'list') {
            const allData = selectedDates.flatMap(date => doneDetailData.get(date) || []);
            const uniqueValuesSet = new Set<string>();
            allData.forEach(item => {
              const value = item[fieldId as keyof DoneDetailData];
              if (fieldId === 'HAKA_HAKI') {
                uniqueValuesSet.add(value === 1 ? 'HAKA' : 'HAKI');
              } else {
                uniqueValuesSet.add(String(value || ''));
              }
            });
            initialValues = Array.from(uniqueValuesSet);
          }

          const newFilter: any = {
            field: fieldId,
            values: initialValues,
            filterType
          };
          if (filterType === 'timeRange') {
            newFilter.timeRange = { start: '08:00', end: '16:00' };
          }

          newConfig.filters = [...newConfig.filters, newFilter];
        }
      }

      setPivotMode('custom');
      return newConfig;
    });
  };

  // Handle drop logic for temp state (used in Dialog)
  const handleDropTemp = (
    fieldId: string,
    source: 'available' | 'rows' | 'columns' | 'filters',
    sourceIndex: number | null,
    targetZone: 'rows' | 'columns' | 'filters' | 'available' | null
  ) => {
    if (!fieldId || !targetZone) {
      return;
    }

    if (source === targetZone && source !== 'available') {
      return;
    }

    setTempPivotConfig(prev => {
      const newConfig = { ...prev };

      // Remove from source
      if (source === 'rows' && sourceIndex !== null) {
        newConfig.rows = prev.rows.filter((_, i) => i !== sourceIndex);
        if (prev.sort?.field === fieldId) {
          delete newConfig.sort;
        }
      } else if (source === 'columns' && sourceIndex !== null) {
        newConfig.columns = prev.columns.filter((_, i) => i !== sourceIndex);
      } else if (source === 'filters' && sourceIndex !== null) {
        newConfig.filters = prev.filters.filter((_, i) => i !== sourceIndex);
      }

      // If dropping to available fields, just remove (don't add anything)
      if (targetZone === 'available') {
        return newConfig;
      }

      if (targetZone === 'rows') {
        const isInRows = newConfig.rows.includes(fieldId);
        if (!isInRows) {
          newConfig.rows = [...newConfig.rows, fieldId];
        }
      } else if (targetZone === 'columns') {
        const isInColumns = newConfig.columns.includes(fieldId);
        if (!isInColumns) {
          newConfig.columns = [...newConfig.columns, fieldId];
        }
      } else if (targetZone === 'filters') {
        const isInFilters = newConfig.filters.some(f => f.field === fieldId);
        if (!isInFilters) {
          const filterType = fieldId === 'TRX_TIME' ? 'timeRange' : 'list';
          let initialValues: string[] = [];
          
          if (filterType === 'list') {
            const allData = selectedDates.flatMap(date => doneDetailData.get(date) || []);
            const uniqueValuesSet = new Set<string>();
            allData.forEach(item => {
              const value = item[fieldId as keyof DoneDetailData];
              if (fieldId === 'HAKA_HAKI') {
                uniqueValuesSet.add(value === 1 ? 'HAKA' : 'HAKI');
              } else {
                uniqueValuesSet.add(String(value || ''));
              }
            });
            initialValues = Array.from(uniqueValuesSet);
          }

          const newFilter: any = {
            field: fieldId,
            values: initialValues,
            filterType
          };
          if (filterType === 'timeRange') {
            newFilter.timeRange = { start: '08:00', end: '16:00' };
          }

          newConfig.filters = [...newConfig.filters, newFilter];
        }
      }

      return newConfig;
    });
  };

  // Touch event handlers for mobile drag and drop
  useEffect(() => {
    if (!touchDragState?.isDragging) return;

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (touchDragState.isDragging && e.touches.length > 0) {
        const touch = e.touches[0];
        setTouchDragState(prev => prev ? {
          ...prev,
          currentX: touch.clientX,
          currentY: touch.clientY
        } : null);

        // Check which drop zone we're over
        const element = getElementAtPoint(touch.clientX, touch.clientY);
        const dropZone = findDropZone(element);
        setDropZoneHighlight(dropZone);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (touchDragState?.isDragging) {
        if (e.changedTouches.length > 0) {
          const touch = e.changedTouches[0];
          const element = getElementAtPoint(touch.clientX, touch.clientY);
          const dropZone = findDropZone(element);

          if (dropZone && draggedField) {
            handleDrop(draggedField, draggedFromSource || 'available', draggedIndex, dropZone);
          }
        }

        setTouchDragState(null);
        setDropZoneHighlight(null);
        setDraggedField(null);
        setDraggedFromSource(null);
        setDraggedIndex(null);
      }
    };

    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
    document.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [touchDragState, draggedField, draggedFromSource, draggedIndex, pivotConfig, selectedDates, doneDetailData]);

  // Get unique values for filter options
  // const getUniqueValues = (field: keyof DoneDetailData): string[] => {
  //   const allData = selectedDates.flatMap(date => doneDetailData.get(date) || []);
  //   const uniqueValues = [...new Set(allData.map(item => String(item[field])))];
  //   return uniqueValues.sort();
  // };

  // Removed brokerOptions and priceOptions - no longer used


  // Pivot functions
  interface PivotData {
    [key: string]: {
      [date: string]: {
        volume: number;
        count: number;
        avgPrice?: number;
        hakaVolume?: number;
        hakaValue?: number;
        hakaAvg?: number;
        hakiVolume?: number;
        hakiValue?: number;
        hakiAvg?: number;
        buyerOrdNum?: number;
        sellerOrdNum?: number;
      };
    };
  }

  // Pivot functions are now handled by backend API

  // Render custom pivot table from drag and drop config
  const renderCustomPivotTable = (pivotData: any) => {
    if (!pivotData || !pivotData.data) return null;

    const { type, data, rows, columns, values } = pivotData;

    // For rows with multiple dimensions, we need to parse the row keys
    // Row keys are stored as "value1 | value2 | value3" for multiple row dimensions
    // Note: Sorting is already done in generateCustomPivot, so we don't sort again here
    const rowKeys = Object.keys(data);

    // Parse row keys into separate columns if multiple row dimensions
    const parsedRows = rowKeys.map(key => {
      if (rows.length > 1) {
        const parts = key.split(' | ');
        return rows.map((fieldId: string, idx: number) => ({
          fieldId,
          value: parts[idx] || ''
        }));
      } else {
        return [{ fieldId: rows[0] || '', value: key }];
      }
    });

    // Get unique column keys if cross-tabulation
    // Collect all unique column keys from all rows, not just the first row
    const columnKeysSet = new Set<string>();
    if (type === 'cross') {
      rowKeys.forEach(rowKey => {
        if (data[rowKey]) {
          Object.keys(data[rowKey]).forEach(colKey => {
            columnKeysSet.add(colKey);
          });
        }
      });
    }
    const columnKeys = Array.from(columnKeysSet).sort();

    // Parse column keys into separate parts if multiple column dimensions
    const parsedColumns = columnKeys.map((key: string) => {
      if (columns.length > 1) {
        const parts = key.split(' | ');
        return columns.map((fieldId: string, idx: number) => ({
          fieldId,
          value: parts[idx] || ''
        }));
      } else {
        return [{ fieldId: columns[0] || '', value: key }];
      }
    });

    // Pagination
    const totalRows = rowKeys.length;
    const rowsPerPage = itemsPerPage;
    const totalPages = Math.ceil(totalRows / rowsPerPage);
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = Math.min(startIndex + rowsPerPage, totalRows);
    const paginatedRows = rowKeys.slice(startIndex, endIndex);
    const paginatedParsedRows = parsedRows.slice(startIndex, endIndex);
        
        return (
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex flex-col gap-1 w-full sm:w-auto sm:flex-row sm:items-center">
              <Grid3X3 className="w-5 h-5" />
              Pivot Table ({selectedStock})
            </CardTitle>
              </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                {/* Row dimension headers - First row for row dimensions and column group headers */}
                    {type === 'cross' && parsedColumns.length > 0 && columns.length > 1 ? (
                  <>
                    {/* First row: Row dimension headers + Column group headers */}
                    <tr className="border-b border-border bg-muted/50">
                      {rows.map((fieldId: string, idx: number) => (
                        <th
                          key={idx}
                          rowSpan={2}
                          className={`text-left py-2 px-2 font-medium border-r border-border ${idx === 0 ? 'sticky left-0 bg-muted/50 z-10' : ''}`}
                        >
                          {availableFields.find(af => af.id === fieldId)?.label || fieldId}
                        </th>
                      ))}
                      {/* Group columns by their first dimension value */}
                      {(() => {
                        // Group parsedColumns by their first dimension value
                        const groupedCols: { [key: string]: Array<Array<{ fieldId: string; value: string }>> } = {};
                        parsedColumns.forEach((colParts) => {
                          const firstDimValue = colParts[0]?.value || '';
                          if (!groupedCols[firstDimValue]) {
                            groupedCols[firstDimValue] = [];
                          }
                          groupedCols[firstDimValue].push(colParts);
                        });

                        return Object.entries(groupedCols).map(([firstDimValue, colGroups]) => {
                          const totalColspan = colGroups.length * values.length;
                          return (
                            <th
                              key={firstDimValue}
                              colSpan={totalColspan}
                              className="text-center py-2 px-2 font-medium border-l border-border bg-muted/30"
                            >
                              {firstDimValue}
                            </th>
                          );
                        });
                      })()}
                    </tr>
                    {/* Second row: Aggregation headers for each column */}
                    <tr className="border-b border-border bg-muted/50">
                      {parsedColumns.map((_colParts, colIdx: number) => (
                        <React.Fragment key={colIdx}>
                          {values.map((val: any, valIdx: number) => {
                            // Format aggregation label: "Count", "Sum", dll (tanpa nama kolom)
                            const aggregationLabel = val.aggregation === 'COUNT' ? 'Count' :
                              val.aggregation === 'SUM' ? 'Sum' :
                                val.aggregation === 'AVG' ? 'Avg' :
                                  val.aggregation === 'MIN' ? 'Min' :
                                    val.aggregation === 'MAX' ? 'Max' :
                                      val.aggregation;
                            return (
                              <th
                                key={`${colIdx}-${valIdx}`}
                                className="text-center py-2 px-2 font-medium border-l border-border"
                              >
                                {aggregationLabel}
                              </th>
                            );
                          })}
                        </React.Fragment>
                      ))}
                    </tr>
                  </>
                ) : (
                  // Single row header for simple pivot or single column dimension
                  <tr className="border-b border-border bg-muted/50">
                    {rows.map((fieldId: string, idx: number) => (
                      <th
                        key={idx}
                        className={`text-left py-2 px-2 font-medium border-r border-border ${idx === 0 ? 'sticky left-0 bg-muted/50 z-10' : ''}`}
                      >
                        {availableFields.find(af => af.id === fieldId)?.label || fieldId}
                      </th>
                    ))}
                    {type === 'cross' && parsedColumns.length > 0 && (
                      <>
                        {parsedColumns.map((colParts: Array<{ fieldId: string; value: string }>, colIdx: number) => {
                          // Get column value (broker name, etc.)
                          const columnValue = colParts[0]?.value || '';

                          return (
                            <React.Fragment key={colIdx}>
                              {values.map((val: any, valIdx: number) => {
                                // Format aggregation label: "Count - DR", "Sum - DR", etc. (using column value)
                                const aggregationLabel = val.aggregation === 'COUNT' ? `Count - ${columnValue}` :
                                  val.aggregation === 'SUM' ? `Sum - ${columnValue}` :
                                    val.aggregation === 'AVG' ? `Avg - ${columnValue}` :
                                      val.aggregation === 'MIN' ? `Min - ${columnValue}` :
                                        val.aggregation === 'MAX' ? `Max - ${columnValue}` :
                                          `${val.aggregation} - ${columnValue}`;
                                return (
                                  <th
                                    key={`${colIdx}-${valIdx}`}
                                    className="text-center py-2 px-2 font-medium border-l border-border"
                                  >
                                    {aggregationLabel}
                                  </th>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}
                      </>
                    )}
                    {type === 'simple' && values.map((val: any, idx: number) => {
                      // Format aggregation label: "Count", "Sum", etc. (no column value for simple pivot)
                      const aggregationLabel = val.aggregation === 'COUNT' ? 'Count' :
                        val.aggregation === 'SUM' ? 'Sum' :
                          val.aggregation === 'AVG' ? 'Avg' :
                            val.aggregation === 'MIN' ? 'Min' :
                              val.aggregation === 'MAX' ? 'Max' :
                                val.aggregation;
                      return (
                        <th key={idx} className="text-right py-2 px-2 font-medium border-l border-border">
                          {aggregationLabel}
                        </th>
                      );
                    })}
                  </tr>
                )}
              </thead>
              <tbody>
                {paginatedRows.map((rowKey, rowIdx) => {
                  const rowData = data[rowKey];
                  const parsedRow = paginatedParsedRows[rowIdx];
                  if (!rowData || !parsedRow) return null;

                  return (
                    <tr key={rowKey} className={`border-b border-border/50 hover:bg-accent/50 ${rowIdx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}`}>
                      {/* Row dimension values - separate columns */}
                      {parsedRow.map((rowPart: { fieldId: string; value: string }, partIdx: number) => (
                        <td
                          key={partIdx}
                          className={`py-2 px-2 font-medium border-r border-border ${partIdx === 0 ? `sticky left-0 z-10 ${rowIdx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}` : ''}`}
                        >
                          {rowPart.value}
                        </td>
                      ))}
                      {/* Data cells */}
                      {type === 'cross' ? (
                        columnKeys.map(colKey => (
                          <React.Fragment key={colKey}>
                            {values.map((val: any, valIdx: number) => (
                              <td key={`${colKey}-${valIdx}`} className="py-2 px-2 text-right border-l border-border">
                                {(() => {
                                  const valueKey = val.aggregation; // Use aggregation as key
                                  const value = rowData[colKey]?.values[valueKey];
                                  return value !== undefined ? formatNumber(value) : '-';
                                })()}
                              </td>
                            ))}
                          </React.Fragment>
                        ))
                      ) : (
                        values.map((val: any, valIdx: number) => (
                          <td key={valIdx} className="py-2 px-2 text-right border-l border-border">
                            {(() => {
                              const valueKey = val.aggregation; // Use aggregation as key
                              const value = rowData.values[valueKey];
                              return value !== undefined ? formatNumber(value) : '-';
                            })()}
                          </td>
                        ))
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
              </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
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
          )}
        </CardContent>
      </Card>
    );
  };

  // Render pivot table
  const renderPivotTable = (pivotData: PivotData, rowLabel: string, showAvgPrice: boolean = false, showOrdNum: boolean = false) => {
    const rowKeys = Object.keys(pivotData).sort((a, b) => {
      // Try to sort numerically if possible
      const numA = parseFloat(a);
      const numB = parseFloat(b);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numB - numA; // Descending for numbers
      }
      return a.localeCompare(b);
    });

    // Pagination
    const totalRows = rowKeys.length;
    const rowsPerPage = itemsPerPage;
    const totalPages = Math.ceil(totalRows / rowsPerPage);
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = Math.min(startIndex + rowsPerPage, totalRows);
    const paginatedRows = rowKeys.slice(startIndex, endIndex);

    // Calculate totals
    const allRawTransactions = selectedDates.flatMap(date => doneDetailData.get(date) || []);
    const totalTransactions = allRawTransactions.length;
    const totalVolume = allRawTransactions.reduce((sum, t) => sum + (parseInt(t.STK_VOLM.toString()) || 0), 0);

    return (
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex flex-col gap-1 w-full sm:w-auto sm:flex-row sm:items-center">
              <Grid3X3 className="w-5 h-5" />
              Pivot View - {rowLabel} ({selectedStock})
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-2 px-2 font-medium border-r-2 border-border sticky left-0 bg-muted/50 z-10">
                    {rowLabel}
                    </th>
                  {selectedDates.map(date => (
                    <React.Fragment key={date}>
                      <th className="text-center py-2 px-2 font-medium bg-blue-50 dark:bg-blue-900/20 border-l border-border" colSpan={showAvgPrice ? 1 : 1}>
                        {formatDisplayDate(date)}
                      </th>
                      {showAvgPrice && (
                        <th className="text-center py-2 px-2 font-medium bg-blue-50 dark:bg-blue-900/20 border-l border-border">
                          Avg Price
                        </th>
                      )}
                      {showOrdNum && (
                        <>
                          <th className="text-center py-2 px-2 font-medium bg-green-50 dark:bg-green-900/20 border-l border-border">
                            HAKA Vol
                          </th>
                          <th className="text-center py-2 px-2 font-medium bg-green-50 dark:bg-green-900/20 border-l border-border">
                            HAKA Avg
                          </th>
                          <th className="text-center py-2 px-2 font-medium bg-red-50 dark:bg-red-900/20 border-l border-border">
                            HAKI Vol
                          </th>
                          <th className="text-center py-2 px-2 font-medium bg-red-50 dark:bg-red-900/20 border-l border-border">
                            HAKI Avg
                          </th>
                          <th className="text-center py-2 px-2 font-medium bg-purple-50 dark:bg-purple-900/20 border-l border-border">
                            OrdNum
                          </th>
                        </>
                      )}
                    </React.Fragment>
                  ))}
                  <th className="text-right py-2 px-2 font-medium bg-muted/30 border-l-2 border-border">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((rowKey, rowIdx) => {
                  const rowData = pivotData[rowKey];
                  if (!rowData) return null;
                  const rowTotal = selectedDates.reduce((sum, date) => {
                    return sum + (rowData[date]?.volume || 0);
                  }, 0);

                  return (
                    <tr key={rowKey} className={`border-b border-border/50 hover:bg-accent/50 ${rowIdx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}`}>
                      <td className={`py-2 px-2 font-medium border-r-2 border-border sticky left-0 z-10 ${rowIdx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}`}>
                        {rowKey}
                      </td>
                      {selectedDates.map(date => {
                        const data = rowData[date];
                      return (
                        <React.Fragment key={date}>
                            <td className="py-2 px-2 text-right border-l border-border">
                              <div className="font-medium">{data ? formatNumber(data.volume) : '-'}</div>
                              <div className="text-xs text-muted-foreground">
                                {data ? `(${data.count})` : ''}
                              </div>
                          </td>
                            {showAvgPrice && (
                              <td className="py-2 px-2 text-right border-l border-border">
                                {data?.avgPrice ? formatNumber(Math.round(data.avgPrice)) : '-'}
                          </td>
                            )}
                            {showOrdNum && (
                              <>
                                <td className="py-2 px-2 text-right border-l border-border">
                                  {data?.hakaVolume ? formatNumber(data.hakaVolume) : '-'}
                          </td>
                                <td className="py-2 px-2 text-right border-l border-border">
                                  {data?.hakaAvg ? formatNumber(Math.round(data.hakaAvg)) : '-'}
                          </td>
                                <td className="py-2 px-2 text-right border-l border-border">
                                  {data?.hakiVolume ? formatNumber(data.hakiVolume) : '-'}
                          </td>
                                <td className="py-2 px-2 text-right border-l border-border">
                                  {data?.hakiAvg ? formatNumber(Math.round(data.hakiAvg)) : '-'}
                          </td>
                                <td className="py-2 px-2 text-right border-l border-border">
                                  {data?.buyerOrdNum !== undefined ? data.buyerOrdNum : data?.sellerOrdNum !== undefined ? data.sellerOrdNum : '-'}
                          </td>
                              </>
                            )}
                        </React.Fragment>
                      );
                    })}
                      <td className="py-2 px-2 text-right font-medium border-l-2 border-border bg-muted/30">
                        {formatNumber(rowTotal)}
                      </td>
                  </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/50 font-medium">
                  <td className="py-2 px-2 border-r-2 border-border sticky left-0 bg-muted/50 z-10">
                    Total
                  </td>
                  {selectedDates.map(date => {
                    const dateTotal = Object.values(pivotData).reduce((sum, rowData) => {
                      return sum + (rowData[date]?.volume || 0);
                    }, 0);
                    return (
                      <React.Fragment key={date}>
                        <td className="py-2 px-2 text-right border-l border-border">
                          {formatNumber(dateTotal)}
                        </td>
                        {showAvgPrice && <td className="py-2 px-2 border-l border-border"></td>}
                        {showOrdNum && (
                          <>
                            <td className="py-2 px-2 border-l border-border"></td>
                            <td className="py-2 px-2 border-l border-border"></td>
                            <td className="py-2 px-2 border-l border-border"></td>
                            <td className="py-2 px-2 border-l border-border"></td>
                            <td className="py-2 px-2 border-l border-border"></td>
                          </>
                        )}
                      </React.Fragment>
                    );
                  })}
                  <td className="py-2 px-2 text-right border-l-2 border-border">
                    {formatNumber(totalVolume)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
             <div className="flex items-center gap-4 text-sm text-muted-foreground">
               <div>
                Showing {startIndex + 1} to {endIndex} of {totalRows} {rowLabel.toLowerCase()}
               </div>
               <div className="flex items-center gap-2">
                 <label className="text-xs">Rows per page:</label>
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
                <span className="text-muted-foreground">Unique {rowLabel}:</span>
                <div className="font-medium">{totalRows}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Current Page:</span>
                <div className="font-medium">{currentPage} of {totalPages}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  // Render buyer-seller cross pivot
  const renderBuyerSellerCrossPivot = () => {
    const pivotData = pivotDataFromBackend || {};
    const buyers = Object.keys(pivotData).sort();
    const sellers = new Set<string>();
    buyers.forEach(buyer => {
      const buyerData = pivotData[buyer];
      if (buyerData) {
        Object.keys(buyerData).forEach(seller => sellers.add(seller));
      }
    });
    const sellerList = Array.from(sellers).sort();

    // Pagination for buyers
    const totalBuyers = buyers.length;
    const rowsPerPage = itemsPerPage;
    const totalPages = Math.ceil(totalBuyers / rowsPerPage);
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = Math.min(startIndex + rowsPerPage, totalBuyers);
    const paginatedBuyers = buyers.slice(startIndex, endIndex);

    const allRawTransactions = selectedDates.flatMap(date => doneDetailData.get(date) || []);
    const totalTransactions = allRawTransactions.length;
    const totalVolume = allRawTransactions.reduce((sum, t) => sum + (parseInt(t.STK_VOLM.toString()) || 0), 0);

                return (
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex flex-col gap-1 w-full sm:w-auto sm:flex-row sm:items-center">
              <Grid3X3 className="w-5 h-5" />
              Pivot View - Buyer vs Seller Cross ({selectedStock})
            </CardTitle>
                    </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-2 px-2 font-medium border-r-2 border-border sticky left-0 bg-muted/50 z-10">
                    Buyer \ Seller
                  </th>
                  {sellerList.map(seller => (
                    <th key={seller} className="text-center py-2 px-2 font-medium bg-blue-50 dark:bg-blue-900/20 border-l border-border min-w-[80px]">
                      {seller}
                    </th>
                  ))}
                  <th className="text-right py-2 px-2 font-medium bg-muted/30 border-l-2 border-border">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedBuyers.map((buyer, buyerIdx) => {
                  const buyerData = pivotData[buyer];
                  if (!buyerData) return null;
                  const buyerTotal = sellerList.reduce((sum, seller) => {
                    const sellerData = buyerData[seller];
                    if (!sellerData) return sum;
                    return sum + selectedDates.reduce((dateSum, date) => {
                      return dateSum + (sellerData[date]?.volume || 0);
                    }, 0);
                  }, 0);

                  return (
                    <tr key={buyer} className={`border-b border-border/50 hover:bg-accent/50 ${buyerIdx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}`}>
                      <td className={`py-2 px-2 font-medium border-r-2 border-border sticky left-0 z-10 ${buyerIdx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}`}>
                        {buyer}
                      </td>
                      {sellerList.map(seller => {
                        const sellerData = buyerData[seller];
                        const cellTotal = sellerData ? selectedDates.reduce((sum, date) => {
                          return sum + (sellerData[date]?.volume || 0);
                        }, 0) : 0;
                        const cellCount = sellerData ? selectedDates.reduce((sum, date) => {
                          return sum + (sellerData[date]?.count || 0);
                        }, 0) : 0;

                        return (
                          <td key={seller} className="py-2 px-2 text-right border-l border-border">
                            {cellTotal > 0 ? (
                              <>
                                <div className="font-medium">{formatNumber(cellTotal)}</div>
                                <div className="text-xs text-muted-foreground">({cellCount})</div>
                              </>
                            ) : (
                              '-'
                            )}
                          </td>
                );
              })}
                      <td className="py-2 px-2 text-right font-medium border-l-2 border-border bg-muted/30">
                        {formatNumber(buyerTotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/50 font-medium">
                  <td className="py-2 px-2 border-r-2 border-border sticky left-0 bg-muted/50 z-10">
                    Total
                  </td>
                  {sellerList.map(seller => {
                    const sellerTotal = buyers.reduce((sum, buyer) => {
                      const buyerData = pivotData[buyer];
                      if (!buyerData) return sum;
                      const sellerData = buyerData[seller];
                      if (!sellerData) return sum;
                      return sum + selectedDates.reduce((dateSum, date) => {
                        return dateSum + (sellerData[date]?.volume || 0);
                      }, 0);
                    }, 0);
                    return (
                      <td key={seller} className="py-2 px-2 text-right border-l border-border">
                        {formatNumber(sellerTotal)}
                      </td>
                    );
                  })}
                  <td className="py-2 px-2 text-right border-l-2 border-border">
                    {formatNumber(totalVolume)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div>
                Showing {startIndex + 1} to {endIndex} of {totalBuyers} buyers
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs">Rows per page:</label>
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
                <span className="text-muted-foreground">Unique Buyers:</span>
                <div className="font-medium">{buyers.length}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Unique Sellers:</span>
                <div className="font-medium">{sellerList.length}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  // Removed renderHorizontalView - no longer used (Transaction Details view)



  return (
  <div className="w-full">
      {/* Top Controls - Compact without Card, similar to DoneSummary */}
      {/* Pada layar kecil/menengah menu ikut scroll; hanya di layar besar (lg+) yang fixed di top */}
      <div className="bg-[#0a0f20] border-b border-[#3a4252] px-4 py-1 lg:fixed lg:top-14 lg:left-20 lg:right-0 lg:z-40">
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
                  const suggestions = (stockInput === '' ? STOCK_LIST : filteredStocks).slice(0, 10);
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
                className="w-full md:w-32 h-9 min-h-[36px] max-h-[36px] pl-10 pr-4 text-sm border border-input rounded-md bg-background text-foreground box-border flex items-center leading-none"
                style={{ height: '36px', lineHeight: '36px' }}
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

            {/* Date Range */}
          <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
            <label className="text-sm font-medium whitespace-nowrap">Date Range:</label>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div
                className="relative h-9 min-h-[36px] max-h-[36px] flex-1 md:w-36 rounded-md border border-input bg-background cursor-pointer hover:bg-accent/50 transition-colors box-border leading-none"
                style={{ height: '36px' }}
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
                <div className="flex items-center justify-between h-full px-4">
                  <span className="text-sm text-foreground leading-none">
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
                className="relative h-9 min-h-[36px] max-h-[36px] flex-1 md:w-36 rounded-md border border-input bg-background cursor-pointer hover:bg-accent/50 transition-colors box-border leading-none"
                style={{ height: '36px' }}
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
                <div className="flex items-center justify-between h-full px-4">
                  <span className="text-sm text-foreground leading-none">
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

          {/* Customize Field Button */}
          <button
            onClick={() => {
              setTempPivotConfig(pivotConfig);
              setTempFilterSearchTerms(filterSearchTerms);
              setTempOpenFilterDropdowns(openFilterDropdowns);
              setIsPivotBuilderOpen(true);
            }}
            className="h-9 min-h-[36px] max-h-[36px] px-4 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/90 transition-colors text-sm font-medium whitespace-nowrap flex items-center justify-center gap-2 w-full md:w-auto box-border leading-none"
            style={{ height: '36px' }}
          >
            <Settings className="w-4 h-4" />
            Customize Field
          </button>

          {/* Show Button - Generate date array and fetch from Azure */}
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
              // Data will be fetched automatically via useEffect when selectedDates changes
            }}
            disabled={isLoading || !selectedStock || !startDate || !endDate}
            className="h-9 min-h-[36px] max-h-[36px] px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium whitespace-nowrap flex items-center justify-center w-full md:w-auto box-border leading-none"
            style={{ height: '36px' }}
          >
            Show
          </button>
              </div>
            </div>

      {/* Spacer untuk header fixed - hanya diperlukan di layar besar (lg+) */}
      <div className="h-0 lg:h-[38px]"></div>

      {/* Pivot Builder Dialog */}
      <Dialog open={isPivotBuilderOpen} onOpenChange={setIsPivotBuilderOpen}>
        <DialogContent className="max-w-[90vw] sm:max-w-[80vw] md:max-w-[70vw] lg:max-w-[60vw] max-h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="flex-shrink-0 bg-background border-b px-4 py-3">
            <DialogTitle className="text-base">Customize Pivot Table Fields</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto min-h-0">
          <div className="py-3">
      {/* Drag and Drop Pivot Builder Section */}
      <div className="px-3 py-3 border-b border-[#3a4252] bg-[#0a0f20]">

        <div className="flex flex-col lg:flex-row gap-3">
          {/* Field List (Left Sidebar) */}
          <div 
            data-drop-zone="available"
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (draggedField && draggedFromSource && draggedFromSource !== 'available') {
                handleDropTemp(draggedField, draggedFromSource, draggedIndex, 'available');
              }
              setDraggedField(null);
              setDraggedFromSource(null);
              setDraggedIndex(null);
            }}
            className={`w-full lg:w-1/3 border border-[#3a4252] rounded-lg p-2 bg-[#1a1f30] transition-colors ${
              dropZoneHighlight === 'available' 
                ? 'border-primary bg-primary/10' 
                : ''
            }`}
          >
            <div className="text-xs font-semibold text-foreground mb-2">Available Fields</div>
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {availableFields.map(field => (
                <div
                  key={field.id}
                  draggable
                  onDragStart={(e) => {
                    setDraggedField(field.id);
                    setDraggedFromSource('available');
                    setDraggedIndex(null);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => {
                    setDraggedField(null);
                    setDraggedFromSource(null);
                    setDraggedIndex(null);
                  }}
                  onTouchStart={(e) => {
                    const touch = e.touches[0];
                    setDraggedField(field.id);
                    setDraggedFromSource('available');
                    setDraggedIndex(null);
                    setTouchDragState({
                      isDragging: true,
                      startX: touch.clientX,
                      startY: touch.clientY,
                      currentX: touch.clientX,
                      currentY: touch.clientY
                    });
                  }}
                  className="flex items-center gap-1.5 p-1.5 bg-background rounded border border-[#3a4252] cursor-move hover:bg-accent/50 active:bg-accent transition-colors touch-none"
                  style={{
                    opacity: touchDragState?.isDragging && draggedField === field.id ? 0.5 : 1
                  }}
                >
                  <GripVertical className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-foreground flex-1">{field.label}</span>
                  <span className="text-xs text-muted-foreground px-1 py-0.5 rounded bg-muted">
                    {field.type === 'measure' ? 'M' : 'D'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Pivot Configuration Areas */}
          <div className="w-full lg:w-2/3 grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Rows */}
            <div
              data-drop-zone="rows"
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (draggedField && draggedFromSource) {
                  handleDropTemp(draggedField, draggedFromSource, draggedIndex, 'rows');
                }
                setDraggedField(null);
                setDraggedFromSource(null);
                setDraggedIndex(null);
              }}
              className={`border rounded-lg p-2 bg-[#1a1f30] min-h-[100px] transition-colors ${
                dropZoneHighlight === 'rows' 
                  ? 'border-primary bg-primary/10' 
                  : 'border-[#3a4252]'
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div className="text-xs font-semibold text-muted-foreground uppercase">Rows</div>
                <div className="relative group">
                  <Info className="w-3 h-3 text-muted-foreground cursor-help" />
                  <div className="absolute left-0 top-full mt-2 w-56 p-2 bg-popover border border-border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[9999] pointer-events-none text-xs">
                    <div className="text-xs text-popover-foreground mb-1"><strong>Baris - akan menjadi kolom pertama</strong></div>
                    <div className="text-xs text-muted-foreground">Contoh: Price → setiap baris menampilkan harga yang berbeda</div>
              </div>
                </div>
              </div>
              <div className="space-y-1">
                {tempPivotConfig.rows.map((fieldId, idx) => {
                  const field = availableFields.find(f => f.id === fieldId);
                  const isPrice = fieldId === 'STK_PRIC';
                  const isDragging = draggedField === fieldId && draggedFromSource === 'rows';
                  return field ? (
                    <div 
                      key={idx} 
                      draggable
                      onDragStart={(e) => {
                        setDraggedField(fieldId);
                        setDraggedFromSource('rows');
                        setDraggedIndex(idx);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragEnd={() => {
                        setDraggedField(null);
                        setDraggedFromSource(null);
                        setDraggedIndex(null);
                      }}
                      onTouchStart={(e) => {
                        e.stopPropagation();
                        const touch = e.touches[0];
                        setDraggedField(fieldId);
                        setDraggedFromSource('rows');
                        setDraggedIndex(idx);
                        setTouchDragState({
                          isDragging: true,
                          startX: touch.clientX,
                          startY: touch.clientY,
                          currentX: touch.clientX,
                          currentY: touch.clientY
                        });
                      }}
                       className={`p-1.5 bg-background rounded border border-[#3a4252] cursor-move hover:bg-accent/50 transition-colors touch-none ${
                         isDragging ? 'opacity-50' : ''
                       }`}
                     >
                       <div className="flex items-center gap-1.5">
                        <GripVertical className="w-3 h-3 text-muted-foreground" />
                         <span className="text-xs text-foreground flex-1">{field.label}</span>
                        {isPrice && (
                <select 
                            value={tempPivotConfig.sort?.field === 'STK_PRIC' ? tempPivotConfig.sort.direction : 'desc'}
                            onChange={(e) => {
                              setTempPivotConfig(prev => ({
                                ...prev,
                                sort: { field: 'STK_PRIC', direction: e.target.value as 'asc' | 'desc' }
                              }));
                            }}
                            className="text-[10px] bg-background border border-[#3a4252] rounded px-1 py-0.5 h-5 leading-none"
                            onClick={(e) => e.stopPropagation()}
                            onTouchStart={(e) => e.stopPropagation()}
                          >
                            <option value="desc">Desc</option>
                            <option value="asc">Asc</option>
                </select>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setTempPivotConfig(prev => {
                              const newRows = prev.rows.filter((_, i) => i !== idx);
                              // Remove sort if the sorted field is removed
                              if (prev.sort?.field === fieldId) {
                                const { sort, ...rest } = prev;
                                return { ...rest, rows: newRows };
                              }
                              return { ...prev, rows: newRows };
                            });
                          }}
                          onTouchStart={(e) => e.stopPropagation()}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-3 h-3" />
                        </button>
              </div>
                    </div>
                  ) : null;
                })}
                {tempPivotConfig.rows.length === 0 && (
                  <div className="text-xs text-muted-foreground italic py-4 text-center">Drop fields here</div>
                )}
            </div>
          </div>

            {/* Columns */}
            <div
              data-drop-zone="columns"
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (draggedField && draggedFromSource) {
                  handleDropTemp(draggedField, draggedFromSource, draggedIndex, 'columns');
                }
                setDraggedField(null);
                setDraggedFromSource(null);
                setDraggedIndex(null);
              }}
              className={`border rounded-lg p-2 bg-[#1a1f30] min-h-[100px] transition-colors ${
                dropZoneHighlight === 'columns' 
                  ? 'border-primary bg-primary/10' 
                  : 'border-[#3a4252]'
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div className="text-xs font-semibold text-muted-foreground uppercase">Columns</div>
                <div className="relative group">
                  <Info className="w-3 h-3 text-muted-foreground cursor-help" />
                  <div className="absolute right-0 top-full mt-2 w-56 p-2 bg-popover border border-border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[9999] pointer-events-none text-xs">
                    <div className="text-xs text-popover-foreground mb-1"><strong>Kolom - akan menjadi header horizontal</strong></div>
                    <div className="text-xs text-muted-foreground">Contoh: Broker → setiap kolom menampilkan broker yang berbeda</div>
              </div>
                </div>
              </div>
              <div className="space-y-1">
                {tempPivotConfig.columns.map((fieldId, idx) => {
                  const field = availableFields.find(f => f.id === fieldId);
                  const isDragging = draggedField === fieldId && draggedFromSource === 'columns';
                  return field ? (
                    <div 
                      key={idx} 
                      draggable
                      onDragStart={(e) => {
                        setDraggedField(fieldId);
                        setDraggedFromSource('columns');
                        setDraggedIndex(idx);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragEnd={() => {
                        setDraggedField(null);
                        setDraggedFromSource(null);
                        setDraggedIndex(null);
                      }}
                      onTouchStart={(e) => {
                        e.stopPropagation();
                        const touch = e.touches[0];
                        setDraggedField(fieldId);
                        setDraggedFromSource('columns');
                        setDraggedIndex(idx);
                        setTouchDragState({
                          isDragging: true,
                          startX: touch.clientX,
                          startY: touch.clientY,
                          currentX: touch.clientX,
                          currentY: touch.clientY
                        });
                      }}
                      className={`flex items-center gap-1.5 p-1.5 bg-background rounded border border-[#3a4252] cursor-move hover:bg-accent/50 transition-colors touch-none ${
                        isDragging ? 'opacity-50' : ''
                      }`}
                    >
                      <GripVertical className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-foreground flex-1">{field.label}</span>
                    <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setTempPivotConfig(prev => ({ ...prev, columns: prev.columns.filter((_, i) => i !== idx) }));
                        }}
                        onTouchStart={(e) => e.stopPropagation()}
                        className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    </div>
                  ) : null;
                })}
                {tempPivotConfig.columns.length === 0 && (
                  <div className="text-xs text-muted-foreground italic py-4 text-center">Drop fields here</div>
                )}
              </div>
            </div>

            {/* Values */}
            <div className="border border-[#3a4252] rounded-lg p-2 bg-[#1a1f30] min-h-[100px]">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="text-xs font-semibold text-muted-foreground uppercase">Values</div>
                <div className="relative group">
                  <Info className="w-3 h-3 text-muted-foreground cursor-help" />
                  <div className="absolute left-0 top-full mt-2 w-56 p-2 bg-popover border border-border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[9999] pointer-events-none text-xs">
                    <div className="text-xs text-popover-foreground mb-1"><strong>Pilih aggregation untuk Volume</strong></div>
                    <div className="text-xs text-muted-foreground">Volume secara default sudah ada. Centang aggregation yang ingin ditampilkan.</div>
              </div>
              </div>
              </div>
              <div className="space-y-1.5">
                <div className="p-1.5 bg-background rounded border border-[#3a4252]">
                  <div className="text-xs text-foreground font-medium mb-1.5">Volume</div>
                  <div className="space-y-1.5">
                    {(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'] as const).map((agg) => (
                      <label key={agg} className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={tempPivotConfig.aggregations.includes(agg)}
                          onChange={(e) => {
                            setTempPivotConfig(prev => {
                              if (e.target.checked) {
                                // Add aggregation if checked
                                return {
                                  ...prev,
                                  aggregations: [...prev.aggregations, agg]
                                };
                              } else {
                                // Remove aggregation if unchecked (but keep at least one)
                                const newAggregations = prev.aggregations.filter(a => a !== agg);
                                if (newAggregations.length === 0) {
                                  // If removing last one, keep COUNT as default
                                  return { ...prev, aggregations: ['COUNT'] };
                                }
                                return { ...prev, aggregations: newAggregations };
                              }
                            });
                          }}
                          className="w-3 h-3"
                        />
                        <span className="text-xs text-foreground leading-none">
                          {agg === 'COUNT' ? 'Count' :
                            agg === 'SUM' ? 'Sum' :
                              agg === 'AVG' ? 'Avg' :
                                agg === 'MIN' ? 'Min' :
                                  agg === 'MAX' ? 'Max' : agg}
                        </span>
                      </label>
              ))}
            </div>
          </div>
              </div>
            </div>

            {/* Filters */}
            <div
              data-drop-zone="filters"
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (draggedField && draggedFromSource) {
                  handleDropTemp(draggedField, draggedFromSource, draggedIndex, 'filters');
                }
                setDraggedField(null);
                setDraggedFromSource(null);
                setDraggedIndex(null);
              }}
              className={`border rounded-lg p-2 bg-[#1a1f30] min-h-[100px] transition-colors ${
                dropZoneHighlight === 'filters' 
                  ? 'border-primary bg-primary/10' 
                  : 'border-[#3a4252]'
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div className="text-xs font-semibold text-muted-foreground uppercase">Filters</div>
                <div className="relative group">
                  <Info className="w-3 h-3 text-muted-foreground cursor-help" />
                  <div className="absolute right-0 top-full mt-2 w-56 p-2 bg-popover border border-border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[9999] pointer-events-none text-xs">
                    <div className="text-xs text-popover-foreground mb-1"><strong>Filter data sebelum dihitung</strong></div>
                    <div className="text-xs text-muted-foreground">Contoh: Buyer Broker → pilih broker tertentu, Transaction Time → pilih range waktu</div>
              </div>
                </div>
              </div>
              <div className="space-y-2">
                {tempPivotConfig.filters.map((filterConfig, idx) => {
                  const field = availableFields.find(f => f.id === filterConfig.field);
                  if (!field) return null;

                  // Time range filter
                  if (filterConfig.filterType === 'timeRange') {
                    const isDragging = draggedField === filterConfig.field && draggedFromSource === 'filters';
                    return (
                      <div 
                        key={idx} 
                        draggable
                        onDragStart={(e) => {
                          setDraggedField(filterConfig.field);
                          setDraggedFromSource('filters');
                          setDraggedIndex(idx);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragEnd={() => {
                          setDraggedField(null);
                          setDraggedFromSource(null);
                          setDraggedIndex(null);
                        }}
                        onTouchStart={(e) => {
                          e.stopPropagation();
                          const touch = e.touches[0];
                          setDraggedField(filterConfig.field);
                          setDraggedFromSource('filters');
                          setDraggedIndex(idx);
                          setTouchDragState({
                            isDragging: true,
                            startX: touch.clientX,
                            startY: touch.clientY,
                            currentX: touch.clientX,
                            currentY: touch.clientY
                          });
                        }}
                        className={`p-1.5 bg-background rounded border border-[#3a4252] cursor-move hover:bg-accent/50 transition-colors touch-none ${
                          isDragging ? 'opacity-50' : ''
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <GripVertical className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs text-foreground flex-1 font-medium">{field.label}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setPivotConfig(prev => ({ ...prev, filters: prev.filters.filter((_, i) => i !== idx) }));
                            }}
                            onTouchStart={(e) => e.stopPropagation()}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <input
                            type="time"
                            value={filterConfig.timeRange?.start || '08:00'}
                            onChange={(e) => {
                              const newFilters = [...tempPivotConfig.filters];
                              if (newFilters[idx]) {
                                newFilters[idx].timeRange = {
                                  ...(newFilters[idx].timeRange || { start: '08:00', end: '16:00' }),
                                  start: e.target.value
                                };
                                setTempPivotConfig(prev => ({ ...prev, filters: newFilters }));
                              }
                            }}
                            className="text-xs bg-background border border-[#3a4252] rounded px-2 py-1"
                          />
                          <span className="text-xs text-muted-foreground">to</span>
                          <input
                            type="time"
                            value={filterConfig.timeRange?.end || '16:00'}
                            onChange={(e) => {
                              const newFilters = [...tempPivotConfig.filters];
                              if (newFilters[idx]) {
                                newFilters[idx].timeRange = {
                                  ...(newFilters[idx].timeRange || { start: '08:00', end: '16:00' }),
                                  end: e.target.value
                                };
                                setTempPivotConfig(prev => ({ ...prev, filters: newFilters }));
                              }
                            }}
                            className="text-xs bg-background border border-[#3a4252] rounded px-2 py-1"
                          />
                        </div>
                      </div>
                    );
                  }

                  // List filter with compact searchable dropdown (for broker, price, HAKA/HAKI, etc)
                  const allData = selectedDates.flatMap(date => doneDetailData.get(date) || []);
                  // For numeric fields like price and HAKA_HAKI, sort numerically; otherwise sort alphabetically
                  const uniqueValues = [...new Set(allData.map(item => {
                    const value = item[filterConfig.field as keyof DoneDetailData];
                    // For HAKA_HAKI, convert 1 to "HAKA" and 0 to "HAKI" for display
                    if (filterConfig.field === 'HAKA_HAKI') {
                      return value === 1 ? 'HAKA' : 'HAKI';
                    }
                    return String(value || '');
                  }))].sort((a, b) => {
                    // For HAKA/HAKI, sort HAKA first
                    if (filterConfig.field === 'HAKA_HAKI') {
                      if (a === 'HAKA' && b === 'HAKI') return -1;
                      if (a === 'HAKI' && b === 'HAKA') return 1;
                      return a.localeCompare(b);
                    }
                    // Try numeric sort first (for price)
                    const numA = parseFloat(a);
                    const numB = parseFloat(b);
                    if (!isNaN(numA) && !isNaN(numB)) {
                      return numA - numB;
                    }
                    // Otherwise alphabetical sort
                    return a.localeCompare(b);
                  });
                  const searchTerm = tempFilterSearchTerms[filterConfig.field] || '';
                  const isDropdownOpen = tempOpenFilterDropdowns[filterConfig.field] || false;
                  const filteredValues = uniqueValues.filter(v =>
                    v.toLowerCase().includes(searchTerm.toLowerCase())
                  );

                  const isDragging = draggedField === filterConfig.field && draggedFromSource === 'filters';
                  return (
                    <div 
                      key={idx} 
                      draggable
                      onDragStart={(e) => {
                        setDraggedField(filterConfig.field);
                        setDraggedFromSource('filters');
                        setDraggedIndex(idx);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragEnd={() => {
                        setDraggedField(null);
                        setDraggedFromSource(null);
                        setDraggedIndex(null);
                      }}
                      onTouchStart={(e) => {
                        e.stopPropagation();
                        const touch = e.touches[0];
                        setDraggedField(filterConfig.field);
                        setDraggedFromSource('filters');
                        setDraggedIndex(idx);
                        setTouchDragState({
                          isDragging: true,
                          startX: touch.clientX,
                          startY: touch.clientY,
                          currentX: touch.clientX,
                          currentY: touch.clientY
                        });
                      }}
                      className={`p-2 bg-background rounded border border-[#3a4252] cursor-move hover:bg-accent/50 transition-colors touch-none ${
                        isDragging ? 'opacity-50' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <GripVertical className="w-3 h-3 text-muted-foreground" />
                        <span className="text-sm text-foreground flex-1 font-medium">{field.label}</span>
                        {filterConfig.values.length > 0 && (
                          <span className="text-xs px-1.5 py-0.5 bg-primary/20 text-primary rounded">
                            {filterConfig.values.length}
                          </span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setTempPivotConfig(prev => ({ ...prev, filters: prev.filters.filter((_, i) => i !== idx) }));
                            const newSearchTerms = { ...tempFilterSearchTerms };
                            delete newSearchTerms[filterConfig.field];
                            setTempFilterSearchTerms(newSearchTerms);
                            const newDropdowns = { ...tempOpenFilterDropdowns };
                            delete newDropdowns[filterConfig.field];
                            setTempOpenFilterDropdowns(newDropdowns);
                          }}
                          onTouchStart={(e) => e.stopPropagation()}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Compact dropdown with search - only show when open */}
                      <div className="relative" data-filter-dropdown>
                        <div
                          className="relative cursor-pointer"
                          onClick={() => setTempOpenFilterDropdowns(prev => ({ ...prev, [filterConfig.field]: !prev[filterConfig.field] }))}
                        >
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                          <input
                            type="text"
                            placeholder={filterConfig.values.length > 0 ? `${filterConfig.values.length} selected - Click to search` : "Click to search and select..."}
                            value={searchTerm}
                            onChange={(e) => {
                              setTempFilterSearchTerms(prev => ({ ...prev, [filterConfig.field]: e.target.value }));
                              setTempOpenFilterDropdowns(prev => ({ ...prev, [filterConfig.field]: true }));
                            }}
                            onFocus={() => {
                              setTempOpenFilterDropdowns(prev => ({ ...prev, [filterConfig.field]: true }));
                            }}
                            className="w-full pl-7 pr-2 py-1.5 text-xs bg-background border border-[#3a4252] rounded cursor-text"
                            readOnly={!isDropdownOpen}
                          />
                        </div>

                        {/* Dropdown list - show when open */}
                        {isDropdownOpen && (
                          <div className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-popover border border-[#3a4252] rounded shadow-lg z-50">
                            {filteredValues.length > 0 ? (
                              <>
                                {/* "All" option */}
                                <label
                                  className="flex items-center gap-2 px-2 py-1.5 hover:bg-accent cursor-pointer border-b-2 border-[#3a4252] font-medium bg-muted/30"
                                >
                                  <input
                                    type="checkbox"
                                    checked={filterConfig.values.length === uniqueValues.length && uniqueValues.length > 0}
                                    onChange={(e) => {
                                      const newFilters = [...tempPivotConfig.filters];
                                      const currentFilter = newFilters[idx];
                                      if (currentFilter) {
                                        if (e.target.checked) {
                                          // Select all unique values
                                          currentFilter.values = [...uniqueValues];
                                        } else {
                                          // Deselect all
                                          currentFilter.values = [];
                                        }
                                        setTempPivotConfig(prev => ({ ...prev, filters: newFilters }));
                                      }
                                    }}
                                    className="w-3 h-3"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <span className="text-xs text-foreground flex-1 font-semibold">All ({uniqueValues.length})</span>
                                </label>
                                {/* Individual values */}
                                {filteredValues.map(value => (
                                  <label
                                    key={value}
                                    className="flex items-center gap-2 px-2 py-1.5 hover:bg-accent cursor-pointer border-b border-[#3a4252]/50 last:border-b-0"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={filterConfig.values.includes(value)}
                                      onChange={(e) => {
                                        const newFilters = [...tempPivotConfig.filters];
                                        if (newFilters[idx]) {
                                          if (e.target.checked) {
                                            newFilters[idx].values = [...newFilters[idx].values, value];
                                          } else {
                                            newFilters[idx].values = newFilters[idx].values.filter(v => v !== value);
                                          }
                                          setTempPivotConfig(prev => ({ ...prev, filters: newFilters }));
                                        }
                                      }}
                                      className="w-3 h-3"
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                    <span className="text-xs text-foreground flex-1">{value}</span>
                                  </label>
                                ))}
                              </>
                            ) : (
                              <div className="text-xs text-muted-foreground px-2 py-2 text-center">No results found</div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Selected values as compact chips */}
                      {filterConfig.values.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {filterConfig.values.slice(0, 5).map(value => (
                            <div key={value} className="flex items-center gap-1 px-1.5 py-0.5 bg-primary/20 text-primary rounded text-xs">
                              <span>{value}</span>
          <button
                                onClick={() => {
                                  const newFilters = [...tempPivotConfig.filters];
                                  if (newFilters[idx]) {
                                    newFilters[idx].values = newFilters[idx].values.filter(v => v !== value);
                                    setTempPivotConfig(prev => ({ ...prev, filters: newFilters }));
                                  }
                                }}
                                className="hover:bg-primary/30 rounded px-0.5"
                              >
                                <X className="w-2.5 h-2.5" />
          </button>
                            </div>
                          ))}
                          {filterConfig.values.length > 5 && (
                            <div className="text-xs text-muted-foreground px-1.5 py-0.5">
                              +{filterConfig.values.length - 5} more
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {tempPivotConfig.filters.length === 0 && (
                  <div className="text-xs text-muted-foreground italic py-4 text-center">Drop fields here</div>
                )}
              </div>
                      </div>
                    </div>

          </div>
      </div>
          </div>
          
          {/* Help/Example Section - Moved to bottom */}
          <div className="px-3 py-3 border-t border-[#3a4252] bg-[#0a0f20]">
            <div className="p-2 bg-blue-900/20 border border-blue-700/30 rounded-lg">
              <div className="text-xs font-semibold text-blue-300 mb-1.5">💡 Contoh Penggunaan:</div>
              <div className="text-xs text-blue-200 space-y-1">
                <div><strong>Rows:</strong> Price → Setiap baris = harga yang berbeda</div>
                <div><strong>Values:</strong> Volume (SUM) → Jumlah total volume per harga</div>
                <div><strong>Filters:</strong> Buyer Broker = "YP" → Hanya hitung transaksi dari buyer broker YP</div>
                <div className="mt-2 text-blue-300">Hasil: Tabel dengan kolom Price dan Sum Volume, hanya untuk buyer broker YP</div>
              </div>
            </div>
          </div>
          </div>
          <DialogFooter className="flex-shrink-0 bg-background border-t px-4 py-3 flex items-center justify-between sm:justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTempPivotConfig({ rows: [], columns: [], valueField: 'STK_VOLM', aggregations: ['COUNT'], filters: [] });
                setTempFilterSearchTerms({});
                setTempOpenFilterDropdowns({});
              }}
            >
              Reset
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsPivotBuilderOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setPivotConfig(tempPivotConfig);
                  setFilterSearchTerms(tempFilterSearchTerms);
                  setOpenFilterDropdowns(tempOpenFilterDropdowns);
                  setIsPivotBuilderOpen(false);
                }}
              >
                Save
            </Button>
      </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 pt-4">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Loading transaction data...</span>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && !isLoading && (
        <div className="flex items-center justify-center py-8 pt-4">
          <div className="text-sm text-destructive">{error}</div>
        </div>
      )}

      {/* Main Data Display */}
      <div className="pt-2">
        {!isLoading && !error && isDataReady && (
          <>
            {/* Loading indicator for custom pivot */}
            {pivotMode === 'custom' && isProcessingPivot && (
              <Card>
                <CardContent className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" />
                  <span>Processing pivot table...</span>
          </CardContent>
              </Card>
            )}

            {pivotMode === 'buyer_seller_cross' ? (
              pivotDataFromBackend && renderBuyerSellerCrossPivot()
            ) : pivotMode === 'custom' ? (
              // Custom pivot from drag and drop config
              customPivotData ? (
                renderCustomPivotTable(customPivotData)
              ) : (
                <Card>
                  <CardContent className="text-center py-8 text-muted-foreground">
                    {pivotConfig.rows.length === 0 && pivotConfig.columns.length === 0 && pivotConfig.aggregations.length === 0
                      ? 'Drag fields to Rows, Columns, or Values to create a pivot table'
                      : 'No data available'}
                  </CardContent>
      </Card>
              )
            ) : (
              pivotDataFromBackend ? (
                (() => {
                  const label = pivotMode;
                  const showAvgPrice = pivotMode !== 'price';
                  const showOrdNum = pivotMode === 'buyer_broker' ||
                    pivotMode === 'seller_broker' ||
                    pivotMode.includes('buyer_broker') ||
                    pivotMode.includes('seller_broker') ||
                    pivotMode.includes('inv_type_broker') ||
                    pivotMode.includes('trx_type_buyer') ||
                    pivotMode.includes('trx_type_seller');

                  return renderPivotTable(pivotDataFromBackend, label, showAvgPrice, showOrdNum);
                })()
              ) : null
            )}
          </>
        )}
      </div>
    </div>
  );
}
