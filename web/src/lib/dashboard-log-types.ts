export type DashboardLogAction =
  | "login"
  | "pending"
  | "logout"
  | "approve"
  | "role_change"
  | "disable"
  | "enable"
  | "sync"
  | "page";

export type DashboardLogRow = {
  id: number;
  at: string;
  lineUserId: string | null;
  displayName: string | null;
  role: string | null;
  action: DashboardLogAction;
  path: string | null;
  label: string | null;
  detail: unknown;
};
