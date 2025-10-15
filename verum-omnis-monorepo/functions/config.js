import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const REGION = process.env.FUNCTION_REGION || "us-central1";
export const VOSIGNINGKEY = process.env.VOSIGNINGKEY || "";
export const OPENAIAPIKEY = process.env.OPENAIAPIKEY || "";
export const ANTHROPICAPIKEY = process.env.ANTHROPICAPIKEY || "";
export const DEEPSEEKAPIKEY = process.env.DEEPSEEKAPIKEY || "";
export const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",").map(s => s.trim()).filter(Boolean);

const assetsDir = path.join(__dirname, "assets");
const constitutionPath = path.join(assetsDir, "constitution.pdf");
const modelPackPath = path.join(assetsDir, "model_pack.json");
export const LOGO_PATH = path.join(assetsDir, "vo_logo.png");

export function sha512File(p) {
  const buf = fs.readFileSync(p);
  return crypto.createHash("sha512").update(buf).digest("hex");
}
export function sha512Hex(data) {
  return crypto.createHash("sha512").update(data).digest("hex");
}

export const CONSTITUTION_HASH = fs.existsSync(constitutionPath) ? sha512File(constitutionPath) : "missing";
export const MODELPACK_HASH = fs.existsSync(modelPackPath) ? sha512File(modelPackPath) : "missing";
export const PRODUCT_ID = "VO-Web32";
export const POLICY_TEXT = "Free for private citizens. Institutions: 20% of recovered fraud or per-case licensing as agreed.";

const RULES_DIR = path.join(assetsDir, "rules");
function listRuleFiles() {
  if (!fs.existsSync(RULES_DIR)) return [];
  return fs.readdirSync(RULES_DIR)
    .filter(f => fs.statSync(path.join(RULES_DIR, f)).isFile())
    .map(name => {
      const fp = path.join(RULES_DIR, name);
      return { name, size: fs.statSync(fp).size, sha512: sha512File(fp) };
    })
    .sort((a,b) => a.name.localeCompare(b.name));
}
function rulesPackHash(items) {
  return sha512Hex(items.map(i => i.sha512).join(""));
}
export const RULES_ITEMS = listRuleFiles();
export const RULES_PACK_HASH = rulesPackHash(RULES_ITEMS);
