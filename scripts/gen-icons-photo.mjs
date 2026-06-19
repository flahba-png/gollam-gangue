// Génère toutes les icônes de l'app à partir d'une image (PNG/JPEG, ou HEIC
// déjà converti en PNG). Détoure le fond, recentre le logo avec une marge,
// puis sort les tailles PWA + favicon + apple-touch sur fond blanc.
//
// HEIC : le décodeur natif échoue sur certaines photos iPhone (mosaïque).
// Convertir d'abord en PNG :
//   npm i heic-convert --no-save
//   node -e "import('heic-convert').then(async m=>{const fs=await import('fs/promises');\
//     const b=await fs.readFile('photo.heic');\
//     await fs.writeFile('public/_logo_source.png', Buffer.from(await m.default({buffer:b,format:'PNG'})))})"
//
// Usage : node scripts/gen-icons-photo.mjs public/_logo_source.png
import sharp from "sharp";
import { fileURLToPath } from "url";
import path from "path";

const src = process.argv[2] || "public/_logo_source.png";
const pub = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const FOND = "#ffffff";

// Détoure le fond, recentre dans un carré avec ~14% de marge
const trimmed = await sharp(src).trim({ threshold: 20 }).toBuffer();
const inner = await sharp(trimmed).resize(740, 740, { fit: "contain", background: FOND }).toBuffer();
const master = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: FOND } })
  .composite([{ input: inner, gravity: "centre" }]).png().toBuffer();

const carre = async (taille, nom) => {
  await sharp(master).resize(taille, taille, { fit: "cover" }).png().toFile(path.join(pub, nom));
  console.log("✓", nom);
};

await carre(192, "icon-192.png");
await carre(512, "icon-512.png");
await carre(512, "icon-maskable-512.png"); // marge déjà incluse = zone de sécurité OK
await carre(180, "apple-touch-icon.png");
await carre(48, "favicon.png");
console.log("Icônes générées dans public/");
