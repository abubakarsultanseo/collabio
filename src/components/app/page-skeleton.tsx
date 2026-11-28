import { cn } from "@/lib/utils";

type SkeletonVariant = "table" | "cards" | "detail" | "form";

function Block({ className }: { className: string }) {
  return (
    <div
      className={cn(
        "rounded-lg bg-[var(--border)] opacity-60 motion-safe:animate-pulse",
        className,
      )}
    />
  );
}

export default function PageSkeleton({
  variant = "table",
}: {
  variant?: SkeletonVariant;
}) {
  return (
    <div
      role="status"
      aria-label="Loading page"
      className="mx-auto max-w-6xl space-y-6 p-5 md:p-8"
    >
      <div aria-hidden="true" className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="w-full max-w-xs space-y-2">
            <Block className="h-7 w-2/3" />
            <Block className="h-4 w-full" />
          </div>
          <Block className="h-10 w-28" />
        </div>
        {(variant === "cards" || variant === "detail") && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="os-card space-y-4 p-5">
                <Block className="h-8 w-12" />
                <Block className="h-4 w-3/4" />
              </div>
            ))}
          </div>
        )}
        <div className="os-card space-y-3 p-5">
          {Array.from({ length: variant === "table" ? 7 : 4 }, (_, index) => (
            <Block
              key={index}
              className={
                variant === "form" && index === 3
                  ? "h-24 w-full"
                  : "h-11 w-full"
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}
