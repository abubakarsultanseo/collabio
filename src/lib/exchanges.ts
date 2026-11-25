export const exchangeRatios = [
  "1:1",
  "2:1",
  "3:1",
  "4:1",
  "1:2",
  "1:3",
  "1:4",
  "1:5",
] as const;
export const defaultExchangeRatio = exchangeRatios[0];
export type ExchangeRatio = (typeof exchangeRatios)[number];
export type ExchangeSide = "a" | "b";

export type Exchange = {
  id: string;
  status: "open" | "closed" | "cancelled";
  side_a_quota: number;
  side_b_quota: number;
  side_a_live: number;
  side_b_live: number;
  side_a_due: number;
  side_b_due: number;
  first_link_side: ExchangeSide;
  first_link_live_at: string | null;
  openingRequestNumber?: number | null;
  openingRequestSentByYou: boolean;
};

export type ExchangeOverview = {
  side: ExchangeSide | null;
  partnerName: string;
  balance: {
    given: number;
    received: number;
    giveDue: number;
    receiveDue: number;
  };
  previousBalance: { giveDue: number; receiveDue: number };
  exchanges: Exchange[];
};
