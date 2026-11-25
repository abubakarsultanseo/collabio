"use client";

import { Button } from "@/components/ui/button";
import { RequestContentFields } from "@/components/requests/request-content-fields";
import {
  ExchangeFields,
  useExchangeOverview,
} from "@/components/requests/exchange-controls";
import type { RequestRow } from "@/components/requests/request-list-cache";

export default function EditRequestForm({
  row,
  onSave,
  onSaveExchange,
  disabled,
}: {
  row: RequestRow;
  onSave: (form: HTMLFormElement) => void;
  onSaveExchange: (dealId: string) => void;
  disabled: boolean;
}) {
  const exchange = useExchangeOverview(row.partnership_id);
  return (
    <div className="space-y-3">
      <form
        className="grid gap-3 rounded-xl border border-[var(--border)] p-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSaveExchange(
            String(new FormData(event.currentTarget).get("dealId") ?? ""),
          );
        }}
      >
        <ExchangeFields
          edit
          overview={exchange?.overview}
          currentDealId={row.deal_id}
        />
        <Button
          type="submit"
          variant="outline"
          disabled={disabled || !exchange?.overview}
          className="justify-self-start"
        >
          Save linked exchange
        </Button>
      </form>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave(event.currentTarget);
        }}
        className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--canvas)] p-4 md:grid-cols-2"
      >
        <RequestContentFields row={row} />
        <Button type="submit" disabled={disabled} className="md:col-span-2">
          Save request
        </Button>
      </form>
    </div>
  );
}
