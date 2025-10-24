import { IndicatorData } from '../TechnicalAnalysisTradingView';
import { calculateSMA } from './SMA';

export interface OhlcRow {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export function calculateStochastic(data: OhlcRow[], kPeriod: number = 14, dPeriod: number = 3): { k: IndicatorData[], d: IndicatorData[] } {
  const kValues: IndicatorData[] = [];
  const dValues: IndicatorData[] = [];
  
  if (data.length < kPeriod) return { k: kValues, d: dValues };
  
  // Calculate %K values
  for (let i = kPeriod - 1; i < data.length; i++) {
    const slice = data.slice(i - kPeriod + 1, i + 1);
    const highestHigh = Math.max(...slice.map(item => item?.high ?? 0));
    const lowestLow = Math.min(...slice.map(item => item?.low ?? 0));
    const currentClose = data[i]?.close ?? 0;
    
    // Calculate %K
    const kPercent = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
    
    kValues.push({
      time: data[i]?.time ?? 0,
      value: kPercent
    });
  }
  
  // Calculate %D values (SMA of %K)
  for (let i = dPeriod - 1; i < kValues.length; i++) {
    const slice = kValues.slice(i - dPeriod + 1, i + 1);
    const dValue = slice.reduce((sum, item) => sum + item.value, 0) / dPeriod;
    
    dValues.push({
      time: kValues[i]?.time ?? 0,
      value: dValue
    });
  }
  
  return { k: kValues, d: dValues };
}
