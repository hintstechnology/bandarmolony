import { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from '../ui/button';
import { Calendar, Search, Loader2, Settings, ChevronDown } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { api } from '../../services/api';
import { STOCK_LIST, loadStockList, searchStocks } from '../../data/stockList';
import { menuPreferencesService } from '../../services/menuPreferences';

// Local Pivot Table Component (Internal customized dependencies)
import PivotTableUI from './dd-pivot-table/PivotTableUI';
import './dd-pivot-table/pivottable.css';
import TableRenderers from './dd-pivot-table/TableRenderers';
import createPlotlyRenderers from './dd-pivot-table/PlotlyRenderers';
import { aggregators } from './dd-pivot-table/Utilities';
import Plot from 'react-plotly.js';

// Create Plotly renderers
const PlotlyRenderers = createPlotlyRenderers(Plot);

interface DoneDetailData {
  STK_CODE: string;
  BRK_COD1: string;
  BRK_COD2: string;
  STK_VOLM: number;
  STK_PRIC: number;
  TRX_DATE: string;
  TRX_TIME: number;
  INV_TYP1: string;
  INV_TYP2: string;
  TYP: string;
  TRX_CODE: number;
  TRX_SESS: number;
  TRX_ORD1: number;
  TRX_ORD2: number;
  HAKA_HAKI: number;
  VALUE: number;
  [key: string]: any;
}

const PAGE_ID = 'stock-transaction-done-detail-2';

// Interface for user preferences
interface UserPreferences {
  selectedStock: string;
  startDate?: string;
  endDate?: string;
  selectedBoard: string;
  selectedInvType: string;
  selectedSession: string;
  selectedBroker: string;
  pivotState?: any;
}

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

export function StockTransactionDoneDetail2({ sidebarOpen }: { sidebarOpen?: boolean }) {
  const { showToast } = useToast();
  const savedPrefs = loadPreferences();

  // Date setup
  const getPreviousBusinessDay = (): string => {
    const today = new Date();
    let previousDay = new Date(today);
    previousDay.setDate(today.getDate() - 1);
    while (previousDay.getDay() === 0 || previousDay.getDay() === 6) {
      previousDay.setDate(previousDay.getDate() - 1);
    }
    const year = previousDay.getFullYear();
    const month = String(previousDay.getMonth() + 1).padStart(2, '0');
    const day = String(previousDay.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const defaultDate = getPreviousBusinessDay();

  // Robustly derive dates from initial preference or default
  const initialDates = useMemo(() => {
    const startStr = savedPrefs?.startDate || defaultDate;
    const endStr = savedPrefs?.endDate || defaultDate;

    const startParts = startStr.split('-').map(Number);
    const endParts = endStr.split('-').map(Number);

    if (startParts.length === 3 && endParts.length === 3) {
      const start = new Date(startParts[0] || 0, (startParts[1] || 1) - 1, startParts[2] || 1);
      const end = new Date(endParts[0] || 0, (endParts[1] || 1) - 1, endParts[2] || 1);

      if (start <= end) {
        const dateArray: string[] = [];
        const currentDate = new Date(start);
        while (currentDate <= end) {
          const dayOfWeek = currentDate.getDay();
          if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            const year = currentDate.getFullYear();
            const month = String(currentDate.getMonth() + 1).padStart(2, '0');
            const day = String(currentDate.getDate()).padStart(2, '0');
            dateArray.push(`${year}-${month}-${day}`);
          }
          currentDate.setDate(currentDate.getDate() + 1);
        }
        const sorted = dateArray.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
        // Return first 7 days to avoid heavy load, or at least the default date if empty
        return sorted.length > 0 ? sorted.slice(0, 7) : [defaultDate];
      }
    }
    return [defaultDate];
  }, [savedPrefs?.startDate, savedPrefs?.endDate, defaultDate]);

  const [selectedDates, setSelectedDates] = useState<string[]>(initialDates);
  const [startDate, setStartDate] = useState(() => savedPrefs?.startDate || defaultDate);
  const [endDate, setEndDate] = useState(() => savedPrefs?.endDate || defaultDate);
  const [selectedStock, setSelectedStock] = useState(() => savedPrefs?.selectedStock || 'PTRO');
  const [stockInput, setStockInput] = useState(() => savedPrefs?.selectedStock || 'PTRO');

  // Data state
  const [_availableStocks] = useState<string[]>(STOCK_LIST);
  const [doneDetailData, setDoneDetailData] = useState<Map<string, DoneDetailData[]>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [_error, setError] = useState<string | null>(null);
  const [showStockSuggestions, setShowStockSuggestions] = useState(false);

  // Pivot Table State
  const [pivotState, setPivotState] = useState<any>(savedPrefs?.pivotState || { rendererName: 'Table' });

  // Global Filters
  const [selectedBoard, setSelectedBoard] = useState(savedPrefs?.selectedBoard || 'All');
  const [selectedInvType, setSelectedInvType] = useState(savedPrefs?.selectedInvType || 'All');
  const [selectedSession, setSelectedSession] = useState(savedPrefs?.selectedSession || 'All');
  const [selectedBroker, setSelectedBroker] = useState(savedPrefs?.selectedBroker || '');
  const [brokerInput, setBrokerInput] = useState(savedPrefs?.selectedBroker || '');

  // Date picker refs
  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load stock list on mount
  useEffect(() => {
    loadStockList();
  }, []);

  // Save preferences with debounce
  useEffect(() => {
    const timeout = setTimeout(() => {
      // Clean pivotState to avoid saving large data or non-serializable objects (functions)
      const cleanPivotState = { ...pivotState };
      delete cleanPivotState.data;
      delete cleanPivotState.renderers;
      delete cleanPivotState.aggregators;
      delete cleanPivotState.onRendererUpdate;
      delete cleanPivotState.sorters;
      delete cleanPivotState.derivedAttributes;

      const preferences: Partial<UserPreferences> = {
        selectedStock,
        selectedBoard,
        selectedInvType,
        selectedSession,
        selectedBroker,
        pivotState: cleanPivotState,
      };
      if (startDate) preferences.startDate = startDate;
      if (endDate) preferences.endDate = endDate;
      savePreferences(preferences);
    }, 500);
    return () => clearTimeout(timeout);
  }, [selectedStock, startDate, endDate, selectedBoard, selectedInvType, selectedSession, selectedBroker, pivotState]);

  // Auto-load data based on dates (Already handled by initial state for mount, 
  // but keeping for any edge cases where prefs might update externally if that ever happens)
  useEffect(() => {
    if (initialDates.length > 0 && selectedDates.length === 0) {
      setSelectedDates(initialDates);
    }
  }, [initialDates, selectedDates.length]);

  // Fetch Data
  useEffect(() => {
    const fetchData = async () => {
      if (!selectedStock || selectedDates.length === 0) return;

      console.log('Fetching data from Azure API:', { selectedStock, selectedDates });
      setIsLoading(true);
      setError(null);

      try {
        const result = await api.getBreakDoneTradeBatch(selectedStock, selectedDates);

        if (result.success && result.data?.dataByDate) {
          const newData = new Map<string, DoneDetailData[]>();
          Object.entries(result.data.dataByDate).forEach(([date, data]: [string, any]) => {
            if (data?.doneTradeData && Array.isArray(data.doneTradeData)) {
              const processedData = data.doneTradeData.map((item: any) => ({
                STK_CODE: String(item.STK_CODE || selectedStock),
                BRK_COD1: String(item.BRK_COD1 || ''),
                BRK_COD2: String(item.BRK_COD2 || ''),
                STK_VOLM: parseFloat(String(item.STK_VOLM || '0')) || 0,
                STK_PRIC: parseFloat(String(item.STK_PRIC || '0')) || 0,
                TRX_DATE: String(item.TRX_DATE || date),
                TRX_TIME: parseInt(String(item.TRX_TIME || '0')) || 0,
                INV_TYP1: String(item.INV_TYP1 || ''),
                INV_TYP2: String(item.INV_TYP2 || ''),
                TYP: String(item.TRX_TYPE || ''),
                TRX_CODE: String(item.TRX_CODE || ''),
                TRX_SESS: parseInt(String(item.TRX_SESS || '0')) || 0,
                TRX_ORD1: parseInt(String(item.TRX_ORD1 || '0')) || 0,
                TRX_ORD2: parseInt(String(item.TRX_ORD2 || '0')) || 0,
                TRX_TYPE: String(item.TRX_TYPE || ''),
                HAKA_HAKI: parseInt(String(item.HAKA_HAKI || '0')) || 0,
                VALUE: parseFloat(String(item.VALUE || '0')) || 0,
              }));
              newData.set(date, processedData);
            }
          });
          setDoneDetailData(newData);
        } else {
          setError('Failed to load done detail data');
          showToast({ type: 'error', title: 'Error', message: result.error || 'Failed to load data' });
        }
      } catch (err) {
        console.error('Error loading data:', err);
        setError('Failed to load done detail data');
        showToast({ type: 'error', title: 'Error', message: 'Failed to load data' });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [selectedStock, selectedDates, showToast]);


  // Prepare data for PivotTable
  const flatData = useMemo(() => {
    const allData = Array.from(doneDetailData.values()).flat();

    // Apply Global Filters
    let filteredData = allData;

    if (selectedBoard !== 'All') {
      filteredData = filteredData.filter(item => item.TYP === selectedBoard);
    }

    if (selectedSession !== 'All') {
      filteredData = filteredData.filter(item => String(item.TRX_SESS) === selectedSession);
    }

    if (selectedInvType !== 'All') {
      filteredData = filteredData.filter(item => {
        if (selectedInvType === 'Foreign') return item.INV_TYP1 === 'F' || item.INV_TYP2 === 'F';
        if (selectedInvType === 'Domestic') return item.INV_TYP1 === 'D' && item.INV_TYP2 === 'D';
        return true;
      });
    }

    if (selectedBroker) {
      filteredData = filteredData.filter(item =>
        item.BRK_COD1 === selectedBroker || item.BRK_COD2 === selectedBroker
      );
    }

    return filteredData;
  }, [doneDetailData, selectedBoard, selectedSession, selectedInvType, selectedBroker]);

  // Handlers
  const handleStockSelect = (stock: string) => {
    setSelectedStock(stock);
    setStockInput(stock);
    setShowStockSuggestions(false);
  };

  const generateDates = () => {
    if (!startDate || !endDate) {
      showToast({ type: 'warning', title: 'Warning', message: 'Please select start and end dates' });
      return;
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      showToast({ type: 'error', title: 'Error', message: 'Invalid dates selected' });
      return;
    }
    if (start > end) {
      showToast({ type: 'warning', title: 'Warning', message: 'Start date cannot be after end date' });
      return;
    }
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays > 30) {
      showToast({ type: 'warning', title: 'Warning', message: 'Date range cannot exceed 30 days' });
      return;
    }

    const dateArray: string[] = [];
    let currentDate = new Date(start);
    while (currentDate <= end) {
      const dayOfWeek = currentDate.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const day = String(currentDate.getDate()).padStart(2, '0');
        dateArray.push(`${year}-${month}-${day}`);
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const sortedDates = dateArray.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    if (sortedDates.length > 7) {
      showToast({ type: 'warning', title: 'Warning', message: 'Maximum 7 trading days allowed' });
      return;
    }
    setSelectedDates(sortedDates);
  };

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowStockSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredStocks = searchStocks(stockInput);

  const formatDateLabel = (date: string) => {
    if (!date) return 'DD/MM/YYYY';
    const [y, m, d] = date.split('-');
    return `${d}/${m}/${y}`;
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#0a0f20]">
      {/* Top Controls - Compact Horizontal Ribbon */}
      <div className={`bg-[#0a0f20] border-b border-[#3a4252] px-4 py-1 lg:sticky lg:top-0 z-40 transition-all duration-300`}>
        <div className="flex flex-row flex-wrap items-center gap-x-6 gap-y-1">

          {/* Ticker Selection */}
          <div className="flex items-center gap-2">
            <label className="text-[13px] font-medium text-white whitespace-nowrap">Ticker:</label>
            <div className="relative" ref={dropdownRef}>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={stockInput}
                onChange={(e) => {
                  setStockInput(e.target.value.toUpperCase());
                  setShowStockSuggestions(true);
                }}
                onFocus={() => setShowStockSuggestions(true)}
                className="w-32 h-9 pl-10 pr-3 bg-background border border-[#3a4252] rounded-md text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/50"
                placeholder="CODE"
              />
              {showStockSuggestions && (
                <div className="absolute top-full left-0 mt-1 w-48 max-h-60 overflow-auto bg-[#161d31] border border-[#3a4252] rounded shadow-xl z-[60]">
                  {filteredStocks.length > 0 ? (
                    filteredStocks.map((stock) => (
                      <div
                        key={stock}
                        className="px-3 py-1.5 hover:bg-[#283046] cursor-pointer text-sm transition-colors text-white"
                        onClick={() => handleStockSelect(stock)}
                      >
                        {stock}
                      </div>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-xs text-muted-foreground text-center">No stocks found</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Date Range */}
          <div className="flex items-center gap-2">
            <label className="text-[13px] font-medium text-white whitespace-nowrap">Date Range:</label>
            <div className="flex items-center gap-2">
              <div
                className="relative h-9 w-36 bg-background border border-[#3a4252] rounded-md flex items-center px-3 cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => startDateRef.current?.showPicker()}
              >
                <Calendar className="w-4 h-4 text-muted-foreground mr-2 pointer-events-none" />
                <span className="text-sm text-white">{formatDateLabel(startDate)}</span>
                <input
                  ref={startDateRef}
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
              <span className="text-sm text-white/50">to</span>
              <div
                className="relative h-9 w-36 bg-background border border-[#3a4252] rounded-md flex items-center px-3 cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => endDateRef.current?.showPicker()}
              >
                <Calendar className="w-4 h-4 text-muted-foreground mr-2 pointer-events-none" />
                <span className="text-sm text-white">{formatDateLabel(endDate)}</span>
                <input
                  ref={endDateRef}
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Board Dropdown */}
          <div className="flex items-center gap-2">
            <label className="text-[13px] font-medium text-white whitespace-nowrap">Board:</label>
            <div className="relative">
              <select
                value={selectedBoard}
                onChange={(e) => setSelectedBoard(e.target.value)}
                className="h-9 min-w-[60px] pl-3 pr-8 bg-background border border-[#3a4252] rounded-md text-sm text-white outline-none cursor-pointer appearance-none"
              >
                <option value="All">All</option>
                <option value="RG">RG</option>
                <option value="TN">TN</option>
                <option value="NG">NG</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* Session Dropdown */}
          <div className="flex items-center gap-2">
            <label className="text-[13px] font-medium text-white whitespace-nowrap">Session:</label>
            <div className="relative">
              <select
                value={selectedSession}
                onChange={(e) => setSelectedSession(e.target.value)}
                className="h-9 min-w-[60px] pl-3 pr-8 bg-background border border-[#3a4252] rounded-md text-sm text-white outline-none cursor-pointer appearance-none"
              >
                <option value="All">All</option>
                <option value="1">1</option>
                <option value="2">2</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* F/D Dropdown */}
          <div className="flex items-center gap-2">
            <label className="text-[13px] font-medium text-white whitespace-nowrap">F/D:</label>
            <div className="relative">
              <select
                value={selectedInvType}
                onChange={(e) => setSelectedInvType(e.target.value)}
                className="h-9 min-w-[60px] pl-3 pr-8 bg-background border border-[#3a4252] rounded-md text-sm text-white outline-none cursor-pointer appearance-none"
              >
                <option value="All">All</option>
                <option value="Foreign">Foreign</option>
                <option value="Domestic">Domestic</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* Show Button - Moved to be directly next to F/D */}
          <Button
            onClick={generateDates}
            className="h-9 bg-white text-black hover:bg-gray-200 font-bold px-6 text-sm transition-colors ml-2"
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-black" /> : 'Show'}
          </Button>
        </div>
      </div>



      {/* Main Content: Pivot Table */}
      <div className="flex-1 min-h-0 overflow-auto dark-pivot-theme">
        {flatData.length > 0 ? (
          <PivotTableUI
            {...pivotState}
            data={flatData}
            onChange={(s: any) => setPivotState(s)}
            renderers={(() => {
              // Robust normalization for ESM interop
              const unwrap = (obj: any) => {
                if (!obj) return {};
                // Handle ESM default export
                if (obj.__esModule && obj.default) return obj.default;
                // Handle nested default
                if (typeof obj === 'object' && obj.default && typeof obj.default === 'object') {
                  return obj.default;
                }
                return obj;
              };

              const tableRend = unwrap(TableRenderers);
              const plotlyRend = unwrap(PlotlyRenderers);

              // Merge and filter out non-component keys
              const merged = { ...tableRend, ...plotlyRend };
              const filtered: Record<string, any> = {};

              for (const key in merged) {
                // Skip module metadata keys
                if (key === 'default' || key === '__esModule' || key === 'Symbol(Symbol.toStringTag)') {
                  continue;
                }
                const value = merged[key];
                // Only include if it's a function or valid React component
                if (typeof value === 'function' || (typeof value === 'object' && value !== null && (value.$$typeof || value.render))) {
                  filtered[key] = value;
                }
              }

              return filtered;
            })()}
            aggregators={aggregators}
            hiddenAttributes={[]}
            hiddenFromDragDrop={['TYP', 'STK_CODE']}
            unusedOrientationCutoff={Infinity} // Prevent unused fields from being hidden too aggressively
            menuLimit={100000}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
            {isLoading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-10 w-10 animate-spin text-primary/50" />
                <p className="text-lg font-medium text-foreground">Loading transaction data...</p>
                <p className="text-sm">This may take a moment for large datasets.</p>
              </div>
            ) : (
              <>
                <Search className="h-16 w-16 mb-4 opacity-20" />
                <p className="text-lg font-medium">No data to display</p>
                <p className="text-sm opacity-70">Select a stock and date range to view transaction details</p>
              </>
            )}
          </div>
        )}
      </div>

      <style>{`
        /* Minimal Dark Mode Overrides for React Pivottable */
        .dark-pivot-theme .pvtUi {
            color: #e2e8f0;
            width: 100%;
            height: 100% !important; /* Force full height */
            border: none !important; /* Remove outer table layout border */
            background-color: transparent !important;
            border-collapse: collapse !important;
            margin: 0 !important;
            padding: 0 !important;
        }
        .dark-pivot-theme .pvtUi > tbody > tr:last-child {
            height: 100%; /* Make the main content row stretch */
        }
        .dark-pivot-theme .pvtOutput {
            height: 100% !important;
            vertical-align: top !important;
        }
        .dark-pivot-theme .pvtOutput > div {
            height: 100% !important;
        }
        .dark-pivot-theme .pvtAttr {
            background: #1e293b !important;
            color: #f8fafc !important;
            border: 1px solid #3a4252 !important;
            border-radius: 4px;
            padding: 4px 10px;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            height: 32px !important; /* Standard height for attributes */
            min-width: fit-content !important; /* Allow width based on content */
            white-space: nowrap !important;
            font-size: 0.75rem !important;
            margin: 2px !important;
            cursor: move;
            flex-shrink: 0 !important; /* Prevent squeezing in flex containers */
        }
        .dark-pivot-theme .pvtTriangle {
            color: #94a3b8 !important;
            font-size: 18px !important;
        }
        
        /* Custom Dropdowns (.pvtDropdown) matching ribbon styling */
        .dark-pivot-theme .pvtDropdown {
            background-color: #161d31 !important;
            border: 1px solid #3a4252 !important;
            border-radius: 4px !important;
            height: 36px !important;
            display: flex !important;
            align-items: center !important;
            color: #ffffff !important;
            cursor: pointer;
            position: relative;
            margin: 0 !important; /* Unified margin */
            min-width: 160px;
            width: 100%;
            position: relative !important;
        }

        .dark-pivot-theme .pvtDropdownCurrent {
            background-color: transparent !important;
            color: #ffffff !important;
            padding: 0 30px 0 12px !important;
            display: flex !important;
            align-items: center !important;
            height: 100% !important;
            border: none !important; /* Removed redundant border */
            width: 100% !important;
            text-align: left !important;
        }

        /* Dropdown Icon / Arrow - Ensure right positioning */
        .dark-pivot-theme .pvtDropdownIcon {
            color: #94a3b8 !important;
            float: right !important;
            margin-right: 12px !important;
            pointer-events: none;
            position: absolute !important;
            right: 0 !important;
            top: 50% !important;
            transform: translateY(-50%) !important;
            font-size: 14px !important;
        }

        /* Ensure Renderer dropdown has a border container if needed */
        .dark-pivot-theme .pvtRenderers {
            border: none !important; /* Removed to avoid double border with dropdown */
            padding: 0 !important; /* Remove padding to align dropdown perfectly */
            background-color: transparent !important;
            text-align: left !important;
        }

        /* Dropdown Menu (The expanded part) */
        .dark-pivot-theme .pvtDropdownMenu {
            background-color: #0a0f20 !important;
            border: 1px solid #3a4252 !important;
            border-radius: 0.375rem !important;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5) !important;
            padding: 4px 0 !important;
            z-index: 3000 !important; /* Much higher to clear attributes and other triggers */
            position: absolute !important;
            top: 100% !important; /* Anchor exactly below the trigger */
            left: 0 !important;
            margin-top: 4px !important; /* Small gap for cleaner look */
            min-width: 200px !important;
            max-height: 400px !important;
            overflow-y: auto !important;
        }

        /* Dropdown Values (Items) */
        .dark-pivot-theme .pvtDropdownValue {
            color: #ffffff !important;
            padding: 6px 12px !important;
            font-size: 0.875rem !important;
            background-color: transparent !important;
        }

        .dark-pivot-theme .pvtDropdownActiveValue {
            background-color: #1e293b !important;
            color: #ffffff !important;
        }

        .dark-pivot-theme .pvtDropdownValue:hover {
            background-color: #1e293b !important;
        }

        /* Search input inside dropdown if any */
        .dark-pivot-theme .pvtDropdownMenu input {
            background-color: #161d31 !important;
            border: 1px solid #3a4252 !important;
            color: #ffffff !important;
            margin: 4px 8px !important;
            width: calc(100% - 16px) !important;
            border-radius: 4px !important;
            padding: 4px 8px !important;
        }

        /* Cleanup previous styles for selects to be consistent */
        .dark-pivot-theme select.pvtAggregator,
        .dark-pivot-theme select.pvtRenderer,
        .dark-pivot-theme select.pvtAttrDropdown {
            background-color: #0a0f20 !important;
            color: #ffffff !important;
            border: 1px solid #3a4252 !important;
            border-radius: 0.375rem !important;
            height: 36px !important;
            padding: 0 10px !important;
            outline: none;
            color-scheme: dark;
        }

        .dark-pivot-theme .pvtAxisContainer, .dark-pivot-theme .pvtVals {
            background-color: transparent !important;
            border: 1px solid #3a4252 !important;
            /* Prevent axes from clipping dropdowns */
            overflow: visible !important;
            padding: 4px !important; /* Consistent padding */
            min-width: 100px !important;
            text-align: left !important;
        }

        .dark-pivot-theme .pvtVals {
            border: none !important; /* Remove border from Vals cell as triggers have them */
            padding: 0 !important;
        }

        /* Aggressively hide the orientation arrows (↓ and →) and any sorting icons */
        .dark-pivot-theme .pvtRowOrder,
        .dark-pivot-theme .pvtColOrder,
        .dark-pivot-theme .pvtVals a.pvtRowOrder,
        .dark-pivot-theme .pvtVals a.pvtColOrder,
        .dark-pivot-theme a.pvtRowOrder,
        .dark-pivot-theme a.pvtColOrder {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
            width: 0 !important;
            height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            position: absolute !important;
        }

        .dark-pivot-theme .pvtAxisContainer br, .dark-pivot-theme .pvtVals br {
            display: none !important;
        }

        /* Placeholder text for empty drop zones */
        .dark-pivot-theme .pvtRows:empty:after,
        .dark-pivot-theme .pvtCols:empty:after {
            content: "Drag & Drop here";
            display: block;
            color: #4b5563;
            font-style: italic;
            font-size: 11px;
            padding: 10px;
            text-align: center;
            width: 100%;
        }

        /* For the case where technicality might have invisible content */
        .dark-pivot-theme .pvtRows:not(:has(.pvtAttr)):after,
        .dark-pivot-theme .pvtCols:not(:has(.pvtAttr)):after {
            content: "Drag & Drop here";
            display: block;
            color: #4b5563;
            font-style: italic;
            font-size: 11px;
            padding: 10px;
            text-align: center;
        }
        .dark-pivot-theme table.pvtTable {
            background-color: #0a0f20;
            color: #e2e8f0;
            border-collapse: collapse;
            font-size: 0.875rem;
            border: 1px solid #3a4252 !important;
            margin: 0 !important; /* Remove bottom margin */
        }
        .dark-pivot-theme .pvtTableContainer {
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
        }
        .dark-pivot-theme table.pvtTable thead tr th, 
        .dark-pivot-theme table.pvtTable tbody tr th {
            background-color: #1e293b !important;
            color: #f8fafc;
            border: 1px solid #3a4252 !important;
            font-size: 0.8rem;
            padding: 10px 12px !important; /* Unified padding */
            text-align: center !important; /* Global header centering */
            vertical-align: middle !important;
        }
        .dark-pivot-theme table.pvtTable tbody tr td {
            background-color: transparent !important;
            color: #e2e8f0;
            border: 1px solid #3a4252 !important;
            padding: 10px 12px !important; /* Unified padding */
            text-align: center !important; /* Global value centering */
            vertical-align: middle !important;
        }
        .dark-pivot-theme .pvtTotal, 
        .dark-pivot-theme .pvtGrandTotal,
        .dark-pivot-theme .pvtTotalLabel {
            font-weight: bold !important;
            background-color: #1e293b !important;
            border: 1px solid #3a4252 !important;
            text-align: center !important;
            vertical-align: middle !important;
            white-space: nowrap !important;
            min-width: 80px !important; /* Slightly more balanced than 100px */
            padding: 10px 16px !important; /* Balanced padding */
        }
        
        /* Drag handle and areas */
        .dark-pivot-theme .pvtUnused {
            background: #111827 !important;
            border: 1px solid #3a4252 !important;
            border-radius: 4px;
            min-height: 48px !important;
            display: flex !important;
            flex-wrap: nowrap !important;
            overflow-x: auto !important;
            overflow-y: hidden !important;
            max-width: calc(100vw - ${sidebarOpen ? '256px' : '64px'}) !important; /* Flush against sidebar width (64/16 rem -> 256/64 px) */
            padding: 4px !important;
            align-items: center !important;
            scrollbar-width: thin;
            scrollbar-color: #3a4252 #111827;
        }

        .dark-pivot-theme .pvtUnused::-webkit-scrollbar {
            height: 6px;
        }
        .dark-pivot-theme .pvtUnused::-webkit-scrollbar-track {
            background: #111827;
        }
        .dark-pivot-theme .pvtUnused::-webkit-scrollbar-thumb {
            background-color: #3a4252;
            border-radius: 10px;
        }

        .dark-pivot-theme .pvtRows, .dark-pivot-theme .pvtCols {
            background: #111827 !important;
            border: 1px solid #3a4252 !important;
            border-radius: 4px;
            min-height: 45px !important;
        }

        /* Hover states */
        .dark-pivot-theme .pvtAttr:hover {
            background: #334155 !important;
        }
        
        /* Tooltip/Dropdown styling if needed */
        .dark-pivot-theme .pvtFilterBox {
            background: #161d31 !important;
            border: 1px solid #3a4252 !important;
            z-index: 10000 !important;
            padding: 12px;
            border-radius: 8px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4) !important;
        }
        .dark-pivot-theme .pvtFilterBox input[type="text"] {
             background: #0a0f20;
             color: #fff;
             border: 1px solid #3a4252;
             padding: 6px 10px;
             border-radius: 4px;
             width: 100%;
             margin-bottom: 8px;
        }
        .dark-pivot-theme .pvtFilterBox h4 {
            background: transparent !important; 
            color: #fff !important;
            margin: 0 0 12px 0 !important;
            font-size: 1rem !important;
        }
        .dark-pivot-theme .pvtFilterBox .pvtButton {
            background: #283046 !important;
            color: #fff !important;
            border: 1px solid #3a4252 !important;
            padding: 4px 12px !important;
            border-radius: 4px !important; 
            cursor: pointer;
            font-size: 12px !important;
            display: inline-block !important;
            margin: 2px !important;
        }
        .dark-pivot-theme .pvtFilterBox .pvtButton:hover {
            background: #3a4252 !important;
        }

        /* Hide the drag handle (three lines) in filter box */
        .dark-pivot-theme .pvtDragHandle {
            display: none !important;
        }

        .dark-pivot-theme .pvtCheckContainer {
            background: #0a0f20 !important;
            border: 1px solid #3a4252 !important;
            border-radius: 4px;
            margin-top: 8px;
        }

        .dark-pivot-theme .pvtCheckContainer p {
            color: #cbd5e1 !important;
            padding: 4px 10px 4px 22px !important; /* Tighter padding */
            margin: 0 !important;
            cursor: pointer !important;
            position: relative !important;
            transition: background 0.2s ease;
            font-size: 13px !important;
        }

        /* Hide the default spacers and 'only' links to remove the gap */
        .dark-pivot-theme .pvtCheckContainer p .pvtOnly,
        .dark-pivot-theme .pvtCheckContainer p .pvtOnlySpacer {
            display: none !important;
        }

        /* Checkbox Base */
        .dark-pivot-theme .pvtCheckContainer p::before {
            content: "";
            position: absolute;
            left: 4px;
            top: 50%;
            transform: translateY(-50%);
            width: 14px;
            height: 14px;
            border: 1px solid #3a4252;
            border-radius: 2px;
            background: #0a0f20;
            transition: all 0.2s ease;
        }

        /* Checkbox Checked State */
        .dark-pivot-theme .pvtCheckContainer p.selected::before {
            background: #2563eb !important;
            border-color: #2563eb !important;
        }

        /* Checkmark icon using pseudo-element */
        .dark-pivot-theme .pvtCheckContainer p.selected::after {
            content: "✓";
            position: absolute;
            left: 6px; /* Adjusted to follow checkbox position */
            top: 50%;
            transform: translateY(-50%);
            color: white;
            font-size: 9px;
            font-weight: bold;
        }

        /* Checkbox Partial State (Mixed) */
        .dark-pivot-theme .pvtCheckContainer p.partial-selected::before {
            background: #1e3a8a !important; /* Dimmed blue */
            border-color: #3b82f6 !important;
        }

        .dark-pivot-theme .pvtCheckContainer p.partial-selected::after {
            content: "−"; /* Em dash for indeterminate state */
            position: absolute;
            left: 6px;
            top: 50%;
            transform: translateY(-50%);
            color: #93c5fd;
            font-size: 10px;
            font-weight: bold;
        }

        .dark-pivot-theme .pvtCheckContainer p.selected {
            background: #1e293b !important;
            color: #ffffff !important;
        }

        .dark-pivot-theme .pvtCheckContainer p:hover {
            background: #283046 !important;
        }

        /* Chart container bg and full height */
        .dark-pivot-theme .js-plotly-plot {
            width: 100% !important;
            height: 100% !important;
            min-height: 100% !important;
        }
        .dark-pivot-theme .js-plotly-plot .plotly {
            width: 100% !important;
            height: 100% !important;
        }
        .dark-pivot-theme .js-plotly-plot .plotly .gtitle,
        .dark-pivot-theme .js-plotly-plot .plotly .xtitle,
        .dark-pivot-theme .js-plotly-plot .plotly .ytitle,
        .dark-pivot-theme .js-plotly-plot .plotly .xtick text,
        .dark-pivot-theme .js-plotly-plot .plotly .ytick text,
        .dark-pivot-theme .js-plotly-plot .plotly .legendtext {
          fill: #e2e8f0 !important;
        }

        /* 1. Target the Trace Name Box (Grey Part) and turn it DARK */
        /* Use broad selector for anything that looks like a secondary grey label box */
        .js-plotly-plot .hovertext path.name,
        .js-plotly-plot .hovertext path[fill*="rgb(234"],
        .js-plotly-plot .hovertext path[fill*="rgb(240"],
        .js-plotly-plot .hovertext path[fill*="#ea"],
        .js-plotly-plot .hovertext path[style*="fill: rgb(234"],
        .js-plotly-plot .hovertext path[style*="fill: #ea"] {
            fill: #0a0f20 !important;
            fill-opacity: 1 !important;
            stroke: #475569 !important;
        }

        /* 2. Enforce LIGHT text on ALL parts of the tooltip for readability */
        .js-plotly-plot .hovertext text {
          fill: #ffffff !important;
          font-weight: 500 !important;
        }

        /* 3. Do NOT target generic 'path' inside hovertext to allow 
           Plotly's data bubble to inherit trace color via its own styles */
        
        .dark-pivot-theme .js-plotly-plot .plotly .gridlayer path {
          stroke: #334155 !important;
        }

      `}</style>
    </div>
  );
}

// Forced reload
