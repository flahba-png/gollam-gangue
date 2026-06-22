// Intègre le logo sombre dans le splash de index.html en data-URI base64,
// pour qu'il s'affiche instantanément au tout premier chargement (sans requête réseau).
import fs from "fs";

const b64 = fs.readFileSync("public/logo-gollam-dark.png").toString("base64");
const dataUri = `data:image/png;base64,${b64}`;
let html = fs.readFileSync("index.html", "utf8");

// Remplace UNIQUEMENT le src du logo dans le splash (chemin direct ou ancien data-uri)
html = html.replace(/(<img id="splashlogo"[^>]*src=")[^"]*(")/, `$1${dataUri}$2`)
           .replace(/(<img alt="Gollam" style="width:210px;max-width:62%" src=")[^"]*(")/, `$1${dataUri}$2`)
           .replace(/src="\/logo-gollam-dark\.png"/, `src="${dataUri}"`);

fs.writeFileSync("index.html", html);
console.log(`Splash inline OK (${Math.round(b64.length / 1024)} Ko base64)`);
