"use client";

import { useEffect, useState } from "react";
import { Select } from "@/components/ui/select";
import {
  defaultExchangeRatio,
  exchangeRatios,
  type Exchange,
  type ExchangeOverview,
  type ExchangeRatio,
} from "@/lib/exchanges";

export function refreshExchangeOverview() {
  window.dispatchEvent(new Event("collabio:exchange-updated"));
}

export function useExchangeOverview(partnershipId: string) {
  const [state, setState] = useState<{
    partnershipId: string;
    overview?: ExchangeOverview;
    error?: string;
  }>();
  useEffect(() => {
    if (!partnershipId) return;
    let controller: AbortController | undefined;
    function load() {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      const params = new URLSearchParams({ partnershipId });
      fetch(`/api/deals?${params}`, {
        signal: request.signal,
        cache: "no-store",
      })
        .then(async (response) => {
          const data = await response.json();
          if (request.signal.aborted) return;
          if (!response.ok)
            throw new Error(
              data.error ?? "Could not load the exchange balance.",
            );
          setState({ partnershipId, overview: data.overview });
        })
        .catch((error: unknown) => {
          if (!request.signal.aborted)
            setState({
              partnershipId,
              error:
                error instanceof Error
                  ? error.message
                  : "Could not load the exchange balance.",
            });
        });
    }
    function refreshWhenVisible() {
      if (document.visibilityState === "visible") load();
    }
    load();
    const timer = window.setInterval(refreshWhenVisible, 20_000);
    window.addEventListener("collabio:exchange-updated", load);
    window.addEventListener("collabio:request-updated", load);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      controller?.abort();
      window.clearInterval(timer);
      window.removeEventListener("collabio:exchange-updated", load);
      window.removeEventListener("collabio:request-updated", load);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [partnershipId]);
  return state?.partnershipId === partnershipId ? state : undefined;
}

function toViewer(exchange: Exchange, overview: ExchangeOverview) {
  const isA = overview.side === "a";
  return {
    ratio: `${isA ? exchange.side_a_quota : exchange.side_b_quota}:${isA ? exchange.side_b_quota : exchange.side_a_quota}`,
    giveDue: isA ? exchange.side_a_due : exchange.side_b_due,
    receiveDue: isA ? exchange.side_b_due : exchange.side_a_due,
    firstIsYou: exchange.first_link_side === overview.side,
  };
}

function exchangeLabel(exchange: Exchange, overview: ExchangeOverview) {
  const { ratio } = toViewer(exchange, overview);
  return exchange.openingRequestNumber
    ? `Request #${exchange.openingRequestNumber} · ${ratio}`
    : `Link exchange · ${ratio}`;
}

export function ExchangeBalance({
  overview,
  error,
  showExchanges = false,
}: {
  overview?: ExchangeOverview;
  error?: string;
  showExchanges?: boolean;
}) {
  if (error)
    return <p className="os-card p-4 text-sm text-[var(--muted)]">{error}</p>;
  if (!overview)
    return (
      <p className="os-card p-4 text-sm text-[var(--muted)]" role="status">
        Loading exchange balance…
      </p>
    );
  if (!overview.side) return null;
  const { balance, previousBalance } = overview;
  const hasPreviousBalance =
    previousBalance.giveDue > 0 || previousBalance.receiveDue > 0;
  return (
    <section className="os-card space-y-3 p-4" aria-label="Exchange balance">
      <h2 className="font-semibold">
        Exchange balance with {overview.partnerName}
      </h2>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {[
          ["Links you gave", balance.given],
          ["Links you received", balance.received],
          ["You still owe", balance.giveDue],
          [`${overview.partnerName} still owes`, balance.receiveDue],
        ].map(([label, value]) => (
          <div className="rounded-lg bg-[var(--canvas)] p-3" key={label}>
            <dt className="text-[var(--muted)]">{label}</dt>
            <dd className="text-xl font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {hasPreviousBalance && (
        <p className="text-sm text-[var(--muted)]">
          Previous link balance (1:1) · You owe {previousBalance.giveDue} ·{" "}
          {overview.partnerName} owes {previousBalance.receiveDue}
        </p>
      )}
      {showExchanges && overview.exchanges.length > 0 && (
        <details className="border-t border-[var(--border)] pt-3 text-sm" open>
          <summary className="cursor-pointer font-medium">
            Link exchanges
          </summary>
          <ul className="mt-2 max-h-72 divide-y divide-[var(--border)] overflow-auto">
            {overview.exchanges.map((exchange) => {
              const { firstIsYou, giveDue, receiveDue } = toViewer(
                exchange,
                overview,
              );
              let status =
                exchange.status === "closed"
                  ? "Exchange complete"
                  : `You owe ${giveDue} · ${overview.partnerName} owes ${receiveDue}`;
              if (exchange.status === "open" && !exchange.first_link_live_at)
                status = firstIsYou
                  ? "Waiting for your link"
                  : `Waiting for ${overview.partnerName}’s link`;
              return (
                <li
                  key={exchange.id}
                  className="flex flex-wrap justify-between gap-2 py-2"
                >
                  <span>{exchangeLabel(exchange, overview)}</span>
                  <span className="text-[var(--muted)]">{status}</span>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </section>
  );
}

export function ExchangeFields({
  overview,
  partnerName,
  edit,
  currentDealId,
}: {
  overview?: ExchangeOverview;
  partnerName?: string;
  edit?: boolean;
  currentDealId?: string | null;
}) {
  const [dealId, setDealId] = useState(currentDealId ?? "");
  const [ratio, setRatio] = useState<ExchangeRatio | "">(defaultExchangeRatio);
  const [youGive, theyGive] = ratio.split(":").map(Number);
  const partner = overview?.partnerName ?? partnerName ?? "Partner";
  const available = overview?.side
    ? overview.exchanges.filter(
        (exchange) =>
          exchange.status === "open" || exchange.id === currentDealId,
      )
    : [];
  return (
    <div className="grid gap-2 md:col-span-2">
      {(edit || available.length > 0) && (
        <label className="text-sm font-medium">
          Link exchange
          <Select
            name="dealId"
            className="mt-1"
            value={dealId}
            onChange={(event) => setDealId(event.target.value)}
          >
            <option value="">
              {edit ? "No linked exchange" : "Start a new exchange"}
            </option>
            {currentDealId &&
              !available.some((exchange) => exchange.id === currentDealId) && (
                <option value={currentDealId}>Current exchange</option>
              )}
            {overview &&
              available.map((exchange) => (
                <option key={exchange.id} value={exchange.id}>
                  {exchangeLabel(exchange, overview)}
                </option>
              ))}
          </Select>
        </label>
      )}
      {!edit && !dealId && (
        <label className="text-sm font-medium">
          Exchange ratio (you : {partner})
          <Select
            name="exchangeRatio"
            className="mt-1"
            value={ratio}
            onChange={(event) =>
              setRatio(event.target.value as ExchangeRatio | "")
            }
          >
            {exchangeRatios.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
            <option value="">Apply to previous balance (1:1)</option>
          </Select>
          <span className="mt-1 block text-xs text-[var(--muted)]">
            {ratio
              ? `You give ${youGive} · ${partner} gives ${theyGive} · ${youGive < theyGive ? "You publish first" : `${partner} publishes first`}`
              : "This placement counts toward the 1:1 balance when it goes Live."}
          </span>
        </label>
      )}
    </div>
  );
}
