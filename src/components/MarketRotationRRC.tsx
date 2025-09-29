import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { X, Search, Plus } from 'lucide-react';

// Sample RRC data
const rrcData = [
  { date: 'Jan', IHSG: 100, Technology: 98, Healthcare: 102, Finance: 96, Energy: 104, Consumer: 99, Industrial: 101, Materials: 97 },
  { date: 'Feb', IHSG: 102, Technology: 101, Healthcare: 105, Finance: 94, Energy: 108, Consumer: 100, Industrial: 103, Materials: 95 },
  { date: 'Mar', IHSG: 104, Technology: 106, Healthcare: 108, Finance: 92, Energy: 112, Consumer: 102, Industrial: 106, Materials: 94 },
  { date: 'Apr', IHSG: 106, Technology: 110, Healthcare: 112, Finance: 90, Energy: 115, Consumer: 104, Industrial: 108, Materials: 92 },
  { date: 'May', IHSG: 108, Technology: 115, Healthcare: 115, Finance: 88, Energy: 118, Consumer: 106, Industrial: 111, Materials: 90 },
  { date: 'Jun', IHSG: 110, Technology: 120, Healthcare: 118, Finance: 86, Energy: 122, Consumer: 108, Industrial: 114, Materials: 88 },
];

const stockRrcData = [
  { date: 'Jan', IHSG: 100, BBRI: 98, BBCA: 102, BMRI: 96, TLKM: 104, ASII: 99, UNVR: 101 },
  { date: 'Feb', IHSG: 102, BBRI: 101, BBCA: 105, BMRI: 94, TLKM: 108, ASII: 100, UNVR: 103 },
  { date: 'Mar', IHSG: 104, BBRI: 106, BBCA: 108, BMRI: 92, TLKM: 112, ASII: 102, UNVR: 106 },
  { date: 'Apr', IHSG: 106, BBRI: 110, BBCA: 112, BMRI: 90, TLKM: 115, ASII: 104, UNVR: 108 },
  { date: 'May', IHSG: 108, BBRI: 115, BBCA: 115, BMRI: 88, TLKM: 118, ASII: 106, UNVR: 111 },
  { date: 'Jun', IHSG: 110, BBRI: 120, BBCA: 118, BMRI: 86, TLKM: 122, ASII: 108, UNVR: 114 },
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

export function MarketRotationRRC() {
  const [viewMode, setViewMode] = useState<'sector' | 'stock'>('sector');
  const [selectedItems, setSelectedItems] = useState<string[]>(['Technology', 'Healthcare', 'Finance']);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const currentData = viewMode === 'sector' ? rrcData : stockRrcData;
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
    setShowSearchDropdown(false);
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

  const addFromSearch = (itemName: string) => {
    if (!selectedItems.includes(itemName)) {
      setSelectedItems(prev => [...prev, itemName]);
    }
    setSearchQuery('');
    setShowSearchDropdown(false);
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium">View Mode:</span>
        <div className="flex gap-2">
          <Button
            variant={viewMode === 'sector' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleViewModeChange('sector')}
          >
            Sector
          </Button>
          <Button
            variant={viewMode === 'stock' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleViewModeChange('stock')}
          >
            Saham
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* RRC Chart */}
        <div className="xl:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>Sector Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
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
                  
                  {/* IHSG line - always visible and locked */}
                  <Line 
                    type="monotone" 
                    dataKey="IHSG" 
                    stroke="#000000"
                    strokeWidth={3}
                    strokeDasharray="5 5"
                    name="IHSG (Locked)"
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
          <Card>
            <CardHeader>
              <CardTitle>Selection Panel</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* IHSG - Locked */}
              <div>
                <div className="flex items-center justify-between p-2 bg-muted rounded-md">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-black rounded-full"></div>
                    <span className="text-sm font-medium">IHSG</span>
                  </div>
                  <Badge variant="secondary" className="text-xs">Locked</Badge>
                </div>
              </div>

              {/* Selected Items */}
              {selectedItems.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium">Selected ({selectedItems.length})</h4>
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
                        className="w-full pl-7 pr-3 py-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20"
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