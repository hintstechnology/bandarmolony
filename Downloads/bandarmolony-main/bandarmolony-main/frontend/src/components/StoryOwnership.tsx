import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';

// Function to parse CSV data and create ownership data
const parseOwnershipData = () => {
  // Raw CSV data from BBCA.csv (latest data - 2025-08-31)
  const csvData = [
    { name: 'PT Dwimuria Investama Andalan', percentage: 54.942, shares: 67729950000, category: 'Controlling Shareholder' },
    { name: 'Masyarakat Non Warkat', percentage: 42.463, shares: 52346743930, category: 'Public/Retail' },
    { name: 'Pihak Afiliasi Pengendali', percentage: 2.455, shares: 3026977500, category: 'Affiliate' },
    { name: 'Jahja Setiaatmadja', percentage: 0.03, shares: 34805144, category: 'Board Member' },
    { name: 'Saham Treasury', percentage: 0.023, shares: 28317500, category: 'Treasury' },
    { name: 'Robert Budi Hartono', percentage: 0.023, shares: 28135000, category: 'Major Shareholder' },
    { name: 'Bambang Hartono', percentage: 0.022, shares: 27025000, category: 'Major Shareholder' },
    { name: 'Masyarakat Warkat', percentage: 0.009, shares: 11248880, category: 'Public/Retail' },
    { name: 'Tan Ho Hien/Subur', percentage: 0.009, shares: 11169044, category: 'Board Member' },
    { name: 'Tonny Kusnadi', percentage: 0.006, shares: 7502058, category: 'Board Member' },
    { name: 'Others', percentage: 0.017, shares: 21000000, category: 'Others' }
  ];

  // Separate major and minor shareholders
  const majorShareholders = csvData.filter(item => item.percentage >= 2);
  const minorShareholders = csvData.filter(item => item.percentage < 2);
  
  // Calculate total for others
  const othersTotal = minorShareholders.reduce((sum, item) => ({
    percentage: sum.percentage + item.percentage,
    shares: sum.shares + item.shares
  }), { percentage: 0, shares: 0 });

  // Combine data
  const combinedData = [
    ...majorShareholders,
    { name: 'Others', percentage: othersTotal.percentage, shares: othersTotal.shares, category: 'Others' }
  ];

  const colors = ['#3b82f6', '#06b6d4', '#8b5cf6', '#10b981'];

  return combinedData.map((item, index) => ({
    ...item,
    color: colors[index % colors.length]
  }));
};

// Get ownership data
const ownershipData = parseOwnershipData();

// Historical data from BBCA.csv - grouped by month
const historicalOwnershipData = [
  { period: 'Aug 2025', controlling: 54.942, public: 42.463, affiliate: 2.455, others: 0.14 },
  { period: 'Jul 2025', controlling: 54.942, public: 42.463, affiliate: 2.455, others: 0.14 },
  { period: 'Jun 2025', controlling: 54.942, public: 42.463, affiliate: 2.455, others: 0.14 },
  { period: 'May 2025', controlling: 54.942, public: 42.376, affiliate: 2.455, others: 0.227 },
  { period: 'Apr 2025', controlling: 54.942, public: 42.399, affiliate: 2.455, others: 0.204 },
  { period: 'Mar 2025', controlling: 54.942, public: 42.399, affiliate: 2.455, others: 0.204 },
  { period: 'Feb 2025', controlling: 54.942, public: 42.404, affiliate: 2.455, others: 0.199 },
  { period: 'Jan 2025', controlling: 54.942, public: 42.404, affiliate: 2.455, others: 0.199 },
  { period: 'Dec 2024', controlling: 54.942, public: 42.404, affiliate: 2.455, others: 0.199 },
  { period: 'Nov 2024', controlling: 54.942, public: 42.404, affiliate: 2.455, others: 0.199 },
  { period: 'Oct 2024', controlling: 54.942, public: 42.404, affiliate: 2.455, others: 0.199 },
  { period: 'Sep 2024', controlling: 54.942, public: 42.405, affiliate: 2.455, others: 0.198 }
];

// Colors untuk historical chart
const stackColors = {
  controlling: '#3b82f6',
  public: '#06b6d4', 
  affiliate: '#8b5cf6',
  others: '#10b981'
};

// Complete detailed ownership data from BBCA.csv (all shareholders)
const detailedOwnership = [
  {
    rank: 1,
    holder: 'PT Dwimuria Investama Andalan',
    type: 'Lebih dari 5%',
    shares: 67729950000,
    percentage: 54.942,
    value: 315045367500,
    change: '0.0%',
    lastUpdate: '2025-08-31'
  },
  {
    rank: 2,
    holder: 'Masyarakat Non Warkat',
    type: 'Masyarakat Non Warkat',
    shares: 52346743930,
    percentage: 42.463,
    value: 243412359975,
    change: '0.0%',
    lastUpdate: '2025-08-31'
  },
  {
    rank: 3,
    holder: 'Pihak Afiliasi Pengendali',
    type: 'Lebih dari 5%',
    shares: 3026977500,
    percentage: 2.455,
    value: 14075455375,
    change: '0.0%',
    lastUpdate: '2025-08-31'
  },
  {
    rank: 4,
    holder: 'Jahja Setiaatmadja',
    type: 'Komisaris',
    shares: 34805144,
    percentage: 0.03,
    value: 161843920,
    change: '0.0%',
    lastUpdate: '2025-08-31'
  },
  {
    rank: 5,
    holder: 'Saham Treasury',
    type: 'Saham Treasury',
    shares: 28317500,
    percentage: 0.023,
    value: 131676375,
    change: '0.0%',
    lastUpdate: '2025-08-31'
  },
  {
    rank: 6,
    holder: 'Robert Budi Hartono',
    type: 'Lebih dari 5%',
    shares: 28135000,
    percentage: 0.023,
    value: 130827750,
    change: '0.0%',
    lastUpdate: '2025-08-31'
  },
  {
    rank: 7,
    holder: 'Bambang Hartono',
    type: 'Lebih dari 5%',
    shares: 27025000,
    percentage: 0.022,
    value: 125666250,
    change: '0.0%',
    lastUpdate: '2025-08-31'
  },
  {
    rank: 8,
    holder: 'Masyarakat Warkat',
    type: 'Masyarakat Warkat',
    shares: 11248880,
    percentage: 0.009,
    value: 52307292,
    change: '0.0%',
    lastUpdate: '2025-08-31'
  },
  {
    rank: 9,
    holder: 'Tan Ho Hien/Subur disebut juga Subur Tan',
    type: 'Direksi',
    shares: 11169044,
    percentage: 0.009,
    value: 51936055,
    change: '0.0%',
    lastUpdate: '2025-08-31'
  },
  {
    rank: 10,
    holder: 'Tonny Kusnadi',
    type: 'Komisaris',
    shares: 7502058,
    percentage: 0.006,
    value: 34884570,
    change: '0.0%',
    lastUpdate: '2025-08-31'
  },
  {
    rank: 11,
    holder: 'Armand Wahyudi Hartono',
    type: 'Direksi',
    shares: 4256065,
    percentage: 0.003,
    value: 19791022,
    change: '0.0%',
    lastUpdate: '2025-08-31'
  },
  {
    rank: 12,
    holder: 'Rudy Susanto',
    type: 'Direksi',
    shares: 3431711,
    percentage: 0.003,
    value: 15957456,
    change: '0.0%',
    lastUpdate: '2025-08-31'
  },
  {
    rank: 13,
    holder: 'Santoso',
    type: 'Direksi',
    shares: 3169028,
    percentage: 0.003,
    value: 14735980,
    change: '0.0%',
    lastUpdate: '2025-08-31'
  },
  {
    rank: 14,
    holder: 'Lianawaty Suwono',
    type: 'Direksi',
    shares: 2840417,
    percentage: 0.002,
    value: 13207939,
    change: '0.0%',
    lastUpdate: '2025-08-31'
  },
  {
    rank: 15,
    holder: 'Vera Eve Lim',
    type: 'Direksi',
    shares: 2731601,
    percentage: 0.002,
    value: 12701945,
    change: '0.0%',
    lastUpdate: '2025-08-31'
  },
  {
    rank: 16,
    holder: 'Frengky Chandra Kusuma',
    type: 'Direksi',
    shares: 2429926,
    percentage: 0.002,
    value: 11299156,
    change: '0.0%',
    lastUpdate: '2025-08-31'
  },
  {
    rank: 17,
    holder: 'Gregory Hendra Lembong',
    type: 'Direksi',
    shares: 1531282,
    percentage: 0.001,
    value: 7120461,
    change: '0.0%',
    lastUpdate: '2025-08-31'
  },
  {
    rank: 18,
    holder: 'John Kosasih',
    type: 'Direksi',
    shares: 1094492,
    percentage: 0.001,
    value: 5089388,
    change: '0.0%',
    lastUpdate: '2025-08-31'
  },
  {
    rank: 19,
    holder: 'Haryanto Tiara Budiman',
    type: 'Direksi',
    shares: 1057378,
    percentage: 0.001,
    value: 4916808,
    change: '0.0%',
    lastUpdate: '2025-08-31'
  },
  {
    rank: 20,
    holder: 'Antonius Widodo Mulyono',
    type: 'Direksi',
    shares: 440838,
    percentage: 0.0,
    value: 2049897,
    change: '0.0%',
    lastUpdate: '2025-08-31'
  },
  {
    rank: 21,
    holder: 'Hendra Tanumihardja',
    type: 'Direksi',
    shares: 193206,
    percentage: 0.0,
    value: 898408,
    change: '0.0%',
    lastUpdate: '2025-08-31'
  }
];

export function StoryOwnership() {
  const [selectedStock, setSelectedStock] = useState('BBCA');
  const [selectedView, setSelectedView] = useState('summary');
  const [dataRange, setDataRange] = useState(6); // Default 6 months
  const [stockInput, setStockInput] = useState('BBCA');
  const [showStockSuggestions, setShowStockSuggestions] = useState(false);

  const stocks = ['BBCA', 'BBRI', 'BMRI', 'BBNI', 'TLKM', 'ASII', 'UNVR', 'GGRM', 'ICBP', 'INDF', 'KLBF', 'ADRO', 'ANTM', 'ITMG', 'PTBA', 'SMGR', 'INTP', 'WIKA', 'WSKT', 'PGAS'];
  const views = [
    { key: 'summary', label: 'Summary' },
    { key: 'detailed', label: 'Detailed' }
  ];

  // Filter stocks based on input
  const filteredStocks = stocks.filter(stock => 
    stock.toLowerCase().includes(stockInput.toLowerCase())
  );

  const handleStockSelect = (stock: string) => {
    setStockInput(stock);
    setSelectedStock(stock);
    setShowStockSuggestions(false);
  };

  const handleStockInputChange = (value: string) => {
    setStockInput(value.toUpperCase());
    setShowStockSuggestions(true);
    // Auto-select if exact match
    if (stocks.includes(value.toUpperCase())) {
      setSelectedStock(value.toUpperCase());
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.stock-dropdown-container')) {
        setShowStockSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Get historical data based on selected range
  const getHistoricalData = () => {
    return historicalOwnershipData.slice(0, dataRange);
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000000) {
      return `${(num / 1000000000).toFixed(1)}B`;
    } else if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    return num.toLocaleString();
  };

  const formatCurrency = (num: number): string => {
    return `$${formatNumber(num)}`;
  };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <div className="flex items-center gap-2">
                <label className="font-medium">Stock:</label>
                <div className="relative stock-dropdown-container">
                  <input
                    type="text"
                    value={stockInput}
                    onChange={(e) => handleStockInputChange(e.target.value)}
                    onFocus={() => setShowStockSuggestions(true)}
                    placeholder="Enter stock code..."
                    className="px-3 py-1 border border-border rounded-md bg-background text-foreground w-40"
                  />
                  {showStockSuggestions && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                      {stockInput === '' ? (
                        <>
                          <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
                            All Stocks
                          </div>
                          {stocks.map(stock => (
                            <div
                              key={stock}
                              onClick={() => handleStockSelect(stock)}
                              className="px-3 py-2 hover:bg-muted cursor-pointer text-sm"
                            >
                              {stock}
                            </div>
                          ))}
                        </>
                      ) : filteredStocks.length > 0 ? (
                        filteredStocks.map(stock => (
                          <div
                            key={stock}
                            onClick={() => handleStockSelect(stock)}
                            className="px-3 py-2 hover:bg-muted cursor-pointer text-sm"
                          >
                            {stock}
                          </div>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          No stocks found
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <label className="font-medium">View:</label>
                <div className="flex gap-1">
                  {views.map(view => (
                    <Button
                      key={view.key}
                      variant={selectedView === view.key ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedView(view.key)}
                    >
                      {view.label}
                    </Button>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary View */}
      {selectedView === 'summary' && (
        <>
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <h3 className="font-medium mb-2">Total Shares</h3>
                <div className="text-2xl font-bold text-primary">123.3B</div>
                <p className="text-sm text-muted-foreground">Outstanding shares</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <h3 className="font-medium mb-2">Controlling Shareholder</h3>
                <div className="text-2xl font-bold text-blue-600">54.94%</div>
                <p className="text-sm text-muted-foreground">PT Dwimuria Investama</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <h3 className="font-medium mb-2">Public Ownership</h3>
                <div className="text-2xl font-bold text-green-600">42.46%</div>
                <p className="text-sm text-muted-foreground">Masyarakat Non Warkat</p>
              </CardContent>
            </Card>
          </div>

          {/* Ownership Breakdown Chart and Table */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pie Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Ownership Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={ownershipData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={120}
                        paddingAngle={2}
                        dataKey="percentage"
                        nameKey="name"
                      >
                        {ownershipData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value, name, props) => [
                          `${value}%`,
                          props.payload.name
                        ]}
                        contentStyle={{
                          backgroundColor: 'hsl(var(--popover))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px',
                          fontSize: '12px',
                          color: 'hsl(var(--popover-foreground))'
                        }}
                        labelStyle={{
                          color: 'hsl(var(--popover-foreground))'
                        }}
                      />
                      <Legend 
                        verticalAlign="bottom" 
                        height={36}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Summary Table */}
            <Card>
              <CardHeader>
                <CardTitle>Top Shareholders</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-y-auto max-h-80">
                  <table className="w-full text-sm">
                     <thead className="sticky top-0 bg-muted/50">
                       <tr className="border-b border-border">
                         <th className="text-left p-2 text-foreground">Shareholder</th>
                         <th className="text-right p-2 text-foreground">%</th>
                         <th className="text-right p-2 text-foreground">Shares</th>
                         <th className="text-right p-2 text-foreground">Value</th>
                       </tr>
                     </thead>
                    <tbody>
                      {ownershipData.map((owner, index) => (
                        <tr key={index} className="border-b border-border/50 hover:bg-muted/20">
                          <td className="p-2">
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: owner.color }}
                              ></div>
                              <span className="truncate text-foreground" title={owner.name}>
                                {owner.name}
                              </span>
                            </div>
                          </td>
                          <td className="p-2 text-right font-medium text-foreground">{owner.percentage}%</td>
                          <td className="p-2 text-right text-foreground">{formatNumber(owner.shares)}</td>
                          <td className="p-2 text-right text-foreground">{formatCurrency(owner.shares * 4.65)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Historical Ownership Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Historical Ownership Trends</CardTitle>
              <div className="flex items-center gap-4">
                <p className="text-sm text-muted-foreground">Ownership changes over time</p>
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium">Data Range:</label>
                  <select
                    value={dataRange}
                    onChange={(e) => setDataRange(Number(e.target.value))}
                    className="px-2 py-1 border border-border rounded-md bg-background text-foreground text-sm"
                  >
                    {[3, 6, 9, 12].map(num => (
                      <option key={num} value={num}>{num} months</option>
                    ))}
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={getHistoricalData()}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis 
                      dataKey="period" 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                      domain={[0, 100]}
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px',
                        fontSize: '12px',
                        color: 'hsl(var(--popover-foreground))'
                      }}
                      labelStyle={{
                        color: 'hsl(var(--popover-foreground))'
                      }}
                      formatter={(value, name) => [`${value}%`, name]}
                    />
                    <Legend />
                    
                    <Bar dataKey="controlling" stackId="ownership" fill={stackColors.controlling} name="Controlling" />
                    <Bar dataKey="public" stackId="ownership" fill={stackColors.public} name="Public" />
                    <Bar dataKey="affiliate" stackId="ownership" fill={stackColors.affiliate} name="Affiliate" />
                    <Bar dataKey="others" stackId="ownership" fill={stackColors.others} name="Others" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Detailed View */}
      {selectedView === 'detailed' && (
        <Card>
          <CardHeader>
            <CardTitle>Detailed Ownership Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                 <thead>
                   <tr className="border-b border-border bg-muted/50">
                     <th className="text-left p-3 text-foreground">Rank</th>
                     <th className="text-left p-3 text-foreground">Holder Name</th>
                     <th className="text-left p-3 text-foreground">Type</th>
                     <th className="text-right p-3 text-foreground">Shares</th>
                     <th className="text-right p-3 text-foreground">%</th>
                     <th className="text-right p-3 text-foreground">Market Value</th>
                     <th className="text-right p-3 text-foreground">Change</th>
                     <th className="text-right p-3 text-foreground">Last Update</th>
                   </tr>
                 </thead>
                <tbody>
                  {detailedOwnership.map((holder, index) => (
                    <tr key={index} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="p-3 font-medium text-foreground">#{holder.rank}</td>
                      <td className="p-3 font-medium text-foreground">{holder.holder}</td>
                      <td className="p-3">
                        <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded text-xs">
                          {holder.type}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono text-foreground">{formatNumber(holder.shares)}</td>
                      <td className="p-3 text-right font-medium text-foreground">{holder.percentage}%</td>
                      <td className="p-3 text-right font-mono text-foreground">{formatCurrency(holder.value)}</td>
                      <td className="p-3 text-right">
                        <span className={holder.change.startsWith('+') ? 'text-green-600' : holder.change.startsWith('-') ? 'text-red-600' : 'text-gray-600'}>
                          {holder.change}
                        </span>
                      </td>
                      <td className="p-3 text-right text-muted-foreground">{holder.lastUpdate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}