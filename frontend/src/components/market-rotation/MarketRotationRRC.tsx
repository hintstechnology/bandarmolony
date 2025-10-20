import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { X, Search, Plus, Loader2, Play, RotateCcw, Calendar } from 'lucide-react';
import { api } from '@/services/api';
import { useToast } from '../../contexts/ToastContext';

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
  const [viewMode, setViewMode] = useState<'sector' | 'stock'>('sector');
  const [selectedIndex, setSelectedIndex] = useState<string>('COMPOSITE');
  const [selectedIndexes, setSelectedIndexes] = useState<string[]>(['COMPOSITE']);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  
  // Debug logging
  console.log('🔍 Frontend: Current selectedItems:', selectedItems);
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
  const [indexOptions, setIndexOptions] = useState<{name: string, color: string}[]>([]);
  const [sectorOptions, setSectorOptions] = useState<{name: string, color: string}[]>([]);
  const [stockOptions, setStockOptions] = useState<{name: string, color: string}[]>([]);
  const [isLoading, setIsLoading] = useState(true); // Start with loading state
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<any>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const indexSearchRef = useRef<HTMLDivElement>(null);
  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);
  const isInitialMount = useRef(true);
  const isLoadingRef = useRef(false);

  // Load available inputs on mount and set defaults
  useEffect(() => {
    isInitialMount.current = true; // Reset on viewMode change
    
    const loadInputs = async () => {
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
        
        // Set default selections immediately
        const defaultIndex = result.data.index?.[0] || 'COMPOSITE';
        if (!selectedIndex) {
          setSelectedIndex(defaultIndex);
        }
        
        // ALWAYS set default items when viewMode changes
        let itemsToSelect: string[] = [];
        
        if (viewMode === 'sector' && result.data.stockSectors && result.data.stockSectors.length > 0) {
          const defaultSectors = ['Technology', 'Healthcare', 'Financials'];
          const availableSectors = result.data.stockSectors || [];
          const validSectors = defaultSectors.filter(sector => availableSectors.includes(sector));
          itemsToSelect = validSectors.length > 0 ? validSectors : [result.data.stockSectors[0]];
        } else if (viewMode === 'stock' && result.data.stocks && result.data.stocks.length > 0) {
          // Default stocks: BBCA, BBRI, BMRI
          const defaultStocks = ['BBCA', 'BBRI', 'BMRI'];
          const availableStocks = result.data.stocks || [];
          const validStocks = defaultStocks.filter(stock => availableStocks.includes(stock));
          itemsToSelect = validStocks.length > 0 ? validStocks : [result.data.stocks[0]];
        }
        
        if (itemsToSelect.length > 0) {
          setSelectedItems(itemsToSelect);
          // Immediately load chart data with current selections (no setTimeout)
          const indexToUse = selectedIndex || defaultIndex;
          if (indexToUse && itemsToSelect.length > 0) {
            loadChartDataWithParams(indexToUse, itemsToSelect, viewMode);
          }
        } else {
          setIsLoading(false);
        }
      } else {
        console.error('❌ Frontend: Failed to load RRC inputs:', result.error);
        setError('Failed to load available options');
        setIsLoading(false);
      }
    };

    loadInputs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  // Load chart data when selections change
  useEffect(() => {
    if (isInitialMount.current) {
      // Skip first run, will be triggered by loadInputs setting the items
      isInitialMount.current = false;
      return;
    }
    
    if (selectedIndex && selectedItems.length > 0 && !isLoading) {
      loadChartData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex, selectedItems, viewMode]);

  // Auto-refresh when generation completes
  useEffect(() => {
    if (isGenerating) {
      const checkGenerationStatus = async () => {
        try {
          const statusResult = await api.getRRCStatus();
          if (statusResult.success && !statusResult.data?.isGenerating) {
            console.log('✅ Frontend: Generation completed, auto-refreshing...');
            setIsGenerating(false);
            setGenerationProgress(null);
            // Reload chart data
            if (selectedIndex && selectedItems.length > 0) {
              await loadChartData();
            }
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
      } else {
        console.log('⚠️ Frontend: No RRC data received');
        setChartData([]);
        setError('No data available. Please check if data is being generated.');
      }
    } catch (error) {
      console.error('❌ Frontend: Error loading RRC data:', error);
      setError('Failed to load chart data');
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
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
            if (result.item === selectedIndex) {
              // Index data uses 'scaled_values'
              value = row.scaled_values ?? row.value ?? row.close ?? 0;
            } else {
              // Sector/Stock data might use different field names
              value = row.scaled_values ?? row.value ?? row.close ?? row.rrc_value ?? row.sector_value ?? 0;
            }
            const parsedValue = parseFloat(String(value)) || 0;
            point[result.item] = parsedValue;
            
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
  const currentOptions = viewMode === 'sector' ? sectorOptions : stockOptions;


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
    setViewMode(mode);
    setSearchQuery('');
    setIndexSearchQuery('');
    setShowSearchDropdown(false);
    setShowIndexSearchDropdown(false);
    setChartData([]); // Clear chart data when switching modes
    
    // Set default selections based on available options
    if (mode === 'sector' && sectorOptions.length > 0) {
      setSelectedItems([sectorOptions[0]?.name || 'Technology']);
    } else if (mode === 'stock' && stockOptions.length > 0) {
      // Default stocks: BBCA, BBRI, BMRI
      const defaultStocks = ['BBCA', 'BBRI', 'BMRI'];
      const availableDefaults = defaultStocks.filter(stock => 
        stockOptions.some(opt => opt.name === stock)
      );
      setSelectedItems(availableDefaults.length > 0 ? availableDefaults : [stockOptions[0]?.name || 'BBCA']);
    }
  };

  const handleGenerateData = () => {
    if (selectedIndex && selectedItems.length > 0) {
      loadChartData();
    }
  };

  const handleReset = () => {
    // Reset to default dates (10 days back)
    const today = new Date();
    const tenDaysAgo = new Date(today);
    tenDaysAgo.setDate(today.getDate() - 10);
    
    setStartDate(tenDaysAgo);
    setEndDate(today);
    
    // Reset selections to default based on view mode
    if (viewMode === 'sector' && sectorOptions.length > 0) {
      // Default sectors: Technology, Healthcare, Financials
      const defaultSectors = ['Technology', 'Healthcare', 'Financials'];
      const availableDefaults = defaultSectors.filter(sector => 
        sectorOptions.some(opt => opt.name === sector)
      );
      setSelectedItems(availableDefaults.length > 0 ? availableDefaults : [sectorOptions[0]?.name || 'Technology']);
    } else if (viewMode === 'stock' && stockOptions.length > 0) {
      // Default stocks: BBCA, BBRI, BMRI
      const defaultStocks = ['BBCA', 'BBRI', 'BMRI'];
      const availableDefaults = defaultStocks.filter(stock => 
        stockOptions.some(opt => opt.name === stock)
      );
      setSelectedItems(availableDefaults.length > 0 ? availableDefaults : [stockOptions[0]?.name || 'BBCA']);
    } else {
      setSelectedItems([]);
    }
    
    // Reset search states
    setSearchQuery('');
    setIndexSearchQuery('');
    setShowSearchDropdown(false);
    setShowIndexSearchDropdown(false);
    
    // Clear chart data
    setChartData([]);
    
    console.log('🔄 Reset to defaults:', {
      startDate: tenDaysAgo,
      endDate: today,
      selectedItems: viewMode === 'sector' ? [sectorOptions[0]?.name || 'Technology'] : ['BBCA', 'BBRI', 'BMRI']
    });
  };

  const hasValidSelection = () => {
    return selectedIndex && selectedItems.length > 0;
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

  // Reload chart when date range changes
  useEffect(() => {
    if (selectedIndex && selectedItems.length > 0 && !isLoading && !isInitialMount.current) {
      console.log('📅 Date range changed, reloading chart data...');
      loadChartData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  return (
    <div className="space-y-6">
      {/* Control Panel */}
      <div className="mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* View Mode Toggle */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">View Mode</label>
                <div className="flex rounded-lg border border-input">
                  <button
            onClick={() => handleViewModeChange('sector')}
                    className={`flex-1 px-3 py-2 text-sm font-medium transition-colors rounded-l-lg ${
                      viewMode === 'sector'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-foreground hover:bg-accent'
                    }`}
          >
            Sector
                  </button>
                  <button
            onClick={() => handleViewModeChange('stock')}
                    className={`flex-1 px-3 py-2 text-sm font-medium transition-colors rounded-r-lg ${
                      viewMode === 'stock'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-foreground hover:bg-accent'
                    }`}
          >
            Stock
                  </button>
                </div>
              </div>

              {/* Start Date */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Start Date</label>
                <div 
                  className="relative h-10 w-full rounded-md border border-input bg-background cursor-pointer hover:bg-accent/50 transition-colors"
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
                  <div className="flex items-center justify-between h-full px-3 py-2">
                    <span className="text-sm text-foreground">
                      {startDate.toLocaleDateString('en-GB', { 
                        day: '2-digit', 
                        month: '2-digit', 
                        year: 'numeric' 
                      })}
                    </span>
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
              </div>

              {/* End Date */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">End Date</label>
                <div 
                  className="relative h-10 w-full rounded-md border border-input bg-background cursor-pointer hover:bg-accent/50 transition-colors"
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
                  <div className="flex items-center justify-between h-full px-3 py-2">
                    <span className="text-sm text-foreground">
                      {endDate.toLocaleDateString('en-GB', { 
                        day: '2-digit', 
                        month: '2-digit', 
                        year: 'numeric' 
                      })}
                    </span>
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Action</label>
                <div className="flex gap-2">
                  <button
                    onClick={handleGenerateData}
                    disabled={isGenerating || !hasValidSelection()}
                    className="flex-1 h-10 px-3 py-2 text-sm font-medium rounded-md border border-input bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Go
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleReset}
                    disabled={isGenerating}
                    className="flex-1 h-10 px-3 py-2 text-sm font-medium rounded-md border border-input bg-background text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Reset
                  </button>
                </div>
              </div>
        </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6 overflow-x-auto">
        {/* RRC Chart */}
        <div className="lg:col-span-3">
          <Card className="flex h-full flex-col">
            <CardHeader>
              <CardTitle>{viewMode === 'sector' ? 'Sector' : 'Stock'} Activity vs {selectedIndex}</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-[320px] md:min-h-[420px]">
              {isGenerating ? (
                <div className="flex items-center justify-center h-96">
                  <div className="text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
                    <p className="text-sm font-medium mb-2">Data sedang diperbarui</p>
                    <p className="text-xs text-muted-foreground mb-4">
                      {generationProgress?.current || 'Memproses data...'}
                    </p>
                    {generationProgress && (
                      <div className="w-full max-w-xs mx-auto">
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>Progress</span>
                          <span>{generationProgress.completed}/{generationProgress.total}</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div 
                            className="bg-primary h-2 rounded-full transition-all duration-300"
                            style={{ 
                              width: `${(generationProgress.completed / generationProgress.total) * 100}%` 
                            }}
                          ></div>
                        </div>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      Silakan tunggu sebentar...
                    </p>
                  </div>
                </div>
              ) : isLoading ? (
                <div className="flex items-center justify-center h-96">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Loading chart data...</span>
                  </div>
                </div>
              ) : error && !isLoading ? (
                <div className="flex items-center justify-center h-96">
                  <div className="text-center">
                    <p className="text-sm text-destructive mb-2">{error}</p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => loadChartData()}
                    >
                      Retry
                    </Button>
                  </div>
                </div>
              ) : currentData.length === 0 && !isLoading && !isGenerating ? (
                <div className="flex items-center justify-center h-96">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground mb-2">No data available</p>
                    <p className="text-xs text-muted-foreground mb-3">Data mungkin sedang diproses atau belum tersedia</p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => loadChartData()}
                    >
                      Reload Data
                    </Button>
                  </div>
                </div>
              ) : currentData.length > 0 ? (
                <div className="h-full w-full min-h-[320px] md:min-h-[420px]">
                  <ResponsiveContainer width="100%" height="100%">
                <LineChart 
                  data={currentData}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
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
                  
                  {/* Selected Index line - always visible and locked */}
                  <Line 
                    type="monotone" 
                    dataKey={selectedIndex} 
                    stroke={indexOptions.find(opt => opt.name === selectedIndex)?.color || '#000000'}
                    strokeWidth={3}
                    strokeDasharray="5 5"
                    name={`${selectedIndex} (Locked)`}
                    connectNulls={true}
                    dot={false}
                    activeDot={false}
                  />
                  
                  {/* Dynamic lines based on selection */}
                  {selectedItems.map((item) => {
                    const option = currentOptions.find(opt => opt.name === item);
                    return (
                      <Line 
                        key={item}
                        type="monotone" 
                        dataKey={item} 
                        stroke={option?.color || '#6B7280'}
                        strokeWidth={2}
                        name={item}
                        connectNulls={true}
                        dot={false}
                    activeDot={false}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
                </div>
              ) : (
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

        {/* Selector Panel */}
        <div className="lg:col-span-1">
          <Card className="flex h-full flex-col">
            <CardHeader>
              <CardTitle>Selection Panel</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 space-y-4 overflow-visible">

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
                              className={`flex items-center justify-between w-full px-3 py-2 text-left hover:bg-accent transition-colors ${
                                index === indexSearchDropdownIndex ? 'bg-accent' : ''
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
                  <div className="space-y-1">
                    {selectedIndexes.map((index) => {
                      const option = indexOptions.find(opt => opt.name === index);
                      return (
                        <div key={index} className="flex items-center justify-between p-2 bg-accent rounded-md">
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: option?.color || '#000000' }}
                            ></div>
                            <span className="text-sm">{index}</span>
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
                              className={`h-6 w-6 p-0 flex items-center justify-center rounded-md transition-colors ${
                                selectedIndexes.length === 1 
                                  ? 'cursor-not-allowed opacity-30' 
                                  : 'hover:bg-muted/50 hover:shadow-sm opacity-60 hover:opacity-100'
                              }`}
                              title={selectedIndexes.length === 1 ? 'Cannot remove last index' : `Remove ${index} from selection`}
                            >
                              <X className={`w-3 h-3 transition-colors ${
                                selectedIndexes.length === 1 
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
                  Available {viewMode === 'sector' ? 'Sectors' : 'Stocks'}: {currentOptions.length}
                </h4>
                <div className="relative" ref={searchRef}>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder={`Search and select ${viewMode === 'sector' ? 'sectors' : 'stocks'}...`}
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
                            .slice(0, viewMode === 'stock' ? 15 : undefined)
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
                              className={`flex items-center justify-between w-full px-3 py-2 text-left hover:bg-accent transition-colors ${
                                index === searchDropdownIndex ? 'bg-accent' : ''
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
                          {!searchQuery && viewMode === 'stock' && currentOptions.filter(option => !selectedItems.includes(option.name)).length > 15 && (
                            <div className="text-xs text-muted-foreground px-3 py-2 border-t border-border">
                              +{currentOptions.filter(option => !selectedItems.includes(option.name)).length - 15} more {viewMode === 'stock' ? 'stocks' : 'sectors'} available (use search to find specific items)
                            </div>
                          )}
                          
                          {/* Show "no results" message */}
                          {searchQuery && getFilteredOptions().length === 0 && (
                          <div className="p-2 text-sm text-muted-foreground">
                              {currentOptions.filter(s => !selectedItems.includes(s.name)).length === 0 
                                ? `All ${viewMode === 'stock' ? 'stocks' : 'sectors'} already selected` 
                                : `No ${viewMode === 'stock' ? 'stocks' : 'sectors'} found matching "${searchQuery}"`
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
                    <h4 className="text-sm font-medium">Selected {viewMode === 'sector' ? 'Sectors' : 'Stocks'} ({selectedItems.length})</h4>
                    {selectedItems.length === 1 && (
                      <Badge variant="outline" className="text-xs">Min. required</Badge>
                    )}
                  </div>
                  <div className="space-y-1">
                    {selectedItems.map((item) => {
                      const option = currentOptions.find(opt => opt.name === item);
                      return (
                        <div key={item} className="flex items-center justify-between p-2 bg-accent rounded-md">
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: option?.color }}
                            ></div>
                            <span className="text-sm">{item}</span>
                          </div>
                          <button
                            onClick={() => removeItem(item)}
                            disabled={selectedItems.length === 1}
                            className={`h-6 w-6 p-0 flex items-center justify-center rounded-md transition-colors ${
                              selectedItems.length === 1 
                                ? 'cursor-not-allowed opacity-30' 
                                : 'hover:bg-muted/50 hover:shadow-sm opacity-60 hover:opacity-100'
                            }`}
                            title={selectedItems.length === 1 ? 'Cannot remove last item' : `Remove ${item} from selection`}
                          >
                            <X className={`w-3 h-3 transition-colors ${
                              selectedItems.length === 1 
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
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}








