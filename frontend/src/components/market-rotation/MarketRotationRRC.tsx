import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { X, Search, Plus } from 'lucide-react';

// Extended RRC data with more months
const fullRrcData = [
  { date: 'Jan', COMPOSITE: 100, LQ45: 98, IDX30: 102, Technology: 98, Healthcare: 102, Finance: 96, Energy: 104, Consumer: 99, Industrial: 101, Materials: 97 },
  { date: 'Feb', COMPOSITE: 102, LQ45: 101, IDX30: 105, Technology: 101, Healthcare: 105, Finance: 94, Energy: 108, Consumer: 100, Industrial: 103, Materials: 95 },
  { date: 'Mar', COMPOSITE: 104, LQ45: 106, IDX30: 108, Technology: 106, Healthcare: 108, Finance: 92, Energy: 112, Consumer: 102, Industrial: 106, Materials: 94 },
  { date: 'Apr', COMPOSITE: 106, LQ45: 110, IDX30: 112, Technology: 110, Healthcare: 112, Finance: 90, Energy: 115, Consumer: 104, Industrial: 108, Materials: 92 },
  { date: 'May', COMPOSITE: 108, LQ45: 115, IDX30: 115, Technology: 115, Healthcare: 115, Finance: 88, Energy: 118, Consumer: 106, Industrial: 111, Materials: 90 },
  { date: 'Jun', COMPOSITE: 110, LQ45: 120, IDX30: 118, Technology: 120, Healthcare: 118, Finance: 86, Energy: 122, Consumer: 108, Industrial: 114, Materials: 88 },
  { date: 'Jul', COMPOSITE: 112, LQ45: 125, IDX30: 120, Technology: 125, Healthcare: 120, Finance: 84, Energy: 125, Consumer: 110, Industrial: 117, Materials: 86 },
  { date: 'Aug', COMPOSITE: 114, LQ45: 130, IDX30: 122, Technology: 130, Healthcare: 122, Finance: 82, Energy: 128, Consumer: 112, Industrial: 120, Materials: 84 },
  { date: 'Sep', COMPOSITE: 116, LQ45: 135, IDX30: 125, Technology: 135, Healthcare: 125, Finance: 80, Energy: 131, Consumer: 114, Industrial: 123, Materials: 82 },
  { date: 'Oct', COMPOSITE: 118, LQ45: 140, IDX30: 128, Technology: 140, Healthcare: 128, Finance: 78, Energy: 134, Consumer: 116, Industrial: 126, Materials: 80 },
  { date: 'Nov', COMPOSITE: 120, LQ45: 145, IDX30: 130, Technology: 145, Healthcare: 130, Finance: 76, Energy: 137, Consumer: 118, Industrial: 129, Materials: 78 },
  { date: 'Dec', COMPOSITE: 122, LQ45: 150, IDX30: 132, Technology: 150, Healthcare: 132, Finance: 74, Energy: 140, Consumer: 120, Industrial: 132, Materials: 76 },
];

const stockRrcData = [
  { date: 'Jan', COMPOSITE: 100, LQ45: 98, IDX30: 102, BBRI: 98, BBCA: 102, BMRI: 96, TLKM: 104, ASII: 99, UNVR: 101 },
  { date: 'Feb', COMPOSITE: 102, LQ45: 101, IDX30: 105, BBRI: 101, BBCA: 105, BMRI: 94, TLKM: 108, ASII: 100, UNVR: 103 },
  { date: 'Mar', COMPOSITE: 104, LQ45: 106, IDX30: 108, BBRI: 106, BBCA: 108, BMRI: 92, TLKM: 112, ASII: 102, UNVR: 106 },
  { date: 'Apr', COMPOSITE: 106, LQ45: 110, IDX30: 112, BBRI: 110, BBCA: 112, BMRI: 90, TLKM: 115, ASII: 104, UNVR: 108 },
  { date: 'May', COMPOSITE: 108, LQ45: 115, IDX30: 115, BBRI: 115, BBCA: 115, BMRI: 88, TLKM: 118, ASII: 106, UNVR: 111 },
  { date: 'Jun', COMPOSITE: 110, LQ45: 120, IDX30: 118, BBRI: 120, BBCA: 118, BMRI: 86, TLKM: 122, ASII: 108, UNVR: 114 },
];

const indexOptions = [
  { name: 'COMPOSITE', color: '#6B7280' }, // Gray color for better visibility in both dark and light mode
  { name: 'LQ45', color: '#374151' },
  { name: 'IDX30', color: '#4B5563' },
  { name: 'IDX80', color: '#6B7280' },
  { name: 'IDXQ30', color: '#9CA3AF' },
];

const sectorOptions = [
  { name: 'Technology', color: '#3B82F6' },
  { name: 'Healthcare', color: '#10B981' },
  { name: 'Finance', color: '#EF4444' },
  { name: 'Energy', color: '#F59E0B' },
  { name: 'Consumer', color: '#8B5CF6' },
  { name: 'Industrial', color: '#06B6D4' },
  { name: 'Materials', color: '#84CC16' },
];

const stockOptions = [
  { name: 'BBRI', color: '#3B82F6' },
  { name: 'BBCA', color: '#10B981' },
  { name: 'BMRI', color: '#EF4444' },
  { name: 'TLKM', color: '#F59E0B' },
  { name: 'ASII', color: '#8B5CF6' },
  { name: 'UNVR', color: '#06B6D4' },
  { name: 'GGRM', color: '#84CC16' },
  { name: 'ICBP', color: '#EC4899' },
  { name: 'INTP', color: '#F97316' },
  { name: 'KLBF', color: '#6366F1' },
  { name: 'SMGR', color: '#14B8A6' },
  { name: 'PGAS', color: '#DC2626' },
  { name: 'JSMR', color: '#7C3AED' },
  { name: 'EXCL', color: '#059669' },
  { name: 'INDF', color: '#DB2777' },
  { name: 'ANTM', color: '#D97706' },
  { name: 'INCO', color: '#2563EB' },
  { name: 'ITMG', color: '#DC2626' },
  { name: 'PTBA', color: '#16A34A' },
  { name: 'GOTO', color: '#9333EA' },
];

// Helper function to format date for input
const formatDateForInput = (date: Date) => {
  return date.toISOString().split('T')[0];
};

// Helper function to get date from input
const getDateFromInput = (dateString: string) => {
  return new Date(dateString + 'T00:00:00');
};

export function MarketRotationRRC() {
  const [viewMode, setViewMode] = useState<'sector' | 'stock'>('sector');
  const [selectedIndex, setSelectedIndex] = useState<string>('COMPOSITE');
  const [selectedItems, setSelectedItems] = useState<string[]>(['Technology', 'Healthcare', 'Finance']);
  const [searchQuery, setSearchQuery] = useState('');
  const [indexSearchQuery, setIndexSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [showIndexSearchDropdown, setShowIndexSearchDropdown] = useState(false);
  // Calculate default start date (3 months ago)
  const getDefaultStartDate = () => {
    const today = new Date();
    const threeMonthsAgo = new Date(today);
    threeMonthsAgo.setMonth(today.getMonth() - 3);
    return threeMonthsAgo;
  };

  const [startDate, setStartDate] = useState<Date>(getDefaultStartDate());
  const [endDate, setEndDate] = useState<Date>(new Date());
  const searchRef = useRef<HTMLDivElement>(null);
  const indexSearchRef = useRef<HTMLDivElement>(null);

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

  // Filter data based on start date and end date
  const getFilteredData = () => {
    const fullData = viewMode === 'sector' ? fullRrcData : stockRrcData;
    
    // Since we're using sample data with month names, we'll calculate how many months to show
    const monthsDiff = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30));
    const monthsToShow = Math.max(1, Math.min(12, monthsDiff + 1)); // At least 1 month, max 12 months
    
    return fullData.slice(-monthsToShow);
  };

  const currentData = getFilteredData();
  const currentOptions = viewMode === 'sector' ? sectorOptions : stockOptions;

  const toggleItem = (itemName: string) => {
    setSelectedItems(prev => 
      prev.includes(itemName) 
        ? prev.filter(item => item !== itemName)
        : [...prev, itemName]
    );
  };

  const removeItem = (itemName: string) => {
    // Prevent removing all items - keep at least one
    setSelectedItems(prev => {
      const newItems = prev.filter(item => item !== itemName);
      return newItems.length > 0 ? newItems : prev;
    });
  };

  const handleViewModeChange = (mode: 'sector' | 'stock') => {
    setViewMode(mode);
    setSearchQuery('');
    setIndexSearchQuery('');
    setShowSearchDropdown(false);
    setShowIndexSearchDropdown(false);
    if (mode === 'sector') {
      setSelectedItems(['Technology', 'Healthcare', 'Finance']);
    } else {
      setSelectedItems(['BBRI', 'BBCA', 'BMRI']);
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
    setStartDate(newDate);
  };

  const handleEndDateChange = (dateString: string) => {
    const newDate = getDateFromInput(dateString);
    setEndDate(newDate);
  };

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
          <div className="flex-shrink-0">
            <label className="block text-sm font-medium mb-2">Start Date:</label>
            <input
              type="date"
              value={formatDateForInput(startDate)}
              onChange={(e) => handleStartDateChange(e.target.value)}
              max={formatDateForInput(endDate)}
              className="flex h-8 w-40 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {/* End Date Selector */}
          <div className="flex-shrink-0">
            <label className="block text-sm font-medium mb-2">End Date:</label>
            <input
              type="date"
              value={formatDateForInput(endDate)}
              onChange={(e) => handleEndDateChange(e.target.value)}
              min={formatDateForInput(startDate)}
              max={formatDateForInput(new Date())}
              className="flex h-8 w-40 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* RRC Chart */}
        <div className="xl:col-span-3">
          <Card className="h-full flex flex-col">
            <CardHeader>
              <CardTitle>{viewMode === 'sector' ? 'Sector' : 'Stock'} Activity vs {selectedIndex}</CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
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
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
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
                    <Badge variant="secondary" className="text-xs"></Badge>
                  </div>
                </div>
              </div>

              {/* Selected Items */}
              {selectedItems.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium">Selected Stock ({selectedItems.length})</h4>
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
                            {stockOptions.filter(s => !selectedItems.includes(s.name)).length === 0 
                              ? 'All stocks already selected' 
                              : 'No stocks found'
                            }
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Available Options */}
              <div>
                <h4 className="text-sm font-medium mb-2">Available {viewMode === 'sector' ? 'Sectors' : 'Stocks'}</h4>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {currentOptions
                    .filter(option => !selectedItems.includes(option.name))
                    .slice(0, viewMode === 'stock' ? 6 : undefined) // Show only first 6 stocks
                    .map((option) => (
                    <button
                      key={option.name}
                      onClick={() => toggleItem(option.name)}
                      className="flex items-center gap-2 w-full p-2 text-left hover:bg-accent rounded-md transition-colors"
                    >
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: option.color }}
                      ></div>
                      <span className="text-sm">{option.name}</span>
                    </button>
                  ))}
                  {viewMode === 'stock' && currentOptions.filter(option => !selectedItems.includes(option.name)).length > 6 && (
                    <div className="text-xs text-muted-foreground p-2 border-t border-border">
                      + {currentOptions.filter(option => !selectedItems.includes(option.name)).length - 6} more stocks available via search
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}