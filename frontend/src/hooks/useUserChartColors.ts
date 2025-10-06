import { useEffect, useState } from 'react';
import { chartPreferencesService } from '../services/chartPreferences';

export type UserChartColors = {
  bullish: string;
  bearish: string;
};

const DEFAULT_COLORS: UserChartColors = {
  bullish: '#16a34a',
  bearish: '#dc2626',
};

export function useUserChartColors(): UserChartColors {
  // Seed from local cache first to avoid initial green/red flash
  const cached = chartPreferencesService.getCachedColors();
  const [colors, setColors] = useState<UserChartColors>(cached || DEFAULT_COLORS);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await chartPreferencesService.loadColors();
        if (!cancelled && loaded) {
          setColors(loaded);
        }
      } catch (_) {
        // ignore
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return colors;
}


