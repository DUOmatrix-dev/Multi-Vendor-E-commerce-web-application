import { CurrencyCode } from '../types';

const RATES: Record<CurrencyCode, { symbol: string; rate: number }> = {
  USD: { symbol: '$', rate: 1 },
  EUR: { symbol: '€', rate: 0.92 },
  GBP: { symbol: '£', rate: 0.79 },
};

export function formatMoney(amountUsd: number, currency: CurrencyCode = 'USD'): string {
  const { symbol, rate } = RATES[currency] || RATES.USD;
  const converted = (Number(amountUsd) || 0) * rate;
  return `${symbol}${converted.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function parseAttributes(jsonStr: string): Array<{
  name: string;
  options: Array<{ label: string; priceDelta: number; stock: number }>;
}> {
  if (!jsonStr) return [];
  try {
    const parsed = JSON.parse(jsonStr);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
