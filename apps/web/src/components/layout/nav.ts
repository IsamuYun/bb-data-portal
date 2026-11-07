import {
  Boxes,
  Database,
  Download,
  FileSpreadsheet,
  Languages,
  LayoutDashboard,
  ListChecks,
  MonitorSmartphone,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { title: string; href: string; icon: LucideIcon };

export const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "总览",
    items: [{ title: "仪表盘", href: "/", icon: LayoutDashboard }],
  },
  {
    label: "采集",
    items: [
      { title: "平台与 Recipe", href: "/platforms", icon: Boxes },
      { title: "数据集 / 导入", href: "/datasets", icon: FileSpreadsheet },
      { title: "任务", href: "/jobs", icon: ListChecks },
      { title: "设备", href: "/devices", icon: MonitorSmartphone },
    ],
  },
  {
    label: "数据",
    items: [
      { title: "记录", href: "/records", icon: Database },
      { title: "导出", href: "/exports", icon: Download },
      { title: "翻译字典", href: "/dictionary", icon: Languages },
    ],
  },
  {
    label: "系统",
    items: [{ title: "设置", href: "/settings", icon: Settings }],
  },
];

export function findNav(pathname: string): NavItem | undefined {
  const all = navGroups.flatMap((g) => g.items);
  return all.find((i) => i.href === pathname) ?? all.filter((i) => i.href !== "/" && pathname.startsWith(i.href)).at(0);
}
