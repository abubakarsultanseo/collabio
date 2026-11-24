"use client";
import { useToast } from "@/components/app/toast";
import { useState } from "react";
export default function AcceptInvitationForm({ token }: { token: string }) {
  const notify = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 10) {
      notify("Password must contain at least 10 characters.", "error");
      return;
    }
    if (password !== confirm) {
      notify("Passwords do not match.", "error");
      return;
    }
    setBusy(true);
    const response = await fetch("/api/invitations/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const data = await response.json();
    notify(
      response.ok
        ? "Account activated. You can now sign in."
        : (data.error ?? "Invitation could not be accepted."),
      response.ok ? "success" : "error",
    );
    setBusy(false);
  }
  return (
    <form onSubmit={submit}>
      <label className="text-sm">Password</label>
      <input
        className="field mt-1 mb-4"
        type="password"
        minLength={10}
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <label className="text-sm">Confirm password</label>
      <input
        className="field mt-1 mb-4"
        type="password"
        required
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      <button className="primary w-full" disabled={busy}>
        {busy ? "Activating..." : "Create account"}
      </button>
    </form>
  );
}
