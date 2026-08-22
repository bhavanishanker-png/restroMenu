/**
 * Generates icon-192.png and icon-512.png from icon.svg.
 * Requires: npm install -g sharp  OR  npx sharp-cli
 * Run: node scripts/gen-icons.mjs
 */
import { execSync } from "child_process";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "../public");
const svgPath = join(publicDir, "icon.svg");

// Try sharp if available, otherwise use sips (macOS built-in)
function hasBinary(name) {
  try { execSync(`which ${name}`, { stdio: "ignore" }); return true; } catch { return false; }
}

if (hasBinary("rsvg-convert")) {
  execSync(`rsvg-convert -w 192 -h 192 "${svgPath}" -o "${join(publicDir, "icon-192.png")}"`);
  execSync(`rsvg-convert -w 512 -h 512 "${svgPath}" -o "${join(publicDir, "icon-512.png")}"`);
  console.log("✅ Icons generated via rsvg-convert");
} else if (hasBinary("convert")) {
  execSync(`convert -background none -resize 192x192 "${svgPath}" "${join(publicDir, "icon-192.png")}"`);
  execSync(`convert -background none -resize 512x512 "${svgPath}" "${join(publicDir, "icon-512.png")}"`);
  console.log("✅ Icons generated via ImageMagick convert");
} else {
  // macOS sips can't handle SVG. Generate a minimal PNG programmatically.
  // This produces a plain orange square as a placeholder.
  const { createCanvas } = await import("canvas").catch(() => null) ?? {};
  if (createCanvas) {
    for (const size of [192, 512]) {
      const canvas = createCanvas(size, size);
      const ctx = canvas.getContext("2d");
      const r = size * (96 / 512);
      ctx.fillStyle = "#C2410C";
      ctx.beginPath();
      ctx.roundRect(0, 0, size, size, r);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${size * 0.55}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Q", size / 2, size / 2 + size * 0.04);
      const fs = await import("fs");
      fs.writeFileSync(join(publicDir, `icon-${size}.png`), canvas.toBuffer("image/png"));
      console.log(`✅ icon-${size}.png generated`);
    }
  } else {
    console.log("⚠️  No SVG renderer found. Copying SVG as PNG placeholder.");
    const fs = await import("fs");
    fs.copyFileSync(svgPath, join(publicDir, "icon-192.png"));
    fs.copyFileSync(svgPath, join(publicDir, "icon-512.png"));
    console.log("   (Replace public/icon-192.png and public/icon-512.png with real PNGs before production)");
  }
}
