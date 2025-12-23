# Menu Preferences Implementation Guide

Sistem ini menyimpan semua konfigurasi control panel yang dipilih user di **cookies dengan session**, sehingga tidak berubah ketika user ganti halaman. Cookies akan otomatis persist dengan browser session.

## Setup

Tidak perlu setup database - sistem menggunakan cookies yang otomatis tersedia di browser.

## Page IDs

Setiap halaman memiliki page ID unik:

### Market Rotation
- `market-rotation-seasonality` - Seasonality page
- `market-rotation-rrg` - Relative Rotation Graph
- `market-rotation-rrc` - Relative Rotation Curve
- `market-rotation-trend-filter` - Trend Filter

### Broker Activity
- `broker-activity-transaction` - Broker Transaction
- `broker-activity-summary` - Broker Summary
- `broker-activity-inventory` - Broker Inventory

### Stock Transaction
- `stock-transaction-done-summary` - Done Summary
- `stock-transaction-done-detail` - Done Detail

### Technical Analysis
- `technical-analysis` - TradingView chart preferences

### Story
- `story-ownership` - Story Ownership
- `story-market-participant` - Market Participant
- `story-foreign-flow` - Foreign Flow

### Astrology
- `astrology-lunar-calendar` - Lunar Calendar
- `astrology-bazi-cycle` - BaZi Cycle Analysis

## Cara Implementasi

### 1. Import Service

```typescript
import { menuPreferencesService } from '../../services/menuPreferences';
```

### 2. Define Page ID

```typescript
const PAGE_ID = 'broker-activity-transaction'; // Ganti dengan page ID yang sesuai
```

### 3. Load Preferences on Mount

```typescript
useEffect(() => {
  // Load preferences from cookies (synchronous - no async needed)
  const prefs = menuPreferencesService.loadPreferences(PAGE_ID);
  if (prefs.showFrequency !== undefined) {
    setShowFrequency(prefs.showFrequency);
  }
  // ... update state lainnya
}, []);
```

### 4. Initialize State dengan Cached Preferences

```typescript
const [showFrequency, setShowFrequency] = useState(() => {
  const cached = menuPreferencesService.getCachedPreferences(PAGE_ID);
  return cached?.showFrequency ?? true; // default value
});
```

### 5. Save Preferences saat User Mengubah

```typescript
// Di onChange handler (synchronous - no async needed)
onChange={(e) => {
  const newValue = e.target.checked;
  setShowFrequency(newValue);
  // Save to cookies immediately
  menuPreferencesService.savePreferences(PAGE_ID, { 
    showFrequency: newValue 
  });
}}
```

### 6. Save Multiple Preferences (Debounced)

```typescript
useEffect(() => {
  const timeout = setTimeout(() => {
    // Save to cookies (synchronous)
    menuPreferencesService.savePreferences(PAGE_ID, {
      pivotFilter,
      invFilter,
      boardFilter,
      showFrequency,
      showOrder,
      // ... preferences lainnya
    });
  }, 500); // Debounce 500ms untuk mengurangi write operations
  
  return () => clearTimeout(timeout);
}, [pivotFilter, invFilter, boardFilter, showFrequency, showOrder]);
```

## Contoh Implementasi Lengkap

Lihat file:
- `frontend/src/components/market-rotation/MarketRotationSeasonality.tsx` ✅
- `frontend/src/components/broker-activity/BrokerTransaction.tsx` ✅

## Struktur Data

Preferences disimpan sebagai JSON di cookies:
```json
{
  "market-rotation-seasonality": {
    "showIndex": true,
    "showSector": true,
    "showStock": true
  },
  "broker-activity-transaction": {
    "pivotFilter": "Broker",
    "invFilter": "",
    "boardFilter": "RG",
    "showFrequency": true,
    "showOrder": true
  }
}
```

## Checklist Implementasi per Halaman

- [x] Market Rotation - Seasonality
- [x] Market Rotation - RRG
- [x] Market Rotation - RRC
- [x] Market Rotation - Trend Filter
- [x] Broker Activity - Transaction
- [x] Broker Activity - Summary
- [x] Broker Activity - Inventory
- [x] Stock Transaction - Done Summary
- [x] Stock Transaction - Done Detail
- [x] Technical Analysis
- [x] Story - Market Participant
- [x] Astrology - Lunar Calendar
- [ ] Story - Ownership
- [ ] Story - Market Participant
- [ ] Story - Foreign Flow
- [ ] Astrology - Lunar Calendar
- [ ] Astrology - BaZi Cycle

