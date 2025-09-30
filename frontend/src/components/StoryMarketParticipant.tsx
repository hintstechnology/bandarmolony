import React, { useState } from 'react';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';

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

// Mock data untuk money flow
const moneyFlowData = [
  { date: '09:00', moneyFlow: 120, inflow: 800, outflow: 680 },
  { date: '09:30', moneyFlow: 180, inflow: 950, outflow: 770 },
  { date: '10:00', moneyFlow: -60, inflow: 600, outflow: 660 },
  { date: '10:30', moneyFlow: 140, inflow: 850, outflow: 710 },
  { date: '11:00', moneyFlow: 250, inflow: 1100, outflow: 850 },
  { date: '11:30', moneyFlow: 350, inflow: 1300, outflow: 950 },
  { date: '12:00', moneyFlow: 300, inflow: 1200, outflow: 900 },
  { date: '13:00', moneyFlow: 420, inflow: 1400, outflow: 980 },
  { date: '13:30', moneyFlow: 500, inflow: 1500, outflow: 1000 },
  { date: '14:00', moneyFlow: 550, inflow: 1600, outflow: 1050 },
  { date: '14:30', moneyFlow: 600, inflow: 1700, outflow: 1100 },
  { date: '15:00', moneyFlow: 650, inflow: 1800, outflow: 1150 },
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

// Real data from BBCA.csv - using correct percentages from updated CSV
const localStackedDataRaw = [
  { date: '2025-06-30', Corporate: 1.64, FinancialInstitution: 0.33, Individual: 0.57, Insurance: 65.83, MutualFund: 17.53, Others: 10.06, PensionFund: 0.03, SecuritiesCompany: 3.13 },
  { date: '2024-09-30', Corporate: 1.17, FinancialInstitution: 0.02, Individual: 0.58, Insurance: 62.61, MutualFund: 20.16, Others: 10.88, PensionFund: 0.02, SecuritiesCompany: 3.69 },
  { date: '2025-02-28', Corporate: 1.62, FinancialInstitution: 0.37, Individual: 0.59, Insurance: 64.74, MutualFund: 17.78, Others: 10.55, PensionFund: 0.02, SecuritiesCompany: 3.38 },
  { date: '2025-05-28', Corporate: 1.65, FinancialInstitution: 0.34, Individual: 0.56, Insurance: 65.73, MutualFund: 17.85, Others: 9.88, PensionFund: 0.03, SecuritiesCompany: 3.15 },
  { date: '2025-03-27', Corporate: 1.86, FinancialInstitution: 0.03, Individual: 0.55, Insurance: 66.32, MutualFund: 17.26, Others: 9.96, PensionFund: 0.03, SecuritiesCompany: 3.09 },
  { date: '2025-01-31', Corporate: 1.50, FinancialInstitution: 0.03, Individual: 0.60, Insurance: 64.31, MutualFund: 18.30, Others: 10.77, PensionFund: 0.03, SecuritiesCompany: 3.52 },
  { date: '2024-11-29', Corporate: 1.23, FinancialInstitution: 0.02, Individual: 0.59, Insurance: 62.72, MutualFund: 19.70, Others: 11.19, PensionFund: 0.02, SecuritiesCompany: 3.64 },
  { date: '2025-04-30', Corporate: 1.81, FinancialInstitution: 0.13, Individual: 0.55, Insurance: 66.04, MutualFund: 17.44, Others: 9.95, PensionFund: 0.03, SecuritiesCompany: 3.12 },
  { date: '2024-08-30', Corporate: 1.14, FinancialInstitution: 0.02, Individual: 0.64, Insurance: 61.41, MutualFund: 20.37, Others: 11.69, PensionFund: 0.04, SecuritiesCompany: 3.81 },
  { date: '2024-12-30', Corporate: 1.40, FinancialInstitution: 0.02, Individual: 0.60, Insurance: 62.86, MutualFund: 19.45, Others: 11.08, PensionFund: 0.02, SecuritiesCompany: 3.65 },
  { date: '2025-08-29', Corporate: 1.70, FinancialInstitution: 0.31, Individual: 0.55, Insurance: 66.67, MutualFund: 17.92, Others: 8.97, PensionFund: 0.03, SecuritiesCompany: 2.98 },
  { date: '2024-10-31', Corporate: 1.20, FinancialInstitution: 0.02, Individual: 0.61, Insurance: 62.70, MutualFund: 19.71, Others: 11.16, PensionFund: 0.03, SecuritiesCompany: 3.70 },
  { date: '2025-07-31', Corporate: 1.69, FinancialInstitution: 0.32, Individual: 0.55, Insurance: 65.87, MutualFund: 17.87, Others: 9.69, PensionFund: 0.03, SecuritiesCompany: 3.07 },
];

const foreignStackedDataRaw = [
  { date: '2025-06-30', Corporate: 4.60, FinancialInstitution: 5.76, Individual: 0.74, Insurance: 1.48, MutualFund: 45.83, Others: 22.38, PensionFund: 15.60, SecuritiesCompany: 2.31 },
  { date: '2024-09-30', Corporate: 4.03, FinancialInstitution: 6.65, Individual: 0.70, Insurance: 1.39, MutualFund: 44.90, Others: 24.09, PensionFund: 14.43, SecuritiesCompany: 2.40 },
  { date: '2025-02-28', Corporate: 4.08, FinancialInstitution: 5.55, Individual: 0.72, Insurance: 1.44, MutualFund: 45.53, Others: 24.06, PensionFund: 14.92, SecuritiesCompany: 2.29 },
  { date: '2025-05-28', Corporate: 4.61, FinancialInstitution: 5.31, Individual: 0.73, Insurance: 1.43, MutualFund: 46.22, Others: 22.40, PensionFund: 15.74, SecuritiesCompany: 2.25 },
  { date: '2025-03-27', Corporate: 4.58, FinancialInstitution: 5.71, Individual: 0.73, Insurance: 1.44, MutualFund: 45.41, Others: 23.21, PensionFund: 15.20, SecuritiesCompany: 2.30 },
  { date: '2025-01-31', Corporate: 4.15, FinancialInstitution: 5.84, Individual: 0.72, Insurance: 1.42, MutualFund: 45.27, Others: 24.24, PensionFund: 14.71, SecuritiesCompany: 2.26 },
  { date: '2024-11-29', Corporate: 4.17, FinancialInstitution: 6.33, Individual: 0.71, Insurance: 1.35, MutualFund: 44.67, Others: 24.26, PensionFund: 14.71, SecuritiesCompany: 2.41 },
  { date: '2025-04-30', Corporate: 4.57, FinancialInstitution: 5.71, Individual: 0.74, Insurance: 1.40, MutualFund: 46.03, Others: 22.36, PensionFund: 15.40, SecuritiesCompany: 2.34 },
  { date: '2024-08-30', Corporate: 4.03, FinancialInstitution: 6.70, Individual: 0.70, Insurance: 1.36, MutualFund: 44.92, Others: 23.89, PensionFund: 14.57, SecuritiesCompany: 2.39 },
  { date: '2024-12-30', Corporate: 4.15, FinancialInstitution: 6.08, Individual: 0.71, Insurance: 1.38, MutualFund: 45.37, Others: 24.00, PensionFund: 14.62, SecuritiesCompany: 2.31 },
  { date: '2025-08-29', Corporate: 4.70, FinancialInstitution: 6.24, Individual: 0.75, Insurance: 1.33, MutualFund: 44.97, Others: 22.51, PensionFund: 15.45, SecuritiesCompany: 2.57 },
  { date: '2024-10-31', Corporate: 4.05, FinancialInstitution: 6.44, Individual: 0.70, Insurance: 1.34, MutualFund: 44.84, Others: 24.24, PensionFund: 14.62, SecuritiesCompany: 2.41 },
  { date: '2025-07-31', Corporate: 4.72, FinancialInstitution: 5.99, Individual: 0.75, Insurance: 1.33, MutualFund: 45.33, Others: 22.49, PensionFund: 15.39, SecuritiesCompany: 2.55 },
];

const combinedStackedDataRaw = [
  { date: '2025-06-30', Local: 17.94, Foreign: 82.06 },
  { date: '2024-09-30', Local: 13.94, Foreign: 86.06 },
  { date: '2025-02-28', Local: 16.52, Foreign: 83.48 },
  { date: '2025-05-28', Local: 17.09, Foreign: 82.91 },
  { date: '2025-03-27', Local: 17.63, Foreign: 82.37 },
  { date: '2025-01-31', Local: 15.73, Foreign: 84.27 },
  { date: '2024-11-29', Local: 14.91, Foreign: 85.09 },
  { date: '2025-04-30', Local: 17.72, Foreign: 82.28 },
  { date: '2024-08-30', Local: 14.36, Foreign: 85.64 },
  { date: '2024-12-30', Local: 15.20, Foreign: 84.80 },
  { date: '2025-08-29', Local: 19.48, Foreign: 80.52 },
  { date: '2024-10-31', Local: 14.20, Foreign: 85.80 },
  { date: '2025-07-31', Local: 18.99, Foreign: 81.01 },
];

// Sort data by date (oldest to newest)
const localStackedData = localStackedDataRaw.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
const foreignStackedData = foreignStackedDataRaw.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
const combinedStackedData = combinedStackedDataRaw.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

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
      <Card>
        <CardContent className="p-4">
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
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Chart Layout - All components stacked vertically */}
      <div className="space-y-4">
        {/* Price Action Chart */}
        <Card>
          <CardHeader>
            <CardTitle>{selectedStock} - Price Action</CardTitle>
            <p className="text-sm text-muted-foreground">Real-time price movement with volume</p>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <CustomCandlestick data={candlestickData} />
            </div>
          </CardContent>
        </Card>

        {/* Money Flow Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Money Flow Analysis</CardTitle>
            <p className="text-sm text-muted-foreground">Money flow in/out analysis</p>
          </CardHeader>
          <CardContent>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={moneyFlowData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
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
                    formatter={(value, name) => {
                      if (name === 'Money Flow' || name === 'Inflow' || name === 'Outflow') {
                        return [`${value}M`, name];
                      }
                      return [value, name];
                    }}
                  />
                  <Bar dataKey="moneyFlow" fill="#3b82f6" name="Money Flow" />
                  <Line type="monotone" dataKey="inflow" stroke="#22c55e" strokeWidth={2} dot={false} name="Inflow" />
                  <Line type="monotone" dataKey="outflow" stroke="#ef4444" strokeWidth={2} dot={false} name="Outflow" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Volume Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Volume Analysis</CardTitle>
            <p className="text-sm text-muted-foreground">Buy vs Sell volume breakdown</p>
          </CardHeader>
          <CardContent>
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
                    formatter={(value, name) => {
                      if (name === 'Buy Volume' || name === 'Sell Volume') {
                        return [`${value.toLocaleString()}`, name];
                      }
                      return [value, name];
                    }}
                  />
                  <Bar dataKey="buyVolume" stackId="volume" fill="#22c55e" name="Buy Volume" />
                  <Bar dataKey="sellVolume" stackId="volume" fill="#ef4444" name="Sell Volume" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Stacked Bar Charts Section */}
        <div className="space-y-4">
          {/* Local Market Participants Stacked Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Local Market Participants Breakdown</CardTitle>
              <p className="text-sm text-muted-foreground">Local investor types distribution over time</p>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={localStackedData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
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
                      formatter={(value, name) => [`${value}%`, name]}
                    />
                    <Bar dataKey="Corporate" stackId="local" fill="#3b82f6" name="Corporate" />
                    <Bar dataKey="FinancialInstitution" stackId="local" fill="#8b5cf6" name="Financial Institution" />
                    <Bar dataKey="Individual" stackId="local" fill="#10b981" name="Individual" />
                    <Bar dataKey="Insurance" stackId="local" fill="#f59e0b" name="Insurance" />
                    <Bar dataKey="MutualFund" stackId="local" fill="#ef4444" name="Mutual Fund" />
                    <Bar dataKey="Others" stackId="local" fill="#6b7280" name="Others" />
                    <Bar dataKey="PensionFund" stackId="local" fill="#84cc16" name="Pension Fund" />
                    <Bar dataKey="SecuritiesCompany" stackId="local" fill="#f97316" name="Securities Company" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Foreign Market Participants Stacked Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Foreign Market Participants Breakdown</CardTitle>
              <p className="text-sm text-muted-foreground">Foreign investor types distribution over time</p>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={foreignStackedData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
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
                      formatter={(value, name) => [`${value}%`, name]}
                    />
                    <Bar dataKey="Corporate" stackId="foreign" fill="#3b82f6" name="Corporate" />
                    <Bar dataKey="FinancialInstitution" stackId="foreign" fill="#8b5cf6" name="Financial Institution" />
                    <Bar dataKey="Individual" stackId="foreign" fill="#10b981" name="Individual" />
                    <Bar dataKey="Insurance" stackId="foreign" fill="#f59e0b" name="Insurance" />
                    <Bar dataKey="MutualFund" stackId="foreign" fill="#ef4444" name="Mutual Fund" />
                    <Bar dataKey="Others" stackId="foreign" fill="#6b7280" name="Others" />
                    <Bar dataKey="PensionFund" stackId="foreign" fill="#84cc16" name="Pension Fund" />
                    <Bar dataKey="SecuritiesCompany" stackId="foreign" fill="#f97316" name="Securities Company" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Combined Local vs Foreign Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Local vs Foreign Market Comparison</CardTitle>
              <p className="text-sm text-muted-foreground">Total local vs foreign participation over time</p>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={combinedStackedData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
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
                      formatter={(value, name) => [`${value}%`, name]}
                    />
                    <Bar dataKey="Local" stackId="combined" fill="#3b82f6" name="Local" />
                    <Bar dataKey="Foreign" stackId="combined" fill="#f59e0b" name="Foreign" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}