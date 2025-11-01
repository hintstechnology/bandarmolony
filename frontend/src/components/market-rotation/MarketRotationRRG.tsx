import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ComposedChart, Line } from 'recharts';
import { X, Search, Plus, Loader2, Play, RotateCcw, Calendar } from 'lucide-react';
import { api } from '@/services/api';
import { useToast } from '../../contexts/ToastContext';

// Helper function to format date for input
const formatDateForInput = (date: Date) => {
  return date.toISOString().split('T')[0];
};

// Helper function to get date from input
const getDateFromInput = (dateString: string) => {
  return new Date(dateString + 'T00:00:00');
};

// Removed unused helper functions

// Type definition for trajectory data
interface TrajectoryPoint {
  point: number;
  rsRatio: number;
  rsMomentum: number;
  color: string;
  name: string;
  isLatest: boolean;
  fill: string;
  stroke: string;
  radius: number;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
        <p className="font-medium text-card-foreground">{data.name}</p>
        <p className="text-sm text-muted-foreground">RS-Ratio: {data.rsRatio?.toFixed(2)}</p>
        <p className="text-sm text-muted-foreground">RS-Momentum: {data.rsMomentum?.toFixed(2)}</p>
        {data.point && (
          <p className="text-sm text-muted-foreground">Point: {data.point}/10</p>
        )}
      </div>
    );
  }
  return null;
};

export default function MarketRotationRRG() {
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
  
  const [trajectoryData, setTrajectoryData] = useState<TrajectoryPoint[]>([]);
  const [indexOptions, setIndexOptions] = useState<{name: string, color: string}[]>([]);
  const [sectorOptions, setSectorOptions] = useState<{name: string, color: string}[]>([]);
  const [stockOptions, setStockOptions] = useState<{name: string, color: string}[]>([]);
  const [screenerStocks, setScreenerStocks] = useState<any[]>([]);
  const [screenerSectors, setScreenerSectors] = useState<any[]>([]);
  const [loadedStockData, setLoadedStockData] = useState<any[]>([]);
  const [loadedSectorData, setLoadedSectorData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true); // Start with loading state
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingScanner, setIsLoadingScanner] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<any>(null);
  
  // Separate search states for stock and sector scanners
  const [stockScreenerSearchQuery, setStockScreenerSearchQuery] = useState('');
  const [sectorScreenerSearchQuery, setSectorScreenerSearchQuery] = useState('');
  const [showStockScreenerSearchDropdown, setShowStockScreenerSearchDropdown] = useState(false);
  const [showSectorScreenerSearchDropdown, setShowSectorScreenerSearchDropdown] = useState(false);
  const [stockScreenerSearchDropdownIndex, setStockScreenerSearchDropdownIndex] = useState(-1);
  const [sectorScreenerSearchDropdownIndex, setSectorScreenerSearchDropdownIndex] = useState(-1);
  
  // Table search and sorting states
  const [stockTableSearchQuery, setStockTableSearchQuery] = useState('');
  const [sectorTableSearchQuery, setSectorTableSearchQuery] = useState('');
  const [stockSortColumn, setStockSortColumn] = useState<string>('');
  const [stockSortDirection, setStockSortDirection] = useState<'asc' | 'desc'>('asc');
  const [sectorSortColumn, setSectorSortColumn] = useState<string>('');
  const [sectorSortDirection, setSectorSortDirection] = useState<'asc' | 'desc'>('asc');
  const searchRef = useRef<HTMLDivElement>(null);
  const indexSearchRef = useRef<HTMLDivElement>(null);
  const stockScreenerSearchRef = useRef<HTMLDivElement>(null);
  const sectorScreenerSearchRef = useRef<HTMLDivElement>(null);
  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);
  const isInitialMount = useRef(true);
  const isLoadingRef = useRef(false);

  // Load available inputs on mount and set defaults
  useEffect(() => {
    isInitialMount.current = true; // Reset on viewMode change
    
    const loadInputs = async () => {
      try {
        console.log('🔄 Frontend: Loading RRG inputs for viewMode:', viewMode);
        const result = await api.listRRGInputs();
        
        if (result.success && result.data) {
          console.log('✅ Frontend: RRG inputs loaded:', result.data);
          
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
            // Sector/Stock colors - vibrant, distinct colors
            const sectorStockColors = ['#3B82F6', '#10B981', '#EF4444', '#F59E0B', '#8B5CF6', '#06B6D4', '#84CC16', '#EC4899', '#F97316', '#14B8A6', '#A855F7', '#F43F5E', '#0EA5E9', '#22C55E', '#EAB308'];
            return items.map((item, index) => ({
              name: item,
              color: sectorStockColors[index % sectorStockColors.length] || '#6B7280'
            }));
          };
          
          console.log('📊 RRG Inputs received:', {
            indexes: result.data.index?.length || 0,
            sectors: result.data.sectors?.length || 0,
            stocks: result.data.stocks?.length || 0
          });
          
          setIndexOptions(generateIndexColors(result.data.index || []));
          setSectorOptions(generateSectorStockColors(result.data.sectors || []));
          setStockOptions(generateSectorStockColors(result.data.stocks || []));
          
          const defaultIndex = result.data.index?.[0] || 'COMPOSITE';
          if (!selectedIndex) {
            setSelectedIndex(defaultIndex);
          }
          
          let itemsToSelect: string[] = [];
          if (viewMode === 'sector' && result.data.sectors && result.data.sectors.length > 0) {
            const defaultSectors = ['Technology', 'Healthcare', 'Financials'];
            const availableSectors = result.data.sectors || [];
            const validSectors = defaultSectors.filter(sector => availableSectors.includes(sector));
            itemsToSelect = validSectors.length > 0 ? validSectors : [result.data.sectors[0]];
          } else if (viewMode === 'stock' && result.data.stocks && result.data.stocks.length > 0) {
            // Default stocks: BBCA, BBRI, BMRI
            const defaultStocks = ['BBCA', 'BBRI', 'BMRI'];
            const availableStocks = result.data.stocks || [];
            const validStocks = defaultStocks.filter(stock => availableStocks.includes(stock));
            itemsToSelect = validStocks.length > 0 ? validStocks : [result.data.stocks[0]];
          }
          
          if (itemsToSelect.length > 0) {
            setSelectedItems(itemsToSelect);
            const indexToUse = selectedIndex || defaultIndex;
            if (indexToUse && itemsToSelect.length > 0) {
              loadChartDataWithParams(indexToUse, itemsToSelect, viewMode);
            }
          }
          
          setIsLoading(false);
        } else {
          setError(result.error || 'Failed to load inputs');
          setIsLoading(false);
        }
      } catch (error) {
        console.error('❌ Frontend: Error loading inputs:', error);
        setError('Failed to load available options');
        setIsLoading(false);
      }
    };
    
    loadInputs();
  }, [viewMode]);

  // Load scanner data
  const loadScannerData = useCallback(async () => {
    setIsLoadingScanner(true);
    try {
      const [stockResponse, sectorResponse] = await Promise.all([
        api.getRRGScannerData('stock'),
        api.getRRGScannerData('sector')
      ]);

      if (stockResponse.success && sectorResponse.success) {
        console.log('✅ Scanner data loaded successfully:', {
          stockData: stockResponse.data,
          sectorData: sectorResponse.data
        });
        
        // Process and store stock scanner data
        const stockArray = Array.isArray(stockResponse.data?.data)
          ? stockResponse.data.data
          : [];
        if (stockArray.length > 0) {
          console.log('📊 Processing stock scanner data first row:', stockArray[0]);
          console.log('📊 Available columns in stock data:', Object.keys(stockArray[0] || {}));
          console.log('📊 Raw stock data sample:', stockArray.slice(0, 3));
          
          const formattedStocks = stockArray.map((item: any, index: number) => {
            // Try different ways to get the sector name
            const sectorName = item.Sector || item.sector || item['Sector'] || item['sector'] || 
                              item.SectorName || item.sector_name || item['Sector Name'] || 
                              item['sector_name'] || item['SECTOR'] || 'Unknown';
            
            if (index < 3) {
              console.log(`📊 Stock Item ${index}:`, {
                raw: item,
                sectorName: sectorName,
                allKeys: Object.keys(item)
              });
            }
            
            return {
              symbol: item.Symbol || item.symbol || item.name || 'Unknown',
              sector: sectorName,
              rsRatio: parseFloat(item['RS-Ratio'] ?? item['RS-Ratio'] ?? item.rs_ratio ?? item.rsRatio ?? 0),
              rsMomentum: parseFloat(item['RS-Momentum'] ?? item['RS-Momentum'] ?? item.rs_momentum ?? item.rsMomentum ?? 0),
              performance: parseFloat(item.Performance ?? item['Performance'] ?? item.performance ?? 0),
              trend: item.Trend || item['Trend'] || item.trend || 'Neutral'
            };
          });
          console.log('📊 Formatted stocks:', formattedStocks);
          setLoadedStockData(formattedStocks);
          setScreenerStocks(formattedStocks);
        } else {
          console.log('⚠️ No stock scanner data available');
          setLoadedStockData([]);
          setScreenerStocks([]);
        }

        // Process and store sector scanner data
        const sectorArray = Array.isArray(sectorResponse.data?.data)
          ? sectorResponse.data.data
          : [];
        if (sectorArray.length > 0) {
          console.log('📊 Processing sector scanner data first row:', sectorArray[0]);
          console.log('📊 Available columns in sector data:', Object.keys(sectorArray[0] || {}));
          console.log('📊 Raw sector data sample:', sectorArray.slice(0, 3));
          
          const formattedSectors = sectorArray.map((item: any, index: number) => {
            // Try different ways to get the sector name
            const sectorName = item.Sector || item.sector || item['Sector'] || item['sector'] || 
                              item.SectorName || item.sector_name || item['Sector Name'] || 
                              item['sector_name'] || item['SECTOR'] || 'Unknown';
            
            if (index < 3) {
              console.log(`📊 Sector Item ${index}:`, {
                raw: item,
                sectorName: sectorName,
                allKeys: Object.keys(item),
                finalSymbol: sectorName,
                finalSector: sectorName
              });
            }
            
            return {
              symbol: sectorName, // For sector data, symbol = sector name
              sector: sectorName, // For sector data, sector = sector name (same as symbol)
              rsRatio: parseFloat(item['RS-Ratio'] ?? item['RS-Ratio'] ?? item.rs_ratio ?? item.rsRatio ?? 0),
              rsMomentum: parseFloat(item['RS-Momentum'] ?? item['RS-Momentum'] ?? item.rs_momentum ?? item.rsMomentum ?? 0),
              performance: parseFloat(item.Performance ?? item['Performance'] ?? item.performance ?? 0),
              trend: item.Trend || item['Trend'] || item.trend || 'Neutral'
            };
          });
          console.log('📊 Formatted sectors:', formattedSectors);
          setLoadedSectorData(formattedSectors);
          setScreenerSectors(formattedSectors);
        } else {
          console.log('⚠️ No sector scanner data available');
          setLoadedSectorData([]);
          setScreenerSectors([]);
        }
      } else {
        console.error('❌ Failed to load scanner data:', stockResponse.error || sectorResponse.error);
        setScreenerStocks([]);
        setScreenerSectors([]);
      }
    } catch (err) {
      console.error('Error loading scanner data:', err);
      setScreenerStocks([]);
      setScreenerSectors([]);
    } finally {
      setIsLoadingScanner(false);
    }
  }, []);

  // Load scanner data on component mount
  useEffect(() => {
    loadScannerData();
  }, [loadScannerData]);

  // Click outside handlers
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false);
      }
      if (indexSearchRef.current && !indexSearchRef.current.contains(event.target as Node)) {
        setShowIndexSearchDropdown(false);
      }
      if (stockScreenerSearchRef.current && !stockScreenerSearchRef.current.contains(event.target as Node)) {
        setShowStockScreenerSearchDropdown(false);
      }
      if (sectorScreenerSearchRef.current && !sectorScreenerSearchRef.current.contains(event.target as Node)) {
        setShowSectorScreenerSearchDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle stock screener search dropdown
  useEffect(() => {
    if (stockScreenerSearchQuery) {
      setShowStockScreenerSearchDropdown(true);
      setStockScreenerSearchDropdownIndex(-1);
    } else {
      setShowStockScreenerSearchDropdown(false);
    }
  }, [stockScreenerSearchQuery]);

  // Handle sector screener search dropdown
  useEffect(() => {
    if (sectorScreenerSearchQuery) {
      setShowSectorScreenerSearchDropdown(true);
      setSectorScreenerSearchDropdownIndex(-1);
    } else {
      setShowSectorScreenerSearchDropdown(false);
    }
  }, [sectorScreenerSearchQuery]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    
    if (selectedIndex && selectedItems.length > 0 && !isLoading) {
      loadChartData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex, selectedItems, viewMode]);

  useEffect(() => {
    if (isGenerating) {
      const interval = setInterval(async () => {
        try {
          const statusResult = await api.getRRGStatus();
          if (statusResult.success && statusResult.data) {
            if (!statusResult.data.isGenerating) {
              console.log('✅ Frontend: RRG generation completed, refreshing chart data');
              setIsGenerating(false);
              setGenerationProgress(null);
              clearInterval(interval);
              loadChartData();
            } else {
              setGenerationProgress(statusResult.data.progress);
            }
          }
        } catch (error) {
          console.error('❌ Error checking generation status:', error);
        }
      }, 2000);

      return () => clearInterval(interval);
    }
    return undefined;
  }, [isGenerating]);

  const loadChartDataWithParams = async (index: string, items: string[], mode: 'sector' | 'stock') => {
    if (isLoadingRef.current) {
      console.log('⚠️ Frontend: Already loading, skipping...');
      return;
    }
    
    isLoadingRef.current = true;
    setIsLoading(true);
    setError(null);
    
    console.log('🔄 Frontend: Loading RRG chart data with params...');
    console.log('Index:', index);
    console.log('Items:', items);
    console.log('Mode:', mode);

    try {
      const statusResult = await api.getRRGStatus();
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
      
      const dataResult = mode === 'stock' 
        ? await api.getRRGData('stock', items, index, formatDateForInput(startDate), formatDateForInput(endDate)) 
        : await api.getRRGData('sector', items, index, formatDateForInput(startDate), formatDateForInput(endDate));
      
      console.log('📡 Frontend: Data API response:', dataResult);
      
      if (dataResult.success && dataResult.data) {
        const itemsData = dataResult.data.results || dataResult.data;
        
        console.log('📡 Frontend: Items data:', itemsData);
        
        if (Array.isArray(itemsData)) {
          console.log('✅ Frontend: Data is array, length:', itemsData.length);
          results.push(...itemsData);
        } else {
          console.log('⚠️ Frontend: Data is not array, wrapping it');
          results.push(itemsData);
        }
      }
      
      console.log('📊 Frontend: Total results after merge:', results.length);
      console.log('📊 Frontend: Results detail:', JSON.stringify(results, null, 2));
      
      if (results.length === 0) {
        console.error('❌ Frontend: No results - empty array!');
        setError('No data available for selected items. Data mungkin belum di-generate atau file tidak ditemukan di Azure.');
        setTrajectoryData([]);
        setIsLoading(false);
        isLoadingRef.current = false;
        return;
      }
      
      const trajectories = parseResultsToTrajectoryData(results, items);
      console.log('📊 Frontend: Parsed trajectory points:', trajectories.length);
      
      setTrajectoryData(trajectories);
      setError(null);
      setIsLoading(false);
      isLoadingRef.current = false;
    } catch (error) {
      console.error('❌ Frontend: Error loading chart data:', error);
      setError('Failed to load chart data');
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

  const parseResultsToTrajectoryData = (results: any[], originalItems: string[]): TrajectoryPoint[] => {
    if (results.length === 0) {
      console.log('📊 Frontend: No results to parse');
      return [];
    }
    
    console.log('📊 Frontend: Parsing RRG results to trajectory:', results);
    console.log('📊 Frontend: Original items:', originalItems);
    
    const allTrajectories: TrajectoryPoint[] = [];
    const currentOptions = viewMode === 'sector' ? sectorOptions : stockOptions;
    
    // Create mapping from cleaned name to original name
    const itemMapping: Record<string, string> = {};
    originalItems.forEach(item => {
      const cleaned = item.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      itemMapping[cleaned] = item;
    });
    
    console.log('📊 Frontend: Item mapping:', itemMapping);
    
    results.forEach((result) => {
      if (result.data && Array.isArray(result.data)) {
        // Get original item name from mapping
        const originalItemName = itemMapping[result.item] || result.item;
        const dataPoints = result.data.slice(-10);
        const itemColor = currentOptions.find(opt => opt.name === originalItemName)?.color || '#6B7280';
        
        console.log(`📊 Processing item: ${result.item} -> ${originalItemName}, color: ${itemColor}, dataPoints:`, dataPoints.length);
        
        dataPoints.forEach((row: any, pointIdx: number) => {
          if (row && row.rs_ratio !== undefined && row.rs_momentum !== undefined) {
            const isLast = pointIdx === dataPoints.length - 1;
            let size = 3;
            
            if (isLast) {
              size = 20;
            } else if (dataPoints.length > 1) {
              const progress = pointIdx / (dataPoints.length - 1);
              size = 3 + progress * 17;
            }
            
            const rsRatio = parseFloat(String(row.rs_ratio)) || 100;
            const rsMomentum = parseFloat(String(row.rs_momentum)) || 100;
            
            console.log(`  Point ${pointIdx + 1}: RS-Ratio=${rsRatio}, RS-Momentum=${rsMomentum}, size=${size}`);
            
            allTrajectories.push({
              point: pointIdx + 1,
              rsRatio: rsRatio,
              rsMomentum: rsMomentum,
              name: originalItemName,
              color: itemColor,
              isLatest: isLast,
              fill: itemColor,
              stroke: itemColor,
              radius: size
            });
          }
        });
      }
    });
    
    console.log('📊 Frontend: Final trajectory data points:', allTrajectories.length);
    console.log('📊 Frontend: Sample points:', allTrajectories.slice(0, 3));
    return allTrajectories;
  };


  const currentOptions = viewMode === 'sector' ? sectorOptions : stockOptions;


  const removeItem = (itemName: string) => {
    setSelectedItems(prev => {
      const newItems = prev.filter(item => item !== itemName);
      if (newItems.length === 0) {
        showToast({ type: 'error', title: 'Selection Error', message: 'At least one item must be selected' });
        return prev;
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
    setTrajectoryData([]);
    
    if (mode === 'sector' && sectorOptions.length > 0) {
      setSelectedItems([sectorOptions[0]?.name || 'Technology']);
      loadChartDataWithParams(selectedIndex, [sectorOptions[0]?.name || 'Technology'], mode);
    } else if (mode === 'stock' && stockOptions.length > 0) {
      // Default stocks: BBCA, BBRI, BMRI
      const defaultStocks = ['BBCA', 'BBRI', 'BMRI'];
      const availableDefaults = defaultStocks.filter(stock => 
        stockOptions.some(opt => opt.name === stock)
      );
      const itemsToSelect = availableDefaults.length > 0 ? availableDefaults : [stockOptions[0]?.name || 'BBCA'];
      setSelectedItems(itemsToSelect);
      loadChartDataWithParams(selectedIndex, itemsToSelect, mode);
    }
  };



  const getFilteredStockScreenerOptions = useMemo(() => {
    return stockOptions.filter(option => 
      option.name.toLowerCase().includes(stockScreenerSearchQuery.toLowerCase()) &&
      !screenerStocks.some(stock => stock.symbol === option.name)
    );
  }, [stockScreenerSearchQuery, screenerStocks, stockOptions]);

  const getFilteredSectorScreenerOptions = useMemo(() => {
    return sectorOptions.filter(option => 
      option.name.toLowerCase().includes(sectorScreenerSearchQuery.toLowerCase()) &&
      !screenerSectors.some(sector => sector.symbol === option.name)
    );
  }, [sectorScreenerSearchQuery, screenerSectors, sectorOptions]);

  // Keyboard navigation handlers
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    const filteredOptions = viewMode === 'sector' ? filteredSectorOptions : filteredStockOptions;
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
    const availableOptions = filteredIndexOptions.filter(option => !selectedIndexes.includes(option.name));
    
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

  const handleStockScreenerSearchKeyDown = (e: React.KeyboardEvent) => {
    const availableOptions = getFilteredStockScreenerOptions;
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setStockScreenerSearchDropdownIndex(prev => 
          prev < availableOptions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setStockScreenerSearchDropdownIndex(prev => 
          prev > 0 ? prev - 1 : availableOptions.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (stockScreenerSearchDropdownIndex >= 0 && availableOptions[stockScreenerSearchDropdownIndex]) {
          addToScreener(availableOptions[stockScreenerSearchDropdownIndex].name);
        }
        break;
      case 'Escape':
        setShowStockScreenerSearchDropdown(false);
        setStockScreenerSearchDropdownIndex(-1);
        break;
    }
  };

  const handleSectorScreenerSearchKeyDown = (e: React.KeyboardEvent) => {
    const availableOptions = getFilteredSectorScreenerOptions;
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSectorScreenerSearchDropdownIndex(prev => 
          prev < availableOptions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSectorScreenerSearchDropdownIndex(prev => 
          prev > 0 ? prev - 1 : availableOptions.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (sectorScreenerSearchDropdownIndex >= 0 && availableOptions[sectorScreenerSearchDropdownIndex]) {
          addToSectorScreener(availableOptions[sectorScreenerSearchDropdownIndex].name);
        }
        break;
      case 'Escape':
        setShowSectorScreenerSearchDropdown(false);
        setSectorScreenerSearchDropdownIndex(-1);
        break;
    }
  };




  const handleGo = () => {
    if (selectedIndex && selectedItems.length > 0) {
      loadChartDataWithParams(selectedIndex, selectedItems, viewMode);
    }
  };

  const handleReset = () => {
    // Reset to default dates
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
      const itemsToSelect = availableDefaults.length > 0 ? availableDefaults : [sectorOptions[0]?.name || 'Technology'];
      setSelectedItems(itemsToSelect);
      loadChartDataWithParams(selectedIndex, itemsToSelect, 'sector');
    } else if (viewMode === 'stock' && stockOptions.length > 0) {
      // Default stocks: BBCA, BBRI, BMRI
      const defaultStocks = ['BBCA', 'BBRI', 'BMRI'];
      const availableDefaults = defaultStocks.filter(stock => 
        stockOptions.some(opt => opt.name === stock)
      );
      const itemsToSelect = availableDefaults.length > 0 ? availableDefaults : [stockOptions[0]?.name || 'BBCA'];
      setSelectedItems(itemsToSelect);
      loadChartDataWithParams(selectedIndex, itemsToSelect, 'stock');
    }
    
    // Clear chart data
    setTrajectoryData([]);
  };

  const hasValidSelection = () => {
    return selectedIndex && selectedItems.length > 0;
  };

  const addToScreener = useCallback((stockName: string) => {
    const stockOption = stockOptions.find(opt => opt.name === stockName);
    if (stockOption && !screenerStocks.some(stock => stock.symbol === stockName)) {
      // Get the actual stock data from the loaded scanner data
      const actualStockData = loadedStockData.find(stock => stock.symbol === stockName);
      const newStock = {
        symbol: stockName,
        sector: actualStockData?.sector || 'Unknown', // Use actual sector name from CSV data
        rsRatio: actualStockData?.rsRatio || Math.random() * 20 + 90,
        rsMomentum: actualStockData?.rsMomentum || Math.random() * 20 + 90,
        performance: actualStockData?.performance || (Math.random() - 0.5) * 10,
        volume: ['HIGH', 'MEDIUM', 'LOW'][Math.floor(Math.random() * 3)] || 'MEDIUM',
        trend: actualStockData?.trend || ['STRONG', 'IMPROVING', 'WEAKENING', 'WEAK'][Math.floor(Math.random() * 4)] || 'IMPROVING'
      };
      setScreenerStocks(prev => [...prev, newStock]);
    }
    setStockScreenerSearchQuery('');
    setShowStockScreenerSearchDropdown(false);
    setStockScreenerSearchDropdownIndex(-1);
  }, [screenerStocks, stockOptions, loadedStockData]);

  const addToSectorScreener = useCallback((sectorName: string) => {
    const sectorOption = sectorOptions.find(opt => opt.name === sectorName);
    if (sectorOption && !screenerSectors.some(sector => sector.symbol === sectorName)) {
      // Get the actual sector data from the loaded SECTOR scanner data (not stock data)
      const actualSectorData = loadedSectorData.find(sector => sector.symbol === sectorName);
      console.log('🔍 Adding sector to screener:', {
        sectorName,
        actualSectorData,
        loadedSectorData: loadedSectorData.slice(0, 3)
      });
      
      const newSector = {
        symbol: sectorName,
        sector: sectorName, // For sector screener, the sector name is the same as the symbol
        rsRatio: actualSectorData?.rsRatio || Math.random() * 20 + 90,
        rsMomentum: actualSectorData?.rsMomentum || Math.random() * 20 + 90,
        performance: actualSectorData?.performance || (Math.random() - 0.5) * 10,
        volume: ['HIGH', 'MEDIUM', 'LOW'][Math.floor(Math.random() * 3)] || 'MEDIUM',
        trend: actualSectorData?.trend || ['STRONG', 'IMPROVING', 'WEAKENING', 'WEAK'][Math.floor(Math.random() * 4)] || 'IMPROVING'
      };
      console.log('🔍 New sector created:', newSector);
      setScreenerSectors(prev => [...prev, newSector]);
    }
    setSectorScreenerSearchQuery('');
    setShowSectorScreenerSearchDropdown(false);
    setSectorScreenerSearchDropdownIndex(-1);
  }, [screenerSectors, sectorOptions, loadedSectorData]);


  const getBadgeVariant = useCallback((trend: string) => {
    switch (trend) {
      case 'STRONG': return 'default';
      case 'IMPROVING': return 'secondary';
      case 'WEAKENING': return 'outline';
      case 'WEAK': return 'destructive';
      default: return 'secondary';
    }
  }, []);

  // Sorting and filtering functions
  const getSortedAndFilteredStocks = useCallback(() => {
    let filtered = screenerStocks;
    
    // Apply search filter
    if (stockTableSearchQuery) {
      filtered = filtered.filter(item => 
        item.symbol.toLowerCase().includes(stockTableSearchQuery.toLowerCase()) ||
        item.sector.toLowerCase().includes(stockTableSearchQuery.toLowerCase()) ||
        item.trend.toLowerCase().includes(stockTableSearchQuery.toLowerCase())
      );
    }
    
    // Apply sorting
    if (stockSortColumn) {
      filtered = [...filtered].sort((a, b) => {
        let aVal = a[stockSortColumn as keyof typeof a];
        let bVal = b[stockSortColumn as keyof typeof b];
        
        // Handle numeric values
        if (stockSortColumn === 'rsRatio' || stockSortColumn === 'rsMomentum' || stockSortColumn === 'performance') {
          aVal = Number(aVal) || 0;
          bVal = Number(bVal) || 0;
        }
        
        if (stockSortDirection === 'asc') {
          return aVal > bVal ? 1 : -1;
        } else {
          return aVal < bVal ? 1 : -1;
        }
      });
    }
    
    return filtered;
  }, [screenerStocks, stockTableSearchQuery, stockSortColumn, stockSortDirection]);

  const getSortedAndFilteredSectors = useCallback(() => {
    let filtered = screenerSectors;
    
    // Apply search filter
    if (sectorTableSearchQuery) {
      filtered = filtered.filter(item => 
        item.symbol.toLowerCase().includes(sectorTableSearchQuery.toLowerCase()) ||
        item.sector.toLowerCase().includes(sectorTableSearchQuery.toLowerCase()) ||
        item.trend.toLowerCase().includes(sectorTableSearchQuery.toLowerCase())
      );
    }
    
    // Apply sorting
    if (sectorSortColumn) {
      filtered = [...filtered].sort((a, b) => {
        let aVal = a[sectorSortColumn as keyof typeof a];
        let bVal = b[sectorSortColumn as keyof typeof b];
        
        // Handle numeric values
        if (sectorSortColumn === 'rsRatio' || sectorSortColumn === 'rsMomentum' || sectorSortColumn === 'performance') {
          aVal = Number(aVal) || 0;
          bVal = Number(bVal) || 0;
        }
        
        if (sectorSortDirection === 'asc') {
          return aVal > bVal ? 1 : -1;
        } else {
          return aVal < bVal ? 1 : -1;
        }
      });
    }
    
    return filtered;
  }, [screenerSectors, sectorTableSearchQuery, sectorSortColumn, sectorSortDirection]);

  const handleStockSort = (column: string) => {
    if (stockSortColumn === column) {
      setStockSortDirection(stockSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setStockSortColumn(column);
      setStockSortDirection('asc');
    }
  };

  const handleSectorSort = (column: string) => {
    if (sectorSortColumn === column) {
      setSectorSortDirection(sectorSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSectorSortColumn(column);
      setSectorSortDirection('asc');
    }
  };

  // Memoized filtered data for performance
  const filteredTrajectoryData = useMemo(() => 
    trajectoryData.filter(point => selectedItems.includes(point.name)), 
    [trajectoryData, selectedItems]
  );

  // Memoized filtered options for performance
  const filteredIndexOptions = useMemo(() => 
    indexOptions.filter(option => 
      option.name.toLowerCase().includes(indexSearchQuery.toLowerCase())
    ), 
    [indexOptions, indexSearchQuery]
  );

  const filteredSectorOptions = useMemo(() => 
    sectorOptions.filter(option => 
      option.name.toLowerCase().includes(searchQuery.toLowerCase())
    ), 
    [sectorOptions, searchQuery]
  );

  const filteredStockOptions = useMemo(() => 
    stockOptions.filter(option => 
      option.name.toLowerCase().includes(searchQuery.toLowerCase())
    ), 
    [stockOptions, searchQuery]
  );

  return (
    <div className="space-y-6">
      {/* Control Panel */}
      <div className="mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* View Mode Toggle */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-foreground">View Mode</label>
                <div className="flex items-center gap-1 border border-border rounded-lg p-1 h-10">
                  <Button
                    variant={viewMode === 'sector' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => handleViewModeChange('sector')}
                    className="h-full px-3 flex-1 text-xs sm:text-sm"
                  >
                    Sector
                  </Button>
                  <Button
                    variant={viewMode === 'stock' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => handleViewModeChange('stock')}
                    className="h-full px-3 flex-1 text-xs sm:text-sm"
                  >
                    Stock
                  </Button>
                </div>
              </div>

              {/* Start Date */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Start Date</label>
                <div 
                  className="relative h-10 w-full rounded-md border border-input bg-background cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => startDateRef.current?.showPicker()}
                >
                  <input
                    ref={startDateRef}
                    type="date"
                    value={formatDateForInput(startDate)}
                    onChange={(e) => setStartDate(getDateFromInput(e.target.value))}
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
                  onClick={() => endDateRef.current?.showPicker()}
                >
                  <input
                    ref={endDateRef}
                    type="date"
                    value={formatDateForInput(endDate)}
                    onChange={(e) => setEndDate(getDateFromInput(e.target.value))}
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
                    onClick={handleGo}
                    disabled={isLoading || !hasValidSelection()}
                    className="flex-1 h-10 px-3 py-2 text-sm font-medium rounded-md border border-input bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading...
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
                    disabled={isLoading}
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
        {/* RRG Chart */}
        <div className="lg:col-span-3">
          <Card className="flex h-full flex-col">
            <CardHeader>
              <CardTitle>Relative Rotation Graph (RRG) vs {selectedIndex}</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-[320px] md:min-h-[420px]">
              {isGenerating ? (
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
                    <Button variant="outline" size="sm" onClick={() => loadChartData()}>Retry</Button>
                  </div>
                </div>
              ) : filteredTrajectoryData.length === 0 && !isLoading && !isGenerating ? (
                <div className="flex items-center justify-center h-96">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground mb-2">No data available</p>
                    <p className="text-xs text-muted-foreground mb-3">Data mungkin sedang diproses atau belum tersedia</p>
                    <Button variant="outline" size="sm" onClick={() => loadChartData()}>Reload Data</Button>
                  </div>
                </div>
              ) : filteredTrajectoryData.length > 0 ? (
                <div className="relative h-full w-full min-h-[320px] md:min-h-[420px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={filteredTrajectoryData} margin={{ bottom: 20, left: 20, right: 20, top: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted-foreground))" opacity={0.3} />
                      <XAxis type="number" dataKey="rsRatio" domain={[90, 110]} name="RS-Ratio" stroke="hsl(var(--foreground))" tick={{ fill: 'hsl(var(--foreground))' }} />
                      <YAxis type="number" dataKey="rsMomentum" domain={[90, 110]} name="RS-Momentum" stroke="hsl(var(--foreground))" tick={{ fill: 'hsl(var(--foreground))' }} />
                  <ReferenceLine x={100} stroke="hsl(var(--foreground))" strokeDasharray="2 2" />
                  <ReferenceLine y={100} stroke="hsl(var(--foreground))" strokeDasharray="2 2" />
                  <Tooltip content={<CustomTooltip />} />
                  
                      {/* Render latest points */}
                      {filteredTrajectoryData.filter(point => point.isLatest).map((point, index) => (
                        <Scatter key={`${point.name}-${index}`} dataKey="rsMomentum" fill={point.fill} stroke={point.stroke} fillOpacity={0.8} strokeOpacity={0.8} r={point.radius} data={[point]} />
                      ))}
                      
                      {/* Trajectory lines for all selected items with gradient opacity and tapered ends */}
                      {(() => {
                        // Group trajectories by item name
                        const trajectories: Record<string, TrajectoryPoint[]> = {};
                        selectedItems.forEach(itemName => {
                          const itemTrajectory = trajectoryData.filter(point => point.name === itemName);
                          if (itemTrajectory.length > 0) {
                            trajectories[itemName] = itemTrajectory;
                          }
                        });
                        
                        return Object.values(trajectories).map((trajectory) => {
                          const itemName = trajectory[0]?.name;
                    const itemOption = currentOptions.find(opt => opt.name === itemName);
                          
                          // Create gradient lines for each segment
                          return trajectory.map((point, index) => {
                            if (index === 0) return null; // Skip first point as it has no previous point to connect
                            
                            const previousPoint = trajectory[index - 1];
                            if (!previousPoint) return null;
                            const segmentData = [previousPoint, point];
                            
                            // Calculate opacity: newer segments are more opaque with smoother gradient
                            const totalPoints = trajectory.length;
                            const progress = index / (totalPoints - 1);
                            const opacity = 0.1 + (progress * progress * 0.9); // Smoother curve: 0.1 to 1.0
                            
                            // Calculate stroke width: taper from thin to thick
                            const strokeWidth = 0.5 + (progress * 2.5); // From 0.5 to 3.0
                    
                    return (
                      <Line
                                key={`line-${itemName}-${index}`}
                        type="monotone"
                        dataKey="rsMomentum"
                                stroke={itemOption?.color || trajectory[0]?.stroke || '#6B7280'}
                                strokeWidth={strokeWidth}
                        dot={false}
                                data={segmentData}
                        connectNulls={false}
                                strokeOpacity={opacity}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            );
                          }).filter(Boolean);
                        }).flat();
                      })()}
                      
                      <Scatter dataKey="rsMomentum" fill="#000000" data={[{ rsRatio: 100, rsMomentum: 100 }]} r={8} />
                  </ComposedChart>
                </ResponsiveContainer>
              
                  {/* Quadrant Labels */}
              <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-1/2 -left-8 text-sm text-muted-foreground font-bold whitespace-nowrap" style={{ transform: 'translateY(-50%) rotate(-90deg)', transformOrigin: 'center', zIndex: 10 }}>RS-Momentum</div>
                    <div className="absolute bottom-2 left-1/2 text-sm text-muted-foreground font-bold whitespace-nowrap text-center" style={{ transform: 'translateX(-50%)', zIndex: 10 }}>RS-Ratio</div>
                    <div className="absolute top-[8%] left-[15%]"><span className="text-blue-600 font-bold text-lg bg-background/80 px-3 py-2 rounded">Improving</span></div>
                    <div className="absolute top-[8%] right-[10%]"><span className="text-green-600 font-bold text-lg bg-background/80 px-3 py-2 rounded">Leading</span></div>
                    <div className="absolute bottom-[25%] left-[15%]"><span className="text-red-600 font-bold text-lg bg-background/80 px-3 py-2 rounded">Lagging</span></div>
                    <div className="absolute bottom-[25%] right-[10%]"><span className="text-yellow-600 font-bold text-lg bg-background/80 px-3 py-2 rounded">Weakening</span></div>
                </div>
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

        {/* Selection Panel - SAMA DENGAN RRC */}
        <div className="lg:col-span-1">
          <Card className="h-full flex flex-col">
            <CardHeader>
              <CardTitle>Selection Panel</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                  
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
                          {(indexSearchQuery ? filteredIndexOptions : indexOptions.filter(option => !selectedIndexes.includes(option.name)))
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
                          {indexSearchQuery && filteredIndexOptions.length === 0 && (
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

              {/* Selected Items */}
              {selectedItems.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium">Selected ({selectedItems.length})</h4>
                    {selectedItems.length === 1 && (
                      <Badge variant="outline" className="text-xs">Min. required</Badge>
                    )}
                  </div>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
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
                      At least one {viewMode === 'sector' ? 'sector' : 'stock'} must be selected for comparison
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
                          {(searchQuery ? (viewMode === 'sector' ? filteredSectorOptions : filteredStockOptions) : currentOptions.filter(option => !selectedItems.includes(option.name)))
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
                          {searchQuery && (viewMode === 'sector' ? filteredSectorOptions : filteredStockOptions).length === 0 && (
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
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Relative Momentum Screener (Stock) */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <CardTitle>Relative Momentum Screener (Stock)</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={loadScannerData}
                disabled={isLoadingScanner}
                className="h-8"
              >
                {isLoadingScanner ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RotateCcw className="w-3 h-3" />
                )}
              </Button>
            </div>
            <div className="relative" ref={stockScreenerSearchRef}>
              <h4 className="text-sm font-medium mb-2">
                Available Stocks: {isLoadingScanner ? (
                  <div className="inline-flex items-center gap-2">
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary"></div>
                    <span>Loading...</span>
                  </div>
                ) : (
                  stockOptions.length
                )}
              </h4>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search and add stock to screener"
                  value={stockScreenerSearchQuery}
                  onChange={(e) => {
                    setStockScreenerSearchQuery(e.target.value);
                    setShowStockScreenerSearchDropdown(true);
                    setStockScreenerSearchDropdownIndex(-1);
                  }}
                  onFocus={() => setShowStockScreenerSearchDropdown(true)}
                  onKeyDown={handleStockScreenerSearchKeyDown}
                  className="w-full pl-8 pr-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 hover:border-primary/50 transition-colors sm:w-56"
                />
              </div>
              
              {/* Stock Screener Search Dropdown */}
              {showStockScreenerSearchDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
                  {stockOptions.length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground">Loading stocks...</div>
                  ) : (
                    <>
                      {/* Show filtered results when searching */}
                      {stockScreenerSearchQuery ? (
                        <>
                          {getFilteredStockScreenerOptions
                            .filter(option => !screenerStocks.some(stock => stock.symbol === option.name))
                            .slice(0, 15)
                            .map((option: any, index) => (
                    <button
                      key={option.name}
                                onClick={() => addToScreener(option.name)}
                                className={`flex items-center justify-between w-full px-3 py-2 text-left hover:bg-accent transition-colors ${
                                  index === stockScreenerSearchDropdownIndex ? 'bg-accent' : ''
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: option.color }}></div>
                      <span className="text-sm">{option.name}</span>
                                </div>
                                <Plus className="w-3 h-3 text-muted-foreground" />
                    </button>
                  ))}
                          {getFilteredStockScreenerOptions.filter(option => !screenerStocks.some(stock => stock.symbol === option.name)).length === 0 && (
                            <div className="p-2 text-sm text-muted-foreground">
                              {screenerStocks.some(stock => stock.symbol.toLowerCase().includes(stockScreenerSearchQuery.toLowerCase())) 
                                ? `"${stockScreenerSearchQuery}" is already in the screener`
                                : `No stocks found matching "${stockScreenerSearchQuery}"`
                              }
                    </div>
                  )}
                        </>
                      ) : (
                        // Show all available options when not searching
                        <>
                          {stockOptions
                            .filter(option => !screenerStocks.some(stock => stock.symbol === option.name))
                            .slice(0, 15)
                            .map((option: any, index) => (
                              <button
                                key={option.name}
                                onClick={() => addToScreener(option.name)}
                                className={`flex items-center justify-between w-full px-3 py-2 text-left hover:bg-accent transition-colors ${
                                  index === stockScreenerSearchDropdownIndex ? 'bg-accent' : ''
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: option.color }}></div>
                                  <span className="text-sm">{option.name}</span>
                </div>
                                <Plus className="w-3 h-3 text-muted-foreground" />
                              </button>
                            ))}
                          
                          {/* Show "more available" message */}
                          {!stockScreenerSearchQuery && stockOptions.length > 15 && (
                            <div className="text-xs text-muted-foreground px-3 py-2 border-t border-border">
                              +{stockOptions.length - 15} more stocks available (use search to find specific stocks)
              </div>
                          )}
                        </>
                      )}
                    </>
                  )}
        </div>
              )}
      </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {isLoadingScanner ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin mx-auto mb-2" />
                Loading scanner data...
              </div>
            ) : screenerStocks.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No stock screener data. Search and add stocks above.
              </div>
            ) : (
              <div className="space-y-4">
                {/* Table Search Bar */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search in table..."
                      value={stockTableSearchQuery}
                      onChange={(e) => setStockTableSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-8 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 hover:border-primary/50 transition-colors"
                    />
                    {stockTableSearchQuery && (
                      <button
                        onClick={() => setStockTableSearchQuery('')}
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {getSortedAndFilteredStocks().length} of {screenerStocks.length} items
                  </div>
                </div>
                
                {/* Desktop/Table view */}
                <div className="hidden md:grid grid-cols-6 gap-2 text-xs font-medium text-muted-foreground border-b pb-2">
                  <button 
                    onClick={() => handleStockSort('symbol')}
                    className="text-left hover:text-foreground transition-colors flex items-center gap-1"
                  >
                    Symbol {stockSortColumn === 'symbol' && (stockSortDirection === 'asc' ? '↑' : '↓')}
                  </button>
                  <button 
                    onClick={() => handleStockSort('sector')}
                    className="text-left hover:text-foreground transition-colors flex items-center gap-1"
                  >
                    Sector {stockSortColumn === 'sector' && (stockSortDirection === 'asc' ? '↑' : '↓')}
                  </button>
                  <button 
                    onClick={() => handleStockSort('rsRatio')}
                    className="text-left hover:text-foreground transition-colors flex items-center gap-1"
                  >
                    RS-Ratio {stockSortColumn === 'rsRatio' && (stockSortDirection === 'asc' ? '↑' : '↓')}
                  </button>
                  <button 
                    onClick={() => handleStockSort('rsMomentum')}
                    className="text-left hover:text-foreground transition-colors flex items-center gap-1"
                  >
                    RS-Momentum {stockSortColumn === 'rsMomentum' && (stockSortDirection === 'asc' ? '↑' : '↓')}
                  </button>
                  <button 
                    onClick={() => handleStockSort('performance')}
                    className="text-left hover:text-foreground transition-colors flex items-center gap-1"
                  >
                    Performance {stockSortColumn === 'performance' && (stockSortDirection === 'asc' ? '↑' : '↓')}
                  </button>
                  <button 
                    onClick={() => handleStockSort('trend')}
                    className="text-left hover:text-foreground transition-colors flex items-center gap-1"
                  >
                    Trend {stockSortColumn === 'trend' && (stockSortDirection === 'asc' ? '↑' : '↓')}
                  </button>
                </div>
                <div className="hidden md:block max-h-80 overflow-y-auto pr-1">
                  <div className="space-y-2">
                    {getSortedAndFilteredStocks().map((item, index) => (
                      <div key={index} className="grid grid-cols-6 gap-2 items-center border-b border-border/50 py-2 text-xs">
                        <div className="font-medium text-card-foreground">{item.symbol}</div>
                        <div className="text-muted-foreground">{item.sector}</div>
                        <div className="text-card-foreground">{item.rsRatio.toFixed(1)}</div>
                        <div className="text-card-foreground">{item.rsMomentum.toFixed(1)}</div>
                        <div className={item.performance >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {item.performance >= 0 ? '+' : ''}{item.performance.toFixed(1)}%
                        </div>
                        <div>
                          <Badge variant={getBadgeVariant(item.trend)} className="text-xs">
                            {item.trend}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Mobile stacked view */}
                <div className="grid gap-3 md:hidden">
                  {getSortedAndFilteredStocks().map((item, index) => (
                    <div key={index} className="rounded-lg border border-border bg-card p-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-card-foreground">{item.symbol}</div>
                        <Badge variant={getBadgeVariant(item.trend)} className="text-[10px] uppercase tracking-wide">
                          {item.trend}
                        </Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-muted-foreground">
                        <span>Sektor</span>
                        <span className="text-right text-card-foreground">{item.sector}</span>
                        <span>RS-Ratio</span>
                        <span className="text-right text-card-foreground">{item.rsRatio.toFixed(1)}</span>
                        <span>RS-Momentum</span>
                        <span className="text-right text-card-foreground">{item.rsMomentum.toFixed(1)}</span>
                        <span>Performance</span>
                        <span className={`text-right ${item.performance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {item.performance >= 0 ? '+' : ''}{item.performance.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Relative Momentum Screener (Sector) */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <CardTitle>Relative Momentum Screener (Sector)</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={loadScannerData}
                disabled={isLoadingScanner}
                className="h-8"
              >
                {isLoadingScanner ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RotateCcw className="w-3 h-3" />
                )}
              </Button>
            </div>
            <div className="relative" ref={sectorScreenerSearchRef}>
              <h4 className="text-sm font-medium mb-2">
                Available Sectors: {isLoadingScanner ? (
                  <div className="inline-flex items-center gap-2">
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary"></div>
                    <span>Loading...</span>
                  </div>
                ) : (
                  sectorOptions.length
                )}
              </h4>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search and add sector to screener"
                  value={sectorScreenerSearchQuery}
                  onChange={(e) => {
                    setSectorScreenerSearchQuery(e.target.value);
                    setShowSectorScreenerSearchDropdown(true);
                    setSectorScreenerSearchDropdownIndex(-1);
                  }}
                  onFocus={() => setShowSectorScreenerSearchDropdown(true)}
                  onKeyDown={handleSectorScreenerSearchKeyDown}
                  className="w-full pl-8 pr-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 hover:border-primary/50 transition-colors sm:w-56"
                />
              </div>
              
              {/* Sector Screener Search Dropdown */}
              {showSectorScreenerSearchDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
                  {sectorOptions.length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground">Loading sectors...</div>
                  ) : (
                    <>
                      {/* Show filtered results when searching */}
                      {sectorScreenerSearchQuery ? (
                        <>
                          {getFilteredSectorScreenerOptions
                            .filter(option => !screenerSectors.some(sector => sector.symbol === option.name))
                            .slice(0, 15)
                            .map((option: any, index) => (
                    <button
                      key={option.name}
                                onClick={() => addToSectorScreener(option.name)}
                                className={`flex items-center justify-between w-full px-3 py-2 text-left hover:bg-accent transition-colors ${
                                  index === sectorScreenerSearchDropdownIndex ? 'bg-accent' : ''
                                }`}
                    >
                      <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: option.color }}></div>
                        <span className="text-sm">{option.name}</span>
                      </div>
                      <Plus className="w-3 h-3 text-muted-foreground" />
                    </button>
                  ))}
                          {getFilteredSectorScreenerOptions.filter(option => !screenerSectors.some(sector => sector.symbol === option.name)).length === 0 && (
                    <div className="p-2 text-sm text-muted-foreground">
                              {screenerSectors.some(sector => sector.symbol.toLowerCase().includes(sectorScreenerSearchQuery.toLowerCase())) 
                                ? `"${sectorScreenerSearchQuery}" is already in the screener`
                                : `No sectors found matching "${sectorScreenerSearchQuery}"`
                      }
                    </div>
                  )}
                        </>
                      ) : (
                        // Show all available options when not searching
                        <>
                          {sectorOptions
                            .filter(option => !screenerSectors.some(sector => sector.symbol === option.name))
                            .slice(0, 15)
                            .map((option: any, index) => (
                              <button
                                key={option.name}
                                onClick={() => addToSectorScreener(option.name)}
                                className={`flex items-center justify-between w-full px-3 py-2 text-left hover:bg-accent transition-colors ${
                                  index === sectorScreenerSearchDropdownIndex ? 'bg-accent' : ''
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: option.color }}></div>
                                  <span className="text-sm">{option.name}</span>
                                </div>
                                <Plus className="w-3 h-3 text-muted-foreground" />
                              </button>
                            ))}
                          
                          {/* Show "more available" message */}
                          {!sectorScreenerSearchQuery && sectorOptions.length > 15 && (
                            <div className="text-xs text-muted-foreground px-3 py-2 border-t border-border">
                              +{sectorOptions.length - 15} more sectors available (use search to find specific sectors)
                </div>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {isLoadingScanner ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin mx-auto mb-2" />
                Loading scanner data...
              </div>
            ) : screenerSectors.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No sector screener data. Search and add sectors above.
              </div>
            ) : (
              <div className="space-y-4">
                {/* Table Search Bar */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search in table..."
                      value={sectorTableSearchQuery}
                      onChange={(e) => setSectorTableSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-8 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 hover:border-primary/50 transition-colors"
                    />
                    {sectorTableSearchQuery && (
                      <button
                        onClick={() => setSectorTableSearchQuery('')}
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {getSortedAndFilteredSectors().length} of {screenerSectors.length} items
                  </div>
                </div>
                
                {/* Desktop/Table view */}
                <div className="hidden md:grid grid-cols-5 gap-2 text-xs font-medium text-muted-foreground border-b pb-2">
                  <button 
                    onClick={() => handleSectorSort('symbol')}
                    className="text-left hover:text-foreground transition-colors flex items-center gap-1"
                  >
                    Sector Name {sectorSortColumn === 'symbol' && (sectorSortDirection === 'asc' ? '↑' : '↓')}
                  </button>
                  <button 
                    onClick={() => handleSectorSort('rsRatio')}
                    className="text-left hover:text-foreground transition-colors flex items-center gap-1"
                  >
                    RS-Ratio {sectorSortColumn === 'rsRatio' && (sectorSortDirection === 'asc' ? '↑' : '↓')}
                  </button>
                  <button 
                    onClick={() => handleSectorSort('rsMomentum')}
                    className="text-left hover:text-foreground transition-colors flex items-center gap-1"
                  >
                    RS-Momentum {sectorSortColumn === 'rsMomentum' && (sectorSortDirection === 'asc' ? '↑' : '↓')}
                  </button>
                  <button 
                    onClick={() => handleSectorSort('performance')}
                    className="text-left hover:text-foreground transition-colors flex items-center gap-1"
                  >
                    Performance {sectorSortColumn === 'performance' && (sectorSortDirection === 'asc' ? '↑' : '↓')}
                  </button>
                  <button 
                    onClick={() => handleSectorSort('trend')}
                    className="text-left hover:text-foreground transition-colors flex items-center gap-1"
                  >
                    Trend {sectorSortColumn === 'trend' && (sectorSortDirection === 'asc' ? '↑' : '↓')}
                  </button>
                </div>
                <div className="hidden md:block max-h-80 overflow-y-auto pr-1">
                  <div className="space-y-2">
                    {getSortedAndFilteredSectors().map((item, index) => (
                      <div key={index} className="grid grid-cols-5 gap-2 items-center border-b border-border/50 py-2 text-xs">
                        <div className="font-medium text-card-foreground">{item.symbol}</div>
                        <div className="text-card-foreground">{item.rsRatio.toFixed(1)}</div>
                        <div className="text-card-foreground">{item.rsMomentum.toFixed(1)}</div>
                        <div className={item.performance >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {item.performance >= 0 ? '+' : ''}{item.performance.toFixed(1)}%
                        </div>
                        <div>
                          <Badge variant={getBadgeVariant(item.trend)} className="text-xs">
                            {item.trend}
                          </Badge>
                        </div>
                      </div>
                    ))}
            </div>
          </div>

                {/* Mobile stacked view */}
                <div className="grid gap-3 md:hidden">
                  {getSortedAndFilteredSectors().map((item, index) => (
                    <div key={index} className="rounded-lg border border-border bg-card p-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-card-foreground">{item.symbol}</div>
                        <Badge variant={getBadgeVariant(item.trend)} className="text-[10px] uppercase tracking-wide">
                          {item.trend}
                        </Badge>
        </div>
                      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-muted-foreground">
                        <span>Sektor</span>
                        <span className="text-right text-card-foreground">{item.sector}</span>
                        <span>RS-Ratio</span>
                        <span className="text-right text-card-foreground">{item.rsRatio.toFixed(1)}</span>
                        <span>RS-Momentum</span>
                        <span className="text-right text-card-foreground">{item.rsMomentum.toFixed(1)}</span>
                        <span>Performance</span>
                        <span className={`text-right ${item.performance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {item.performance >= 0 ? '+' : ''}{item.performance.toFixed(1)}%
                        </span>
      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
