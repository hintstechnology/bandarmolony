
import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
const envPath = path.resolve(__dirname, '../../.env');
console.log(`Loading .env from: ${envPath}`);
dotenv.config({ path: envPath });

async function testTicmiEmas() {
    const jwtToken = process.env['TICMI_JWT_TOKEN'];
    const baseUrl = process.env['TICMI_API_BASE_URL'];

    if (!jwtToken || !baseUrl) {
        console.error('❌ Error: TICMI configuration missing (TICMI_JWT_TOKEN or TICMI_API_BASE_URL)');
        return;
    }

    const stockUrl = `${baseUrl}/dp/eq/`;

    // Date range: 7 days ago to today
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const startDateStr = sevenDaysAgo.toISOString().split('T')[0];
    const endDateStr = today.toISOString().split('T')[0];

    const params = {
        secCode: 'EMAS',
        startDate: startDateStr,
        endDate: endDateStr,
        granularity: 'daily'
    };

    console.log('🧪 Testing TICMI API for stock: EMAS');
    console.log(`🧪 URL: ${stockUrl}`);
    console.log(`🧪 Params:`, params);

    try {
        const response = await axios.get(stockUrl, {
            params,
            headers: {
                'Authorization': `Bearer ${jwtToken}`,
                'x-auth-token': jwtToken,
                'x-Auth-key': jwtToken,
                'Content-Type': 'application/json'
            }
        });

        console.log(`✅ Status: ${response.status}`);
        console.log(`✅ Data:`, JSON.stringify(response.data, null, 2));

    } catch (error: any) {
        console.error('❌ Error fetching data:');
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error(`Data:`, JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
        }
    }
}

testTicmiEmas();
