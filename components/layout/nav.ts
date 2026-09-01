import { Activity, Brain, LayoutDashboard, MessageCircle, Settings, SquareCheckBig, TrendingUp } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/agent", label: "Agent", icon: MessageCircle },
  { href: "/plans", label: "Plans", icon: SquareCheckBig },
  { href: "/progress", label: "Progress", icon: TrendingUp },
  { href: "/memory", label: "Memory", icon: Brain },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;
