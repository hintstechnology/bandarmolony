
import * as dotenv from 'dotenv';
import * as path from 'path';
// We just need the service class, ignoring other imports causing issues
import { OptimizedAzureStorageService } from '../services/dataUpdateService';

// Load environment variables
const envPath = path.resolve(__dirname, '../../.env');
console.log(`Loading .env from: ${envPath}`);
dotenv.config({ path: envPath });

// Sector mapping cache with explicit type
const SECTOR_MAPPING: Record<string, string[]> = {};

async function buildSectorMappingFromCsv(azureStorage: OptimizedAzureStorageService): Promise<void> {
    console.log('🔍 Building sector mapping from csv_input/sector_mapping.csv...');

    try {
        const csvData = await azureStorage.downloadCsvData('csv_input/sector_mapping.csv');
        const lines = csvData.split('\n')
            .map(line => line.trim())
            .filter(line => line && line.length > 0);

        // Clear existing mapping
        for (const key in SECTOR_MAPPING) {
            delete SECTOR_MAPPING[key];
        }

        // Parse CSV data
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line) continue;
            const parts = line.split(',');
            if (parts.length >= 2) {
                const sector = parts[0]?.trim();
                const emiten = parts[1]?.trim();
                if (sector && emiten) {
                    // Initialize array if it doesn't exist
                    if (!SECTOR_MAPPING[sector]) {
                        SECTOR_MAPPING[sector] = [];
                    }

                    // Safe access using variable check
                    const currentList = SECTOR_MAPPING[sector];
                    if (currentList) {
                        if (!currentList.includes(emiten)) {
                            currentList.push(emiten);
                        }
                    }
                }
            }
        }

        console.log(`📊 Sector mapping built: ${Object.keys(SECTOR_MAPPING).length} sectors`);

    } catch (error) {
        console.warn('⚠️ Could not build sector mapping:', error);
        // Initialize default sectors as fallback
        const defaultSectors = ['Technology', 'Financials'];
        defaultSectors.forEach(sector => SECTOR_MAPPING[sector] = []);
    }
}

function getSectorForEmiten(emiten: string): string {
    // Check mapping first
    for (const sector in SECTOR_MAPPING) {
        const emitens = SECTOR_MAPPING[sector];
        if (emitens && emitens.includes(emiten)) {
            return sector;
        }
    }

    // Fallback logic (Hash Distribution - SAME AS stock.ts & scheduler)
    const sectors = Object.keys(SECTOR_MAPPING);
    if (sectors.length === 0) return 'Technology';

    const hash = emiten.split('').reduce((a, b) => {
        a = ((a << 5) - a) + b.charCodeAt(0);
        return a & a;
    }, 0);

    return sectors[Math.abs(hash) % sectors.length] || 'Technology';
}

async function checkMissingStocks() {
    const azureStorage = new OptimizedAzureStorageService();
    await azureStorage.ensureContainerExists();

    // 1. Build Sector Mapping
    await buildSectorMappingFromCsv(azureStorage);

    // 2. Get Emiten List from CSV (Source of Truth)
    console.log('🔍 Fetching emiten list from csv_input/emiten_list.csv...');
    let emitenList: string[] = [];
    try {
        const csvData = await azureStorage.downloadCsvData('csv_input/emiten_list.csv');
        const lines = csvData.split('\n').map(l => l.trim()).filter(l => l);

        // Skip header
        for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(',');
            const code = parts[0]?.trim();
            if (code && code.length === 4) emitenList.push(code);
        }
    } catch (err) {
        console.error('❌ Failed to read emiten_list.csv');
        return;
    }

    emitenList = [...new Set(emitenList)].sort();
    console.log(`📋 Total stocks in emiten_list.csv: ${emitenList.length}`);

    // 3. Check each stock in Blob Storage
    console.log('🔍 Checking blob existence for each stock...');
    const missingStocks: string[] = [];
    const foundStocks: string[] = [];

    const batchSize = 50;
    for (let i = 0; i < emitenList.length; i += batchSize) {
        const batch = emitenList.slice(i, i + batchSize);
        await Promise.all(batch.map(async (stock) => {
            const sector = getSectorForEmiten(stock);
            const blobPath = `stock/${sector}/${stock}.csv`;
            const exists = await azureStorage.blobExists(blobPath);

            if (!exists) {
                missingStocks.push(`${stock} (Expected at: ${blobPath})`);
            } else {
                foundStocks.push(stock);
            }
        }));
        // console.log(`Processed ${Math.min(i + batchSize, emitenList.length)}/${emitenList.length}`);
    }

    console.log('\n==================================================');
    console.log(`✅ Stocks FOUND: ${foundStocks.length}`);
    console.log(`❌ Stocks MISSING: ${missingStocks.length}`);
    console.log('==================================================');

    if (missingStocks.length > 0) {
        console.log('List of Missing Stocks:');
        missingStocks.slice(0, 500).forEach(s => console.log(`- ${s}`)); // Increased limit
        if (missingStocks.length > 500) console.log(`... and ${missingStocks.length - 500} more.`);
    } else {
        console.log('🎉 All stocks from list are present in Blob Storage!');
    }
}

checkMissingStocks();
