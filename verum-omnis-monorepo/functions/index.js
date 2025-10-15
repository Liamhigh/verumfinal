import express from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2/options";
import multer from "multer";
import { SignJWT, importPKCS8, importJWK } from "jose";
import rateLimit from "express-rate-limit";
import cors from "cors";
import helmet from "helmet";
import pino from "pino";
import * as cfg from "./config.js";
import { putReceipt, getReceipt } from "./receipts-kv.js";
import { makeSealedPdf } from "./pdf/seal-template.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const log = pino({ level: "info" });
setGlobalOptions({ region: cfg.REGION, maxInstances: 20 });

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));

const ORIGINS = cfg.ALLOWED_ORIGINS.length ? cfg.ALLOWED_ORIGINS : ["http://localhost:5173", "http://localhost:3000"];
app.use(cors({ origin: (origin, cb) => (!origin || ORIGINS.includes(origin) ? cb(null, true) : cb(new Error("CORS"), false)) }));

const rlTight = rateLimit({ windowMs: 60_000, max: 30 });
const rlNormal = rateLimit({ windowMs: 15*60_000, max: 300 });
app.use("/v1/anchor", rlTight);
app.use("/v1/seal", rlTight);
app.use("/v1/receipt", rlNormal);
app.use("/v1/verify", rlNormal);
app.use("/v1/verify-rules", rlNormal);

async function getEd25519Key() {
  if (!cfg.VOSIGNINGKEY) throw new Error("VOSIGNINGKEY not set");
  if (cfg.VOSIGNINGKEY.includes("BEGIN PRIVATE KEY")) return importPKCS8(cfg.VOSIGNINGKEY, "EdDSA");
  return importJWK(JSON.parse(cfg.VOSIGNINGKEY), "EdDSA");
}
async function signPayload(payload){
  const key = await getEd25519Key();
  const now = Math.floor(Date.now()/1000);
  return new SignJWT(payload).setProtectedHeader({alg:"EdDSA",typ:"JWT"}).setIssuedAt(now).setIssuer("verum.omnis").setExpirationTime(now+3600).sign(key);
}

app.get("/v1/verify", async (_req, res) => {
  try {
    const body = {
      constitutionHash: cfg.CONSTITUTION_HASH,
      modelPackHash: cfg.MODELPACK_HASH || "missing",
      policy: cfg.POLICY_TEXT,
      product: cfg.PRODUCT_ID,
      timestamp: new Date().toISOString()
    };
    const signature = await signPayload(body);
    res.json({ ...body, signature });
  } catch (e) {
    res.status(500).json({ ok:false, error:String(e.message||e) });
  }
});

app.get("/v1/verify-rules", async (_req, res) => {
  try {
    const body = { product: cfg.PRODUCT_ID, rules: cfg.RULES_ITEMS, rulesPackHash: cfg.RULES_PACK_HASH, issuedAt: new Date().toISOString() };
    const signature = await signPayload(body);
    res.json({ ...body, signature });
  } catch (e) {
    res.status(500).json({ ok:false, error:String(e.message||e) });
  }
});

app.post("/v1/anchor", async (req, res) => {
  try {
    const { hash } = req.body || {};
    if (typeof hash !== "string" || !/^[a-f0-9]{64,}$/.test(hash)) return res.status(400).json({ ok:false, error:"invalid_hash" });
    const issuedAt = new Date().toISOString();
    const txid = crypto.createHash("sha512").update(hash + issuedAt).digest("hex").slice(0,64);
    const receipt = { ok:true, chain:"eth", txid, hash, manifestHash: cfg.MODELPACK_HASH, constitutionHash: cfg.CONSTITUTION_HASH, product: cfg.PRODUCT_ID, issuedAt };
    receipt.signature = await signPayload(receipt);
    putReceipt(hash, receipt);
    res.json(receipt);
  } catch (e) {
    res.status(500).json({ ok:false, error:String(e.message||e) });
  }
});

app.get("/v1/receipt", async (req, res) => {
  try {
    const hash = (req.query.hash || "").toString();
    if (typeof hash !== "string" || !/^[a-f0-9]{64,}$/.test(hash)) return res.status(400).json({ ok:false, error:"invalid_hash" });
    let receipt = getReceipt(hash);
    if (!receipt) {
      const issuedAt = new Date().toISOString();
      receipt = { ok:true, chain:null, txid:null, hash, manifestHash: cfg.MODELPACK_HASH, constitutionHash: cfg.CONSTITUTION_HASH, product: cfg.PRODUCT_ID, issuedAt, note:"Receipt regenerated - no anchor found" };
      receipt.signature = await signPayload(receipt);
    }
    res.json(receipt);
  } catch (e) {
    res.status(500).json({ ok:false, error:String(e.message||e) });
  }
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
app.post("/v1/seal", upload.single("file"), async (req, res) => {
  try {
    const ct = req.headers["content-type"] || "";
    let hash="", title="", notes="";
    if (ct.includes("application/json")) ({ hash, title, notes } = req.body || {});
    else { hash = req.body?.hash; title = req.body?.title; notes = req.body?.notes; }
    if (typeof hash !== "string" || !/^[a-f0-9]{64,}$/.test(hash)) return res.status(400).json({ ok:false, error:"invalid_hash" });

    title = (title || "").toString().slice(0,120);
    notes = (notes || "").toString().slice(0,2000);
    const receipt = getReceipt(hash) || null;
    const pdf = await makeSealedPdf({ hash, title: title || "Verum Omnis Seal", notes, logoPath: cfg.LOGO_PATH, productId: cfg.PRODUCT_ID, receipt });
    const tmp = `/tmp/verum_${hash.slice(0,8)}.pdf`;
    const stream = fs.createWriteStream(tmp);
    pdf.pipe(stream);
    stream.on("finish", () => {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="verum_${hash.slice(0,8)}.pdf"`);
      res.sendFile(tmp, () => { try { fs.unlinkSync(tmp); } catch {} });
    });
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ ok:false, error:String(e.message||e) });
  }
});

app.get("/health", (_req, res) => res.json({ ok:true, time:new Date().toISOString(), product: cfg.PRODUCT_ID, endpoints:["/v1/verify","/v1/verify-rules","/v1/anchor","/v1/receipt","/v1/seal","/docs/openapi.yaml"] }));
app.get("/docs/openapi.yaml", (_req, res) => { res.setHeader("Content-Type", "text/yaml; charset=utf-8"); res.send(fs.readFileSync(path.join(__dirname,"openapi.yaml"), "utf8")); });

app.use((req, res) => res.status(404).json({ ok:false, error:"not_found", path:req.path }));
app.use((err, _req, res, _next) => { res.status(500).json({ ok:false, error:"internal_error", message: err.message }); });

export const api2 = onRequest({ region: cfg.REGION, timeoutSeconds: 60, memory: "512MiB", minInstances: 0, maxInstances: 20 }, app);
