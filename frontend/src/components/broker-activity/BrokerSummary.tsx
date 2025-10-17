import { getBrokerBackgroundClass, getBrokerTextClass, useDarkMode } from '../../utils/brokerColors';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Calendar, RotateCcw } from 'lucide-react';

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

interface BrokerSummaryProps {
  selectedStock?: string;
}

// Generate realistic broker summary data for today based on stock
const generateTodayBrokerSummaryData = (stock: string): BrokerSummaryData[] => {
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
  ];

  // Create a seed based on stock and today's date for consistent data
  const today = new Date().toISOString().split('T')[0] ?? '';
  // const _seed = stock.charCodeAt(0) + (today.split('-').reduce((acc, part) => acc + parseInt(part), 0)); // Removed unused variable
  
  // Add stock-based variation to simulate broker participation by issuer
  const stockImpact = 0.7 + (seededRandom(stock) * 0.8);
  const dateVariation = new Date(today).getDate() % 5;
  const multiplier = 0.8 + (dateVariation * 0.1);

  const filtered = baseData.filter(row => seededRandom(stock + row.broker) > 0.35);
  
  return filtered.map(row => ({
    ...row,
    nblot: row.nblot * multiplier * stockImpact,
    nbval: row.nbval * multiplier * stockImpact,
    nslot: row.nslot * multiplier * stockImpact,
    nsval: row.nsval * multiplier * stockImpact,
  }));
};

// Deterministic pseudo-random generator based on string seed
const seededRandom = (seed: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0) / 4294967295;
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

const getBrokerRowClass = (broker: string, _data: BrokerSummaryData): string => {
  const isDarkMode = useDarkMode();
  const backgroundClass = getBrokerBackgroundClass(broker, isDarkMode);
  const textClass = getBrokerTextClass(broker, isDarkMode);
  return `${backgroundClass} ${textClass} hover:opacity-80`;
};

export function BrokerSummary({ selectedStock = 'BBRI' }: BrokerSummaryProps) {
  // Date range states (styling and basic functionality copied from BrokerTransaction)
  const todayIso = new Date().toISOString().split('T')[0] ?? '';
  const [startDate, setStartDate] = useState<string>(todayIso);
  const [endDate, setEndDate] = useState<string>(todayIso);
  const [dateRangeMode, setDateRangeMode] = useState<'1day'|'3days'|'1week'|'custom'>('1day');
  const [layoutMode, setLayoutMode] = useState<'horizontal' | 'vertical'>('horizontal');

  // Get trading days (skip weekends)
  const getTradingDays = (count: number): string[] => {
    const dates: string[] = [];
    const today = new Date();
    let currentDate = new Date(today);
    while (dates.length < count) {
      const dow = currentDate.getDay();
      if (dow !== 0 && dow !== 6) {
        dates.push(currentDate.toISOString().split('T')[0]);
      }
      currentDate.setDate(currentDate.getDate() - 1);
      if (dates.length === 0 && currentDate.getTime() < today.getTime() - (30 * 24 * 60 * 60 * 1000)) {
        dates.push(today.toISOString().split('T')[0]);
        break;
      }
    }
    return dates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  };

  const handleDateRangeModeChange = (mode: '1day'|'3days'|'1week'|'custom') => {
    setDateRangeMode(mode);
    if (mode === 'custom') return;
    const count = mode === '1day' ? 1 : mode === '3days' ? 3 : 5;
    const days = getTradingDays(count);
    if (days.length) {
      setStartDate(days[0]);
      setEndDate(days[days.length - 1]);
    }
  };

  // Re-generate data when selected stock changes; date range is for UI control only in this demo
  const brokerData = generateTodayBrokerSummaryData(selectedStock);
  
  return (
    <div className="space-y-6">
      {/* Date Range Selection - styling copied from BrokerTransaction */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Date Range Selection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 md:grid md:grid-cols-2 lg:flex lg:flex-row items-center lg:items-end">
            {/* Date Range */}
            <div className="flex-1 min-w-0 w-full md:col-span-2">
              <label className="block text-sm font-medium mb-2">Date Range:</label>
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-2 w-full">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md bg-input text-foreground text-sm"
                />
                <span className="text-sm text-muted-foreground text-center whitespace-nowrap sm:px-2">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md bg-input text-foreground text-sm"
                />
                <Button size="sm" className="w-auto justify-self-center" onClick={() => { /* hook for future filtering */ }}>
                  Apply
                </Button>
              </div>
            </div>

            {/* Quick Select */}
            <div className="flex-1 min-w-0 w-full">
              <label className="block text-sm font-medium mb-2">Quick Select:</label>
              <div className="flex gap-2">
                <select 
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm"
                  value={dateRangeMode}
                  onChange={(e) => handleDateRangeModeChange(e.target.value as '1day' | '3days' | '1week' | 'custom')}
                >
                  <option value="1day">1 Day</option>
                  <option value="3days">3 Days</option>
                  <option value="1week">1 Week</option>
                  <option value="custom">Custom</option>
                </select>
                {dateRangeMode === 'custom' && (
                  <Button variant="outline" size="sm" onClick={() => { setStartDate(todayIso); setEndDate(todayIso); }}>
                    <RotateCcw className="w-4 h-4 mr-1" />
                    Clear
                  </Button>
                )}
              </div>
            </div>

            {/* Layout Switch (same styling as BrokerTransaction) */}
            <div className="flex-1 min-w-0 w-full lg:w-auto lg:flex-none">
              <label className="block text-sm font-medium mb-2">Layout:</label>
              <div className="flex sm:inline-flex items-center gap-1 border border-border rounded-lg p-1 overflow-x-auto w-full sm:w-auto lg:w-auto">
                <div className="flex items-center gap-1 min-w-max">
                  <Button
                    variant={layoutMode === 'horizontal' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setLayoutMode('horizontal')}
                    className="px-3 py-1 h-8 text-xs"
                  >
                    Horizontal
                  </Button>
                  <Button
                    variant={layoutMode === 'vertical' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setLayoutMode('vertical')}
                    className="px-3 py-1 h-8 text-xs"
                  >
                    Vertical
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

        <div className="overflow-x-auto rounded-md">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left py-2 px-3 font-medium">Broker</th>
                <th className="text-right py-2 px-3 font-medium">NBLot</th>
                <th className="text-right py-2 px-3 font-medium">NBVal</th>
                <th className="text-right py-2 px-3 font-medium">BAvg</th>
                <th className="text-right py-2 px-3 font-medium">Net</th>
              </tr>
            </thead>
            <tbody>
              {brokerData.map((row, idx) => {
                const netPosition = row.nblot + row.nslot;
                return (
                  <tr key={idx} className={`border-b border-border/50 hover:bg-accent/50 ${getBrokerRowClass(row.broker, row)}`}>
                    <td className="py-2 px-3 font-medium">{row.broker}</td>
                    <td className="text-right py-2 px-3 text-green-600">{formatValue(row.nblot)}</td>
                    <td className="text-right py-2 px-3 text-green-600">{formatValue(row.nbval)}</td>
                    <td className="text-right py-2 px-3">{formatValue(row.bavg)}</td>
                    <td className={`text-right py-2 px-3 font-medium ${netPosition >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {netPosition >= 0 ? '+' : ''}{formatValue(netPosition)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
    </div>
  );
}
