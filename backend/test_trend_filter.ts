import * as dotenv from 'dotenv';
import * as path from 'path';

// MUST BE FIRST - Load .env using ABSOLUTE path
const envPath = 'd:/Hilmy/Kerja/Hints Technology/bandarmolony/backend/.env';
console.log('Loading env from:', envPath);
const resultEnv = dotenv.config({ path: envPath });
if (resultEnv.error) {
    console.error('Dotenv error:', resultEnv.error);
} else {
    console.log('Dotenv loaded successfully');
}

async function test() {
    console.log('Testing getTrendFilterData...');
    console.log('SUPABASE_URL:', process.env['SUPABASE_URL'] ? 'SET' : 'NOT SET');

    try {
        // Dynamic import
        const { TrendFilterDataScheduler } = await import('./src/services/trendFilterDataScheduler');
        const service = new TrendFilterDataScheduler();
        const result = await service.getTrendFilterData('1M');

        console.log('Result Success:', result.success);
        if (result.success) {
            console.log('Data summary periods:', result.data?.summary?.Period);
            console.log('Stock count:', result.data?.stocks?.length);
        } else {
            console.log('Error:', result.error);
        }
    } catch (err: any) {
        console.error('Explosion during test:', err.message);
        if (err.stack) console.error(err.stack);
    }
}

test().catch(console.error);
