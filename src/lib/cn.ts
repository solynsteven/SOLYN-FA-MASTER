import clsx from "clsx";
export function cn(...a: Parameters<typeof clsx>) {
  return clsx(...a);
}
