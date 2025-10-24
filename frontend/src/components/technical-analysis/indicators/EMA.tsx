import { IndicatorData } from '../TechnicalAnalysisTradingView';

export interface OhlcRow {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export function calculateEMA(data: OhlcRow[], period: number): IndicatorData[] {
  const result: IndicatorData[] = [];
  const multiplier = 2 / (period + 1);
  
  if (data.length === 0) return result;
  
  // First EMA is the first close price
  let ema = data[0]?.close ?? 0;
  result.push({ time: data[0]?.time ?? 0, value: ema });
  
  for (let i = 1; i < data.length; i++) {
    ema = ((data[i]?.close ?? 0) * multiplier) + (ema * (1 - multiplier));
    result.push({ time: data[i]?.time ?? 0, value: ema });
  }
  
  return result;
}
