// SeasonalityAnalysis.tsx
// Component for displaying seasonality analysis

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Loader2, Plus, Search, Calendar, BarChart3, TrendingUp, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '../services/api';

interface SeasonalityData {
  ticker?: string;
  sector?: string;
  name?: string;
  monthly_returns: { [month: string]: number };
  best_month?: {
    month: string;
    return: number;
  };
  worst_month?: {
    month: string;
    return: number;
  };
  volatility: number;
  stock_count?: number;
  composition?: string[];
}

interface SeasonalityResults {
  metadata: {
    generated_at: string;
    total_indexes?: number;
    total_sectors?: number;
    total_stocks?: number;
    analysis_type: string;
    description: string;
  };
  indexes?: SeasonalityData[];
  sectors?: SeasonalityData[];
  stocks?: SeasonalityData[];
}

interface AvailableOptions {
  name: string;
  type: 'index' | 'sector' | 'stock';
  sector?: string;
}

const SeasonalityAnalysis: React.FC = () => {
  const [viewMode, setViewMode] = useState<'index' | 'sector' | 'stock'>('index');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [availableOptions, setAvailableOptions] = useState<AvailableOptions[]>([]);
  const [currentData, setCurrentData] = useState<SeasonalityData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const isLoadingRef = useRef(false);
  const isInitialMount = useRef(true);

  // Set default date range (last 10 days)
  useEffect(() => {
    const today = new Date();
    const tenDaysAgo = new Date(today);
    tenDaysAgo.setDate(today.getDate() - 10);
    
    setEndDate(today.toISOString().split('T')[0]);
    setStartDate(tenDaysAgo.toISOString().split('T')[0]);
  }, []);

  // Load inputs on component mount and when view mode changes
  useEffect(() => {
    loadInputs();
  }, [viewMode]);

  // Load chart data when selected items or dates change
  useEffect(() => {
    if (selectedItems.length > 0) {
      loadChartData();
    }
  }, [selectedItems, startDate, endDate]);

  const loadInputs = async () => {
    try {
      setIsLoading(true);
      const response = await api.getSeasonalityInputs();
      
      if (response) {
        const allOptions: AvailableOptions[] = [
          ...response.indexes.map((item: any) => ({ ...item, type: 'index' as const })),
          ...response.sectors.map((item: any) => ({ ...item, type: 'sector' as const })),
          ...response.stocks.map((item: any) => ({ ...item, type: 'stock' as const }))
        ];
        
        setAvailableOptions(allOptions);
        
        // Set default selections based on view mode
        let defaultItems: string[] = [];
        if (viewMode === 'index') {
          defaultItems = ['COMPOSITE'];
        } else if (viewMode === 'sector') {
          defaultItems = ['Financials', 'Technology'];
        } else if (viewMode === 'stock') {
          defaultItems = ['BBCA', 'BBRI', 'BMRI'];
        }
        
        // Filter available items
        const availableItems = allOptions
          .filter(option => option.type === viewMode)
          .map(option => option.name);
        
        const validDefaultItems = defaultItems.filter(item => 
          availableItems.includes(item)
        );
        
        setSelectedItems(validDefaultItems);
        
        // Load chart data immediately with default selections
        if (validDefaultItems.length > 0) {
          loadChartDataWithParams(validDefaultItems);
        }
      }
    } catch (error) {
      console.error('❌ Error loading inputs:', error);
      toast.error('Failed to load available options');
    } finally {
      setIsLoading(false);
    }
  };

  const loadChartData = async () => {
    if (selectedItems.length === 0) return;
    await loadChartDataWithParams(selectedItems);
  };

  const loadChartDataWithParams = async (items: string[]) => {
    if (isLoadingRef.current) return;
    
    try {
      isLoadingRef.current = true;
      setIsLoading(true);
      
      const response = await api.getSeasonalityData({
        type: viewMode,
        items: items,
        startDate,
        endDate
      });
      
      if (response) {
        let data: SeasonalityData[] = [];
        if (viewMode === 'index' && response.indexes) {
          data = response.indexes;
        } else if (viewMode === 'sector' && response.sectors) {
          data = response.sectors;
        } else if (viewMode === 'stock' && response.stocks) {
          data = response.stocks;
        }
        
        setCurrentData(data);
      }
    } catch (error) {
      console.error('❌ Error loading chart data:', error);
      toast.error('Failed to load seasonality data');
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  };

  const handleViewModeChange = (mode: 'index' | 'sector' | 'stock') => {
    setViewMode(mode);
    setSelectedItems([]);
    setCurrentData([]);
  };

  const toggleItem = (itemName: string) => {
    setSelectedItems(prev => {
      if (prev.includes(itemName)) {
        return prev.filter(item => item !== itemName);
      } else {
        if (prev.length >= 15) {
          toast.error('Maximum 15 selections allowed');
          return prev;
        }
        return [...prev, itemName];
      }
    });
  };

  const addFromSearch = (itemName: string) => {
    if (selectedItems.length >= 15) {
      toast.error('Maximum 15 selections allowed');
      return;
    }
    
    if (!selectedItems.includes(itemName)) {
      setSelectedItems(prev => [...prev, itemName]);
    }
    setShowSearchDropdown(false);
  };

  const handleTriggerGeneration = async (feature: 'seasonal' | 'all') => {
    try {
      setIsGenerating(true);
      await api.triggerGeneration(feature);
      toast.success('Seasonality generation started');
    } catch (error) {
      console.error('❌ Error triggering generation:', error);
      toast.error('Failed to start generation');
    } finally {
      setIsGenerating(false);
    }
  };

  const formatDateForInput = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  const handleStartDateChange = (value: string) => {
    const start = new Date(value);
    const end = new Date(endDate);
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    if (start < oneYearAgo) {
      toast.error('Date range cannot exceed 1 year');
      return;
    }
    
    if (start > end) {
      toast.error('Start date cannot be after end date');
      return;
    }
    
    setStartDate(value);
  };

  const handleEndDateChange = (value: string) => {
    const start = new Date(startDate);
    const end = new Date(value);
    const today = new Date();
    
    if (end > today) {
      toast.error('End date cannot be in the future');
      return;
    }
    
    if (end < start) {
      toast.error('End date cannot be before start date');
      return;
    }
    
    setEndDate(value);
  };

  const currentOptions = availableOptions.filter(option => 
    option.type === viewMode && 
    option.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Seasonality Analysis</h1>
          <p className="text-muted-foreground">Monthly seasonality patterns for indexes, sectors, and stocks</p>
        </div>
        
        {/* Trigger Buttons */}
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => handleTriggerGeneration('seasonal')} 
            disabled={isGenerating}
            title="Trigger Seasonality Only"
          >
            {isGenerating ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : '📊'} Seasonal
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => handleTriggerGeneration('all')} 
            disabled={isGenerating}
            title="Trigger All Features"
          >
            {isGenerating ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : '🔄'} All
          </Button>
        </div>
      </div>

      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Analysis Controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* View Mode Toggle */}
          <div className="flex gap-2">
            {(['index', 'sector', 'stock'] as const).map((mode) => (
              <Button
                key={mode}
                variant={viewMode === mode ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleViewModeChange(mode)}
                className="capitalize"
              >
                {mode}s
              </Button>
            ))}
          </div>

          {/* Date Range */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 relative z-50">
              <label className="block text-sm font-medium mb-2">Start Date:</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
                max={endDate}
                className="flex h-8 w-40 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 relative z-50"
              />
            </div>
            <div className="flex-shrink-0 relative z-50">
              <label className="block text-sm font-medium mb-2">End Date:</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => handleEndDateChange(e.target.value)}
                max={formatDateForInput(new Date())}
                className="flex h-8 w-40 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 relative z-50"
              />
            </div>
          </div>

          {/* Selected Items */}
          <div>
            <label className="text-sm font-medium mb-2 block">Selected {viewMode === 'sector' ? 'Sectors' : viewMode === 'stock' ? 'Stocks' : 'Indexes'}</label>
            <div className="flex flex-wrap gap-2">
              {selectedItems.map((item) => (
                <Badge
                  key={item}
                  variant="secondary"
                  className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => toggleItem(item)}
                >
                  {item} ×
                </Badge>
              ))}
            </div>
          </div>

          {/* Search and Add */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <input
                  type="text"
                  placeholder={`Search ${viewMode}s...`}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 w-full border rounded-md"
                />
              </div>
            </div>

            {/* Available Options - Dropdown */}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSearchDropdown(!showSearchDropdown)}
                className="w-full justify-between"
              >
                <span>Select {viewMode === 'sector' ? 'Sector' : viewMode === 'stock' ? 'Stock' : 'Index'} to Add</span>
                <Plus className="h-4 w-4" />
              </Button>
              
              {showSearchDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-card border rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
                  {currentOptions.length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground">No options available</div>
                  ) : (
                    <>
                      {currentOptions.filter(option => !selectedItems.includes(option.name)).slice(0, 20).map((option) => (
                        <button 
                          key={option.name} 
                          onClick={() => addFromSearch(option.name)} 
                          disabled={selectedItems.includes(option.name)} 
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {option.name}
                          {option.sector && <span className="text-xs text-muted-foreground">({option.sector})</span>}
                        </button>
                      ))}
                      {currentOptions.filter(option => !selectedItems.includes(option.name)).length > 20 && (
                        <div className="px-3 py-2 text-xs text-muted-foreground border-t">
                          +{currentOptions.filter(option => !selectedItems.includes(option.name)).length - 20} more {viewMode}s (use search above)
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

      {/* Results */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Seasonality Analysis Results
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              <span>Loading seasonality data...</span>
            </div>
          ) : currentData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No data available. Please select some {viewMode}s to analyze.
            </div>
          ) : (
            <div className="space-y-4">
              {currentData.map((item, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-lg">
                        {item.ticker || item.sector || item.name}
                      </h3>
                      {item.sector && <p className="text-sm text-muted-foreground">Sector: {item.sector}</p>}
                      {item.stock_count && <p className="text-sm text-muted-foreground">Stocks: {item.stock_count}</p>}
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-muted-foreground">Volatility</div>
                      <div className="font-semibold">{item.volatility.toFixed(2)}%</div>
                    </div>
                  </div>

                  {/* Monthly Returns Chart */}
                  <div className="space-y-2">
                    <h4 className="font-medium">Monthly Returns (%)</h4>
                    <div className="grid grid-cols-12 gap-2">
                      {months.map((month) => {
                        const returnValue = item.monthly_returns[month] || 0;
                        const isPositive = returnValue > 0;
                        const isBest = item.best_month?.month === month;
                        const isWorst = item.worst_month?.month === month;
                        
                        return (
                          <div key={month} className="text-center">
                            <div className="text-xs text-muted-foreground mb-1">{month}</div>
                            <div 
                              className={`p-2 rounded text-sm font-medium ${
                                isBest ? 'bg-green-100 text-green-800 border-2 border-green-500' :
                                isWorst ? 'bg-red-100 text-red-800 border-2 border-red-500' :
                                isPositive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                              }`}
                            >
                              {returnValue.toFixed(1)}%
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Best/Worst Months */}
                  <div className="flex gap-4 mt-4 text-sm">
                    {item.best_month && (
                      <div className="flex items-center gap-1 text-green-600">
                        <TrendingUp className="w-4 h-4" />
                        <span>Best: {item.best_month.month} ({item.best_month.return.toFixed(2)}%)</span>
                      </div>
                    )}
                    {item.worst_month && (
                      <div className="flex items-center gap-1 text-red-600">
                        <TrendingDown className="w-4 h-4" />
                        <span>Worst: {item.worst_month.month} ({item.worst_month.return.toFixed(2)}%)</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SeasonalityAnalysis;

