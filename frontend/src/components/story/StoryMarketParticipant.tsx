import React, { useState, useEffect, useRef, useMemo } from 'react';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineSeries,
  AreaSeries,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
} from 'lightweight-charts';
import { useUserChartColors } from '../../hooks/useUserChartColors';

// Mock data untuk candlestick chart - convert to TradingView format with proper dates
const candlestickData = [
  { time: '2024-01-01' as any, open: 4620, high: 4650, low: 4610, close: 4640, volume: 15000 },
  { time: '2024-01-02' as any, open: 4640, high: 4680, low: 4630, close: 4670, volume: 18000 },
  { time: '2024-01-03' as any, open: 4670, high: 4690, low: 4650, close: 4660, volume: 12000 },
  { time: '2024-01-04' as any, open: 4660, high: 4675, low: 4640, close: 4655, volume: 14000 },
  { time: '2024-01-05' as any, open: 4655, high: 4670, low: 4645, close: 4665, volume: 16000 },
  { time: '2024-01-08' as any, open: 4665, high: 4690, low: 4660, close: 4685, volume: 20000 },
  { time: '2024-01-09' as any, open: 4685, high: 4700, low: 4680, close: 4695, volume: 22000 },
  { time: '2024-01-10' as any, open: 4695, high: 4720, low: 4690, close: 4710, volume: 25000 },
  { time: '2024-01-11' as any, open: 4710, high: 4730, low: 4705, close: 4725, volume: 28000 },
  { time: '2024-01-12' as any, open: 4725, high: 4740, low: 4720, close: 4735, volume: 30000 },
  { time: '2024-01-15' as any, open: 4735, high: 4750, low: 4730, close: 4745, volume: 32000 },
  { time: '2024-01-16' as any, open: 4745, high: 4760, low: 4740, close: 4755, volume: 35000 },
];

// Mock data untuk volume chart
const volumeData = candlestickData.map(item => ({
  time: item.time,
  volume: item.volume,
  buyVolume: item.volume * 0.6,
  sellVolume: item.volume * 0.4,
}));

// Mock data untuk participant analysis
const participantData = [
  { date: '09:00', domestic: 60, foreign: 25, retail: 15 },
  { date: '09:30', domestic: 58, foreign: 27, retail: 15 },
  { date: '10:00', domestic: 62, foreign: 23, retail: 15 },
  { date: '10:30', domestic: 59, foreign: 26, retail: 15 },
  { date: '11:00', domestic: 61, foreign: 24, retail: 15 },
  { date: '11:30', domestic: 57, foreign: 28, retail: 15 },
  { date: '12:00', domestic: 63, foreign: 22, retail: 15 },
  { date: '13:00', domestic: 55, foreign: 30, retail: 15 },
  { date: '13:30', domestic: 64, foreign: 21, retail: 15 },
  { date: '14:00', domestic: 56, foreign: 29, retail: 15 },
  { date: '14:30', domestic: 60, foreign: 25, retail: 15 },
  { date: '15:00', domestic: 58, foreign: 27, retail: 15 },
];

// Mock data untuk money flow - convert to TradingView format with proper dates
const moneyFlowData = [
  { time: '2024-01-01' as any, moneyFlow: 1200, inflow: 8000, outflow: 6800 },
  { time: '2024-01-02' as any, moneyFlow: 1800, inflow: 9500, outflow: 7700 },
  { time: '2024-01-03' as any, moneyFlow: -600, inflow: 6000, outflow: 6600 },
  { time: '2024-01-04' as any, moneyFlow: 1400, inflow: 8500, outflow: 7100 },
  { time: '2024-01-05' as any, moneyFlow: 2500, inflow: 11000, outflow: 8500 },
  { time: '2024-01-08' as any, moneyFlow: 3500, inflow: 13000, outflow: 9500 },
  { time: '2024-01-09' as any, moneyFlow: 3000, inflow: 12000, outflow: 9000 },
  { time: '2024-01-10' as any, moneyFlow: 4200, inflow: 14000, outflow: 9800 },
  { time: '2024-01-11' as any, moneyFlow: 5000, inflow: 15000, outflow: 10000 },
  { time: '2024-01-12' as any, moneyFlow: 5500, inflow: 16000, outflow: 10500 },
  { time: '2024-01-15' as any, moneyFlow: 6000, inflow: 17000, outflow: 11000 },
  { time: '2024-01-16' as any, moneyFlow: 6500, inflow: 18000, outflow: 11500 },
];

// Mock data untuk net flows
const netFlowData = [
  { date: '09:00', netFlow: 150, buyFlow: 800, sellFlow: 650 },
  { date: '09:30', netFlow: 220, buyFlow: 950, sellFlow: 730 },
  { date: '10:00', netFlow: -80, buyFlow: 600, sellFlow: 680 },
  { date: '10:30', netFlow: 180, buyFlow: 850, sellFlow: 670 },
  { date: '11:00', netFlow: 320, buyFlow: 1100, sellFlow: 780 },
  { date: '11:30', netFlow: 450, buyFlow: 1300, sellFlow: 850 },
  { date: '12:00', netFlow: 380, buyFlow: 1200, sellFlow: 820 },
  { date: '13:00', netFlow: 520, buyFlow: 1400, sellFlow: 880 },
  { date: '13:30', netFlow: 620, buyFlow: 1500, sellFlow: 880 },
  { date: '14:00', netFlow: 680, buyFlow: 1600, sellFlow: 920 },
  { date: '14:30', netFlow: 750, buyFlow: 1700, sellFlow: 950 },
  { date: '15:00', netFlow: 820, buyFlow: 1800, sellFlow: 980 },
];

// Real data from BBCA.csv - using correct percentages from updated CSV
const localStackedDataRaw = [
  { date: '2025-06-30', Corporate: 1.64, FinancialInstitution: 0.33, Individual: 0.57, Insurance: 65.83, MutualFund: 17.53, Others: 10.06, PensionFund: 0.03, SecuritiesCompany: 3.13 },
  { date: '2024-09-30', Corporate: 1.17, FinancialInstitution: 0.02, Individual: 0.58, Insurance: 62.61, MutualFund: 20.16, Others: 10.88, PensionFund: 0.02, SecuritiesCompany: 3.69 },
  { date: '2025-02-28', Corporate: 1.62, FinancialInstitution: 0.37, Individual: 0.59, Insurance: 64.74, MutualFund: 17.78, Others: 10.55, PensionFund: 0.02, SecuritiesCompany: 3.38 },
  { date: '2025-05-28', Corporate: 1.65, FinancialInstitution: 0.34, Individual: 0.56, Insurance: 65.73, MutualFund: 17.85, Others: 9.88, PensionFund: 0.03, SecuritiesCompany: 3.15 },
  { date: '2025-03-27', Corporate: 1.86, FinancialInstitution: 0.03, Individual: 0.55, Insurance: 66.32, MutualFund: 17.26, Others: 9.96, PensionFund: 0.03, SecuritiesCompany: 3.09 },
  { date: '2025-01-31', Corporate: 1.50, FinancialInstitution: 0.03, Individual: 0.60, Insurance: 64.31, MutualFund: 18.30, Others: 10.77, PensionFund: 0.03, SecuritiesCompany: 3.52 },
  { date: '2024-11-29', Corporate: 1.23, FinancialInstitution: 0.02, Individual: 0.59, Insurance: 62.72, MutualFund: 19.70, Others: 11.19, PensionFund: 0.02, SecuritiesCompany: 3.64 },
  { date: '2025-04-30', Corporate: 1.81, FinancialInstitution: 0.13, Individual: 0.55, Insurance: 66.04, MutualFund: 17.44, Others: 9.95, PensionFund: 0.03, SecuritiesCompany: 3.12 },
  { date: '2024-08-30', Corporate: 1.14, FinancialInstitution: 0.02, Individual: 0.64, Insurance: 61.41, MutualFund: 20.37, Others: 11.69, PensionFund: 0.04, SecuritiesCompany: 3.81 },
  { date: '2024-12-30', Corporate: 1.40, FinancialInstitution: 0.02, Individual: 0.60, Insurance: 62.86, MutualFund: 19.45, Others: 11.08, PensionFund: 0.02, SecuritiesCompany: 3.65 },
  { date: '2025-08-29', Corporate: 1.70, FinancialInstitution: 0.31, Individual: 0.55, Insurance: 66.67, MutualFund: 17.92, Others: 8.97, PensionFund: 0.03, SecuritiesCompany: 2.98 },
  { date: '2024-10-31', Corporate: 1.20, FinancialInstitution: 0.02, Individual: 0.61, Insurance: 62.70, MutualFund: 19.71, Others: 11.16, PensionFund: 0.03, SecuritiesCompany: 3.70 },
  { date: '2025-07-31', Corporate: 1.69, FinancialInstitution: 0.32, Individual: 0.55, Insurance: 65.87, MutualFund: 17.87, Others: 9.69, PensionFund: 0.03, SecuritiesCompany: 3.07 },
];

const foreignStackedDataRaw = [
  { date: '2025-06-30', Corporate: 4.60, FinancialInstitution: 5.76, Individual: 0.74, Insurance: 1.48, MutualFund: 45.83, Others: 22.38, PensionFund: 15.60, SecuritiesCompany: 2.31 },
  { date: '2024-09-30', Corporate: 4.03, FinancialInstitution: 6.65, Individual: 0.70, Insurance: 1.39, MutualFund: 44.90, Others: 24.09, PensionFund: 14.43, SecuritiesCompany: 2.40 },
  { date: '2025-02-28', Corporate: 4.08, FinancialInstitution: 5.55, Individual: 0.72, Insurance: 1.44, MutualFund: 45.53, Others: 24.06, PensionFund: 14.92, SecuritiesCompany: 2.29 },
  { date: '2025-05-28', Corporate: 4.61, FinancialInstitution: 5.31, Individual: 0.73, Insurance: 1.43, MutualFund: 46.22, Others: 22.40, PensionFund: 15.74, SecuritiesCompany: 2.25 },
  { date: '2025-03-27', Corporate: 4.58, FinancialInstitution: 5.71, Individual: 0.73, Insurance: 1.44, MutualFund: 45.41, Others: 23.21, PensionFund: 15.20, SecuritiesCompany: 2.30 },
  { date: '2025-01-31', Corporate: 4.15, FinancialInstitution: 5.84, Individual: 0.72, Insurance: 1.42, MutualFund: 45.27, Others: 24.24, PensionFund: 14.71, SecuritiesCompany: 2.26 },
  { date: '2024-11-29', Corporate: 4.17, FinancialInstitution: 6.33, Individual: 0.71, Insurance: 1.35, MutualFund: 44.67, Others: 24.26, PensionFund: 14.71, SecuritiesCompany: 2.41 },
  { date: '2025-04-30', Corporate: 4.57, FinancialInstitution: 5.71, Individual: 0.74, Insurance: 1.40, MutualFund: 46.03, Others: 22.36, PensionFund: 15.40, SecuritiesCompany: 2.34 },
  { date: '2024-08-30', Corporate: 4.03, FinancialInstitution: 6.70, Individual: 0.70, Insurance: 1.36, MutualFund: 44.92, Others: 23.89, PensionFund: 14.57, SecuritiesCompany: 2.39 },
  { date: '2024-12-30', Corporate: 4.15, FinancialInstitution: 6.08, Individual: 0.71, Insurance: 1.38, MutualFund: 45.37, Others: 24.00, PensionFund: 14.62, SecuritiesCompany: 2.31 },
  { date: '2025-08-29', Corporate: 4.70, FinancialInstitution: 6.24, Individual: 0.75, Insurance: 1.33, MutualFund: 44.97, Others: 22.51, PensionFund: 15.45, SecuritiesCompany: 2.57 },
  { date: '2024-10-31', Corporate: 4.05, FinancialInstitution: 6.44, Individual: 0.70, Insurance: 1.34, MutualFund: 44.84, Others: 24.24, PensionFund: 14.62, SecuritiesCompany: 2.41 },
  { date: '2025-07-31', Corporate: 4.72, FinancialInstitution: 5.99, Individual: 0.75, Insurance: 1.33, MutualFund: 45.33, Others: 22.49, PensionFund: 15.39, SecuritiesCompany: 2.55 },
];

const combinedStackedDataRaw = [
  { date: '2025-06-30', Local: 17.94, Foreign: 82.06 },
  { date: '2024-09-30', Local: 13.94, Foreign: 86.06 },
  { date: '2025-02-28', Local: 16.52, Foreign: 83.48 },
  { date: '2025-05-28', Local: 17.09, Foreign: 82.91 },
  { date: '2025-03-27', Local: 17.63, Foreign: 82.37 },
  { date: '2025-01-31', Local: 15.73, Foreign: 84.27 },
  { date: '2024-11-29', Local: 14.91, Foreign: 85.09 },
  { date: '2025-04-30', Local: 17.72, Foreign: 82.28 },
  { date: '2024-08-30', Local: 14.36, Foreign: 85.64 },
  { date: '2024-12-30', Local: 15.20, Foreign: 84.80 },
  { date: '2025-08-29', Local: 19.48, Foreign: 80.52 },
  { date: '2024-10-31', Local: 14.20, Foreign: 85.80 },
  { date: '2025-07-31', Local: 18.99, Foreign: 81.01 },
];

// Sort data by date (oldest to newest)
const localStackedData = localStackedDataRaw.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
const foreignStackedData = foreignStackedDataRaw.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
const combinedStackedData = combinedStackedDataRaw.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

// Individual chart component for split view
const IndividualChart = ({ 
  data, 
  chartType, 
  title, 
  color, 
  height = 200 
}: { 
  data: any[], 
  chartType: 'candlestick' | 'histogram' | 'line', 
  title: string,
  color?: string,
  height?: number
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const userColors = useUserChartColors();

  const getThemeColors = () => {
    const isDark = document.documentElement.classList.contains('dark');
    return {
      textColor: isDark ? '#f9fafb' : '#111827',
      gridColor: isDark ? '#4b5563' : '#e5e7eb',
      borderColor: isDark ? '#6b7280' : '#d1d5db',
      axisTextColor: isDark ? '#d1d5db' : '#6b7280',
    };
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }
    
    const width = el.clientWidth || 800;
    const colors = getThemeColors();
    
    chartRef.current = createChart(el, {
      width,
      height,
      layout: { 
        background: { type: ColorType.Solid, color: 'transparent' }, 
        textColor: colors.axisTextColor,
      },
      grid: { 
        horzLines: { color: colors.gridColor, style: 1 }, 
        vertLines: { color: colors.gridColor, style: 1 } 
      },
      rightPriceScale: { 
        borderColor: colors.borderColor
      },
      timeScale: { 
        borderColor: colors.borderColor,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: any, tickMarkType: any, locale: string) => {
          let date: Date;
          if (typeof time === 'string') {
            date = new Date(time);
          } else {
            date = new Date(time * 1000);
          }
          const day = date.getDate();
          const month = date.toLocaleDateString('en-US', { month: 'short' });
          return `${day} ${month}`;
        }
      },
      crosshair: { mode: CrosshairMode.Normal },
    });

    if (!data.length) return;

    try {
      if (chartType === 'candlestick') {
        const candlestickSeries = chartRef.current.addSeries(CandlestickSeries, {
          upColor: userColors.bullish,
          downColor: userColors.bearish,
          borderVisible: false,
          wickUpColor: userColors.bullish,
          wickDownColor: userColors.bearish,
        });

        candlestickSeries.setData(data.map(d => ({
          time: d.time,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        })));
      } else if (chartType === 'line') {
        const lineSeries = chartRef.current.addSeries(LineSeries, {
          color: color || '#3b82f6',
          lineWidth: 2,
          priceFormat: { type: 'volume' },
        });

        lineSeries.setData(data.map(d => ({
          time: d.time,
          value: d.value || d.moneyFlow || d.volume,
        })));
      } else {
        const histogramSeries = chartRef.current.addSeries(HistogramSeries, {
          color: color || '#3b82f6',
          priceFormat: { type: 'volume' },
        });

        histogramSeries.setData(data.map(d => ({
          time: d.time,
          value: d.value || d.moneyFlow || d.volume,
          color: d.color || (d.value >= 0 ? userColors.bullish : userColors.bearish),
        })));
      }

      chartRef.current.timeScale().fitContent();
    } catch (e) {
      console.error('Individual chart render error:', e);
    }
  }, [data, chartType, color, height, userColors]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr || !chartRef.current) return;
      chartRef.current.applyOptions({
        width: Math.max(1, Math.floor(cr.width)),
        height: Math.max(1, Math.floor(cr.height)),
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, []);

  return (
    <div className="w-full relative">
      <style>{`
        #tv-attr-logo {
          display: none !important;
        }
        .tv-attr-logo {
          display: none !important;
        }
        [data-tv-attr-logo] {
          display: none !important;
        }
      `}</style>
      <div ref={containerRef} className="w-full" style={{ height: `${height}px` }} />
    </div>
  );
};

// TradingView-style chart with multiple panes
const TradingViewMultiPaneChart = ({ 
  candlestickData, 
  moneyFlowData, 
  volumeData 
}: { 
  candlestickData: any[], 
  moneyFlowData: any[], 
  volumeData: any[] 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const userColors = useUserChartColors();

  // Get theme-aware colors
  const getThemeColors = () => {
    const isDark = document.documentElement.classList.contains('dark');
    return {
      textColor: isDark ? '#f9fafb' : '#111827',
      gridColor: isDark ? '#4b5563' : '#e5e7eb',
      borderColor: isDark ? '#6b7280' : '#d1d5db',
      axisTextColor: isDark ? '#d1d5db' : '#6b7280',
      separatorColor: isDark ? '#4b5563' : '#e5e7eb',
      separatorHoverColor: isDark ? '#6b7280' : '#d1d5db'
    };
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Clean up existing chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }
    
    const width = el.clientWidth || 800;
    const height = el.clientHeight || 650;
    const colors = getThemeColors();
    
    // Create chart with panes configuration
    chartRef.current = createChart(el, {
      width,
      height,
      layout: { 
        background: { type: ColorType.Solid, color: 'transparent' }, 
        textColor: colors.axisTextColor,
        panes: {
          separatorColor: colors.separatorColor,
          separatorHoverColor: colors.separatorHoverColor,
          enableResize: true,
        }
      },
      grid: { 
        horzLines: { color: colors.gridColor, style: 1 }, 
        vertLines: { color: colors.gridColor, style: 1 } 
      },
      rightPriceScale: { 
        borderColor: colors.borderColor
      },
      timeScale: { 
        borderColor: colors.borderColor,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: any, tickMarkType: any, locale: string) => {
          let date: Date;
          if (typeof time === 'string') {
            date = new Date(time);
          } else {
            date = new Date(time * 1000);
          }
          const day = date.getDate();
          const month = date.toLocaleDateString('en-US', { month: 'short' });
          return `${day} ${month}`;
        }
      },
        crosshair: { mode: CrosshairMode.Normal },
      });

    if (!candlestickData.length) return;

    try {
      // Pane 0 (Main): Price Action - Candlestick Chart
      const candlestickSeries = chartRef.current.addSeries(CandlestickSeries, {
        upColor: userColors.bullish,
        downColor: userColors.bearish,
        borderVisible: false,
        wickUpColor: userColors.bullish,
        wickDownColor: userColors.bearish,
      }, 0); // Pane index 0

      candlestickSeries.setData(candlestickData.map(d => ({
        time: d.time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      })));

      // Pane 1: Money Flow Analysis
      const moneyFlowSeries = chartRef.current.addSeries(LineSeries, {
        color: '#3b82f6',
        lineWidth: 2,
        priceFormat: { type: 'volume' },
      }, 1); // Pane index 1

      moneyFlowSeries.setData(moneyFlowData.map(d => ({
        time: d.time,
        value: d.moneyFlow,
      })));

      // Pane 2: Volume Analysis
      const volumeSeries = chartRef.current.addSeries(HistogramSeries, {
        color: '#8b5cf6',
        priceFormat: { type: 'volume' },
      }, 2); // Pane index 2

      volumeSeries.setData(volumeData.map(d => ({
        time: d.time,
        value: d.volume,
        color: d.buyVolume > d.sellVolume ? userColors.bullish : userColors.bearish,
      })));

      // Force separate panes by setting heights
      setTimeout(() => {
        const panes = chartRef.current?.panes();
        if (panes && panes.length >= 3) {
          // Set pane heights - 6:1:1 ratio (Price:Money Flow:Volume) - Fixed ratio
          panes[0].setHeight(450); // Main price chart - 6 parts (64.3%)
          panes[1].setHeight(125); // Money flow - 1 part (17.9%) - Tidak gepeng
          panes[2].setHeight(125); // Volume - 1 part (17.9%) - Tidak gepeng
        }
      }, 200);

      chartRef.current.timeScale().fitContent();
    } catch (e) {
      console.error('Multi-pane chart render error:', e);
    }
  }, [candlestickData, moneyFlowData, volumeData, userColors]);

  // Resize responsif
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
      const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr || !chartRef.current) return;
      chartRef.current.applyOptions({
        width: Math.max(1, Math.floor(cr.width)),
        height: Math.max(1, Math.floor(cr.height)),
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, []);

  return (
    <div className="h-[700px] w-full relative">
      <style>{`
        #tv-attr-logo {
          display: none !important;
        }
        .tv-attr-logo {
          display: none !important;
        }
        [data-tv-attr-logo] {
          display: none !important;
        }
      `}</style>
      
      {/* Y-axis titles - positioned for 6:1:1 ratio yang fixed */}
      <div className="absolute -left-4 top-45 text-sm font-bold text-muted-foreground transform -rotate-90 origin-left whitespace-nowrap z-10">
        Price
      </div>
      <div className="absolute -left-4 top-120 text-sm font-bold text-muted-foreground transform -rotate-90 origin-left whitespace-nowrap z-10">
        Money Flow
      </div>
      <div className="absolute -left-4 top-155 text-sm font-bold text-muted-foreground transform -rotate-90 origin-left whitespace-nowrap z-10">
        Volume
      </div>
      
      {/* X-axis title */}
      <div className="absolute -bottom-4 left-1/2 transform -translate-x-1/2 text-sm font-bold text-muted-foreground z-10">
        Date
      </div>
      
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
};

export function StoryMarketParticipant() {
  const [selectedStock, setSelectedStock] = useState('BBRI');
  const [showHistory, setShowHistory] = useState(false);
  const [stockInput, setStockInput] = useState('BBRI');
  const [showStockSuggestions, setShowStockSuggestions] = useState(false);
  const [layoutMode, setLayoutMode] = useState<'split' | 'combined'>('combined');

  const stocks = ['BBRI', 'BBCA', 'BMRI', 'BBNI', 'TLKM', 'ASII', 'UNVR', 'GGRM', 'ICBP', 'INDF', 'KLBF', 'ADRO', 'ANTM', 'ITMG', 'PTBA', 'SMGR', 'INTP', 'WIKA', 'WSKT', 'PGAS'];

  // Filter stocks based on input
  const filteredStocks = stocks.filter(stock => 
    stock.toLowerCase().includes(stockInput.toLowerCase())
  );

  const handleStockSelect = (stock: string) => {
    setStockInput(stock);
    setSelectedStock(stock);
    setShowStockSuggestions(false);
  };

  const handleStockInputChange = (value: string) => {
    setStockInput(value.toUpperCase());
    setShowStockSuggestions(true);
    // Auto-select if exact match
    if (stocks.includes(value.toUpperCase())) {
      setSelectedStock(value.toUpperCase());
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.stock-dropdown-container')) {
        setShowStockSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <div className="flex items-center gap-2">
                <label className="font-medium">Stock:</label>
                <div className="relative stock-dropdown-container">
                  <input
                    type="text"
                    value={stockInput}
                    onChange={(e) => handleStockInputChange(e.target.value)}
                    onFocus={() => setShowStockSuggestions(true)}
                    placeholder="Enter stock code..."
                    className="px-3 py-1 border border-border rounded-md bg-background text-foreground w-40"
                  />
                  {showStockSuggestions && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                      {stockInput === '' ? (
                        <>
                          <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
                            All Stocks
                          </div>
                          {stocks.map(stock => (
                            <div
                              key={stock}
                              onClick={() => handleStockSelect(stock)}
                              className="px-3 py-2 hover:bg-muted cursor-pointer text-sm"
                            >
                              {stock}
                            </div>
                          ))}
                        </>
                      ) : filteredStocks.length > 0 ? (
                        filteredStocks.map(stock => (
                          <div
                            key={stock}
                            onClick={() => handleStockSelect(stock)}
                            className="px-3 py-2 hover:bg-muted cursor-pointer text-sm"
                          >
                            {stock}
                          </div>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          No stocks found
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <label className="font-medium">Layout:</label>
              <div className="flex gap-1">
                <Button
                  variant={layoutMode === 'combined' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setLayoutMode('combined')}
                >
                  Combine
                </Button>
                <Button
                  variant={layoutMode === 'split' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setLayoutMode('split')}
                >
                  Split
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Chart Layout */}
      <div className="space-y-4">
        {layoutMode === 'combined' ? (
          /* Combined TradingView Chart with Multiple Panes */
          <Card>
            <CardHeader>
              <CardTitle>{selectedStock} - Market Analysis</CardTitle>
              <p className="text-sm text-muted-foreground">Price action, money flow, and volume analysis</p>
            </CardHeader>
            <CardContent>
              <TradingViewMultiPaneChart 
                candlestickData={candlestickData}
                moneyFlowData={moneyFlowData}
                volumeData={volumeData}
              />
            </CardContent>
          </Card>
        ) : (
          /* Split View - Individual Charts */
          <div className="space-y-4">
            {/* Price Chart */}
            <Card>
              <CardHeader>
                <CardTitle>{selectedStock} - Price Action</CardTitle>
                <p className="text-sm text-muted-foreground">Candlestick chart showing price movement</p>
              </CardHeader>
              <CardContent>
                <IndividualChart 
                  data={candlestickData}
                  chartType="candlestick"
                  title="Price"
                  height={300}
                />
              </CardContent>
            </Card>

            {/* Money Flow Chart */}
        <Card>
          <CardHeader>
                <CardTitle>{selectedStock} - Money Flow</CardTitle>
                <p className="text-sm text-muted-foreground">Money flow analysis showing inflow and outflow</p>
          </CardHeader>
          <CardContent>
                <IndividualChart 
                  data={moneyFlowData.map(d => ({
                    time: d.time,
                    value: d.moneyFlow
                  }))}
                  chartType="line"
                  title="Money Flow"
                  color="#3b82f6"
                  height={200}
                />
          </CardContent>
        </Card>

            {/* Volume Chart */}
            <Card>
              <CardHeader>
                <CardTitle>{selectedStock} - Volume</CardTitle>
                <p className="text-sm text-muted-foreground">Trading volume analysis</p>
              </CardHeader>
              <CardContent>
                <IndividualChart 
                  data={volumeData.map(d => ({
                    time: d.time,
                    value: d.volume
                  }))}
                  chartType="histogram"
                  title="Volume"
                  color="#8b5cf6"
                  height={200}
                />
              </CardContent>
            </Card>
          </div>
        )}

        {/* Stacked Bar Charts Section */}
        <div className="space-y-4">
          {/* Local Market Participants Stacked Chart */}
        <Card>
          <CardHeader>
              <CardTitle>Local Market Participants Breakdown</CardTitle>
              <p className="text-sm text-muted-foreground">Local investor types distribution over time</p>
          </CardHeader>
          <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={localStackedData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis 
                      dataKey="date" 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px',
                        fontSize: '12px'
                      }}
                      formatter={(value, name) => [`${value}%`, name]}
                    />
                    <Bar dataKey="Corporate" stackId="local" fill="#3b82f6" name="Corporate" />
                    <Bar dataKey="FinancialInstitution" stackId="local" fill="#8b5cf6" name="Financial Institution" />
                    <Bar dataKey="Individual" stackId="local" fill="#10b981" name="Individual" />
                    <Bar dataKey="Insurance" stackId="local" fill="#f59e0b" name="Insurance" />
                    <Bar dataKey="MutualFund" stackId="local" fill="#ef4444" name="Mutual Fund" />
                    <Bar dataKey="Others" stackId="local" fill="#6b7280" name="Others" />
                    <Bar dataKey="PensionFund" stackId="local" fill="#84cc16" name="Pension Fund" />
                    <Bar dataKey="SecuritiesCompany" stackId="local" fill="#f97316" name="Securities Company" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
          </CardContent>
        </Card>

          {/* Foreign Market Participants Stacked Chart */}
        <Card>
          <CardHeader>
              <CardTitle>Foreign Market Participants Breakdown</CardTitle>
              <p className="text-sm text-muted-foreground">Foreign investor types distribution over time</p>
          </CardHeader>
          <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={foreignStackedData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis 
                      dataKey="date" 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px',
                        fontSize: '12px'
                      }}
                      formatter={(value, name) => [`${value}%`, name]}
                    />
                    <Bar dataKey="Corporate" stackId="foreign" fill="#3b82f6" name="Corporate" />
                    <Bar dataKey="FinancialInstitution" stackId="foreign" fill="#8b5cf6" name="Financial Institution" />
                    <Bar dataKey="Individual" stackId="foreign" fill="#10b981" name="Individual" />
                    <Bar dataKey="Insurance" stackId="foreign" fill="#f59e0b" name="Insurance" />
                    <Bar dataKey="MutualFund" stackId="foreign" fill="#ef4444" name="Mutual Fund" />
                    <Bar dataKey="Others" stackId="foreign" fill="#6b7280" name="Others" />
                    <Bar dataKey="PensionFund" stackId="foreign" fill="#84cc16" name="Pension Fund" />
                    <Bar dataKey="SecuritiesCompany" stackId="foreign" fill="#f97316" name="Securities Company" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
          </CardContent>
        </Card>

          {/* Combined Local vs Foreign Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Local vs Foreign Market Comparison</CardTitle>
              <p className="text-sm text-muted-foreground">Total local vs foreign participation over time</p>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={combinedStackedData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis 
                      dataKey="date" 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px',
                        fontSize: '12px'
                      }}
                      formatter={(value, name) => [`${value}%`, name]}
                    />
                    <Bar dataKey="Local" stackId="combined" fill="#3b82f6" name="Local" />
                    <Bar dataKey="Foreign" stackId="combined" fill="#f59e0b" name="Foreign" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}