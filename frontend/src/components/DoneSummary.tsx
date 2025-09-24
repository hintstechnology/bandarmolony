import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ChevronDown } from 'lucide-react';

interface PriceData {
  price: number;
  bFreq: number;
  bLot: number;
  sLot: number;
  sFreq: number;
  freq: number;
  lot: number;
  priceColor: 'green' | 'yellow' | 'red';
  sFreqColor: 'green' | 'red';
  bFreqColor: 'green' | 'red';
}

// Sample data based on the image
const priceData: PriceData[] = [
  {
    price: 650,
    bFreq: 0,
    bLot: 0,
    sLot: 43025191,
    sFreq: 8421,
    freq: 8421,
    lot: 43025191,
    priceColor: 'green',
    sFreqColor: 'green',
    bFreqColor: 'red'
  },
  {
    price: 565,
    bFreq: 0,
    bLot: 0,
    sLot: 46255,
    sFreq: 292,
    freq: 292,
    lot: 46255,
    priceColor: 'green',
    sFreqColor: 'green',
    bFreqColor: 'red'
  },
  {
    price: 560,
    bFreq: 669,
    bLot: 267775,
    sLot: 192785,
    sFreq: 762,
    freq: 1431,
    lot: 460560,
    priceColor: 'green',
    sFreqColor: 'green',
    bFreqColor: 'red'
  },
  {
    price: 555,
    bFreq: 1210,
    bLot: 502015,
    sLot: 351699,
    sFreq: 865,
    freq: 2075,
    lot: 853714,
    priceColor: 'yellow',
    sFreqColor: 'red',
    bFreqColor: 'red'
  },
  {
    price: 550,
    bFreq: 1406,
    bLot: 444230,
    sLot: 818031,
    sFreq: 2112,
    freq: 3518,
    lot: 1262261,
    priceColor: 'red',
    sFreqColor: 'green',
    bFreqColor: 'red'
  },
  {
    price: 545,
    bFreq: 3088,
    bLot: 924495,
    sLot: 1423622,
    sFreq: 3108,
    freq: 6196,
    lot: 2348117,
    priceColor: 'red',
    sFreqColor: 'green',
    bFreqColor: 'red'
  },
  {
    price: 540,
    bFreq: 4699,
    bLot: 1271579,
    sLot: 129443,
    sFreq: 140,
    freq: 4839,
    lot: 1401022,
    priceColor: 'red',
    sFreqColor: 'red',
    bFreqColor: 'green'
  },
  {
    price: 535,
    bFreq: 111,
    bLot: 25048,
    sLot: 0,
    sFreq: 0,
    freq: 111,
    lot: 25048,
    priceColor: 'red',
    sFreqColor: 'red',
    bFreqColor: 'red'
  }
];

const formatNumber = (num: number): string => {
  return num.toLocaleString();
};

const getPriceColor = (color: 'green' | 'yellow' | 'red'): string => {
  switch (color) {
    case 'green': return 'text-green-500';
    case 'yellow': return 'text-yellow-500';
    case 'red': return 'text-red-500';
    default: return 'text-foreground';
  }
};

const getFreqColor = (color: 'green' | 'red'): string => {
  switch (color) {
    case 'green': return 'text-green-500';
    case 'red': return 'text-red-500';
    default: return 'text-foreground';
  }
};

export function DoneSummary() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ChevronDown className="w-5 h-5" />
          Done Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 font-medium">Price</th>
                <th className="text-right py-2 font-medium">B Freq</th>
                <th className="text-right py-2 font-medium">B Lot</th>
                <th className="text-right py-2 font-medium">S Lot</th>
                <th className="text-right py-2 font-medium">S Freq</th>
                <th className="text-right py-2 font-medium">Freq</th>
                <th className="text-right py-2 font-medium">Lot</th>
              </tr>
            </thead>
            <tbody>
              {priceData.map((row, idx) => (
                <tr key={idx} className="border-b border-border/50 hover:bg-accent/50">
                  <td className={`py-2 font-medium ${getPriceColor(row.priceColor)}`}>
                    {row.price}
                  </td>
                  <td className={`text-right py-2 ${getFreqColor(row.bFreqColor)}`}>
                    {formatNumber(row.bFreq)}
                  </td>
                  <td className="text-right py-2 text-foreground">
                    {formatNumber(row.bLot)}
                  </td>
                  <td className="text-right py-2 text-foreground">
                    {formatNumber(row.sLot)}
                  </td>
                  <td className={`text-right py-2 ${getFreqColor(row.sFreqColor)}`}>
                    {formatNumber(row.sFreq)}
                  </td>
                  <td className="text-right py-2 text-foreground">
                    {formatNumber(row.freq)}
                  </td>
                  <td className="text-right py-2 text-foreground">
                    {formatNumber(row.lot)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}