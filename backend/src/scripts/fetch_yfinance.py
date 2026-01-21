import yfinance as yf
import sys
import json
import pandas as pd
from datetime import datetime, timedelta

def fetch_data(ticker, start_date, end_date):
    # Add .JK suffix for Indonesian stocks
    yf_ticker = f"{ticker}.JK"
    
    # Adjust end_date because yfinance end is exclusive
    # If same as start, add one day
    if start_date == end_date:
        end_dt = datetime.strptime(end_date, '%Y-%m-%d') + timedelta(days=1)
        end_date = end_dt.strftime('%Y-%m-%d')
    else:
        # Also add one day to make the end_date inclusive in the result if it's a range
        end_dt = datetime.strptime(end_date, '%Y-%m-%d') + timedelta(days=1)
        end_date = end_dt.strftime('%Y-%m-%d')

    try:
        stock = yf.Ticker(yf_ticker)
        df = stock.history(start=start_date, end=end_date)
        
        if df.empty:
            return []

        # Reset index to get Date as a column
        df = df.reset_index()
        
        # Format dates and convert to list of dicts
        results = []
        for _, row in df.iterrows():
            results.append({
                "date": row['Date'].strftime('%Y-%m-%d'),
                "open": float(row['Open']),
                "high": float(row['High']),
                "low": float(row['Low']),
                "close": float(row['Close']),
                "volume": int(row['Volume'])
            })
        return results
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(json.dumps({"error": "Usage: python fetch_yfinance.py TICKER START_DATE END_DATE"}))
        sys.exit(1)
        
    ticker = sys.argv[1]
    start = sys.argv[2]
    end = sys.argv[3]
    
    data = fetch_data(ticker, start, end)
    print(json.dumps(data))
