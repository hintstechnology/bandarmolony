import { IndicatorData } from '../TechnicalAnalysisTradingView';

export interface OhlcRow {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export function calculateVolumeHistogram(data: OhlcRow[]): IndicatorData[] {
  const result: IndicatorData[] = [];
  
  for (let i = 0; i < data.length; i++) {
    if (data[i]?.volume !== undefined) {
      result.push({
        time: data[i]?.time ?? 0,
        value: data[i]?.volume ?? 0
      });
    }
  }
  
  return result;
}
