"use client";
import { useToast } from "@/components/app/toast";
import { useState } from "react";
export default function InvitePartnerForm() {
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
    }
    setBusy(false);
  }
  return (
    <form onSubmit={submit} className="grid md:grid-cols-2 gap-3">
      <input
        className="field"
        placeholder="Partner name"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        className="field"
        type="email"
        placeholder="Partner email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="field"
        placeholder="Company (optional)"
        value={company}
        onChange={(e) => setCompany(e.target.value)}
      />
      <input
        className="field"
        type="url"
        placeholder="Website (optional)"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
      />
      <div className="md:col-span-2">
        <button className="primary" disabled={busy}>
          {busy ? "Sending..." : "Send invitation"}
        </button>
      </div>
    </form>
  );
}
