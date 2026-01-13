import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { X, Search, Plus, Loader2, Calendar } from 'lucide-react';
import { api } from '@/services/api';
import { useToast } from '../../contexts/ToastContext';
import { menuPreferencesService } from '../../services/menuPreferences';

const PAGE_ID = 'market-rotation-rrc';

interface ChartDataPoint {
  date: string;          // display label for XAxis
  _rawDate?: string;     // original ISO date for tooltip
  [key: string]: string | number | undefined;
}

// Helper function to format date for input
const formatDateForInput = (date: Date) => {
  return date.toISOString().split('T')[0];
};

// Helper function to get date from input
const getDateFromInput = (dateString: string) => {
  return new Date(dateString + 'T00:00:00');
};

// Helper function to format date for display
const formatDateForDisplay = (dateString: string) => {
  return safeFormatDate(dateString, 'short');
};

// Helper function to check if date range is more than 1 month
const isMoreThanOneMonth = (startDate: Date, endDate: Date) => {
  const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  return daysDiff > 30;
};

// Helper function to validate and format date safely
const safeFormatDate = (dateString: string, format: 'short' | 'long' = 'short') => {
  if (!dateString) return 'Invalid Date';

  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return dateString; // Return original if invalid
    }

    if (format === 'long') {
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
    }
  } catch (error) {
    return dateString; // Return original if parsing fails
  }
};

const RrcTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;
  const raw = (payload[0] && payload[0].payload) || {};

  // Prioritize _rawDate for accurate date display, then date, then label
  const dateRaw = raw._rawDate ?? raw.date ?? label;

  // Use safe formatting with long format for tooltip
  const dateText = dateRaw ? safeFormatDate(String(dateRaw), 'long') : 'Unknown Date';

  return (
    <div style={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 6, padding: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{dateText}</div>
      {payload.map((entry: any, idx: number) => (
        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: 9999, backgroundColor: entry.color }} />
          <span style={{ color: 'hsl(var(--muted-foreground))' }}>{entry.name}:</span>
          <span style={{ fontWeight: 500 }}>{typeof entry.value === 'number' ? entry.value.toFixed(4) : String(entry.value)}</span>
        </div>
      ))}
    </div>
  );
};
export default function MarketRotationRRC() {
  const { showToast } = useToast();

  // Load preferences from cookies
  interface RrcPreferences {
    viewMode?: 'sector' | 'stock';
    selectedIndex?: string;
    selectedIndexes?: string[];
    selectedItems?: string[];
    selectedSectorItems?: string[];
    selectedStockItems?: string[];
  }
  const cachedPrefs = menuPreferencesService.getCachedPreferences(PAGE_ID) as RrcPreferences | null;

  const [viewMode, setViewMode] = useState<'sector' | 'stock'>(() => {
    return cachedPrefs?.viewMode || 'sector';
  });
  const [selectedIndex, setSelectedIndex] = useState<string>(() => {
    return cachedPrefs?.selectedIndex || 'COMPOSITE';
  });
  const [selectedIndexes, setSelectedIndexes] = useState<string[]>(() => {
    return cachedPrefs?.selectedIndexes || ['COMPOSITE'];
  });
  const [selectedItems, setSelectedItems] = useState<string[]>(() => {
    const prefs = cachedPrefs || {};
    const mode = prefs.viewMode || 'sector';
    // Prioritize specific keys
    if (mode === 'sector' && prefs.selectedSectorItems) return prefs.selectedSectorItems;
    if (mode === 'stock' && prefs.selectedStockItems) return prefs.selectedStockItems;

    // Fallback/Migration:
    if (mode === 'sector') return prefs.selectedItems || [];
    // For stock mode, ignore legacy selectedItems as it likely contains sectors (bug fix)
    return [];
  });

  // Local state to store selections when switching modes - Initialize from cookies
  const [storedSectorItems, setStoredSectorItems] = useState<string[]>(() => {
    const prefs = cachedPrefs || {};
    if (prefs.selectedSectorItems) return prefs.selectedSectorItems;
    // Migration: If legacy mode was sector, use legacy items
    if (prefs.viewMode === 'sector' || !prefs.viewMode) return prefs.selectedItems || [];
    return [];
  });

  const [storedStockItems, setStoredStockItems] = useState<string[]>(() => {
    const prefs = cachedPrefs || {};
    if (prefs.selectedStockItems) return prefs.selectedStockItems;
    // Migration: Ignore legacy selectedItems for stock mode as it likely contains sectors due to previous bug
    return [];
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [indexSearchQuery, setIndexSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [showIndexSearchDropdown, setShowIndexSearchDropdown] = useState(false);
  const [searchDropdownIndex, setSearchDropdownIndex] = useState(-1);
  const [indexSearchDropdownIndex, setIndexSearchDropdownIndex] = useState(-1);

  // Calculate default start date (10 days ago)
  const getDefaultStartDate = () => {
    const today = new Date();
    const tenDaysAgo = new Date(today);
    tenDaysAgo.setDate(today.getDate() - 10);
    return tenDaysAgo;
  };

  const [startDate, setStartDate] = useState<Date>(getDefaultStartDate());
  const [endDate, setEndDate] = useState<Date>(new Date());

  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [indexOptions, setIndexOptions] = useState<{ name: string, color: string }[]>([]);
  const [sectorOptions, setSectorOptions] = useState<{ name: string, color: string }[]>([]);
  const [stockOptions, setStockOptions] = useState<{ name: string, color: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<any>(null);
  const [, setIsDataReady] = useState<boolean>(false); // We only need the setter to control error/loading visibility
  const [shouldFetchData, setShouldFetchData] = useState<boolean>(false); // Control when to fetch data (only when Show button clicked)
  const [hasRequestedData, setHasRequestedData] = useState<boolean>(false); // Pernah klik Show minimal sekali
  const [lastRequestedViewMode, setLastRequestedViewMode] = useState<'sector' | 'stock' | null>(null); // ViewMode terakhir kali digunakan saat klik Show
  const searchRef = useRef<HTMLDivElement>(null);
  const indexSearchRef = useRef<HTMLDivElement>(null);
  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);
  const isLoadingRef = useRef(false);
  const menuContainerRef = useRef<HTMLDivElement>(null);
  const [isMenuTwoRows, setIsMenuTwoRows] = useState<boolean>(false);
  const [chartViewportHeight, setChartViewportHeight] = useState<number>(600);

  // Calculate available viewport height
  useEffect(() => {
    const HEADER_H = 56; // h-14 in header
    const MENU_H = isMenuTwoRows ? 60 : 38; // menu height
    const MAIN_PADDING_V = 32; // Reduced padding
    const GAPS = 16;

    const recalc = () => {
      // Calculate height for content below menu
      const h = window.innerHeight - HEADER_H - MENU_H - MAIN_PADDING_V - GAPS;
      // Minimum height of 400px
      const finalH = Math.max(400, h);
      setChartViewportHeight(finalH);
    };

    recalc();
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [isMenuTwoRows]);

  // Visibility states for indexes and items (for showing/hiding in chart without removing from selection)
  const [indexVisibility, setIndexVisibility] = useState<Record<string, boolean>>({});
  const [itemVisibility, setItemVisibility] = useState<Record<string, boolean>>({});

  // Apakah input (index & items) masih dalam proses loading setelah user klik Show
  // Hanya true jika sedang dalam proses fetch (shouldFetchData) DAN options belum ada
  // TIDAK true hanya karena viewMode berubah dan options belum ada
  const isInputsLoading = shouldFetchData && hasRequestedData && (
    indexOptions.length === 0 ||
    (viewMode === 'sector' ? sectorOptions.length === 0 : stockOptions.length === 0)
  );

  // Get visible indexes and items (filtered by visibility state)
  const visibleIndexes = selectedIndexes.filter(index => indexVisibility[index] !== false);
  const visibleItems = selectedItems.filter(item => itemVisibility[item] !== false);

  // Toggle visibility functions
  const handleToggleIndexVisibility = (index: string) => {
    setIndexVisibility((prev) => ({
      ...prev,
      [index]: !(prev[index] !== false), // Default to true if undefined
    }));
  };

  const handleToggleItemVisibility = (item: string) => {
    setItemVisibility((prev) => ({
      ...prev,
      [item]: !(prev[item] !== false), // Default to true if undefined
    }));
  };

  // Initialize visibility when indexes/items are added
  useEffect(() => {
    setIndexVisibility((prev) => {
      const updated = { ...prev };
      let changed = false;
      selectedIndexes.forEach((index) => {
        if (updated[index] === undefined) {
          updated[index] = true; // Default to visible
          changed = true;
        }
      });
      // Remove visibility for indexes that are no longer selected
      Object.keys(updated).forEach((index) => {
        if (!selectedIndexes.includes(index)) {
          delete updated[index];
          changed = true;
        }
      });
      return changed ? updated : prev;
    });
  }, [selectedIndexes]);

  useEffect(() => {
    setItemVisibility((prev) => {
      const updated = { ...prev };
      let changed = false;
      selectedItems.forEach((item) => {
        if (updated[item] === undefined) {
          updated[item] = true; // Default to visible
          changed = true;
        }
      });
      // Remove visibility for items that are no longer selected
      Object.keys(updated).forEach((item) => {
        if (!selectedItems.includes(item)) {
          delete updated[item];
          changed = true;
        }
      });
      return changed ? updated : prev;
    });
  }, [selectedItems]);

  // Validate selected items against available options to prevent corrupted state
  useEffect(() => {
    // Only validate if options are loaded
    if (viewMode === 'sector' && sectorOptions.length > 0) {
      // Check if any selected item is NOT in sectorOptions
      const invalidItems = selectedItems.filter(item => !sectorOptions.some(opt => opt.name === item));
      if (invalidItems.length > 0) {
        console.warn('⚠️ Frontend: Removing invalid sector items:', invalidItems);
        setSelectedItems(prev => prev.filter(item => sectorOptions.some(opt => opt.name === item)));
      }
    } else if (viewMode === 'stock' && stockOptions.length > 0) {
      // Check if any selected item is NOT in stockOptions
      const invalidItems = selectedItems.filter(item => !stockOptions.some(opt => opt.name === item));
      if (invalidItems.length > 0) {
        console.warn('⚠️ Frontend: Removing invalid stock items:', invalidItems);
        setSelectedItems(prev => prev.filter(item => stockOptions.some(opt => opt.name === item)));
      }
    }
  }, [viewMode, selectedItems, sectorOptions, stockOptions]);

  interface LoadedInputsInfo {
    success: boolean;
    defaultIndex?: string | undefined;
    defaultItems?: string[] | undefined;
  }

  // Load available inputs only when Show button is clicked (first time)
  const loadInputsIfNeeded = async (): Promise<LoadedInputsInfo> => {
    // Only load if options are not yet loaded
    if (indexOptions.length > 0 && (sectorOptions.length > 0 || stockOptions.length > 0)) {
      // Sudah pernah di-load, gunakan state saat ini untuk menentukan default
      const currentIndex = selectedIndex || indexOptions[0]?.name;
      const currentItems =
        selectedItems.length > 0
          ? selectedItems
          : viewMode === 'sector'
            ? [sectorOptions[0]?.name || '']
            : [stockOptions[0]?.name || ''];

      return {
        success: !!currentIndex && currentItems.filter(Boolean).length > 0,
        defaultIndex: currentIndex,
        defaultItems: currentItems.filter(Boolean),
      };
    }

    try {
      console.log('🔄 Frontend: Loading RRC inputs for viewMode:', viewMode);
      const result = await api.listRRCInputs();

      if (result.success && result.data) {
        console.log('✅ Frontend: RRC inputs loaded:', result.data);

        // Generate colors for options - different color schemes for different types
        const generateIndexColors = (items: string[]) => {
          // Index colors - darker, more prominent colors
          const indexColors = ['#DC2626', '#B91C1C', '#991B1B', '#7F1D1D', '#EF4444', '#F87171', '#FCA5A5'];
          return items.map((item, index) => ({
            name: item,
            color: indexColors[index % indexColors.length] || '#DC2626'
          }));
        };

        const generateSectorStockColors = (items: string[]) => {
          // Sector/Stock colors - lighter, more varied colors
          const sectorStockColors = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#06B6D4', '#84CC16', '#EC4899', '#F97316', '#6366F1', '#14B8A6', '#A855F7', '#F43F5E'];
          return items.map((item, index) => ({
            name: item,
            color: sectorStockColors[index % sectorStockColors.length] || '#6B7280'
          }));
        };

        setIndexOptions(generateIndexColors(result.data.index || []));
        setSectorOptions(generateSectorStockColors(result.data.stockSectors || []));
        setStockOptions(generateSectorStockColors(result.data.stocks || []));

        // Hitung default selections berdasarkan data yang baru di-load
        const defaultIndex = selectedIndex || result.data.index?.[0] || 'COMPOSITE';
        let itemsToSelect: string[] = selectedItems;

        // Validate existing selection against loaded options to filter out corrupted/invalid items
        // This fixes the issue where stocks might appear in sector mode due to corrupted legacy cookies
        if (viewMode === 'sector' && result.data.stockSectors) {
          const validItems = itemsToSelect.filter(item => result.data.stockSectors.includes(item));
          if (validItems.length !== itemsToSelect.length) {
            console.warn('⚠️ Frontend: Filtered out invalid sector items:', itemsToSelect.filter(item => !result.data.stockSectors.includes(item)));
            itemsToSelect = validItems;
          }
        } else if (viewMode === 'stock' && result.data.stocks) {
          const validItems = itemsToSelect.filter(item => result.data.stocks.includes(item));
          if (validItems.length !== itemsToSelect.length) {
            console.warn('⚠️ Frontend: Filtered out invalid stock items:', itemsToSelect.filter(item => !result.data.stocks.includes(item)));
            itemsToSelect = validItems;
          }
        }

        if (itemsToSelect.length === 0) {
          if (viewMode === 'sector' && result.data.stockSectors && result.data.stockSectors.length > 0) {
            const defaultSectors = ['Technology', 'Healthcare', 'Financials'];
            const availableSectors = result.data.stockSectors || [];
            const validSectors = defaultSectors.filter(sector => availableSectors.includes(sector));
            itemsToSelect = validSectors.length > 0 ? validSectors : [result.data.stockSectors[0]];
          } else if (viewMode === 'stock' && result.data.stocks && result.data.stocks.length > 0) {
            const defaultStocks = ['BBCA', 'BBRI', 'BMRI'];
            const availableStocks = result.data.stocks || [];
            const validStocks = defaultStocks.filter(stock => availableStocks.includes(stock));
            itemsToSelect = validStocks.length > 0 ? validStocks : [result.data.stocks[0]];
          }
        }

        // Sinkronkan ke state
        setSelectedIndex(defaultIndex);
        if (itemsToSelect.length > 0) {
          setSelectedItems(itemsToSelect);
        }

        return {
          success: itemsToSelect.length > 0,
          defaultIndex,
          defaultItems: itemsToSelect,
        };
      } else {
        console.error('❌ Frontend: Failed to load RRC inputs:', result.error);
        const errorMessage = result.error || 'Failed to load inputs';
        showToast({
          type: 'error',
          title: 'Failed to Load Options',
          message: errorMessage
        });
        return { success: false };
      }
    } catch (error: any) {
      console.error('❌ Frontend: Error loading inputs:', error);
      const errorMessage = error?.message || error?.toString() || 'Network error occurred';
      showToast({
        type: 'error',
        title: 'Connection Error',
        message: `Failed to load options: ${errorMessage}. Please check your connection and try again.`
      });
      return { success: false };
    }
  };

  // Load chart data only when shouldFetchData is true (triggered by Show button)
  useEffect(() => {
    if (!shouldFetchData) {
      return;
    }

    if (selectedIndex && selectedItems.length > 0) {
      loadChartData();
    } else {
      setShouldFetchData(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldFetchData]);

  // Auto-refresh when generation completes
  useEffect(() => {
    if (isGenerating) {
      const checkGenerationStatus = async () => {
        try {
          const statusResult = await api.getRRCStatus();
          if (statusResult.success && !statusResult.data?.isGenerating) {
            console.log('✅ Frontend: Generation completed');
            setIsGenerating(false);
            setGenerationProgress(null);
            // Don't auto-refresh - user must click Show button
          }
        } catch (error) {
          console.error('❌ Frontend: Error checking generation status:', error);
        }
      };

      const interval = setInterval(checkGenerationStatus, 2000); // Check every 2 seconds
      return () => clearInterval(interval);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGenerating]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false);
      }
      if (indexSearchRef.current && !indexSearchRef.current.contains(event.target as Node)) {
        setShowIndexSearchDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const loadChartDataWithParams = async (index: string, items: string[], mode: 'sector' | 'stock') => {
    // Prevent multiple simultaneous calls
    if (isLoadingRef.current) {
      console.log('⚠️ Frontend: Already loading, skipping...');
      return;
    }

    isLoadingRef.current = true;
    setIsLoading(true);
    setError(null);

    console.log('🔄 Frontend: Loading RRC chart data with params...');
    console.log('Index:', index);
    console.log('Items:', items);
    console.log('Mode:', mode);

    try {
      // Check generation status first
      const statusResult = await api.getRRCStatus();
      if (statusResult.success && statusResult.data?.isGenerating) {
        setIsGenerating(true);
        setGenerationProgress(statusResult.data.progress);
        setError('Data sedang diperbarui, silakan tunggu...');
        setIsLoading(false);
        isLoadingRef.current = false;
        return;
      } else {
        setIsGenerating(false);
        setGenerationProgress(null);
      }

      const results: any[] = [];

      // 🚀 PARALLEL API CALLS for better performance
      const [indexResult, dataResult] = await Promise.all([
        api.getRRCData('index', [index], index),
        mode === 'stock' ? api.getRRCData('stock', items, index) : api.getRRCData('sector', items, index)
      ]);

      console.log('📡 Frontend: Index API response:', indexResult);
      console.log('📡 Frontend: Data API response:', dataResult);

      if (indexResult.success && indexResult.data) {
        results.push(...indexResult.data.results);
        console.log('✅ Frontend: Index data loaded:', indexResult.data.results);
      } else if (indexResult.error?.includes('GENERATION_IN_PROGRESS')) {
        setIsGenerating(true);
        setError('Data sedang diperbarui, silakan tunggu...');
        setIsLoading(false);
        isLoadingRef.current = false;
        return;
      } else {
        console.error('❌ Frontend: Failed to load index data:', indexResult.error);
      }

      if (dataResult.success && dataResult.data) {
        results.push(...dataResult.data.results);
        console.log('✅ Frontend: Data loaded:', dataResult.data.results);

        // Debug logging for sector data structure
        if (mode === 'sector') {
          console.log('🔍 Sector data structure analysis:', {
            resultsCount: dataResult.data.results.length,
            results: dataResult.data.results.map((r: any) => ({
              item: r.item,
              dataLength: r.data?.length || 0,
              sampleData: r.data?.slice(0, 2) || [],
              dataKeys: r.data?.[0] ? Object.keys(r.data[0]) : []
            }))
          });
        }
      } else if (dataResult.error?.includes('GENERATION_IN_PROGRESS')) {
        setIsGenerating(true);
        setError('Data sedang diperbarui, silakan tunggu...');
        setIsLoading(false);
        isLoadingRef.current = false;
        return;
      } else {
        console.error('❌ Frontend: Failed to load data:', dataResult.error);
      }

      if (results.length > 0) {
        console.log('✅ Frontend: RRC data received:', results);
        const parsedData = parseResultsToChartData(results);
        console.log('✅ Frontend: Parsed chart data:', parsedData);
        console.log('✅ Frontend: Chart data length:', parsedData.length);
        setChartData(parsedData);
        setError(null);
        setIsDataReady(true);
      } else {
        console.log('⚠️ Frontend: No RRC data received');
        setChartData([]);
        setError('No data available. Please check if data is being generated.');
        setIsDataReady(true); // Still set to true so error message can be shown
      }
    } catch (error) {
      console.error('❌ Frontend: Error loading RRC data:', error);
      setError('Failed to load chart data');
      setIsDataReady(true); // Still set to true so error message can be shown
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
      setShouldFetchData(false); // Reset fetch trigger
    }
  };

  const loadChartData = async () => {
    if (!selectedIndex || selectedItems.length === 0) {
      setIsLoading(false);
      return;
    }

    await loadChartDataWithParams(selectedIndex, selectedItems, viewMode);
  };

  const parseResultsToChartData = (results: any[]): ChartDataPoint[] => {
    if (results.length === 0) {
      console.log('📊 Frontend: No results to parse');
      return [];
    }

    console.log('📊 Frontend: Parsing results:', results);

    // Get all unique dates
    const allDates = new Set<string>();
    results.forEach(result => {
      if (result.data && Array.isArray(result.data)) {
        result.data.forEach((row: any) => {
          if (row.date) allDates.add(row.date);
        });
      }
    });

    console.log('📊 Frontend: All unique dates:', Array.from(allDates));

    if (allDates.size === 0) {
      console.log('📊 Frontend: No dates found in results');
      return [];
    }

    // Sort dates in ascending order (oldest to newest), filtering out invalid dates
    const validDates = Array.from(allDates).filter(dateStr => {
      const date = new Date(dateStr);
      return !isNaN(date.getTime());
    });

    const sortedDates = validDates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    // Filter dates based on selected date range
    const filteredDates = sortedDates.filter(dateStr => {
      const date = new Date(dateStr);
      return !isNaN(date.getTime()) && date >= startDate && date <= endDate;
    });

    console.log(`📊 Frontend: Filtered dates (${filteredDates.length}) from ${formatDateForInput(startDate)} to ${formatDateForInput(endDate)}`);

    if (filteredDates.length === 0) {
      console.log('⚠️ Frontend: No dates in selected range');
      return [];
    }

    // Calculate date range in days
    const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const isLongRange = daysDiff > 31; // More than 1 month

    console.log(`📅 Date range: ${daysDiff} days, isLongRange: ${isLongRange}`);

    // Create chart data with appropriate labels
    const chartData: ChartDataPoint[] = filteredDates.map(date => {
      // Always keep the original date for both display and tooltip
      // Only change the display format for X-axis labels, not the data points
      const point: ChartDataPoint = {
        date: date, // Keep original date for data integrity
        _rawDate: date // Keep original date for tooltip
      };

      results.forEach(result => {
        if (result.data && Array.isArray(result.data)) {
          const row = result.data.find((r: any) => r.date === date);
          if (row) {
            // Index type uses 'scaled_values', others might use different field names
            // For sector data, try multiple possible field names
            let value = 0;
            const cleanedResultItem = result.item.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            const cleanedSelectedIndex = selectedIndex.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

            if (cleanedResultItem === cleanedSelectedIndex) {
              // Index data uses 'scaled_values'
              value = row.scaled_values ?? row.value ?? row.close ?? 0;
            } else {
              // Sector/Stock data might use different field names
              value = row.scaled_values ?? row.value ?? row.close ?? row.rrc_value ?? row.sector_value ?? 0;
            }
            const parsedValue = parseFloat(String(value)) || 0;

            // Use original item name from result.item (backend returns original name)
            // But match with selectedItems/selectedIndex for property name
            let propertyName = result.item;

            // Try to find exact match in selectedItems first
            const exactMatch = selectedItems.find(item => item === result.item);
            if (exactMatch) {
              propertyName = exactMatch;
            } else {
              // Try case-insensitive match
              const caseInsensitiveMatch = selectedItems.find(item => {
                const cleanedItem = item.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                return cleanedItem === cleanedResultItem;
              });
              if (caseInsensitiveMatch) {
                propertyName = caseInsensitiveMatch;
              } else if (cleanedResultItem === cleanedSelectedIndex) {
                propertyName = selectedIndex;
              }
            }

            point[propertyName] = parsedValue;

            // Debug logging for sector data
            if (viewMode === 'sector' && result.item !== selectedIndex) {
              console.log(`🔍 Sector data for ${result.item} on ${date}:`, {
                rawValue: value,
                parsedValue: parsedValue,
                row: row,
                resultItem: result.item,
                availableFields: Object.keys(row),
                fieldValues: {
                  scaled_values: row.scaled_values,
                  value: row.value,
                  close: row.close,
                  rrc_value: row.rrc_value,
                  sector_value: row.sector_value
                }
              });
            }
          } else {
            // Debug logging for missing data
            if (viewMode === 'sector' && result.item !== selectedIndex) {
              console.log(`⚠️ No data found for ${result.item} on ${date}`, {
                resultItem: result.item,
                availableDates: result.data?.map((r: any) => r.date) || [],
                lookingFor: date
              });
            }
          }
        }
      });

      return point;
    });

    console.log('📊 Frontend: Final chart data:', chartData.length, 'points');

    // Debug logging for sector mode
    if (viewMode === 'sector' && chartData.length > 0) {
      console.log('🔍 Sector chart data analysis:', {
        totalPoints: chartData.length,
        samplePoint: chartData[0],
        dataKeys: Object.keys(chartData[0] || {}),
        selectedItems: selectedItems,
        hasIndexData: chartData.some(point => point[selectedIndex] !== undefined),
        sectorDataCount: chartData.filter(point =>
          selectedItems.some(item => point[item] !== undefined)
        ).length
      });
    }

    return chartData;
  };


  const currentData = chartData;

  // Use current viewMode for options display to allow selection changes
  const currentOptions = viewMode === 'sector' ? sectorOptions : stockOptions;
  const displayViewMode = viewMode; // Always match the dropdown


  const removeItem = (itemName: string) => {
    // Prevent removing all items - keep at least one
    setSelectedItems(prev => {
      const newItems = prev.filter(item => item !== itemName);
      if (newItems.length === 0) {
        showToast({
          type: 'error',
          title: 'Selection Error',
          message: 'Minimal 1 item harus dipilih'
        });
        return prev; // Don't remove if it would leave 0 items
      }
      return newItems;
    });
  };

  const handleViewModeChange = (mode: 'sector' | 'stock') => {
    // Save current selection to storage before switching
    if (viewMode === 'sector') {
      setStoredSectorItems(selectedItems);
      // Restore stock items
      setSelectedItems(storedStockItems);
    } else {
      setStoredStockItems(selectedItems);
      // Restore sector items
      setSelectedItems(storedSectorItems);
    }

    // Hanya ubah viewMode dan clear search - TIDAK ada proses apapun
    setViewMode(mode);
    setSearchQuery('');
    setIndexSearchQuery('');
    setShowSearchDropdown(false);
    setShowIndexSearchDropdown(false);

    // Save preferences logic is handled by the useEffect below
    // No manual save here to avoid race conditions

    // TIDAK clear data chart - tetap tampilkan data saat ini
    // TIDAK set isDataReady - tetap tampilkan chart jika sudah ada data
    // TIDAK set error - biarkan error tetap ada jika ada
    // TIDAK set isLoading - biarkan loading state tetap

    // User akan klik Show untuk load data baru dengan viewMode baru

    // NO PROCESSING - Completely sterile, no backend/frontend activity
  };

  // Save preferences to cookies with debounce
  useEffect(() => {
    const timeout = setTimeout(() => {
      menuPreferencesService.savePreferences(PAGE_ID, {
        viewMode,
        selectedIndex,
        selectedIndexes,
        selectedItems,
        // Save separated states to avoid collision
        selectedSectorItems: viewMode === 'sector' ? selectedItems : storedSectorItems,
        selectedStockItems: viewMode === 'stock' ? selectedItems : storedStockItems
      });
    }, 500);

    return () => clearTimeout(timeout);
  }, [viewMode, selectedIndex, selectedIndexes, selectedItems, storedSectorItems, storedStockItems]);

  const handleGenerateData = async () => {
    // User sudah klik Show - langsung set loading state SEBELUM clear data
    setHasRequestedData(true);
    setLastRequestedViewMode(viewMode); // Simpan viewMode yang digunakan saat klik Show
    setError(null);
    setIsLoading(true); // SET LOADING SEBELUM CLEAR DATA - ini penting!
    setIsDataReady(false);

    // Load inputs terlebih dahulu jika belum ada (sekaligus hitung default selection)
    const inputsInfo = await loadInputsIfNeeded();
    if (!inputsInfo.success) {
      // Error sudah ditampilkan di loadInputsIfNeeded
      setIsLoading(false); // Reset loading jika gagal
      return;
    }

    // Gunakan selection dari state jika sudah ada, fallback ke default dari inputsInfo
    const effectiveIndex = selectedIndex || inputsInfo.defaultIndex || indexOptions[0]?.name || 'COMPOSITE';
    const effectiveItems =
      selectedItems.length > 0
        ? selectedItems
        : (inputsInfo.defaultItems && inputsInfo.defaultItems.length > 0
          ? inputsInfo.defaultItems
          : []);

    // Jika masih tidak ada item (case sangat jarang), baru tampilkan warning
    if (!effectiveIndex || effectiveItems.length === 0) {
      showToast({
        type: 'warning',
        title: 'Selection Required',
        message: 'Please select at least one index and one item before clicking Show.',
      });
      setIsLoading(false); // Reset loading jika tidak ada selection
      return;
    }

    // Sinkronkan selection ke state (kalau sebelumnya kosong)
    if (!selectedIndex && effectiveIndex) {
      setSelectedIndex(effectiveIndex);
    }
    if (selectedItems.length === 0 && effectiveItems.length > 0) {
      setSelectedItems(effectiveItems);
    }

    // JANGAN clear chartData di sini - biarkan data lama tetap ada sampai data baru selesai
    // setChartData([]); // REMOVED - ini menyebabkan "No data available" muncul

    // Langsung panggil loader dengan parameter yang sudah pasti valid
    // loadChartDataWithParams akan set isLoading sendiri, tapi kita sudah set di awal untuk menghindari gap
    setShouldFetchData(false); // jangan pakai effect, langsung panggil loader
    await loadChartDataWithParams(effectiveIndex, effectiveItems, viewMode);
  };



  const triggerDatePicker = (inputRef: React.RefObject<HTMLInputElement>) => {
    if (inputRef.current) {
      inputRef.current.showPicker();
    }
  };

  const getFilteredOptions = () => {
    if (viewMode === 'sector') return currentOptions;

    return currentOptions.filter(option =>
      option.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !selectedItems.includes(option.name)
    );
  };

  const getFilteredIndexOptions = () => {
    return indexOptions.filter(option =>
      option.name.toLowerCase().includes(indexSearchQuery.toLowerCase())
    );
  };

  // Keyboard navigation handlers
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    const filteredOptions = getFilteredOptions();
    const availableOptions = filteredOptions.filter(option => !selectedItems.includes(option.name));

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSearchDropdownIndex(prev =>
          prev < availableOptions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSearchDropdownIndex(prev =>
          prev > 0 ? prev - 1 : availableOptions.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (searchDropdownIndex >= 0 && availableOptions[searchDropdownIndex]) {
          const selectedOption = availableOptions[searchDropdownIndex];
          if (!selectedItems.includes(selectedOption.name)) {
            if (selectedItems.length >= 15) {
              showToast({
                type: 'error',
                title: 'Selection Limit',
                message: 'Maksimal 15 items yang bisa dipilih'
              });
              return;
            }
            setSelectedItems(prev => [...prev, selectedOption.name]);
          }
          setSearchQuery('');
          setShowSearchDropdown(false);
          setSearchDropdownIndex(-1);
        }
        break;
      case 'Escape':
        setShowSearchDropdown(false);
        setSearchDropdownIndex(-1);
        break;
    }
  };

  const handleIndexSearchKeyDown = (e: React.KeyboardEvent) => {
    const filteredOptions = getFilteredIndexOptions();
    const availableOptions = filteredOptions.filter(option => !selectedIndexes.includes(option.name));

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setIndexSearchDropdownIndex(prev =>
          prev < availableOptions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setIndexSearchDropdownIndex(prev =>
          prev > 0 ? prev - 1 : availableOptions.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (indexSearchDropdownIndex >= 0 && availableOptions[indexSearchDropdownIndex]) {
          const selectedOption = availableOptions[indexSearchDropdownIndex];
          if (!selectedIndexes.includes(selectedOption.name)) {
            if (selectedIndexes.length >= 5) {
              showToast({
                type: 'error',
                title: 'Selection Limit',
                message: 'Maksimal 5 indexes yang bisa dipilih'
              });
              return;
            }
            setSelectedIndexes(prev => [...prev, selectedOption.name]);
            setSelectedIndex(selectedOption.name);
          }
          setIndexSearchQuery('');
          setShowIndexSearchDropdown(false);
          setIndexSearchDropdownIndex(-1);
        }
        break;
      case 'Escape':
        setShowIndexSearchDropdown(false);
        setIndexSearchDropdownIndex(-1);
        break;
    }
  };



  const handleStartDateChange = (dateString: string) => {
    const newDate = getDateFromInput(dateString);

    // Validate start date is not after end date
    if (newDate > endDate) {
      showToast({
        type: 'error',
        title: 'Start date cannot be after end date',
        message: 'Please select a valid start date'
      });
      return;
    }

    // Check if range exceeds 1 year
    const daysDiff = Math.ceil((endDate.getTime() - newDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff > 365) {
      showToast({
        type: 'error',
        title: 'Date range cannot exceed 1 year',
        message: 'Please select a date range within 1 year'
      });
      return;
    }

    setStartDate(newDate);
    console.log('📅 Start date changed to:', dateString);
  };

  const handleEndDateChange = (dateString: string) => {
    const newDate = getDateFromInput(dateString);

    // Validate end date is not before start date
    if (newDate < startDate) {
      showToast({
        type: 'error',
        title: 'End date cannot be before start date',
        message: 'Please select a valid end date'
      });
      return;
    }

    // Check if range exceeds 1 year
    const daysDiff = Math.ceil((newDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff > 365) {
      showToast({
        type: 'error',
        title: 'Date range cannot exceed 1 year',
        message: 'Please select a date range within 1 year'
      });
      return;
    }

    setEndDate(newDate);
    console.log('📅 End date changed to:', dateString);
  };

  // Don't auto-reload when date range changes - user must click Show button

  // Monitor menu height to detect if it wraps to 2 rows
  useEffect(() => {
    const checkMenuHeight = () => {
      if (menuContainerRef.current) {
        const menuHeight = menuContainerRef.current.offsetHeight;
        // If menu height is more than ~50px, it's likely 2 rows (single row is usually ~40-45px)
        setIsMenuTwoRows(menuHeight > 50);
      }
    };

    // Check initially
    checkMenuHeight();

    // Check on window resize
    window.addEventListener('resize', checkMenuHeight);

    // Use ResizeObserver for more accurate detection
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
  }, [viewMode, startDate, endDate]);

  return (
    <div className="w-full">
      {/* Top Controls - Compact without Card */}
      {/* Pada layar kecil/menengah menu ikut scroll; hanya di layar besar (lg+) yang fixed di top */}
      <div className="bg-[#0a0f20] border-b border-[#3a4252] px-4 py-1.5 lg:fixed lg:top-14 lg:left-20 lg:right-0 lg:z-40">
        <div ref={menuContainerRef} className="flex flex-col md:flex-row md:flex-wrap items-center gap-1 md:gap-x-7 md:gap-y-0.5">
          {/* Stock/Sector Dropdown */}
          <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
            <label className="text-sm font-medium whitespace-nowrap">Stock/Sector:</label>
            <select
              value={viewMode}
              onChange={(e) => handleViewModeChange(e.target.value as 'sector' | 'stock')}
              className="h-9 px-3 border border-[#3a4252] rounded-md bg-background text-foreground text-sm w-full md:w-auto"
            >
              <option value="sector">Sector</option>
              <option value="stock">Stock</option>
            </select>
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
                  onChange={(e) => handleStartDateChange(e.target.value)}
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
                    {startDate.toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric'
                    })}
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
                  onChange={(e) => handleEndDateChange(e.target.value)}
                  onKeyDown={(e) => e.preventDefault()}
                  onPaste={(e) => e.preventDefault()}
                  onInput={(e) => e.preventDefault()}
                  min={formatDateForInput(startDate)}
                  max={formatDateForInput(new Date())}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  style={{ caretColor: 'transparent' }}
                />
                <div className="flex items-center gap-2 h-full px-3">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">
                    {endDate.toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric'
                    })}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Show Button */}
          <button
            onClick={handleGenerateData}
            disabled={isGenerating}
            className="h-9 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium whitespace-nowrap flex items-center justify-center w-full md:w-auto"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Generating...
              </>
            ) : (
              'Show'
            )}
          </button>
        </div>
      </div>

      {/* Spacer untuk header fixed - hanya diperlukan di layar besar (lg+) */}
      <div className={isMenuTwoRows ? "h-0 lg:h-[60px]" : "h-0 lg:h-[38px]"}></div>

      <div className="space-y-6">
        <React.Fragment>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6 overflow-x-auto">
            {/* RRC Chart */}
            <div className="lg:col-span-3">
              <Card className="flex h-full flex-col">
                <CardHeader>
                  <CardTitle>Relative Rotation Graph Comparison (RRC) vs {selectedIndex}</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 p-0" style={{ height: chartViewportHeight - 70 }}>
                  {!hasRequestedData ? (
                    // Belum pernah klik Show
                    <div className="flex items-center justify-center h-96">
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground mb-2">Click 'Show' button to load chart data</p>
                      </div>
                    </div>
                  ) : isGenerating ? (
                    <div className="flex items-center justify-center h-96">
                      <div className="text-center">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
                        <p className="text-sm font-medium mb-2">Data sedang diperbarui</p>
                        {generationProgress && (
                          <div className="w-full max-w-xs mx-auto">
                            <div className="flex justify-between text-xs text-muted-foreground mb-1">
                              <span>Progress</span>
                              <span>{generationProgress.completed}/{generationProgress.total}</span>
                            </div>
                            <div className="w-full bg-muted rounded-full h-2">
                              <div className="bg-primary h-2 rounded-full transition-all duration-300" style={{ width: `${(generationProgress.completed / generationProgress.total) * 100}%` }} />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (isInputsLoading || isLoading || shouldFetchData) ? (
                    <div className="flex items-center justify-center h-96">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm text-muted-foreground">Loading chart data...</span>
                      </div>
                    </div>
                  ) : error && !isLoading && !isGenerating && !shouldFetchData && !isInputsLoading ? (
                    <div className="flex items-center justify-center h-96">
                      <div className="text-center">
                        <p className="text-sm text-destructive mb-2">{error}</p>
                        <Button variant="outline" size="sm" onClick={handleGenerateData}>Retry</Button>
                      </div>
                    </div>
                  ) : chartData.length === 0 && !isLoading && !isGenerating && !shouldFetchData && !isInputsLoading && hasRequestedData ? (
                    // Setelah klik Show dan loading selesai, tapi data kosong
                    <div className="flex items-center justify-center h-96">
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground mb-2">No data available</p>
                        <p className="text-xs text-muted-foreground mb-3">Data mungkin sedang diproses atau belum tersedia</p>
                        <Button variant="outline" size="sm" onClick={handleGenerateData}>Reload Data</Button>
                      </div>
                    </div>
                  ) : chartData.length > 0 ? (
                    <div className="relative w-full h-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={chartData}
                          margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                          <XAxis
                            dataKey="date"
                            className="text-muted-foreground"
                            tickFormatter={(value) => {
                              if (!value) return 'Invalid Date';

                              // Always show the original date format for better precision
                              // Only change display density, not the actual date values
                              return formatDateForDisplay(value);
                            }}
                            interval="preserveStartEnd"
                            {...(isMoreThanOneMonth(startDate, endDate) && { tickCount: 6 })}
                          />
                          <YAxis className="text-muted-foreground" />
                          <Tooltip
                            content={<RrcTooltip />}
                            allowEscapeViewBox={{ x: false, y: false }}
                            isAnimationActive={false}
                            cursor={{ stroke: 'hsl(var(--primary))', strokeWidth: 1 }}
                          />
                          <Legend />

                          {/* Selected Index lines - only show visible indexes */}
                          {visibleIndexes.map((index) => {
                            const option = indexOptions.find(opt => opt.name === index);
                            const isPrimary = index === selectedIndex;
                            return (
                              <Line
                                key={index}
                                type="monotone"
                                dataKey={index}
                                stroke={option?.color || '#000000'}
                                strokeWidth={isPrimary ? 3 : 2.5}
                                strokeDasharray={isPrimary ? "5 5" : undefined}
                                name={isPrimary ? `${index} (Primary)` : index}
                                connectNulls={true}
                                dot={{ r: isPrimary ? 4 : 3, fill: option?.color || '#000000', strokeWidth: isPrimary ? 2 : 1 }}
                                activeDot={{ r: isPrimary ? 6 : 5, strokeWidth: 2 }}
                              />
                            );
                          })}

                          {/* Dynamic lines based on visible items */}
                          {visibleItems.map((item) => {
                            const option = currentOptions.find(opt => opt.name === item);
                            return (
                              <Line
                                key={item}
                                type="monotone"
                                dataKey={item}
                                stroke={option?.color || '#6B7280'}
                                strokeWidth={2.5}
                                name={item}
                                connectNulls={true}
                                dot={{ r: 3, fill: option?.color || '#6B7280', strokeWidth: 1 }}
                                activeDot={{ r: 5, strokeWidth: 2 }}
                              />
                            );
                          })}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    // Fallback safety: tampilkan loading
                    <div className="flex items-center justify-center h-96">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm text-muted-foreground">Loading chart data...</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Selection Panel */}
            <div className="lg:col-span-1">
              <Card className="flex flex-col" style={{ height: chartViewportHeight }}>
                <CardHeader>
                  <CardTitle>Selection Panel</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 overflow-y-auto flex-1">
                  {!hasRequestedData ? (
                    <div className="flex items-center justify-center h-64">
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground mb-2">Click 'Show' button to load chart data</p>
                      </div>
                    </div>
                  ) : (isInputsLoading || isLoading) ? (
                    <div className="flex items-center justify-center h-64">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm text-muted-foreground">Loading options...</span>
                      </div>
                    </div>
                  ) : (
                    <>

                      {/* Index Search and Select Combined */}
                      <div>
                        <h4 className="text-sm font-medium mb-2">
                          Available Indexes: {indexOptions.length}
                        </h4>
                        <div className="relative" ref={indexSearchRef}>
                          <div className="relative">
                            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                            <input
                              type="text"
                              placeholder="Search and select indexes..."
                              value={indexSearchQuery}
                              onChange={(e) => {
                                setIndexSearchQuery(e.target.value);
                                setShowIndexSearchDropdown(true);
                                setIndexSearchDropdownIndex(-1);
                              }}
                              onFocus={() => setShowIndexSearchDropdown(true)}
                              onKeyDown={handleIndexSearchKeyDown}
                              className="w-full pl-7 pr-3 py-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 hover:border-primary/50 transition-colors"
                            />
                          </div>

                          {/* Combined Index Search and Select Dropdown */}
                          {showIndexSearchDropdown && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
                              {indexOptions.length === 0 ? (
                                <div className="p-3 text-sm text-muted-foreground">Loading indexes...</div>
                              ) : (
                                <>
                                  {/* Show filtered results if searching, otherwise show all available */}
                                  {(indexSearchQuery ? getFilteredIndexOptions() : indexOptions.filter(option => !selectedIndexes.includes(option.name)))
                                    .slice(0, 10)
                                    .map((option, index) => (
                                      <button
                                        key={option.name}
                                        onClick={() => {
                                          if (!selectedIndexes.includes(option.name)) {
                                            if (selectedIndexes.length >= 5) {
                                              showToast({
                                                type: 'error',
                                                title: 'Selection Limit',
                                                message: 'Maksimal 5 indexes yang bisa dipilih'
                                              });
                                              return;
                                            }
                                            setSelectedIndexes(prev => [...prev, option.name]);
                                            setSelectedIndex(option.name); // Set as primary index
                                          }
                                          setIndexSearchQuery('');
                                          setShowIndexSearchDropdown(false);
                                          setIndexSearchDropdownIndex(-1);
                                        }}
                                        className={`flex items-center justify-between w-full px-3 py-2 text-left hover:bg-accent transition-colors ${index === indexSearchDropdownIndex ? 'bg-accent' : ''
                                          }`}
                                      >
                                        <div className="flex items-center gap-2">
                                          <div
                                            className="w-3 h-3 rounded-full"
                                            style={{ backgroundColor: option.color }}
                                          ></div>
                                          <span className="text-sm">{option.name}</span>
                                        </div>
                                        {!selectedIndexes.includes(option.name) && (
                                          <Plus className="w-3 h-3 text-muted-foreground" />
                                        )}
                                      </button>
                                    ))}

                                  {/* Show "more available" message */}
                                  {!indexSearchQuery && indexOptions.filter(option => !selectedIndexes.includes(option.name)).length > 10 && (
                                    <div className="text-xs text-muted-foreground px-3 py-2 border-t border-border">
                                      +{indexOptions.filter(option => !selectedIndexes.includes(option.name)).length - 10} more indexes available (use search to find specific indexes)
                                    </div>
                                  )}

                                  {/* Show "no results" message */}
                                  {indexSearchQuery && getFilteredIndexOptions().length === 0 && (
                                    <div className="p-2 text-sm text-muted-foreground">
                                      {indexOptions.filter(s => !selectedIndexes.includes(s.name)).length === 0
                                        ? 'All indexes already selected'
                                        : `No indexes found matching "${indexSearchQuery}"`
                                      }
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Selected Indexes */}
                      {selectedIndexes.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-medium">Selected Indexes ({selectedIndexes.length})</h4>
                            {selectedIndexes.length === 1 && (
                              <Badge variant="outline" className="text-xs">Min. required</Badge>
                            )}
                          </div>
                          {/* Select All / Unselect All checkbox */}
                          {selectedIndexes.length > 1 && (
                            <div className="mb-2 pb-2 border-b border-border">
                              <label className="flex items-center gap-2 text-xs font-medium cursor-pointer select-none text-muted-foreground hover:text-foreground transition-colors">
                                <input
                                  type="checkbox"
                                  className="h-3.5 w-3.5 rounded border-[#3a4252] bg-transparent text-primary focus:ring-primary"
                                  checked={selectedIndexes.every(index => indexVisibility[index] !== false)}
                                  ref={(input) => {
                                    if (input) {
                                      const allVisible = selectedIndexes.every(index => indexVisibility[index] !== false);
                                      const someVisible = selectedIndexes.some(index => indexVisibility[index] !== false);
                                      input.indeterminate = someVisible && !allVisible;
                                    }
                                  }}
                                  onChange={() => {
                                    const allVisible = selectedIndexes.every(index => indexVisibility[index] !== false);
                                    selectedIndexes.forEach(index => {
                                      setIndexVisibility(prev => ({
                                        ...prev,
                                        [index]: !allVisible
                                      }));
                                    });
                                  }}
                                />
                                <span>{selectedIndexes.every(index => indexVisibility[index] !== false) ? 'Unselect All' : 'Select All'}</span>
                              </label>
                            </div>
                          )}
                          <div className="space-y-1">
                            {selectedIndexes.map((index) => {
                              const option = indexOptions.find(opt => opt.name === index);
                              const isVisible = indexVisibility[index] !== false;
                              return (
                                <div key={index} className="flex items-center justify-between p-2 bg-accent rounded-md">
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4 rounded border-[#3a4252] bg-transparent text-primary focus:ring-primary"
                                      checked={isVisible}
                                      onChange={() => handleToggleIndexVisibility(index)}
                                    />
                                    <div
                                      className="w-3 h-3 rounded-full"
                                      style={{ backgroundColor: option?.color || '#000000' }}
                                    ></div>
                                    <span className={`text-sm ${!isVisible ? 'opacity-50' : ''}`}>{index}</span>
                                    {index === selectedIndex && (
                                      <Badge variant="secondary" className="text-xs">Primary</Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    {index !== selectedIndex && (
                                      <button
                                        onClick={() => setSelectedIndex(index)}
                                        className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
                                        title="Set as primary index"
                                      >
                                        Set Primary
                                      </button>
                                    )}
                                    <button
                                      onClick={() => {
                                        if (selectedIndexes.length === 1) {
                                          showToast({
                                            type: 'error',
                                            title: 'Selection Error',
                                            message: 'Minimal 1 index harus dipilih'
                                          });
                                          return;
                                        }
                                        setSelectedIndexes(prev => prev.filter(item => item !== index));
                                        if (index === selectedIndex) {
                                          // If removing primary index, set another as primary
                                          const remaining = selectedIndexes.filter(item => item !== index);
                                          if (remaining.length > 0 && remaining[0]) {
                                            setSelectedIndex(remaining[0]);
                                          }
                                        }
                                      }}
                                      disabled={selectedIndexes.length === 1}
                                      className={`h-6 w-6 p-0 flex items-center justify-center rounded-md transition-colors ${selectedIndexes.length === 1
                                        ? 'cursor-not-allowed opacity-30'
                                        : 'hover:bg-muted/50 hover:shadow-sm opacity-60 hover:opacity-100'
                                        }`}
                                      title={selectedIndexes.length === 1 ? 'Cannot remove last index' : `Remove ${index} from selection`}
                                    >
                                      <X className={`w-3 h-3 transition-colors ${selectedIndexes.length === 1
                                        ? 'text-muted-foreground/50'
                                        : 'text-muted-foreground hover:text-destructive'
                                        }`} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {selectedIndexes.length === 1 && (
                            <p className="text-xs text-muted-foreground mt-2">
                              At least one index must be selected for comparison
                            </p>
                          )}
                        </div>
                      )}

                      {/* Search and Select Combined */}
                      <div>
                        <h4 className="text-sm font-medium mb-2">
                          Available {displayViewMode === 'sector' ? 'Sectors' : 'Stocks'}: {currentOptions.length}
                        </h4>
                        <div className="relative" ref={searchRef}>
                          <div className="relative">
                            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                            <input
                              type="text"
                              placeholder={`Search and select ${displayViewMode === 'sector' ? 'sectors' : 'stocks'}...`}
                              value={searchQuery}
                              onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setShowSearchDropdown(true);
                                setSearchDropdownIndex(-1);
                              }}
                              onFocus={() => setShowSearchDropdown(true)}
                              onKeyDown={handleSearchKeyDown}
                              className="w-full pl-7 pr-3 py-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 hover:border-primary/50 transition-colors"
                            />
                          </div>

                          {/* Combined Search and Select Dropdown */}
                          {showSearchDropdown && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
                              {currentOptions.length === 0 ? (
                                <div className="p-3 text-sm text-muted-foreground">Loading options...</div>
                              ) : (
                                <>
                                  {/* Show filtered results if searching, otherwise show all available */}
                                  {(searchQuery ? getFilteredOptions() : currentOptions.filter(option => !selectedItems.includes(option.name)))
                                    .slice(0, displayViewMode === 'stock' ? 15 : undefined)
                                    .map((option, index) => (
                                      <button
                                        key={option.name}
                                        onClick={() => {
                                          if (!selectedItems.includes(option.name)) {
                                            if (selectedItems.length >= 15) {
                                              showToast({
                                                type: 'error',
                                                title: 'Selection Limit',
                                                message: 'Maksimal 15 items yang bisa dipilih'
                                              });
                                              return;
                                            }
                                            setSelectedItems(prev => [...prev, option.name]);
                                          }
                                          setSearchQuery('');
                                          setShowSearchDropdown(false);
                                          setSearchDropdownIndex(-1);
                                        }}
                                        className={`flex items-center justify-between w-full px-3 py-2 text-left hover:bg-accent transition-colors ${index === searchDropdownIndex ? 'bg-accent' : ''
                                          }`}
                                      >
                                        <div className="flex items-center gap-2">
                                          <div
                                            className="w-3 h-3 rounded-full"
                                            style={{ backgroundColor: option.color }}
                                          ></div>
                                          <span className="text-sm">{option.name}</span>
                                        </div>
                                        {!selectedItems.includes(option.name) && (
                                          <Plus className="w-3 h-3 text-muted-foreground" />
                                        )}
                                      </button>
                                    ))}

                                  {/* Show "more available" message */}
                                  {!searchQuery && displayViewMode === 'stock' && currentOptions.filter(option => !selectedItems.includes(option.name)).length > 15 && (
                                    <div className="text-xs text-muted-foreground px-3 py-2 border-t border-border">
                                      +{currentOptions.filter(option => !selectedItems.includes(option.name)).length - 15} more {displayViewMode === 'stock' ? 'stocks' : 'sectors'} available (use search to find specific items)
                                    </div>
                                  )}

                                  {/* Show "no results" message */}
                                  {searchQuery && getFilteredOptions().length === 0 && (
                                    <div className="p-2 text-sm text-muted-foreground">
                                      {currentOptions.filter(s => !selectedItems.includes(s.name)).length === 0
                                        ? `All ${displayViewMode === 'stock' ? 'stocks' : 'sectors'} already selected`
                                        : `No ${displayViewMode === 'stock' ? 'stocks' : 'sectors'} found matching "${searchQuery}"`
                                      }
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Selected Items */}
                      {selectedItems.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-medium">Selected {displayViewMode === 'sector' ? 'Sectors' : 'Stocks'} ({selectedItems.length})</h4>
                            {selectedItems.length === 1 && (
                              <Badge variant="outline" className="text-xs">Min. required</Badge>
                            )}
                          </div>
                          {/* Select All / Unselect All checkbox */}
                          {selectedItems.length > 1 && (
                            <div className="mb-2 pb-2 border-b border-border">
                              <label className="flex items-center gap-2 text-xs font-medium cursor-pointer select-none text-muted-foreground hover:text-foreground transition-colors">
                                <input
                                  type="checkbox"
                                  className="h-3.5 w-3.5 rounded border-[#3a4252] bg-transparent text-primary focus:ring-primary"
                                  checked={selectedItems.every(item => itemVisibility[item] !== false)}
                                  ref={(input) => {
                                    if (input) {
                                      const allVisible = selectedItems.every(item => itemVisibility[item] !== false);
                                      const someVisible = selectedItems.some(item => itemVisibility[item] !== false);
                                      input.indeterminate = someVisible && !allVisible;
                                    }
                                  }}
                                  onChange={() => {
                                    const allVisible = selectedItems.every(item => itemVisibility[item] !== false);
                                    selectedItems.forEach(item => {
                                      setItemVisibility(prev => ({
                                        ...prev,
                                        [item]: !allVisible
                                      }));
                                    });
                                  }}
                                />
                                <span>{selectedItems.every(item => itemVisibility[item] !== false) ? 'Unselect All' : 'Select All'}</span>
                              </label>
                            </div>
                          )}
                          <div className="space-y-1 max-h-32 overflow-y-auto">
                            {selectedItems.map((item) => {
                              const option = currentOptions.find(opt => opt.name === item);
                              const isVisible = itemVisibility[item] !== false;
                              return (
                                <div key={item} className="flex items-center justify-between p-2 bg-accent rounded-md">
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4 rounded border-[#3a4252] bg-transparent text-primary focus:ring-primary"
                                      checked={isVisible}
                                      onChange={() => handleToggleItemVisibility(item)}
                                    />
                                    <div
                                      className="w-3 h-3 rounded-full"
                                      style={{ backgroundColor: option?.color }}
                                    ></div>
                                    <span className={`text-sm ${!isVisible ? 'opacity-50' : ''}`}>{item}</span>
                                  </div>
                                  <button
                                    onClick={() => removeItem(item)}
                                    disabled={selectedItems.length === 1}
                                    className={`h-6 w-6 p-0 flex items-center justify-center rounded-md transition-colors ${selectedItems.length === 1
                                      ? 'cursor-not-allowed opacity-30'
                                      : 'hover:bg-muted/50 hover:shadow-sm opacity-60 hover:opacity-100'
                                      }`}
                                    title={selectedItems.length === 1 ? 'Cannot remove last item' : `Remove ${item} from selection`}
                                  >
                                    <X className={`w-3 h-3 transition-colors ${selectedItems.length === 1
                                      ? 'text-muted-foreground/50'
                                      : 'text-muted-foreground hover:text-destructive'
                                      }`} />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                          {selectedItems.length === 1 && (
                            <p className="text-xs text-muted-foreground mt-2">
                              At least one item must be selected for comparison
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </React.Fragment>
      </div>
    </div>
  );
}






