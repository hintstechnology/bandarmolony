import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ComposedChart, Line } from 'recharts';
import { X, Search, Plus, Loader2, Play, RotateCcw } from 'lucide-react';
import { api } from '@/services/api';
import { useToast } from '../../contexts/ToastContext';

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
  
  const [searchQuery, setSearchQuery] = useState('');
  const [indexSearchQuery, setIndexSearchQuery] = useState('');
  const [screenerSearchQuery, setScreenerSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [showIndexSearchDropdown, setShowIndexSearchDropdown] = useState(false);
  const [showScreenerSearchDropdown, setShowScreenerSearchDropdown] = useState(false);
  
  const [trajectoryData, setTrajectoryData] = useState<TrajectoryPoint[]>([]);
  const [indexOptions, setIndexOptions] = useState<{name: string, color: string}[]>([]);
  const [sectorOptions, setSectorOptions] = useState<{name: string, color: string}[]>([]);
  const [stockOptions, setStockOptions] = useState<{name: string, color: string}[]>([]);
  const [screenerStocks, setScreenerStocks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<any>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const indexSearchRef = useRef<HTMLDivElement>(null);
  const screenerSearchRef = useRef<HTMLDivElement>(null);
  const isInitialMount = useRef(true);
  const isLoadingRef = useRef(false);

  // Load available inputs on mount
  useEffect(() => {
    loadInputs();
  }, []);

  const loadInputs = async () => {
    try {
      console.log('🔄 Frontend: Loading RRG inputs...');
      const result = await api.listRRGInputs();
      
      if (result.success && result.data) {
        console.log('✅ Frontend: RRG inputs loaded:', result.data);
        
        const generateIndexColors = (indexes: string[]) => {
          const indexColors = ['#000000', '#374151', '#4B5563', '#6B7280', '#9CA3AF'];
          return indexes.map((item, index) => ({
            name: item,
            color: indexColors[index % indexColors.length] || '#000000'
          }));
        };
        
        const generateSectorStockColors = (items: string[]) => {
          const sectorStockColors = ['#3B82F6', '#10B981', '#EF4444', '#F59E0B', '#8B5CF6', '#06B6D4', '#84CC16', '#EC4899', '#F97316'];
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

  // Click outside handlers
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false);
      }
      if (indexSearchRef.current && !indexSearchRef.current.contains(event.target as Node)) {
        setShowIndexSearchDropdown(false);
      }
      if (screenerSearchRef.current && !screenerSearchRef.current.contains(event.target as Node)) {
        setShowScreenerSearchDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
        ? await api.getRRGData('stock', items, index) 
        : await api.getRRGData('sector', items, index);
      
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

  const getFilteredOptions = () => {
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

  const getFilteredScreenerOptions = useMemo(() => {
    return stockOptions.filter(option => 
      option.name.toLowerCase().includes(screenerSearchQuery.toLowerCase()) &&
      !screenerStocks.some(stock => stock.symbol === option.name)
    );
  }, [screenerSearchQuery, screenerStocks, stockOptions]);



  const handleGenerateData = () => {
    if (selectedIndex && selectedItems.length > 0) {
      loadChartData();
    }
  };

  const handleReset = () => {
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
      const newStock = {
        symbol: stockName,
        sector: 'Unknown',
        rsRatio: Math.random() * 20 + 90,
        rsMomentum: Math.random() * 20 + 90,
        performance: (Math.random() - 0.5) * 10,
        volume: ['HIGH', 'MEDIUM', 'LOW'][Math.floor(Math.random() * 3)] || 'MEDIUM',
        trend: ['STRONG', 'IMPROVING', 'WEAKENING', 'WEAK'][Math.floor(Math.random() * 4)] || 'IMPROVING'
      };
      setScreenerStocks(prev => [...prev, newStock]);
    }
    setScreenerSearchQuery('');
    setShowScreenerSearchDropdown(false);
  }, [screenerStocks, stockOptions]);

  const removeFromScreener = useCallback((symbol: string) => {
    setScreenerStocks(prev => prev.filter(stock => stock.symbol !== symbol));
  }, []);

  const getBadgeVariant = useCallback((trend: string) => {
    switch (trend) {
      case 'STRONG': return 'default';
      case 'IMPROVING': return 'secondary';
      case 'WEAKENING': return 'outline';
      case 'WEAK': return 'destructive';
      default: return 'secondary';
    }
  }, []);

  const filteredTrajectoryData = trajectoryData.filter(point => selectedItems.includes(point.name));

  return (
    <div className="space-y-6">
      {/* Control Panel */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* View Mode */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">View Mode:</label>
              <div className="flex rounded-lg border border-border overflow-hidden">
          <Button
                  variant={viewMode === 'sector' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => handleViewModeChange('sector')}
                  className="rounded-none rounded-l-lg"
          >
            Sector
          </Button>
          <Button
                  variant={viewMode === 'stock' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => handleViewModeChange('stock')}
                  className="rounded-none rounded-r-lg"
          >
            Stock
          </Button>
        </div>
      </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <Button
                onClick={handleGenerateData}
                disabled={!hasValidSelection() || isLoading}
                className="h-10"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Go
                  </>
                )}
              </Button>
              <Button
                onClick={handleReset}
                variant="outline"
                className="h-10"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* RRG Chart */}
        <div className="xl:col-span-3">
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
              ) : trajectoryData.length === 0 && !isLoading && !isGenerating ? (
                <div className="flex items-center justify-center h-96">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground mb-2">No data available</p>
                    <p className="text-xs text-muted-foreground mb-3">Data mungkin sedang diproses atau belum tersedia</p>
                    <Button variant="outline" size="sm" onClick={() => loadChartData()}>Reload Data</Button>
                  </div>
                </div>
              ) : trajectoryData.length > 0 ? (
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
        <div className="xl:col-span-1">
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
                      }}
                      onFocus={() => setShowIndexSearchDropdown(true)}
                      className="w-full pl-7 pr-3 py-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 hover:border-primary/50 transition-colors"
                    />
                  </div>
                  
                  {/* Combined Index Search and Select Dropdown */}
                  {showIndexSearchDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-md shadow-lg z-10 max-h-60 overflow-y-auto">
                      {indexOptions.length === 0 ? (
                        <div className="p-3 text-sm text-muted-foreground">Loading indexes...</div>
                      ) : (
                        <>
                          {/* Show filtered results if searching, otherwise show all available */}
                          {(indexSearchQuery ? getFilteredIndexOptions() : indexOptions.filter(option => !selectedIndexes.includes(option.name)))
                            .slice(0, 10)
                            .map((option) => (
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
                              }}
                              className="flex items-center justify-between w-full px-3 py-2 text-left hover:bg-accent transition-colors"
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
                        }}
                        onFocus={() => setShowSearchDropdown(true)}
                        className="w-full pl-7 pr-3 py-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 hover:border-primary/50 transition-colors"
                      />
                    </div>
                    
                  {/* Combined Search and Select Dropdown */}
                  {showSearchDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-md shadow-lg z-10 max-h-60 overflow-y-auto">
                      {currentOptions.length === 0 ? (
                        <div className="p-3 text-sm text-muted-foreground">Loading options...</div>
                      ) : (
                        <>
                          {/* Show filtered results if searching, otherwise show all available */}
                          {(searchQuery ? getFilteredOptions() : currentOptions.filter(option => !selectedItems.includes(option.name)))
                            .slice(0, viewMode === 'stock' ? 15 : undefined)
                            .map((option) => (
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
                              }}
                              className="flex items-center justify-between w-full px-3 py-2 text-left hover:bg-accent transition-colors"
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
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dashboard Momentum Screener */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Relative Momentum Screener</CardTitle>
            <div className="relative" ref={screenerSearchRef}>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Add stock to screener..."
                  value={screenerSearchQuery}
                  onChange={(e) => {
                    setScreenerSearchQuery(e.target.value);
                    setShowScreenerSearchDropdown(true);
                  }}
                  onFocus={() => setShowScreenerSearchDropdown(true)}
                  className="w-full pl-8 pr-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 hover:border-primary/50 transition-colors sm:w-56"
                />
              </div>
              
              {/* Screener Search Dropdown */}
              {showScreenerSearchDropdown && screenerSearchQuery && (
                <div className="absolute top-full right-0 mt-1 bg-card border border-border rounded-md shadow-lg z-10 max-h-48 overflow-y-auto min-w-48">
                  {getFilteredScreenerOptions.map((option: any) => (
                    <button
                      key={option.name}
                      onClick={() => addToScreener(option.name)}
                      className="flex items-center justify-between w-full p-2 text-left hover:bg-accent transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: option.color }}></div>
                        <span className="text-sm">{option.name}</span>
                      </div>
                      <Plus className="w-3 h-3 text-muted-foreground" />
                    </button>
                  ))}
                  {getFilteredScreenerOptions.length === 0 && (
                    <div className="p-2 text-sm text-muted-foreground">
                      {stockOptions.filter(s => !screenerStocks.some(stock => stock.symbol === s.name)).length === 0 
                        ? 'All stocks already in screener' 
                        : 'No stocks found'
                      }
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {screenerStocks.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No stocks in screener. Search and add stocks above.
              </div>
            ) : (
              <>
                {/* Desktop/Table view */}
                <div className="hidden md:grid grid-cols-7 gap-2 text-xs font-medium text-muted-foreground border-b pb-2">
              <div>Symbol</div>
              <div>Sector</div>
              <div>RS-Ratio</div>
              <div>RS-Momentum</div>
              <div>Performance</div>
              <div>Trend</div>
              <div>Action</div>
            </div>
                <div className="hidden md:block max-h-80 overflow-y-auto pr-1">
                  <div className="space-y-2">
              {screenerStocks.map((item, index) => (
                      <div key={index} className="grid grid-cols-7 gap-2 items-center border-b border-border/50 py-2 text-xs">
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
                        <div className="flex justify-end">
                    <button
                      onClick={() => removeFromScreener(item.symbol)}
                            className="flex h-6 w-6 items-center justify-center rounded-md p-0 transition-colors hover:bg-muted/50 hover:shadow-sm opacity-60 hover:opacity-100"
                      title={`Remove ${item.symbol} from screener`}
                    >
                      <X className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

                {/* Mobile stacked view */}
                <div className="grid gap-3 md:hidden">
                  {screenerStocks.map((item, index) => (
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
                      <div className="mt-3 flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-muted-foreground hover:text-destructive"
                          onClick={() => removeFromScreener(item.symbol)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
