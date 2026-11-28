"use client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import { useToast } from "@/components/app/toast";
import { useState } from "react";
export default function InvitePartnerForm({
  onComplete,
}: {
  onComplete?: () => void;
}) {
  const notify = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const response = await fetch("/api/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, company, website }),
    });
    const data = await response.json();
    notify(
      response.ok
        ? "Invitation created and email queued."
        : (data.error ?? "Could not create invitation."),
      response.ok ? "success" : "error",
    );
    if (response.ok) {
      setName("");
      setEmail("");
      setCompany("");
      setWebsite("");
      onComplete?.();
    }
    setBusy(false);
  }
  return (
    <form onSubmit={submit} className="grid md:grid-cols-2 gap-3">
      <Input
        aria-label="Partner name"
        placeholder="Partner name"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Input
        type="email"
        aria-label="Partner email"
        placeholder="Partner email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Input
        aria-label="Company (optional)"
        placeholder="Company (optional)"
        value={company}
        onChange={(e) => setCompany(e.target.value)}
      />
      <Input
        type="url"
        aria-label="Website (optional)"
        placeholder="Website (optional)"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
      />
      <div className="md:col-span-2">
        <Button disabled={busy}>
          {busy ? "Sending..." : "Send invitation"}
        </Button>
      </div>
    </form>
  );
}
