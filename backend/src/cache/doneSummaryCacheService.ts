/**
 * Done Summary Cache Service
 * 
 * Shared cache service untuk menyimpan data DT files dari done-summary
 * yang sudah di-load, sehingga tidak perlu bolak-balik memanggil Azure
 * untuk tanggal yang sama.
 * 
 * Cache ini di-share antar semua kalkulasi dalam phase yang sama atau
 * bahkan antar phase, sehingga sangat efisien untuk 15+ kalkulasi yang
 * semuanya membutuhkan data dari done-summary.
 */

import { downloadText, listPaths } from '../utils/azureBlob';

// Cache untuk raw CSV content (lebih hemat memory, bisa di-parse ulang)
interface CacheEntry {
  content: string;
  timestamp: number;
  size: number; // Size in bytes
}

// Cache untuk parsed transaction data (lebih cepat, tapi lebih boros memory)
interface ParsedCacheEntry<T> {
  data: T[];
  timestamp: number;
  size: number;
}

class DoneSummaryCacheService {
  // Cache untuk raw CSV content
  private rawContentCache: Map<string, CacheEntry> = new Map();
  
  // Cache untuk parsed data (optional, untuk kalkulasi yang sering akses data yang sama)
  private parsedDataCache: Map<string, ParsedCacheEntry<any>> = new Map();
  
  // Cache untuk list of DT files (untuk menghindari listPaths berulang)
  private dtFilesListCache: {
    files: string[];
    timestamp: number;
  } | null = null;
  
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
  
  // Max cache size (default 2GB)
  private readonly MAX_CACHE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB in bytes
  
  // Current cache size
  private currentCacheSize = 0;
  
  /**
   * Get raw CSV content from cache or Azure
   * @param blobName Full blob path (e.g., 'done-summary/20251021/DT251021.csv')
   * @returns CSV content as string
   */
  async getRawContent(blobName: string): Promise<string | null> {
    // Check cache first
    const cached = this.rawContentCache.get(blobName);
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
      this.stats.cacheHits++;
      this.stats.totalBytesFromCache += cached.size;
      console.log(`📦 Cache HIT: ${blobName} (${(cached.size / 1024).toFixed(2)} KB)`);
      return cached.content;
    }
    
    // Cache miss - load from Azure
    this.stats.cacheMisses++;
    console.log(`📥 Cache MISS: ${blobName} - loading from Azure...`);
    
    try {
      const content = await downloadText(blobName);
      
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
      
      console.log(`✅ Loaded and cached: ${blobName} (${(size / 1024).toFixed(2)} KB)`);
      return content;
      
    } catch (error) {
      console.error(`❌ Error loading ${blobName}:`, error);
      return null;
    }
  }
  
  /**
   * Get parsed transaction data from cache or parse from raw content
   * @param blobName Full blob path
   * @param parser Function to parse CSV content to transaction data
   * @returns Parsed transaction data array
   */
  async getParsedData<T>(
    blobName: string,
    parser: (content: string) => T[]
  ): Promise<T[] | null> {
    // Check parsed cache first
    const parsedCached = this.parsedDataCache.get(blobName);
    if (parsedCached && (Date.now() - parsedCached.timestamp) < this.CACHE_TTL) {
      this.stats.cacheHits++;
      console.log(`📦 Parsed Cache HIT: ${blobName} (${parsedCached.data.length} records)`);
      return parsedCached.data;
    }
    
    // Get raw content (will use cache if available)
    const content = await this.getRawContent(blobName);
    if (!content) {
      return null;
    }
    
    // Parse content
    const data = parser(content);
    
    // Estimate size (rough calculation)
    const estimatedSize = data.length * 200; // ~200 bytes per record estimate
    
    // Check if we need to evict old parsed entries
    if (this.currentCacheSize + estimatedSize > this.MAX_CACHE_SIZE) {
      await this.evictOldParsedEntries(estimatedSize);
    }
    
    // Store parsed data in cache
    this.parsedDataCache.set(blobName, {
      data,
      timestamp: Date.now(),
      size: estimatedSize
    });
    
    this.currentCacheSize += estimatedSize;
    
    console.log(`✅ Parsed and cached: ${blobName} (${data.length} records)`);
    return data;
  }
  
  /**
   * Get list of all DT files (cached)
   * @returns Array of DT file paths
   */
  async getDtFilesList(): Promise<string[]> {
    // Check cache first
    if (this.dtFilesListCache && (Date.now() - this.dtFilesListCache.timestamp) < this.CACHE_TTL) {
      console.log(`📦 DT Files List Cache HIT: ${this.dtFilesListCache.files.length} files`);
      return this.dtFilesListCache.files;
    }
    
    // Cache miss - load from Azure
    console.log(`📥 DT Files List Cache MISS - loading from Azure...`);
    
    try {
      const allFiles = await listPaths({ prefix: 'done-summary/' });
      const dtFiles = allFiles.filter(file => 
        file.includes('/DT') && file.endsWith('.csv')
      );
      
      // Sort by date descending (newest first)
      const sortedFiles = dtFiles.sort((a, b) => {
        const dateA = a.split('/')[1] || '';
        const dateB = b.split('/')[1] || '';
        return dateB.localeCompare(dateA); // Descending order
      });
      
      // Cache the list
      this.dtFilesListCache = {
        files: sortedFiles,
        timestamp: Date.now()
      };
      
      console.log(`✅ Loaded and cached DT files list: ${sortedFiles.length} files`);
      return sortedFiles;
      
    } catch (error) {
      console.error('❌ Error loading DT files list:', error);
      return [];
    }
  }
  
  /**
   * Evict old entries from raw content cache to make room
   */
  private async evictOldEntries(requiredSize: number): Promise<void> {
    console.log(`🧹 Evicting old cache entries to free ${(requiredSize / 1024 / 1024).toFixed(2)} MB...`);
    
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
    console.log(`✅ Evicted ${evictedCount} entries, freed ${(freedSize / 1024 / 1024).toFixed(2)} MB`);
  }
  
  /**
   * Evict old entries from parsed data cache
   */
  private async evictOldParsedEntries(requiredSize: number): Promise<void> {
    console.log(`🧹 Evicting old parsed cache entries...`);
    
    // Sort entries by timestamp (oldest first)
    const entries = Array.from(this.parsedDataCache.entries())
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => a.timestamp - b.timestamp);
    
    let freedSize = 0;
    let evictedCount = 0;
    
    for (const entry of entries) {
      if (this.currentCacheSize - freedSize + requiredSize <= this.MAX_CACHE_SIZE * 0.9) {
        break;
      }
      
      this.parsedDataCache.delete(entry.key);
      freedSize += entry.size;
      evictedCount++;
    }
    
    this.currentCacheSize -= freedSize;
    console.log(`✅ Evicted ${evictedCount} parsed entries, freed ${(freedSize / 1024 / 1024).toFixed(2)} MB`);
  }
  
  /**
   * Clear all caches
   */
  clearAll(): void {
    console.log('🧹 Clearing all done-summary caches...');
    this.rawContentCache.clear();
    this.parsedDataCache.clear();
    this.dtFilesListCache = null;
    this.currentCacheSize = 0;
    console.log('✅ All caches cleared');
  }
  
  /**
   * Clear cache for specific date
   */
  clearDate(dateSuffix: string): void {
    const prefix = `done-summary/${dateSuffix}/`;
    let clearedCount = 0;
    let freedSize = 0;
    
    // Clear raw content cache
    for (const [key, value] of this.rawContentCache.entries()) {
      if (key.startsWith(prefix)) {
        this.rawContentCache.delete(key);
        freedSize += value.size;
        clearedCount++;
      }
    }
    
    // Clear parsed data cache
    for (const [key, value] of this.parsedDataCache.entries()) {
      if (key.startsWith(prefix)) {
        this.parsedDataCache.delete(key);
        freedSize += value.size;
        clearedCount++;
      }
    }
    
    this.currentCacheSize -= freedSize;
    console.log(`✅ Cleared ${clearedCount} entries for date ${dateSuffix}, freed ${(freedSize / 1024 / 1024).toFixed(2)} MB`);
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
      rawEntries: this.rawContentCache.size,
      parsedEntries: this.parsedDataCache.size,
      dtFilesListCached: this.dtFilesListCache !== null
    };
  }
  
  /**
   * Print cache statistics
   */
  printStats(): void {
    const stats = this.getStats();
    console.log('\n📊 ===== DONE SUMMARY CACHE STATISTICS =====');
    console.log(`Cache Hits: ${stats.cacheHits}`);
    console.log(`Cache Misses: ${stats.cacheMisses}`);
    console.log(`Hit Rate: ${stats.hitRate}`);
    console.log(`Total Loads: ${stats.totalLoads}`);
    console.log(`Total Bytes Loaded: ${(stats.totalBytesLoaded / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Total Bytes From Cache: ${(stats.totalBytesFromCache / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Current Cache Size: ${stats.cacheSize}`);
    console.log(`Max Cache Size: ${stats.maxCacheSize}`);
    console.log(`Raw Content Entries: ${stats.rawEntries}`);
    console.log(`Parsed Data Entries: ${stats.parsedEntries}`);
    console.log(`DT Files List Cached: ${stats.dtFilesListCached ? 'Yes' : 'No'}`);
    console.log('==========================================\n');
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
    console.log('🔄 Cache statistics reset');
  }
}

// Singleton instance
export const doneSummaryCache = new DoneSummaryCacheService();

