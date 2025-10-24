import { IndicatorData } from '../TechnicalAnalysisTradingView';

export interface OhlcRow {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export function calculateSMA(data: OhlcRow[], period: number): IndicatorData[] {
  const result: IndicatorData[] = [];
  
  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    const sum = slice.reduce((acc, item) => acc + item.close, 0);
    const sma = sum / period;
    
    result.push({
      time: data[i]?.time ?? 0,
      value: sma
    });
  }
  
  return result;
}
