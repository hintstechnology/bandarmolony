import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Calendar, Plus, X, TrendingUp, TrendingDown } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, ComposedChart, Area, AreaChart, ReferenceLine, Cell } from 'recharts';

interface BrokerSummaryData {
  broker: string;
  nblot: number;
  nbval: number;
  bavg: number;
  sl: number;
  nslot: number;
  nsval: number;
  savg: number;
}

// Top 5 brokers for color coding
const topBrokers = ['LG', 'MG', 'BR', 'RG', 'CC'];

// Sample broker summary data with variations by date
const generateBrokerSummaryData = (date: string): BrokerSummaryData[] => {
  const baseData = [
    { broker: 'LG', nblot: 55.643, nbval: 152.8, bavg: 2746.7, sl: 2, nslot: -42.843, nsval: -117.6, savg: 2741.4 },
    { broker: 'MG', nblot: 55.292, nbval: 146.0, bavg: 2741.6, sl: 2, nslot: -54.306, nsval: -149.0, savg: 3730.7 },
    { broker: 'BR', nblot: 31.651, nbval: 86.7, bavg: 2741.5, sl: 3, nslot: -33.653, nsval: -93.8, savg: 2740.8 },
    { broker: 'RG', nblot: 25.066, nbval: 68.6, bavg: 2741.6, sl: 4, nslot: -31.840, nsval: -87.3, savg: 2741.3 },
    { broker: 'CC', nblot: 23.966, nbval: 65.6, bavg: 2742.0, sl: 5, nslot: -21.711, nsval: -59.5, savg: 2741.0 },
    { broker: 'AT', nblot: 11.454, nbval: 31.3, bavg: 2740.7, sl: 7, nslot: -19.538, nsval: -53.4, savg: 2740.7 },
    { broker: 'SD', nblot: 9.599, nbval: 26.2, bavg: 2739.5, sl: 8, nslot: -10.251, nsval: -28.0, savg: 2738.4 },
    { broker: 'MQ', nblot: 9.000, nbval: 24.6, bavg: 2740.9, sl: 9, nslot: -14.121, nsval: -38.6, savg: 2731.4 },
    { broker: 'UU', nblot: 5.549, nbval: 24.0, bavg: 2742.7, sl: 10, nslot: -4.758, nsval: -13.0, savg: 2741.6 },
    { broker: 'UQ', nblot: 6.175, nbval: 16.9, bavg: 2738.1, sl: 11, nslot: -3.347, nsval: -9.1, savg: 2740.2 },
    { broker: 'TG', nblot: 6.594, nbval: 17.6, bavg: 2741.5, sl: 12, nslot: -4.434, nsval: -12.1, savg: 2740.5 },
    { broker: 'PG', nblot: 5.503, nbval: 16.0, bavg: 2739.1, sl: 13, nslot: -2.354, nsval: -6.4, savg: 2740.5 },
    { broker: 'NI', nblot: 6.578, nbval: 15.8, bavg: 2741.4, sl: 14, nslot: -2.000, nsval: -5.5, savg: 2740.9 },
    { broker: 'SN', nblot: 6.888, nbval: 14.9, bavg: 2742.1, sl: 14, nslot: -439, nsval: -1.2, savg: 2740.9 },
    { broker: 'NR', nblot: 6.000, nbval: 14.9, bavg: 2740.6, sl: 16, nslot: -1.057, nsval: -2.9, savg: 2738.8 },
  ];

  // Add date-based variation to make it more realistic
  const dateVariation = new Date(date).getDate() % 5;
  const multiplier = 0.8 + (dateVariation * 0.1);
  
  return baseData.map(row => ({
    ...row,
    nblot: row.nblot * multiplier,
    nbval: row.nbval * multiplier,
    nslot: row.nslot * multiplier,
    nsval: row.nsval * multiplier,
  }));
};

// Generate multi-day chart data for top 5 brokers
const generateMultiDayChartData = (dates: string[]) => {
  return dates.map(date => {
    const data = generateBrokerSummaryData(date);
    const result: any = {
      date: new Date(date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }),
      dateObj: date
    };
    
    // Add top 5 broker data
    topBrokers.forEach(broker => {
      const brokerData = data.find(d => d.broker === broker);
      if (brokerData) {
        result[`${broker}_buy`] = brokerData.nblot;
        result[`${broker}_sell`] = Math.abs(brokerData.nslot);
        result[`${broker}_net`] = brokerData.nblot + brokerData.nslot;
      }
    });
    
    return result;
  });
};

const formatNumber = (num: number): string => {
  if (Math.abs(num) >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toFixed(num >= 10 ? 0 : num >= 1 ? 1 : 2);
};

const formatValue = (value: number): string => {
  return formatNumber(value);
};

const getBrokerRowClass = (broker: string, data: BrokerSummaryData): string => {
  if (topBrokers.includes(broker)) {
    const colorIndex = topBrokers.indexOf(broker);
    // Enhanced highlighting for buy-dominant brokers
    const isBuyDominant = data.nblot > Math.abs(data.nslot);
    
    if (isBuyDominant) {
      const buyIntensityColors = [
        'bg-blue-200 border-l-4 border-l-blue-500 dark:bg-blue-900/30', // LG
        'bg-green-200 border-l-4 border-l-green-500 dark:bg-green-900/30', // MG  
        'bg-purple-200 border-l-4 border-l-purple-500 dark:bg-purple-900/30', // BR
        'bg-orange-200 border-l-4 border-l-orange-500 dark:bg-orange-900/30', // RG
        'bg-pink-200 border-l-4 border-l-pink-500 dark:bg-pink-900/30', // CC
      ];
      return buyIntensityColors[colorIndex];
    } else {
      const normalColors = [
        'bg-blue-100 dark:bg-blue-900/20', // LG
        'bg-green-100 dark:bg-green-900/20', // MG  
        'bg-purple-100 dark:bg-purple-900/20', // BR
        'bg-orange-100 dark:bg-orange-900/20', // RG
        'bg-pink-100 dark:bg-pink-900/20', // CC
      ];
      return normalColors[colorIndex];
    }
  }
  return 'hover:bg-accent/50';
};

const getBrokerColors = () => ({
  LG: '#3B82F6',
  MG: '#10B981',
  BR: '#8B5CF6',
  RG: '#F59E0B',
  CC: '#EC4899'
});

export function BrokerSummaryPage() {
  const [selectedDates, setSelectedDates] = useState<string[]>(['2025-07-24', '2025-07-25', '2025-07-26']);
  const [newDate, setNewDate] = useState('');
  const [chartView, setChartView] = useState<'trends' | 'comparison'>('trends');

  const addDate = () => {
    if (newDate && !selectedDates.includes(newDate)) {
      const sortedDates = [...selectedDates, newDate].sort();
      setSelectedDates(sortedDates);
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

  const chartData = generateMultiDayChartData(selectedDates.sort());
  const brokerColors = getBrokerColors();

  return (
    <div className="h-screen overflow-hidden">
      <div className="h-full flex flex-col max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex-1 min-h-0 overflow-y-auto space-y-6 py-4 sm:py-6">
          {/* Date Series Selector */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Date Series Selection
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
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

                {/* Legend for Top Brokers */}
                <div className="mt-4">
                  <label className="text-sm font-medium">Top 5 Brokers (Color Coded):</label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {topBrokers.map((broker, index) => {
                      const colors = [
                        'bg-blue-100 border-blue-300 text-blue-800',
                        'bg-green-100 border-green-300 text-green-800',
                        'bg-purple-100 border-purple-300 text-purple-800',
                        'bg-orange-100 border-orange-300 text-orange-800',
                        'bg-pink-100 border-pink-300 text-pink-800',
                      ];
                      return (
                        <Badge key={broker} className={`${colors[index]} border`}>
                          {broker}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Multi-Day Analysis Charts */}
          {selectedDates.length > 1 && (
            <div className="space-y-6">
              {/* Chart Type Toggle */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Multi-Day Analysis</CardTitle>
                    <div className="flex gap-2">
                      <Button
                        variant={chartView === 'trends' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setChartView('trends')}
                      >
                        <TrendingUp className="w-4 h-4 mr-1" />
                        Trends
                      </Button>
                      <Button
                        variant={chartView === 'comparison' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setChartView('comparison')}
                      >
                        <TrendingDown className="w-4 h-4 mr-1" />
                        Net Position
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {chartView === 'trends' ? (
                    <ResponsiveContainer width="100%" height={400}>
                      <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted-foreground))" opacity={0.3} />
                        <XAxis dataKey="date" stroke="hsl(var(--foreground))" tick={{ fill: 'hsl(var(--foreground))' }} />
                        <YAxis stroke="hsl(var(--foreground))" tick={{ fill: 'hsl(var(--foreground))' }} />
                        <Tooltip 
                          formatter={(value: number, name: string) => [
                            formatValue(value),
                            `${name.split('_')[0]} ${name.includes('_net') ? 'Net Position' : name.includes('_buy') ? 'Buy Volume' : 'Sell Volume'}`
                          ]}
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '6px'
                          }}
                        />
                        <Legend />
                        {topBrokers.map((broker) => (
                          <Line 
                            key={`${broker}_net`}
                            type="monotone" 
                            dataKey={`${broker}_net`} 
                            stroke={brokerColors[broker as keyof typeof brokerColors]}
                            strokeWidth={2}
                            name={`${broker} Net`}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <ResponsiveContainer width="100%" height={400}>
                      <BarChart data={chartData} margin={{ top: 20, right: 30, left: 40, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted-foreground))" opacity={0.3} />
                        <XAxis dataKey="date" stroke="hsl(var(--foreground))" tick={{ fill: 'hsl(var(--foreground))' }} />
                        <YAxis stroke="hsl(var(--foreground))" tick={{ fill: 'hsl(var(--foreground))' }} />
                        <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeWidth={2} />
                        <Tooltip 
                          formatter={(value: number, name: string) => [
                            `${value >= 0 ? '+' : ''}${formatValue(value)}`,
                            `${name.split('_')[0]} Net Position`
                          ]}
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '6px'
                          }}
                        />
                        <Legend />
                        {topBrokers.map((broker) => (
                          <Bar 
                            key={`${broker}_net`}
                            dataKey={`${broker}_net`} 
                            fill={brokerColors[broker as keyof typeof brokerColors]}
                            name={`${broker} Net`}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Big 5 Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {topBrokers.map((broker) => {
                  const latestData = chartData[chartData.length - 1];
                  const buyVolume = latestData?.[`${broker}_buy`] || 0;
                  const sellVolume = latestData?.[`${broker}_sell`] || 0;
                  const netPosition = latestData?.[`${broker}_net`] || 0;
                  const isBuyDominant = buyVolume > sellVolume;
                  
                  return (
                    <Card 
                      key={broker} 
                      className={`${isBuyDominant ? 'ring-2 ring-green-200 bg-green-50/50 dark:bg-green-900/10' : 'bg-red-50/50 dark:bg-red-900/10'}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-medium text-lg">{broker}</h3>
                          <div 
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: brokerColors[broker as keyof typeof brokerColors] }}
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-green-600">Buy:</span>
                            <span className="font-medium text-green-600">{formatValue(buyVolume)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-red-600">Sell:</span>
                            <span className="font-medium text-red-600">{formatValue(sellVolume)}</span>
                          </div>
                          <div className="flex justify-between text-sm pt-1 border-t border-border">
                            <span className="text-muted-foreground">Net:</span>
                            <span className={`font-medium ${netPosition >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {netPosition >= 0 ? '+' : ''}{formatValue(netPosition)}
                            </span>
                          </div>
                          
                          {isBuyDominant && (
                            <Badge variant="secondary" className="w-full justify-center bg-green-100 text-green-800 text-xs">
                              Buy Dominant
                            </Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Net Position Bar Charts for Each Date */}
          <div className="space-y-6">
            {selectedDates.map((date) => {
              const dateData = generateBrokerSummaryData(date).map(broker => ({
                ...broker,
                netPosition: broker.nblot + broker.nslot,
                isBig5: topBrokers.includes(broker.broker)
              }));
              
              return (
                <Card key={`chart-${date}`}>
                  <CardHeader>
                    <CardTitle>Net Position Bar Chart - {formatDisplayDate(date)}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Net Position = NBLot - NSLot | Positive = Net Buy, Negative = Net Sell
                    </p>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart 
                        data={dateData} 
                        margin={{ top: 20, right: 30, left: 40, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis dataKey="broker" stroke="hsl(var(--foreground))" tick={{ fill: 'hsl(var(--foreground))' }} />
                        <YAxis stroke="hsl(var(--foreground))" tick={{ fill: 'hsl(var(--foreground))' }} />
                        <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeWidth={2} />
                        <Tooltip 
                          formatter={(value: number) => [
                            `${value >= 0 ? '+' : ''}${formatValue(value)}`,
                            value >= 0 ? "Net Buy" : "Net Sell"
                          ]}
                          labelFormatter={(label) => `Broker: ${label}`}
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '6px'
                          }}
                        />
                        <Bar dataKey="netPosition" name="netPosition">
                          {dateData.map((entry, index) => {
                            let fillColor = entry.netPosition >= 0 ? '#10B981' : '#EF4444';
                            
                            // Enhanced colors for Big 5 brokers
                            if (entry.isBig5) {
                              const brokerColorMap = brokerColors as any;
                              fillColor = brokerColorMap[entry.broker] || fillColor;
                            }
                            
                            return (
                              <Cell 
                                key={`cell-${index}`} 
                                fill={fillColor}
                                stroke={entry.isBig5 ? fillColor : 'none'}
                                strokeWidth={entry.isBig5 ? 2 : 0}
                              />
                            );
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    
                    {/* Chart Legend */}
                    <div className="flex items-center justify-center gap-6 pt-4 border-t border-border flex-wrap">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-green-500 rounded"></div>
                        <span className="text-xs text-muted-foreground">Net Buy (Positive)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-red-500 rounded"></div>
                        <span className="text-xs text-muted-foreground">Net Sell (Negative)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 border-2 border-blue-500 rounded"></div>
                        <span className="text-xs text-muted-foreground">Big 5 Broker (Enhanced Color)</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Summary Tables for Each Date */}
          <div className="space-y-6">
            {selectedDates.map((date) => (
              <Card key={date}>
                <CardHeader>
                  <CardTitle>Activity Summary (WIFI → Broker) - {formatDisplayDate(date)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          <th className="text-left py-2 px-2 font-medium">NBY</th>
                          <th className="text-right py-2 px-2 font-medium">NBLot</th>
                          <th className="text-right py-2 px-2 font-medium">NBVal</th>
                          <th className="text-right py-2 px-2 font-medium">BAvg</th>
                          <th className="text-right py-2 px-2 font-medium">#</th>
                          <th className="text-right py-2 px-2 font-medium">NSL</th>
                          <th className="text-right py-2 px-2 font-medium">NSLot</th>
                          <th className="text-right py-2 px-2 font-medium">NSVal</th>
                          <th className="text-right py-2 px-2 font-medium">SAvg</th>
                        </tr>
                      </thead>
                      <tbody>
                        {generateBrokerSummaryData(date).map((row, idx) => (
                          <tr 
                            key={idx} 
                            className={`border-b border-border/50 ${getBrokerRowClass(row.broker, row)}`}
                          >
                            <td className="py-1.5 px-2 font-medium">{row.broker}</td>
                            <td className="text-right py-1.5 px-2 text-green-600">{formatValue(row.nblot)}</td>
                            <td className="text-right py-1.5 px-2 text-green-600">{formatValue(row.nbval)}</td>
                            <td className="text-right py-1.5 px-2">{formatValue(row.bavg)}</td>
                            <td className="text-right py-1.5 px-2">{row.sl}</td>
                            <td className="text-right py-1.5 px-2">{row.broker}</td>
                            <td className="text-right py-1.5 px-2 text-red-600">{formatValue(row.nslot)}</td>
                            <td className="text-right py-1.5 px-2 text-red-600">{formatValue(row.nsval)}</td>
                            <td className="text-right py-1.5 px-2">{formatValue(row.savg)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Enhanced Summary Row */}
                  <div className="mt-4 pt-4 border-t border-border">
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="font-medium text-green-600">Total Buy: </span>
                        <span className="text-muted-foreground">NBLot: 589.6 | NBVal: 1.6B</span>
                      </div>
                      <div>
                        <span className="font-medium text-red-600">Total Sell: </span>
                        <span className="text-muted-foreground">NSLot: -500.1 | NSVal: -1.4B</span>
                      </div>
                    </div>
                    <div className="mt-2 text-xs">
                      <span className="font-medium">Net Position: </span>
                      <span className="text-green-600">+89.5 lots | +200M value</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}