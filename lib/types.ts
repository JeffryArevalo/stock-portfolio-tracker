export type TradeType = "buy" | "sell";

export type Transaction = {
  id: string;
  date: string; // YYYY-MM-DD
  type: TradeType;
  symbol: string;
  shares: number;
  price: number;
  note?: string;
};

export type TransactionsFile = {
  transactions: Transaction[];
};

/** Position derived from the transaction log. */
export type Holding = {
  symbol: string;
  shares: number;
  avgCost: number;
  invested: number; // shares * avgCost (open cost basis)
  realizedPnL: number;
  totalBought: number; // lifetime $ purchased
  firstBuy: string | null;
  lastActivity: string | null;
  tradeCount: number;
};

export type Quote = {
  c: number; // current price
  d: number; // daily change $
  dp: number; // daily change %
  h: number; // day high
  l: number; // day low
  o: number; // day open
  pc: number; // previous close
  t: number; // unix timestamp
};

export type StockDetail = {
  profile: {
    name: string;
    logo: string;
    industry: string;
    exchange: string;
    ipo: string;
    marketCap: number; // millions
    sharesOutstanding: number; // millions
    weburl: string;
    country: string;
    currency: string;
  } | null;
  metrics: {
    peTTM: number | null;
    epsTTM: number | null;
    high52: number | null;
    low52: number | null;
    beta: number | null;
    dividendYield: number | null; // percent
    payoutRatio: number | null;
    revenueGrowthTTM: number | null;
    netMargin: number | null;
  } | null;
  news: Array<{
    id: number;
    datetime: number;
    headline: string;
    source: string;
    summary: string;
    url: string;
    image: string;
  }>;
};
