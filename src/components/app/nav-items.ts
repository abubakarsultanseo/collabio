import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Bell,
  Clock3,
  Inbox,
  LayoutDashboard,
  MessageSquare,
  Send,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  mobileLabel?: string;
};

export const workspaceItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    mobileLabel: "Dashboard",
  },
  { label: "My Partners", href: "/partners", icon: Users },
  { label: "Partner Workspaces", href: "/partnerships", icon: ArrowLeftRight },
  {
    label: "Received Requests",
    href: "/requests/inbox",
    icon: Inbox,
    mobileLabel: "Received",
  },
  {
    label: "Sent Requests",
    href: "/requests/sent",
    icon: Send,
    mobileLabel: "Sent",
  },
  { label: "Notifications", href: "/notifications", icon: Bell },
  { label: "Pending & Overdue", href: "/pending-overdue", icon: Clock3 },
  {
    label: "Chats",
    href: "/messages",
    icon: MessageSquare,
    mobileLabel: "Chats",
  },
  { label: "Monthly Reports", href: "/reports", icon: BarChart3 },
  { label: "Activity History", href: "/activity-history", icon: Activity },
];

export const adminItems: NavItem[] = [
  { label: "Partner Permissions", href: "/permissions", icon: ShieldCheck },
  { label: "Team & Invitations", href: "/team", icon: Users },
  { label: "Import requests", href: "/requests/import", icon: Inbox },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function isActivePage(path: string, href: string) {
  return path === href || path.startsWith(href + "/");
}

export function workspaceNav(isAdmin: boolean) {
  if (isAdmin) return workspaceItems;
  return workspaceItems.map((item) =>
    item.href === "/messages"
      ? { ...item, label: "Chat with Abubakar", mobileLabel: "Chat" }
      : item,
  );
}
