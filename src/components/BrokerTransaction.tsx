import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { Calendar, Plus, X } from 'lucide-react';

interface BrokerData {
  brkCode: string;
  rsVal: number;
  hitLot: number;
  rsFreq: number;
  sAvg: number;
}

// Sample broker transaction data
const generateBrokerData = (date: string): BrokerData[] => [
  { brkCode: 'MG', rsVal: 106.653, hitLot: 14.014, rsFreq: 14.014, sAvg: 1.324 },
  { brkCode: 'CIMB', rsVal: 27.9, hitLot: 169.776, rsFreq: 5.431, sAvg: 1.067 },
  { brkCode: 'UOB', rsVal: 69.2, hitLot: 90.661, rsFreq: 360, sAvg: 2.955 },
  { brkCode: 'COIN', rsVal: 6.9, hitLot: 103.766, rsFreq: 16.892, sAvg: 680 },
  { brkCode: 'NH', rsVal: 6.1, hitLot: 26.663, rsFreq: 19, sAvg: 343 },
  { brkCode: 'TRIM', rsVal: 5.9, hitLot: 192.292, rsFreq: 277, sAvg: 303 },
  { brkCode: 'DEWA', rsVal: 3.5, hitLot: 360.518, rsFreq: 234, sAvg: 310 },
  { brkCode: 'BNCA', rsVal: 3.3, hitLot: 3.676, rsFreq: 123, sAvg: 8.093 },
  { brkCode: 'PNLF', rsVal: 2.7, hitLot: 291.203, rsFreq: 1.679, sAvg: 270 },
  { brkCode: 'VRNA', rsVal: 2.6, hitLot: 235.412, rsFreq: 5.104, sAvg: 172 },
  { brkCode: 'SD', rsVal: 2.3, hitLot: 17.099, rsFreq: 161, sAvg: 1.739 },
  { brkCode: 'LMGA', rsVal: 2.3, hitLot: 13.636, rsFreq: 131, sAvg: 1.739 },
  { brkCode: 'DEAL', rsVal: 1.8, hitLot: 10.761, rsFreq: 40, sAvg: 1.570 },
  { brkCode: 'ESA', rsVal: 1.6, hitLot: 20.950, rsFreq: 224, sAvg: 504 },
  { brkCode: 'SSA', rsVal: 1.4, hitLot: 5.159, rsFreq: 23, sAvg: 2.835 },
];

// Sample negative data for sell side
const generateNegativeBrokerData = (date: string): BrokerData[] => [
  { brkCode: 'BREN', rsVal: -19.8, hitLot: -25.571, rsFreq: -1.745, sAvg: 7.743 },
  { brkCode: 'CA', rsVal: -18.3, hitLot: -72.947, rsFreq: -294, sAvg: 2.353 },
  { brkCode: 'PTRO', rsVal: -13.2, hitLot: -34.650, rsFreq: -1.046, sAvg: 5.722 },
  { brkCode: 'TOGA', rsVal: -8.3, hitLot: -78.749, rsFreq: -1.994, sAvg: 1.012 },
  { brkCode: 'CUAN', rsVal: -8.1, hitLot: -52.204, rsFreq: -4.472, sAvg: 1.547 },
  { brkCode: 'AGRO', rsVal: -7.3, hitLot: -37.640, rsFreq: -2.253, sAvg: 1.984 },
  { brkCode: 'PTMR', rsVal: -6.0, hitLot: -160.014, rsFreq: -4, sAvg: 374 },
  { brkCode: 'RHB', rsVal: -4.6, hitLot: -42.400, rsFreq: 106, sAvg: 3.999 },
  { brkCode: 'INCO', rsVal: -4.5, hitLot: -12.265, rsFreq: 261, sAvg: 3.708 },
  { brkCode: 'MAAS', rsVal: -3.8, hitLot: -32.051, rsFreq: -454, sAvg: 1.174 },
];

const formatNumber = (num: number): string => {
  if (Math.abs(num) >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toFixed(num >= 10 ? 0 : num >= 1 ? 1 : 2);
};

const formatValue = (value: number): string => {
  return formatNumber(value);
};

export function BrokerTransaction() {
  const [selectedDates, setSelectedDates] = useState<string[]>(['2025-07-24', '2025-07-25']);
  const [newDate, setNewDate] = useState('');

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
                className="px-3 py-2 border border-border rounded-md bg-input text-foreground"
              />
              <Button onClick={addDate} size="sm">
                <Plus className="w-4 h-4 mr-1" />
                Add Date
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transaction Tables for Each Date */}
      <div className="space-y-6">
        {selectedDates.map((date) => (
          <Card key={date}>
            <CardHeader>
              <CardTitle>Broker Transaction → TOP SUMMARY (IPOT) - {formatDisplayDate(date)}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Buy Side */}
                <div>
                  <div className="mb-4">
                    <h4 className="font-medium text-green-600 mb-2">BUY SIDE</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left py-2 font-medium">BRKCode</th>
                            <th className="text-right py-2 font-medium">RSVal</th>
                            <th className="text-right py-2 font-medium">HitLot</th>
                            <th className="text-right py-2 font-medium">RSFreq</th>
                            <th className="text-right py-2 font-medium">SAvg</th>
                          </tr>
                        </thead>
                        <tbody>
                          {generateBrokerData(date).map((row, idx) => (
                            <tr key={idx} className="border-b border-border/50 hover:bg-accent/50">
                              <td className="py-1.5 font-medium">{row.brkCode}</td>
                              <td className="text-right py-1.5 text-green-600">{formatValue(row.rsVal)}</td>
                              <td className="text-right py-1.5">{formatValue(row.hitLot)}</td>
                              <td className="text-right py-1.5">{formatValue(row.rsFreq)}</td>
                              <td className="text-right py-1.5">{formatValue(row.sAvg)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Sell Side */}
                <div>
                  <div className="mb-4">
                    <h4 className="font-medium text-red-600 mb-2">SELL SIDE</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left py-2 font-medium">BRKCode</th>
                            <th className="text-right py-2 font-medium">RSVal</th>
                            <th className="text-right py-2 font-medium">HitLot</th>
                            <th className="text-right py-2 font-medium">RSFreq</th>
                            <th className="text-right py-2 font-medium">SAvg</th>
                          </tr>
                        </thead>
                        <tbody>
                          {generateNegativeBrokerData(date).map((row, idx) => (
                            <tr key={idx} className="border-b border-border/50 hover:bg-accent/50">
                              <td className="py-1.5 font-medium">{row.brkCode}</td>
                              <td className="text-right py-1.5 text-red-600">{formatValue(row.rsVal)}</td>
                              <td className="text-right py-1.5 text-red-600">{formatValue(row.hitLot)}</td>
                              <td className="text-right py-1.5 text-red-600">{formatValue(row.rsFreq)}</td>
                              <td className="text-right py-1.5">{formatValue(row.sAvg)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              {/* Summary Row */}
              <div className="mt-4 pt-4 border-t border-border">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs font-medium">
                  <div className="text-green-600">
                    Total Buy: RSVal: 131.3B | HitLot: 3.5M | RSFreq: 24,192 | SAvg: 353
                  </div>
                  <div className="text-red-600">
                    Total Sell: RSVal: -177.8B | HitLot: -3.5M | RSFreq: 25,196 | SAvg: 408
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}