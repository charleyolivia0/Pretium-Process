import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

const root = process.cwd();
const sourceRoot = path.join(root, "tools", "Shijima-Qt", "DefaultMascot");
const targetRoot = path.join(root, "tools", "Shijima-Qt", "MayaGirl.mascot");
const sourceImgDir = path.join(sourceRoot, "img");
const targetImgDir = path.join(targetRoot, "img");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyTextFiles() {
  ensureDir(targetRoot);
  fs.copyFileSync(path.join(sourceRoot, "actions.xml"), path.join(targetRoot, "actions.xml"));
  fs.copyFileSync(path.join(sourceRoot, "behaviors.xml"), path.join(targetRoot, "behaviors.xml"));
}

function clamp(v) {
  return Math.max(0, Math.min(255, v));
}

function recolorPixel(r, g, b, a) {
  if (a === 0) return [r, g, b, a];

  // Skin-like tones -> lighter warm skin.
  const skinLike = r > 150 && g > 95 && b > 70 && r > g && g > b;
  if (skinLike) {
    return [
      clamp(r * 1.06 + 10),
      clamp(g * 1.02 + 8),
      clamp(b * 0.96 + 4),
      a,
    ];
  }

  // Very dark neutral-ish pixels -> soft brown for hair accents.
  const dark = r < 85 && g < 85 && b < 85;
  if (dark) {
    const luma = (r + g + b) / 3;
    const brown = Math.max(30, Math.min(110, luma + 25));
    return [
      clamp(brown * 1.25),
      clamp(brown * 0.86),
      clamp(brown * 0.66),
      a,
    ];
  }

  return [r, g, b, a];
}

function recolorPngFile(srcFile, dstFile) {
  const buffer = fs.readFileSync(srcFile);
  const png = PNG.sync.read(buffer);
  const data = png.data;

  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    const [nr, ng, nb, na] = recolorPixel(r, g, b, a);
    data[i] = nr;
    data[i + 1] = ng;
    data[i + 2] = nb;
    data[i + 3] = na;
  }

  fs.writeFileSync(dstFile, PNG.sync.write(png));
}

function buildMascot() {
  if (!fs.existsSync(sourceRoot)) {
    throw new Error(`DefaultMascot not found: ${sourceRoot}`);
  }
  ensureDir(targetImgDir);
  copyTextFiles();

  const files = fs.readdirSync(sourceImgDir).filter((f) => f.toLowerCase().endsWith(".png"));
  for (const file of files) {
    recolorPngFile(path.join(sourceImgDir, file), path.join(targetImgDir, file));
  }
}

buildMascot();
console.log(`Created mascot at: ${targetRoot}`);
