import type { Metadata } from "next";
import { StockDetailClient } from "./StockDetailClient";

type Props = { params: Promise<{ symbol: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { symbol } = await params;
  const sym = symbol.toUpperCase();
  return {
    title: sym,
    description: `Live quote, key stats, news, and my trade history for ${sym}.`,
  };
}

export default async function StockPage({ params }: Props) {
  const { symbol } = await params;
  return <StockDetailClient symbol={symbol.toUpperCase()} />;
}
