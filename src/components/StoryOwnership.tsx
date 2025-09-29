import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Card } from './ui/Card';
import { Button } from './ui/Button';

// Mock data untuk ownership breakdown
const ownershipData = [
  {
    category: 'Government of Singapore',
    percentage: 25.8,
    shares: 12500000000,
    color: '#3b82f6'
  },
  {
    category: 'Government of Norway',
    percentage: 18.2,
    shares: 8800000000,
    color: '#06b6d4'
  },
  {
    category: 'BlackRock Inc',
    percentage: 12.4,
    shares: 6000000000,
    color: '#8b5cf6'
  },
  {
    category: 'Vanguard Group Inc',
    percentage: 8.9,
    shares: 4300000000,
    color: '#10b981'
  },
  {
    category: 'State Street Corp',
    percentage: 6.7,  
    shares: 3200000000,
    color: '#f59e0b'
  },
  {
    category: 'Domestic Institution',
    percentage: 15.2,
    shares: 7350000000,
    color: '#ef4444'
  },
  {
    category: 'Public/Retail',
    percentage: 12.8,
    shares: 6200000000,
    color: '#84cc16'
  }
];

// Mock data untuk historical ownership (stacked bar chart)
const historicalOwnership = [
  { period: 'Q1 2023', gov_singapore: 26.1, gov_norway: 17.8, blackrock: 12.1, vanguard: 8.5, state_street: 6.2, domestic: 14.8, retail: 14.5 },
  { period: 'Q2 2023', gov_singapore: 25.9, gov_norway: 18.0, blackrock: 12.3, vanguard: 8.7, state_street: 6.5, domestic: 15.0, retail: 13.6 },
  { period: 'Q3 2023', gov_singapore: 25.7, gov_norway: 18.1, blackrock: 12.2, vanguard: 8.8, state_street: 6.4, domestic: 15.1, retail: 13.7 },
  { period: 'Q4 2023', gov_singapore: 25.6, gov_norway: 18.3, blackrock: 12.4, vanguard: 8.9, state_street: 6.6, domestic: 15.3, retail: 12.9 },
  { period: 'Q1 2024', gov_singapore: 25.8, gov_norway: 18.2, blackrock: 12.4, vanguard: 8.9, state_street: 6.7, domestic: 15.2, retail: 12.8 }
];

// Colors untuk historical chart
const stackColors = {
  gov_singapore: '#3b82f6',
  gov_norway: '#06b6d4', 
  blackrock: '#8b5cf6',
  vanguard: '#10b981',
  state_street: '#f59e0b',
  domestic: '#ef4444',
  retail: '#84cc16'
};

// Mock detailed ownership table data
const detailedOwnership = [
  {
    rank: 1,
    holder: 'Government of Singapore Investment Corp',
    type: 'Sovereign Wealth Fund',
    country: 'Singapore',
    shares: 12500000000,
    percentage: 25.8,
    value: 58250000000,
    change: '+0.2%',
    lastUpdate: '2024-03-15'
  },
  {
    rank: 2,
    holder: 'Government Pension Fund Global',
    type: 'Sovereign Wealth Fund', 
    country: 'Norway',
    shares: 8800000000,
    percentage: 18.2,
    value: 40920000000,
    change: '-0.1%',
    lastUpdate: '2024-03-14'
  },
  {
    rank: 3,
    holder: 'BlackRock Inc',
    type: 'Asset Manager',
    country: 'United States',
    shares: 6000000000,
    percentage: 12.4,
    value: 27900000000,
    change: '+0.3%',
    lastUpdate: '2024-03-15'
  },
  {
    rank: 4,
    holder: 'The Vanguard Group Inc',
    type: 'Asset Manager',
    country: 'United States', 
    shares: 4300000000,
    percentage: 8.9,
    value: 20005000000,
    change: '+0.1%',
    lastUpdate: '2024-03-13'
  },
  {
    rank: 5,
    holder: 'State Street Corp',
    type: 'Asset Manager',
    country: 'United States',
    shares: 3200000000,
    percentage: 6.7,
    value: 14880000000,
    change: '+0.2%',
    lastUpdate: '2024-03-14'
  }
];

export function StoryOwnership() {
  const [selectedStock, setSelectedStock] = useState('BBRI');
  const [selectedView, setSelectedView] = useState('summary');
  const [selectedPeriod, setSelectedPeriod] = useState('Q1 2024');

  const stocks = ['BBRI', 'BBCA', 'BMRI', 'BBNI', 'TLKM', 'ASII', 'UNVR', 'GGRM'];
  const views = [
    { key: 'summary', label: 'Summary' },
    { key: 'detailed', label: 'Detailed' },
    { key: 'historical', label: 'Historical' }
  ];

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
      <Card className="p-4">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <div className="flex items-center gap-2">
              <label className="font-medium">Stock:</label>
              <select
                value={selectedStock}
                onChange={(e) => setSelectedStock(e.target.value)}
                className="px-3 py-1 border border-border rounded-md bg-background text-foreground"
              >
                {stocks.map(stock => (
                  <option key={stock} value={stock}>{stock}</option>
                ))}
              </select>
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

            <div className="flex items-center gap-2">
              <label className="font-medium">Period:</label>
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="px-3 py-1 border border-border rounded-md bg-background text-foreground text-sm"
              >
                {historicalOwnership.map(period => (
                  <option key={period.period} value={period.period}>{period.period}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="text-sm text-muted-foreground">
            📊 Analisa Kepemilikan - Last Updated: Mar 15, 2024
          </div>
        </div>
      </Card>

      {/* Summary View */}
      {selectedView === 'summary' && (
        <>
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="p-4">
              <h3 className="font-medium mb-2">Total Shares</h3>
              <div className="text-2xl font-bold text-primary">48.35B</div>
              <p className="text-sm text-muted-foreground">Outstanding shares</p>
            </Card>
            
            <Card className="p-4">
              <h3 className="font-medium mb-2">Market Value</h3>
              <div className="text-2xl font-bold text-green-600">$225.2B</div>
              <p className="text-sm text-muted-foreground">Total market cap</p>
            </Card>
            
            <Card className="p-4">
              <h3 className="font-medium mb-2">Foreign Ownership</h3>
              <div className="text-2xl font-bold text-blue-600">52.3%</div>
              <p className="text-sm text-muted-foreground">International investors</p>
            </Card>
            
            <Card className="p-4">
              <h3 className="font-medium mb-2">Free Float</h3>
              <div className="text-2xl font-bold text-purple-600">35.2%</div>
              <p className="text-sm text-muted-foreground">Publicly traded</p>
            </Card>
          </div>

          {/* Ownership Breakdown Chart and Table */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pie Chart */}
            <Card className="p-4">
              <h3 className="font-medium mb-4">Ownership Distribution</h3>
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
                    >
                      {ownershipData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value, name, props) => [
                        `${value}%`,
                        props.payload.category
                      ]}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px',
                        fontSize: '12px'
                      }}
                    />
                    <Legend 
                      verticalAlign="bottom" 
                      height={36}
                      formatter={(value, entry) => (
                        <span style={{ color: entry.color, fontSize: '12px' }}>
                          {ownershipData[entry.payload?.index]?.category}
                        </span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Summary Table */}
            <Card className="p-4">
              <h3 className="font-medium mb-4">Top Shareholders</h3>
              <div className="overflow-y-auto max-h-80">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/50">
                    <tr className="border-b border-border">
                      <th className="text-left p-2">Shareholder</th>
                      <th className="text-right p-2">%</th>
                      <th className="text-right p-2">Shares</th>
                      <th className="text-right p-2">Value</th>
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
                            <span className="truncate" title={owner.category}>
                              {owner.category}
                            </span>
                          </div>
                        </td>
                        <td className="p-2 text-right font-medium">{owner.percentage}%</td>
                        <td className="p-2 text-right">{formatNumber(owner.shares)}</td>
                        <td className="p-2 text-right">{formatCurrency(owner.shares * 4.65)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </>
      )}

      {/* Detailed View */}
      {selectedView === 'detailed' && (
        <Card className="p-4">
          <h3 className="font-medium mb-4">Detailed Ownership Analysis</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left p-3">Rank</th>
                  <th className="text-left p-3">Holder Name</th>
                  <th className="text-left p-3">Type</th>
                  <th className="text-left p-3">Country</th>
                  <th className="text-right p-3">Shares</th>
                  <th className="text-right p-3">%</th>
                  <th className="text-right p-3">Market Value</th>
                  <th className="text-right p-3">Change</th>
                  <th className="text-right p-3">Last Update</th>
                </tr>
              </thead>
              <tbody>
                {detailedOwnership.map((holder, index) => (
                  <tr key={index} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="p-3 font-medium">#{holder.rank}</td>
                    <td className="p-3 font-medium">{holder.holder}</td>
                    <td className="p-3">
                      <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded text-xs">
                        {holder.type}
                      </span>
                    </td>
                    <td className="p-3">{holder.country}</td>
                    <td className="p-3 text-right font-mono">{formatNumber(holder.shares)}</td>
                    <td className="p-3 text-right font-medium">{holder.percentage}%</td>
                    <td className="p-3 text-right font-mono">{formatCurrency(holder.value)}</td>
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
        </Card>
      )}

      {/* Historical View */}
      {selectedView === 'historical' && (
        <Card className="p-4">
          <h3 className="font-medium mb-4">Historical Ownership Trends</h3>
          <div className="h-96 mb-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={historicalOwnership}
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
                    fontSize: '12px'
                  }}
                  formatter={(value, name) => [`${value}%`, name]}
                />
                <Legend />
                
                <Bar dataKey="gov_singapore" stackId="ownership" fill={stackColors.gov_singapore} name="Gov Singapore" />
                <Bar dataKey="gov_norway" stackId="ownership" fill={stackColors.gov_norway} name="Gov Norway" />
                <Bar dataKey="blackrock" stackId="ownership" fill={stackColors.blackrock} name="BlackRock" />
                <Bar dataKey="vanguard" stackId="ownership" fill={stackColors.vanguard} name="Vanguard" />
                <Bar dataKey="state_street" stackId="ownership" fill={stackColors.state_street} name="State Street" />
                <Bar dataKey="domestic" stackId="ownership" fill={stackColors.domestic} name="Domestic Inst" />
                <Bar dataKey="retail" stackId="ownership" fill={stackColors.retail} name="Public/Retail" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Historical Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-4 bg-muted/30">
              <h4 className="font-medium mb-2">Largest Increase</h4>
              <div className="text-lg font-bold text-green-600">Government of Singapore</div>
              <p className="text-sm text-muted-foreground">+0.2% from Q4 2023</p>
            </Card>
            
            <Card className="p-4 bg-muted/30">
              <h4 className="font-medium mb-2">Largest Decrease</h4>
              <div className="text-lg font-bold text-red-600">Public/Retail</div>
              <p className="text-sm text-muted-foreground">-0.1% from Q4 2023</p>
            </Card>
            
            <Card className="p-4 bg-muted/30">
              <h4 className="font-medium mb-2">Most Stable</h4>
              <div className="text-lg font-bold text-blue-600">BlackRock Inc</div>
              <p className="text-sm text-muted-foreground">Consistent ~12.4%</p>
            </Card>
          </div>
        </Card>
      )}
    </div>
  );
}