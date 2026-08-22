import type { OrderStatus } from "@/types";

const STEPS: { key: OrderStatus; label: string }[] = [
  { key: "placed", label: "Placed" },
  { key: "accepted", label: "Accepted" },
  { key: "preparing", label: "Preparing" },
  { key: "ready", label: "Ready!" },
  { key: "served", label: "Served" },
];

export function OrderProgressBar({ status }: { status: OrderStatus }) {
  if (status === "cancelled") {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-700">
        Order cancelled
      </div>
    );
  }

  const currentIdx = STEPS.findIndex((s) => s.key === status);

  return (
    <div className="relative flex items-start justify-between px-2">
      {/* Connecting line */}
      <div className="absolute left-0 right-0 top-4 mx-6 h-0.5 bg-stone-200" aria-hidden />
      <div
        className="absolute left-0 top-4 mx-6 h-0.5 bg-[#C2410C] transition-all duration-700"
        style={{ width: `${(currentIdx / (STEPS.length - 1)) * 100}%` }}
        aria-hidden
      />

      {STEPS.map((step, idx) => {
        const done = idx < currentIdx;
        const active = idx === currentIdx;

        return (
          <div key={step.key} className="relative z-10 flex flex-col items-center gap-1.5 w-12">
            {/* Dot */}
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors duration-500 ${
                done
                  ? "border-[#C2410C] bg-[#C2410C]"
                  : active
                  ? "border-[#C2410C] bg-white"
                  : "border-stone-300 bg-white"
              }`}
              aria-hidden
            >
              {done ? (
                <svg className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : active ? (
                <span className="h-3 w-3 animate-pulse rounded-full bg-[#C2410C]" />
              ) : null}
            </div>

            {/* Label */}
            <span
              className={`text-center text-[10px] font-medium leading-tight ${
                done || active ? "text-[#C2410C]" : "text-stone-400"
              }`}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
