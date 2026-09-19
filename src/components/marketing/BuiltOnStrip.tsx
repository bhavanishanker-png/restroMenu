import { Marquee } from "@/components/aceternity/Marquee";

/**
 * Where a template would put invented customer logos, this strip lists what
 * the product is actually built on — every item corresponds to a real
 * dependency or route in this codebase. It reads as social proof without
 * claiming a single customer the product may not have.
 */
const STACK = [
  { label: "Razorpay payments", icon: "credit_card" },
  { label: "UPI & cards", icon: "account_balance" },
  { label: "Realtime order sync", icon: "bolt" },
  { label: "Installable PWA", icon: "install_mobile" },
  { label: "AI menu import", icon: "auto_awesome" },
  { label: "Printable QR packs", icon: "qr_code_2" },
  { label: "Role-based staff access", icon: "shield_person" },
];

export function BuiltOnStrip() {
  return (
    <div className="border-y border-outline-variant bg-surface-container-low/40 py-6">
      <p className="mb-5 text-center font-label-bold text-label-bold uppercase text-on-surface-variant">
        Everything included, nothing to bolt on
      </p>

      <Marquee>
        <ul className="flex items-center">
          {STACK.map((item) => (
            <li
              key={item.label}
              className="flex items-center gap-2.5 whitespace-nowrap px-6 text-body-sm text-on-surface-variant"
            >
              <span
                className="material-symbols-outlined text-on-surface-variant/70"
                style={{ fontSize: 18 }}
                aria-hidden="true"
              >
                {item.icon}
              </span>
              {item.label}
              <span
                aria-hidden="true"
                className="ml-6 h-1 w-1 rounded-full bg-outline-variant"
              />
            </li>
          ))}
        </ul>
      </Marquee>
    </div>
  );
}
