import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Calendar, Plus, X, TrendingUp, TrendingDown } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, BarChart, Bar, Area, AreaChart } from 'recharts';

interface DoneSummaryData {
  time: string;
  price: number;
  volume: number;
  value: number;
  buyVolume: number;
  sellVolume: number;
  netVolume: number;
}

interface TopTransactionData {
  broker: string;
  side: 'BUY' | 'SELL';
  volume: number;
  value: number;
  avgPrice: number;
  frequency: number;
}

// Sample done summary data
const generateDoneSummaryData = (date: string): DoneSummaryData[] => {
  return Array.from({ length: 24 }, (_, i) => ({
    time: `${i.toString().padStart(2, '0')}:00`,
    price: 4400 + (Math.random() - 0.5) * 200,
    volume: Math.random() * 1000000 + 500000,
    value: (4400 + (Math.random() - 0.5) * 200) * (Math.random() * 1000000 + 500000),
    buyVolume: Math.random() * 600000 + 300000,
    sellVolume: Math.random() * 500000 + 200000,
    netVolume: (Math.random() - 0.5) * 400000,
  }));
};

// Sample top transaction data
const generateTopTransactionData = (date: string): TopTransactionData[] => [
  { broker: 'MG', side: 'BUY', volume: 2400000, value: 10560000000, avgPrice: 4400, frequency: 45 },
  { broker: 'CIMB', side: 'BUY', volume: 1800000, value: 7920000000, avgPrice: 4400, frequency: 38 },
  { broker: 'UOB', side: 'SELL', volume: 2100000, value: 9240000000, avgPrice: 4400, frequency: 42 },
  { broker: 'COIN', side: 'BUY', volume: 1500000, value: 6600000000, avgPrice: 4400, frequency: 32 },
  { broker: 'NH', side: 'SELL', volume: 1700000, value: 7480000000, avgPrice: 4400, frequency: 35 },
  { broker: 'TRIM', side: 'BUY', volume: 1200000, value: 5280000000, avgPrice: 4400, frequency: 28 },
  { broker: 'DEWA', side: 'SELL', volume: 1100000, value: 4840000000, avgPrice: 4400, frequency: 25 },
  { broker: 'BNCA', side: 'BUY', volume: 950000, value: 4180000000, avgPrice: 4400, frequency: 22 },
];

const formatNumber = (num: number): string => {
  if (Math.abs(num) >= 1000000000) {
    return (num / 1000000000).toFixed(1) + 'B';
  }
  if (Math.abs(num) >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (Math.abs(num) >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toFixed(0);
};

const formatPrice = (price: number): string => {
  return price.toFixed(0);
};

export function StockTransactionDoneSummary() {
  const [selectedDates, setSelectedDates] = useState<string[]>(['2025-07-24', '2025-07-25']);
  const [newDate, setNewDate] = useState('');
  const [selectedStock, setSelectedStock] = useState('BBRI');

  const addDate = () => {
    if (newDate && !selectedDates.includes(newDate)) {
      setSelectedDates([...selectedDates, newDate]);
      setNewDate('');
    }
  };

  const removeDate = (dateToRemove: string) => {
    if (selectedDates.length > 1) {
      setSelectedDates(selectedDates.filter(date => date !== dateToRemove));
    }
  };

  const formatDisplayDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="space-y-6">
      {/* Stock Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Stock Selection & Date Range</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Stock Selector */}
            <div>
              <label className="text-sm font-medium">Selected Stock:</label>
              <div className="flex gap-2 mt-2">
                <select 
                  value={selectedStock}
                  onChange={(e) => setSelectedStock(e.target.value)}
                  className="px-3 py-2 border border-border rounded-md bg-input-background text-foreground"
                >
                  <option value="BBRI">BBRI</option>
                  <option value="BBCA">BBCA</option>
                  <option value="BMRI">BMRI</option>
                  <option value="TLKM">TLKM</option>
                  <option value="ASII">ASII</option>
                  <option value="UNVR">UNVR</option>
                </select>
              </div>
            </div>

            {/* Selected Dates */}
            <div>
              <label className="text-sm font-medium">Selected Dates:</label>
              <div className="flex flex-wrap gap-2 mt-2">
                {selectedDates.map((date) => (
                  <Badge key={date} variant="secondary" className="px-3 py-1">
                    {formatDisplayDate(date)}
                    {selectedDates.length > 1 && (
                      <button
                        onClick={() => removeDate(date)}
                        className="ml-2 hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Add New Date */}
            <div className="flex gap-2">
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="px-3 py-2 border border-border rounded-md bg-input-background text-foreground"
              />
              <Button onClick={addDate} size="sm">
                <Plus className="w-4 h-4 mr-1" />
                Add Date
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Done Summary Analysis for Each Date */}
      {selectedDates.map((date) => {
        const doneSummaryData = generateDoneSummaryData(date);
        const topTransactionData = generateTopTransactionData(date);
        
        const totalVolume = doneSummaryData.reduce((sum, item) => sum + item.volume, 0);
        const totalValue = doneSummaryData.reduce((sum, item) => sum + item.value, 0);
        const avgPrice = totalValue / totalVolume;
        const lastPrice = doneSummaryData[doneSummaryData.length - 1]?.price || 0;
        const firstPrice = doneSummaryData[0]?.price || 0;
        const priceChange = lastPrice - firstPrice;
        const priceChangePercent = (priceChange / firstPrice) * 100;

        return (
          <div key={date} className="space-y-6">
            {/* Summary Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Done Summary - {selectedStock} ({formatDisplayDate(date)})</span>
                  <div className="flex items-center gap-2">
                    {priceChange >= 0 ? (
                      <TrendingUp className="w-5 h-5 text-green-600" />
                    ) : (
                      <TrendingDown className="w-5 h-5 text-red-600" />
                    )}
                    <span className={`text-sm font-medium ${priceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(0)} ({priceChangePercent.toFixed(2)}%)
                    </span>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Last Price</p>
                    <p className="text-lg font-semibold">{formatPrice(lastPrice)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Total Volume</p>
                    <p className="text-lg font-semibold">{formatNumber(totalVolume)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Total Value</p>
                    <p className="text-lg font-semibold">{formatNumber(totalValue)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Avg Price</p>
                    <p className="text-lg font-semibold">{formatPrice(avgPrice)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Price Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Price Movement</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={doneSummaryData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted-foreground))" opacity={0.3} />
                      <XAxis dataKey="time" stroke="hsl(var(--foreground))" tick={{ fill: 'hsl(var(--foreground))' }} />
                      <YAxis stroke="hsl(var(--foreground))" tick={{ fill: 'hsl(var(--foreground))' }} domain={['dataMin - 50', 'dataMax + 50']} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px'
                        }}
                        formatter={(value: number) => [formatPrice(value), 'Price']}
                      />
                      <Area
                        type="monotone"
                        dataKey="price"
                        stroke="#3b82f6"
                        fill="#3b82f6"
                        fillOpacity={0.2}
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Volume Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Volume & Net Flow</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={doneSummaryData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted-foreground))" opacity={0.3} />
                      <XAxis dataKey="time" stroke="hsl(var(--foreground))" tick={{ fill: 'hsl(var(--foreground))' }} />
                      <YAxis stroke="hsl(var(--foreground))" tick={{ fill: 'hsl(var(--foreground))' }} />
                      <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeWidth={1} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px'
                        }}
                        formatter={(value: number, name: string) => [formatNumber(value), name]}
                      />
                      <Bar dataKey="volume" fill="#10b981" opacity={0.7} />
                      <Bar dataKey="netVolume" fill="#f59e0b" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Top Transactions Table */}
            <Card>
              <CardHeader>
                <CardTitle>Top Broker Transactions - {formatDisplayDate(date)}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="text-left py-3 px-4 font-medium">Broker</th>
                        <th className="text-center py-3 px-4 font-medium">Side</th>
                        <th className="text-right py-3 px-4 font-medium">Volume</th>
                        <th className="text-right py-3 px-4 font-medium">Value</th>
                        <th className="text-right py-3 px-4 font-medium">Avg Price</th>
                        <th className="text-right py-3 px-4 font-medium">Frequency</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topTransactionData.map((row, idx) => (
                        <tr key={idx} className="border-b border-border/50 hover:bg-accent/50">
                          <td className="py-3 px-4 font-medium">{row.broker}</td>
                          <td className="text-center py-3 px-4">
                            <Badge 
                              variant={row.side === 'BUY' ? 'default' : 'destructive'} 
                              className="text-xs"
                            >
                              {row.side}
                            </Badge>
                          </td>
                          <td className="text-right py-3 px-4">{formatNumber(row.volume)}</td>
                          <td className="text-right py-3 px-4">{formatNumber(row.value)}</td>
                          <td className="text-right py-3 px-4">{formatPrice(row.avgPrice)}</td>
                          <td className="text-right py-3 px-4">{row.frequency}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Summary */}
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Total Buy Volume: </span>
                      <span className="font-medium text-green-600">
                        {formatNumber(topTransactionData.filter(t => t.side === 'BUY').reduce((sum, t) => sum + t.volume, 0))}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Total Sell Volume: </span>
                      <span className="font-medium text-red-600">
                        {formatNumber(topTransactionData.filter(t => t.side === 'SELL').reduce((sum, t) => sum + t.volume, 0))}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Net Volume: </span>
                      <span className="font-medium">
                        {formatNumber(
                          topTransactionData.filter(t => t.side === 'BUY').reduce((sum, t) => sum + t.volume, 0) -
                          topTransactionData.filter(t => t.side === 'SELL').reduce((sum, t) => sum + t.volume, 0)
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })}
    </div>
  );
}