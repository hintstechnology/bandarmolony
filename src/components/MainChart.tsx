import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// Sample chart data for different stocks
const stockChartData: Record<string, any[]> = {
  BBRI: [
    { time: "09:00", price: 4600 },
    { time: "10:00", price: 4580 },
    { time: "11:00", price: 4620 },
    { time: "12:00", price: 4650 },
    { time: "13:00", price: 4630 },
    { time: "14:00", price: 4680 },
    { time: "15:00", price: 4650 },
    { time: "16:00", price: 4670 },
  ],
  BBCA: [
    { time: "09:00", price: 9200 },
    { time: "10:00", price: 9180 },
    { time: "11:00", price: 9160 },
    { time: "12:00", price: 9150 },
    { time: "13:00", price: 9140 },
    { time: "14:00", price: 9130 },
    { time: "15:00", price: 9150 },
    { time: "16:00", price: 9125 },
  ],
  BMRI: [
    { time: "09:00", price: 5600 },
    { time: "10:00", price: 5620 },
    { time: "11:00", price: 5640 },
    { time: "12:00", price: 5675 },
    { time: "13:00", price: 5660 },
    { time: "14:00", price: 5680 },
    { time: "15:00", price: 5675 },
    { time: "16:00", price: 5690 },
  ],
  TLKM: [
    { time: "09:00", price: 3600 },
    { time: "10:00", price: 3590 },
    { time: "11:00", price: 3585 },
    { time: "12:00", price: 3580 },
    { time: "13:00", price: 3575 },
    { time: "14:00", price: 3570 },
    { time: "15:00", price: 3580 },
    { time: "16:00", price: 3560 },
  ],
  ASII: [
    { time: "09:00", price: 5100 },
    { time: "10:00", price: 5120 },
    { time: "11:00", price: 5150 },
    { time: "12:00", price: 5200 },
    { time: "13:00", price: 5180 },
    { time: "14:00", price: 5220 },
    { time: "15:00", price: 5200 },
    { time: "16:00", price: 5240 },
  ],
};

const stockInfo: Record<string, { name: string; price: number; change: number; changePercent: number }> = {
  BBRI: {
    name: "Bank Rakyat Indonesia",
    price: 4650,
    change: 50,
    changePercent: 1.09,
  },
  BBCA: {
    name: "Bank Central Asia",
    price: 9150,
    change: -25,
    changePercent: -0.27,
  },
  BMRI: {
    name: "Bank Mandiri",
    price: 5675,
    change: 75,
    changePercent: 1.34,
  },
  TLKM: {
    name: "Telkom Indonesia",
    price: 3580,
    change: -20,
    changePercent: -0.56,
  },
  ASII: {
    name: "Astra International",
    price: 5200,
    change: 100,
    changePercent: 1.96,
  },
};

interface MainChartProps {
  selectedStock: string;
}

export function MainChart({ selectedStock }: MainChartProps) {
  const chartData = stockChartData[selectedStock] || stockChartData.BBRI;
  const info = stockInfo[selectedStock] || stockInfo.BBRI;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{selectedStock} - {info.name}</CardTitle>
        <div className="flex items-center gap-4">
          <span className="text-2xl font-bold text-card-foreground">
            {info.price.toLocaleString()}
          </span>
          <span className={`font-medium ${info.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {info.change >= 0 ? '+' : ''}{info.change} ({info.change >= 0 ? '+' : ''}{info.changePercent}%)
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
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
            <Line 
              type="monotone" 
              dataKey="price" 
              stroke={info.change >= 0 ? "hsl(var(--chart-1))" : "hsl(var(--destructive))"} 
              strokeWidth={2}
              dot={{ fill: info.change >= 0 ? "hsl(var(--chart-1))" : "hsl(var(--destructive))" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}