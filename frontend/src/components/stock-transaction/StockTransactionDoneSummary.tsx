import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { ChevronDown, Calendar, Search, Loader2 } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { api } from '../../services/api';
import { STOCK_LIST, loadStockList, searchStocks } from '../../data/stockList';

interface PriceData {
  price: number;
  bFreq: number;
  bLot: number;
  bOrd: number;
  sLot: number;
  sFreq: number;
  sOrd: number;
  tFreq: number;
  tLot: number;
  tOrd: number;
}




// Generate realistic price data based on BBRI.csv structure (DEPRECATED - using real data now)
/*
const generatePriceData = (stock: string, date: string): PriceData[] => {
  const basePrice = stock === 'BBRI' ? 4150 : stock === 'BBCA' ? 2750 : stock === 'BMRI' ? 3200 : 1500;
  
  // Create a seed based on stock and date for consistent data
  const seed = stock.charCodeAt(0) + date.split('-').reduce((acc, part) => acc + parseInt(part), 0);
  
  const data: PriceData[] = [];
  
  // Generate 15-20 price levels around base price
  for (let i = -10; i <= 10; i++) {
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
*/


const formatNumber = (num: number): string => {
  return num.toLocaleString();
};

// Format number with K, M, B abbreviations
const formatNumberWithAbbreviation = (num: number): string => {
  if (num === 0) return '0';

  const absNum = Math.abs(num);
  const sign = num < 0 ? '-' : '';

  if (absNum >= 1e9) {
    return sign + (absNum / 1e9).toFixed(1) + 'B';
  } else if (absNum >= 1e6) {
    // User Request: Use K for millions, e.g. 11,111,111 -> 11,111K
    const valInK = absNum / 1000;
    return sign + valInK.toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'K';
  } else {
    // User Request: Show full number for thousands (e.g. 1264 -> 1,264)
    return num.toLocaleString();
  }
};

// Format number with K, M, B abbreviations (Specifically for TOTAL row to keep compact format)
const formatNumberWithAbbreviationTotals = (num: number): string => {
  if (num === 0) return '0';

  const absNum = Math.abs(num);
  const sign = num < 0 ? '-' : '';

  if (absNum >= 1e9) {
    return sign + (absNum / 1e9).toFixed(1) + 'B';
  } else if (absNum >= 1e6) {
    return sign + (absNum / 1e6).toFixed(1) + 'M';
  } else if (absNum >= 1e3) {
    return sign + (absNum / 1e3).toFixed(1) + 'K';
  } else {
    return num.toLocaleString();
  }
};

// Format ratio (for BLot/Freq, SLot/Freq, etc.)
const formatRatio = (numerator: number, denominator: number): string => {
  if (denominator === 0 || !denominator) return '-';
  const ratio = numerator / denominator;

  if (ratio >= 1e9) {
    return (ratio / 1e9).toFixed(1) + 'B';
  } else if (ratio >= 1e6) {
    // Consistent with formatNumberWithAbbreviation
    const valInK = ratio / 1000;
    return valInK.toLocaleString('en-US', { maximumFractionDigits: 0 }) + 'K';
  } else {
    return Math.round(ratio).toLocaleString();
  }
};

// Format ratio for Totals (Compact format)
const formatRatioTotals = (numerator: number, denominator: number): string => {
  if (denominator === 0 || !denominator) return '-';
  const ratio = numerator / denominator;
  if (ratio >= 1e6) {
    return (ratio / 1e6).toFixed(0) + 'M';
  } else if (ratio >= 1e3) {
    return (ratio / 1e3).toFixed(1) + 'K';
  } else {
    return Math.round(ratio).toLocaleString();
  }
};



// Helper function to get color class based on comparison
// Returns: 'text-green-500' for greater, 'text-red-500' for smaller, 'text-yellow-500' for equal
const getComparisonColor = (buyValue: number, sellValue: number, isBuy: boolean): string => {
  if (buyValue === sellValue) return 'text-yellow-500';
  if (isBuy) {
    return buyValue > sellValue ? 'text-green-500' : 'text-red-500';
  } else {
    return sellValue > buyValue ? 'text-green-500' : 'text-red-500';
  }
};


// Helper function to calculate totals
const calculateTotals = (data: PriceData[]) => {
  return data.reduce((totals, row) => ({
    bFreq: totals.bFreq + row.bFreq,
    bLot: totals.bLot + row.bLot,
    bOrd: totals.bOrd + row.bOrd,
    sLot: totals.sLot + row.sLot,
    sFreq: totals.sFreq + row.sFreq,
    sOrd: totals.sOrd + row.sOrd,
    tFreq: totals.tFreq + row.tFreq,
    tLot: totals.tLot + row.tLot,
    tOrd: totals.tOrd + row.tOrd
  }), { bFreq: 0, bLot: 0, bOrd: 0, sLot: 0, sFreq: 0, sOrd: 0, tFreq: 0, tLot: 0, tOrd: 0 });
};

// Helper function to get all unique prices across all dates (sorted from highest to lowest)
// Returns prices sorted in descending order
const getAllUniquePrices = (_stock: string, dates: string[], stockPriceDataByDate: { [date: string]: PriceData[] }, ohlcData?: any[]): number[] => {
  const priceSet = new Set<number>();
  let minLow = Infinity;
  let maxHigh = -Infinity;

  // Collect all unique prices from all dates
  dates.forEach(date => {
    const data = stockPriceDataByDate[date] || [];
    data.forEach(item => {
      if (item.price) {
        priceSet.add(item.price);
      }
    });

    // Also include high/low prices from OHLC data if provided
    if (ohlcData) {
      const ohlc = ohlcData.find(row => {
        const rowDate = new Date(row.time * 1000).toISOString().split('T')[0];
        return rowDate === date;
      });
      if (ohlc) {
        if (ohlc.high) {
          priceSet.add(ohlc.high);
          if (ohlc.high > maxHigh) maxHigh = ohlc.high;
        }
        if (ohlc.low) {
          priceSet.add(ohlc.low);
          if (ohlc.low < minLow) minLow = ohlc.low;
        }
        if (ohlc.open) priceSet.add(ohlc.open);
        if (ohlc.close) priceSet.add(ohlc.close);
      }
    }
  });

  // Fill in all price steps between global minLow and maxHigh based on IDX tick rules
  if (minLow !== Infinity && maxHigh !== -Infinity && minLow < maxHigh) {
    let currentPrice = minLow;
    // Safety counter to prevent infinite loops
    let iterations = 0;
    const maxIterations = 5000; // More than enough for any reasonable price range

    while (currentPrice <= maxHigh && iterations < maxIterations) {
      priceSet.add(currentPrice);

      // Determine tick size based on current price range (IDX rules)
      let tick = 1;
      if (currentPrice < 200) tick = 1;
      else if (currentPrice < 500) tick = 2;
      else if (currentPrice < 2000) tick = 5;
      else if (currentPrice < 5000) tick = 10;
      else tick = 25;

      currentPrice += tick;
      iterations++;
    }
  }

  // Convert to array and sort from highest to lowest
  return Array.from(priceSet).sort((a, b) => b - a);
};




// Helper function to get broker data for specific price, broker and date (DEPRECATED - moved inside component)
// const getBrokerDataForPriceBrokerAndDate = (stock: string, date: string, price: number, broker: string, brokerDataByDate: { [date: string]: BrokerBreakdownData[] }): BrokerBreakdownData | null => {
//   const data = brokerDataByDate[date] || [];
//   return data.find(item => item.price === price && item.broker === broker) || null;
// };

// Helper function to get-broker data for specific price, broker and date (DEPRECATED)
/*const getBrokerDataForPriceBrokerAndDate = (stock: string, date: string, price: number, broker: string): BrokerBreakdownData | null => {
  // This function is deprecated and will be replaced with in-component function
  return null;
};*/

// Helper function to get all unique price-broker combinations that have transactions (DEPRECATED - not used anymore)
/*const getAllUniquePriceBrokerCombinations = (stock: string, dates: string[]): Array<{price: number, broker: string}> => {
  const combinations = new Map<string, {price: number, broker: string}>();
  
  // First, collect all possible combinations from all dates
  dates.forEach(date => {
    const data = generateBrokerBreakdownData(stock, date);
    data.forEach(item => {
      const key = `${item.price}-${item.broker}`;
      if (!combinations.has(key)) {
        combinations.set(key, { price: item.price, broker: item.broker });
      }
    });
  });
  
  // Filter out combinations that have no transactions across ALL dates
  const validCombinations = Array.from(combinations.values()).filter(combination => {
    // Check if this combination has at least one non-zero transaction across all dates
    let hasAnyTransaction = false;
    
    for (const date of dates) {
      const data = null; // Deprecated function
      if (data && (
        data.bFreq > 0 || data.bLot > 0 || data.sLot > 0 || 
        data.sFreq > 0 || data.tFreq > 0 || data.tLot > 0
      )) {
        hasAnyTransaction = true;
        break; // Found at least one transaction, this combination is valid
      }
    }
    
    return hasAnyTransaction;
  });
  
  // Additional filtering: Remove combinations that only appear in generateBrokerBreakdownData 
  // but have zero values across all dates
  const finalValidCombinations = validCombinations.filter(combination => {
    let totalTransactions = 0;
    
    for (const date of dates) {
      const data = null; // Deprecated function
      if (data) {
        totalTransactions += data.bFreq + data.bLot + data.sLot + data.sFreq + data.tFreq + data.tLot;
      }
    }
    
    return totalTransactions > 0;
  });
  
  // Sort by price ascending, then by broker
  return finalValidCombinations.sort((a, b) => {
    if (a.price !== b.price) return a.price - b.price;
    return a.broker.localeCompare(b.broker);
  });
};*/

// Helper function to find max values for broker breakdown horizontal layout (DEPRECATED)
/*const findMaxValuesBrokerHorizontal = (stock: string, dates: string[]) => {
  let maxBFreq = 0, maxBLot = 0, maxSLot = 0, maxSFreq = 0, maxTFreq = 0, maxTLot = 0;
  
  dates.forEach(date => {
    const data = generateBrokerBreakdownData(stock, date);
    data.forEach(item => {
      if (item.bFreq > maxBFreq) maxBFreq = item.bFreq;
      if (item.bLot > maxBLot) maxBLot = item.bLot;
      if (item.sLot > maxSLot) maxSLot = item.sLot;
      if (item.sFreq > maxSFreq) maxSFreq = item.sFreq;
      if (item.tFreq > maxTFreq) maxTFreq = item.tFreq;
      if (item.tLot > maxTLot) maxTLot = item.tLot;
    });
  });
  
  return { maxBFreq, maxBLot, maxSLot, maxSFreq, maxTFreq, maxTLot };
};*/

// Get trading days based on count (excluding today)
const getTradingDays = (count: number): string[] => {
  const dates: string[] = [];
  const today = new Date();
  let currentDate = new Date(today);

  // Start from yesterday (exclude today)
  currentDate.setDate(currentDate.getDate() - 1);

  while (dates.length < count) {
    const dayOfWeek = currentDate.getDay();

    // Skip weekends (Saturday = 6, Sunday = 0)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      const dateStr = currentDate.toISOString().split('T')[0];
      if (dateStr) {
        dates.push(dateStr);
      }
    }

    // Go to previous day
    currentDate.setDate(currentDate.getDate() - 1);

    // Safety check
    if (dates.length === 0 && currentDate.getTime() < today.getTime() - (30 * 24 * 60 * 60 * 1000)) {
      const yesterdayStr = new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      if (yesterdayStr) {
        dates.push(yesterdayStr);
      }
      break;
    }
  }

  return dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
};

const getLastThreeTradingDays = (): string[] => {
  return getTradingDays(3);
};

const formatDisplayDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
};

// Page ID for menu preferences
const PAGE_ID = 'stock-transaction-done-summary';

// Interface for user preferences
interface UserPreferences {
  selectedStocks: string[];
  selectedBrokers: string[];
  invFilter: 'F' | 'D' | '';
  boardFilter: 'RG' | 'TN' | 'NG' | '';
  showFrequency: boolean;
  showOrdColumns: boolean;
  startDate?: string;
  endDate?: string;
}

// Import menu preferences service
import { menuPreferencesService } from '../../services/menuPreferences';

// Utility functions for saving/loading preferences (now using cookies)
const loadPreferences = (): Partial<UserPreferences> | null => {
  try {
    const cached = menuPreferencesService.getCachedPreferences(PAGE_ID);
    if (cached) {
      return cached as Partial<UserPreferences>;
    }
  } catch (error) {
    console.warn('Failed to load cached preferences:', error);
  }
  return null;
};

const savePreferences = (prefs: Partial<UserPreferences>) => {
  menuPreferencesService.savePreferences(PAGE_ID, prefs);
};

interface PriceRowProps {
  price: number;
  visibleDates: string[];
  dataByDateMap: Map<string, Map<number, PriceData>>;
  rowTotal: PriceData;
  ohlcData: any[] | undefined;
  showOrdColumns: boolean;
  showFrequency: boolean;
  priceIndex: number;
  totalPrices: number;
}

const PriceRow = React.memo(({
  price,
  visibleDates,
  dataByDateMap,
  rowTotal,
  ohlcData,
  showOrdColumns,
  showFrequency,
  priceIndex,
  totalPrices
}: PriceRowProps) => {
  return (
    <tr className={`hover:bg-accent/50 ${priceIndex === totalPrices - 1 ? 'border-b-2 border-white' : ''}`}>
      {visibleDates.map((date, dateIndex) => {
        const data = dataByDateMap.get(date)?.get(price) || null;

        // Calculate background and wick styling based on OHLC
        let bgClass = '';
        const ohlc = ohlcData?.find(row => {
          const rowDate = new Date(row.time * 1000).toISOString().split('T')[0];
          return rowDate === date;
        });

        if (ohlc) {
          if (ohlc.close >= ohlc.open && price >= ohlc.open && price <= ohlc.close) {
            bgClass = 'bg-green-500/20';
          } else if (ohlc.close < ohlc.open && price >= ohlc.close && price <= ohlc.open) {
            bgClass = 'bg-red-500/20';
          }
        }

        const isWick = ohlc && (
          (price >= ohlc.low && price < Math.min(ohlc.open, ohlc.close)) ||
          (price > Math.max(ohlc.open, ohlc.close) && price <= ohlc.high)
        );
        const wickBorderClassL = isWick ? 'border-l-2 border-gray-500' : '';
        const wickBorderClassR = isWick ? 'border-r-2 border-gray-500' : '';

        let ohlcBorderClass = '';
        let hasBottomOhlcBorder = false;
        let hasTopOhlcBorder = false;
        if (ohlc) {
          if (ohlc.close < ohlc.open) {
            if (price === ohlc.open) { ohlcBorderClass = 'border-t-2 border-t-gray-500'; hasTopOhlcBorder = true; }
            else if (price === ohlc.close) { ohlcBorderClass = 'border-b-2 border-b-gray-500'; hasBottomOhlcBorder = true; }
          } else {
            if (price === ohlc.open && price === ohlc.close) {
              ohlcBorderClass = 'border-t-2 border-t-gray-500 border-b-2 border-b-gray-500';
              hasTopOhlcBorder = true; hasBottomOhlcBorder = true;
            } else if (price === ohlc.open) { ohlcBorderClass = 'border-b-2 border-b-gray-500'; hasBottomOhlcBorder = true; }
            else if (price === ohlc.close) { ohlcBorderClass = 'border-t-2 border-t-gray-500'; hasTopOhlcBorder = true; }
          }
        }

        const cellClass = (align: string, border: string, textColor: string = 'text-white') => {
          let finalBorder = border;
          if (hasBottomOhlcBorder) finalBorder = finalBorder.replace('border-b-2 border-white', '');
          if (hasTopOhlcBorder) finalBorder = finalBorder.replace('border-t-2 border-white', '');
          return `${align} py-[1px] px-[4px] font-bold ${bgClass} ${textColor} ${finalBorder} ${ohlcBorderClass}`;
        };

        if (!data) {
          return (
            <React.Fragment key={date}>
              <td className={`text-center py-[1px] px-[6px] font-bold ${bgClass} text-white ${dateIndex === 0 ? 'border-l-2 border-white' : ''} ${priceIndex === totalPrices - 1 && !hasBottomOhlcBorder ? 'border-b-2 border-white' : ''} ${ohlcBorderClass}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {ohlc && (price < ohlc.low || price > ohlc.high) ? '-' : formatNumber(price)}
              </td>
              {showOrdColumns && (
                <>
                  <td className={cellClass('text-right', priceIndex === totalPrices - 1 ? 'border-b-2 border-white' : '')}>-</td>
                  <td className={cellClass('text-right', priceIndex === totalPrices - 1 ? 'border-b-2 border-white' : '')}>-</td>
                </>
              )}
              {showFrequency && <td className={cellClass('text-right', priceIndex === totalPrices - 1 ? 'border-b-2 border-white' : '')}>-</td>}
              {showFrequency && <td className={cellClass('text-right', priceIndex === totalPrices - 1 ? 'border-b-2 border-white' : '')}>-</td>}
              <td className={cellClass('text-right', `${priceIndex === totalPrices - 1 ? 'border-b-2 border-white' : ''} ${wickBorderClassR}`)}>-</td>
              <td className={cellClass('text-right', `${priceIndex === totalPrices - 1 ? 'border-b-2 border-white' : ''} ${wickBorderClassL}`)}>-</td>
              {showFrequency && <td className={cellClass('text-right', priceIndex === totalPrices - 1 ? 'border-b-2 border-white' : '')}>-</td>}
              {showFrequency && <td className={cellClass('text-right', priceIndex === totalPrices - 1 ? 'border-b-2 border-white' : '')}>-</td>}
              {showOrdColumns && (
                <>
                  <td className={cellClass('text-right', priceIndex === totalPrices - 1 ? 'border-b-2 border-white' : '')}>-</td>
                  <td className={cellClass('text-right', priceIndex === totalPrices - 1 ? 'border-b-2 border-white' : '')}>-</td>
                </>
              )}
              {showFrequency && <td className={cellClass('text-right', priceIndex === totalPrices - 1 ? 'border-b-2 border-white' : '')}>-</td>}
              <td className={cellClass('text-right', `${!showOrdColumns && dateIndex < visibleDates.length - 1 ? 'border-r-[10px] border-r-white' : ''} ${!showOrdColumns && dateIndex === visibleDates.length - 1 ? 'border-r-[10px] border-r-white' : ''} ${priceIndex === totalPrices - 1 ? 'border-b-2 border-white' : ''}`)}>-</td>
              {showOrdColumns && (
                <td className={cellClass('text-right', `${dateIndex < visibleDates.length - 1 ? 'border-r-[10px] border-r-white' : ''} ${dateIndex === visibleDates.length - 1 ? 'border-r-[10px] border-r-white' : ''} ${priceIndex === totalPrices - 1 ? 'border-b-2 border-white' : ''}`)}>-</td>
              )}
            </React.Fragment>
          );
        }

        return (
          <React.Fragment key={date}>
            <td className={`text-center py-[1px] px-[6px] font-bold ${bgClass} text-white ${dateIndex === 0 ? 'border-l-2 border-white' : ''} ${priceIndex === totalPrices - 1 && !hasBottomOhlcBorder ? 'border-b-2 border-white' : ''} ${ohlcBorderClass}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {ohlc && (price < ohlc.low || price > ohlc.high) ? '-' : formatNumber(price)}
            </td>
            {showOrdColumns && (
              <>
                <td className={cellClass('text-right', priceIndex === totalPrices - 1 ? 'border-b-2 border-white' : '', data.bOrd > 0 && data.sOrd > 0 ? getComparisonColor(data.bLot / data.bOrd, data.sLot / data.sOrd, true) : 'text-white')} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatRatio(data.bLot, data.bOrd)}
                </td>
                <td className={cellClass('text-right', priceIndex === totalPrices - 1 ? 'border-b-2 border-white' : '', getComparisonColor(data.bOrd, data.sOrd, true))} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatNumberWithAbbreviation(data.bOrd)}
                </td>
              </>
            )}
            {showFrequency && (
              <td className={cellClass('text-right', priceIndex === totalPrices - 1 ? 'border-b-2 border-white' : '', data.bFreq > 0 && data.sFreq > 0 ? getComparisonColor(data.bLot / data.bFreq, data.sLot / data.sFreq, true) : 'text-white')} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatRatio(data.bLot, data.bFreq)}
              </td>
            )}
            {showFrequency && (
              <td className={cellClass('text-right', priceIndex === totalPrices - 1 ? 'border-b-2 border-white' : '', getComparisonColor(data.bFreq, data.sFreq, true))} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatNumberWithAbbreviation(data.bFreq)}
              </td>
            )}
            <td className={cellClass('text-right', `${priceIndex === totalPrices - 1 && !isWick ? 'border-b-2 border-white' : ''} ${wickBorderClassR}`)} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatNumber(data.bLot)}
            </td>
            <td className={cellClass('text-right', `${priceIndex === totalPrices - 1 && !isWick ? 'border-b-2 border-white' : ''} ${wickBorderClassL}`)} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatNumber(data.sLot)}
            </td>
            {showFrequency && (
              <td className={cellClass('text-right', priceIndex === totalPrices - 1 ? 'border-b-2 border-white' : '', getComparisonColor(data.bFreq, data.sFreq, false))} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatNumberWithAbbreviation(data.sFreq)}
              </td>
            )}
            {showFrequency && (
              <td className={cellClass('text-right', priceIndex === totalPrices - 1 ? 'border-b-2 border-white' : '', data.bFreq > 0 && data.sFreq > 0 ? getComparisonColor(data.bLot / data.bFreq, data.sLot / data.sFreq, false) : 'text-white')} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatRatio(data.sLot, data.sFreq)}
              </td>
            )}
            {showOrdColumns && (
              <>
                <td className={cellClass('text-right', priceIndex === totalPrices - 1 ? 'border-b-2 border-white' : '', getComparisonColor(data.bOrd, data.sOrd, false))} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatNumberWithAbbreviation(data.sOrd)}
                </td>
                <td className={cellClass('text-right', priceIndex === totalPrices - 1 ? 'border-b-2 border-white' : '', data.bOrd > 0 && data.sOrd > 0 ? getComparisonColor(data.bLot / data.bOrd, data.sLot / data.sOrd, false) : 'text-white')} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatRatio(data.sLot, data.sOrd)}
                </td>
              </>
            )}
            {showFrequency && (
              <td className={cellClass('text-right', priceIndex === totalPrices - 1 ? 'border-b-2 border-white' : '')} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatNumberWithAbbreviation(data.tFreq)}
              </td>
            )}
            <td className={cellClass('text-right', `${!showOrdColumns && dateIndex < visibleDates.length - 1 ? 'border-r-[10px] border-r-white' : ''} ${!showOrdColumns && dateIndex === visibleDates.length - 1 ? 'border-r-[10px] border-r-white' : ''} ${priceIndex === totalPrices - 1 ? 'border-b-2 border-white' : ''}`)} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatNumberWithAbbreviation(data.tLot)}
            </td>
            {showOrdColumns && (
              <td className={cellClass('text-right', `${dateIndex < visibleDates.length - 1 ? 'border-r-[10px] border-r-white' : ''} ${dateIndex === visibleDates.length - 1 ? 'border-r-[10px] border-r-white' : ''} ${priceIndex === totalPrices - 1 ? 'border-b-2 border-white' : ''}`)} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatNumberWithAbbreviation(data.tOrd)}
              </td>
            )}
          </React.Fragment>
        );
      })}

      {/* Row Grand Totals */}
      <td className={`text-center py-[1px] px-[5px] font-bold text-white ${visibleDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'} ${priceIndex === totalPrices - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {formatNumber(price)}
      </td>
      {showOrdColumns && (
        <>
          <td className={`text-right py-[1px] px-[5px] font-bold ${rowTotal.bOrd > 0 && rowTotal.sOrd > 0 ? getComparisonColor(rowTotal.bLot / rowTotal.bOrd, rowTotal.sLot / rowTotal.sOrd, true) : 'text-white'} ${priceIndex === totalPrices - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatRatio(rowTotal.bLot, rowTotal.bOrd)}
          </td>
          <td className={`text-right py-[1px] px-[5px] font-bold ${getComparisonColor(rowTotal.bOrd, rowTotal.sOrd, true)} ${priceIndex === totalPrices - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatNumberWithAbbreviation(rowTotal.bOrd)}
          </td>
        </>
      )}
      {showFrequency && (
        <td className={`text-right py-[1px] px-[5px] font-bold ${rowTotal.bFreq > 0 && rowTotal.sFreq > 0 ? getComparisonColor(rowTotal.bLot / rowTotal.bFreq, rowTotal.sLot / rowTotal.sFreq, true) : 'text-white'} ${priceIndex === totalPrices - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
          {formatRatio(rowTotal.bLot, rowTotal.bFreq)}
        </td>
      )}
      {showFrequency && (
        <td className={`text-right py-[1px] px-[5px] font-bold ${getComparisonColor(rowTotal.bFreq, rowTotal.sFreq, true)} ${priceIndex === totalPrices - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
          {formatNumberWithAbbreviation(rowTotal.bFreq)}
        </td>
      )}
      <td className={`text-right py-[1px] px-[5px] font-bold text-white ${priceIndex === totalPrices - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {formatNumber(rowTotal.bLot)}
      </td>
      <td className={`text-right py-[1px] px-[5px] font-bold text-white ${priceIndex === totalPrices - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {formatNumber(rowTotal.sLot)}
      </td>
      {showFrequency && (
        <td className={`text-right py-[1px] px-[5px] font-bold ${getComparisonColor(rowTotal.bFreq, rowTotal.sFreq, false)} ${priceIndex === totalPrices - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
          {formatNumberWithAbbreviation(rowTotal.sFreq)}
        </td>
      )}
      {showFrequency && (
        <td className={`text-right py-[1px] px-[5px] font-bold ${rowTotal.bFreq > 0 && rowTotal.sFreq > 0 ? getComparisonColor(rowTotal.bLot / rowTotal.bFreq, rowTotal.sLot / rowTotal.sFreq, false) : 'text-white'} ${priceIndex === totalPrices - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
          {formatRatio(rowTotal.sLot, rowTotal.sFreq)}
        </td>
      )}
      {showOrdColumns && (
        <>
          <td className={`text-right py-[1px] px-[5px] font-bold ${getComparisonColor(rowTotal.bOrd, rowTotal.sOrd, false)} ${priceIndex === totalPrices - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatNumberWithAbbreviation(rowTotal.sOrd)}
          </td>
          <td className={`text-right py-[1px] px-[5px] font-bold ${rowTotal.bOrd > 0 && rowTotal.sOrd > 0 ? getComparisonColor(rowTotal.bLot / rowTotal.bOrd, rowTotal.sLot / rowTotal.sOrd, false) : 'text-white'} ${priceIndex === totalPrices - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatRatio(rowTotal.sLot, rowTotal.sOrd)}
          </td>
        </>
      )}
      {showFrequency && (
        <td className={`text-right py-[1px] px-[5px] font-bold text-white ${priceIndex === totalPrices - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
          {formatNumberWithAbbreviation(rowTotal.tFreq)}
        </td>
      )}
      <td className={`text-right py-[1px] px-[5px] font-bold text-white ${!showOrdColumns ? 'border-r-2 border-white' : ''} ${priceIndex === totalPrices - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {formatNumberWithAbbreviation(rowTotal.tLot)}
      </td>
      {showOrdColumns && (
        <td className={`text-right py-[1px] px-[7px] font-bold text-white border-r-2 border-white ${priceIndex === totalPrices - 1 ? 'border-b-2 border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
          {formatNumberWithAbbreviation(rowTotal.tOrd)}
        </td>
      )}
    </tr>
  );
});

interface StockSummaryTableProps {
  stock: string;
  visibleDates: string[];
  processedData: any;
  ohlcData: any[] | undefined;
  showOrdColumns: boolean;
  showFrequency: boolean;
  selectedBrokers: string[];
}

const StockSummaryTable = React.memo(({
  stock,
  visibleDates,
  processedData,
  ohlcData,
  showOrdColumns,
  showFrequency,
  selectedBrokers
}: StockSummaryTableProps) => {
  const { allPrices, dataByDateMap, rowTotals, dateTotals, grandTotals } = processedData;

  const baseCols = 4;
  const freqCols = showFrequency ? 5 : 0;
  const ordCols = showOrdColumns ? 5 : 0;
  const colSpan = baseCols + freqCols + ordCols;

  const getBlockWidth = () => {
    let width = 50 + 60 + 60 + 65;
    if (showOrdColumns) width += 55 + 45 + 45 + 50 + 45;
    if (showFrequency) width += 50 + 45 + 45 + 50 + 45;
    return width;
  };

  const blockWidth = getBlockWidth();
  const tableWidth = blockWidth * (visibleDates.length + 1);

  return (
    <Card key={stock}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ChevronDown className="w-5 h-5" />
          {selectedBrokers.length > 0
            ? `${stock} - ${selectedBrokers.join(', ')}`
            : stock}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <div className="px-4 sm:px-0 pb-4 w-fit">
            <div className="mb-2">
              <span className="text-sm font-semibold text-foreground">{stock}</span>
            </div>
            <table className="text-[12px] border-collapse" style={{ tableLayout: 'fixed', width: `${tableWidth}px` }}>
              <colgroup>
                {[...visibleDates, 'TOTAL'].map((_, i) => (
                  <React.Fragment key={i}>
                    <col className="w-[50px]" />
                    {showOrdColumns && (
                      <>
                        <col className="w-[55px]" />
                        <col className="w-[45px]" />
                      </>
                    )}
                    {showFrequency && (
                      <>
                        <col className="w-[50px]" />
                        <col className="w-[45px]" />
                      </>
                    )}
                    <col className="w-[60px]" />
                    <col className="w-[60px]" />
                    {showFrequency && (
                      <>
                        <col className="w-[45px]" />
                        <col className="w-[50px]" />
                      </>
                    )}
                    {showOrdColumns && (
                      <>
                        <col className="w-[45px]" />
                        <col className="w-[50px]" />
                      </>
                    )}
                    {showFrequency && <col className="w-[45px]" />}
                    <col className="w-[65px]" />
                    {showOrdColumns && <col className="w-[45px]" />}
                  </React.Fragment>
                ))}
              </colgroup>
              <thead>
                <tr className="border-t-2 border-white bg-[#3a4252]">
                  {visibleDates.map((date, dateIndex) => (
                    <th key={date} colSpan={colSpan} className={`text-center py-[1px] px-[8.24px] font-bold text-white whitespace-nowrap ${dateIndex === 0 ? 'border-l-2 border-white' : ''} ${dateIndex < visibleDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === visibleDates.length - 1 ? 'border-r-[10px] border-white' : ''}`}>
                      {formatDisplayDate(date)}
                    </th>
                  ))}
                  <th colSpan={colSpan} className={`text-center py-[1px] px-[4.2px] font-bold text-white border-r-2 border-white ${visibleDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`}>
                    Total
                  </th>
                </tr>
                <tr className="bg-[#3a4252]">
                  {visibleDates.map((date, dateIndex) => (
                    <React.Fragment key={date}>
                      <th className={`text-center py-[1px] px-[4px] font-bold text-white whitespace-nowrap ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`}>Price</th>
                      {showOrdColumns && (
                        <>
                          <th className="text-center py-[1px] px-[4px] font-bold text-white whitespace-nowrap">BLot/O</th>
                          <th className="text-center py-[1px] px-[4px] font-bold text-white whitespace-nowrap">BOr</th>
                        </>
                      )}
                      {showFrequency && <th className="text-center py-[1px] px-[4px] font-bold text-white whitespace-nowrap">BLot/F</th>}
                      {showFrequency && <th className="text-center py-[1px] px-[4px] font-bold text-white whitespace-nowrap">BFreq</th>}
                      <th className="text-center py-[1px] px-[4px] font-bold text-white whitespace-nowrap">BLot</th>
                      <th className="text-center py-[1px] px-[4px] font-bold text-white whitespace-nowrap">SLot</th>
                      {showFrequency && <th className="text-center py-[1px] px-[4px] font-bold text-white whitespace-nowrap">SFreq</th>}
                      {showFrequency && <th className="text-center py-[1px] px-[4px] font-bold text-white whitespace-nowrap">SLot/F</th>}
                      {showOrdColumns && (
                        <>
                          <th className="text-center py-[1px] px-[4px] font-bold text-white whitespace-nowrap">SOr</th>
                          <th className="text-center py-[1px] px-[4px] font-bold text-white whitespace-nowrap">SLot/O</th>
                        </>
                      )}
                      {showFrequency && <th className="text-center py-[1px] px-[4px] font-bold text-white whitespace-nowrap">TFreq</th>}
                      <th className={`text-center py-[1px] px-[4px] font-bold text-white whitespace-nowrap ${!showOrdColumns && dateIndex < visibleDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${!showOrdColumns && dateIndex === visibleDates.length - 1 ? 'border-r-[10px] border-white' : ''}`}>TLot</th>
                      {showOrdColumns && (
                        <th className={`text-center py-[1px] px-[4px] font-bold text-white whitespace-nowrap ${dateIndex < visibleDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === visibleDates.length - 1 ? 'border-r-[10px] border-white' : ''}`}>TOr</th>
                      )}
                    </React.Fragment>
                  ))}
                  <th className={`text-center py-[1px] px-[3px] font-bold text-white whitespace-nowrap ${visibleDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`}>Price</th>
                  {showOrdColumns && (
                    <>
                      <th className="text-center py-[1px] px-[3px] font-bold text-white whitespace-nowrap">BLot/O</th>
                      <th className="text-center py-[1px] px-[3px] font-bold text-white whitespace-nowrap">BOr</th>
                    </>
                  )}
                  {showFrequency && <th className="text-center py-[1px] px-[3px] font-bold text-white whitespace-nowrap">BLot/F</th>}
                  {showFrequency && <th className="text-center py-[1px] px-[3px] font-bold text-white whitespace-nowrap">BFreq</th>}
                  <th className="text-center py-[1px] px-[3px] font-bold text-white whitespace-nowrap">BLot</th>
                  <th className="text-center py-[1px] px-[3px] font-bold text-white whitespace-nowrap">SLot</th>
                  {showFrequency && <th className="text-center py-[1px] px-[3px] font-bold text-white whitespace-nowrap">SFreq</th>}
                  {showFrequency && <th className="text-center py-[1px] px-[3px] font-bold text-white whitespace-nowrap">SLot/F</th>}
                  {showOrdColumns && (
                    <>
                      <th className="text-center py-[1px] px-[3px] font-bold text-white whitespace-nowrap">SOr</th>
                      <th className="text-center py-[1px] px-[3px] font-bold text-white whitespace-nowrap">SLot/O</th>
                    </>
                  )}
                  {showFrequency && <th className="text-center py-[1px] px-[3px] font-bold text-white whitespace-nowrap">TFreq</th>}
                  {showOrdColumns ? (
                    <>
                      <th className="text-center py-[1px] px-[3px] font-bold text-white whitespace-nowrap">TLot</th>
                      <th className="text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap border-r-2 border-white">TOr</th>
                    </>
                  ) : (
                    <th className="text-center py-[1px] px-[5px] font-bold text-white whitespace-nowrap border-r-2 border-white">TLot</th>
                  )}
                </tr>
              </thead>
              <tbody className="text-[12px]">
                {allPrices.map((price: number, idx: number) => (
                  <PriceRow
                    key={`${stock}-${price}`}
                    price={price}
                    visibleDates={visibleDates}
                    dataByDateMap={dataByDateMap}
                    rowTotal={rowTotals.get(price)!}
                    stock={stock}
                    ohlcData={ohlcData}
                    showOrdColumns={showOrdColumns}
                    showFrequency={showFrequency}
                    priceIndex={idx}
                    totalPrices={allPrices.length}
                  />
                ))}
                {/* Total Row */}
                <tr className="border-t-2 border-b-2 border-white font-bold">
                  {visibleDates.map((date, dateIndex) => {
                    const totals = dateTotals.get(date);
                    return (
                      <React.Fragment key={date}>
                        <td className={`text-center py-[1px] px-[6px] font-bold text-white ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`}>-</td>
                        {showOrdColumns && (
                          <>
                            <td className={`text-right py-[1px] px-[6px] font-bold ${totals.bOrd > 0 && totals.sOrd > 0 ? getComparisonColor(totals.bLot / totals.bOrd, totals.sLot / totals.sOrd, true) : 'text-white'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {formatRatioTotals(totals.bLot, totals.bOrd)}
                            </td>
                            <td className={`text-right py-[1px] px-[6px] font-bold ${getComparisonColor(totals.bOrd, totals.sOrd, true)}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {formatNumberWithAbbreviationTotals(totals.bOrd)}
                            </td>
                          </>
                        )}
                        {showFrequency && (
                          <td className={`text-right py-[1px] px-[6px] font-bold ${totals.bFreq > 0 && totals.sFreq > 0 ? getComparisonColor(totals.bLot / totals.bFreq, totals.sLot / totals.sFreq, true) : 'text-white'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {formatRatioTotals(totals.bLot, totals.bFreq)}
                          </td>
                        )}
                        {showFrequency && (
                          <td className={`text-right py-[1px] px-[6px] font-bold ${getComparisonColor(totals.bFreq, totals.sFreq, true)}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {formatNumberWithAbbreviationTotals(totals.bFreq)}
                          </td>
                        )}
                        <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatNumberWithAbbreviationTotals(totals.bLot)}</td>
                        <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatNumberWithAbbreviationTotals(totals.sLot)}</td>
                        {showFrequency && (
                          <td className={`text-right py-[1px] px-[6px] font-bold ${getComparisonColor(totals.bFreq, totals.sFreq, false)}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {formatNumberWithAbbreviationTotals(totals.sFreq)}
                          </td>
                        )}
                        {showFrequency && (
                          <td className={`text-right py-[1px] px-[6px] font-bold ${totals.bFreq > 0 && totals.sFreq > 0 ? getComparisonColor(totals.bLot / totals.bFreq, totals.sLot / totals.sFreq, false) : 'text-white'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {formatRatioTotals(totals.sLot, totals.sFreq)}
                          </td>
                        )}
                        {showOrdColumns && (
                          <>
                            <td className={`text-right py-[1px] px-[6px] font-bold ${getComparisonColor(totals.bOrd, totals.sOrd, false)}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {formatNumberWithAbbreviationTotals(totals.sOrd)}
                            </td>
                            <td className={`text-right py-[1px] px-[6px] font-bold ${totals.bOrd > 0 && totals.sOrd > 0 ? getComparisonColor(totals.bLot / totals.bOrd, totals.sLot / totals.sOrd, false) : 'text-white'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {formatRatioTotals(totals.sLot, totals.sOrd)}
                            </td>
                          </>
                        )}
                        {showFrequency && <td className="text-right py-[1px] px-[6px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatNumberWithAbbreviationTotals(totals.tFreq)}</td>}
                        <td className={`text-right py-[1px] px-[6px] font-bold text-white ${!showOrdColumns && dateIndex < visibleDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${!showOrdColumns && dateIndex === visibleDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>{formatNumberWithAbbreviationTotals(totals.tLot)}</td>
                        {showOrdColumns && (
                          <td className={`text-right py-[1px] px-[6px] font-bold text-white ${dateIndex < visibleDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === visibleDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} style={{ fontVariantNumeric: 'tabular-nums' }}>{formatNumberWithAbbreviationTotals(totals.tOrd)}</td>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {/* Grand Total Footer Cells */}
                  <td className={`text-center py-[1px] px-[5px] font-bold text-white ${visibleDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`}>TOTAL</td>
                  {showOrdColumns && (
                    <>
                      <td className={`text-right py-[1px] px-[5px] font-bold ${grandTotals.bOrd > 0 && grandTotals.sOrd > 0 ? getComparisonColor(grandTotals.bLot / grandTotals.bOrd, grandTotals.sLot / grandTotals.sOrd, true) : 'text-white'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatRatioTotals(grandTotals.bLot, grandTotals.bOrd)}
                      </td>
                      <td className={`text-right py-[1px] px-[5px] font-bold ${getComparisonColor(grandTotals.bOrd, grandTotals.sOrd, true)}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatNumberWithAbbreviationTotals(grandTotals.bOrd)}
                      </td>
                    </>
                  )}
                  {showFrequency && (
                    <td className={`text-right py-[1px] px-[5px] font-bold ${grandTotals.bFreq > 0 && grandTotals.sFreq > 0 ? getComparisonColor(grandTotals.bLot / grandTotals.bFreq, grandTotals.sLot / grandTotals.sFreq, true) : 'text-white'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatRatioTotals(grandTotals.bLot, grandTotals.bFreq)}
                    </td>
                  )}
                  {showFrequency && (
                    <td className={`text-right py-[1px] px-[5px] font-bold ${getComparisonColor(grandTotals.bFreq, grandTotals.sFreq, true)}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatNumberWithAbbreviationTotals(grandTotals.bFreq)}
                    </td>
                  )}
                  <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatNumberWithAbbreviationTotals(grandTotals.bLot)}</td>
                  <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatNumberWithAbbreviationTotals(grandTotals.sLot)}</td>
                  {showFrequency && (
                    <td className={`text-right py-[1px] px-[5px] font-bold ${getComparisonColor(grandTotals.bFreq, grandTotals.sFreq, false)}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatNumberWithAbbreviationTotals(grandTotals.sFreq)}
                    </td>
                  )}
                  {showFrequency && (
                    <td className={`text-right py-[1px] px-[5px] font-bold ${grandTotals.bFreq > 0 && grandTotals.sFreq > 0 ? getComparisonColor(grandTotals.bLot / grandTotals.bFreq, grandTotals.sLot / grandTotals.sFreq, false) : 'text-white'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatRatioTotals(grandTotals.sLot, grandTotals.sFreq)}
                    </td>
                  )}
                  {showOrdColumns && (
                    <>
                      <td className={`text-right py-[1px] px-[5px] font-bold ${getComparisonColor(grandTotals.bOrd, grandTotals.sOrd, false)}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatNumberWithAbbreviationTotals(grandTotals.sOrd)}
                      </td>
                      <td className={`text-right py-[1px] px-[5px] font-bold ${grandTotals.bOrd > 0 && grandTotals.sOrd > 0 ? getComparisonColor(grandTotals.bLot / grandTotals.bOrd, grandTotals.sLot / grandTotals.sOrd, false) : 'text-white'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatRatioTotals(grandTotals.sLot, grandTotals.sOrd)}
                      </td>
                    </>
                  )}
                  {showFrequency && <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatNumberWithAbbreviation(grandTotals.tFreq)}</td>}
                  {showOrdColumns ? (
                    <>
                      <td className="text-right py-[1px] px-[5px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatNumberWithAbbreviation(grandTotals.tLot)}</td>
                      <td className={`text-right py-[1px] px-[7px] font-bold text-white border-r-2 border-white`} style={{ fontVariantNumeric: 'tabular-nums' }}>{formatNumberWithAbbreviation(grandTotals.tOrd)}</td>
                    </>
                  ) : (
                    <td className={`text-right py-[1px] px-[7px] font-bold text-white border-r-2 border-white`} style={{ fontVariantNumeric: 'tabular-nums' }}>{formatNumberWithAbbreviation(grandTotals.tLot)}</td>
                  )}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

interface StockTransactionDoneSummaryProps {
  selectedStock?: string;
  disableTickerSelection?: boolean; // When true, only use propSelectedStock and hide ticker selection UI
}

export function StockTransactionDoneSummary({ selectedStock: propSelectedStock, disableTickerSelection = false }: StockTransactionDoneSummaryProps) {
  const { showToast } = useToast();

  // Load preferences from cookies on mount
  const savedPrefs = loadPreferences();

  // Load preferences from cookies on mount
  useEffect(() => {
    const prefs = menuPreferencesService.loadPreferences(PAGE_ID);
    if (prefs['showFrequency'] !== undefined) {
      setShowFrequency(prefs['showFrequency']);
    }
    if (prefs['showOrdColumns'] !== undefined) {
      setShowOrdColumns(prefs['showOrdColumns']);
    }
    if (prefs['invFilter'] !== undefined) {
      setInvFilter(prefs['invFilter']);
    }
    if (prefs['boardFilter'] !== undefined) {
      setBoardFilter(prefs['boardFilter']);
    }
  }, []);

  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [selectedStocks, setSelectedStocks] = useState<string[]>(() => {
    // Try to load from preferences first
    if (savedPrefs?.selectedStocks && savedPrefs.selectedStocks.length > 0) {
      return savedPrefs.selectedStocks;
    }
    // Fallback to prop or default
    if (propSelectedStock) {
      return [propSelectedStock];
    }
    return ['BBCA'];
  });

  // Real data states - changed to store data per stock
  const [priceDataByStockAndDate, setPriceDataByStockAndDate] = useState<{ [stock: string]: { [date: string]: PriceData[] } }>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [_availableDates] = useState<string[]>([]);
  const [shouldFetchData, setShouldFetchData] = useState<boolean>(false);
  const [isDataReady, setIsDataReady] = useState<boolean>(false);

  // OHLC Data for coloring
  interface OhlcRow {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }
  const [ohlcDataByStock, setOhlcDataByStock] = useState<{ [stock: string]: OhlcRow[] }>({});

  // UI states
  const [stockInput, setStockInput] = useState('');
  const [showStockSuggestions, setShowStockSuggestions] = useState(false);
  const [highlightedStockIndex, setHighlightedStockIndex] = useState<number>(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [startDate, setStartDate] = useState(() => {
    // Try to load from preferences first
    if (savedPrefs?.startDate) {
      return savedPrefs.startDate;
    }
    // Fallback to default
    const threeDays = getLastThreeTradingDays();
    if (threeDays.length > 0) {
      const sortedDates = [...threeDays].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      return sortedDates[0];
    }
    return '';
  });
  const [endDate, setEndDate] = useState(() => {
    // Try to load from preferences first
    if (savedPrefs?.endDate) {
      return savedPrefs.endDate;
    }
    // Fallback to default
    const threeDays = getLastThreeTradingDays();
    if (threeDays.length > 0) {
      const sortedDates = [...threeDays].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      return sortedDates[sortedDates.length - 1];
    }
    return '';
  });
  // Broker selection states
  const [brokerInput, setBrokerInput] = useState('');
  const [selectedBrokers, setSelectedBrokers] = useState<string[]>(() => {
    // Try to load from preferences first
    if (savedPrefs?.selectedBrokers && savedPrefs.selectedBrokers.length > 0) {
      return savedPrefs.selectedBrokers;
    }
    // Fallback to empty
    return [];
  });
  const [showBrokerSuggestions, setShowBrokerSuggestions] = useState(false);
  const [highlightedBrokerIndex, setHighlightedBrokerIndex] = useState<number>(-1);
  const [availableBrokers, setAvailableBrokers] = useState<string[]>([]);
  const dropdownBrokerRef = useRef<HTMLDivElement>(null);

  // Filter states - Default: F/D=All, Board=RG
  const [invFilter, setInvFilter] = useState<'F' | 'D' | ''>(() => {
    // Try to load from preferences first
    if (savedPrefs?.invFilter !== undefined) {
      return savedPrefs.invFilter;
    }
    // Fallback to default
    return '';
  }); // Default: All (empty = all)
  const [boardFilter, setBoardFilter] = useState<'RG' | 'TN' | 'NG' | ''>(() => {
    // Try to load from preferences first
    if (savedPrefs?.boardFilter) {
      return savedPrefs.boardFilter;
    }
    // Fallback to default
    return 'RG';
  }); // Default: RG
  const [showFrequency, setShowFrequency] = useState<boolean>(() => {
    // Try to load from preferences first
    if (savedPrefs?.showFrequency !== undefined) {
      return savedPrefs.showFrequency;
    }
    // Fallback to default
    return true;
  }); // Show/hide Frequency columns (BFreq, SFreq, TFreq, BLot/F, SLot/F)
  const [showOrdColumns, setShowOrdColumns] = useState<boolean>(() => {
    // Try to load from preferences first
    if (savedPrefs?.showOrdColumns !== undefined) {
      return savedPrefs.showOrdColumns;
    }
    // Fallback to default
    return true;
  }); // Show/hide Ord columns

  // Menu container ref for responsive layout
  const menuContainerRef = useRef<HTMLDivElement>(null);


  // Helper functions
  const handleStockSelect = (stock: string) => {
    if (disableTickerSelection) {
      // Ignore selection if ticker selection is disabled
      return;
    }
    if (!selectedStocks.includes(stock)) {
      setSelectedStocks([...selectedStocks, stock]);
    }
    setStockInput('');
    setShowStockSuggestions(false);
  };

  const handleRemoveStock = (stock: string) => {
    if (disableTickerSelection) {
      // Ignore removal if ticker selection is disabled
      return;
    }
    setSelectedStocks(selectedStocks.filter(s => s !== stock));
  };

  const handleStockInputChange = (value: string) => {
    setStockInput(value);
    setShowStockSuggestions(true);
  };

  const filteredStocks = searchStocks(stockInput);

  // Handle broker selection
  const handleBrokerSelect = (broker: string) => {
    if (!selectedBrokers.includes(broker)) {
      setSelectedBrokers([...selectedBrokers, broker]);
    }
    setBrokerInput('');
    setShowBrokerSuggestions(false);
  };

  const handleRemoveBroker = (broker: string) => {
    setSelectedBrokers(selectedBrokers.filter(b => b !== broker));
  };

  // Load available brokers on mount
  useEffect(() => {
    const loadBrokers = async () => {
      try {
        const response = await api.getBrokerList();
        if (response.success && response.data?.brokers) {
          setAvailableBrokers(response.data.brokers.sort());
        }
      } catch (error) {
        console.error('Error loading brokers:', error);
      }
    };
    loadBrokers();
  }, []);

  // Load stock list from backend on mount
  useEffect(() => {
    loadStockList();
  }, []);




  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowStockSuggestions(false);
      }
      if (dropdownBrokerRef.current && !dropdownBrokerRef.current.contains(event.target as Node)) {
        setShowBrokerSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);


  // No need to load stocks from API anymore - using static list

  // Update selectedStocks when prop changes
  // If disableTickerSelection is true, always force selectedStocks to match propSelectedStock
  useEffect(() => {
    if (disableTickerSelection && propSelectedStock) {
      // Force to use only propSelectedStock
      setSelectedStocks([propSelectedStock]);
    } else if (propSelectedStock && !selectedStocks.includes(propSelectedStock)) {
      setSelectedStocks([propSelectedStock]);
    }
  }, [propSelectedStock, selectedStocks, disableTickerSelection]);

  // Save preferences to localStorage with debounce to reduce write operations
  useEffect(() => {
    const timeout = setTimeout(() => {
      const preferences: Partial<UserPreferences> = {
        selectedStocks,
        selectedBrokers,
        invFilter,
        boardFilter,
        showFrequency,
        showOrdColumns,
      };
      // Only include dates if they have values
      if (startDate) {
        preferences.startDate = startDate;
      }
      if (endDate) {
        preferences.endDate = endDate;
      }
      savePreferences(preferences);
    }, 500); // Debounce 500ms to reduce localStorage writes

    return () => clearTimeout(timeout);
  }, [selectedStocks, selectedBrokers, invFilter, boardFilter, showFrequency, showOrdColumns, startDate, endDate]);

  // Fetch OHLC data when selectedStocks changes
  useEffect(() => {
    const fetchOhlcData = async () => {
      const stocksToFetch = selectedStocks.filter(stock => !ohlcDataByStock[stock]);
      if (stocksToFetch.length === 0) return;

      const newOhlcData = { ...ohlcDataByStock };

      await Promise.all(stocksToFetch.map(async (stock) => {
        try {
          const result = await api.getStockData(stock);
          if (result.success && result.data?.data) {
            const parsed: OhlcRow[] = result.data.data.map((row: any) => {
              const dateStr = row.Date || row.date || '';
              const time = new Date(dateStr).getTime() / 1000;
              return {
                time: Math.floor(time),
                open: parseFloat(row.Open || row.open || 0),
                high: parseFloat(row.High || row.high || 0),
                low: parseFloat(row.Low || row.low || 0),
                close: parseFloat(row.Close || row.close || 0),
                volume: parseFloat(row.Volume || row.volume || 0)
              };
            }).filter((row: OhlcRow) => row.time > 0);
            newOhlcData[stock] = parsed;
          }
        } catch (err) {
          console.error(`Failed to fetch OHLC for ${stock}`, err);
        }
      }));

      setOhlcDataByStock(newOhlcData);
    };

    fetchOhlcData();
  }, [selectedStocks]);

  // Auto-load data from saved preferences on mount (after initial data is loaded)
  useEffect(() => {
    // Only auto-load if we have saved preferences with dates
    if (!savedPrefs?.startDate || !savedPrefs?.endDate) {
      return; // No saved preferences, don't auto-load
    }

    const savedStartDate = savedPrefs.startDate;
    const savedEndDate = savedPrefs.endDate;

    // Wait a bit to ensure initial data (stocks, brokers) are loaded
    const timer = setTimeout(() => {
      // Generate date array from saved startDate and endDate (only trading days)
      const startParts = savedStartDate.split('-').map(Number);
      const endParts = savedEndDate.split('-').map(Number);

      if (startParts.length === 3 && endParts.length === 3) {
        const startYear = startParts[0];
        const startMonth = startParts[1];
        const startDay = startParts[2];
        const endYear = endParts[0];
        const endMonth = endParts[1];
        const endDay = endParts[2];

        if (startYear !== undefined && startMonth !== undefined && startDay !== undefined &&
          endYear !== undefined && endMonth !== undefined && endDay !== undefined) {
          const start = new Date(startYear, startMonth - 1, startDay);
          const end = new Date(endYear, endMonth - 1, endDay);

          // Check if range is valid
          if (start <= end) {
            // Generate date array (only trading days)
            const dateArray: string[] = [];
            const currentDate = new Date(start);

            while (currentDate <= end) {
              const dayOfWeek = currentDate.getDay();
              // Skip weekends (Saturday = 6, Sunday = 0)
              if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                // Format as YYYY-MM-DD in local timezone
                const year = currentDate.getFullYear();
                const month = String(currentDate.getMonth() + 1).padStart(2, '0');
                const day = String(currentDate.getDate()).padStart(2, '0');
                const dateString = `${year}-${month}-${day}`;
                dateArray.push(dateString);
              }
              // Move to next day
              currentDate.setDate(currentDate.getDate() + 1);
            }

            // Sort by date (oldest first) for display
            const datesToUse = dateArray.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

            // Update selectedDates
            setSelectedDates(datesToUse);

            // Trigger auto-load by setting shouldFetchData to true
            setShouldFetchData(true);
          }
        }
      }
    }, 500); // Small delay to ensure initial data is loaded

    return () => clearTimeout(timer);
  }, []); // Only run once on mount

  // Fetch data when shouldFetchData is true
  useEffect(() => {
    const fetchData = async () => {
      if (!shouldFetchData) {
        return;
      }

      if (selectedStocks.length === 0 || selectedDates.length === 0) {
        console.log('Skipping fetch - missing stocks or dates:', { selectedStocks, selectedDates });
        setShouldFetchData(false);
        return;
      }

      console.log('Starting to fetch data for:', { selectedStocks, selectedDates, selectedBrokers, invFilter, boardFilter });
      setLoading(true);
      setError(null);
      setIsDataReady(false);

      try {
        // Determine fd parameter: if empty, use 'all', otherwise use lowercase
        const fdParam = invFilter === '' ? 'all' : invFilter.toLowerCase();
        // Determine board parameter: if empty (All), use empty string (files without suffix), otherwise use lowercase
        // Blob storage naming: BBCA_20241227.csv (all), BBCA_20241227_RG.csv (RG), etc.
        const boardParam = boardFilter === '' ? '' : boardFilter.toLowerCase();

        // Determine brokers to fetch: if empty, use 'All', otherwise fetch all selected brokers
        const brokersToFetch = selectedBrokers.length === 0 ? ['All'] : selectedBrokers;

        console.log('API parameters:', { brokersToFetch, fdParam, boardParam });

        // Fetch broker breakdown data for all selected stocks, dates and brokers
        const allPromises: Array<{ stock: string; date: string; broker: string; promise: Promise<any> }> = [];

        selectedStocks.forEach(stock => {
          selectedDates.forEach(date => {
            brokersToFetch.forEach(broker => {
              allPromises.push({
                stock,
                date,
                broker,
                promise: api.getDoneSummaryBrokerBreakdown(stock, date, broker, fdParam, boardParam)
              });
            });
          });
        });

        const allResults = await Promise.allSettled(allPromises.map(p => p.promise));

        // Store raw data per stock, date and broker
        const rawDataByStockDateAndBroker: { [stock: string]: { [date: string]: { [broker: string]: any[] } } } = {};

        allResults.forEach((result, index) => {
          const promiseData = allPromises[index];
          if (!promiseData) return;

          const { stock, date, broker } = promiseData;
          if (!stock || !date) return;

          if (!rawDataByStockDateAndBroker[stock]) {
            rawDataByStockDateAndBroker[stock] = {};
          }
          if (!rawDataByStockDateAndBroker[stock][date]) {
            rawDataByStockDateAndBroker[stock][date] = {};
          }

          if (result.status === 'fulfilled' && result.value.success && result.value.data?.records) {
            rawDataByStockDateAndBroker[stock][date][broker] = result.value.data.records;
          } else {
            rawDataByStockDateAndBroker[stock][date][broker] = [];
          }
        });

        // Aggregate data from all brokers per stock and date
        const newPriceDataByStockAndDate: { [stock: string]: { [date: string]: PriceData[] } } = {};

        selectedStocks.forEach(stock => {
          newPriceDataByStockAndDate[stock] = {};

          selectedDates.forEach(date => {
            const brokerDataMap = rawDataByStockDateAndBroker[stock]?.[date] || {};

            // Aggregate data from all brokers by price level
            const aggregatedByPrice = new Map<number, {
              bFreq: number;
              bLot: number;
              bOrd: number;
              sLot: number;
              sFreq: number;
              sOrd: number;
            }>();

            // Collect all prices first to preserve order
            const allPrices = new Set<number>();

            // Process data from each broker
            Object.entries(brokerDataMap).forEach(([_broker, records]) => {
              if (!Array.isArray(records)) return;

              records.forEach((row: any) => {
                const price = Number(row.Price) || 0;
                if (price === 0) return;

                allPrices.add(price);

                if (!aggregatedByPrice.has(price)) {
                  aggregatedByPrice.set(price, {
                    bFreq: 0,
                    bLot: 0,
                    bOrd: 0,
                    sLot: 0,
                    sFreq: 0,
                    sOrd: 0
                  });
                }

                const priceData = aggregatedByPrice.get(price)!;

                // Aggregate buy side - sum all values from all brokers
                // USER REQUEST: Data inverted. HAKI (S) considered Buy, HAKA (B) considered Sell.
                priceData.bFreq += Number(row.SFreq) || 0;
                priceData.bLot += Number(row.SLot) || 0;
                priceData.bOrd += Number(row.SOrd) || 0;

                // Aggregate sell side - sum all values from all brokers
                priceData.sLot += Number(row.BLot) || 0;
                priceData.sFreq += Number(row.BFreq) || 0;
                priceData.sOrd += Number(row.BOrd) || 0;
              });
            });

            // Convert aggregated data to PriceData format
            // Sort prices in descending order (highest first)
            const sortedPrices = Array.from(allPrices).sort((a, b) => b - a);

            const priceData: PriceData[] = sortedPrices.map(price => {
              const agg = aggregatedByPrice.get(price)!;
              const tFreq = agg.bFreq + agg.sFreq;
              const tLot = agg.bLot + agg.sLot;
              const tOrd = agg.bOrd + agg.sOrd;

              return {
                price,
                bFreq: agg.bFreq,
                bLot: agg.bLot,
                bOrd: agg.bOrd,
                sLot: agg.sLot,
                sFreq: agg.sFreq,
                sOrd: agg.sOrd,
                tFreq,
                tLot,
                tOrd
              };
            });

            if (!newPriceDataByStockAndDate[stock]) {
              newPriceDataByStockAndDate[stock] = {};
            }
            newPriceDataByStockAndDate[stock][date] = priceData;
          });
        });

        setPriceDataByStockAndDate(newPriceDataByStockAndDate);
        setIsDataReady(true);

      } catch (error) {
        console.error('Error fetching data:', error);
        setError('Failed to load data');
        setIsDataReady(false);
        showToast({
          type: 'error',
          title: 'Error',
          message: 'Failed to load data. Please try again.'
        });
      } finally {
        setLoading(false);
        setShouldFetchData(false);
      }
    };

    fetchData();
  }, [shouldFetchData, selectedStocks, selectedDates, selectedBrokers, invFilter, boardFilter, showToast]);


  const globalVisibleDates = useMemo(() => {
    const datesWithData = new Set<string>();
    selectedStocks.forEach(stock => {
      const stockData = priceDataByStockAndDate[stock] || {};
      selectedDates.forEach(date => {
        if (stockData[date] && stockData[date].length > 0) {
          datesWithData.add(date);
        }
      });
    });
    // Return selectedDates filtered by the union set, to preserve order
    return selectedDates.filter(date => datesWithData.has(date));
  }, [selectedStocks, selectedDates, priceDataByStockAndDate]);

  // Memoized data processing for all stocks to optimize rendering
  const processedStockData = useMemo(() => {
    if (!isDataReady) return new Map();

    const stockMap = new Map();

    selectedStocks.forEach(stock => {
      const stockPriceDataByDate = priceDataByStockAndDate[stock] || {};
      const visibleDates = globalVisibleDates;

      // Convert Array to Map for O(1) lookup: date -> price -> data
      const dataByDateMap = new Map<string, Map<number, PriceData>>();
      visibleDates.forEach(date => {
        const dateMap = new Map<number, PriceData>();
        const dateData = stockPriceDataByDate[date] || [];
        dateData.forEach(item => dateMap.set(item.price, item));
        dataByDateMap.set(date, dateMap);
      });

      // All unique prices (pre-calculated to avoid repeat logic during render)
      const allPrices = getAllUniquePrices(stock, visibleDates, stockPriceDataByDate, ohlcDataByStock[stock]);

      // Pre-calculate row totals (Grand Total column)
      const rowTotals = new Map<number, PriceData>();
      allPrices.forEach(price => {
        let bFreq = 0, sFreq = 0, bLot = 0, sLot = 0, bOrd = 0, sOrd = 0;
        visibleDates.forEach(date => {
          const data = dataByDateMap.get(date)?.get(price);
          if (data) {
            bFreq += data.bFreq || 0;
            sFreq += data.sFreq || 0;
            bLot += data.bLot || 0;
            sLot += data.sLot || 0;
            bOrd += data.bOrd || 0;
            sOrd += data.sOrd || 0;
          }
        });
        rowTotals.set(price, {
          price,
          bFreq, sFreq, bLot, sLot, bOrd, sOrd,
          tFreq: bFreq + sFreq,
          tLot: bLot + sLot,
          tOrd: bOrd + sOrd
        });
      });

      // Pre-calculate date totals (Footer row)
      const dateTotals = new Map<string, any>();
      visibleDates.forEach(date => {
        const dateData = stockPriceDataByDate[date] || [];
        dateTotals.set(date, calculateTotals(dateData));
      });

      // Pre-calculate grand grand totals
      const grandTotals = Array.from(dateTotals.values()).reduce((acc, curr) => ({
        bFreq: acc.bFreq + curr.bFreq,
        bLot: acc.bLot + curr.bLot,
        bOrd: acc.bOrd + curr.bOrd,
        sLot: acc.sLot + curr.sLot,
        sFreq: acc.sFreq + curr.sFreq,
        sOrd: acc.sOrd + curr.sOrd,
        tFreq: acc.tFreq + curr.tFreq,
        tLot: acc.tLot + curr.tLot,
        tOrd: acc.tOrd + curr.tOrd
      }), { bFreq: 0, bLot: 0, bOrd: 0, sLot: 0, sFreq: 0, sOrd: 0, tFreq: 0, tLot: 0, tOrd: 0 });

      stockMap.set(stock, {
        allPrices,
        dataByDateMap,
        rowTotals,
        dateTotals,
        grandTotals
      });
    });

    return stockMap;
  }, [isDataReady, selectedStocks, globalVisibleDates, priceDataByStockAndDate, ohlcDataByStock]);



  const formatDateForInput = (date: string | undefined) => {
    return date || '';
  };

  const triggerDatePicker = (inputRef: React.RefObject<HTMLInputElement>) => {
    inputRef.current?.showPicker?.();
  };

  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);

  return (
    <div className="w-full">
      {/* Top Controls - Compact without Card */}
      {/* On small/medium screens menu scrolls bersama konten. Hanya di layar besar (lg+) yang fixed di top. */}
      <div className="bg-[#0a0f20] border-b border-[#3a4252] px-4 py-1 lg:sticky lg:top-0 lg:z-40">
        <div ref={menuContainerRef} className="flex flex-col md:flex-row md:flex-wrap items-center gap-2 md:gap-x-7 md:gap-y-0.2">
          {/* Ticker Selection */}
          <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
            <label className="text-sm font-medium whitespace-nowrap">Ticker:</label>
            <div className="relative flex-1 md:flex-none" ref={dropdownRef}>
              {!disableTickerSelection && <Search className="absolute left-3 top-1/2 pointer-events-none -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />}
              {disableTickerSelection ? (
                <div className="w-full md:w-32 h-9 pl-3 pr-3 flex items-center text-sm border border-input rounded-md bg-muted text-foreground">
                  {propSelectedStock || selectedStocks[0] || 'No ticker selected'}
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    value={stockInput}
                    onChange={(e) => { handleStockInputChange(e.target.value); setHighlightedStockIndex(0); }}
                    onFocus={() => { setShowStockSuggestions(true); setHighlightedStockIndex(0); }}
                    onKeyDown={(e) => {
                      const availableSuggestions = stockInput === ''
                        ? STOCK_LIST.filter(s => !selectedStocks.includes(s))
                        : filteredStocks.filter(s => !selectedStocks.includes(s));
                      const suggestions = availableSuggestions.slice(0, 10);
                      if (!suggestions.length) return;
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setHighlightedStockIndex((prev) => (prev + 1) % suggestions.length);
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setHighlightedStockIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
                      } else if (e.key === 'Enter' && showStockSuggestions) {
                        e.preventDefault();
                        const idx = highlightedStockIndex >= 0 ? highlightedStockIndex : 0;
                        const choice = suggestions[idx];
                        if (choice) handleStockSelect(choice);
                      } else if (e.key === 'Escape') {
                        setShowStockSuggestions(false);
                        setHighlightedStockIndex(-1);
                      }
                    }}
                    placeholder={selectedStocks.length > 0 ? (selectedStocks.length === 1 ? selectedStocks[0] : selectedStocks.join(' | ')) : "Enter stock code..."}
                    className={`w-full md:w-32 h-9 pl-10 pr-3 text-sm border border-input rounded-md bg-background text-foreground ${selectedStocks.length > 0 ? 'placeholder:text-white' : ''}`}
                    role="combobox"
                    aria-expanded={showStockSuggestions}
                    aria-controls="stock-suggestions"
                    aria-autocomplete="list"
                  />
                  {showStockSuggestions && (
                    <div id="stock-suggestions" role="listbox" className="absolute top-full left-0 right-0 mt-1 bg-popover border border-[#3a4252] rounded-md shadow-lg z-50 max-h-96 overflow-hidden flex flex-col">
                      <>
                        {/* Selected Items Section */}
                        {selectedStocks.length > 0 && (
                          <div className="border-b border-[#3a4252] overflow-y-auto" style={{ minHeight: '120px', maxHeight: `${Math.min(selectedStocks.length * 24 + 30, 250)}px` }}>
                            <div className="px-3 py-1 text-xs text-muted-foreground sticky top-0 bg-popover flex items-center justify-between">
                              <span>Selected ({selectedStocks.length})</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedStocks([]);
                                }}
                                className="text-xs text-destructive hover:text-destructive/80 font-medium"
                              >
                                Clear
                              </button>
                            </div>
                            {selectedStocks.map(stock => (
                              <div
                                key={`selected-stock-${stock}`}
                                className="px-3 py-1 hover:bg-muted flex items-center justify-between min-h-[24px]"
                              >
                                <span className="text-sm text-primary">{stock}</span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveStock(stock);
                                  }}
                                  className="text-muted-foreground hover:text-destructive text-sm"
                                  aria-label={`Remove ${stock}`}
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Search Results Section */}
                        <div className="overflow-y-auto flex-1">
                          {stockInput === '' ? (
                            <>
                              <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252] sticky top-0 bg-popover">
                                Available Stocks ({STOCK_LIST.filter(s => !selectedStocks.includes(s)).length})
                              </div>
                              {STOCK_LIST.filter(s => !selectedStocks.includes(s)).slice(0, 20).map((stock, idx) => (
                                <div
                                  key={stock}
                                  onClick={() => handleStockSelect(stock)}
                                  className={`px-3 py-[2.06px] hover:bg-muted cursor-pointer text-sm ${idx === highlightedStockIndex ? 'bg-accent' : ''}`}
                                  onMouseEnter={() => setHighlightedStockIndex(idx)}
                                >
                                  {stock}
                                </div>
                              ))}
                              {STOCK_LIST.filter(s => !selectedStocks.includes(s)).length > 20 && (
                                <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-t border-[#3a4252]">
                                  ... and {STOCK_LIST.filter(s => !selectedStocks.includes(s)).length - 20} more stocks
                                </div>
                              )}
                            </>
                          ) : filteredStocks.filter(s => !selectedStocks.includes(s)).length > 0 ? (
                            <>
                              <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252] sticky top-0 bg-popover">
                                {filteredStocks.filter(s => !selectedStocks.includes(s)).length} stocks found
                              </div>
                              {filteredStocks.filter(s => !selectedStocks.includes(s)).slice(0, 20).map((stock, idx) => (
                                <div
                                  key={stock}
                                  onClick={() => handleStockSelect(stock)}
                                  className={`px-3 py-[2.06px] hover:bg-muted cursor-pointer text-sm ${idx === highlightedStockIndex ? 'bg-accent' : ''}`}
                                  onMouseEnter={() => setHighlightedStockIndex(idx)}
                                >
                                  {stock}
                                </div>
                              ))}
                              {filteredStocks.filter(s => !selectedStocks.includes(s)).length > 20 && (
                                <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-t border-[#3a4252]">
                                  ... and {filteredStocks.filter(s => !selectedStocks.includes(s)).length - 20} more results
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="px-3 py-[2.06px] text-sm text-muted-foreground">
                              No stocks found
                            </div>
                          )}
                        </div>
                      </>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Broker Selection - Multi-select with dropdown only */}
          <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
            <label className="text-sm font-medium whitespace-nowrap">Broker:</label>
            <div className="relative flex-1 md:flex-none" ref={dropdownBrokerRef}>
              <Search className="absolute left-3 top-1/2 pointer-events-none -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <input
                type="text"
                value={brokerInput}
                onChange={(e) => {
                  const v = e.target.value.toUpperCase();
                  setBrokerInput(v);
                  setShowBrokerSuggestions(true);
                  setHighlightedBrokerIndex(0);
                }}
                onFocus={() => setShowBrokerSuggestions(true)}
                onKeyDown={(e) => {
                  const filteredBrokers = brokerInput === ''
                    ? availableBrokers.filter(b => !selectedBrokers.includes(b))
                    : availableBrokers.filter(b =>
                      b.toLowerCase().includes(brokerInput.toLowerCase()) &&
                      !selectedBrokers.includes(b)
                    );
                  const suggestions = filteredBrokers.slice(0, 10);

                  if (e.key === 'ArrowDown' && suggestions.length) {
                    e.preventDefault();
                    setHighlightedBrokerIndex((prev) => (prev + 1) % suggestions.length);
                  } else if (e.key === 'ArrowUp' && suggestions.length) {
                    e.preventDefault();
                    setHighlightedBrokerIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
                  } else if (e.key === 'Enter' && showBrokerSuggestions) {
                    e.preventDefault();
                    const idx = highlightedBrokerIndex >= 0 ? highlightedBrokerIndex : 0;
                    const choice = suggestions[idx];
                    if (choice) handleBrokerSelect(choice);
                  } else if (e.key === 'Escape') {
                    setShowBrokerSuggestions(false);
                    setHighlightedBrokerIndex(-1);
                  }
                }}
                placeholder={selectedBrokers.length > 0 ? (selectedBrokers.length === 1 ? selectedBrokers[0] : selectedBrokers.join(' | ')) : "Add broker"}
                className={`w-full md:w-32 h-9 pl-10 pr-3 text-sm border border-input rounded-md bg-background text-foreground ${selectedBrokers.length > 0 ? 'placeholder:text-white' : ''}`}
                role="combobox"
                aria-expanded={showBrokerSuggestions}
                aria-controls="broker-suggestions"
                aria-autocomplete="list"
              />
              {showBrokerSuggestions && (
                <div id="broker-suggestions" role="listbox" className="absolute top-full left-0 right-0 mt-1 bg-popover border border-[#3a4252] rounded-md shadow-lg z-50 max-h-96 overflow-hidden flex flex-col">
                  {availableBrokers.length === 0 ? (
                    <div className="px-3 py-[2.06px] text-sm text-muted-foreground flex items-center">
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Loading brokers...
                    </div>
                  ) : (
                    <>
                      {/* Selected Items Section */}
                      {selectedBrokers.length > 0 && (
                        <div className="border-b border-[#3a4252] overflow-y-auto" style={{ minHeight: '120px', maxHeight: `${Math.min(selectedBrokers.length * 24 + 30, 250)}px` }}>
                          <div className="px-3 py-1 text-xs text-muted-foreground sticky top-0 bg-popover flex items-center justify-between">
                            <span>Selected ({selectedBrokers.length})</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedBrokers([]);
                              }}
                              className="text-xs text-destructive hover:text-destructive/80 font-medium"
                            >
                              Clear
                            </button>
                          </div>
                          {selectedBrokers.map(broker => (
                            <div
                              key={`selected-broker-${broker}`}
                              className="px-3 py-1 hover:bg-muted flex items-center justify-between min-h-[24px]"
                            >
                              <span className="text-sm text-primary">{broker}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveBroker(broker);
                                }}
                                className="text-muted-foreground hover:text-destructive text-sm"
                                aria-label={`Remove ${broker}`}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Search Results Section */}
                      <div className="overflow-y-auto flex-1">
                        {brokerInput === '' ? (
                          <>
                            <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252] sticky top-0 bg-popover">
                              Available Brokers ({availableBrokers.filter(b => !selectedBrokers.includes(b)).length})
                            </div>
                            {availableBrokers.filter(b => !selectedBrokers.includes(b)).map((broker, idx) => (
                              <div
                                key={broker}
                                onClick={() => handleBrokerSelect(broker)}
                                className={`px-3 py-[2.06px] hover:bg-muted cursor-pointer text-sm ${idx === highlightedBrokerIndex ? 'bg-accent' : ''}`}
                                onMouseEnter={() => setHighlightedBrokerIndex(idx)}
                              >
                                {broker}
                              </div>
                            ))}
                          </>
                        ) : (() => {
                          const filteredBrokers = availableBrokers.filter(b =>
                            b.toLowerCase().includes(brokerInput.toLowerCase()) &&
                            !selectedBrokers.includes(b)
                          );
                          return (
                            <>
                              <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252] sticky top-0 bg-popover">
                                {filteredBrokers.length} broker(s) found
                              </div>
                              {filteredBrokers.length > 0 ? (
                                filteredBrokers.map((broker, idx) => (
                                  <div
                                    key={broker}
                                    onClick={() => handleBrokerSelect(broker)}
                                    className={`px-3 py-[2.06px] hover:bg-muted cursor-pointer text-sm ${idx === highlightedBrokerIndex ? 'bg-accent' : ''}`}
                                    onMouseEnter={() => setHighlightedBrokerIndex(idx)}
                                  >
                                    {broker}
                                  </div>
                                ))
                              ) : (
                                <div className="px-3 py-[2.06px] text-sm text-muted-foreground">
                                  No brokers found
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Date Range */}
          <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
            <label className="text-sm font-medium whitespace-nowrap">Date Range:</label>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div
                className="relative h-9 flex-1 md:w-36 rounded-md border border-input bg-background cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => triggerDatePicker(startDateRef)}
              >
                <input
                  ref={startDateRef}
                  type="date"
                  value={formatDateForInput(startDate)}
                  onChange={(e) => {
                    const selectedDate = new Date(e.target.value);
                    const dayOfWeek = selectedDate.getDay();
                    if (dayOfWeek === 0 || dayOfWeek === 6) {
                      showToast({
                        type: 'warning',
                        title: 'Peringatan',
                        message: 'Tidak bisa memilih hari Sabtu atau Minggu'
                      });
                      return;
                    }
                    setStartDate(e.target.value);
                    if (!endDate || new Date(e.target.value) > new Date(endDate)) {
                      setEndDate(e.target.value);
                    }
                  }}
                  onKeyDown={(e) => e.preventDefault()}
                  onPaste={(e) => e.preventDefault()}
                  onInput={(e) => e.preventDefault()}
                  max={formatDateForInput(endDate)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  style={{ caretColor: 'transparent' }}
                />
                <div className="flex items-center gap-2 h-full px-3">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">
                    {startDate ? new Date(startDate).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric'
                    }) : 'DD/MM/YYYY'}
                  </span>
                </div>
              </div>
              <span className="text-sm text-muted-foreground whitespace-nowrap hidden md:inline">to</span>
              <div
                className="relative h-9 flex-1 md:w-36 rounded-md border border-input bg-background cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => triggerDatePicker(endDateRef)}
              >
                <input
                  ref={endDateRef}
                  type="date"
                  value={formatDateForInput(endDate)}
                  onChange={(e) => {
                    const selectedDate = new Date(e.target.value);
                    const dayOfWeek = selectedDate.getDay();
                    if (dayOfWeek === 0 || dayOfWeek === 6) {
                      showToast({
                        type: 'warning',
                        title: 'Peringatan',
                        message: 'Tidak bisa memilih hari Sabtu atau Minggu'
                      });
                      return;
                    }
                    const newEndDate = e.target.value;
                    setEndDate(newEndDate);
                    if (startDate && new Date(newEndDate) < new Date(startDate)) {
                      setStartDate(newEndDate);
                    }
                  }}
                  onKeyDown={(e) => e.preventDefault()}
                  onPaste={(e) => e.preventDefault()}
                  onInput={(e) => e.preventDefault()}
                  min={formatDateForInput(startDate)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  style={{ caretColor: 'transparent' }}
                />
                <div className="flex items-center gap-2 h-full px-3">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">
                    {endDate ? new Date(endDate).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric'
                    }) : 'DD/MM/YYYY'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* F/D Filter (Foreign/Domestic) */}
          <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
            <label className="text-sm font-medium whitespace-nowrap">F/D:</label>
            <select
              value={invFilter}
              onChange={(e) => {
                setInvFilter(e.target.value as 'F' | 'D' | '');
              }}
              className="h-9 px-3 border border-[#3a4252] rounded-md bg-background text-foreground text-sm w-full md:w-auto"
            >
              <option value="">All</option>
              <option value="F">Foreign</option>
              <option value="D">Domestic</option>
            </select>
          </div>

          {/* Board Filter (RG/TN/NG) */}
          <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
            <label className="text-sm font-medium whitespace-nowrap">Board:</label>
            <select
              value={boardFilter}
              onChange={(e) => {
                setBoardFilter(e.target.value as 'RG' | 'TN' | 'NG' | '');
              }}
              className="h-9 px-3 border border-[#3a4252] rounded-md bg-background text-foreground text-sm w-full md:w-auto"
            >
              <option value="">All</option>
              <option value="RG">RG</option>
              <option value="TN">TN</option>
              <option value="NG">NG</option>
            </select>
          </div>

          {/* Frequency and Ord Toggles */}
          <div className="flex flex-col gap-1 items-start">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showFrequency}
                onChange={(e) => setShowFrequency(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-[#3a4252] text-primary focus:ring-primary cursor-pointer"
              />
              <span className="text-xs text-foreground whitespace-nowrap">Freq</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showOrdColumns}
                onChange={(e) => setShowOrdColumns(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-[#3a4252] text-primary focus:ring-primary cursor-pointer"
              />
              <span className="text-xs text-foreground whitespace-nowrap">Or</span>
            </label>
          </div>

          {/* Show Button */}
          <button
            onClick={() => {
              // Generate date array from startDate and endDate
              let datesToUse: string[] = [];
              if (startDate && endDate) {
                const start = new Date(startDate);
                const end = new Date(endDate);

                if (start <= end) {
                  const dateArray: string[] = [];
                  const currentDate = new Date(start);

                  while (currentDate <= end) {
                    const dayOfWeek = currentDate.getDay();
                    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                      const year = currentDate.getFullYear();
                      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
                      const day = String(currentDate.getDate()).padStart(2, '0');
                      const dateString = `${year}-${month}-${day}`;
                      dateArray.push(dateString);
                    }
                    currentDate.setDate(currentDate.getDate() + 1);
                  }

                  datesToUse = dateArray.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

                  // Check if total trading dates exceed 20
                  if (datesToUse.length > 20) {
                    showToast({
                      type: 'warning',
                      title: 'Terlalu Banyak Tanggal',
                      message: 'Maksimal 20 hari trading yang bisa dipilih (tidak termasuk weekend)',
                    });
                    return;
                  }
                }
              }

              setSelectedDates(datesToUse);

              // Clear existing data before fetching new data
              setPriceDataByStockAndDate({});
              setIsDataReady(false);

              // Trigger fetch
              setShouldFetchData(true);
            }}
            disabled={loading || selectedStocks.length === 0 || !startDate || !endDate}
            className="h-9 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium whitespace-nowrap flex items-center justify-center w-full md:w-auto"
          >
            Show
          </button>
        </div>
      </div>



      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-16 pt-4">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Loading bid/ask data...</span>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="flex items-center justify-center py-8 pt-4">
          <div className="text-sm text-destructive">{error}</div>
        </div>
      )}

      {/* Main Data Display */}
      <div className="pt-2 space-y-6">
        {!loading && !error && isDataReady && selectedStocks.map(stock => {
          const processedData = processedStockData.get(stock);
          if (!processedData) return null;
          return (
            <StockSummaryTable
              key={stock}
              stock={stock}
              visibleDates={globalVisibleDates}
              processedData={processedData}
              ohlcData={ohlcDataByStock[stock] || []}
              showOrdColumns={showOrdColumns}
              showFrequency={showFrequency}
              selectedBrokers={selectedBrokers}
            />
          );
        })}
      </div>
    </div>
  );
}
