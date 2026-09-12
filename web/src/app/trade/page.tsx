import { redirect } from "next/navigation";

export default async function TradePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) next.append(key, item);
    } else if (value != null) {
      next.set(key, value);
    }
  }
  const qs = next.toString();
  redirect(qs ? `/?${qs}` : "/");
}
