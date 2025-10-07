// Broker color mapping based on list_broker.csv
export interface BrokerColorData {
  kode: string;
  nama: string;
  warna: string;
}

// Hook to detect dark mode
export function useDarkMode(): boolean {
  if (typeof window === 'undefined') return false;
  
  // Check if dark class is present on html element
  const isDark = document.documentElement.classList.contains('dark');
  
  // Also check system preference as fallback
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  return isDark || prefersDark;
}

// Color mapping from CSV data
export const BROKER_COLORS: Record<string, string> = {
  'AD': 'Biru',
  'AF': 'Merah', 
  'AG': 'Biru',
  'AH': 'Biru',
  'AI': 'Merah',
  'AK': 'Merah',
  'AN': 'Merah',
  'AO': 'Gold',
  'AP': 'Merah',
  'AR': 'Biru',
  'AT': 'Biru',
  'AZ': 'Biru',
  'BB': 'Merah',
  'BF': 'Biru',
  'BK': 'Coklat',
  'BQ': 'Coklat',
  'BR': 'Biru',
  'BS': 'Hijau',
  'CC': 'Biru',
  'CD': 'Orange',
  'CP': 'Kuning',
  'DD': 'Gold',
  'DH': 'Merah',
  'DP': 'Merah',
  'DR': 'Biru',
  'DU': 'Merah',
  'DX': 'Merah',
  'EL': 'Hijau',
  'EP': 'Gold',
  'ES': 'Biru',
  'FO': 'Biru',
  'FS': 'Biru',
  'FZ': 'Biru',
  'GA': 'Hijau',
  'GI': 'Biru',
  'GR': 'Biru',
  'GW': 'Merah',
  'HD': 'Biru',
  'HP': 'Biru',
  'IC': 'Gold',
  'ID': 'Biru',
  'IF': 'Biru',
  'IH': 'Biru',
  'II': 'Kuning',
  'IN': 'Biru',
  'IP': 'Kuning',
  'IT': 'Kuning',
  'IU': 'Biru',
  'KI': 'Coklat',
  'KK': 'Biru',
  'KZ': 'Biru',
  'LG': 'Biru',
  'LS': 'Biru',
  'MG': 'Orange',
  'MI': 'Merah',
  'MU': 'Hijau',
  'NI': 'Orange',
  'OD': 'Biru',
  'OK': 'Merah',
  'PC': 'Biru',
  'PD': 'Biru',
  'PF': 'Biru',
  'PG': 'Hijau',
  'PI': 'Pink',
  'PO': 'Gold',
  'PP': 'Biru',
  'PS': 'Coklat',
  'QA': 'Biru',
  'RB': 'Merah',
  'RF': 'Biru',
  'RG': 'Merah',
  'RO': 'Biru',
  'RS': 'Gold',
  'RX': 'Grey',
  'SA': 'Biru',
  'SF': 'Biru',
  'SH': 'Biru',
  'SQ': 'Biru',
  'SS': 'Biru',
  'TF': 'Biru',
  'TP': 'Merah',
  'TS': 'Biru',
  'XA': 'Kuning',
  'XC': 'Biru',
  'XL': 'Hijau',
  'YB': 'Hijau',
  'YJ': 'Biru',
  'YO': 'Merah',
  'YP': 'Biru',
  'YU': 'Biru',
  'ZP': 'Kuning',
  'ZR': 'Biru'
};

// Convert Indonesian color names to CSS classes (Light Mode)
export const COLOR_TO_CSS_CLASS_LIGHT: Record<string, string> = {
  'Biru': 'bg-blue-100 text-blue-900 border-blue-200',
  'Merah': 'bg-red-100 text-red-900 border-red-200',
  'Hijau': 'bg-green-100 text-green-900 border-green-200',
  'Kuning': 'bg-yellow-100 text-yellow-900 border-yellow-200',
  'Orange': 'bg-orange-100 text-orange-900 border-orange-200',
  'Coklat': 'bg-amber-100 text-amber-900 border-amber-200',
  'Gold': 'bg-yellow-200 text-yellow-800 border-yellow-300',
  'Pink': 'bg-pink-100 text-pink-900 border-pink-200',
  'Grey': 'bg-gray-100 text-gray-900 border-gray-200'
};

// Convert Indonesian color names to CSS classes (Dark Mode)
export const COLOR_TO_CSS_CLASS_DARK: Record<string, string> = {
  'Biru': 'bg-blue-900/30 text-blue-200 border-blue-700/50',
  'Merah': 'bg-red-900/30 text-red-200 border-red-700/50',
  'Hijau': 'bg-green-900/30 text-green-200 border-green-700/50',
  'Kuning': 'bg-yellow-900/30 text-yellow-200 border-yellow-700/50',
  'Orange': 'bg-orange-900/30 text-orange-200 border-orange-700/50',
  'Coklat': 'bg-amber-900/30 text-amber-200 border-amber-700/50',
  'Gold': 'bg-yellow-800/40 text-yellow-200 border-yellow-600/50',
  'Pink': 'bg-pink-900/30 text-pink-200 border-pink-700/50',
  'Grey': 'bg-gray-800/30 text-gray-200 border-gray-600/50'
};

// Get broker color class (supports dark mode)
export function getBrokerColorClass(brokerCode: string, isDarkMode: boolean = false): string {
  const colorName = BROKER_COLORS[brokerCode];
  if (!colorName) {
    return isDarkMode 
      ? 'bg-gray-800/30 text-gray-200 border-gray-600/50' 
      : 'bg-gray-100 text-gray-900 border-gray-200';
  }
  
  const colorMap = isDarkMode ? COLOR_TO_CSS_CLASS_DARK : COLOR_TO_CSS_CLASS_LIGHT;
  return colorMap[colorName] || (isDarkMode 
    ? 'bg-gray-800/30 text-gray-200 border-gray-600/50' 
    : 'bg-gray-100 text-gray-900 border-gray-200');
}

// Get broker color name
export function getBrokerColorName(brokerCode: string): string {
  return BROKER_COLORS[brokerCode] || 'Default';
}

// Get broker background color for table cells (supports dark mode)
export function getBrokerBackgroundClass(brokerCode: string, isDarkMode: boolean = false): string {
  const colorName = BROKER_COLORS[brokerCode];
  if (!colorName) {
    return isDarkMode ? 'bg-gray-800/20' : 'bg-gray-50';
  }
  
  if (isDarkMode) {
    switch (colorName) {
      case 'Biru': return 'bg-blue-900/20';
      case 'Merah': return 'bg-red-900/20';
      case 'Hijau': return 'bg-green-900/20';
      case 'Kuning': return 'bg-yellow-900/20';
      case 'Orange': return 'bg-orange-900/20';
      case 'Coklat': return 'bg-amber-900/20';
      case 'Gold': return 'bg-yellow-800/25';
      case 'Pink': return 'bg-pink-900/20';
      case 'Grey': return 'bg-gray-800/20';
      default: return 'bg-gray-800/20';
    }
  } else {
    switch (colorName) {
      case 'Biru': return 'bg-blue-50';
      case 'Merah': return 'bg-red-50';
      case 'Hijau': return 'bg-green-50';
      case 'Kuning': return 'bg-yellow-50';
      case 'Orange': return 'bg-orange-50';
      case 'Coklat': return 'bg-amber-50';
      case 'Gold': return 'bg-yellow-100';
      case 'Pink': return 'bg-pink-50';
      case 'Grey': return 'bg-gray-50';
      default: return 'bg-gray-50';
    }
  }
}

// Get broker text color for table cells (supports dark mode)
export function getBrokerTextClass(brokerCode: string, isDarkMode: boolean = false): string {
  const colorName = BROKER_COLORS[brokerCode];
  if (!colorName) {
    return isDarkMode ? 'text-gray-200' : 'text-gray-900';
  }
  
  if (isDarkMode) {
    switch (colorName) {
      case 'Biru': return 'text-blue-200';
      case 'Merah': return 'text-red-200';
      case 'Hijau': return 'text-green-200';
      case 'Kuning': return 'text-yellow-200';
      case 'Orange': return 'text-orange-200';
      case 'Coklat': return 'text-amber-200';
      case 'Gold': return 'text-yellow-200';
      case 'Pink': return 'text-pink-200';
      case 'Grey': return 'text-gray-200';
      default: return 'text-gray-200';
    }
  } else {
    switch (colorName) {
      case 'Biru': return 'text-blue-900';
      case 'Merah': return 'text-red-900';
      case 'Hijau': return 'text-green-900';
      case 'Kuning': return 'text-yellow-900';
      case 'Orange': return 'text-orange-900';
      case 'Coklat': return 'text-amber-900';
      case 'Gold': return 'text-yellow-800';
      case 'Pink': return 'text-pink-900';
      case 'Grey': return 'text-gray-900';
      default: return 'text-gray-900';
    }
  }
}
