import { IndicatorData } from '../TechnicalAnalysisTradingView';

export interface OhlcRow {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export function calculateBuySellFrequency(data: OhlcRow[], bidAskData: any[], period: number = 14): { buyFreq: IndicatorData[], sellFreq: IndicatorData[] } {
  const buyFreq: IndicatorData[] = [];
  const sellFreq: IndicatorData[] = [];
  
  console.log('📊 BuySellFrequency: Starting calculation with:', {
    ohlcDataLength: data.length,
    bidAskDataLength: bidAskData?.length || 0,
    period,
    sampleBidAskData: bidAskData?.slice(0, 3).map(row => ({
      time: row.Time || row.time,
      bidCount: row.BidCount,
      askCount: row.AskCount,
      bidVolume: row.BidVolume || row.BLot,
      askVolume: row.AskVolume || row.SLot,
      price: row.Price,
      date: row.date
    })) || []
  });
  
  if (!bidAskData || bidAskData.length === 0) {
    console.log('📊 BuySellFrequency: No bid/ask data available - this is normal if no trading data exists');
    return { buyFreq, sellFreq };
  }
  
  // If no OHLC data, create time points from bid/ask data (same pattern as FootprintChart)
  if (!data || data.length === 0) {
    console.log('📊 BuySellFrequency: No OHLC data, creating time points from bid/ask data');
    
    // Group bid/ask data by date (same as FootprintChart)
    const dataByDate: { [date: string]: any[] } = {};
    
    bidAskData.forEach(row => {
      const date = row.date || 'unknown';
      if (!dataByDate[date]) {
        dataByDate[date] = [];
      }
      dataByDate[date].push(row);
    });
    
    // Calculate buy/sell frequency for each date
    Object.entries(dataByDate).forEach(([date, dayData]) => {
      if (dayData.length === 0) return;
      
      // Calculate total bid and ask counts for the day
      const totalBidCount = dayData.reduce((sum, row) => sum + (row.BidCount || 0), 0);
      const totalAskCount = dayData.reduce((sum, row) => sum + (row.AskCount || 0), 0);
      
      if (totalBidCount > 0 || totalAskCount > 0) {
        // Create timestamp for midday of the date
        const dateTime = new Date(date.slice(0, 4) + '-' + date.slice(4, 6) + '-' + date.slice(6, 8) + 'T12:00:00Z').getTime() / 1000;
        
        buyFreq.push({
          time: dateTime,
          value: totalBidCount
        });
        
        sellFreq.push({
          time: dateTime,
          value: totalAskCount
        });
        
        console.log(`📊 BuySellFrequency: Daily data for ${date}:`, {
          date: date,
          totalBidCount: totalBidCount,
          totalAskCount: totalAskCount,
          recordsCount: dayData.length,
          dateTime: dateTime,
          dateTimeDate: new Date(dateTime * 1000).toISOString()
        });
      }
    });
  } else {
    // Use OHLC data time points and distribute bid/ask data across OHLC timeline (same pattern as FootprintChart)
    console.log('📊 BuySellFrequency: Using OHLC data time points');
    console.log('📊 BuySellFrequency: Sample OHLC data:', data.slice(0, 3).map(row => ({
      time: row.time,
      timeDate: new Date(row.time * 1000).toISOString(),
      open: row.open,
      close: row.close
    })));
    
    // Convert OHLC data to CandleData format with footprint volume levels (same as FootprintChart)
    data.forEach(candle => {
      // Extract date from candle timestamp (YYYY-MM-DD -> YYYYMMDD)
      const candleDate = new Date(candle.time * 1000).toISOString().slice(0, 10).replace(/-/g, '');
      
      // Filter bid/ask data by BOTH date AND price range (same as FootprintChart)
      const candleFootprint = bidAskData.filter(d => {
        // Match date first
        const matchesDate = d.date === candleDate;
        // Then match price range
        const matchesPrice = d.Price >= candle.low && d.Price <= candle.high;
        
        return matchesDate && matchesPrice;
      });
      
      if (candleFootprint.length === 0) {
        console.log(`📊 BuySellFrequency: No bidask data for candle date ${candleDate}`);
        return;
      }
      
      // Calculate total bid and ask counts for this candle
      const totalBidCount = candleFootprint.reduce((sum, row) => sum + (row.BidCount || 0), 0);
      const totalAskCount = candleFootprint.reduce((sum, row) => sum + (row.AskCount || 0), 0);
      
      if (totalBidCount > 0 || totalAskCount > 0) {
        buyFreq.push({
          time: candle.time,
          value: totalBidCount
        });
        
        sellFreq.push({
          time: candle.time,
          value: totalAskCount
        });
        
        console.log(`📊 BuySellFrequency: Candle data for ${candleDate}:`, {
          candleDate: candleDate,
          totalBidCount: totalBidCount,
          totalAskCount: totalAskCount,
          recordsCount: candleFootprint.length,
          candleTime: candle.time,
          candleTimeDate: new Date(candle.time * 1000).toISOString()
        });
      }
    });
  }
  
  // Sort by time and remove duplicates
  buyFreq.sort((a, b) => a.time - b.time);
  sellFreq.sort((a, b) => a.time - b.time);
  
  // Remove duplicate time entries and ensure unique timestamps
  const uniqueBuyFreq: IndicatorData[] = [];
  const uniqueSellFreq: IndicatorData[] = [];
  
  const seenTimes = new Set<number>();
  
  // Process buy frequency data
  buyFreq.forEach(point => {
    if (point.time && point.value !== undefined && point.value !== null && !seenTimes.has(point.time)) {
      seenTimes.add(point.time);
      uniqueBuyFreq.push(point);
    }
  });
  
  // Reset seen times for sell frequency
  seenTimes.clear();
  
  // Process sell frequency data
  sellFreq.forEach(point => {
    if (point.time && point.value !== undefined && point.value !== null && !seenTimes.has(point.time)) {
      seenTimes.add(point.time);
      uniqueSellFreq.push(point);
    }
  });
  
  // Ensure we have valid data points for line plotting
  const validBuyFreq = uniqueBuyFreq;
  const validSellFreq = uniqueSellFreq;
  
  // If no valid data, create empty arrays to prevent chart errors
  if (validBuyFreq.length === 0 && validSellFreq.length === 0) {
    console.log('📊 BuySellFrequency: No valid data points found, returning empty arrays');
    return { buyFreq: [], sellFreq: [] };
  }
  
  // Log data range for debugging
  const dataRange = validBuyFreq.length > 0 ? {
    startDate: new Date((validBuyFreq[0]?.time || 0) * 1000).toISOString(),
    endDate: new Date((validBuyFreq[validBuyFreq.length - 1]?.time || 0) * 1000).toISOString(),
    totalPoints: validBuyFreq.length,
    duplicateTimesRemoved: buyFreq.length - validBuyFreq.length
  } : null;

  console.log('📊 BuySellFrequency: Generated data:', {
    buyFreqLength: validBuyFreq.length,
    sellFreqLength: validSellFreq.length,
    dataRange,
    sampleData: validBuyFreq.slice(0, 3),
    duplicateTimesRemoved: buyFreq.length - validBuyFreq.length
  });
  
  return { buyFreq: validBuyFreq, sellFreq: validSellFreq };
}
