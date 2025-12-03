/**
 * Broker Transaction Cache Service
 * 
 * Shared cache service untuk menyimpan data broker transaction files
 * yang sudah di-load, sehingga tidak perlu bolak-balik memanggil Azure
 * untuk file yang sama.
 * 
 * Cache ini digunakan oleh broker_inventory dan IDX calculators yang
 * membaca banyak broker transaction files untuk berbagai tanggal.
 */

import { downloadText } from '../utils/azureBlob';

// Cache untuk raw CSV content
interface CacheEntry {
  content: string;
  timestamp: number;
  size: number; // Size in bytes
}

class BrokerTransactionCacheService {
  // Cache untuk raw CSV content
  private rawContentCache: Map<string, CacheEntry> = new Map();
  
  // Statistics
  private stats = {
    cacheHits: 0,
    cacheMisses: 0,
    totalLoads: 0,
    totalBytesLoaded: 0,
    totalBytesFromCache: 0
  };
  
  // Cache TTL (Time To Live) - default 2.5 hours
  private readonly CACHE_TTL = 2.5 * 60 * 60 * 1000; // 2.5 hours in milliseconds
  
  // Max cache size (default 1GB)
  private readonly MAX_CACHE_SIZE = 1 * 1024 * 1024 * 1024; // 1GB in bytes
  
  // Current cache size
  private currentCacheSize = 0;
  
  /**
   * Get raw CSV content from cache or Azure
   * Supports both YYYYMMDD and YYMMDD date formats
   * @param brokerCode Broker code (e.g., '001')
   * @param date Date string in YYYYMMDD or YYMMDD format
   * @returns CSV content as string
   */
  async getRawContent(brokerCode: string, date: string): Promise<string | null> {
    // Try YYYYMMDD format first (normalized)
    let blobName = `broker_transaction/broker_transaction_${date}/${brokerCode}.csv`;
    let cached = this.rawContentCache.get(blobName);
    
    // If not found and date is 8 digits, try YYMMDD format
    if (!cached && date.length === 8) {
      const yyMMdd = `${date.substring(2, 4)}${date.substring(4, 6)}${date.substring(6, 8)}`;
      const altBlobName = `broker_transaction/broker_transaction_${yyMMdd}/${brokerCode}.csv`;
      cached = this.rawContentCache.get(altBlobName);
      if (cached) {
        blobName = altBlobName;
      }
    }
    
    // Check cache first
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
      this.stats.cacheHits++;
      this.stats.totalBytesFromCache += cached.size;
      console.log(`📦 Broker Transaction Cache HIT: ${blobName} (${(cached.size / 1024).toFixed(2)} KB)`);
      return cached.content;
    }
    
    // Cache miss - load from Azure (try both formats)
    this.stats.cacheMisses++;
    console.log(`📥 Broker Transaction Cache MISS: ${blobName} - loading from Azure...`);
    
    try {
      let content: string | null = null;
      
      // Try YYYYMMDD format first
      try {
        content = await downloadText(blobName);
      } catch (error) {
        // If YYYYMMDD format fails and date is 8 digits, try YYMMDD format
        if (date.length === 8) {
          const yyMMdd = `${date.substring(2, 4)}${date.substring(4, 6)}${date.substring(6, 8)}`;
          const altBlobName = `broker_transaction/broker_transaction_${yyMMdd}/${brokerCode}.csv`;
          try {
            content = await downloadText(altBlobName);
            blobName = altBlobName; // Use the working blob name for caching
          } catch {
            console.warn(`⚠️ File not found for broker ${brokerCode} on date ${date} (tried both formats)`);
            return null;
          }
        } else {
          throw error;
        }
      }
      
      if (!content) {
        return null;
      }
      
      const size = Buffer.byteLength(content, 'utf8');
      this.stats.totalLoads++;
      this.stats.totalBytesLoaded += size;
      
      // Check if we need to evict old entries to make room
      if (this.currentCacheSize + size > this.MAX_CACHE_SIZE) {
        await this.evictOldEntries(size);
      }
      
      // Store in cache
      this.rawContentCache.set(blobName, {
        content,
        timestamp: Date.now(),
        size
      });
      
      this.currentCacheSize += size;
      
      console.log(`✅ Broker Transaction loaded and cached: ${blobName} (${(size / 1024).toFixed(2)} KB)`);
      return content;
      
    } catch (error) {
      console.error(`❌ Error loading broker transaction ${blobName}:`, error);
      return null;
    }
  }
  
  /**
   * Evict old entries from cache to make room
   */
  private async evictOldEntries(requiredSize: number): Promise<void> {
    console.log(`🧹 Evicting old broker transaction cache entries to free ${(requiredSize / 1024 / 1024).toFixed(2)} MB...`);
    
    // Sort entries by timestamp (oldest first)
    const entries = Array.from(this.rawContentCache.entries())
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => a.timestamp - b.timestamp);
    
    let freedSize = 0;
    let evictedCount = 0;
    
    for (const entry of entries) {
      if (this.currentCacheSize - freedSize + requiredSize <= this.MAX_CACHE_SIZE * 0.9) {
        // We've freed enough space (leave 10% buffer)
        break;
      }
      
      this.rawContentCache.delete(entry.key);
      freedSize += entry.size;
      evictedCount++;
    }
    
    this.currentCacheSize -= freedSize;
    console.log(`✅ Evicted ${evictedCount} broker transaction entries, freed ${(freedSize / 1024 / 1024).toFixed(2)} MB`);
  }
  
  /**
   * Clear all caches
   */
  clearAll(): void {
    console.log('🧹 Clearing all broker transaction caches...');
    this.rawContentCache.clear();
    this.currentCacheSize = 0;
    console.log('✅ All broker transaction caches cleared');
  }
  
  /**
   * Clear cache for specific date
   */
  clearDate(date: string): void {
    const prefix = `broker_transaction/broker_transaction_${date}/`;
    let clearedCount = 0;
    let freedSize = 0;
    
    for (const [key, value] of this.rawContentCache.entries()) {
      if (key.startsWith(prefix)) {
        this.rawContentCache.delete(key);
        freedSize += value.size;
        clearedCount++;
      }
    }
    
    this.currentCacheSize -= freedSize;
    console.log(`✅ Cleared ${clearedCount} broker transaction entries for date ${date}, freed ${(freedSize / 1024 / 1024).toFixed(2)} MB`);
  }
  
  /**
   * Get cache statistics
   */
  getStats() {
    const hitRate = this.stats.cacheHits + this.stats.cacheMisses > 0
      ? (this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses) * 100).toFixed(2)
      : '0.00';
    
    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      cacheSize: `${(this.currentCacheSize / 1024 / 1024).toFixed(2)} MB`,
      maxCacheSize: `${(this.MAX_CACHE_SIZE / 1024 / 1024).toFixed(2)} MB`,
      entries: this.rawContentCache.size
    };
  }
  
  /**
   * Print cache statistics
   */
  printStats(): void {
    const stats = this.getStats();
    console.log('\n📊 ===== BROKER TRANSACTION CACHE STATISTICS =====');
    console.log(`Cache Hits: ${stats.cacheHits}`);
    console.log(`Cache Misses: ${stats.cacheMisses}`);
    console.log(`Hit Rate: ${stats.hitRate}`);
    console.log(`Total Loads: ${stats.totalLoads}`);
    console.log(`Total Bytes Loaded: ${(stats.totalBytesLoaded / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Total Bytes From Cache: ${(stats.totalBytesFromCache / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Current Cache Size: ${stats.cacheSize}`);
    console.log(`Max Cache Size: ${stats.maxCacheSize}`);
    console.log(`Entries: ${stats.entries}`);
    console.log('==================================================\n');
  }
  
  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      cacheHits: 0,
      cacheMisses: 0,
      totalLoads: 0,
      totalBytesLoaded: 0,
      totalBytesFromCache: 0
    };
    console.log('🔄 Broker transaction cache statistics reset');
  }
}

// Singleton instance
export const brokerTransactionCache = new BrokerTransactionCacheService();

