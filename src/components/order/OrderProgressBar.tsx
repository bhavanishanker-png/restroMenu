import type { OrderStatus } from "@/types";

const STEPS: { key: OrderStatus; label: string; icon: string }[] = [
  { key: "placed",    label: "Placed",    icon: "receipt" },
  { key: "accepted",  label: "Accepted",  icon: "thumb_up" },
  { key: "preparing", label: "Preparing", icon: "skillet" },
  { key: "ready",     label: "Ready!",    icon: "room_service" },
  { key: "served",    label: "Served",    icon: "check_circle" },
];

export function OrderProgressBar({ status }: { status: OrderStatus }) {
  if (status === "cancelled") {
    return (
      <div className="rounded-xl border border-tertiary/30 bg-tertiary/10 px-4 py-3 text-center font-label-bold text-label-bold text-tertiary">
        Order cancelled
      </div>
    );
  }

  const currentIdx = STEPS.findIndex((s) => s.key === status);

  return (
    <div className="relative flex items-start justify-between px-2">
      {/* Background track */}
      <div className="absolute left-0 right-0 top-5 mx-7 h-0.5 bg-outline-variant" aria-hidden />
      {/* Progress fill */}
      <div
        className="absolute left-0 top-5 mx-7 h-0.5 bg-primary transition-all duration-700"
        style={{ width: `${(currentIdx / (STEPS.length - 1)) * 88}%` }}
        aria-hidden
      />

      {STEPS.map((step, idx) => {
        const done = idx < currentIdx;
        const active = idx === currentIdx;

        return (
          <div key={step.key} className="relative z-10 flex flex-col items-center gap-1.5" style={{ width: 56 }}>
            {/* Icon circle */}
            <div
              className={[
                "flex h-10 w-10 items-center justify-center rounded-full transition-all duration-500",
                done
                  ? "bg-primary text-on-primary shadow-level-1"
                  : active
                  ? "border-2 border-primary bg-surface-container-lowest text-primary"
                  : "bg-surface-container-highest text-on-surface-variant",
              ].join(" ")}
              aria-hidden
            >
              {active ? (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{step.icon}</span>
                  {/* Pulse ring */}
                  <span className="absolute h-10 w-10 rounded-full border-2 border-primary animate-ping opacity-40" />
                </>
              ) : (
                <span
                  className={`material-symbols-outlined ${done ? "fill" : ""}`}
                  style={{ fontSize: 20 }}
                >
                  {done ? "check_circle" : step.icon}
                </span>
              )}
            </div>

            <span
              className={`text-center font-label-bold leading-tight ${
                done || active ? "text-primary" : "text-on-surface-variant"
              }`}
              style={{ fontSize: 10, lineHeight: "14px" }}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
