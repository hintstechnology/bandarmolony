import { api } from '../services/api';

// Cache for stock list
let cachedStockList: string[] = [];
let isLoading = false;
let loadPromise: Promise<string[]> | null = null;

/**
 * Load stock list from backend API
 * This function fetches the stock list from csv_input/emiten_list.csv via the backend
 */
export async function loadStockList(): Promise<string[]> {
  // Return cached list if available
  if (cachedStockList.length > 0) {
    return cachedStockList;
  }

  // If already loading, return the existing promise
  if (isLoading && loadPromise) {
    return loadPromise;
  }

  // Start loading
  isLoading = true;
  loadPromise = (async () => {
    try {
      console.log('📊 Loading stock list from backend...');
      const response = await api.getEmitenList();

      if (response.success && response.data) {
        cachedStockList = response.data;
        console.log(`✅ Loaded ${cachedStockList.length} stocks from backend`);
        return cachedStockList;
      } else {
        console.error('❌ Failed to load stock list:', response.error);
        // Return empty array on error
        return [];
      }
    } catch (error) {
      console.error('❌ Error loading stock list:', error);
      // Return empty array on error
      return [];
    } finally {
      isLoading = false;
      loadPromise = null;
    }
  })();

  return loadPromise;
}

/**
 * Get the cached stock list (synchronous)
 * Returns the cached list or empty array if not loaded yet
 * Use loadStockList() to fetch from backend first
 */
export function getStockList(): string[] {
  return cachedStockList;
}

/**
 * Export for backward compatibility
 * This will be populated after loadStockList() is called
 */
export const STOCK_LIST = new Proxy([] as string[], {
  get(_target, prop) {
    // Return the cached list for array operations
    if (prop === 'length' || typeof prop === 'symbol' || !isNaN(Number(prop))) {
      return (cachedStockList as any)[prop];
    }
    // For array methods, bind to cachedStockList
    const value = (cachedStockList as any)[prop];
    if (typeof value === 'function') {
      return value.bind(cachedStockList);
    }
    return value;
  }
});

// Helper function to get stocks by prefix
export const getStocksByPrefix = (prefix: string): string[] => {
  const list = getStockList();
  if (!prefix) return list;
  return list.filter(stock =>
    stock.toLowerCase().startsWith(prefix.toLowerCase())
  );
};

// Helper function to search stocks
export const searchStocks = (query: string): string[] => {
  const list = getStockList();
  if (!query) return list;
  return list.filter(stock =>
    stock.toLowerCase().includes(query.toLowerCase())
  );
};