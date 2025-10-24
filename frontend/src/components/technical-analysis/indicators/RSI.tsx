import { IndicatorData } from '../TechnicalAnalysisTradingView';

export interface OhlcRow {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export function calculateRSI(data: OhlcRow[], period: number): IndicatorData[] {
  const result: IndicatorData[] = [];
  
  if (data.length < period + 1) return result;
  
  const gains: number[] = [];
  const losses: number[] = [];
  
  // Calculate price changes
  for (let i = 1; i < data.length; i++) {
    const change = (data[i]?.close ?? 0) - (data[i - 1]?.close ?? 0);
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  
  // Calculate RSI for each period
  for (let i = period; i < gains.length; i++) {
    const avgGain = gains.slice(i - period, i).reduce((sum, gain) => sum + gain, 0) / period;
    const avgLoss = losses.slice(i - period, i).reduce((sum, loss) => sum + loss, 0) / period;
    
    if (avgLoss === 0) {
      result.push({ time: data[i + 1]?.time ?? 0, value: 100 });
    } else {
      const rs = avgGain / avgLoss;
      const rsi = 100 - (100 / (1 + rs));
      result.push({ time: data[i + 1]?.time ?? 0, value: rsi });
    }
  }
  
  return result;
}
