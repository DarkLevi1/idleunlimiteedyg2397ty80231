import { type LineId, lineLabel, lineMeta, lineSupLabel } from "@/lib/subwayEngine";
import clsx from "clsx";

type LineBulletProps = {
  line: LineId;
  size?: "sm" | "md" | "lg" | "tile";
  muted?: boolean;
};

const sizes = {
  sm: "h-7 min-w-7 px-1.5 text-sm",
  md: "h-9 min-w-9 px-2 text-xl",
  lg: "h-11 min-w-11 px-2.5 text-2xl",
  tile: "h-10 min-w-10 px-2 text-xl",
};

export function LineBullet({ line, size = "md", muted = false }: LineBulletProps) {
  const meta = lineMeta(line);
  const sup = lineSupLabel(line);
  const label = lineLabel(line);
  const isLongLabel = label.length > 2;
  return (
    <span
      className={clsx(
        "inline-flex items-center justify-center rounded-full border border-white/25 leading-none shadow-sm",
        sizes[size],
        "font-extrabold",
        isLongLabel && (size === "lg" || size === "tile") && "text-base",
        isLongLabel && size === "md" && "text-sm",
        isLongLabel && size === "sm" && "text-[11px]",
        muted && "opacity-55 grayscale",
      )}
      style={{ backgroundColor: meta.color, color: meta.text }}
      aria-label={`${line} train`}
    >
      {label}
      {sup ? <sup className="ml-px text-[0.6em] leading-none">{sup}</sup> : null}
    </span>
  );
}
