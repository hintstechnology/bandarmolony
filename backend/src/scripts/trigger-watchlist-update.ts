
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
const { updateWatchlistSnapshot } = require('../services/watchlistSnapshotService') as any;

async function runUpdate() {
    console.log('🚀 Triggering manual update for Watchlist Snapshot ONLY...');

    try {
        console.log('\n--- Starting Watchlist Snapshot Update ---');
        // Using 'manual_force' to ensure it runs regardless of other conditions
        await updateWatchlistSnapshot(null, 'manual_force');
        console.log('✅ Watchlist snapshot update finished.');

    } catch (error) {
        console.error('❌ Manual update failed:', error);
        process.exit(1);
    }
}

runUpdate();
