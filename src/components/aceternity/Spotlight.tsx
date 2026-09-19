import { cn } from "@/lib/utils";

/**
 * The conical spotlight sweeping across a hero, as popularised by Aceternity —
 * rebuilt as pure SVG + CSS so it renders on the server and ships zero JS.
 *
 * It is `aria-hidden` decoration and `pointer-events-none`, so it can never
 * intercept a click or reach a screen reader. The fade-in is a CSS animation,
 * which the global prefers-reduced-motion rule already neutralises.
 */
export function Spotlight({
  className,
  fill = "hsl(var(--brand))",
}: {
  className?: string;
  fill?: string;
}) {
  return (
    <svg
      className={cn(
        "pointer-events-none absolute z-0 h-[169%] w-[138%] opacity-0 animate-fade-in lg:w-[84%]",
        className
      )}
      style={{ animationDelay: "120ms", animationDuration: "1.6s" }}
      viewBox="0 0 3787 2842"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <g filter="url(#spotlight-blur)">
        <ellipse
          cx="1924.71"
          cy="273.501"
          rx="1924.71"
          ry="273.501"
          transform="matrix(-0.822377 -0.568943 -0.568943 0.822377 3631.88 2291.09)"
          fill={fill}
          fillOpacity="0.21"
        />
      </g>
      <defs>
        <filter
          id="spotlight-blur"
          x="0.860352"
          y="0.838989"
          width="3785.16"
          height="2840.26"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="151" result="effect1_foregroundBlur" />
        </filter>
      </defs>
    </svg>
  );
}
