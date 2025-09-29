import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { Calendar, Plus, X } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, BarChart, Bar, ComposedChart } from 'recharts';

interface BrokerInventoryData {
  broker: string;
  nblot: number;
  nbval: number;
  bavg: number;
  gross: number;
  net: number;
}

// Top 5 brokers for color coding
const topBrokers = ['LG', 'MG', 'BR', 'RG', 'CC'];

// Sample time series data for broker performance (starting from 0)
const generateTimeSeriesData = () => {
  const timePoints = Array.from({ length: 30 }, (_, i) => i);
  return timePoints.map(point => ({
    time: point,
    LG: point === 0 ? 0 : (Math.random() - 0.5) * 15 + (point * 0.8),
    MG: point === 0 ? 0 : (Math.random() - 0.5) * 12 + (point * 0.6),
    BR: point === 0 ? 0 : (Math.random() - 0.5) * 18 + (point * 0.9),
    RG: point === 0 ? 0 : (Math.random() - 0.5) * 10 + (point * 0.4),
    CC: point === 0 ? 0 : (Math.random() - 0.5) * 14 + (point * 0.7),
    volume: Math.random() * 2000 + 500,
  }));
};

// Sample candlestick data for price chart
const generateCandlestickData = () => {
  return Array.from({ length: 30 }, (_, i) => {
    const open = 2740 + (Math.random() - 0.5) * 20;
    const close = open + (Math.random() - 0.5) * 10;
    const high = Math.max(open, close) + Math.random() * 5;
    const low = Math.min(open, close) - Math.random() * 5;
    return {
      time: i,
      open,
      high,
      low,
      close,
      volume: Math.random() * 1000 + 200,
    };
  });
};

// Sample broker inventory data
const generateBrokerInventoryData = (): BrokerInventoryData[] => [
  { broker: 'LG', nblot: 55.643, nbval: 152.8, bavg: 2746.7, gross: 208.4, net: 12.8 },
  { broker: 'MG', nblot: 55.292, nbval: 146.0, bavg: 2741.6, gross: 201.3, net: 1.0 },
  { broker: 'BR', nblot: 31.651, nbval: 86.7, bavg: 2741.5, gross: 120.4, net: -7.1 },
  { broker: 'RG', nblot: 25.066, nbval: 68.6, bavg: 2741.6, gross: 99.4, net: -6.7 },
  { broker: 'CC', nblot: 23.966, nbval: 65.6, bavg: 2742.0, gross: 89.1, net: 6.1 },
];

const formatNumber = (num: number): string => {
  if (Math.abs(num) >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (Math.abs(num) >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toFixed(num >= 10 ? 0 : num >= 1 ? 1 : 2);
};

const formatValue = (value: number): string => {
  return formatNumber(value);
};

const getBrokerColor = (broker: string): string => {
  const colors = {
    LG: '#3B82F6',
    MG: '#10B981', 
    BR: '#8B5CF6',
    RG: '#F59E0B',
    CC: '#EC4899',
  };
  return colors[broker as keyof typeof colors] || '#6B7280';
};

const getBrokerRowClass = (broker: string): string => {
  if (topBrokers.includes(broker)) {
    const colors = [
      'bg-blue-100 dark:bg-blue-900/20', // LG
      'bg-green-100 dark:bg-green-900/20', // MG  
      'bg-purple-100 dark:bg-purple-900/20', // BR
      'bg-orange-100 dark:bg-orange-900/20', // RG
      'bg-pink-100 dark:bg-pink-900/20', // CC
    ];
    const colorIndex = topBrokers.indexOf(broker);
    return colors[colorIndex];
  }
  return 'hover:bg-accent/50';
};

export function BrokerInventoryPage() {
  const [timeSeriesData] = useState(generateTimeSeriesData());
  const [candlestickData] = useState(generateCandlestickData());
  const brokerInventoryData = generateBrokerInventoryData();

  return (
    <div className="space-y-6">
      {/* Main Chart with Price and Broker Lines */}
      <Card>
        <CardHeader>
          <CardTitle>Broker Inventory Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <ComposedChart data={timeSeriesData.map((item, idx) => ({
              ...item,
              ...candlestickData[idx]
            }))}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="time" className="text-muted-foreground" />
              <YAxis yAxisId="price" orientation="right" className="text-muted-foreground" />
              <YAxis yAxisId="broker" orientation="left" className="text-muted-foreground" />
              <ReferenceLine yAxisId="broker" y={0} stroke="hsl(var(--muted-foreground))" strokeWidth={2} strokeDasharray="5 5" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px'
                }}
              />
              
              {/* Candlestick representation using bars */}
              <Bar yAxisId="price" dataKey="close" fill="hsl(var(--chart-1))" opacity={0.3} />
              
              {/* Broker lines starting from 0 */}
              {topBrokers.map((broker) => (
                <Line
                  key={broker}
                  yAxisId="broker"
                  type="monotone"
                  dataKey={broker}
                  stroke={getBrokerColor(broker)}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  activeDot={{ r: 4 }}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Volume Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Volume Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={timeSeriesData}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="time" className="text-muted-foreground" />
              <YAxis className="text-muted-foreground" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px'
                }}
              />
              <Bar dataKey="volume" fill="hsl(var(--chart-2))" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Big 5 Brokers Gross & Net Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Big 5 Brokers - Gross & Net Inventory Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-3 px-4 font-medium">Broker</th>
                  <th className="text-right py-3 px-4 font-medium">NBLot</th>
                  <th className="text-right py-3 px-4 font-medium">NBVal</th>
                  <th className="text-right py-3 px-4 font-medium">BAvg</th>
                  <th className="text-right py-3 px-4 font-medium">Gross</th>
                  <th className="text-right py-3 px-4 font-medium">Net</th>
                  <th className="text-center py-3 px-4 font-medium">Performance</th>
                </tr>
              </thead>
              <tbody>
                {brokerInventoryData.map((broker, idx) => (
                  <tr 
                    key={idx} 
                    className={`border-b border-border/50 ${getBrokerRowClass(broker.broker)}`}
                  >
                    <td className="py-3 px-4 font-medium flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: getBrokerColor(broker.broker) }}
                      ></div>
                      {broker.broker}
                    </td>
                    <td className="text-right py-3 px-4 text-green-600">
                      {formatValue(broker.nblot)}
                    </td>
                    <td className="text-right py-3 px-4 text-green-600">
                      {formatValue(broker.nbval)}
                    </td>
                    <td className="text-right py-3 px-4">
                      {formatValue(broker.bavg)}
                    </td>
                    <td className="text-right py-3 px-4 font-medium">
                      {formatValue(broker.gross)}
                    </td>
                    <td className={`text-right py-3 px-4 font-medium ${broker.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatValue(broker.net)}
                    </td>
                    <td className="text-center py-3 px-4">
                      <Badge 
                        variant={broker.net >= 0 ? 'default' : 'destructive'} 
                        className="text-xs"
                      >
                        {broker.net >= 0 ? 'POSITIVE' : 'NEGATIVE'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary Stats */}
          <div className="mt-4 pt-4 border-t border-border">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Total Gross: </span>
                <span className="font-medium">
                  {formatValue(brokerInventoryData.reduce((sum, b) => sum + b.gross, 0))}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Total Net: </span>
                <span className={`font-medium ${brokerInventoryData.reduce((sum, b) => sum + b.net, 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatValue(brokerInventoryData.reduce((sum, b) => sum + b.net, 0))}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Avg Performance: </span>
                <span className="font-medium">
                  {(brokerInventoryData.reduce((sum, b) => sum + b.net, 0) / brokerInventoryData.length).toFixed(1)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardHeader>
          <CardTitle>Legend & Controls</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Top 5 Brokers (Line Colors):</label>
              <div className="flex flex-wrap gap-2 mt-2">
                {topBrokers.map((broker) => (
                  <Badge 
                    key={broker} 
                    variant="outline"
                    className="border"
                    style={{ 
                      borderColor: getBrokerColor(broker),
                      color: getBrokerColor(broker)
                    }}
                  >
                    {broker}
                  </Badge>
                ))}
              </div>
            </div>
            
            <div className="text-sm text-muted-foreground">
              <p>• Garis broker dimulai dari titik 0 (zero baseline)</p>
              <p>• Garis horizontal 0 sebagai referensi netral</p>
              <p>• Gross = Total activity volume</p>
              <p>• Net = Buy volume - Sell volume</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}