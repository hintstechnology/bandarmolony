import React, { useState } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';

interface AccumulationData {
  symbol: string;
  price: number;
  suspend: boolean;
  specialNotice: string;
  dates: { [key: string]: number | null };
}

// Mock data berdasarkan ilustrasi
const generateMockData = (): AccumulationData[] => {
  const symbols = [
    'BBCA', 'BBNI', 'BBRI', 'BMRI', 'BRIS', 'BTPS', 'ACES', 'ADRO', 'AKRA',
    'AMRT', 'ANTM', 'ASII', 'BALI', 'BBKP', 'BBTN', 'BCAP', 'BDMN', 'BFIN',
    'BJTM', 'BMTR', 'BNGA', 'BRMS', 'BSDE', 'BTPN', 'BUKA', 'CTRA', 'DMAS',
    'ERAA', 'ESSA', 'EXCL', 'GGRM', 'GOTO', 'HRUM', 'ICBP', 'IHSG', 'IMAS',
    'INCO', 'INDF', 'INTP', 'ITMG', 'JPFA', 'JSMR', 'KLBF', 'LPKR', 'LPPF',
    'MAPI', 'MDKA', 'MEDC', 'MIKA', 'MNCN', 'MPPA', 'MYOR', 'NIRO', 'PGAS',
    'PGJO', 'PTBA', 'PTPP', 'PWON', 'RAJA', 'SCMA', 'SIDO', 'SMGR', 'SRTG',
    'TBIG', 'TKIM', 'TLKM', 'TOBA', 'TOWR', 'UNTR', 'UNVR', 'WIKA', 'WSKT'
  ];

  // Columns dengan penamaan D0, D-1, D-2, dst dan W-1, W-2 dst
  const dateColumns = [
    'D-0', 'D-1', 'D-2', 'D-3', 'D-4', 'D-5', 'D-6', 'D-7', 'D-8', 'D-9',
    'W-1', 'W-2', 'W-3', 'W-4'
  ];

  const specialNotices = ['', 'Split', 'Dividend', 'Rights', 'Bonus', 'Suspend'];

  return symbols.map(symbol => {
    const data: { [key: string]: number | null } = {};
    dateColumns.forEach(dateCol => {
      // Generate random accumulation/distribution values
      const rand = Math.random();
      if (rand > 0.7) {
        data[dateCol] = Math.floor(Math.random() * 100) + 50; // Strong accumulation
      } else if (rand > 0.4) {
        data[dateCol] = Math.floor(Math.random() * 50); // Weak accumulation/neutral
      } else if (rand > 0.1) {
        data[dateCol] = -Math.floor(Math.random() * 50); // Weak distribution
      } else {
        data[dateCol] = -Math.floor(Math.random() * 100) - 50; // Strong distribution
      }
    });
    
    return { 
      symbol, 
      price: Math.floor(Math.random() * 10000) + 1000, // Random price between 1000-11000
      suspend: Math.random() > 0.9, // 10% chance of suspension
      specialNotice: specialNotices[Math.floor(Math.random() * specialNotices.length)],
      dates: data 
    };
  });
};

const getValueColor = (value: number | null): string => {
  if (value === null) return 'bg-muted';
  if (value >= 50) return 'bg-red-200 dark:bg-red-900/30'; // Strong accumulation
  if (value >= 20) return 'bg-orange-200 dark:bg-orange-900/30'; // Medium accumulation
  if (value >= 0) return 'bg-yellow-200 dark:bg-yellow-900/30'; // Weak accumulation
  if (value >= -20) return 'bg-blue-200 dark:bg-blue-900/30'; // Weak distribution
  if (value >= -50) return 'bg-indigo-200 dark:bg-indigo-900/30'; // Medium distribution
  return 'bg-purple-200 dark:bg-purple-900/30'; // Strong distribution
};

const getTextColor = (value: number | null): string => {
  if (value === null) return 'text-muted-foreground';
  if (value >= 50) return 'text-red-800 dark:text-red-200';
  if (value >= 20) return 'text-orange-800 dark:text-orange-200';
  if (value >= 0) return 'text-yellow-800 dark:text-yellow-200';
  if (value >= -20) return 'text-blue-800 dark:text-blue-200';
  if (value >= -50) return 'text-indigo-800 dark:text-indigo-200';
  return 'text-purple-800 dark:text-purple-200';
};

export function StoryAccumulationDistribution() {
  const [data] = useState<AccumulationData[]>(generateMockData());
  const [selectedPeriod, setSelectedPeriod] = useState('Daily + Weekly');
  const [sortBy, setSortBy] = useState('symbol');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showSuspendedOnly, setShowSuspendedOnly] = useState(false);

  const dates = Object.keys(data[0]?.dates || {});
  
  const filteredData = showSuspendedOnly 
    ? data.filter(item => item.suspend)
    : data;
  
  const sortedData = [...filteredData].sort((a, b) => {
    if (sortBy === 'symbol') {
      return sortOrder === 'asc' 
        ? a.symbol.localeCompare(b.symbol)
        : b.symbol.localeCompare(a.symbol);
    } else if (sortBy === 'price') {
      return sortOrder === 'asc' 
        ? a.price - b.price
        : b.price - a.price;
    }
    
    // Sort by latest date value (D-0)
    const latestDate = 'D-0';
    const valueA = a.dates[latestDate] || 0;
    const valueB = b.dates[latestDate] || 0;
    
    return sortOrder === 'asc' 
      ? valueA - valueB
      : valueB - valueA;
  });

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const formatPrice = (price: number): string => {
    return new Intl.NumberFormat('id-ID').format(price);
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card className="p-4">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Period:</label>
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="px-3 py-1 border border-border rounded-md bg-background text-foreground text-sm"
              >
                <option value="Daily + Weekly">Daily + Weekly</option>
                <option value="Daily Only">Daily Only</option>
                <option value="Weekly Only">Weekly Only</option>
              </select>
            </div>
            
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="suspendedOnly"
                checked={showSuspendedOnly}
                onChange={(e) => setShowSuspendedOnly(e.target.checked)}
                className="rounded border-border"
              />
              <label htmlFor="suspendedOnly" className="text-sm font-medium">Show Suspended Only</label>
            </div>
            
            <div className="flex gap-2">
              <Button
                variant={sortBy === 'symbol' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleSort('symbol')}
              >
                Symbol {sortBy === 'symbol' && (sortOrder === 'asc' ? '↑' : '↓')}
              </Button>
              <Button
                variant={sortBy === 'price' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleSort('price')}
              >
                Price {sortBy === 'price' && (sortOrder === 'asc' ? '↑' : '↓')}
              </Button>
              <Button
                variant={sortBy === 'value' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleSort('value')}
              >
                Latest {sortBy === 'value' && (sortOrder === 'asc' ? '↑' : '↓')}
              </Button>
            </div>
          </div>
          
          <div className="text-sm text-muted-foreground">
            Total Stocks: {sortedData.length} | Suspended: {data.filter(d => d.suspend).length}
          </div>
        </div>
      </Card>

      {/* Legend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="font-medium mb-3">Color Legend</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-red-200 dark:bg-red-900/30 rounded border"></div>
              <span>Strong Acc (50+)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-orange-200 dark:bg-orange-900/30 rounded border"></div>
              <span>Med Acc (20-49)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-yellow-200 dark:bg-yellow-900/30 rounded border"></div>
              <span>Weak Acc (0-19)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-200 dark:bg-blue-900/30 rounded border"></div>
              <span>Weak Dist (0 to -19)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-indigo-200 dark:bg-indigo-900/30 rounded border"></div>
              <span>Med Dist (-20 to -49)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-purple-200 dark:bg-purple-900/30 rounded border"></div>
              <span>Strong Dist (-50+)</span>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="font-medium mb-3">Column Guide</h3>
          <div className="space-y-2 text-xs">
            <div><span className="font-medium">D-0:</span> Today's accumulation/distribution</div>
            <div><span className="font-medium">D-1, D-2, etc:</span> 1 day ago, 2 days ago, etc.</div>
            <div><span className="font-medium">W-1, W-2, etc:</span> 1 week ago, 2 weeks ago, etc.</div>
            <div><span className="font-medium">Price:</span> Current stock price</div>
            <div><span className="font-medium">Status:</span> Trading status (OK/SUSP)</div>
            <div><span className="font-medium">Notice:</span> Special corporate actions</div>
          </div>
        </Card>
      </div>

      {/* Heatmap Table */}
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[1400px]">
            {/* Header */}
            <div className="bg-muted/50 border-b border-border">
              <div className="flex">
                <div className="w-16 p-2 border-r border-border font-medium text-xs bg-card">
                  Symbol
                </div>
                <div className="w-20 p-2 border-r border-border font-medium text-xs text-center bg-card">
                  Price
                </div>
                <div className="w-16 p-2 border-r border-border font-medium text-xs text-center bg-card">
                  Status
                </div>
                <div className="w-20 p-2 border-r border-border font-medium text-xs text-center bg-card">
                  Notice
                </div>
                {dates.map((date, index) => (
                  <div 
                    key={date} 
                    className={`flex-1 p-2 border-r border-border font-medium text-xs text-center bg-card min-w-[60px] ${
                      date.startsWith('W-') ? 'bg-blue-50 dark:bg-blue-950/30' : ''
                    }`}
                  >
                    {date}
                  </div>
                ))}
                <div className="w-16 p-2 font-medium text-xs text-center bg-card">
                  Avg
                </div>
              </div>
            </div>

            {/* Data Rows */}
            <div className="max-h-[500px] overflow-y-auto">
              {sortedData.map((row, rowIndex) => {
                const average = Object.values(row.dates).reduce((sum, val) => sum + (val || 0), 0) / dates.length;
                
                return (
                  <div key={row.symbol} className={`flex border-b border-border hover:bg-muted/20 ${
                    row.suspend ? 'bg-red-50 dark:bg-red-950/20' : ''
                  }`}>
                    <div className="w-16 p-2 border-r border-border font-medium text-xs bg-card sticky left-0 z-10">
                      {row.symbol}
                    </div>
                    <div className="w-20 p-2 border-r border-border text-center text-xs bg-card">
                      {formatPrice(row.price)}
                    </div>
                    <div className="w-16 p-2 border-r border-border text-center text-xs bg-card">
                      {row.suspend ? (
                        <span className="text-red-600 dark:text-red-400 font-medium">SUSP</span>
                      ) : (
                        <span className="text-green-600 dark:text-green-400">OK</span>
                      )}
                    </div>
                    <div className="w-20 p-2 border-r border-border text-center text-xs bg-card">
                      {row.specialNotice ? (
                        <span className="px-1 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 rounded text-xs">
                          {row.specialNotice}
                        </span>
                      ) : (
                        '-'
                      )}
                    </div>
                    {dates.map((date) => {
                      const value = row.dates[date];
                      return (
                        <div 
                          key={`${row.symbol}-${date}`}
                          className={`flex-1 p-2 border-r border-border text-center text-xs min-w-[60px] ${getValueColor(value)} ${getTextColor(value)}`}
                        >
                          {value !== null ? value.toFixed(1) : '-'}
                        </div>
                      );
                    })}
                    <div className={`w-16 p-2 text-center text-xs ${getValueColor(average)} ${getTextColor(average)}`}>
                      {average.toFixed(1)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      {/* Summary Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <h3 className="font-medium mb-2">Strong Accumulation (D-0)</h3>
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">
            {sortedData.filter(row => {
              const latestValue = row.dates['D-0'] || 0;
              return latestValue >= 50;
            }).length}
          </div>
          <p className="text-sm text-muted-foreground">Stocks with D-0 value ≥ 50</p>
        </Card>

        <Card className="p-4">
          <h3 className="font-medium mb-2">Neutral Zone (D-0)</h3>
          <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
            {sortedData.filter(row => {
              const latestValue = row.dates['D-0'] || 0;
              return latestValue >= -20 && latestValue < 20;
            }).length}
          </div>
          <p className="text-sm text-muted-foreground">Stocks with D-0 value -20 to 20</p>
        </Card>

        <Card className="p-4">
          <h3 className="font-medium mb-2">Strong Distribution (D-0)</h3>
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {sortedData.filter(row => {
              const latestValue = row.dates['D-0'] || 0;
              return latestValue <= -50;
            }).length}
          </div>
          <p className="text-sm text-muted-foreground">Stocks with D-0 value ≤ -50</p>
        </Card>

        <Card className="p-4">
          <h3 className="font-medium mb-2">Suspended Stocks</h3>
          <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">
            {data.filter(row => row.suspend).length}
          </div>
          <p className="text-sm text-muted-foreground">Total suspended stocks</p>
        </Card>
      </div>
    </div>
  );
}