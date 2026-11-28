"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import InvitePartnerForm from "@/components/invite-partner-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

export function InvitePartnerDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">
          <UserPlus size={16} aria-hidden /> Invite partner
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Invite a partner"
        description="Send an invitation to join your workspace."
        className="max-w-xl"
      >
        <InvitePartnerForm onComplete={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
