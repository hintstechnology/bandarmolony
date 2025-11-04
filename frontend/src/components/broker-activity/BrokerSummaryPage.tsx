import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Search, Loader2, Calendar } from 'lucide-react';

import { api } from '../../services/api';

interface BrokerSummaryData {
  broker: string;
  buyerVol: number;   // BuyerVol (for BLot in BUY table)
  buyerValue: number; // BuyerValue (for BVal in BUY table)
  bavg: number;       // BuyerAvg (for BAvg in BUY table)
  sellerVol: number;  // SellerVol (for SLot in SELL table)
  sellerValue: number; // SellerValue (for SVal in SELL table)
  savg: number;       // SellerAvg (for SAvg in SELL table)
  nblot: number;      // NetBuyVol (for NBLot in NET table) - legacy
  nbval: number;      // NetBuyValue (for NBVal in NET table) - legacy
  netBuyVol: number;  // NetBuyVol (for NBLot in NET table)
  netBuyValue: number; // NetBuyValue (for NBVal in NET table)
  // Legacy fields for backward compatibility
  sl: number;
  nslot: number;
  nsval: number;
}

// Note: TICKERS constant removed - now using dynamic stock loading from API

// Foreign brokers (red background)
const FOREIGN_BROKERS = [
  "AG", "AH", "AI", "AK", "BK", "BQ", "CG", "CS", "DP", "DR", "DU", "FS", "GW", "HD", "KK",
  "KZ", "LH", "LG", "LS", "MS", "NI", "RB", "RX", "TX", "YP", "YU", "ZP"
];

// Government brokers (green background)
const GOVERNMENT_BROKERS = ['CC', 'NI', 'OD', 'DX'];

// Note: local generator removed in favor of backend API

// Get last trading days (excluding weekends and today)
// Start from yesterday since today's data is not available yet
const getLastTradingDays = (count: number): string[] => {
  const today = new Date();
  const dates: string[] = [];
  let daysBack = 1; // Start from yesterday, skip today

  while (dates.length < count) {
    const date = new Date(today);
    date.setDate(date.getDate() - daysBack);
    const dayOfWeek = date.getDay();

    // Skip weekends (Saturday = 6, Sunday = 0)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      dates.push(date.toISOString().split('T')[0] ?? '');
    }
    daysBack++;
  }

  return dates;
};

// Get last three trading days
const getLastThreeDays = (): string[] => {
  return getLastTradingDays(3);
};

const formatNumber = (value: number): string => {
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (absValue >= 1000000000) {
    return `${sign}${(absValue / 1000000000).toFixed(1)}B`;
  } else if (absValue >= 1000000) {
    return `${sign}${(absValue / 1000000).toFixed(1)}M`;
  } else if (absValue >= 1000) {
    return `${sign}${(absValue / 1000).toFixed(1)}K`;
  }
  return value.toLocaleString();
};

// Format Lot: jika >= 1,000,000 gunakan format dengan K (1,000K), jika < 1,000,000 gunakan format koma ribuan biasa (12,000)
const formatLot = (value: number): string => {
  const rounded = Math.round(value);
  if (rounded >= 1000000) {
    // Format dengan K untuk nilai >= 1,000,000 (misal: 1,000,000 -> 1,000K)
    const thousands = rounded / 1000;
    return `${thousands.toLocaleString('en-US', { maximumFractionDigits: 0 })}K`;
  }
  // Format koma ribuan biasa untuk nilai < 1,000,000 (misal: 12,000 -> 12,000)
  return rounded.toLocaleString('en-US');
};

const formatAverage = (value: number): string => {
  return value.toLocaleString('id-ID', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });
};

const formatDisplayDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

interface BrokerSummaryPageProps {
  selectedStock?: string;
}

export function BrokerSummaryPage({ selectedStock: propSelectedStock }: BrokerSummaryPageProps) {
  const [selectedDates, setSelectedDates] = useState<string[]>(() => {
    const threeDays = getLastThreeDays();
    if (threeDays.length > 0) {
      const sortedDates = [...threeDays].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      return sortedDates;
    }
    return [];
  });
  const [startDate, setStartDate] = useState(() => {
    const threeDays = getLastThreeDays();
    if (threeDays.length > 0) {
      const sortedDates = [...threeDays].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      return sortedDates[0] ?? '';
    }
    return '';
  });
  const [endDate, setEndDate] = useState(() => {
    const threeDays = getLastThreeDays();
    if (threeDays.length > 0) {
      const sortedDates = [...threeDays].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      return sortedDates[sortedDates.length - 1] ?? '';
    }
    return '';
  });
  const [selectedTickers, setSelectedTickers] = useState<string[]>(propSelectedStock ? [propSelectedStock] : ['BBCA']);
  const [tickerInput, setTickerInput] = useState<string>('');
  const [fdFilter, setFdFilter] = useState<'All' | 'Foreign' | 'Domestic'>('All');
  const [marketFilter, setMarketFilter] = useState<'RG' | 'TN' | 'NG' | ''>('');

  // Stock selection state
  const [availableStocks, setAvailableStocks] = useState<string[]>([]);
  const [showStockSuggestions, setShowStockSuggestions] = useState(false);
  const [highlightedStockIndex, setHighlightedStockIndex] = useState<number>(-1);
  const [stockSearchTimeout, setStockSearchTimeout] = useState<NodeJS.Timeout | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);
  const valueTableRef = useRef<HTMLTableElement>(null);
  const netTableRef = useRef<HTMLTableElement>(null);
  const valueTableContainerRef = useRef<HTMLDivElement>(null);
  const netTableContainerRef = useRef<HTMLDivElement>(null);

  // Column widths state - store widths for Value table columns
  const [columnWidths, setColumnWidths] = useState<{
    BY: string;
    BLot: string;
    BVal: string;
    BAvg: string;
    hash: string; // '#'
    SL: string;
    SLot: string;
    SVal: string;
    SAvg: string;
  }>({
    BY: 'w-4',
    BLot: 'w-6',
    BVal: 'w-6',
    BAvg: 'w-6',
    hash: 'w-4',
    SL: 'w-4',
    SLot: 'w-6',
    SVal: 'w-6',
    SAvg: 'w-6',
  });

  // Date column group widths - store width for each date column group (colspan=9)
  const [dateColumnWidths, setDateColumnWidths] = useState<Map<string, string>>(new Map());

  // API-driven broker summary data by date
  const [summaryByDate, setSummaryByDate] = useState<Map<string, BrokerSummaryData[]>>(new Map());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isDataReady, setIsDataReady] = useState<boolean>(false); // Control when to show tables

  // Cache for API responses to avoid redundant calls
  // Key format: `${ticker}-${date}-${market}`
  const dataCacheRef = useRef<Map<string, { data: BrokerSummaryData[]; timestamp: number }>>(new Map());

  // Cache expiration time: 5 minutes
  const CACHE_EXPIRY_MS = 5 * 60 * 1000;

  // Update selectedTickers when prop changes
  useEffect(() => {
    if (propSelectedStock && !selectedTickers.includes(propSelectedStock)) {
      setSelectedTickers([propSelectedStock]);
      setTickerInput('');
    }
  }, [propSelectedStock]);

  // Load available stocks when dates change
  useEffect(() => {
    const loadAvailableStocks = async () => {
      if (selectedDates.length === 0) return;

      try {
        // Load stocks for the first selected date
        if (selectedDates[0]) {
          // When marketFilter is empty string (All Trade), send it as empty string
          const market = marketFilter || '';
          const stocksResult = await api.getBrokerSummaryStocks(selectedDates[0], market as 'RG' | 'TN' | 'NG' | '');
          if (stocksResult.success && stocksResult.data?.stocks) {
            setAvailableStocks(stocksResult.data.stocks);
          }
        }
      } catch (err) {
        console.error('Error loading available stocks:', err);
        // Don't show error toast for stocks loading, just log it
      }
    };

    loadAvailableStocks();
  }, [selectedDates, marketFilter]);

  // Hide tables immediately when dependencies change (before fetch starts)
  // This ensures tables disappear instantly when user changes date/ticker
  // Use useLayoutEffect to run synchronously before paint, preventing flash of old content
  useLayoutEffect(() => {
    // Clear data and hide tables immediately when dependencies change
    setSummaryByDate(new Map());
    setIsDataReady(false);
  }, [selectedTickers, selectedDates, marketFilter]);

  // Load broker summary data from backend for each selected date and aggregate multiple tickers
  useEffect(() => {
    const fetchAll = async () => {
      if (selectedTickers.length === 0 || selectedDates.length === 0) {
        return;
      }

      // Start loading (data and tables already cleared by the separate useEffect above)
      // But add safety check here too to ensure tables are hidden
      setIsDataReady(false);
      setIsLoading(true);
      setError(null);

      try {
        const market = marketFilter || '';
        const now = Date.now();
        const cache = dataCacheRef.current;

        // Clear expired cache entries
        for (const [key, value] of cache.entries()) {
          if (now - value.timestamp > CACHE_EXPIRY_MS) {
            cache.delete(key);
          }
        }

        // Fetch data for all selected tickers and all dates (with cache)
        const allDataPromises = selectedTickers.flatMap(ticker =>
          selectedDates.map(async (date) => {
            const cacheKey = `${ticker}-${date}-${market}`;
            const cached = cache.get(cacheKey);

            // Check cache first
            if (cached && (now - cached.timestamp) <= CACHE_EXPIRY_MS) {
              console.log(`[BrokerSummary] Using cached data for ${ticker} on ${date}`);
              return { ticker, date, data: cached.data };
            }

            // Fetch from API
            console.log(`[BrokerSummary] Fetching data for ${ticker} on ${date} with market: ${market || 'All Trade'}`);
            const res = await api.getBrokerSummaryData(ticker, date, market as 'RG' | 'TN' | 'NG' | '');

            // Check if response is successful
            if (!res || !res.success) {
              console.error(`[BrokerSummary] Failed to fetch data for ${ticker} on ${date}:`, res?.error || 'Unknown error');
              return { ticker, date, data: [] };
            }

            // Check if brokerData exists
            if (!res.data || !res.data.brokerData || !Array.isArray(res.data.brokerData)) {
              console.warn(`[BrokerSummary] No broker data in response for ${ticker} on ${date}`);
              return { ticker, date, data: [] };
            }

            const rows: BrokerSummaryData[] = (res.data.brokerData ?? []).map((r: any) => {
              return {
                broker: r.BrokerCode ?? r.broker ?? r.BROKER ?? r.code ?? '',
                buyerVol: Number(r.BuyerVol ?? 0),
                buyerValue: Number(r.BuyerValue ?? 0),
                bavg: Number(r.BuyerAvg ?? r.bavg ?? 0),
                sellerVol: Number(r.SellerVol ?? 0),
                sellerValue: Number(r.SellerValue ?? 0),
                savg: Number(r.SellerAvg ?? r.savg ?? 0),
                netBuyVol: Number(r.NetBuyVol ?? 0),
                netBuyValue: Number(r.NetBuyValue ?? 0),
                nblot: Number(r.NetBuyVol ?? r.nblot ?? 0),
                nbval: Number(r.NetBuyValue ?? r.nbval ?? 0),
                sl: Number(r.SellerVol ?? r.sl ?? 0),
                nslot: -Number(r.SellerVol ?? 0),
                nsval: -Number(r.SellerValue ?? 0)
              };
            }) as BrokerSummaryData[];

            // Store in cache
            cache.set(cacheKey, { data: rows, timestamp: now });
            console.log(`[BrokerSummary] Cached data for ${ticker} on ${date}`);

            return { ticker, date, data: rows };
          })
        );

        const allDataResults = await Promise.all(allDataPromises);

        // Aggregate data per date and per broker (sum all tickers)
        const aggregatedMap = new Map<string, Map<string, BrokerSummaryData>>();

        selectedDates.forEach(date => {
          aggregatedMap.set(date, new Map<string, BrokerSummaryData>());
        });

        allDataResults.forEach(({ date, data }) => {
          const dateMap = aggregatedMap.get(date);
          if (!dateMap) return;

          data.forEach(row => {
            const broker = row.broker;
            if (!broker) return;

            const existing = dateMap.get(broker);
            if (existing) {
              // Sum values from multiple tickers
              existing.buyerVol += row.buyerVol;
              existing.buyerValue += row.buyerValue;
              existing.sellerVol += row.sellerVol;
              existing.sellerValue += row.sellerValue;
              existing.netBuyVol += row.netBuyVol;
              existing.netBuyValue += row.netBuyValue;
              existing.nblot += row.nblot;
              existing.nbval += row.nbval;
              existing.sl += row.sl;

              // Recalculate nslot and nsval from aggregated seller values (negative values)
              existing.nslot = -existing.sellerVol;
              existing.nsval = -existing.sellerValue;

              // Recalculate averages
              existing.bavg = existing.buyerVol > 0 ? existing.buyerValue / existing.buyerVol : 0;
              existing.savg = existing.sellerVol > 0 ? existing.sellerValue / existing.sellerVol : 0;
            } else {
              // First occurrence of this broker for this date
              dateMap.set(broker, { ...row });
            }
          });
        });

        // Convert aggregated map to the format expected by the component
        const finalMap = new Map<string, BrokerSummaryData[]>();
        aggregatedMap.forEach((brokerMap, date) => {
          const rows = Array.from(brokerMap.values());
          finalMap.set(date, rows);
          console.log(`[BrokerSummary] Aggregated ${rows.length} brokers for date ${date} from ${selectedTickers.length} ticker(s)`);
        });

        // Store data first (but tables won't show yet because isDataReady is still false)
        setSummaryByDate(finalMap);

        const totalRows = Array.from(finalMap.values()).reduce((sum, rows) => sum + rows.length, 0);
        console.log(`[BrokerSummary] Total aggregated rows: ${totalRows} across ${finalMap.size} dates from ${selectedTickers.join(', ')}`);

        // Mark loading as complete (data is set, but tables still hidden)
        setIsLoading(false);

        // Wait for all frontend calculations and DOM rendering to complete before showing tables
        // This prevents lag by ensuring everything is pre-calculated and rendered off-screen
        // Strategy: Use multiple requestAnimationFrame + setTimeout to ensure:
        // 1. React state updates are flushed
        // 2. DOM is fully rendered (even if hidden)
        // 3. All measurements and calculations are complete
        // 4. Browser has time to complete layout calculations

        // First, wait for React state updates to flush
        requestAnimationFrame(() => {
          // Second, wait for DOM rendering
          requestAnimationFrame(() => {
            // Third, wait for browser layout calculations to complete
            setTimeout(() => {
              // Fourth, check that tables are in DOM and measurements are complete
              requestAnimationFrame(() => {
                // Tables should be in DOM now (rendered but hidden)
                // Give additional time for measureColumnWidths and syncTableWidths useEffects
                // These useEffects need time to complete their measurements
                setTimeout(() => {
                  setIsDataReady(true);
                }, 400); // Sufficient delay for all measurements to complete
              });
            }, 300); // Initial delay for layout calculations
          });
        });
      } catch (e: any) {
        console.error('[BrokerSummary] Error fetching data:', e);
        setError(e?.message || 'Failed to load broker summary');
        setIsLoading(false);
        setIsDataReady(false);
      }
    };

    fetchAll();
  }, [selectedTickers, selectedDates, marketFilter]);

  // Measure and store column widths from VALUE table, including date column group widths
  useEffect(() => {
    const measureColumnWidths = () => {
      const valueTable = valueTableRef.current;
      if (!valueTable || selectedDates.length === 0) return;

      // Get header rows
      const valueHeaderRows = valueTable.querySelectorAll('thead tr');
      if (valueHeaderRows.length < 2) return;

      // Get the first header row (date headers with colspan=9)
      const valueDateHeaderRow = valueHeaderRows[0];
      if (!valueDateHeaderRow) return;

      // Measure width of each date column group (colspan=9)
      // Also check body cells to get actual rendered width (important for multiple emiten sums)
      const dateHeaderCells = valueDateHeaderRow.querySelectorAll('th[colspan="9"]');
      const valueBodyRows = valueTable.querySelectorAll('tbody tr');
      const newDateColumnWidths = new Map<string, string>();

      selectedDates.forEach((date, dateIndex) => {
        const dateHeaderCell = dateHeaderCells[dateIndex] as HTMLElement;
        let maxDateWidth = 0;

        if (dateHeaderCell && dateHeaderCell.offsetWidth > 0) {
          maxDateWidth = dateHeaderCell.offsetWidth;
        }

        // Check actual width from body rows (important when content grows due to sums)
        // Use a more conservative approach: measure based on scrollWidth if available, otherwise use offsetWidth
        if (valueBodyRows.length > 0) {
          // Get the first non-empty row for this date to measure
          let sampleRow: HTMLTableRowElement | null = null;
          for (let i = 0; i < valueBodyRows.length; i++) {
            const row = valueBodyRows[i] as HTMLTableRowElement;
            const cells = Array.from(row.children);
            const startIdx = dateIndex * 9;
            if (cells.length > startIdx + 8) {
              sampleRow = row;
              break;
            }
          }

          if (sampleRow) {
            const cells = Array.from(sampleRow.children);
            const startIdx = dateIndex * 9;
            const endIdx = startIdx + 9;
            const dateGroupCells = cells.slice(startIdx, endIdx);

            // Calculate total width of this date column group from cells
            // Use scrollWidth for more accurate measurement, but limit to reasonable bounds
            let groupWidth = 0;
            dateGroupCells.forEach((cell) => {
              const cellEl = cell as HTMLElement;
              if (cellEl) {
                const cellWidth = cellEl.scrollWidth || cellEl.offsetWidth || 0;
                groupWidth += cellWidth;
              }
            });

            // Only update if the measured width is reasonable (not excessively wide)
            // If groupWidth is more than 2x the header width, something is wrong - use header width instead
            if (maxDateWidth > 0 && groupWidth > maxDateWidth * 2) {
              // Keep the header width, don't use the inflated body width
            } else if (groupWidth > maxDateWidth) {
              maxDateWidth = groupWidth;
            }
          }
        }

        if (maxDateWidth > 0) {
          newDateColumnWidths.set(date, `${maxDateWidth}px`);
        }
      });

      // Update date column widths if we have measurements (only if changed)
      if (newDateColumnWidths.size > 0) {
        // Check if widths actually changed to avoid unnecessary re-renders
        let hasChanged = false;
        if (dateColumnWidths.size !== newDateColumnWidths.size) {
          hasChanged = true;
        } else {
          for (const [date, width] of newDateColumnWidths.entries()) {
            if (dateColumnWidths.get(date) !== width) {
              hasChanged = true;
              break;
            }
          }
        }
        if (hasChanged) {
          setDateColumnWidths(newDateColumnWidths);
        }
      }

      // Get the second header row (the one with column headers: BY, BLot, etc.)
      const valueColumnHeaderRow = valueHeaderRows[1];
      if (!valueColumnHeaderRow) return;

      // Get the first date column group to measure individual column widths
      const valueDateHeaderCells = valueColumnHeaderRow.querySelectorAll('th');

      // Find first date column group (skip Total columns at the end)
      // Each date has 9 columns: BY, BLot, BVal, BAvg, #, SL, SLot, SVal, SAvg
      if (valueDateHeaderCells.length >= 9) {
        type ColumnName = 'BY' | 'BLot' | 'BVal' | 'BAvg' | 'hash' | 'SL' | 'SLot' | 'SVal' | 'SAvg';
        const widths: Partial<Record<ColumnName, string>> = {};

        // Measure each column in the first date group (index 0-8)
        // Column order: BY, BLot, BVal, BAvg, #, SL, SLot, SVal, SAvg
        const columnNames: ColumnName[] = ['BY', 'BLot', 'BVal', 'BAvg', 'hash', 'SL', 'SLot', 'SVal', 'SAvg'];

        columnNames.forEach((colName, idx) => {
          const headerCell = valueDateHeaderCells[idx] as HTMLElement;
          if (headerCell && headerCell.offsetWidth > 0) {
            // Store as pixel value
            widths[colName] = `${headerCell.offsetWidth}px`;
          }
        });

        // Check all body cells for more accurate measurement (to handle multiple emiten sums)
        const valueBodyRows = valueTable.querySelectorAll('tbody tr');
        if (valueBodyRows.length > 0) {
          // Measure maximum width across all rows for each column
          valueBodyRows.forEach((row) => {
            const dateCells = Array.from(row.children).slice(0, 9);

            dateCells.forEach((cell, idx) => {
              if (idx < columnNames.length) {
                const colName = columnNames[idx];
                if (colName) {
                  const cellEl = cell as HTMLElement;
                  if (cellEl && cellEl.offsetWidth > 0) {
                    const existingWidth = widths[colName];
                    if (!existingWidth) {
                      widths[colName] = `${cellEl.offsetWidth}px`;
                    } else {
                      // Use the maximum width across all cells
                      const existingWidthNum = parseInt(existingWidth || '0') || 0;
                      if (cellEl.offsetWidth > existingWidthNum) {
                        widths[colName] = `${cellEl.offsetWidth}px`;
                      }
                    }
                  }
                }
              }
            });
          });
        }

        // Update column widths state if we have all measurements (only if changed)
        if (widths.BY && widths.BLot && widths.BVal && widths.BAvg && widths.hash &&
          widths.SL && widths.SLot && widths.SVal && widths.SAvg) {
          const newWidths = {
            BY: widths.BY || 'w-4',
            BLot: widths.BLot || 'w-6',
            BVal: widths.BVal || 'w-6',
            BAvg: widths.BAvg || 'w-6',
            hash: widths.hash || 'w-4',
            SL: widths.SL || 'w-4',
            SLot: widths.SLot || 'w-6',
            SVal: widths.SVal || 'w-6',
            SAvg: widths.SAvg || 'w-6',
          };

          // Check if widths actually changed to avoid unnecessary re-renders
          const hasChanged = Object.keys(newWidths).some(key => {
            return columnWidths[key as keyof typeof columnWidths] !== newWidths[key as keyof typeof newWidths];
          });

          if (hasChanged) {
            setColumnWidths(newWidths);
          }
        }
      }
    };

    // Debounce function to avoid too frequent measurements
    let debounceTimer: NodeJS.Timeout | null = null;
    const debouncedMeasure = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        measureColumnWidths();
      }, 150);
    };

    // Initial measurement with single delay (optimized)
    const initialTimeoutId = setTimeout(() => measureColumnWidths(), 300);

    // Measure after data loads (with delay to ensure rendering is complete)
    let dataTimeoutId: NodeJS.Timeout | null = null;
    if (!isLoading && summaryByDate.size > 0) {
      dataTimeoutId = setTimeout(() => measureColumnWidths(), 600);
    }

    // Use ResizeObserver to watch for changes (with debouncing)
    let resizeObserver: ResizeObserver | null = null;

    if (valueTableRef.current) {
      resizeObserver = new ResizeObserver(() => {
        debouncedMeasure();
      });
      resizeObserver.observe(valueTableRef.current);
    }

    // Also watch the container
    if (valueTableContainerRef.current) {
      if (!resizeObserver) {
        resizeObserver = new ResizeObserver(() => {
          debouncedMeasure();
        });
      }
      resizeObserver.observe(valueTableContainerRef.current);
    }

    return () => {
      clearTimeout(initialTimeoutId);
      if (dataTimeoutId) clearTimeout(dataTimeoutId);
      if (debounceTimer) clearTimeout(debounceTimer);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [summaryByDate, selectedDates, selectedTickers, isLoading]);

  // Sync NET table width with VALUE table width dynamically, including date column group widths
  useEffect(() => {
    const syncTableWidths = () => {
      const valueTable = valueTableRef.current;
      const netTable = netTableRef.current;
      const valueContainer = valueTableContainerRef.current;
      const netContainer = netTableContainerRef.current;

      if (!valueTable || !netTable) return;

      // Sync overall table width - ensure NET is not wider than VALUE
      const valueTableWidth = valueTable.scrollWidth || valueTable.offsetWidth;

      if (valueTableWidth > 0) {
        // Use Value table width exactly, don't let Net table grow wider
        netTable.style.width = `${valueTableWidth}px`;
        netTable.style.minWidth = `${valueTableWidth}px`;
        netTable.style.maxWidth = `${valueTableWidth}px`; // Prevent Net from being wider

        if (netContainer) {
          netContainer.style.width = `${valueTableWidth}px`;
          netContainer.style.minWidth = `${valueTableWidth}px`;
          netContainer.style.maxWidth = `${valueTableWidth}px`; // Prevent container from being wider
        }

        // Sync container scroll width - ensure NET container has same width as VALUE container
        if (valueContainer && netContainer) {
          const valueContainerWidth = valueContainer.clientWidth || valueContainer.offsetWidth;
          if (valueContainerWidth > 0) {
            // Use exact VALUE container width, don't exceed screen width
            netContainer.style.width = `${valueContainerWidth}px`;
            netContainer.style.minWidth = `${valueContainerWidth}px`;
            netContainer.style.maxWidth = `${valueContainerWidth}px`;
          }
        }

        // Ensure parent wrapper NET has same width as VALUE parent wrapper
        const valueParentWrapper = valueContainer?.parentElement;
        const netParentWrapper = netContainer?.parentElement;
        if (valueParentWrapper && netParentWrapper) {
          const valueParentWidth = valueParentWrapper.clientWidth || valueParentWrapper.offsetWidth;
          if (valueParentWidth > 0) {
            netParentWrapper.style.width = `${valueParentWidth}px`;
            netParentWrapper.style.minWidth = `${valueParentWidth}px`;
            netParentWrapper.style.maxWidth = `${valueParentWidth}px`;
          }
        }

        // Sync main wrapper width (the div with className="w-full max-w-full")
        const valueMainWrapper = valueContainer?.parentElement?.parentElement;
        const netMainWrapper = netContainer?.parentElement?.parentElement;
        if (valueMainWrapper && netMainWrapper) {
          const valueMainWidth = valueMainWrapper.clientWidth || valueMainWrapper.offsetWidth;
          if (valueMainWidth > 0) {
            netMainWrapper.style.width = `${valueMainWidth}px`;
            netMainWrapper.style.maxWidth = `${valueMainWidth}px`;
          }
        }
      }

      // Sync date column group widths (colspan=9 headers)
      const valueHeaderRows = valueTable.querySelectorAll('thead tr');
      const netHeaderRows = netTable.querySelectorAll('thead tr');

      if (valueHeaderRows.length >= 2 && netHeaderRows.length >= 2) {
        // Get first header row (date headers with colspan=9)
        const netDateHeaderRow = netHeaderRows[0];
        const valueDateHeaderRow = valueHeaderRows[0];

        if (netDateHeaderRow && valueDateHeaderRow) {
          const netDateHeaderCells = netDateHeaderRow.querySelectorAll('th[colspan="9"]');
          const valueDateHeaderCells = valueDateHeaderRow.querySelectorAll('th[colspan="9"]');

          selectedDates.forEach((date, dateIndex) => {
            const netDateHeaderCell = netDateHeaderCells[dateIndex] as HTMLElement;
            const valueDateHeaderCell = valueDateHeaderCells[dateIndex] as HTMLElement;

            if (netDateHeaderCell && valueDateHeaderCell) {
              // Get width from VALUE table (actual rendered width)
              let dateWidth: string | undefined;

              if (valueDateHeaderCell.offsetWidth > 0) {
                // Use actual width from VALUE table
                dateWidth = `${valueDateHeaderCell.offsetWidth}px`;
              } else if (dateColumnWidths.size > 0) {
                // Fallback to stored width if available
                dateWidth = dateColumnWidths.get(date);
              }

              if (dateWidth) {
                // Apply the date column group width - use exact width from Value table
                netDateHeaderCell.style.width = dateWidth;
                netDateHeaderCell.style.minWidth = dateWidth;
                netDateHeaderCell.style.maxWidth = dateWidth; // Prevent Net from being wider

                // Also ensure the value date header has the same width for consistency
                valueDateHeaderCell.style.width = dateWidth;
                valueDateHeaderCell.style.minWidth = dateWidth;
              }
            }
          });

          // Also sync Total column header width
          const valueTotalHeaderCell = valueDateHeaderCells[valueDateHeaderCells.length - 1] as HTMLElement;
          const netTotalHeaderCell = netDateHeaderCells[netDateHeaderCells.length - 1] as HTMLElement;

          if (valueTotalHeaderCell && netTotalHeaderCell && valueTotalHeaderCell.offsetWidth > 0) {
            const totalWidth = `${valueTotalHeaderCell.offsetWidth}px`;
            netTotalHeaderCell.style.width = totalWidth;
            netTotalHeaderCell.style.minWidth = totalWidth;
            netTotalHeaderCell.style.maxWidth = totalWidth;
          }
        }

        // Sync individual column widths using stored columnWidths or actual widths
        const valueColumnHeaderRow = valueHeaderRows[1];
        const netColumnHeaderRow = netHeaderRows[1];

        if (valueColumnHeaderRow && netColumnHeaderRow) {
          // Apply column widths to NET table header cells
          const netHeaderCells = netColumnHeaderRow.querySelectorAll('th');
          const valueHeaderCells = valueColumnHeaderRow.querySelectorAll('th');
          const columnOrder = ['BY', 'BLot', 'BVal', 'BAvg', 'hash', 'SL', 'SLot', 'SVal', 'SAvg'];

          // Apply widths to each date column group
          selectedDates.forEach((_, dateIndex) => {
            const startIdx = dateIndex * 9;
            columnOrder.forEach((colName, idx) => {
              const netHeaderCell = netHeaderCells[startIdx + idx] as HTMLElement;
              const valueHeaderCell = valueHeaderCells[startIdx + idx] as HTMLElement;

              if (netHeaderCell && valueHeaderCell) {
                let width: string | undefined;

                // Try to use actual width from VALUE table first
                if (valueHeaderCell.offsetWidth > 0) {
                  width = `${valueHeaderCell.offsetWidth}px`;
                } else if (columnWidths[colName as keyof typeof columnWidths] && columnWidths[colName as keyof typeof columnWidths].includes('px')) {
                  // Fallback to stored width
                  width = columnWidths[colName as keyof typeof columnWidths];
                }

                if (width) {
                  netHeaderCell.style.width = width;
                  netHeaderCell.style.minWidth = width;
                  netHeaderCell.style.maxWidth = width; // Prevent Net from being wider
                }
              }
            });
          });

          // Sync Total column headers
          const totalStartIdx = selectedDates.length * 9;
          columnOrder.forEach((colName, idx) => {
            const netHeaderCell = netHeaderCells[totalStartIdx + idx] as HTMLElement;
            const valueHeaderCell = valueHeaderCells[totalStartIdx + idx] as HTMLElement;

            if (netHeaderCell && valueHeaderCell && valueHeaderCell.offsetWidth > 0) {
              const width = `${valueHeaderCell.offsetWidth}px`;
              netHeaderCell.style.width = width;
              netHeaderCell.style.minWidth = width;
              netHeaderCell.style.maxWidth = width;
            }
          });

          // Apply widths to body cells (including "No Data" row)
          const valueBodyRows = valueTable.querySelectorAll('tbody tr');
          const netBodyRows = netTable.querySelectorAll('tbody tr');

          // Sync all rows (including empty or "No Data" rows)
          const maxRows = Math.max(valueBodyRows.length, netBodyRows.length);

          for (let rowIndex = 0; rowIndex < maxRows; rowIndex++) {
            const valueRow = valueBodyRows[rowIndex] as HTMLTableRowElement;
            const netRow = netBodyRows[rowIndex] as HTMLTableRowElement;

            if (!valueRow || !netRow) continue;

            // Sync date column groups
            selectedDates.forEach((_, dateIndex) => {
              const startIdx = dateIndex * 9;
              columnOrder.forEach((colName, idx) => {
                const netCell = netRow.children[startIdx + idx] as HTMLElement;
                const valueCell = valueRow.children[startIdx + idx] as HTMLElement;

                if (netCell && valueCell) {
                  let width: string | undefined;

                  // Try to use actual width from VALUE table first
                  if (valueCell.offsetWidth > 0) {
                    width = `${valueCell.offsetWidth}px`;
                  } else if (columnWidths[colName as keyof typeof columnWidths] && columnWidths[colName as keyof typeof columnWidths].includes('px')) {
                    // Fallback to stored width
                    width = columnWidths[colName as keyof typeof columnWidths];
                  }

                  if (width) {
                    netCell.style.width = width;
                    netCell.style.minWidth = width;
                    netCell.style.maxWidth = width; // Prevent Net from being wider
                  }
                }
              });
            });

            // Sync Total column cells
            const totalStartIdx = selectedDates.length * 9;
            columnOrder.forEach((colName, idx) => {
              const netCell = netRow.children[totalStartIdx + idx] as HTMLElement;
              const valueCell = valueRow.children[totalStartIdx + idx] as HTMLElement;

              if (netCell && valueCell && valueCell.offsetWidth > 0) {
                const width = `${valueCell.offsetWidth}px`;
                netCell.style.width = width;
                netCell.style.minWidth = width;
                netCell.style.maxWidth = width;
              }
            });
          }
        }
      }
    };

    // Debounce function to avoid too frequent syncs
    let debounceTimer: NodeJS.Timeout | null = null;
    const debouncedSync = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        syncTableWidths();
      }, 100);
    };

    // Initial sync with single delay (optimized)
    const initialTimeoutId = setTimeout(() => {
      syncTableWidths();
    }, 400);

    // Sync after data finishes loading or when empty
    // This ensures width sync works even when data is empty (showing "No Data" row)
    let dataTimeoutId: NodeJS.Timeout | null = null;
    if (!isLoading) {
      dataTimeoutId = setTimeout(() => {
        syncTableWidths();
      }, 700);
    }

    // Use ResizeObserver to watch for changes in VALUE table width (with debouncing)
    let resizeObserver: ResizeObserver | null = null;

    if (valueTableRef.current) {
      resizeObserver = new ResizeObserver(() => {
        debouncedSync();
      });
      resizeObserver.observe(valueTableRef.current);
    }

    // Also watch the container
    if (valueTableContainerRef.current) {
      if (!resizeObserver) {
        resizeObserver = new ResizeObserver(() => {
          debouncedSync();
        });
      }
      resizeObserver.observe(valueTableContainerRef.current);
    }

    // Also sync on window resize (with debouncing)
    const handleResize = () => {
      debouncedSync();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(initialTimeoutId);
      if (dataTimeoutId) clearTimeout(dataTimeoutId);
      if (debounceTimer) clearTimeout(debounceTimer);
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [summaryByDate, selectedDates, selectedTickers, isLoading, columnWidths, dateColumnWidths]);

  // Synchronize horizontal scroll between Value and Net tables
  useEffect(() => {
    // Wait for tables to be ready (data loaded and DOM rendered)
    if (isLoading || !isDataReady) return;

    const valueContainer = valueTableContainerRef.current;
    const netContainer = netTableContainerRef.current;

    if (!valueContainer || !netContainer) return;

    // Flag to prevent infinite loop when programmatically updating scroll
    let isSyncing = false;

    // Handle Value table scroll - sync to Net table
    const handleValueScroll = () => {
      if (!isSyncing && netContainer) {
        isSyncing = true;
        netContainer.scrollLeft = valueContainer.scrollLeft;
        requestAnimationFrame(() => {
          isSyncing = false;
        });
      }
    };

    // Handle Net table scroll - sync to Value table
    const handleNetScroll = () => {
      if (!isSyncing && valueContainer) {
        isSyncing = true;
        valueContainer.scrollLeft = netContainer.scrollLeft;
        requestAnimationFrame(() => {
          isSyncing = false;
        });
      }
    };

    // Add event listeners
    valueContainer.addEventListener('scroll', handleValueScroll, { passive: true });
    netContainer.addEventListener('scroll', handleNetScroll, { passive: true });

    return () => {
      valueContainer.removeEventListener('scroll', handleValueScroll);
      netContainer.removeEventListener('scroll', handleNetScroll);
    };
  }, [isLoading, isDataReady, summaryByDate]); // Re-setup when data changes

  // clearAllDates removed with Reset button

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowStockSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (stockSearchTimeout) {
        clearTimeout(stockSearchTimeout);
      }
    };
  }, [stockSearchTimeout]);

  const handleStockSelect = (stock: string) => {
    if (!selectedTickers.includes(stock)) {
      setSelectedTickers([...selectedTickers, stock]);
    }
    setTickerInput('');
    setShowStockSuggestions(false);
  };

  const handleRemoveTicker = (stock: string) => {
    setSelectedTickers(selectedTickers.filter(t => t !== stock));
  };

  const handleStockInputChange = (value: string) => {
    setTickerInput(value);
    setShowStockSuggestions(true);

    // Clear previous timeout
    if (stockSearchTimeout) {
      clearTimeout(stockSearchTimeout);
    }

    // Set new timeout for debounced stock loading
    const timeout = setTimeout(async () => {
      // Load stocks if not already loaded and user is typing
      if (availableStocks.length === 0 && selectedDates.length > 0 && selectedDates[0]) {
        try {
          const stocksResult = await api.getBrokerSummaryStocks(selectedDates[0]);
          if (stocksResult.success && stocksResult.data?.stocks) {
            setAvailableStocks(stocksResult.data.stocks);
          }
        } catch (err) {
          console.error('Error loading stocks:', err);
        }
      }
    }, 300); // 300ms debounce

    setStockSearchTimeout(timeout);

    // If exact match, select it
    const upperValue = value.toUpperCase();
    if ((availableStocks || []).includes(upperValue) && !selectedTickers.includes(upperValue)) {
      setSelectedTickers([...selectedTickers, upperValue]);
      setTickerInput('');
      setShowStockSuggestions(false);
    }
  };

  const filteredStocks = (availableStocks || []).filter(stock =>
    stock.toLowerCase().includes(tickerInput.toLowerCase()) && !selectedTickers.includes(stock)
  );

  // Helper function to trigger date picker
  const triggerDatePicker = (inputRef: React.RefObject<HTMLInputElement>) => {
    if (inputRef.current) {
      inputRef.current.showPicker();
    }
  };

  // Helper function to format date for input (YYYY-MM-DD)
  const formatDateForInput = (date: string) => {
    return date; // Already in YYYY-MM-DD format
  };

  // Font size fixed to normal (no menu)
  const getFontSizeClass = () => 'text-[13px]';

  // Helper function to filter brokers by F/D
  const brokerFDScreen = (broker: string): boolean => {
    if (fdFilter === 'Foreign') {
      return FOREIGN_BROKERS.includes(broker) && !GOVERNMENT_BROKERS.includes(broker);
    }
    if (fdFilter === 'Domestic') {
      return (!FOREIGN_BROKERS.includes(broker) || GOVERNMENT_BROKERS.includes(broker));
    }
    return true; // All
  };

  const renderHorizontalView = () => {
    if (selectedTickers.length === 0 || selectedDates.length === 0) return null;

    // Show loading state if still loading or data not ready
    // But we'll still render tables in DOM (hidden) to allow pre-calculation
    const showLoading = isLoading || !isDataReady;

    if (showLoading && summaryByDate.size === 0) {
      // No data yet, show loading
      return (
        <div className="w-full flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <div className="text-sm text-muted-foreground">Loading broker summary...</div>
          </div>
        </div>
      );
    }

    // If we have data but still processing, render tables hidden so calculations can complete
    // This allows all frontend calculations to finish before showing tables

    // Show error state
    if (error) {
      return (
        <div className="w-full px-4 py-8">
          <div className="text-sm text-destructive px-4 py-2 bg-destructive/10 rounded-md">
            {error}
          </div>
        </div>
      );
    }

    // Filter out dates with no data to prevent parse errors and lag
    // Only show dates that have actual data in summaryByDate
    const availableDates = selectedDates.filter(date => {
      const rows = summaryByDate.get(date);
      return rows && rows.length > 0; // Only include dates with data
    });

    // Build view model from API data (for each available date only)
    const allBrokerData = availableDates.map(date => {
      const rows = summaryByDate.get(date) || [];
      return {
        date,
        buyData: rows,
        sellData: rows
      };
    });

    return (
      <div className="w-full relative">
        {/* Loading overlay - shown when processing */}
        {showLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0f20]/80 z-50">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <div className="text-sm text-muted-foreground">Loading broker summary...</div>
            </div>
          </div>
        )}

        {/* Tables - rendered in DOM but hidden when processing */}
        {/* Use opacity: 0 instead of visibility: hidden to allow layout calculations */}
        <div className={`w-full transition-opacity duration-0 ${showLoading ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          {/* Combined Buy & Sell Side Table */}
          <div className="w-full max-w-full">
            <div className="bg-muted/50 px-4 py-1.5 border-y border-border">
              <h3 className="font-semibold text-sm">VALUE - {selectedTickers.join(', ')}</h3>
            </div>
            <div className="w-full max-w-full">
              <div ref={valueTableContainerRef} className="w-full max-w-full overflow-x-auto max-h-[480px] overflow-y-auto border-l-2 border-r-2 border-b-2 border-white">
                <table ref={valueTableRef} className={`min-w-[1000px] ${getFontSizeClass()} table-auto`}>
                  <thead className="bg-[#3a4252]">
                    <tr className="border-t-2 border-white">
                      {availableDates.map((date, dateIndex) => (
                        <th key={date} className={`text-center py-[1px] px-[8.24px] font-bold text-white whitespace-nowrap ${dateIndex === 0 ? 'border-l-2 border-white' : ''} ${dateIndex < availableDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === availableDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} colSpan={9}>
                          {formatDisplayDate(date)}
                        </th>
                      ))}
                      <th className={`text-center py-[1px] px-[4.2px] font-bold text-white border-r-2 border-white ${availableDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} colSpan={9}>
                        Total
                      </th>
                    </tr>
                    <tr className="bg-[#3a4252]">
                      {availableDates.map((date, dateIndex) => (
                        <React.Fragment key={`detail-${date}`}>
                          {/* BY Columns */}
                          <th className={`text-center py-[1px] px-[4.2px] font-bold text-white w-4 ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`}>BY</th>
                          <th className={`text-right py-[1px] px-[4.2px] font-bold text-white w-6`}>BLot</th>
                          <th className={`text-right py-[1px] px-[4.2px] font-bold text-white w-6`}>BVal</th>
                          <th className={`text-right py-[1px] px-[4.2px] font-bold text-white w-6`}>BAvg</th>
                          {/* SL Columns */}
                          <th className="text-center py-[1px] px-[4.2px] font-bold text-white bg-[#3a4252] w-4">#</th>
                          <th className={`text-left py-[1px] px-[4.2px] font-bold text-white w-4`}>SL</th>
                          <th className={`text-right py-[1px] px-[4.2px] font-bold text-white w-6`}>SLot</th>
                          <th className={`text-right py-[1px] px-[4.2px] font-bold text-white w-6`}>SVal</th>
                          <th className={`text-right py-[1px] px-[4.2px] font-bold text-white w-6 ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`}>SAvg</th>
                        </React.Fragment>
                      ))}
                      {/* Total Columns - Include BAvg and SAvg */}
                      <th className={`text-center py-[1px] px-[3.1px] font-bold text-white ${selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`}>BY</th>
                      <th className={`text-right py-[1px] px-[3.1px] font-bold text-white`}>BLot</th>
                      <th className={`text-right py-[1px] px-[3.1px] font-bold text-white`}>BVal</th>
                      <th className={`text-right py-[1px] px-[3.1px] font-bold text-white`}>BAvg</th>
                      <th className="text-center py-[1px] px-[4.2px] font-bold text-white bg-[#3a4252]">#</th>
                      <th className={`text-left py-[1px] px-[3.1px] font-bold text-white`}>SL</th>
                      <th className={`text-right py-[1px] px-[3.1px] font-bold text-white`}>SLot</th>
                      <th className={`text-right py-[1px] px-[3.1px] font-bold text-white`}>SVal</th>
                      <th className={`text-right py-[1px] px-[6px] font-bold text-white border-r-2 border-white`}>SAvg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // Get broker text color class
                      const getBrokerColorClass = (brokerCode: string): string => {
                        if (GOVERNMENT_BROKERS.includes(brokerCode)) {
                          return 'text-green-600 font-semibold';
                        }
                        if (FOREIGN_BROKERS.includes(brokerCode)) {
                          return 'text-red-600 font-semibold';
                        }
                        return 'text-white font-semibold';
                      };

                      // Calculate total data across all dates (SWAPPED: Buy uses SELL fields, Sell uses BUY fields)
                      const totalBuyData: { [broker: string]: { nblot: number; nbval: number; bavg: number; count: number } } = {};
                      const totalSellData: { [broker: string]: { nslot: number; nsval: number; savg: number; count: number } } = {};

                      allBrokerData.forEach(dateData => {
                        // BUY total uses Buyer metrics
                        dateData.buyData.forEach(b => {
                          if (b.buyerValue > 0) {
                            if (!totalBuyData[b.broker]) {
                              totalBuyData[b.broker] = { nblot: 0, nbval: 0, bavg: 0, count: 0 };
                            }
                            const buyEntry = totalBuyData[b.broker];
                            if (buyEntry) {
                              buyEntry.nblot += b.buyerVol;
                              buyEntry.nbval += b.buyerValue;
                              buyEntry.bavg += b.bavg;
                              buyEntry.count += 1;
                            }
                          }
                        });

                        // SELL total uses Seller metrics
                        dateData.sellData.forEach(s => {
                          if (s.sellerValue > 0) {
                            if (!totalSellData[s.broker]) {
                              totalSellData[s.broker] = { nslot: 0, nsval: 0, savg: 0, count: 0 };
                            }
                            const sellEntry = totalSellData[s.broker];
                            if (sellEntry) {
                              sellEntry.nslot += s.sellerVol;
                              sellEntry.nsval += s.sellerValue;
                              sellEntry.savg += s.savg;
                              sellEntry.count += 1;
                            }
                          }
                        });
                      });

                      // Sort total data
                      const sortedTotalBuy = Object.entries(totalBuyData)
                        .filter(([broker]) => brokerFDScreen(broker))
                        .map(([broker, data]) => ({ broker, ...data, bavg: data.bavg / data.count }))
                        .sort((a, b) => b.nbval - a.nbval);
                      const sortedTotalSell = Object.entries(totalSellData)
                        .filter(([broker]) => brokerFDScreen(broker))
                        .map(([broker, data]) => ({ broker, ...data, savg: data.savg / data.count }))
                        .sort((a, b) => b.nsval - a.nsval);

                      // Find max row count across all dates AND total columns
                      let maxRows = 0;
                      availableDates.forEach(date => {
                        const dateData = allBrokerData.find(d => d.date === date);
                        const buyCount = (dateData?.buyData || []).filter(b => brokerFDScreen(b.broker) && b.buyerValue > 0).length;
                        const sellCount = (dateData?.sellData || []).filter(s => brokerFDScreen(s.broker) && s.sellerValue > 0).length;
                        maxRows = Math.max(maxRows, buyCount, sellCount);
                      });

                      // Also include total broker counts in maxRows (for Total column)
                      const totalBuyCount = sortedTotalBuy.length;
                      const totalSellCount = sortedTotalSell.length;
                      maxRows = Math.max(maxRows, totalBuyCount, totalSellCount);

                      // If no data, show "No Data" message
                      if (maxRows === 0) {
                        const totalCols = availableDates.length * 9 + 9; // 9 cols per date + 9 for Total
                        return (
                          <tr className="border-b-2 border-white">
                            <td colSpan={totalCols} className="text-center py-[2.06px] text-muted-foreground font-bold">
                              No Data
                            </td>
                          </tr>
                        );
                      }

                      // Render rows
                      return Array.from({ length: maxRows }).map((_, rowIdx) => (
                        <tr key={rowIdx} className={`hover:bg-accent/50 ${rowIdx === maxRows - 1 ? 'border-b-2 border-white' : ''}`}>
                          {availableDates.map((date, dateIndex) => {
                            const dateData = allBrokerData.find(d => d.date === date);

                            // Sort brokers for this date: Buy uses BuyerValue, Sell uses SellerValue
                            const sortedByBuyerValue = (dateData?.buyData || [])
                              .filter(b => brokerFDScreen(b.broker))
                              .filter(b => b.buyerValue > 0)
                              .sort((a, b) => b.buyerValue - a.buyerValue);
                            const sortedBySellerValue = (dateData?.sellData || [])
                              .filter(s => brokerFDScreen(s.broker))
                              .filter(s => s.sellerValue > 0)
                              .sort((a, b) => b.sellerValue - a.sellerValue);

                            const buyData = sortedByBuyerValue[rowIdx];
                            const sellData = sortedBySellerValue[rowIdx];

                            return (
                              <React.Fragment key={`${date}-${rowIdx}`}>
                                {/* BY (Buyer) Columns - Using Buyer fields */}
                                <td className={`text-center py-[1px] px-[4.2px] w-4 font-bold ${dateIndex === 0 ? 'border-l-2 border-white' : ''} ${buyData ? getBrokerColorClass(buyData.broker) : ''}`}>
                                  {buyData?.broker || '-'}
                                </td>
                                <td className="text-right py-[1px] px-[4.2px] text-green-600 font-bold w-6">
                                  {buyData ? formatLot(buyData.buyerVol / 100) : '-'}
                                </td>
                                <td className="text-right py-[1px] px-[4.2px] text-green-600 font-bold w-6">
                                  {buyData ? formatNumber(buyData.buyerValue) : '-'}
                                </td>
                                <td className="text-right py-[1px] px-[4.2px] text-green-600 font-bold w-6">
                                  {buyData ? formatAverage(buyData.bavg) : '-'}
                                </td>
                                {/* SL (Seller) Columns - Keep # column */}
                                <td className={`text-center py-[1px] px-[4.2px] text-white bg-[#3a4252] font-bold w-4 ${sellData ? getBrokerColorClass(sellData.broker) : ''}`}>{sellData ? rowIdx + 1 : '-'}</td>
                                <td className={`py-[1px] px-[4.2px] font-bold w-4 ${sellData ? getBrokerColorClass(sellData.broker) : ''}`}>
                                  {sellData?.broker || '-'}
                                </td>
                                <td className="text-right py-[1px] px-[4.2px] text-red-600 font-bold w-6">
                                  {sellData ? formatLot(sellData.sellerVol / 100) : '-'}
                                </td>
                                <td className="text-right py-[1px] px-[4.2px] text-red-600 font-bold w-6">
                                  {sellData ? formatNumber(sellData.sellerValue) : '-'}
                                </td>
                                <td className={`text-right py-[1px] px-[4.2px] text-red-600 font-bold w-6 ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`}>
                                  {sellData ? formatAverage(sellData.savg) : '-'}
                                </td>
                              </React.Fragment>
                            );
                          })}
                          {/* Total Columns - Include BAvg and SAvg */}
                          {(() => {
                            const totalBuy = sortedTotalBuy[rowIdx];
                            const totalSell = sortedTotalSell[rowIdx];
                            // Calculate BAvg: BVal / BLot
                            const totalBuyAvg = totalBuy && totalBuy.nblot > 0 ? totalBuy.nbval / totalBuy.nblot : 0;
                            // Calculate SAvg: SVal / SLot
                            const totalSellAvg = totalSell && totalSell.nslot > 0 ? Math.abs(totalSell.nsval) / totalSell.nslot : 0;
                            return (
                              <React.Fragment>
                                <td className={`text-center py-[1px] px-[3.1px] font-bold ${availableDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'} ${totalBuy ? getBrokerColorClass(totalBuy.broker) : ''}`}>
                                  {totalBuy?.broker || '-'}
                                </td>
                                <td className="text-right py-[1px] px-[3.1px] text-green-600 font-bold">
                                  {totalBuy ? formatLot(totalBuy.nblot / 100) : '-'}
                                </td>
                                <td className="text-right py-[1px] px-[3.1px] text-green-600 font-bold">
                                  {totalBuy ? formatNumber(totalBuy.nbval) : '-'}
                                </td>
                                <td className="text-right py-[1px] px-[3.1px] text-green-600 font-bold">
                                  {totalBuy && totalBuyAvg > 0 ? formatAverage(totalBuyAvg) : '-'}
                                </td>
                                <td className={`text-center py-[1px] px-[4.2px] text-white bg-[#3a4252] font-bold ${totalSell ? getBrokerColorClass(totalSell.broker) : ''}`}>{totalSell ? rowIdx + 1 : '-'}</td>
                                <td className={`py-[1px] px-[3.1px] font-bold ${totalSell ? getBrokerColorClass(totalSell.broker) : ''}`}>
                                  {totalSell?.broker || '-'}
                                </td>
                                <td className="text-right py-[1px] px-[3.1px] text-red-600 font-bold">
                                  {totalSell ? formatLot(totalSell.nslot / 100) : '-'}
                                </td>
                                <td className="text-right py-[1px] px-[3.1px] text-red-600 font-bold">
                                  {totalSell ? formatNumber(totalSell.nsval) : '-'}
                                </td>
                                <td className="text-right py-[1px] px-[6px] text-red-600 font-bold border-r-2 border-white">
                                  {totalSell && totalSellAvg > 0 ? formatAverage(totalSellAvg) : '-'}
                                </td>
                              </React.Fragment>
                            );
                          })()}
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Net Table */}
          <div className="w-full max-w-full mt-1">
            <div className="bg-muted/50 px-4 py-1.5 border-y border-border">
              <h3 className="font-semibold text-sm">NET - {selectedTickers.join(', ')}</h3>
            </div>
            <div className="w-full max-w-full">
              <div ref={netTableContainerRef} className="w-full max-w-full overflow-x-auto max-h-[480px] overflow-y-auto border-l-2 border-r-2 border-b-2 border-white">
                <table ref={netTableRef} className={`min-w-[1000px] ${getFontSizeClass()} table-auto`}>
                  <thead className="bg-[#3a4252]">
                    <tr className="border-t-2 border-white">
                      {availableDates.map((date, dateIndex) => (
                        <th key={date} className={`text-center py-[1px] px-[8.24px] font-bold text-white whitespace-nowrap ${dateIndex === 0 ? 'border-l-2 border-white' : ''} ${dateIndex < availableDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === availableDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} colSpan={9}>
                          {formatDisplayDate(date)}
                        </th>
                      ))}
                      <th className={`text-center py-[1px] px-[4.2px] font-bold text-white border-r-2 border-white ${availableDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} colSpan={9}>
                        Total
                      </th>
                    </tr>
                    <tr className="bg-[#3a4252]">
                      {availableDates.map((date, dateIndex) => (
                        <React.Fragment key={`detail-${date}`}>
                          {/* Net Buy Columns - No # */}
                          <th className={`text-center py-[1px] px-[4.2px] font-bold text-white w-4 ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`}>BY</th>
                          <th className={`text-right py-[1px] px-[4.2px] font-bold text-white w-6`}>BLot</th>
                          <th className={`text-right py-[1px] px-[4.2px] font-bold text-white w-6`}>BVal</th>
                          <th className={`text-right py-[1px] px-[4.2px] font-bold text-white w-6`}>BAvg</th>
                          {/* Net Sell Columns - Keep # */}
                          <th className="text-center py-[1px] px-[4.2px] font-bold text-white bg-[#3a4252] w-4">#</th>
                          <th className={`text-left py-[1px] px-[4.2px] font-bold text-white w-4`}>SL</th>
                          <th className={`text-right py-[1px] px-[4.2px] font-bold text-white w-6`}>SLot</th>
                          <th className={`text-right py-[1px] px-[4.2px] font-bold text-white w-6`}>SVal</th>
                          <th className={`text-right py-[1px] px-[4.2px] font-bold text-white w-6 ${dateIndex < availableDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === availableDates.length - 1 ? 'border-r-[10px] border-white' : ''}`}>SAvg</th>
                        </React.Fragment>
                      ))}
                      {/* Total Columns - Include BAvg and SAvg */}
                      <th className={`text-center py-[1px] px-[3.1px] font-bold text-white ${availableDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`}>BY</th>
                      <th className={`text-right py-[1px] px-[3.1px] font-bold text-white`}>BLot</th>
                      <th className={`text-right py-[1px] px-[3.1px] font-bold text-white`}>BVal</th>
                      <th className={`text-right py-[1px] px-[3.1px] font-bold text-white`}>BAvg</th>
                      <th className="text-center py-[1px] px-[4.2px] font-bold text-white bg-[#3a4252]">#</th>
                      <th className={`text-left py-[1px] px-[3.1px] font-bold text-white`}>SL</th>
                      <th className={`text-right py-[1px] px-[3.1px] font-bold text-white`}>SLot</th>
                      <th className={`text-right py-[1px] px-[3.1px] font-bold text-white`}>SVal</th>
                      <th className={`text-right py-[1px] px-[6px] font-bold text-white border-r-2 border-white`}>SAvg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // Get broker text color class
                      const getBrokerColorClass = (brokerCode: string): string => {
                        if (GOVERNMENT_BROKERS.includes(brokerCode)) {
                          return 'text-green-600 font-semibold';
                        }
                        if (FOREIGN_BROKERS.includes(brokerCode)) {
                          return 'text-red-600 font-semibold';
                        }
                        return 'text-white font-semibold';
                      };

                      // Calculate total net data across all dates (SWAPPED: Net Buy uses negative values)
                      const totalNetBuyData: { [broker: string]: { nblot: number; nbval: number; nbavg: number; count: number } } = {};
                      const totalNetSellData: { [broker: string]: { nslot: number; nsval: number; nsavg: number; count: number } } = {};

                      allBrokerData.forEach(dateData => {
                        dateData.buyData.forEach(b => {
                          const netBuyLot = b.netBuyVol || 0;
                          const netBuyVal = b.netBuyValue || 0;

                          if (netBuyVal < 0) { // swapped: net buy uses negatives
                            if (!totalNetBuyData[b.broker]) {
                              totalNetBuyData[b.broker] = { nblot: 0, nbval: 0, nbavg: 0, count: 0 };
                            }
                            const netBuyEntry = totalNetBuyData[b.broker];
                            if (netBuyEntry) {
                              netBuyEntry.nblot += Math.abs(netBuyLot);
                              netBuyEntry.nbval += Math.abs(netBuyVal);
                              netBuyEntry.nbavg += Math.abs((netBuyVal / netBuyLot)) || 0;
                              netBuyEntry.count += 1;
                            }
                          } else if (netBuyVal > 0) { // swapped: net sell uses positives
                            if (!totalNetSellData[b.broker]) {
                              totalNetSellData[b.broker] = { nslot: 0, nsval: 0, nsavg: 0, count: 0 };
                            }
                            const netSellEntry = totalNetSellData[b.broker];
                            if (netSellEntry) {
                              netSellEntry.nslot += netBuyLot;
                              netSellEntry.nsval += netBuyVal;
                              netSellEntry.nsavg += (netBuyVal / netBuyLot) || 0;
                              netSellEntry.count += 1;
                            }
                          }
                        });
                      });

                      // Sort total data
                      const sortedTotalNetBuy = Object.entries(totalNetBuyData)
                        .filter(([broker]) => brokerFDScreen(broker))
                        .map(([broker, data]) => ({ broker, ...data, nbavg: data.nbavg / data.count }))
                        .sort((a, b) => b.nbval - a.nbval);
                      const sortedTotalNetSell = Object.entries(totalNetSellData)
                        .filter(([broker]) => brokerFDScreen(broker))
                        .map(([broker, data]) => ({ broker, ...data, nsavg: data.nsavg / data.count }))
                        .sort((a, b) => b.nsval - a.nsval);

                      // Generate contrast colors like BrokerInventoryPage (HSL with high saturation)
                      const generateContrastColor = (index: number): string => {
                        const baseHues = [150, 270, 50, 200, 330]; // dark green, violet, yellow, cyan, fuchsia
                        const hue = baseHues[index % baseHues.length];
                        const saturation = 60 + (index * 3) % 20; // 60-80% saturation
                        const lightness = 40 + (index * 2) % 15; // 40-55% lightness (darker for contrast)
                        return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
                      };

                      // Generate contrast colors array for top 5
                      const bgColors = Array.from({ length: 5 }, (_, idx) => generateContrastColor(idx));

                      // Helper function to shift color slightly for sell (shift hue and adjust lightness)
                      const shiftColorForSell = (color: string): string => {
                        // Parse HSL color: hsl(hue, saturation%, lightness%)
                        const match = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
                        if (!match || !match[1] || !match[2] || !match[3]) return color;

                        const hue = parseInt(match[1], 10);
                        const saturation = parseInt(match[2], 10);
                        const lightness = parseInt(match[3], 10);

                        // Shift hue by 15 degrees (subtle difference)
                        const shiftedHue = (hue + 15) % 360;

                        // For yellow colors (original hue around 50, shifted to ~65), darken instead of lighten
                        // Also check for yellow range (45-70 degrees)
                        const isYellow = (hue >= 45 && hue <= 70) || (shiftedHue >= 45 && shiftedHue <= 70);

                        let shiftedLightness: number;
                        if (isYellow) {
                          // Darken yellow colors - reduce lightness by 5-10% instead of increasing
                          shiftedLightness = Math.max(35, lightness - 8); // Darker for yellow
                        } else {
                          // Slightly lighter for other colors
                          shiftedLightness = Math.min(95, Math.max(35, lightness + 8));
                        }

                        return `hsl(${shiftedHue}, ${saturation}%, ${shiftedLightness}%)`;
                      };

                      // Map top 5 net buy brokers to background colors (HSL strings) - use original colors
                      const netBuyBrokerBgMap = new Map<string, string>();
                      sortedTotalNetBuy.slice(0, 5).forEach((item, idx) => {
                        netBuyBrokerBgMap.set(item.broker, bgColors[idx] || '');
                      });

                      // Map top 5 net sell brokers to background colors (HSL strings) - use shifted colors
                      const netSellBrokerBgMap = new Map<string, string>();
                      sortedTotalNetSell.slice(0, 5).forEach((item, idx) => {
                        netSellBrokerBgMap.set(item.broker, shiftColorForSell(bgColors[idx] || ''));
                      });

                      // Helper function to get background color style for net buy broker
                      const getNetBuyBgStyle = (broker: string): React.CSSProperties | undefined => {
                        const color = netBuyBrokerBgMap.get(broker);
                        return color ? { backgroundColor: color, color: 'white' } : undefined;
                      };

                      // Helper function to get background color style for net sell broker
                      // Note: Sell background color disabled - only buy gets colored
                      const getNetSellBgStyle = (broker: string): React.CSSProperties | undefined => {
                        return undefined; // No background color for sell
                      };

                      // Find max row count across all dates
                      let maxRows = 0;
                      availableDates.forEach(date => {
                        const dateData = allBrokerData.find(d => d.date === date);
                        const netBuyCount = (dateData?.buyData || []).filter(b => brokerFDScreen(b.broker) && (b.netBuyValue || 0) < 0).length; // swap + F/D filter
                        const netSellCount = (dateData?.buyData || []).filter(b => brokerFDScreen(b.broker) && (b.netBuyValue || 0) > 0).length; // swap + F/D filter
                        maxRows = Math.max(maxRows, netBuyCount, netSellCount);
                      });

                      // Also include total broker counts in maxRows (for Total column)
                      const totalNetBuyCount = sortedTotalNetBuy.length;
                      const totalNetSellCount = sortedTotalNetSell.length;
                      maxRows = Math.max(maxRows, totalNetBuyCount, totalNetSellCount);

                      // If no data, show "No Data" message
                      if (maxRows === 0) {
                        const totalCols = availableDates.length * 9 + 9; // 9 cols per date + 9 for Total
                        return (
                          <tr className="border-b-2 border-white">
                            <td colSpan={totalCols} className="text-center py-[2.06px] text-muted-foreground font-bold">
                              No Data
                            </td>
                          </tr>
                        );
                      }

                      // Render rows
                      return Array.from({ length: maxRows }).map((_, rowIdx) => {
                        // Cek apakah broker pada row adalah top5
                        // (delete unused block: netBuyData/netSellData functions)
                        return (
                          <tr key={rowIdx} className={`hover:bg-accent/50 ${rowIdx === maxRows - 1 ? 'border-b-2 border-white' : ''}`}>
                            {availableDates.map((date, dateIndex) => {
                              const dateData = allBrokerData.find(d => d.date === date);
                              // Sort brokers for this date by NetBuyValue (SWAPPED)
                              const sortedNetBuy = (dateData?.buyData || [])
                                .filter(b => (b.netBuyValue || 0) < 0)
                                .sort((a, b) => Math.abs(b.netBuyValue || 0) - Math.abs(a.netBuyValue || 0));
                              const sortedNetSell = (dateData?.buyData || [])
                                .filter(b => (b.netBuyValue || 0) > 0)
                                .sort((a, b) => (b.netBuyValue || 0) - (a.netBuyValue || 0));
                              const netBuyData = sortedNetBuy[rowIdx];
                              const netSellData = sortedNetSell[rowIdx];
                              // Calculate data...
                              // Calculate NSLot and NSVal (Buy - Sell) for Net Buy
                              const nbLot = netBuyData ? Math.abs(netBuyData.netBuyVol || 0) : 0;
                              const nbVal = netBuyData ? Math.abs(netBuyData.netBuyValue || 0) : 0;
                              const nbAvg = nbLot !== 0 ? nbVal / nbLot : 0;

                              // Calculate for Net Sell
                              const nsLot = netSellData ? Math.abs(netSellData.netBuyVol || 0) : 0;
                              const nsVal = netSellData ? Math.abs(netSellData.netBuyValue || 0) : 0;
                              const nsAvg = nsLot !== 0 ? nsVal / nsLot : 0;

                              // Get background colors for this row (only for buy)
                              const netBuyBgStyle = netBuyData ? getNetBuyBgStyle(netBuyData.broker) : undefined;
                              // Note: Sell background color disabled - only buy gets colored

                              return (
                                <React.Fragment key={`${date}-${rowIdx}`}>
                                  {/* Net Buy Columns - No # */}
                                  <td className={`text-center py-[1px] px-[4.2px] w-4 font-bold ${dateIndex === 0 ? 'border-l-2 border-white' : ''} ${netBuyData ? getBrokerColorClass(netBuyData.broker) : ''}`} style={netBuyBgStyle}>
                                    {netBuyData?.broker || '-'}
                                  </td>
                                  <td className={`text-right py-[1px] px-[4.2px] w-6 font-bold ${netBuyBgStyle ? '' : 'text-green-600'}`} style={netBuyBgStyle}>
                                    {netBuyData ? formatLot(nbLot / 100) : '-'}
                                  </td>
                                  <td className={`text-right py-[1px] px-[4.2px] w-6 font-bold ${netBuyBgStyle ? '' : 'text-green-600'}`} style={netBuyBgStyle}>
                                    {netBuyData ? formatNumber(nbVal) : '-'}
                                  </td>
                                  <td className={`text-right py-[1px] px-[4.2px] w-6 font-bold ${netBuyBgStyle ? '' : 'text-green-600'}`} style={netBuyBgStyle}>
                                    {netBuyData ? formatAverage(nbAvg) : '-'}
                                  </td>
                                  {/* Net Sell Columns - Keep # */}
                                  <td className={`text-center py-[1px] px-[4.2px] text-white bg-[#3a4252] font-bold w-4 ${netSellData ? getBrokerColorClass(netSellData.broker) : ''}`}>{netSellData ? rowIdx + 1 : '-'}</td>
                                  <td className={`py-[1px] px-[4.2px] w-4 font-bold ${netSellData ? getBrokerColorClass(netSellData.broker) : ''}`}>
                                    {netSellData?.broker || '-'}
                                  </td>
                                  <td className="text-right py-[1px] px-[4.2px] w-6 font-bold text-red-600">
                                    {netSellData ? formatLot(nsLot / 100) : '-'}
                                  </td>
                                  <td className="text-right py-[1px] px-[4.2px] w-6 font-bold text-red-600">
                                    {netSellData ? formatNumber(nsVal) : '-'}
                                  </td>
                                  <td className={`text-right py-[1px] px-[4.2px] w-6 font-bold text-red-600 ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`}>
                                    {netSellData ? formatAverage(nsAvg) : '-'}
                                  </td>
                                </React.Fragment>
                              );
                            })}
                            {/* Total Columns - Include BAvg and SAvg */}
                            {(() => {
                              const totalNetBuy = sortedTotalNetBuy[rowIdx];
                              const totalNetSell = sortedTotalNetSell[rowIdx];

                              // Get background colors for total columns (top 5 only)
                              // Buy uses original colors, Sell background color disabled
                              const totalNetBuyBgStyle = totalNetBuy && rowIdx < 5 ? { backgroundColor: bgColors[rowIdx] || '', color: 'white' } : undefined;
                              // Note: Sell background color disabled - only buy gets colored

                              // Calculate BAvg: BVal / BLot
                              const totalNetBuyAvg = totalNetBuy && totalNetBuy.nblot > 0 ? totalNetBuy.nbval / totalNetBuy.nblot : 0;
                              // Calculate SAvg: SVal / SLot
                              const totalNetSellAvg = totalNetSell && totalNetSell.nslot > 0 ? Math.abs(totalNetSell.nsval) / totalNetSell.nslot : 0;

                              return (
                                <React.Fragment>
                                  <td className={`text-center py-[1px] px-[3.1px] font-bold ${availableDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'} ${totalNetBuy ? getBrokerColorClass(totalNetBuy.broker) : ''}`} style={totalNetBuyBgStyle}>
                                    {totalNetBuy?.broker || '-'}
                                  </td>
                                  <td className={`text-right py-[1px] px-[3.1px] font-bold ${totalNetBuyBgStyle ? '' : 'text-green-600'}`} style={totalNetBuyBgStyle}>
                                    {totalNetBuy ? formatLot(totalNetBuy.nblot / 100) : '-'}
                                  </td>
                                  <td className={`text-right py-[1px] px-[3.1px] font-bold ${totalNetBuyBgStyle ? '' : 'text-green-600'}`} style={totalNetBuyBgStyle}>
                                    {totalNetBuy ? formatNumber(totalNetBuy.nbval) : '-'}
                                  </td>
                                  <td className={`text-right py-[1px] px-[3.1px] font-bold ${totalNetBuyBgStyle ? '' : 'text-green-600'}`} style={totalNetBuyBgStyle}>
                                    {totalNetBuy && totalNetBuyAvg > 0 ? formatAverage(totalNetBuyAvg) : '-'}
                                  </td>
                                  <td className={`text-center py-[1px] px-[4.2px] text-white bg-[#3a4252] font-bold ${totalNetSell ? getBrokerColorClass(totalNetSell.broker) : ''}`}>{totalNetSell ? rowIdx + 1 : '-'}</td>
                                  <td className={`py-[1px] px-[3.1px] font-bold ${totalNetSell ? getBrokerColorClass(totalNetSell.broker) : ''}`}>
                                    {totalNetSell?.broker || '-'}
                                  </td>
                                  <td className="text-right py-[1px] px-[3.1px] text-red-600 font-bold">
                                    {totalNetSell ? formatLot(totalNetSell.nslot / 100) : '-'}
                                  </td>
                                  <td className="text-right py-[1px] px-[3.1px] text-red-600 font-bold">
                                    {totalNetSell ? formatNumber(totalNetSell.nsval) : '-'}
                                  </td>
                                  <td className="text-right py-[1px] px-[6px] text-red-600 font-bold border-r-2 border-white">
                                    {totalNetSell && totalNetSellAvg > 0 ? formatAverage(totalNetSellAvg) : '-'}
                                  </td>
                                </React.Fragment>
                              );
                            })()}
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full">
      {/* Top Controls - Compact without Card */}
      <div className="bg-[#0a0f20] border-b border-[#3a4252] px-4 py-1.5">
        <div className="flex flex-wrap items-center gap-8">
          {/* Ticker Selection - Multi-select with chips */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium whitespace-nowrap">Ticker:</label>
            <div className="flex flex-wrap items-center gap-2">
              {/* Selected Ticker Chips */}
              {selectedTickers.map(ticker => (
                <div
                  key={ticker}
                  className="flex items-center gap-1 px-2 py-1 bg-primary/20 text-primary rounded-md text-sm"
                >
                  <span>{ticker}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveTicker(ticker)}
                    className="hover:bg-primary/30 rounded px-1"
                    aria-label={`Remove ${ticker}`}
                  >
                    ×
                  </button>
                </div>
              ))}
              {/* Ticker Input */}
              <div className="relative" ref={dropdownRef}>
                <Search className="absolute left-3 top-1/2 pointer-events-none -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                <input
                  type="text"
                  value={tickerInput}
                  onChange={(e) => { handleStockInputChange(e.target.value); setHighlightedStockIndex(0); }}
                  onFocus={() => { setShowStockSuggestions(true); setHighlightedStockIndex(0); }}
                  onKeyDown={(e) => {
                    const suggestions = (tickerInput === '' ? availableStocks.filter(s => !selectedTickers.includes(s)) : filteredStocks).slice(0, 10);
                    if (!suggestions.length) return;
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setHighlightedStockIndex((prev) => (prev + 1) % suggestions.length);
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setHighlightedStockIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
                    } else if (e.key === 'Enter' && showStockSuggestions) {
                      e.preventDefault();
                      const idx = highlightedStockIndex >= 0 ? highlightedStockIndex : 0;
                      const choice = suggestions[idx];
                      if (choice) handleStockSelect(choice);
                    } else if (e.key === 'Escape') {
                      setShowStockSuggestions(false);
                      setHighlightedStockIndex(-1);
                    }
                  }}
                  placeholder="Add ticker"
                  className="w-24 pl-10 pr-3 py-[2.06px] text-sm border border-[#3a4252] rounded-md bg-input text-foreground"
                />
                {showStockSuggestions && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-[#3a4252] rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                    {availableStocks.length === 0 ? (
                      <div className="px-3 py-[2.06px] text-sm text-muted-foreground flex items-center">
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Loading stocks...
                      </div>
                    ) : tickerInput === '' ? (
                      <>
                        <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252]">
                          Available Stocks ({availableStocks.filter(s => !selectedTickers.includes(s)).length})
                        </div>
                        {availableStocks.filter(s => !selectedTickers.includes(s)).map(stock => (
                          <div
                            key={stock}
                            onClick={() => handleStockSelect(stock)}
                            className="px-3 py-[2.06px] hover:bg-muted cursor-pointer text-sm"
                          >
                            {stock}
                          </div>
                        ))}
                      </>
                    ) : filteredStocks.length > 0 ? (
                      <>
                        <div className="px-3 py-[2.06px] text-xs text-muted-foreground border-b border-[#3a4252]">
                          {filteredStocks.length} stocks found
                        </div>
                        {filteredStocks.map(stock => (
                          <div
                            key={stock}
                            onClick={() => handleStockSelect(stock)}
                            className="px-3 py-[2.06px] hover:bg-muted cursor-pointer text-sm"
                          >
                            {stock}
                          </div>
                        ))}
                      </>
                    ) : (
                      <div className="px-3 py-[2.06px] text-sm text-muted-foreground">
                        No stocks found
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Date Range */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium whitespace-nowrap">Date Range:</label>
            <div
              className="relative h-9 w-36 rounded-md border border-input bg-background cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => triggerDatePicker(startDateRef)}
            >
              <input
                ref={startDateRef}
                type="date"
                value={formatDateForInput(startDate)}
                onChange={(e) => {
                  const selectedDate = new Date(e.target.value);
                  const dayOfWeek = selectedDate.getDay();
                  if (dayOfWeek === 0 || dayOfWeek === 6) {
                    alert('Tidak bisa memilih hari Sabtu atau Minggu');
                    return;
                  }

                  // Calculate trading days in the new range
                  const start = new Date(e.target.value);
                  const end = new Date(endDate || e.target.value);
                  const tradingDays: string[] = [];
                  const current = new Date(start);

                  while (current <= end) {
                    const dayOfWeek = current.getDay();
                    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                      const dateString = current.toISOString().split('T')[0];
                      if (dateString) tradingDays.push(dateString);
                    }
                    current.setDate(current.getDate() + 1);
                  }

                  // Check if trading days exceed 7
                  if (tradingDays.length > 7) {
                    alert('Maksimal 7 hari kerja yang bisa dipilih');
                    return;
                  }

                  setStartDate(e.target.value);
                  // Auto update end date if not set or if start > end
                  if (!endDate || new Date(e.target.value) > new Date(endDate)) {
                    setEndDate(e.target.value);
                  }
                  setSelectedDates(tradingDays);
                }}
                onKeyDown={(e) => e.preventDefault()}
                onPaste={(e) => e.preventDefault()}
                onInput={(e) => e.preventDefault()}
                max={formatDateForInput(endDate)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                style={{ caretColor: 'transparent' }}
              />
              <div className="flex items-center justify-between h-full px-3 py-[2.06px]">
                <span className="text-sm text-foreground">
                  {new Date(startDate).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                  })}
                </span>
                <Calendar className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
            <span className="text-sm text-muted-foreground">to</span>
            <div
              className="relative h-9 w-36 rounded-md border border-input bg-background cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => triggerDatePicker(endDateRef)}
            >
              <input
                ref={endDateRef}
                type="date"
                value={formatDateForInput(endDate)}
                onChange={(e) => {
                  const selectedDate = new Date(e.target.value);
                  const dayOfWeek = selectedDate.getDay();
                  if (dayOfWeek === 0 || dayOfWeek === 6) {
                    alert('Tidak bisa memilih hari Sabtu atau Minggu');
                    return;
                  }

                  // Calculate trading days in the new range
                  const start = new Date(startDate);
                  const end = new Date(e.target.value);
                  const tradingDays: string[] = [];
                  const current = new Date(start);

                  while (current <= end) {
                    const dayOfWeek = current.getDay();
                    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                      const dateString = current.toISOString().split('T')[0];
                      if (dateString) tradingDays.push(dateString);
                    }
                    current.setDate(current.getDate() + 1);
                  }

                  // Check if trading days exceed 7
                  if (tradingDays.length > 7) {
                    alert('Maksimal 7 hari kerja yang bisa dipilih');
                    return;
                  }

                  setEndDate(e.target.value);
                  setSelectedDates(tradingDays);
                }}
                onKeyDown={(e) => e.preventDefault()}
                onPaste={(e) => e.preventDefault()}
                onInput={(e) => e.preventDefault()}
                min={formatDateForInput(startDate)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                style={{ caretColor: 'transparent' }}
              />
              <div className="flex items-center justify-between h-full px-3 py-[2.06px]">
                <span className="text-sm text-foreground">
                  {new Date(endDate).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                  })}
                </span>
                <Calendar className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
          </div>

          {/* F/D Filter - visual only */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium whitespace-nowrap">F/D:</label>
            <select
              value={fdFilter}
              onChange={(e) => setFdFilter(e.target.value as 'All' | 'Foreign' | 'Domestic')}
              className="px-3 py-1.5 border border-[#3a4252] rounded-md bg-background text-foreground text-sm"
            >
              <option value="All">All</option>
              <option value="Foreign">Foreign</option>
              <option value="Domestic">Domestic</option>
            </select>
          </div>

          {/* Market Filter - visual only */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium whitespace-nowrap">Board:</label>
            <select
              value={marketFilter}
              onChange={(e) => setMarketFilter(e.target.value as 'RG' | 'TN' | 'NG' | '')}
              className="px-3 py-1.5 border border-[#3a4252] rounded-md bg-background text-foreground text-sm"
            >
              <option value="">All Trade</option>
              <option value="RG">RG</option>
              <option value="TN">TN</option>
              <option value="NG">NG</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Data Display */}
      <div className="bg-[#0a0f20]">
        {renderHorizontalView()}
      </div>
    </div>
  );
}
