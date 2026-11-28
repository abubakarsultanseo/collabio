"use client";
import { useToast } from "@/components/app/toast";
import { useState } from "react";
import { AuthError } from "@/components/app/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
export default function AcceptInvitationForm({ token }: { token: string }) {
  const notify = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 10) {
      setError("Password must contain at least 10 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    const response = await fetch("/api/invitations/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const data = await response.json();
    if (response.ok) {
      notify("Account activated. You can now sign in.");
    } else {
      setError(data.error ?? "Invitation could not be accepted.");
    }
    setBusy(false);
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="invite-password">Password</Label>
        <Input
          id="invite-password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="invite-confirm">Confirm password</Label>
        <Input
          id="invite-confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
      </div>
      {error && <AuthError>{error}</AuthError>}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Activating…" : "Create account"}
      </Button>
    </form>
  );
}
