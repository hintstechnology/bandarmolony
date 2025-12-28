
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables FIRST
const envPath = path.resolve(__dirname, '../../.env');
console.log(`Loading .env from: ${envPath}`);
const result = dotenv.config({ path: envPath });

if (result.error) {
    console.error('❌ Error loading .env:', result.error);
} else {
    console.log('✅ Environment loaded successfully');
}

// Import services AFTER loading env vars
const { updateShareholdersData } = require('../services/shareholdersDataScheduler') as any;
const { updateWatchlistSnapshot } = require('../services/watchlistSnapshotService') as any;

async function runUpdates() {
    console.log('🚀 Triggering manual updates for Shareholder and Watchlist data...');

    try {
        // 1. Shareholders
        console.log('\n--- Starting Shareholders Update ---');
        await updateShareholdersData(null, 'manual_force');
        console.log('✅ Shareholders update finished.');

        // 2. Watchlist
        console.log('\n--- Starting Watchlist Snapshot Update ---');
        await updateWatchlistSnapshot(null, 'manual_force');
        console.log('✅ Watchlist snapshot update finished.');

    } catch (error) {
        console.error('❌ Manual update failed:', error);
        process.exit(1);
    }
}

runUpdates();
