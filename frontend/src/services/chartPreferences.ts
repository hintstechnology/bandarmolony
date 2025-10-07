import { supabase } from '../lib/supabase';

export interface UserChartColors {
  bullish: string;
  bearish: string;
}

const LS_KEY = 'userChartColors';

export const chartPreferencesService = {
  getCachedColors(): UserChartColors | null {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.bullish === 'string' && typeof parsed.bearish === 'string') {
        return parsed as UserChartColors;
      }
      return null;
    } catch (_) {
      return null;
    }
  },

  async loadColors(): Promise<UserChartColors | null> {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      if (!user) return null;

      const { data, error } = await supabase
        .from('user_chart_preferences')
        .select('bullish_color, bearish_color')
        .eq('user_id', user.id)
        .single();

      if (error || !data) return null;

      const result = {
        bullish: data.bullish_color || '#16a34a',
        bearish: data.bearish_color || '#dc2626',
      };
      // Cache for instant next render
      try { localStorage.setItem(LS_KEY, JSON.stringify(result)); } catch (_) {}
      return result;
    } catch (e) {
      return null;
    }
  },

  async saveColors(colors: UserChartColors): Promise<void> {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;
    if (!user) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('user_chart_preferences')
      .upsert({
        user_id: user.id,
        bullish_color: colors.bullish,
        bearish_color: colors.bearish,
      }, { onConflict: 'user_id' });

    if (error) throw error;
    // Update local cache immediately to prevent flicker on other pages
    try { localStorage.setItem(LS_KEY, JSON.stringify(colors)); } catch (_) {}
  },

  getDefaultColors(): UserChartColors {
    return {
      bullish: '#16a34a',
      bearish: '#dc2626',
    };
  }
};


