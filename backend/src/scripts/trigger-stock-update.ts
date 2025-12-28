
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

// Check critical env vars
console.log('Environment check:', {
    SUPABASE_URL: !!process.env['SUPABASE_URL'],
    TICMI_JWT_TOKEN: !!process.env['TICMI_JWT_TOKEN']
});

// Import service AFTER loading env vars
// Using require to ensure it runs after dotenv.config()
// Need to use simple require and cast to any to avoid complex typing issues in this script
const { updateStockData } = require('../services/stockDataScheduler') as any;

async function runManualUpdate() {
    console.log('🚀 Triggering manual stock update...');
    try {
        // Pass 'manual_force' to bypass weekend check
        await updateStockData(null, 'manual_force');
        console.log('✅ Manual update finished.');
    } catch (error) {
        console.error('❌ Manual update failed:', error);
        process.exit(1);
    }
}

runManualUpdate();
