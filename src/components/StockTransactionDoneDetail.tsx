import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { Calendar, Plus, X, Grid3X3, Clock, DollarSign, Users } from 'lucide-react';

interface DoneDetailData {
  time: string;
  stock: string;
  broker: string;
  price: number;
  qty: number;
  side: 'B' | 'S';
  btbc: string;
  slsc: string;
  group: string;
}

type ViewMode = 'price' | 'broker' | 'time';

// Sample done detail data
const generateDoneDetailData = (date: string): DoneDetailData[] => {
  const brokers = ['RG', 'MG', 'BR', 'LG', 'CC', 'AT', 'SD', 'UU', 'TG'];
  const times = ['14:15', '14:16', '14:17', '14:18', '14:19', '14:20', '14:21'];
  const prices = [2850, 2855, 2860, 2865];
  
  return Array.from({ length: 50 }, (_, i) => ({
    time: times[Math.floor(Math.random() * times.length)],
    stock: 'WFH',
    broker: brokers[Math.floor(Math.random() * brokers.length)],
    price: prices[Math.floor(Math.random() * prices.length)],
    qty: Math.floor(Math.random() * 100) + 1,
    side: Math.random() > 0.5 ? 'B' : 'S',
    btbc: Math.random() > 0.5 ? 'BT' : 'BC',
    slsc: Math.random() > 0.5 ? 'SL' : 'SC',
    group: Math.floor(Math.random() * 5).toString(),
  }));
};

// Pivot table functions
const createPivotByPrice = (data: DoneDetailData[]) => {
  const pivot: { [key: number]: { [key: string]: { B: number, S: number, total: number } } } = {};
  
  data.forEach(item => {
    if (!pivot[item.price]) pivot[item.price] = {};
    if (!pivot[item.price][item.broker]) {
      pivot[item.price][item.broker] = { B: 0, S: 0, total: 0 };
    }
    
    if (item.side === 'B') {
      pivot[item.price][item.broker].B += item.qty;
    } else {
      pivot[item.price][item.broker].S += item.qty;
    }
    pivot[item.price][item.broker].total += item.qty;
  });
  
  return pivot;
};

const createPivotByBroker = (data: DoneDetailData[]) => {
  const pivot: { [key: string]: { [key: string]: { B: number, S: number, total: number } } } = {};
  
  data.forEach(item => {
    if (!pivot[item.broker]) pivot[item.broker] = {};
    if (!pivot[item.broker][item.time]) {
      pivot[item.broker][item.time] = { B: 0, S: 0, total: 0 };
    }
    
    if (item.side === 'B') {
      pivot[item.broker][item.time].B += item.qty;
    } else {
      pivot[item.broker][item.time].S += item.qty;
    }
    pivot[item.broker][item.time].total += item.qty;
  });
  
  return pivot;
};

const createPivotByTime = (data: DoneDetailData[]) => {
  const pivot: { [key: string]: { [key: number]: { B: number, S: number, total: number } } } = {};
  
  data.forEach(item => {
    if (!pivot[item.time]) pivot[item.time] = {};
    if (!pivot[item.time][item.price]) {
      pivot[item.time][item.price] = { B: 0, S: 0, total: 0 };
    }
    
    if (item.side === 'B') {
      pivot[item.time][item.price].B += item.qty;
    } else {
      pivot[item.time][item.price].S += item.qty;
    }
    pivot[item.time][item.price].total += item.qty;
  });
  
  return pivot;
};

export function StockTransactionDoneDetail() {
  const [selectedDates, setSelectedDates] = useState<string[]>(['2025-07-24', '2025-07-25']);
  const [newDate, setNewDate] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('price');
  const [selectedStock, setSelectedStock] = useState('WFH');

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

  const renderPivotTable = (data: DoneDetailData[], date: string) => {
    switch (viewMode) {
      case 'price':
        const priceData = createPivotByPrice(data);
        const brokers = Array.from(new Set(data.map(d => d.broker))).sort();
        
        return (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-2 px-2 font-medium">Price</th>
                  {brokers.map(broker => (
                    <th key={broker} className="text-center py-2 px-2 font-medium">{broker}</th>
                  ))}
                  <th className="text-right py-2 px-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(priceData).sort((a, b) => Number(b) - Number(a)).map(price => (
                  <tr key={price} className="border-b border-border/50 hover:bg-accent/50">
                    <td className="py-1.5 px-2 font-medium">{price}</td>
                    {brokers.map(broker => {
                      const cell = priceData[Number(price)][broker];
                      return (
                        <td key={broker} className="text-center py-1.5 px-2">
                          {cell ? (
                            <div className="space-y-1">
                              {cell.B > 0 && <div className="text-green-600">B:{cell.B}</div>}
                              {cell.S > 0 && <div className="text-red-600">S:{cell.S}</div>}
                            </div>
                          ) : (
                            <div className="text-muted-foreground">-</div>
                          )}
                        </td>
                      );
                    })}
                    <td className="text-right py-1.5 px-2 font-medium">
                      {Object.values(priceData[Number(price)]).reduce((sum, cell) => sum + cell.total, 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      case 'broker':
        const brokerData = createPivotByBroker(data);
        const times = Array.from(new Set(data.map(d => d.time))).sort();
        
        return (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-2 px-2 font-medium">Broker</th>
                  {times.map(time => (
                    <th key={time} className="text-center py-2 px-2 font-medium">{time}</th>
                  ))}
                  <th className="text-right py-2 px-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(brokerData).sort().map(broker => (
                  <tr key={broker} className="border-b border-border/50 hover:bg-accent/50">
                    <td className="py-1.5 px-2 font-medium">{broker}</td>
                    {times.map(time => {
                      const cell = brokerData[broker][time];
                      return (
                        <td key={time} className="text-center py-1.5 px-2">
                          {cell ? (
                            <div className="space-y-1">
                              {cell.B > 0 && <div className="text-green-600">B:{cell.B}</div>}
                              {cell.S > 0 && <div className="text-red-600">S:{cell.S}</div>}
                            </div>
                          ) : (
                            <div className="text-muted-foreground">-</div>
                          )}
                        </td>
                      );
                    })}
                    <td className="text-right py-1.5 px-2 font-medium">
                      {Object.values(brokerData[broker]).reduce((sum, cell) => sum + cell.total, 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      case 'time':
        const timeData = createPivotByTime(data);
        const prices = Array.from(new Set(data.map(d => d.price))).sort((a, b) => b - a);
        
        return (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-2 px-2 font-medium">Time</th>
                  {prices.map(price => (
                    <th key={price} className="text-center py-2 px-2 font-medium">{price}</th>
                  ))}
                  <th className="text-right py-2 px-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(timeData).sort().map(time => (
                  <tr key={time} className="border-b border-border/50 hover:bg-accent/50">
                    <td className="py-1.5 px-2 font-medium">{time}</td>
                    {prices.map(price => {
                      const cell = timeData[time][price];
                      return (
                        <td key={price} className="text-center py-1.5 px-2">
                          {cell ? (
                            <div className="space-y-1">
                              {cell.B > 0 && <div className="text-green-600">B:{cell.B}</div>}
                              {cell.S > 0 && <div className="text-red-600">S:{cell.S}</div>}
                            </div>
                          ) : (
                            <div className="text-muted-foreground">-</div>
                          )}
                        </td>
                      );
                    })}
                    <td className="text-right py-1.5 px-2 font-medium">
                      {Object.values(timeData[time]).reduce((sum, cell) => sum + cell.total, 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Done Detail Controls</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Stock Selection */}
            <div>
              <label className="text-sm font-medium">Selected Stock:</label>
              <div className="flex gap-2 mt-2">
                <select 
                  value={selectedStock}
                  onChange={(e) => setSelectedStock(e.target.value)}
                  className="px-3 py-2 border border-border rounded-md bg-input-background text-foreground"
                >
                  <option value="WFH">WFH</option>
                  <option value="BBRI">BBRI</option>
                  <option value="BBCA">BBCA</option>
                  <option value="BMRI">BMRI</option>
                </select>
              </div>
            </div>

            {/* View Mode Selection */}
            <div>
              <label className="text-sm font-medium">Pivot View:</label>
              <div className="flex gap-2 mt-2">
                <Button
                  variant={viewMode === 'price' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('price')}
                  className="flex items-center gap-1"
                >
                  <DollarSign className="w-4 h-4" />
                  By Price
                </Button>
                <Button
                  variant={viewMode === 'broker' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('broker')}
                  className="flex items-center gap-1"
                >
                  <Users className="w-4 h-4" />
                  By Broker
                </Button>
                <Button
                  variant={viewMode === 'time' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('time')}
                  className="flex items-center gap-1"
                >
                  <Clock className="w-4 h-4" />
                  By Time
                </Button>
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

      {/* Pivot Tables for Each Date */}
      <div className="space-y-6">
        {selectedDates.map((date) => {
          const doneDetailData = generateDoneDetailData(date);
          
          return (
            <Card key={date}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Grid3X3 className="w-5 h-5" />
                  View Done Detail - {selectedStock} ({formatDisplayDate(date)})
                  <Badge variant="outline" className="ml-2">
                    {viewMode === 'price' ? 'By Price' : 
                     viewMode === 'broker' ? 'By Broker' : 'By Time'}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {renderPivotTable(doneDetailData, date)}
                
                {/* Summary */}
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Total Transactions: </span>
                      <span className="font-medium">{doneDetailData.length}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Total Buy: </span>
                      <span className="font-medium text-green-600">
                        {doneDetailData.filter(d => d.side === 'B').reduce((sum, d) => sum + d.qty, 0)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Total Sell: </span>
                      <span className="font-medium text-red-600">
                        {doneDetailData.filter(d => d.side === 'S').reduce((sum, d) => sum + d.qty, 0)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Net Volume: </span>
                      <span className="font-medium">
                        {doneDetailData.filter(d => d.side === 'B').reduce((sum, d) => sum + d.qty, 0) - 
                         doneDetailData.filter(d => d.side === 'S').reduce((sum, d) => sum + d.qty, 0)}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>Pivot Table Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p><strong>By Price:</strong> Menampilkan distribusi transaksi per harga across brokers</p>
            <p><strong>By Broker:</strong> Menampilkan aktivitas broker per waktu</p>
            <p><strong>By Time:</strong> Menampilkan distribusi harga per waktu</p>
            <p><strong>B:</strong> Buy transactions | <strong>S:</strong> Sell transactions</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}