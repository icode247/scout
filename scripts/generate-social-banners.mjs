import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const source = "/Users/codev/.codex/generated_images/01a01ec7-c6b4-7e73-8340-f43969bf025c/exec-2722b291-cd5e-4232-9134-3392b94f2e17.png";
const outDir = path.join(root, "social-banners");
const logo = await fs.readFile(path.join(root, "public/brand/concept-a/logo-reversed.svg"), "utf8");

await fs.mkdir(outDir, { recursive: true });
await fs.copyFile(source, path.join(outDir, "scout-social-master.png"));

const esc = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;");

function overlay({ width, height, content, logoX, logoY, logoWidth, align = "start" }) {
  const logoHeight = Math.round(logoWidth * 40 / 176);
  const anchor = align === "middle" ? "middle" : "start";
  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="shadow" x="-20%" y="-40%" width="140%" height="180%">
          <feDropShadow dx="0" dy="3" stdDeviation="9" flood-color="#031006" flood-opacity=".28"/>
        </filter>
      </defs>
      <g filter="url(#shadow)">
        <svg x="${logoX}" y="${logoY}" width="${logoWidth}" height="${logoHeight}" viewBox="0 0 176 40">${logo.replace(/^.*?<svg[^>]*>/s, "").replace(/<\/svg>\s*$/s, "")}</svg>
        ${content.map((line) => `<text x="${line.x}" y="${line.y}" text-anchor="${line.anchor ?? anchor}" fill="${line.fill}" font-family="Arial, Helvetica, sans-serif" font-size="${line.size}" font-weight="${line.weight ?? 700}" letter-spacing="${line.spacing ?? -1}">${esc(line.text)}</text>`).join("\n")}
      </g>
    </svg>`);
}

async function render({ name, width, height, position = "centre", overlaySvg }) {
  const background = await sharp(source)
    .resize(width, height, { fit: "cover", position })
    .modulate({ brightness: 0.9, saturation: 0.92 })
    .png()
    .toBuffer();

  await sharp(background)
    .composite([{ input: overlaySvg, left: 0, top: 0 }])
    .png({ compressionLevel: 9, palette: true, quality: 95 })
    .toFile(path.join(outDir, name));
}

await render({
  name: "scout-youtube-banner-2560x1440.png",
  width: 2560,
  height: 1440,
  overlaySvg: overlay({
    width: 2560,
    height: 1440,
    logoX: 1040,
    logoY: 558,
    logoWidth: 480,
    align: "middle",
    content: [
      { x: 1280, y: 750, text: "We apply to jobs for you.", fill: "#FFFFFF", size: 112, weight: 800, anchor: "middle", spacing: -4 },
      { x: 1280, y: 850, text: "Human Assistant or AI Assistant.", fill: "#9DDE47", size: 58, weight: 700, anchor: "middle", spacing: -1 },
      { x: 1280, y: 928, text: "Tailored applications. Visible tracking. Your time back.", fill: "#DDE8D8", size: 34, weight: 500, anchor: "middle", spacing: 0 },
    ],
  }),
});

await render({
  name: "scout-linkedin-company-banner-4200x700.png",
  width: 4200,
  height: 700,
  overlaySvg: overlay({
    width: 4200,
    height: 700,
    logoX: 1430,
    logoY: 105,
    logoWidth: 430,
    content: [
      { x: 1430, y: 390, text: "We apply to jobs for you.", fill: "#FFFFFF", size: 118, weight: 800, spacing: -4 },
      { x: 1430, y: 500, text: "Human Assistant or AI Assistant.", fill: "#9DDE47", size: 64, weight: 700, spacing: -1 },
      { x: 1430, y: 590, text: "getscout.app", fill: "#DDE8D8", size: 38, weight: 700, spacing: 0 },
    ],
  }),
});

await render({
  name: "scout-x-twitter-header-1500x500.png",
  width: 1500,
  height: 500,
  overlaySvg: overlay({
    width: 1500,
    height: 500,
    logoX: 570,
    logoY: 72,
    logoWidth: 300,
    align: "middle",
    content: [
      { x: 910, y: 260, text: "We apply to jobs for you.", fill: "#FFFFFF", size: 67, weight: 800, anchor: "middle", spacing: -2.5 },
      { x: 910, y: 330, text: "Human Assistant or AI Assistant.", fill: "#9DDE47", size: 36, weight: 700, anchor: "middle", spacing: -.5 },
      { x: 910, y: 390, text: "getscout.app", fill: "#DDE8D8", size: 24, weight: 700, anchor: "middle", spacing: 0 },
    ],
  }),
});

console.log(`Created Scout social banners in ${outDir}`);
