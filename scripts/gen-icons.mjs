// Génère les icônes PNG (192, 512, maskable) à partir de public/icon.svg
import sharp from "sharp";
import { readFileSync } from "fs";

const svg = readFileSync(new URL("../public/icon.svg", import.meta.url));

const taches = [
  { nom: "icon-192.png", taille: 192 },
  { nom: "icon-512.png", taille: 512 },
  { nom: "icon-maskable-512.png", taille: 512 },
];

for (const t of taches) {
  await sharp(svg, { density: 384 })
    .resize(t.taille, t.taille)
    .png()
    .toFile(new URL(`../public/${t.nom}`, import.meta.url).pathname.replace(/^\//, ""));
  console.log("✓", t.nom);
}
console.log("Icônes générées dans public/");
