import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Search } from 'lucide-react';

// Combined Local vs Foreign data from StoryMarketParticipant.tsx
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
const combinedStackedData = combinedStackedDataRaw.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

interface MarketParticipantProps {
  selectedStock?: string;
}

export function MarketParticipant({ selectedStock = 'BBRI' }: MarketParticipantProps) {
  // Local search state with keyboard navigation
  const [stockInput, setStockInput] = useState<string>(selectedStock);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Example stocks list (can be wired to real list later)
  const stocks = ['BBRI', 'BBCA', 'BMRI', 'BBNI', 'TLKM', 'ASII', 'UNVR', 'GGRM', 'ICBP', 'INDF', 'KLBF', 'ADRO', 'ANTM', 'ITMG', 'PTBA', 'SMGR', 'INTP', 'WIKA', 'WSKT', 'PGAS'];
  const filteredTickers = (stockInput
    ? stocks.filter(s => s.toLowerCase().includes(stockInput.toLowerCase()))
    : stocks).slice(0, 10);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        setHighlightedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-end justify-between">
          <div className="w-full sm:w-auto">
            <label className="block text-sm font-medium mb-2">Stock</label>
            <div className="relative" ref={dropdownRef}>
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={stockInput}
                onChange={(e) => {
                  setStockInput(e.target.value.toUpperCase());
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' && filteredTickers.length) {
                    e.preventDefault();
                    setHighlightedIndex((prev) => (prev + 1) % filteredTickers.length);
                  } else if (e.key === 'ArrowUp' && filteredTickers.length) {
                    e.preventDefault();
                    setHighlightedIndex((prev) => (prev <= 0 ? filteredTickers.length - 1 : prev - 1));
                  } else if (e.key === 'Enter') {
                    if (highlightedIndex >= 0 && filteredTickers[highlightedIndex]) {
                      setStockInput(filteredTickers[highlightedIndex]);
                      setShowDropdown(false);
                      setHighlightedIndex(-1);
                    }
                  } else if (e.key === 'Escape') {
                    setShowDropdown(false);
                    setHighlightedIndex(-1);
                  }
                }}
                placeholder="Enter stock code..."
                className="pl-9 pr-3 py-1 h-10 border border-border rounded-md bg-background text-foreground w-full sm:w-64"
              />
              {showDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                  {filteredTickers.length ? (
                    filteredTickers.map((s, idx) => (
                      <div
                        key={s}
                        className={`px-3 py-2 text-sm cursor-pointer ${idx === highlightedIndex ? 'bg-muted' : 'hover:bg-muted'}`}
                        onMouseEnter={() => setHighlightedIndex(idx)}
                        onMouseLeave={() => setHighlightedIndex(-1)}
                        onClick={() => {
                          setStockInput(s);
                          setShowDropdown(false);
                          setHighlightedIndex(-1);
                        }}
                      >
                        {s}
                      </div>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No stocks found</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Local vs Foreign Market Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={combinedStackedData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
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
  );
}
