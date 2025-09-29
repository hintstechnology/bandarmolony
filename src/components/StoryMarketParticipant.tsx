import React, { useState } from 'react';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart } from 'recharts';
import { Card } from './ui/Card';
import { Button } from './ui/Button';

// Mock data untuk candlestick chart
const candlestickData = [
  { date: '09:00', open: 4620, high: 4650, low: 4610, close: 4640, volume: 15000 },
  { date: '09:30', open: 4640, high: 4680, low: 4630, close: 4670, volume: 18000 },
  { date: '10:00', open: 4670, high: 4690, low: 4650, close: 4660, volume: 12000 },
  { date: '10:30', open: 4660, high: 4675, low: 4640, close: 4655, volume: 14000 },
  { date: '11:00', open: 4655, high: 4670, low: 4645, close: 4665, volume: 16000 },
  { date: '11:30', open: 4665, high: 4690, low: 4660, close: 4685, volume: 20000 },
  { date: '12:00', open: 4685, high: 4700, low: 4680, close: 4695, volume: 22000 },
  { date: '13:00', open: 4695, high: 4720, low: 4690, close: 4710, volume: 25000 },
  { date: '13:30', open: 4710, high: 4730, low: 4705, close: 4725, volume: 28000 },
  { date: '14:00', open: 4725, high: 4740, low: 4720, close: 4735, volume: 30000 },
  { date: '14:30', open: 4735, high: 4750, low: 4730, close: 4745, volume: 32000 },
  { date: '15:00', open: 4745, high: 4760, low: 4740, close: 4755, volume: 35000 },
];

// Mock data untuk volume chart
const volumeData = candlestickData.map(item => ({
  date: item.date,
  volume: item.volume,
  buyVolume: item.volume * 0.6,
  sellVolume: item.volume * 0.4,
}));

// Mock data untuk participant analysis
const participantData = [
  { date: '09:00', domestic: 60, foreign: 25, retail: 15 },
  { date: '09:30', domestic: 58, foreign: 27, retail: 15 },
  { date: '10:00', domestic: 62, foreign: 23, retail: 15 },
  { date: '10:30', domestic: 59, foreign: 26, retail: 15 },
  { date: '11:00', domestic: 61, foreign: 24, retail: 15 },
  { date: '11:30', domestic: 57, foreign: 28, retail: 15 },
  { date: '12:00', domestic: 63, foreign: 22, retail: 15 },
  { date: '13:00', domestic: 55, foreign: 30, retail: 15 },
  { date: '13:30', domestic: 64, foreign: 21, retail: 15 },
  { date: '14:00', domestic: 56, foreign: 29, retail: 15 },
  { date: '14:30', domestic: 60, foreign: 25, retail: 15 },
  { date: '15:00', domestic: 58, foreign: 27, retail: 15 },
];

// Mock data untuk net flows
const netFlowData = [
  { date: '09:00', netFlow: 150, buyFlow: 800, sellFlow: 650 },
  { date: '09:30', netFlow: 220, buyFlow: 950, sellFlow: 730 },
  { date: '10:00', netFlow: -80, buyFlow: 600, sellFlow: 680 },
  { date: '10:30', netFlow: 180, buyFlow: 850, sellFlow: 670 },
  { date: '11:00', netFlow: 320, buyFlow: 1100, sellFlow: 780 },
  { date: '11:30', netFlow: 450, buyFlow: 1300, sellFlow: 850 },
  { date: '12:00', netFlow: 380, buyFlow: 1200, sellFlow: 820 },
  { date: '13:00', netFlow: 520, buyFlow: 1400, sellFlow: 880 },
  { date: '13:30', netFlow: 620, buyFlow: 1500, sellFlow: 880 },
  { date: '14:00', netFlow: 680, buyFlow: 1600, sellFlow: 920 },
  { date: '14:30', netFlow: 750, buyFlow: 1700, sellFlow: 950 },
  { date: '15:00', netFlow: 820, buyFlow: 1800, sellFlow: 980 },
];

// Custom Candlestick component using Line Chart
const CustomCandlestick = ({ data }: { data: any }) => (
  <ResponsiveContainer width="100%" height="100%">
    <LineChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
      <XAxis 
        dataKey="date" 
        axisLine={false}
        tickLine={false}
        tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
      />
      <YAxis 
        axisLine={false}
        tickLine={false}
        tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
        domain={['dataMin - 20', 'dataMax + 20']}
      />
      <Tooltip 
        contentStyle={{
          backgroundColor: 'hsl(var(--popover))',
          border: '1px solid hsl(var(--border))',
          borderRadius: '6px',
          fontSize: '12px'
        }}
        formatter={(value, name) => {
          if (name === 'close') return [`${value}`, 'Close Price'];
          if (name === 'high') return [`${value}`, 'High'];
          if (name === 'low') return [`${value}`, 'Low'];
          if (name === 'open') return [`${value}`, 'Open'];
          return [value, name];
        }}
      />
      <Line 
        type="monotone" 
        dataKey="close" 
        stroke="#3b82f6" 
        strokeWidth={2} 
        dot={{ r: 2, fill: '#3b82f6' }}
        name="Close Price"
      />
      <Line 
        type="monotone" 
        dataKey="high" 
        stroke="#22c55e" 
        strokeWidth={1} 
        dot={false}
        strokeDasharray="2 2"
        name="High"
      />
      <Line 
        type="monotone" 
        dataKey="low" 
        stroke="#ef4444" 
        strokeWidth={1} 
        dot={false}
        strokeDasharray="2 2"
        name="Low"
      />
    </LineChart>
  </ResponsiveContainer>
);

export function StoryMarketParticipant() {
  const [selectedStock, setSelectedStock] = useState('BBRI');
  const [selectedTimeframe, setSelectedTimeframe] = useState('1D');
  const [showHistory, setShowHistory] = useState(false);

  const timeframes = ['1D', '5D', '1M', '3M', '6M', '1Y'];
  const stocks = ['BBRI', 'BBCA', 'BMRI', 'BBNI', 'TLKM', 'ASII', 'UNVR', 'GGRM'];

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
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
              <label className="font-medium">Timeframe:</label>
              <div className="flex gap-1">
                {timeframes.map(tf => (
                  <Button
                    key={tf}
                    variant={selectedTimeframe === tf ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedTimeframe(tf)}
                  >
                    {tf}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="showHistory"
                checked={showHistory}
                onChange={(e) => setShowHistory(e.target.checked)}
                className="rounded border-border"
              />
              <label htmlFor="showHistory" className="font-medium">Sejarah Kebawah Semua</label>
            </div>
          </div>
          
          <Button variant="outline" size="sm">
            📺 Chart Integrated ke TV
          </Button>
        </div>
      </Card>

      {/* Main Chart Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left Column - Main Price Chart */}
        <div className="lg:col-span-2 space-y-4">
          {/* Price Chart */}
          <Card className="p-4">
            <div className="mb-3">
              <h3 className="font-medium">{selectedStock} - Price Action</h3>
              <p className="text-sm text-muted-foreground">Real-time price movement with volume</p>
            </div>
            <div className="h-80">
              <CustomCandlestick data={candlestickData} />
            </div>
          </Card>

          {/* Volume Chart */}
          <Card className="p-4">
            <div className="mb-3">
              <h3 className="font-medium">Volume Analysis</h3>
              <p className="text-sm text-muted-foreground">Buy vs Sell volume breakdown</p>
            </div>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={volumeData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                      fontSize: '12px'
                    }}
                  />
                  <Bar dataKey="buyVolume" stackId="volume" fill="#22c55e" name="Buy Volume" />
                  <Bar dataKey="sellVolume" stackId="volume" fill="#ef4444" name="Sell Volume" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Right Column - Participant Analysis */}
        <div className="space-y-4">
          {/* Market Participant Breakdown */}
          <Card className="p-4">
            <div className="mb-3">
              <h3 className="font-medium">Market Participants</h3>
              <p className="text-sm text-muted-foreground">Investor type breakdown</p>
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={participantData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                      fontSize: '11px'
                    }}
                  />
                  <Area dataKey="domestic" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} name="Domestic" />
                  <Area dataKey="foreign" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.6} name="Foreign" />
                  <Area dataKey="retail" stackId="1" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.6} name="Retail" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Net Flow Analysis */}
          <Card className="p-4">
            <div className="mb-3">
              <h3 className="font-medium">Net Flow Analysis</h3>
              <p className="text-sm text-muted-foreground">Money flow in/out</p>
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={netFlowData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                      fontSize: '11px'
                    }}
                  />
                  <Bar dataKey="netFlow" fill={(entry: any) => entry.netFlow > 0 ? '#22c55e' : '#ef4444'} name="Net Flow" />
                  <Line type="monotone" dataKey="buyFlow" stroke="#22c55e" strokeWidth={2} dot={false} name="Buy Flow" />
                  <Line type="monotone" dataKey="sellFlow" stroke="#ef4444" strokeWidth={2} dot={false} name="Sell Flow" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Quick Stats */}
          <Card className="p-4">
            <h3 className="font-medium mb-3">Today's Summary</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Total Volume:</span>
                <span className="font-medium">2.4M</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Net Foreign:</span>
                <span className="font-medium text-green-600">+1.2B</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Retail %:</span>
                <span className="font-medium">15.2%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Avg Price:</span>
                <span className="font-medium">4,685</span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Historical Data Section (kondisional) */}
      {showHistory && (
        <Card className="p-4">
          <h3 className="font-medium mb-3">Historical Market Participant Data</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-2">Date</th>
                  <th className="text-right p-2">Price</th>
                  <th className="text-right p-2">Volume</th>
                  <th className="text-right p-2">Domestic %</th>
                  <th className="text-right p-2">Foreign %</th>
                  <th className="text-right p-2">Retail %</th>
                  <th className="text-right p-2">Net Flow</th>
                </tr>
              </thead>
              <tbody>
                {participantData.slice(-7).map((row, index) => (
                  <tr key={index} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="p-2">{row.date}</td>
                    <td className="p-2 text-right">4,{650 + index * 10}</td>
                    <td className="p-2 text-right">{(15000 + index * 3000).toLocaleString()}</td>
                    <td className="p-2 text-right">{row.domestic}%</td>
                    <td className="p-2 text-right">{row.foreign}%</td>
                    <td className="p-2 text-right">{row.retail}%</td>
                    <td className="p-2 text-right">
                      <span className={netFlowData[index]?.netFlow > 0 ? 'text-green-600' : 'text-red-600'}>
                        {netFlowData[index]?.netFlow > 0 ? '+' : ''}{netFlowData[index]?.netFlow}M
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}