import { BlobServiceClient } from '@azure/storage-blob';
import * as dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env['AZURE_STORAGE_CONNECTION_STRING'] || "";
const containerName = process.env['AZURE_STORAGE_CONTAINER_NAME'] || "stock-trading-data";

if (!connectionString) {
    console.error("Please set AZURE_STORAGE_CONNECTION_STRING in your .env file");
    process.exit(1);
}

const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
const containerClient = blobServiceClient.getContainerClient(containerName);

async function streamToString(readableStream: NodeJS.ReadableStream): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        readableStream.on('data', (data: Buffer) => chunks.push(data));
        readableStream.on('end', () => resolve(Buffer.concat(chunks).toString()));
        readableStream.on('error', reject);
    });
}

async function downloadCsv(blobName: string): Promise<string> {
    try {
        const blobClient = containerClient.getBlobClient(blobName);
        if (!(await blobClient.exists())) return "";
        const downloadResponse = await blobClient.download();
        return await streamToString(downloadResponse.readableStreamBody!);
    } catch (error) {
        console.error(`Error downloading ${blobName}:`, error);
        return "";
    }
}

async function checkMissingMetadata() {
    console.log("🚀 Starting check for missing metadata...");

    // 1. Get all tickers from emiten_list.csv
    const emitenListCsv = await downloadCsv("csv_input/emiten_list.csv");
    const allTickers = emitenListCsv.split('\n')
        .map(line => line.trim())
        .filter(line => line && line.length === 4);

    console.log(`📊 Found ${allTickers.length} tickers in emiten_list.csv`);

    // 2. Load Sector Mapping
    const sectorMappingCsv = await downloadCsv("csv_input/sector_mapping.csv");
    const sectorMap = new Map<string, string>();
    const sectorLines = sectorMappingCsv.split('\n');
    for (let i = 1; i < sectorLines.length; i++) {
        const rawLine = sectorLines[i];
        if (!rawLine) continue;
        const line = rawLine.trim();
        if (!line) continue;
        const parts = line.split(',');
        if (parts.length >= 2) {
            const sector = parts[0]?.trim();
            const ticker = parts[1]?.trim().toUpperCase();
            if (sector && ticker) {
                sectorMap.set(ticker, sector);
            }
        }
    }
    console.log(`📊 Loaded ${sectorMap.size} sector mappings`);

    // 3. Load Emiten Details (Company Names)
    const emitenDetailCsv = await downloadCsv("csv_input/emiten_detail_list.csv");
    const companyMap = new Map<string, string>();
    const detailLines = emitenDetailCsv.split('\n');

    // Attempt to detect headers or structure
    const headerLine = detailLines[0];
    console.log(`📝 Header for emiten_detail_list.csv: ${headerLine}`);

    for (let i = 1; i < detailLines.length; i++) {
        const rawLine = detailLines[i];
        if (!rawLine) continue;
        const line = rawLine.trim();
        if (!line) continue;

        // Handle CSV with possible quoted values
        const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);

        // Based on previous check: 1,AALI,Astra Agro Les
        // Code is likely column 2 (index 1) and Name is column 3 (index 2)
        if (parts.length >= 3) {
            const code = parts[1]?.trim().replace(/^"|"$/g, '').toUpperCase();
            const name = parts[2]?.trim().replace(/^"|"$/g, '');
            if (code && name) {
                companyMap.set(code, name);
            }
        }
    }
    console.log(`📊 Loaded ${companyMap.size} company name mappings`);

    // 4. Find missing metadata
    const missingBoth: string[] = [];
    const missingSectorOnly: string[] = [];
    const missingCompanyOnly: string[] = [];

    for (const ticker of allTickers) {
        const hasSector = sectorMap.has(ticker);
        const hasCompany = companyMap.has(ticker);

        if (!hasSector && !hasCompany) {
            missingBoth.push(ticker);
        } else if (!hasSector) {
            missingSectorOnly.push(ticker);
        } else if (!hasCompany) {
            missingCompanyOnly.push(ticker);
        }
    }

    console.log("\n--- RESULTS ---");
    console.log(`❌ Missing BOTH Sector and Company Name (${missingBoth.length}):`);
    console.log(missingBoth.join(', '));

    console.log(`\n⚠️ Missing Sector ONLY (${missingSectorOnly.length}):`);
    // console.log(missingSectorOnly.join(', ')); // Too many?

    console.log(`\n⚠️ Missing Company Name ONLY (${missingCompanyOnly.length}):`);
    // console.log(missingCompanyOnly.join(', '));

    console.log("\n--- Summary ---");
    console.log(`Total Tickers: ${allTickers.length}`);
    console.log(`Missing Both: ${missingBoth.length}`);
    console.log(`Missing Sector: ${missingSectorOnly.length}`);
    console.log(`Missing Company: ${missingCompanyOnly.length}`);
}

checkMissingMetadata().catch(console.error);
