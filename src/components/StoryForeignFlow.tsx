import React, { useState } from 'react';
import { Card } from './ui-clean/Card';
import { Button } from './ui-clean/Button';
import { Badge } from './ui-clean/Badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts';
import { Calendar, TrendingUp, TrendingDown, Users, Globe, Building2, Briefcase, ArrowUpDown } from 'lucide-react';

const foreignFlowData = [
  { date: '2024-01-01', value: 2.5, net: 1.2, buy: 8.7, sell: 7.5 },
  { date: '2024-01-02', value: -1.8, net: -0.9, buy: 6.3, sell: 7.2 },
  { date: '2024-01-03', value: 3.2, net: 1.8, buy: 12.4, sell: 10.6 },
  { date: '2024-01-04', value: -0.5, net: -0.3, buy: 5.8, sell: 6.1 },
  { date: '2024-01-05', value: 4.1, net: 2.3, buy: 15.2, sell: 12.9 },
  { date: '2024-01-08', value: -2.3, net: -1.1, buy: 4.9, sell: 6.0 },
  { date: '2024-01-09', value: 1.7, net: 0.8, buy: 9.5, sell: 8.7 },
];

const foreignTypesData = [
  { type: 'Institutional', percentage: 45.2, value: 125.6, color: '#3b82f6' },
  { type: 'Sovereign Fund', percentage: 28.1, value: 78.3, color: '#10b981' },
  { type: 'Pension Fund', percentage: 15.7, value: 43.7, color: '#f59e0b' },
  { type: 'Hedge Fund', percentage: 8.4, value: 23.4, color: '#ef4444' },
  { type: 'Other', percentage: 2.6, value: 7.2, color: '#8b5cf6' },
];

const foreignCountryData = [
  { country: 'Singapore', percentage: 32.5, flow: 2.1, trend: 'up' },
  { country: 'Hong Kong', percentage: 18.7, flow: -0.8, trend: 'down' },
  { country: 'Japan', percentage: 15.2, flow: 1.5, trend: 'up' },
  { country: 'Malaysia', percentage: 12.8, flow: 0.3, trend: 'up' },
  { country: 'Thailand', percentage: 8.9, flow: -0.4, trend: 'down' },
  { country: 'South Korea', percentage: 6.4, flow: 0.7, trend: 'up' },
  { country: 'Others', percentage: 5.5, flow: -0.2, trend: 'down' },
];

const topForeignInvestors = [
  { name: 'GIC Private Limited', country: 'Singapore', type: 'Sovereign Fund', holding: 4.2, change: 0.3 },
  { name: 'Temasek Holdings', country: 'Singapore', type: 'Sovereign Fund', holding: 3.8, change: -0.1 },
  { name: 'GPIF', country: 'Japan', type: 'Pension Fund', holding: 2.9, change: 0.2 },
  { name: 'Khazanah Nasional', country: 'Malaysia', type: 'Sovereign Fund', holding: 2.1, change: 0.1 },
  { name: 'CPF Investment Board', country: 'Singapore', type: 'Pension Fund', holding: 1.8, change: 0.0 },
];

export function StoryForeignFlow() {
  const [selectedTimeframe, setSelectedTimeframe] = useState('1M');
  const [selectedView, setSelectedView] = useState('flow');

  const timeframes = ['1D', '1W', '1M', '3M', '6M', '1Y'];
  const views = [
    { id: 'flow', label: 'Foreign Flow', icon: ArrowUpDown },
    { id: 'ownership', label: 'Ownership', icon: Users },
    { id: 'types', label: 'Investor Types', icon: Building2 },
    { id: 'countries', label: 'Countries', icon: Globe },
  ];

  const totalForeignOwnership = 23.4;
  const dailyFlow = 1.7;
  const weeklyFlow = 4.2;
  const monthlyFlow = 12.8;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Foreign Flow Analysis</h2>
          <p className="text-muted-foreground mt-1">
            Comprehensive analysis of foreign investor activity and ownership patterns
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            {timeframes.map((tf) => (
              <Button
                key={tf}
                variant={selectedTimeframe === tf ? "default" : "ghost"}
                size="sm"
                onClick={() => setSelectedTimeframe(tf)}
                className="px-3 py-1 h-8 text-xs"
              >
                {tf}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Foreign Ownership</p>
              <p className="text-2xl font-semibold">{totalForeignOwnership}%</p>
            </div>
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
              <Globe className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Daily Flow</p>
              <p className="text-2xl font-semibold text-green-600">+{dailyFlow}B</p>
            </div>
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/20 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Weekly Flow</p>
              <p className="text-2xl font-semibold text-green-600">+{weeklyFlow}B</p>
            </div>
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/20 rounded-lg flex items-center justify-center">
              <Calendar className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Monthly Flow</p>
              <p className="text-2xl font-semibold text-green-600">+{monthlyFlow}B</p>
            </div>
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/20 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </Card>
      </div>

      {/* View Selector */}
      <div className="flex flex-wrap gap-2">
        {views.map((view) => (
          <Button
            key={view.id}
            variant={selectedView === view.id ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedView(view.id)}
            className="flex items-center gap-2"
          >
            <view.icon className="w-4 h-4" />
            {view.label}
          </Button>
        ))}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left Panel - Charts */}
        <div className="xl:col-span-2 space-y-6">
          {selectedView === 'flow' && (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Foreign Flow Trend</h3>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span>Buy</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                    <span>Sell</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                    <span>Net</span>
                  </div>
                </div>
              </div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={foreignFlowData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                    <XAxis 
                      dataKey="date" 
                      stroke="currentColor" 
                      opacity={0.7}
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => new Date(value).toLocaleDateString('id-ID', { month: 'short', day: 'numeric' })}
                    />
                    <YAxis stroke="currentColor" opacity={0.7} tick={{ fontSize: 12 }} />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                      }}
                    />
                    <Line type="monotone" dataKey="buy" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="sell" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="net" stroke="#3b82f6" strokeWidth={3} dot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {selectedView === 'types' && (
            <Card className="p-6">
              <h3 className="font-semibold mb-4">Foreign Investor Types</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={foreignTypesData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ type, percentage }) => `${type}: ${percentage}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="percentage"
                    >
                      {foreignTypesData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {selectedView === 'countries' && (
            <Card className="p-6">
              <h3 className="font-semibold mb-4">Foreign Flow by Countries</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={foreignCountryData} layout="horizontal">
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                    <XAxis type="number" stroke="currentColor" opacity={0.7} tick={{ fontSize: 12 }} />
                    <YAxis 
                      type="category" 
                      dataKey="country" 
                      stroke="currentColor" 
                      opacity={0.7} 
                      tick={{ fontSize: 12 }}
                      width={80}
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                      }}
                    />
                    <Bar dataKey="percentage" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {selectedView === 'ownership' && (
            <Card className="p-6">
              <h3 className="font-semibold mb-4">Foreign Ownership Distribution</h3>
              <div className="space-y-4">
                {foreignTypesData.map((item, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-4 h-4 rounded-full" 
                        style={{ backgroundColor: item.color }}
                      ></div>
                      <div>
                        <p className="font-medium">{item.type}</p>
                        <p className="text-sm text-muted-foreground">{item.percentage}% of total foreign</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">${item.value}B</p>
                      <p className="text-sm text-muted-foreground">Market Value</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Right Panel - Details */}
        <div className="space-y-6">
          {/* Foreign Countries */}
          <Card className="p-4">
            <h3 className="font-semibold mb-4">Foreign Countries</h3>
            <div className="space-y-3">
              {foreignCountryData.map((country, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{country.country}</span>
                    {country.trend === 'up' ? (
                      <TrendingUp className="w-4 h-4 text-green-500" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-red-500" />
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{country.percentage}%</p>
                    <p className={`text-xs ${country.flow > 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {country.flow > 0 ? '+' : ''}{country.flow}B
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Top Foreign Investors */}
          <Card className="p-4">
            <h3 className="font-semibold mb-4">Top Foreign Investors</h3>
            <div className="space-y-3">
              {topForeignInvestors.map((investor, index) => (
                <div key={index} className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-sm">{investor.name}</p>
                    <Badge variant="outline" className="text-xs">
                      {investor.holding}%
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{investor.country} • {investor.type}</span>
                    <span className={investor.change > 0 ? 'text-green-500' : investor.change < 0 ? 'text-red-500' : ''}>
                      {investor.change > 0 ? '+' : ''}{investor.change}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Quick Stats */}
          <Card className="p-4">
            <h3 className="font-semibold mb-4">Quick Stats</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Avg Daily Volume</span>
                <span className="text-sm font-medium">$2.1B</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Foreign vs Local</span>
                <span className="text-sm font-medium">23.4% : 76.6%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Largest Holder</span>
                <span className="text-sm font-medium">GIC (4.2%)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Active Countries</span>
                <span className="text-sm font-medium">12</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}