import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { ChevronDown } from 'lucide-react';

interface PriceData {
  price: number;
  bFreq: number;
  bLot: number;
  sLot: number;
  sFreq: number;
  tFreq: number;
  tLot: number;
}

interface DoneSummaryProps {
  selectedStock?: string;
}

// Generate realistic price data for today based on stock
const generateTodayPriceData = (stock: string): PriceData[] => {
  const basePrice = stock === 'BBRI' ? 4150 : stock === 'BBCA' ? 2750 : stock === 'BMRI' ? 3200 : 1500;
  
  // Create a seed based on stock and today's date for consistent data
  const today = new Date().toISOString().split('T')[0];
  const seed = stock.charCodeAt(0) + today.split('-').reduce((acc, part) => acc + parseInt(part), 0);
  
  const data: PriceData[] = [];
  
  // Generate 8-12 price levels around base price
  for (let i = -6; i <= 6; i++) {
    const price = basePrice + (i * 10);
    const priceSeed = seed + i * 100;
    
    // Skip some prices based on seed (consistent skipping)
    if ((priceSeed % 10) > 2) { // 70% chance of having data
      const bLot = (priceSeed * 123) % 50000000;
      const sLot = (priceSeed * 456) % 50000000;
      const bFreq = (priceSeed * 789) % 5000;
      const sFreq = (priceSeed * 321) % 5000;
      
      data.push({
        price,
        bFreq,
        bLot,
        sLot,
        sFreq,
        tFreq: bFreq + sFreq,
        tLot: bLot + sLot
      });
    }
  }
  
  return data.sort((a, b) => b.price - a.price); // Sort by price descending
};

const formatNumber = (num: number): string => {
  return num.toLocaleString();
};

// Helper function to find max values for highlighting
const findMaxValues = (data: PriceData[]) => {
  return {
    maxBLot: Math.max(...data.map(d => d.bLot)),
    maxSLot: Math.max(...data.map(d => d.sLot)),
    maxBFreq: Math.max(...data.map(d => d.bFreq)),
    maxSFreq: Math.max(...data.map(d => d.sFreq)),
    maxTFreq: Math.max(...data.map(d => d.tFreq)),
    maxTLot: Math.max(...data.map(d => d.tLot))
  };
};

export function DoneSummary({ selectedStock = 'BBRI' }: DoneSummaryProps) {
  const priceData = generateTodayPriceData(selectedStock);
  const maxValues = findMaxValues(priceData);
  
  return (
    <div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left py-2 px-3 font-medium">Price</th>
                <th className="text-right py-2 px-3 font-medium">BFreq</th>
                <th className="text-right py-2 px-3 font-medium">BLot</th>
                <th className="text-right py-2 px-3 font-medium">SLot</th>
                <th className="text-right py-2 px-3 font-medium">SFreq</th>
                <th className="text-right py-2 px-3 font-medium">TFreq</th>
                <th className="text-right py-2 px-3 font-medium">TLot</th>
              </tr>
            </thead>
            <tbody>
              {priceData.map((row, idx) => (
                <tr key={idx} className="border-b border-border/50 hover:bg-accent/50">
                  <td className="py-2 px-3 font-medium text-foreground">
                    {formatNumber(row.price)}
                  </td>
                  <td className={`text-right py-2 px-3 ${row.bFreq === maxValues.maxBFreq && row.bFreq > 0 ? 'font-bold text-blue-600' : 'text-blue-600'}`}>
                    {formatNumber(row.bFreq)}
                  </td>
                  <td className={`text-right py-2 px-3 ${row.bLot === maxValues.maxBLot && row.bLot > 0 ? 'font-bold text-green-600' : 'text-green-600'}`}>
                    {formatNumber(row.bLot)}
                  </td>
                  <td className={`text-right py-2 px-3 ${row.sLot === maxValues.maxSLot && row.sLot > 0 ? 'font-bold text-red-600' : 'text-red-600'}`}>
                    {formatNumber(row.sLot)}
                  </td>
                  <td className={`text-right py-2 px-3 ${row.sFreq === maxValues.maxSFreq && row.sFreq > 0 ? 'font-bold text-orange-600' : 'text-orange-600'}`}>
                    {formatNumber(row.sFreq)}
                  </td>
                  <td className={`text-right py-2 px-3 ${row.tFreq === maxValues.maxTFreq && row.tFreq > 0 ? 'font-bold text-purple-600' : 'text-purple-600'}`}>
                    {formatNumber(row.tFreq)}
                  </td>
                  <td className={`text-right py-2 px-3 ${row.tLot === maxValues.maxTLot && row.tLot > 0 ? 'font-bold text-indigo-600' : 'text-indigo-600'}`}>
                    {formatNumber(row.tLot)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
    </div>
  );
}