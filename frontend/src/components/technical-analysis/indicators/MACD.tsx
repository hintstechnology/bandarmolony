import { IndicatorData } from '../TechnicalAnalysisTradingView';
import { calculateEMA } from './EMA';

export interface OhlcRow {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export function calculateMACD(data: OhlcRow[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9): { macd: IndicatorData[], signal: IndicatorData[] } {
  const macdLine: IndicatorData[] = [];
  const signalLine: IndicatorData[] = [];
  
  if (data.length < slowPeriod) return { macd: macdLine, signal: signalLine };
  
  // Calculate EMAs
  const fastEMA = calculateEMA(data, fastPeriod);
  const slowEMA = calculateEMA(data, slowPeriod);
  
  // Calculate MACD line
  for (let i = 0; i < Math.min(fastEMA.length, slowEMA.length); i++) {
    if (fastEMA[i] && slowEMA[i]) {
      macdLine.push({
        time: fastEMA[i]?.time ?? 0,
        value: (fastEMA[i]?.value ?? 0) - (slowEMA[i]?.value ?? 0)
      });
    }
  }
  
  // Calculate signal line (EMA of MACD line)
  const signalLineData = calculateEMA(macdLine.map(d => ({ time: d.time, open: d.value, high: d.value, low: d.value, close: d.value })), signalPeriod);
  
  // Convert signal line data to IndicatorData format
  for (let i = 0; i < signalLineData.length; i++) {
    if (signalLineData[i]) {
      signalLine.push({
        time: signalLineData[i]?.time ?? 0,
        value: signalLineData[i]?.value ?? 0
      });
    }
  }
  
  return { macd: macdLine, signal: signalLine };
}
