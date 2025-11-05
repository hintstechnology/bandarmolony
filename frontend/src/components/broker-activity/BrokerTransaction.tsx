import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Calendar } from 'lucide-react';
import { api } from '../../services/api';

interface BrokerTransactionData {
  Emiten: string;
  BuyerVol: number;
  BuyerValue: number;
  SellerVol: number;
  SellerValue: number;
  NetBuyVol: number;
  NetBuyValue: number;
  BuyerAvg: number;
  SellerAvg: number;
  TotalVolume: number;
  AvgPrice: number;
  TransactionCount: number;
  TotalValue: number;
  // New fields for broker transaction
  BCode?: string;      // Buyer Broker Code
  BFreq?: number;      // Buyer Frequency
  BLotPerFreq?: number; // Buyer Lot/Frequency (Lot/F)
  BOrdNum?: number;    // Buyer Order Number
  SCode?: string;      // Seller Broker Code
  SFreq?: number;      // Seller Frequency
  SLotPerFreq?: number; // Seller Lot/Frequency (Lot/F)
  SOrdNum?: number;    // Seller Order Number
}


// Fetch broker transaction data from API
const fetchBrokerTransactionData = async (brokerCode: string, date: string): Promise<BrokerTransactionData[]> => {
  try {
    const response = await api.getBrokerTransactionData(brokerCode, date);
    if (response.success && response.data?.transactionData) {
      return response.data.transactionData;
    }
    return [];
  } catch (error) {
    console.error('Error fetching broker transaction data:', error);
    return [];
  }
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

const formatValue = (value: any): string => {
  // Handle null, undefined, or non-numeric values
  if (value === null || value === undefined || isNaN(Number(value))) {
    return '0';
  }
  return formatNumber(Number(value));
};

const formatLot = (value: number): string => {
  const rounded = Math.round(value);
  const absValue = Math.abs(rounded);
  
  if (absValue >= 1000000000) {
    // Use B (billion) with 3 decimal places
    // Format: ribuan pakai ',' (koma), desimal pakai '.' (titik)
    // Example: 144,000,000,000 → 144,000.000B
    const billions = rounded / 1000000000;
    const billionsStr = billions.toFixed(3);
    // Split integer and decimal parts
    const parts = billionsStr.split('.');
    const integerPart = parts[0] || '0';
    const decimalPart = parts[1] || '000';
    // Format integer part with thousand separator using en-US (comma for thousands)
    const integerFormatted = parseInt(integerPart).toLocaleString('en-US', { useGrouping: true, minimumFractionDigits: 0, maximumFractionDigits: 0 });
    return `${integerFormatted}.${decimalPart}B`;
  } else if (absValue >= 1000000) {
    // Use M (million) with 3 decimal places
    // Format: ribuan pakai ',' (koma), desimal pakai '.' (titik)
    // Example: 141,431,000 → 141,431.000M
    const millions = rounded / 1000000;
    const millionsStr = millions.toFixed(3);
    // Split integer and decimal parts
    const parts = millionsStr.split('.');
    const integerPart = parts[0] || '0';
    const decimalPart = parts[1] || '000';
    // Format integer part with thousand separator using en-US (comma for thousands)
    const integerFormatted = parseInt(integerPart).toLocaleString('en-US', { useGrouping: true, minimumFractionDigits: 0, maximumFractionDigits: 0 });
    return `${integerFormatted}.${decimalPart}M`;
  } else if (absValue >= 1000) {
    // Use K (thousand) with no decimals
    const thousands = rounded / 1000;
    return `${thousands.toLocaleString('en-US', { maximumFractionDigits: 0 })}K`;
  }
  return rounded.toLocaleString('en-US');
};

const formatAverage = (value: number): string => {
  // Format: ribuan pakai ',' (koma), desimal pakai '.' (titik)
  // Pastikan selalu 1 angka di belakang koma
  // Contoh: 1335.0, 10,000.5
  const rounded = Math.round(value * 10) / 10; // Round to 1 decimal place
  return rounded.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });
};

// Filter and sort functions
const getFilteredAndSortedStocks = (
  uniqueStocks: string[], 
  transactionData: Map<string, BrokerTransactionData[]>, 
  selectedDates: string[], 
  tickerSearch: string, 
  filter: string
) => {
  // Filter by ticker search
  let filteredStocks = uniqueStocks;
  if (tickerSearch.trim()) {
    filteredStocks = uniqueStocks.filter(stock => 
      stock.toLowerCase().includes(tickerSearch.toLowerCase())
    );
  }
  
  // Sort by filter
  if (filter !== 'all') {
    filteredStocks.sort((a, b) => {
      let aValue = 0;
      let bValue = 0;
      
      // Get the first date with data for comparison
      for (const date of selectedDates) {
        const dateData = transactionData.get(date) || [];
        const aData = dateData.find(d => d.Emiten === a);
        const bData = dateData.find(d => d.Emiten === b);
        
        if (aData && bData) {
          switch (filter) {
            case 'buyVol-highest':
            case 'buyVol-lowest':
              aValue = aData.BuyerVol || 0;
              bValue = bData.BuyerVol || 0;
              break;
            case 'buyVal-highest':
            case 'buyVal-lowest':
              aValue = aData.BuyerValue || 0;
              bValue = bData.BuyerValue || 0;
              break;
            case 'sellVol-highest':
            case 'sellVol-lowest':
              aValue = aData.SellerVol || 0;
              bValue = bData.SellerVol || 0;
              break;
            case 'sellVal-highest':
            case 'sellVal-lowest':
              aValue = aData.SellerValue || 0;
              bValue = bData.SellerValue || 0;
              break;
            case 'netBuyVol-highest':
            case 'netBuyVol-lowest':
              aValue = aData.NetBuyVol || 0;
              bValue = bData.NetBuyVol || 0;
              break;
            case 'netBuyVal-highest':
            case 'netBuyVal-lowest':
              aValue = aData.NetBuyValue || 0;
              bValue = bData.NetBuyValue || 0;
              break;
            case 'totalVol-highest':
            case 'totalVol-lowest':
              aValue = aData.TotalVolume || 0;
              bValue = bData.TotalVolume || 0;
              break;
            case 'totalVal-highest':
            case 'totalVal-lowest':
              aValue = aData.TotalValue || 0;
              bValue = bData.TotalValue || 0;
              break;
          }
          break;
        }
      }
        
      // Determine sort direction based on filter
      if (filter.includes('-lowest')) {
        return aValue - bValue; // Lowest to highest
      } else {
        return bValue - aValue; // Highest to lowest
      }
    });
  }
  
  return filteredStocks;
};

// Get trading days based on count (start from yesterday, skip today)
// Returns dates sorted from oldest to newest (for display left to right)
const getTradingDays = (count: number): string[] => {
  const dates: string[] = [];
  const today = new Date();
  let daysBack = 1; // Start from yesterday, skip today
  
  while (dates.length < count) {
    const date = new Date(today);
    date.setDate(date.getDate() - daysBack);
    const dayOfWeek = date.getDay();
    
    // Skip weekends (Saturday = 6, Sunday = 0)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      const dateStr = date.toISOString().split('T')[0];
      if (dateStr) {
        dates.push(dateStr);
      }
    }
    daysBack++;
  }
  
  // Sort from oldest to newest (for display left to right)
  return dates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
};

// Helper function to get last 3 trading days (starting from yesterday, sorted oldest first)
const getLastThreeDays = (): string[] => {
  return getTradingDays(3);
};

export function BrokerTransaction() {
  const [selectedDates, setSelectedDates] = useState<string[]>([]);

// Get available dates from backend and return recent trading days (oldest first for display)
const getAvailableTradingDays = async (count: number): Promise<string[]> => {
  try {
    // Get available dates from backend
    const response = await api.getBrokerTransactionDates();
    if (response.success && response.data?.dates) {
      // Sort from newest to oldest, then take first count, then reverse for display (oldest first)
      const availableDates = response.data.dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
      return availableDates.slice(0, count).reverse(); // Reverse to get oldest first
    }
  } catch (error) {
    console.error('Error fetching available dates:', error);
  }
  
  // Fallback to local calculation if backend fails (already sorted oldest first)
  return getTradingDays(count);
};
  const [startDate, setStartDate] = useState(() => {
    const threeDays = getLastThreeDays();
    if (threeDays.length > 0) {
      const sortedDates = [...threeDays].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      return sortedDates[0];
    }
    return '';
  });
  const [endDate, setEndDate] = useState(() => {
    const threeDays = getLastThreeDays();
    if (threeDays.length > 0) {
      const sortedDates = [...threeDays].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      return sortedDates[sortedDates.length - 1];
    }
    return '';
  });
  const [brokerInput, setBrokerInput] = useState('');
  const [selectedBrokers, setSelectedBrokers] = useState<string[]>(['CC']);
  const [showBrokerSuggestions, setShowBrokerSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);
  const dropdownBrokerRef = useRef<HTMLDivElement>(null);
  
  // Refs for table synchronization
  const valueTableRef = useRef<HTMLTableElement>(null);
  const netTableRef = useRef<HTMLTableElement>(null);
  const valueTableContainerRef = useRef<HTMLDivElement>(null);
  const netTableContainerRef = useRef<HTMLDivElement>(null);
  
  // Store date column widths from Value table
  const dateColumnWidthsRef = useRef<Map<string, number>>(new Map());
  
  // API data states
  const [transactionData, setTransactionData] = useState<Map<string, BrokerTransactionData[]>>(new Map());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [availableBrokers, setAvailableBrokers] = useState<string[]>([]);
  
  // Search states
  const [tickerSearch, setTickerSearch] = useState<string>('');

  // Load available brokers and initial dates on component mount
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // Load broker list from csv_input/broker_list.csv
        const brokerResponse = await api.getBrokerList();
        if (brokerResponse.success && brokerResponse.data?.brokers) {
          setAvailableBrokers(brokerResponse.data.brokers);
        } else {
          throw new Error('Failed to load broker list');
        }
        
        // Load initial dates based on available data
        const initialDates = await getAvailableTradingDays(3);
        // Sort by date (oldest first) for display
        const sortedDates = [...initialDates].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
        setSelectedDates(sortedDates);
        
        // Set initial date range
        if (sortedDates.length > 0) {
          setStartDate(sortedDates[0]);
          setEndDate(sortedDates[sortedDates.length - 1]);
        }
        
      } catch (error) {
        console.error('Error loading initial data:', error);
        
        // Fallback to hardcoded broker list and local date calculation
        const brokers = ['MG','CIMB','UOB','COIN','NH','TRIM','DEWA','BNCA','PNLF','VRNA','SD','LMGA','DEAL','ESA','SSA'];
        setAvailableBrokers(brokers);
        
        const fallbackDates = getTradingDays(3);
        // Sort by date (oldest first) for display
          const sortedDates = [...fallbackDates].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
        setSelectedDates(sortedDates);
        
        if (sortedDates.length > 0) {
          setStartDate(sortedDates[0]);
          setEndDate(sortedDates[sortedDates.length - 1]);
        }
      }
    };

    loadInitialData();
  }, []);

  // Load transaction data when selected brokers or dates change
  useEffect(() => {
    const loadTransactionData = async () => {
      if (selectedBrokers.length === 0 || selectedDates.length === 0) return;
      
      setIsLoading(true);
      setError(null);
      
      try {
        const newTransactionData = new Map<string, BrokerTransactionData[]>();
        
        // Load data for ALL selected dates and ALL selected brokers
        for (const date of selectedDates) {
          // Aggregate data from all selected brokers per emiten
          const aggregatedByEmiten = new Map<string, BrokerTransactionData>();
          
          for (const broker of selectedBrokers) {
            try {
              const data = await fetchBrokerTransactionData(broker, date);
              
              // Aggregate data per emiten
              for (const row of data) {
                const emiten = row.Emiten;
                const existing = aggregatedByEmiten.get(emiten);
                
                if (existing) {
                  // Sum all values
                  existing.BuyerVol += row.BuyerVol || 0;
                  existing.BuyerValue += row.BuyerValue || 0;
                  existing.SellerVol += row.SellerVol || 0;
                  existing.SellerValue += row.SellerValue || 0;
                  existing.NetBuyVol += row.NetBuyVol || 0;
                  existing.NetBuyValue += row.NetBuyValue || 0;
                  existing.TotalVolume += row.TotalVolume || 0;
                  existing.TotalValue += row.TotalValue || 0;
                  existing.TransactionCount += row.TransactionCount || 0;
                  
                  // Recalculate averages
                  existing.BuyerAvg = existing.BuyerVol > 0 ? existing.BuyerValue / existing.BuyerVol : 0;
                  existing.SellerAvg = existing.SellerVol > 0 ? existing.SellerValue / existing.SellerVol : 0;
                  existing.AvgPrice = existing.TotalVolume > 0 ? existing.TotalValue / existing.TotalVolume : 0;
            } else {
                  // First occurrence of this emiten
                  aggregatedByEmiten.set(emiten, { ...row });
                }
            }
          } catch (err) {
              console.log(`No data available for ${broker} on ${date}`);
          }
          }
          
          // Convert map to array
          const aggregatedData = Array.from(aggregatedByEmiten.values());
          newTransactionData.set(date, aggregatedData);
        }
        
        setTransactionData(newTransactionData);
        
      } catch (err) {
        setError('Failed to load transaction data');
        console.error('Error loading transaction data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadTransactionData();
  }, [selectedBrokers, selectedDates]);

  // Update date range when startDate or endDate changes
  useEffect(() => {
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      // Reset time to avoid timezone issues
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      
      // Check if range is valid
      if (start > end) {
        console.warn('Tanggal mulai harus sebelum tanggal akhir');
        return;
      }
      
      // Generate date array (only trading days)
      const dateArray: string[] = [];
      const currentDate = new Date(start);
      currentDate.setHours(0, 0, 0, 0);
      const endDateObj = new Date(end);
      endDateObj.setHours(0, 0, 0, 0);
      
      while (currentDate <= endDateObj) {
        const dayOfWeek = currentDate.getDay();
        // Skip weekends (Saturday = 6, Sunday = 0)
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          const dateString = currentDate.toISOString().split('T')[0];
          if (dateString) {
            dateArray.push(dateString);
          }
        }
        const nextDate = new Date(currentDate);
        nextDate.setDate(nextDate.getDate() + 1);
        currentDate.setTime(nextDate.getTime());
      }
      
      // Check if trading days exceed 7
      if (dateArray.length > 7) {
        alert('Maksimal 7 hari kerja yang bisa dipilih');
        // Still limit to 7 days but keep the selected range
        const limitedDates = dateArray.slice(0, 7);
        const sortedDates = limitedDates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
        setSelectedDates(sortedDates);
        return;
      }
      
      // Sort by date (oldest first) for display
      const sortedDates = dateArray.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      setSelectedDates(sortedDates);
    }
  }, [startDate, endDate]);

  const formatDisplayDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  // Helper function to trigger date picker
  const triggerDatePicker = (inputRef: React.RefObject<HTMLInputElement>) => {
    if (inputRef.current) {
      inputRef.current.showPicker();
    }
  };

  // Helper function to format date for input (YYYY-MM-DD)
  const formatDateForInput = (date: string | undefined) => {
    return date || ''; // Already in YYYY-MM-DD format
  };

  // Font size fixed to normal
  const getFontSizeClass = () => 'text-[13px]';

  // Handle broker selection
  const handleBrokerSelect = (broker: string) => {
    if (!selectedBrokers.includes(broker)) {
      setSelectedBrokers([...selectedBrokers, broker]);
    }
    setBrokerInput('');
    setShowBrokerSuggestions(false);
  };

  // Handle broker removal
  const handleRemoveBroker = (broker: string) => {
    setSelectedBrokers(selectedBrokers.filter(b => b !== broker));
  };

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownBrokerRef.current && !dropdownBrokerRef.current.contains(event.target as Node)) {
        setShowBrokerSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Synchronize table widths between Value and Net tables
  useEffect(() => {
    if (isLoading || selectedDates.length === 0) return;
    
    // Clear stored widths when dates change
    dateColumnWidthsRef.current.clear();

    const syncTableWidths = () => {
      const valueTable = valueTableRef.current;
      const netTable = netTableRef.current;

      if (!valueTable || !netTable) return;

      // Sync overall table width
      const valueTableWidth = valueTable.scrollWidth || valueTable.offsetWidth;
      
      if (valueTableWidth > 0) {
        netTable.style.width = `${valueTableWidth}px`;
        netTable.style.minWidth = `${valueTableWidth}px`;
        netTable.style.maxWidth = `${valueTableWidth}px`;
      }

      // Sync date column group widths (colspan=17 headers)
      const valueHeaderRows = valueTable.querySelectorAll('thead tr');
      const netHeaderRows = netTable.querySelectorAll('thead tr');
      
      if (valueHeaderRows.length >= 2 && netHeaderRows.length >= 2) {
        // Get first header row (date headers with colspan=17)
        const valueDateHeaderRow = valueHeaderRows[0];
        const netDateHeaderRow = netHeaderRows[0];
        
        if (valueDateHeaderRow && netDateHeaderRow) {
          const valueDateHeaderCells = valueDateHeaderRow.querySelectorAll('th[colspan="17"]');
          const netDateHeaderCells = netDateHeaderRow.querySelectorAll('th[colspan="17"]');
          
          // Store widths from Value table and apply to Net table
          valueDateHeaderCells.forEach((valueCell, index) => {
            const netCell = netDateHeaderCells[index] as HTMLElement;
            if (netCell && valueCell) {
              const valueWidth = (valueCell as HTMLElement).offsetWidth;
              
              // Store width by date index (excluding Total column)
              if (index < selectedDates.length) {
                const date = selectedDates[index];
                if (date) {
                  dateColumnWidthsRef.current.set(date, valueWidth);
                }
              }
              
              // Apply width to Net table
              const width = `${valueWidth}px`;
              netCell.style.width = width;
              netCell.style.minWidth = width;
              netCell.style.maxWidth = width;
            }
          });
          
          // Also sync all body cells within each date column group
          const valueBodyRows = valueTable.querySelectorAll('tbody tr');
          const netBodyRows = netTable.querySelectorAll('tbody tr');
          
          valueBodyRows.forEach((valueRow, rowIndex) => {
            const netRow = netBodyRows[rowIndex] as HTMLTableRowElement;
            if (!valueRow || !netRow) return;
            
            // For each date column group (17 cells), sync all cells
            selectedDates.forEach((date, dateIndex) => {
              const startCellIndex = dateIndex * 17;
              const storedWidth = dateColumnWidthsRef.current.get(date);
              
              if (storedWidth) {
                // Sync each cell in this date column group
                for (let i = 0; i < 17; i++) {
                  const valueCell = valueRow.children[startCellIndex + i] as HTMLElement;
                  const netCell = netRow.children[startCellIndex + i] as HTMLElement;
                  
                  if (valueCell && netCell) {
                    const cellWidth = valueCell.offsetWidth;
                    const width = `${cellWidth}px`;
                    netCell.style.width = width;
                    netCell.style.minWidth = width;
                    netCell.style.maxWidth = width;
                  }
                }
              }
            });
            
            // Also sync Total column if exists
            const totalStartIndex = selectedDates.length * 17;
            const valueTotalCells = Array.from(valueRow.children).slice(totalStartIndex);
            const netTotalCells = Array.from(netRow.children).slice(totalStartIndex);
            
            valueTotalCells.forEach((valueCell, idx) => {
              const netCell = netTotalCells[idx] as HTMLElement;
              if (netCell && valueCell) {
                const cellWidth = (valueCell as HTMLElement).offsetWidth;
                const width = `${cellWidth}px`;
                netCell.style.width = width;
                netCell.style.minWidth = width;
                netCell.style.maxWidth = width;
              }
            });
          });
        }

        // Sync individual column header widths
        const valueColumnHeaderRow = valueHeaderRows[1];
        const netColumnHeaderRow = netHeaderRows[1];
        
        if (valueColumnHeaderRow && netColumnHeaderRow) {
          const valueHeaderCells = valueColumnHeaderRow.querySelectorAll('th');
          const netHeaderCells = netColumnHeaderRow.querySelectorAll('th');
          
          valueHeaderCells.forEach((valueCell, index) => {
            const netCell = netHeaderCells[index] as HTMLElement;
            if (netCell && valueCell) {
              const width = `${(valueCell as HTMLElement).offsetWidth}px`;
              netCell.style.width = width;
              netCell.style.minWidth = width;
              netCell.style.maxWidth = width;
            }
          });
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
    
    // Initial sync with delay
    const initialTimeoutId = setTimeout(() => {
      syncTableWidths();
    }, 400);
    
    // Sync after data finishes loading
    let dataTimeoutId: NodeJS.Timeout | null = null;
    if (!isLoading) {
      dataTimeoutId = setTimeout(() => {
        syncTableWidths();
      }, 700);
    }

    // Use ResizeObserver to watch for changes
    let resizeObserver: ResizeObserver | null = null;
    
    if (valueTableRef.current) {
      resizeObserver = new ResizeObserver(() => {
        debouncedSync();
      });
      resizeObserver.observe(valueTableRef.current);
    }

    if (valueTableContainerRef.current) {
      if (!resizeObserver) {
        resizeObserver = new ResizeObserver(() => {
          debouncedSync();
        });
      }
      resizeObserver.observe(valueTableContainerRef.current);
    }

    // Also sync on window resize
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
  }, [selectedDates, isLoading, transactionData]);

  // Synchronize horizontal scroll between Value and Net tables
  useEffect(() => {
    if (isLoading || selectedDates.length === 0) return;

    const valueContainer = valueTableContainerRef.current;
    const netContainer = netTableContainerRef.current;

    if (!valueContainer || !netContainer) return;

    // Flag to prevent infinite loop
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
  }, [isLoading, selectedDates, transactionData]);

  const renderHorizontalView = () => {
    if (selectedBrokers.length === 0 || selectedDates.length === 0) return null;
    
    // Get all unique stocks from all dates
    const allStocks = new Set<string>();
    selectedDates.forEach(date => {
        const data = transactionData.get(date) || [];
      data.forEach(item => allStocks.add(item.Emiten));
    });
    
    const uniqueStocks = Array.from(allStocks);
    
    if (uniqueStocks.length === 0) {
      return (
        <div className="text-center py-16">
          <div className="text-gray-400 text-sm">
            No data available for {selectedBrokers.join(', ')} on selected dates
          </div>
        </div>
      );
    }
    
    // Filter stocks by ticker search
    const filteredStocks = uniqueStocks.filter(stock => 
      !tickerSearch.trim() || stock.toLowerCase().includes(tickerSearch.toLowerCase())
    );
    
    // Sort stocks by BVal (highest to lowest) for each date - for VALUE table
    // Create a map of stocks sorted per date
    const sortedStocksByDate = new Map<string, string[]>();
    selectedDates.forEach(date => {
      const dateData = transactionData.get(date) || [];
      const stocksWithData = dateData
        .filter(d => filteredStocks.includes(d.Emiten))
        .sort((a, b) => (b.BuyerValue || 0) - (a.BuyerValue || 0))
        .map(d => d.Emiten);
      sortedStocksByDate.set(date, stocksWithData);
    });
    
    // Sort stocks by SVal (Seller Value) (highest to lowest) for each date - for NET table
    const sortedNetStocksByDate = new Map<string, string[]>();
    selectedDates.forEach(date => {
      const dateData = transactionData.get(date) || [];
      const stocksWithData = dateData
        .filter(d => filteredStocks.includes(d.Emiten))
        .sort((a, b) => (b.SellerValue || 0) - (a.SellerValue || 0))
        .map(d => d.Emiten);
      sortedNetStocksByDate.set(date, stocksWithData);
    });
    
    // VALUE Table - Shows Buyer and Seller data
    const renderValueTable = () => {
      // Get sorted stocks for first date (or use filteredStocks if no data)
      const firstDate = selectedDates.length > 0 ? selectedDates[0] : '';
      const sortedStocks = firstDate ? (sortedStocksByDate.get(firstDate) || filteredStocks) : filteredStocks;
      
      // Calculate total data aggregated across all dates for each stock
      const totalDataByStock = new Map<string, {
        buyerVol: number;
        buyerValue: number;
        buyerAvg: number;
        buyerFreq: number;
        buyerOrdNum: number;
        sellerVol: number;
        sellerValue: number;
        sellerAvg: number;
        sellerFreq: number;
        sellerOrdNum: number;
        buyerAvgCount: number;
        sellerAvgCount: number;
      }>();
      
      selectedDates.forEach(date => {
        const dateData = transactionData.get(date) || [];
        dateData.forEach(dayData => {
          if (!filteredStocks.includes(dayData.Emiten)) return;
          
          const stock = dayData.Emiten;
          if (!totalDataByStock.has(stock)) {
            totalDataByStock.set(stock, {
              buyerVol: 0,
              buyerValue: 0,
              buyerAvg: 0,
              buyerFreq: 0,
              buyerOrdNum: 0,
              sellerVol: 0,
              sellerValue: 0,
              sellerAvg: 0,
              sellerFreq: 0,
              sellerOrdNum: 0,
              buyerAvgCount: 0,
              sellerAvgCount: 0,
            });
          }
          
          const total = totalDataByStock.get(stock)!;
          total.buyerVol += Number(dayData.BuyerVol) || 0;
          total.buyerValue += Number(dayData.BuyerValue) || 0;
          total.buyerFreq += Number(dayData.BFreq) || Number(dayData.TransactionCount) || 0;
          total.buyerOrdNum += Number(dayData.BOrdNum) || 0;
          total.sellerVol += Number(dayData.SellerVol) || 0;
          total.sellerValue += Number(dayData.SellerValue) || 0;
          total.sellerFreq += Number(dayData.SFreq) || Number(dayData.TransactionCount) || 0;
          total.sellerOrdNum += Number(dayData.SOrdNum) || 0;
          
          // Calculate average by accumulating and counting
          if (dayData.BuyerAvg || (dayData.BuyerVol && dayData.BuyerVol > 0)) {
            total.buyerAvg += dayData.BuyerAvg || ((dayData.BuyerValue || 0) / (dayData.BuyerVol || 1));
            total.buyerAvgCount += 1;
          }
          if (dayData.SellerAvg || (dayData.SellerVol && dayData.SellerVol > 0)) {
            total.sellerAvg += dayData.SellerAvg || ((dayData.SellerValue || 0) / (dayData.SellerVol || 1));
            total.sellerAvgCount += 1;
        }
      });
    });
    
      // Calculate final averages
      totalDataByStock.forEach((total, stock) => {
        total.buyerAvg = total.buyerAvgCount > 0 ? total.buyerAvg / total.buyerAvgCount : (total.buyerVol > 0 ? total.buyerValue / total.buyerVol : 0);
        total.sellerAvg = total.sellerAvgCount > 0 ? total.sellerAvg / total.sellerAvgCount : (total.sellerVol > 0 ? total.sellerValue / total.sellerVol : 0);
      });
      
      // Sort stocks by total buyer value (highest to lowest) for Total column
      const sortedTotalStocks = Array.from(totalDataByStock.entries())
        .sort((a, b) => b[1].buyerValue - a[1].buyerValue)
        .map(([stock]) => stock);
      
      return (
        <div className="w-full max-w-full mt-1">
          <div className="bg-muted/50 px-4 py-1.5 border-y border-border">
            <h3 className="font-semibold text-sm">VALUE - {selectedBrokers.join(', ')} ({sortedStocks.length} stocks)</h3>
          </div>
          <div className="w-full max-w-full">
            <div ref={valueTableContainerRef} className="w-full max-w-full overflow-x-auto max-h-[494px] overflow-y-auto border-l-2 border-r-2 border-b-2 border-white">
              <table ref={valueTableRef} className={`min-w-[1000px] ${getFontSizeClass()} table-auto`}>
                <thead className="bg-[#3a4252]">
                  {/* Date Header Row */}
                  <tr className="border-t-2 border-white">
                    {selectedDates.map((date, dateIndex) => (
                      <th 
                        key={date} 
                        className={`text-center py-[1px] px-[8.24px] font-bold text-white whitespace-nowrap ${dateIndex === 0 ? 'border-l-2 border-white' : ''} ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} 
                        colSpan={17}
                      >
                        {formatDisplayDate(date)}
                      </th>
                    ))}
                    <th className={`text-center py-[1px] px-[4.2px] font-bold text-white border-r-2 border-white ${selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} colSpan={17}>
                      Total
                    </th>
                  </tr>
                  {/* Column Header Row */}
                  <tr className="bg-[#3a4252]">
                    {selectedDates.map((date, dateIndex) => (
                      <React.Fragment key={date}>
                        {/* Buyer Columns */}
                        <th className={`text-center py-[1px] px-[4.2px] font-bold text-white w-4 ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`} title={formatDisplayDate(date)}>BCode</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>BLot</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>BVal</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>BAvg</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>BFreq</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>Lot/F</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>BOrdNum</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-10" title={formatDisplayDate(date)}>Lot/ON</th>
                        {/* Separator */}
                        <th className="text-center py-[1px] px-[4.2px] font-bold text-white bg-[#3a4252] w-4" title={formatDisplayDate(date)}>#</th>
                        {/* Seller Columns */}
                        <th className="text-center py-[1px] px-[4.2px] font-bold text-white w-4" title={formatDisplayDate(date)}>SCode</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>SLot</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>SVal</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>SAvg</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>SFreq</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>Lot/F</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>SOrdNum</th>
                        <th className={`text-right py-[1px] px-[4.2px] font-bold text-white w-10 ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} title={formatDisplayDate(date)}>Lot/ON</th>
                      </React.Fragment>
                    ))}
                    {/* Total Columns */}
                    <th className={`text-center py-[1px] px-[4.2px] font-bold text-white ${selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`}>BCode</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">BLot</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">BVal</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">BAvg</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">BFreq</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">Lot/F</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">BOrdNum</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">Lot/ON</th>
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white bg-[#3a4252]">#</th>
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white">SCode</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">SLot</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">SVal</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">SAvg</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">SFreq</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">Lot/F</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">SOrdNum</th>
                    <th className="text-right py-[1px] px-[6px] font-bold text-white border-r-2 border-white">Lot/ON</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedStocks.map((stock, stockIdx) => (
                    <tr key={stockIdx} className="border-b border-[#3a4252]/50">
                      {selectedDates.map((date, dateIndex) => {
                        // Sort stocks by BVal for this specific date
                        const dateSortedStocks = sortedStocksByDate.get(date) || [];
                        const currentStockIndex = dateSortedStocks.indexOf(stock);
                        const dateData = transactionData.get(date) || [];
                        const dayData = dateData.find(d => d.Emiten === stock);
                        const hasData = dayData !== undefined;
                        
                        if (!hasData || !dayData) {
                          return (
                            <td key={date} className={`text-center py-[1px] px-[4.2px] text-gray-400 ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`} colSpan={17}>
                              No Data
                            </td>
                          );
                        }
                        
                        const buyerLot = (dayData.BuyerVol || 0) / 100;
                        const buyerAvg = dayData.BuyerAvg || ((dayData.BuyerVol || 0) > 0 ? (dayData.BuyerValue || 0) / (dayData.BuyerVol || 0) : 0);
                        const sellerLot = (dayData.SellerVol || 0) / 100;
                        const sellerAvg = dayData.SellerAvg || ((dayData.SellerVol || 0) > 0 ? (dayData.SellerValue || 0) / (dayData.SellerVol || 0) : 0);
                        const buyerFreq = dayData.BFreq || dayData.TransactionCount || 0;
                        const sellerFreq = dayData.SFreq || dayData.TransactionCount || 0;
                        const buyerLotPerFreq = buyerFreq > 0 ? buyerLot / buyerFreq : 0;
                        const sellerLotPerFreq = sellerFreq > 0 ? sellerLot / sellerFreq : 0;
                        const buyerOrdNum = dayData.BOrdNum || 0;
                        const sellerOrdNum = dayData.SOrdNum || 0;
                        const buyerLotPerOrdNum = buyerOrdNum > 0 ? buyerLot / buyerOrdNum : 0;
                        const sellerLotPerOrdNum = sellerOrdNum > 0 ? sellerLot / sellerOrdNum : 0;
                        
                        return (
                          <React.Fragment key={date}>
                            {/* Buyer Columns */}
                            <td className={`text-center py-[1px] px-[4.2px] font-bold text-green-600 w-4 ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`}>
                              {dayData.BCode || stock}
                            </td>
                            <td className="text-right py-[1px] px-[4.2px] font-bold text-green-600 w-6">{formatLot(buyerLot)}</td>
                            <td className="text-right py-[1px] px-[4.2px] font-bold text-green-600 w-6">{formatValue(dayData.BuyerValue || 0)}</td>
                            <td className="text-right py-[1px] px-[4.2px] font-bold text-green-600 w-6">{formatAverage(buyerAvg)}</td>
                            <td className="text-right py-[1px] px-[4.2px] font-bold text-green-600 w-6">{buyerFreq}</td>
                            <td className="text-right py-[1px] px-[4.2px] font-bold text-green-600 w-6">{formatAverage(buyerLotPerFreq)}</td>
                            <td className="text-right py-[1px] px-[4.2px] font-bold text-green-600 w-6">{buyerOrdNum}</td>
                            <td className="text-right py-[1px] px-[4.2px] font-bold text-green-600 w-10">{buyerOrdNum > 0 ? formatAverage(buyerLotPerOrdNum) : formatAverage(0)}</td>
                            {/* Separator */}
                            <td className="text-center py-[1px] px-[4.2px] text-white bg-[#3a4252] font-bold w-4">{currentStockIndex >= 0 ? currentStockIndex + 1 : 0}</td>
                            {/* Seller Columns */}
                            <td className="text-center py-[1px] px-[4.2px] font-bold text-red-600 w-4">{dayData.SCode || stock}</td>
                            <td className="text-right py-[1px] px-[4.2px] font-bold text-red-600 w-6">{formatLot(sellerLot)}</td>
                            <td className="text-right py-[1px] px-[4.2px] font-bold text-red-600 w-6">{formatValue(dayData.SellerValue || 0)}</td>
                            <td className="text-right py-[1px] px-[4.2px] font-bold text-red-600 w-6">{formatAverage(sellerAvg)}</td>
                            <td className="text-right py-[1px] px-[4.2px] font-bold text-red-600 w-6">{sellerFreq}</td>
                            <td className="text-right py-[1px] px-[4.2px] font-bold text-red-600 w-6">{formatAverage(sellerLotPerFreq)}</td>
                            <td className="text-right py-[1px] px-[4.2px] font-bold text-red-600 w-6">{sellerOrdNum}</td>
                            <td className={`text-right py-[1px] px-[4.2px] font-bold text-red-600 w-10 ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`}>
                              {sellerOrdNum > 0 ? formatAverage(sellerLotPerOrdNum) : formatAverage(0)}
                            </td>
                          </React.Fragment>
                        );
                      })}
                      {/* Total Column */}
                      {(() => {
                        const totalData = totalDataByStock.get(stock);
                        if (!totalData) {
                          return (
                            <td className={`text-center py-[1px] px-[4.2px] text-gray-400 ${selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} colSpan={17}>
                              No Data
                            </td>
                          );
                        }
                        
                        const totalBuyerLot = totalData.buyerVol / 100;
                        const totalSellerLot = totalData.sellerVol / 100;
                        const totalBuyerLotPerFreq = totalData.buyerFreq > 0 ? totalBuyerLot / totalData.buyerFreq : 0;
                        const totalSellerLotPerFreq = totalData.sellerFreq > 0 ? totalSellerLot / totalData.sellerFreq : 0;
                        const totalBuyerLotPerOrdNum = totalData.buyerOrdNum > 0 ? totalBuyerLot / totalData.buyerOrdNum : 0;
                        const totalSellerLotPerOrdNum = totalData.sellerOrdNum > 0 ? totalSellerLot / totalData.sellerOrdNum : 0;
                        const totalStockIndex = sortedTotalStocks.indexOf(stock);
                        
                        return (
                          <React.Fragment>
                            {/* Buyer Columns */}
                            <td className={`text-center py-[1px] px-[4.2px] font-bold text-green-600 ${selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`}>
                              {totalData.buyerVol > 0 ? stock : '-'}
                            </td>
                            <td className="text-right py-[1px] px-[4.2px] font-bold text-green-600">{formatLot(totalBuyerLot)}</td>
                            <td className="text-right py-[1px] px-[4.2px] font-bold text-green-600">{formatValue(totalData.buyerValue)}</td>
                            <td className="text-right py-[1px] px-[4.2px] font-bold text-green-600">{formatAverage(totalData.buyerAvg)}</td>
                            <td className="text-right py-[1px] px-[4.2px] font-bold text-green-600">{totalData.buyerFreq}</td>
                            <td className="text-right py-[1px] px-[4.2px] font-bold text-green-600">{formatAverage(totalBuyerLotPerFreq)}</td>
                            <td className="text-right py-[1px] px-[4.2px] font-bold text-green-600">{totalData.buyerOrdNum}</td>
                            <td className="text-right py-[1px] px-[4.2px] font-bold text-green-600">{totalData.buyerOrdNum > 0 ? formatAverage(totalBuyerLotPerOrdNum) : formatAverage(0)}</td>
                            {/* Separator */}
                            <td className="text-center py-[1px] px-[4.2px] text-white bg-[#3a4252] font-bold">{totalStockIndex >= 0 ? totalStockIndex + 1 : 0}</td>
                            {/* Seller Columns */}
                            <td className="text-center py-[1px] px-[4.2px] font-bold text-red-600">
                              {totalData.sellerVol > 0 ? stock : '-'}
                            </td>
                            <td className="text-right py-[1px] px-[4.2px] font-bold text-red-600">{formatLot(totalSellerLot)}</td>
                            <td className="text-right py-[1px] px-[4.2px] font-bold text-red-600">{formatValue(totalData.sellerValue)}</td>
                            <td className="text-right py-[1px] px-[4.2px] font-bold text-red-600">{formatAverage(totalData.sellerAvg)}</td>
                            <td className="text-right py-[1px] px-[4.2px] font-bold text-red-600">{totalData.sellerFreq}</td>
                            <td className="text-right py-[1px] px-[4.2px] font-bold text-red-600">{formatAverage(totalSellerLotPerFreq)}</td>
                            <td className="text-right py-[1px] px-[4.2px] font-bold text-red-600">{totalData.sellerOrdNum}</td>
                            <td className="text-right py-[1px] px-[6px] font-bold text-red-600 border-r-2 border-white">
                              {totalData.sellerOrdNum > 0 ? formatAverage(totalSellerLotPerOrdNum) : formatAverage(0)}
                            </td>
                          </React.Fragment>
                        );
                      })()}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    };
    
    // NET Table - Shows Net Buy/Sell data
    const renderNetTable = () => {
      // Get sorted stocks for first date (or use filteredStocks if no data)
      const firstDate = selectedDates.length > 0 ? selectedDates[0] : '';
      const sortedStocks = firstDate ? (sortedNetStocksByDate.get(firstDate) || filteredStocks) : filteredStocks;
      
      // Calculate total Net data aggregated across all dates for each stock
      const totalNetDataByStock = new Map<string, {
        netBuyVol: number;
        netBuyValue: number;
        netBuyAvg: number;
        netBuyFreq: number;
        netBuyOrdNum: number;
        netSellVol: number;
        netSellValue: number;
        netSellAvg: number;
        netSellFreq: number;
        netSellOrdNum: number;
        netBuyAvgCount: number;
        netSellAvgCount: number;
      }>();
      
      selectedDates.forEach(date => {
        const dateData = transactionData.get(date) || [];
        dateData.forEach(dayData => {
          if (!filteredStocks.includes(dayData.Emiten)) return;
          
          const stock = dayData.Emiten;
          if (!totalNetDataByStock.has(stock)) {
            totalNetDataByStock.set(stock, {
              netBuyVol: 0,
              netBuyValue: 0,
              netBuyAvg: 0,
              netBuyFreq: 0,
              netBuyOrdNum: 0,
              netSellVol: 0,
              netSellValue: 0,
              netSellAvg: 0,
              netSellFreq: 0,
              netSellOrdNum: 0,
              netBuyAvgCount: 0,
              netSellAvgCount: 0,
            });
          }
          
          const total = totalNetDataByStock.get(stock)!;
          const netBuyVol = Number(dayData.NetBuyVol) || 0;
          const netBuyValue = Number(dayData.NetBuyValue) || 0;
          const netSellVol = netBuyVol < 0 ? Math.abs(netBuyVol) : 0;
          const netSellValue = netBuyValue < 0 ? Math.abs(netBuyValue) : 0;
          
          if (netBuyVol >= 0) {
            total.netBuyVol += netBuyVol;
            total.netBuyValue += netBuyValue;
          } else {
            total.netSellVol += netSellVol;
            total.netSellValue += netSellValue;
          }
          
          total.netBuyFreq += Number(dayData.BFreq) || 0;
          total.netBuyOrdNum += Number(dayData.BOrdNum) || 0;
          total.netSellFreq += Number(dayData.SFreq) || 0;
          total.netSellOrdNum += Number(dayData.SOrdNum) || 0;
          
          // Calculate average
          if (netBuyVol >= 0 && netBuyVol > 0) {
            total.netBuyAvg += netBuyValue / netBuyVol;
            total.netBuyAvgCount += 1;
          }
          if (netSellVol > 0) {
            total.netSellAvg += netSellValue / netSellVol;
            total.netSellAvgCount += 1;
          }
        });
      });
      
      // Calculate final averages
      totalNetDataByStock.forEach((total, stock) => {
        total.netBuyAvg = total.netBuyAvgCount > 0 ? total.netBuyAvg / total.netBuyAvgCount : (total.netBuyVol > 0 ? total.netBuyValue / total.netBuyVol : 0);
        total.netSellAvg = total.netSellAvgCount > 0 ? total.netSellAvg / total.netSellAvgCount : (total.netSellVol > 0 ? total.netSellValue / total.netSellVol : 0);
      });
      
      // Sort stocks by total net sell value (highest to lowest) for Total column
      const sortedTotalNetStocks = Array.from(totalNetDataByStock.entries())
        .sort((a, b) => b[1].netSellValue - a[1].netSellValue)
        .map(([stock]) => stock);
    
    return (
        <div className="w-full max-w-full mt-1">
          <div className="bg-muted/50 px-4 py-1.5 border-y border-border">
            <h3 className="font-semibold text-sm">NET - {selectedBrokers.join(', ')} ({sortedStocks.length} stocks)</h3>
          </div>
          <div className="w-full max-w-full">
            <div ref={netTableContainerRef} className="w-full max-w-full overflow-x-auto max-h-[494px] overflow-y-auto border-l-2 border-r-2 border-b-2 border-white">
              <table ref={netTableRef} className={`min-w-[1000px] ${getFontSizeClass()} table-auto`}>
                <thead className="bg-[#3a4252]">
                  {/* Date Header Row */}
                  <tr className="border-t-2 border-white">
                    {selectedDates.map((date, dateIndex) => (
                      <th 
                        key={date} 
                        className={`text-center py-[1px] px-[8.24px] font-bold text-white whitespace-nowrap ${dateIndex === 0 ? 'border-l-2 border-white' : ''} ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} 
                        colSpan={17}
                      >
                        {formatDisplayDate(date)}
                      </th>
                    ))}
                    <th className={`text-center py-[1px] px-[4.2px] font-bold text-white border-r-2 border-white ${selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} colSpan={17}>
                      Total
                    </th>
                  </tr>
                  {/* Column Header Row */}
                  <tr className="bg-[#3a4252]">
                    {selectedDates.map((date, dateIndex) => (
                      <React.Fragment key={date}>
                        {/* Net Buy Columns */}
                        <th className={`text-center py-[1px] px-[4.2px] font-bold text-white w-4 ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`} title={formatDisplayDate(date)}>BCode</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>BLot</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>BVal</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>BAvg</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>BFreq</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>Lot/F</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>BOrdNum</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-10" title={formatDisplayDate(date)}>Lot/ON</th>
                        {/* Separator */}
                        <th className="text-center py-[1px] px-[4.2px] font-bold text-white bg-[#3a4252] w-4" title={formatDisplayDate(date)}>#</th>
                        {/* Net Sell Columns */}
                        <th className="text-center py-[1px] px-[4.2px] font-bold text-white w-4" title={formatDisplayDate(date)}>SCode</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>SLot</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>SVal</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>SAvg</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>SFreq</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>Lot/F</th>
                        <th className="text-right py-[1px] px-[4.2px] font-bold text-white w-6" title={formatDisplayDate(date)}>SOrdNum</th>
                        <th className={`text-right py-[1px] px-[4.2px] font-bold text-white w-10 ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`} title={formatDisplayDate(date)}>Lot/ON</th>
                      </React.Fragment>
                    ))}
                    {/* Total Columns */}
                    <th className={`text-center py-[1px] px-[4.2px] font-bold text-white ${selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`}>BCode</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">BLot</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">BVal</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">BAvg</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">BFreq</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">Lot/F</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">BOrdNum</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">Lot/ON</th>
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white bg-[#3a4252]">#</th>
                    <th className="text-center py-[1px] px-[4.2px] font-bold text-white">SCode</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">SLot</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">SVal</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">SAvg</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">SFreq</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">Lot/F</th>
                    <th className="text-right py-[1px] px-[4.2px] font-bold text-white">SOrdNum</th>
                    <th className="text-right py-[1px] px-[6px] font-bold text-white border-r-2 border-white">Lot/ON</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedStocks.map((stock, stockIdx) => (
                    <tr key={stockIdx} className="border-b border-[#3a4252]/50">
                      {selectedDates.map((date, dateIndex) => {
                        // Sort stocks by SVal (Seller Value) for this specific date
                        const dateSortedStocks = sortedNetStocksByDate.get(date) || [];
                        const currentStockIndex = dateSortedStocks.indexOf(stock);
                        const dateData = transactionData.get(date) || [];
                        const dayData = dateData.find(d => d.Emiten === stock);
                        const hasData = dayData !== undefined;
                        
                        if (!hasData || !dayData) {
                          return (
                            <td key={date} className={`text-center py-[1px] px-[4.2px] text-gray-400 ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`} colSpan={17}>
                                No Data
                              </td>
                          );
                        }
                        
                        const netBuyVol = dayData.NetBuyVol || 0;
                        const netBuyValue = dayData.NetBuyValue || 0;
                        const netBuyAvg = dayData.BuyerAvg || (netBuyVol > 0 ? netBuyValue / netBuyVol : 0);
                        const netSellVol = Math.abs(Math.min(0, netBuyVol));
                        const netSellValue = Math.abs(Math.min(0, netBuyValue));
                        const netSellAvg = dayData.SellerAvg || (netSellVol > 0 ? netSellValue / netSellVol : 0);
                        const buyerOrdNum = dayData.BOrdNum || 0;
                        const sellerOrdNum = dayData.SOrdNum || 0;
                        const buyerLot = netBuyVol >= 0 ? Math.abs(netBuyVol) / 100 : 0;
                        const sellerLot = netSellVol > 0 ? netSellVol / 100 : 0;
                        const buyerLotPerOrdNum = buyerOrdNum > 0 && netBuyVol >= 0 ? buyerLot / buyerOrdNum : 0;
                        const sellerLotPerOrdNum = sellerOrdNum > 0 && netSellVol > 0 ? sellerLot / sellerOrdNum : 0;
                        
                        // Net Buy side
                        const netBuyColor = netBuyVol >= 0 ? 'text-green-600' : 'text-red-600';
                        // Net Sell side
                        const netSellColor = netSellVol > 0 ? 'text-red-600' : 'text-green-600';
                        
                        return (
                          <React.Fragment key={date}>
                            {/* Net Buy Columns */}
                            <td className={`text-center py-[1px] px-[4.2px] font-bold ${netBuyColor} w-4 ${dateIndex === 0 ? 'border-l-2 border-white' : ''}`}>
                              {dayData.BCode || stock}
                            </td>
                            <td className={`text-right py-[1px] px-[4.2px] font-bold ${netBuyColor} w-6`}>
                              {netBuyVol >= 0 ? formatLot(Math.abs(netBuyVol) / 100) : formatLot(0)}
                            </td>
                            <td className={`text-right py-[1px] px-[4.2px] font-bold ${netBuyColor} w-6`}>
                              {netBuyVol >= 0 ? formatValue(Math.abs(netBuyValue)) : formatValue(0)}
                            </td>
                            <td className={`text-right py-[1px] px-[4.2px] font-bold ${netBuyColor} w-6`}>
                              {netBuyVol >= 0 && netBuyAvg > 0 ? formatAverage(netBuyAvg) : formatAverage(0)}
                            </td>
                            <td className={`text-right py-[1px] px-[4.2px] font-bold ${netBuyColor} w-6`}>0</td>
                            <td className={`text-right py-[1px] px-[4.2px] font-bold ${netBuyColor} w-6`}>{formatAverage(0)}</td>
                            <td className={`text-right py-[1px] px-[4.2px] font-bold ${netBuyColor} w-6`}>{buyerOrdNum}</td>
                            <td className={`text-right py-[1px] px-[4.2px] font-bold ${netBuyColor} w-10`}>{buyerOrdNum > 0 && netBuyVol >= 0 ? formatAverage(buyerLotPerOrdNum) : formatAverage(0)}</td>
                            {/* Separator */}
                            <td className="text-center py-[1px] px-[4.2px] text-white bg-[#3a4252] font-bold w-4">{currentStockIndex >= 0 ? currentStockIndex + 1 : 0}</td>
                            {/* Net Sell Columns */}
                            <td className={`text-center py-[1px] px-[4.2px] font-bold ${netSellColor} w-4`}>
                              {dayData.SCode || stock}
                            </td>
                            <td className={`text-right py-[1px] px-[4.2px] font-bold ${netSellColor} w-6`}>
                              {netSellVol > 0 ? formatLot(netSellVol / 100) : formatLot(0)}
                            </td>
                            <td className={`text-right py-[1px] px-[4.2px] font-bold ${netSellColor} w-6`}>
                              {netSellVol > 0 ? formatValue(netSellValue) : formatValue(0)}
                            </td>
                            <td className={`text-right py-[1px] px-[4.2px] font-bold ${netSellColor} w-6`}>
                              {netSellVol > 0 && netSellAvg > 0 ? formatAverage(netSellAvg) : formatAverage(0)}
                            </td>
                            <td className={`text-right py-[1px] px-[4.2px] font-bold ${netSellColor} w-6`}>0</td>
                            <td className={`text-right py-[1px] px-[4.2px] font-bold ${netSellColor} w-6`}>{formatAverage(0)}</td>
                            <td className={`text-right py-[1px] px-[4.2px] font-bold ${netSellColor} w-6`}>{sellerOrdNum}</td>
                            <td className={`text-right py-[1px] px-[4.2px] font-bold ${netSellColor} w-10 ${dateIndex < selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''} ${dateIndex === selectedDates.length - 1 ? 'border-r-[10px] border-white' : ''}`}>
                              {sellerOrdNum > 0 && netSellVol > 0 ? formatAverage(sellerLotPerOrdNum) : formatAverage(0)}
                            </td>
                          </React.Fragment>
                        );
                      })}
                      {/* Total Column */}
                      {(() => {
                        const totalNetData = totalNetDataByStock.get(stock);
                        if (!totalNetData) {
                          return (
                            <td className={`text-center py-[1px] px-[4.2px] text-gray-400 ${selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`} colSpan={17}>
                              No Data
                            </td>
                          );
                        }
                        
                        const totalNetBuyLot = totalNetData.netBuyVol / 100;
                        const totalNetSellLot = totalNetData.netSellVol / 100;
                        const totalNetBuyLotPerOrdNum = totalNetData.netBuyOrdNum > 0 && totalNetData.netBuyVol >= 0 ? totalNetBuyLot / totalNetData.netBuyOrdNum : 0;
                        const totalNetSellLotPerOrdNum = totalNetData.netSellOrdNum > 0 && totalNetData.netSellVol > 0 ? totalNetSellLot / totalNetData.netSellOrdNum : 0;
                        const totalNetStockIndex = sortedTotalNetStocks.indexOf(stock);
                        
                        const totalNetBuyColor = totalNetData.netBuyVol >= 0 ? 'text-green-600' : 'text-red-600';
                        const totalNetSellColor = totalNetData.netSellVol > 0 ? 'text-red-600' : 'text-green-600';
                        
                        return (
                          <React.Fragment>
                            {/* Net Buy Columns */}
                            <td className={`text-center py-[1px] px-[4.2px] font-bold ${totalNetBuyColor} ${selectedDates.length === 0 ? 'border-l-2 border-white' : 'border-l-[10px] border-white'}`}>
                              {totalNetData.netBuyVol >= 0 ? stock : '-'}
                            </td>
                            <td className={`text-right py-[1px] px-[4.2px] font-bold ${totalNetBuyColor}`}>
                              {totalNetData.netBuyVol >= 0 ? formatLot(totalNetBuyLot) : formatLot(0)}
                            </td>
                            <td className={`text-right py-[1px] px-[4.2px] font-bold ${totalNetBuyColor}`}>
                              {totalNetData.netBuyVol >= 0 ? formatValue(totalNetData.netBuyValue) : formatValue(0)}
                            </td>
                            <td className={`text-right py-[1px] px-[4.2px] font-bold ${totalNetBuyColor}`}>
                              {totalNetData.netBuyVol >= 0 && totalNetData.netBuyAvg > 0 ? formatAverage(totalNetData.netBuyAvg) : formatAverage(0)}
                            </td>
                            <td className={`text-right py-[1px] px-[4.2px] font-bold ${totalNetBuyColor}`}>0</td>
                            <td className={`text-right py-[1px] px-[4.2px] font-bold ${totalNetBuyColor}`}>{formatAverage(0)}</td>
                            <td className={`text-right py-[1px] px-[4.2px] font-bold ${totalNetBuyColor}`}>{totalNetData.netBuyOrdNum}</td>
                            <td className={`text-right py-[1px] px-[4.2px] font-bold ${totalNetBuyColor}`}>
                              {totalNetData.netBuyOrdNum > 0 && totalNetData.netBuyVol >= 0 ? formatAverage(totalNetBuyLotPerOrdNum) : formatAverage(0)}
                            </td>
                            {/* Separator */}
                            <td className="text-center py-[1px] px-[4.2px] text-white bg-[#3a4252] font-bold">{totalNetStockIndex >= 0 ? totalNetStockIndex + 1 : 0}</td>
                            {/* Net Sell Columns */}
                            <td className={`text-center py-[1px] px-[4.2px] font-bold ${totalNetSellColor}`}>
                              {totalNetData.netSellVol > 0 ? stock : '-'}
                            </td>
                            <td className={`text-right py-[1px] px-[4.2px] font-bold ${totalNetSellColor}`}>
                              {totalNetData.netSellVol > 0 ? formatLot(totalNetSellLot) : formatLot(0)}
                            </td>
                            <td className={`text-right py-[1px] px-[4.2px] font-bold ${totalNetSellColor}`}>
                              {totalNetData.netSellVol > 0 ? formatValue(totalNetData.netSellValue) : formatValue(0)}
                            </td>
                            <td className={`text-right py-[1px] px-[4.2px] font-bold ${totalNetSellColor}`}>
                              {totalNetData.netSellVol > 0 && totalNetData.netSellAvg > 0 ? formatAverage(totalNetData.netSellAvg) : formatAverage(0)}
                            </td>
                            <td className={`text-right py-[1px] px-[4.2px] font-bold ${totalNetSellColor}`}>0</td>
                            <td className={`text-right py-[1px] px-[4.2px] font-bold ${totalNetSellColor}`}>{formatAverage(0)}</td>
                            <td className={`text-right py-[1px] px-[4.2px] font-bold ${totalNetSellColor}`}>{totalNetData.netSellOrdNum}</td>
                            <td className={`text-right py-[1px] px-[6px] font-bold ${totalNetSellColor} border-r-2 border-white`}>
                              {totalNetData.netSellOrdNum > 0 && totalNetData.netSellVol > 0 ? formatAverage(totalNetSellLotPerOrdNum) : formatAverage(0)}
                            </td>
                          </React.Fragment>
                        );
                      })()}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    };
    
    return (
      <div className="w-full">
        {renderValueTable()}
        {renderNetTable()}
      </div>
    );
  };


  return (
    <div className="w-full">
      {/* Top Controls - Compact without Card */}
      <div className="bg-[#0a0f20] border-b border-[#3a4252] px-4 py-1.5">
        <div className="flex flex-wrap items-center gap-8">
          {/* Broker Selection - Multi-select with chips */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium whitespace-nowrap">Broker:</label>
            <div className="flex flex-wrap items-center gap-2">
              {/* Selected Broker Chips */}
              {selectedBrokers.map(broker => (
                <div
                  key={broker}
                  className="flex items-center gap-1 px-2 py-1 bg-primary/20 text-primary rounded-md text-sm"
                >
                  <span>{broker}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveBroker(broker)}
                    className="hover:bg-primary/30 rounded px-1"
                    aria-label={`Remove ${broker}`}
                  >
                    ×
                  </button>
              </div>
              ))}
              {/* Broker Input */}
              <div className="relative" ref={dropdownBrokerRef}>
                  <input
                    type="text"
                    value={brokerInput}
                    onChange={(e) => {
                      const v = e.target.value.toUpperCase();
                      setBrokerInput(v);
                      setShowBrokerSuggestions(true);
                      setHighlightedIndex(0);
                    }}
                    onFocus={() => setShowBrokerSuggestions(true)}
                    onKeyDown={(e) => {
                    const filteredBrokers = brokerInput === '' 
                      ? availableBrokers.filter(b => !selectedBrokers.includes(b))
                      : availableBrokers.filter(b => 
                          b.toLowerCase().includes(brokerInput.toLowerCase()) && 
                          !selectedBrokers.includes(b)
                        );
                    const suggestions = filteredBrokers.slice(0, 10);
                    
                      if (e.key === 'ArrowDown' && suggestions.length) {
                        e.preventDefault();
                      setHighlightedIndex((prev) => (prev + 1) % suggestions.length);
                      } else if (e.key === 'ArrowUp' && suggestions.length) {
                        e.preventDefault();
                      setHighlightedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
                      } else if (e.key === 'Enter' && showBrokerSuggestions) {
                        e.preventDefault();
                        const idx = highlightedIndex >= 0 ? highlightedIndex : 0;
                        const choice = suggestions[idx];
                      if (choice) handleBrokerSelect(choice);
                      } else if (e.key === 'Escape') {
                        setShowBrokerSuggestions(false);
                        setHighlightedIndex(-1);
                      }
                    }}
                  placeholder="Add broker"
                  className="w-24 px-3 py-2 text-sm border border-[#3a4252] rounded-md bg-input text-foreground"
                    role="combobox"
                    aria-expanded={showBrokerSuggestions}
                    aria-controls="broker-suggestions"
                    aria-autocomplete="list"
                  />
                  {showBrokerSuggestions && (
                  <div id="broker-suggestions" role="listbox" className="absolute top-full left-0 right-0 mt-1 bg-popover border border-[#3a4252] rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                      {availableBrokers.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground flex items-center">
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          Loading brokers...
                        </div>
                    ) : brokerInput === '' ? (
                      <>
                        <div className="px-3 py-2 text-xs text-muted-foreground border-b border-[#3a4252]">
                          Available Brokers ({availableBrokers.filter(b => !selectedBrokers.includes(b)).length})
                        </div>
                        {availableBrokers.filter(b => !selectedBrokers.includes(b)).map(broker => (
                          <div
                            key={broker}
                            onClick={() => handleBrokerSelect(broker)}
                            className="px-3 py-2 hover:bg-muted cursor-pointer text-sm"
                          >
                            {broker}
                          </div>
                        ))}
                      </>
                    ) : (() => {
                      const filteredBrokers = availableBrokers.filter(b => 
                        b.toLowerCase().includes(brokerInput.toLowerCase()) && 
                        !selectedBrokers.includes(b)
                      );
                      return (
                            <>
                          <div className="px-3 py-2 text-xs text-muted-foreground border-b border-[#3a4252]">
                            {filteredBrokers.length} broker(s) found
                          </div>
                          {filteredBrokers.length > 0 ? (
                            filteredBrokers.map((broker, idx) => (
                              <div
                                key={broker}
                                onClick={() => handleBrokerSelect(broker)}
                                className={`px-3 py-2 hover:bg-muted cursor-pointer text-sm ${idx === highlightedIndex ? 'bg-accent' : ''}`}
                              onMouseEnter={() => setHighlightedIndex(idx)}
                              >
                                {broker}
                              </div>
                            ))
                          ) : (
                            <div className="px-3 py-2 text-sm text-muted-foreground">
                              No brokers found
                            </div>
                          )}
                            </>
                      );
                    })()}
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
                  
                  setStartDate(e.target.value);
                  if (!endDate || new Date(e.target.value) > new Date(endDate)) {
                    setEndDate(e.target.value);
                  }
                }}
                onKeyDown={(e) => e.preventDefault()}
                onPaste={(e) => e.preventDefault()}
                onInput={(e) => e.preventDefault()}
                max={formatDateForInput(endDate)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                style={{ caretColor: 'transparent' }}
              />
              <div className="flex items-center justify-between h-full px-3 py-2">
                <span className="text-sm text-foreground">
                  {startDate ? new Date(startDate).toLocaleDateString('en-GB', { 
                    day: '2-digit', 
                    month: '2-digit', 
                    year: 'numeric' 
                  }) : ''}
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
                  
                  const newEndDate = e.target.value;
                  setEndDate(newEndDate);
                  
                  // If endDate is before startDate, update startDate
                  if (startDate && new Date(newEndDate) < new Date(startDate)) {
                    setStartDate(newEndDate);
                  }
                }}
                onKeyDown={(e) => e.preventDefault()}
                onPaste={(e) => e.preventDefault()}
                onInput={(e) => e.preventDefault()}
                min={formatDateForInput(startDate)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                style={{ caretColor: 'transparent' }}
              />
              <div className="flex items-center justify-between h-full px-3 py-2">
                <span className="text-sm text-foreground">
                  {endDate ? new Date(endDate).toLocaleDateString('en-GB', { 
                    day: '2-digit', 
                    month: '2-digit', 
                    year: 'numeric' 
                  }) : ''}
                </span>
                <Calendar className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            </div>

          {/* Ticker Search */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium whitespace-nowrap">Search:</label>
            <input
              type="text"
              value={tickerSearch}
              onChange={(e) => setTickerSearch(e.target.value)}
              placeholder="Ticker..."
              className="w-24 px-3 py-2 text-sm border border-[#3a4252] rounded-md bg-input text-foreground"
            />
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Loading transaction data...</span>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && !isLoading && (
        <div className="flex items-center justify-center py-8">
          <div className="text-sm text-destructive">{error}</div>
        </div>
      )}

      {/* Main Data Display */}
        {!isLoading && !error && renderHorizontalView()}
    </div>
  );
}
