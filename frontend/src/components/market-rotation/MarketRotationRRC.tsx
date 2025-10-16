import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { X, Search, Plus, Loader2 } from 'lucide-react';
import { api } from '@/services/api';
import { useToast } from '../../contexts/ToastContext';

interface ChartDataPoint {
  date: string;
  [key: string]: string | number;
}

// Helper function to format date for input
const formatDateForInput = (date: Date) => {
  return date.toISOString().split('T')[0];
};

// Helper function to get date from input
const getDateFromInput = (dateString: string) => {
  return new Date(dateString + 'T00:00:00');
};

export default function MarketRotationRRC() {
  const { showToast } = useToast();
  const [viewMode, setViewMode] = useState<'sector' | 'stock'>('sector');
  const [selectedIndex, setSelectedIndex] = useState<string>('COMPOSITE');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  
  // Debug logging
  console.log('🔍 Frontend: Current selectedItems:', selectedItems);
  const [searchQuery, setSearchQuery] = useState('');
  const [indexSearchQuery, setIndexSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [showIndexSearchDropdown, setShowIndexSearchDropdown] = useState(false);
  
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
  const [debugMessage, setDebugMessage] = useState<string>('');
  const searchRef = useRef<HTMLDivElement>(null);
  const indexSearchRef = useRef<HTMLDivElement>(null);
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
    
    // Sort dates in ascending order (oldest to newest)
    const sortedDates = Array.from(allDates).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    
    // Filter dates based on selected date range
    const filteredDates = sortedDates.filter(dateStr => {
      const date = new Date(dateStr);
      return date >= startDate && date <= endDate;
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
      const dateObj = new Date(date);
      
      // If range > 1 month, use month labels (e.g., "Jan 2025")
      const displayDate = isLongRange 
        ? dateObj.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        : date; // Use full date for short ranges
      
      const point: ChartDataPoint = { date: displayDate };
      
      results.forEach(result => {
        if (result.data && Array.isArray(result.data)) {
          const row = result.data.find((r: any) => r.date === date);
          if (row) {
            // Index type uses 'scaled_values', others might use different field names
            const value = row.scaled_values ?? row.value ?? row.close ?? 0;
            point[result.item] = parseFloat(String(value)) || 0;
          }
        }
      });
      
      return point;
    });
    
    console.log('📊 Frontend: Final chart data:', chartData.length, 'points');
    return chartData;
  };

  // Debug functions
  const handleTriggerUpdate = async (feature: 'rrc' | 'rrg' | 'all' = 'rrc') => {
    console.log('🔧 handleTriggerUpdate called with feature:', feature);
    try {
      const featureText = feature === 'all' ? 'RRC & RRG' : feature.toUpperCase();
      setDebugMessage(`Triggering ${featureText} update...`);
      
      console.log('📡 Calling api.triggerGeneration...');
      const result = await api.triggerGeneration(feature);
      console.log('📡 API Response:', result);
      
      if (result.success) {
        setDebugMessage(`✅ ${result.data?.message || `${featureText} update triggered successfully`}`);
        // Refresh status after a short delay
        setTimeout(() => {
          loadChartData();
        }, 1000);
      } else {
        setDebugMessage(`❌ ${result.error || `Failed to trigger ${featureText} update`}`);
      }
    } catch (error) {
      console.error('❌ Error in handleTriggerUpdate:', error);
      setDebugMessage(`❌ Error: ${error}`);
    }
  };

  const handleStopGeneration = async () => {
    try {
      setDebugMessage('Stopping generation...');
      const result = await api.stopRRCGeneration();
      
      if (result.success) {
        setDebugMessage(`✅ ${result.data?.message || 'Stop requested'}`);
      } else {
        setDebugMessage(`❌ ${result.error || 'Failed to stop generation'}`);
      }
    } catch (error) {
      setDebugMessage(`❌ Error: ${error}`);
    }
  };

  const currentData = chartData;
  const currentOptions = viewMode === 'sector' ? sectorOptions : stockOptions;

  const toggleItem = (itemName: string) => {
    setSelectedItems(prev => {
      if (prev.includes(itemName)) {
        // Removing item - check if we'll have at least 1 item
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
      } else {
        // Adding item - check if we'll exceed 15 items
        if (prev.length >= 15) {
          showToast({
            type: 'error',
            title: 'Selection Limit',
            message: 'Maksimal 15 items yang bisa dipilih'
          });
          return prev; // Don't add if it would exceed 15 items
        }
        return [...prev, itemName];
      }
    });
  };

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

  const addFromSearch = (itemName: string) => {
    if (!selectedItems.includes(itemName)) {
      if (selectedItems.length >= 15) {
        showToast({
          type: 'error',
          title: 'Selection Limit',
          message: 'Maksimal 15 items yang bisa dipilih'
        });
        return;
      }
      setSelectedItems(prev => [...prev, itemName]);
    }
    setSearchQuery('');
    setShowSearchDropdown(false);
  };

  const selectIndex = (indexName: string) => {
    setSelectedIndex(indexName);
    setIndexSearchQuery('');
    setShowIndexSearchDropdown(false);
  };

  const handleStartDateChange = (dateString: string) => {
    const newDate = getDateFromInput(dateString);
    
    // Check if range exceeds 1 year
    const daysDiff = Math.ceil((endDate.getTime() - newDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff > 365) {
      showToast({
        type: 'error',
        title: 'Date Range Error',
        message: 'Date range cannot exceed 1 year'
      });
      return;
    }
    
    setStartDate(newDate);
    console.log('📅 Start date changed to:', dateString);
  };

  const handleEndDateChange = (dateString: string) => {
    const newDate = getDateFromInput(dateString);
    
    // Check if range exceeds 1 year
    const daysDiff = Math.ceil((newDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff > 365) {
      showToast({
        type: 'error',
        title: 'Date Range Error',
        message: 'Date range cannot exceed 1 year'
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
      {/* Controls */}
      <div className="space-y-4">
        {/* Row 1: View Mode and Date Range */}
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          {/* View Mode */}
          <div className="flex-shrink-0">
            <label className="block text-sm font-medium mb-2">View Mode:</label>
        <div className="flex gap-2">
          <Button
            variant={viewMode === 'sector' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleViewModeChange('sector')}
                className="h-8 px-3 hover:bg-primary/10 hover:text-primary transition-colors"
          >
            Sector
          </Button>
          <Button
            variant={viewMode === 'stock' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleViewModeChange('stock')}
                className="h-8 px-3 hover:bg-primary/10 hover:text-primary transition-colors"
          >
            Stock
          </Button>
            </div>
          </div>

          {/* Start Date Selector */}
          <div className="flex-shrink-0 relative z-50">
            <label className="block text-sm font-medium mb-2">Start Date:</label>
            <input
              type="date"
              value={formatDateForInput(startDate)}
              onChange={(e) => handleStartDateChange(e.target.value)}
              max={formatDateForInput(endDate)}
              className="flex h-8 w-40 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 relative z-50"
            />
          </div>

          {/* End Date Selector */}
          <div className="flex-shrink-0 relative z-50">
            <label className="block text-sm font-medium mb-2">End Date:</label>
            <input
              type="date"
              value={formatDateForInput(endDate)}
              onChange={(e) => handleEndDateChange(e.target.value)}
              min={formatDateForInput(startDate)}
              max={formatDateForInput(new Date())}
              className="flex h-8 w-40 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 relative z-50"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* RRC Chart */}
        <div className="xl:col-span-3">
          <Card className="h-full flex flex-col">
            <CardHeader>
              <div className="flex justify-between items-center">
              <CardTitle>{viewMode === 'sector' ? 'Sector' : 'Stock'} Activity vs {selectedIndex}</CardTitle>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTriggerUpdate('rrc')}
                    disabled={isGenerating}
                    className="text-xs"
                    title="Trigger RRC Only"
                  >
                    📊 RRC
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTriggerUpdate('rrg')}
                    disabled={isGenerating}
                    className="text-xs"
                    title="Trigger RRG Only"
                  >
                    📈 RRG
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTriggerUpdate('all')}
                    disabled={isGenerating}
                    className="text-xs"
                    title="Trigger Both RRC & RRG"
                  >
                    🚀 Both
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleStopGeneration}
                    disabled={!isGenerating}
                    className="text-xs"
                  >
                    ⏹️ Stop
                  </Button>
                </div>
              </div>
              {debugMessage && (
                <div className="mt-2 p-2 bg-muted rounded text-xs">
                  {debugMessage}
                </div>
              )}
            </CardHeader>
            <CardContent className="flex-1">
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
                <ResponsiveContainer width="100%" height="100%">
                <LineChart data={currentData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="date" className="text-muted-foreground" />
                  <YAxis className="text-muted-foreground" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
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
                    dot={{ r: 3 }}
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
                        dot={{ r: 3 }}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
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
        <div className="xl:col-span-1">
          <Card className="h-full flex flex-col">
            <CardHeader>
              <CardTitle>Selection Panel</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 space-y-4">
              {/* Index Selection */}
              <div>
                <h4 className="text-sm font-medium mb-2">Index Selection</h4>
                <div className="relative" ref={indexSearchRef}>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search index..."
                      value={indexSearchQuery}
                      onChange={(e) => {
                        setIndexSearchQuery(e.target.value);
                        setShowIndexSearchDropdown(true);
                      }}
                      onFocus={() => setShowIndexSearchDropdown(true)}
                      className="w-full pl-7 pr-3 py-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 hover:border-primary/50 transition-colors"
                    />
                  </div>
                  
                  {/* Index Search Dropdown */}
                  {showIndexSearchDropdown && indexSearchQuery && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-md shadow-lg z-10 max-h-48 overflow-y-auto">
                      {getFilteredIndexOptions().map((option) => (
                        <button
                          key={option.name}
                          onClick={() => selectIndex(option.name)}
                          className="flex items-center justify-between w-full p-2 text-left hover:bg-accent transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: option.color }}
                            ></div>
                            <span className="text-sm">{option.name}</span>
                          </div>
                          <Plus className="w-3 h-3 text-muted-foreground" />
                        </button>
                      ))}
                      {getFilteredIndexOptions().length === 0 && (
                        <div className="p-2 text-sm text-muted-foreground">
                          No index found
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                {/* Selected Index Display */}
                <div className="mt-2">
                  <div className="flex items-center justify-between p-2 bg-muted rounded-md">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: indexOptions.find(opt => opt.name === selectedIndex)?.color || '#000000' }}
                      ></div>
                      <span className="text-sm font-medium">{selectedIndex}</span>
                    </div>
                    <Badge variant="secondary" className="text-xs">Locked</Badge>
                  </div>
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

              {/* Search (for stocks only) */}
              {viewMode === 'stock' && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Add Stock</h4>
                  <div className="relative" ref={searchRef}>
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Search stocks..."
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setShowSearchDropdown(true);
                        }}
                        onFocus={() => setShowSearchDropdown(true)}
                        className="w-full pl-7 pr-3 py-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 hover:border-primary/50 transition-colors"
                      />
                    </div>
                    
                    {/* Search Dropdown */}
                    {showSearchDropdown && searchQuery && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-md shadow-lg z-10 max-h-48 overflow-y-auto">
                        {getFilteredOptions().map((option) => (
                          <button
                            key={option.name}
                            onClick={() => addFromSearch(option.name)}
                            className="flex items-center justify-between w-full p-2 text-left hover:bg-accent transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: option.color }}
                              ></div>
                              <span className="text-sm">{option.name}</span>
                            </div>
                            <Plus className="w-3 h-3 text-muted-foreground" />
                          </button>
                        ))}
                        {getFilteredOptions().length === 0 && (
                          <div className="p-2 text-sm text-muted-foreground">
                            {currentOptions.filter(s => !selectedItems.includes(s.name)).length === 0 
                              ? `All ${viewMode === 'stock' ? 'stocks' : 'sectors'} already selected` 
                              : `No ${viewMode === 'stock' ? 'stocks' : 'sectors'} found`
                            }
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Available Options - Dropdown */}
              <div className="relative">
                <h4 className="text-sm font-medium mb-2">Available {viewMode === 'sector' ? 'Sectors' : 'Stocks'}</h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSearchDropdown(!showSearchDropdown)}
                  className="w-full justify-between"
                >
                  <span>Select {viewMode === 'sector' ? 'Sector' : 'Stock'} to Add</span>
                  <Plus className="h-4 w-4" />
                </Button>
                
                {showSearchDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-card border rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
                    {currentOptions.length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground">Loading options...</div>
                    ) : (
                      <>
                        {currentOptions
                          .filter(option => !selectedItems.includes(option.name))
                          .slice(0, viewMode === 'stock' ? 10 : undefined)
                          .map((option) => (
                          <button
                            key={option.name}
                            onClick={() => {
                              toggleItem(option.name);
                              setShowSearchDropdown(false);
                            }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-accent transition-colors"
                          >
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: option.color }}
                            ></div>
                            <span className="text-sm">{option.name}</span>
                          </button>
                        ))}
                        {viewMode === 'stock' && currentOptions.filter(option => !selectedItems.includes(option.name)).length > 10 && (
                          <div className="text-xs text-muted-foreground px-3 py-2 border-t border-border">
                            +{currentOptions.filter(option => !selectedItems.includes(option.name)).length - 10} more stocks (use search above)
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}