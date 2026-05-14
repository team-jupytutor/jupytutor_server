import crypto from "crypto";
import express from "express";
import fs from "fs";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { fileURLToPath } from "url";
import path from "path";
import { scrapeStore } from "../scraping/scrape-store.js";
import {
  applyManualEdit,
  retryScrape,
  resolveSingleScrape,
  upsertDomainRule,
} from "../scraping/scrape-service.js";
import { getDomainForUrl } from "../scraping/url.js";

const adminRouter = express.Router();
const SESSION_COOKIE = "jupytutor_admin_session";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_SESSION_SECRET =
  process.env.ADMIN_SESSION_SECRET ?? process.env.HMAC_KEY ?? "dev-secret";
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distAdminStaticPath = path.resolve(__dirname, "../admin");
const builtAdminStaticPath = path.resolve(process.cwd(), "dist/admin");
const adminStaticPath = fs.existsSync(distAdminStaticPath)
  ? distAdminStaticPath
  : builtAdminStaticPath;

adminRouter.use("/admin", express.static(adminStaticPath));

adminRouter.post("/admin/api/login", (req: Request, res: Response) => {
  const password = String(req.body?.password ?? "");
  if (!ADMIN_PASSWORD || password !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "Invalid admin password." });
    return;
  }

  const expiresAt = Date.now() + SESSION_MAX_AGE_MS;
  const payload = `${expiresAt}`;
  const signature = sign(payload);
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${payload}.${signature}; HttpOnly; SameSite=Lax; Path=/admin; Max-Age=${Math.floor(
      SESSION_MAX_AGE_MS / 1000,
    )}`,
  );
  res.json({ ok: true });
});

adminRouter.post("/admin/api/logout", (_req: Request, res: Response) => {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/admin; Max-Age=0`,
  );
  res.json({ ok: true });
});

adminRouter.use("/admin/api", requireAdmin);

adminRouter.get("/admin/api/session", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

adminRouter.get("/admin/api/domains", async (_req: Request, res: Response) => {
  res.json({ domains: await scrapeStore.listDomainRules() });
});

adminRouter.put("/admin/api/domains/:domain", async (req, res) => {
  const parsed = z
    .object({ allowed: z.boolean(), notes: z.string().optional() })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid domain rule." });
    return;
  }

  res.json({
    domain: await upsertDomainRule(
      req.params.domain,
      parsed.data.allowed,
      parsed.data.notes,
    ),
  });
});

adminRouter.get("/admin/api/scrapes", async (req: Request, res: Response) => {
  const domain =
    typeof req.query.domain === "string" ? req.query.domain : undefined;
  res.json({ scrapes: await scrapeStore.listUrlStates(domain) });
});

adminRouter.get("/admin/api/scrapes/detail", async (req, res) => {
  const url = String(req.query.url ?? "");
  const domain = getDomainForUrl(url);
  if (!domain) {
    res.status(400).json({ error: "Invalid URL." });
    return;
  }

  res.json({ documents: await scrapeStore.getDocumentsForUrl(url, domain) });
});

adminRouter.post("/admin/api/scrapes/resolve", async (req, res) => {
  const parsed = z.object({ url: z.string().url() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid URL." });
    return;
  }

  res.json({ scrape: await resolveSingleScrape(parsed.data.url) });
});

adminRouter.post("/admin/api/scrapes/retry", async (req, res) => {
  const parsed = z.object({ url: z.string().url() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid URL." });
    return;
  }

  res.json({ scrape: await retryScrape(parsed.data.url) });
});

adminRouter.put("/admin/api/scrapes/manual-text", async (req, res) => {
  const parsed = z
    .object({ url: z.string().url(), text: z.string().min(1) })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid manual scrape edit." });
    return;
  }

  res.json({ scrape: await applyManualEdit(parsed.data.url, parsed.data.text) });
});

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (isValidSession(req.headers.cookie ?? "")) {
    next();
    return;
  }

  res.status(401).json({ error: "Admin login required." });
}

function isValidSession(cookieHeader: string): boolean {
  const cookies = Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key, value]) => key && value),
  );
  const raw = cookies[SESSION_COOKIE];
  if (!raw) return false;

  const [expiresAt, signature] = raw.split(".");
  if (!expiresAt || !signature) return false;
  if (Number(expiresAt) < Date.now()) return false;
  const expectedSignature = sign(expiresAt);
  if (signature.length !== expectedSignature.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature),
  );
}

function sign(value: string): string {
  return crypto
    .createHmac("sha256", ADMIN_SESSION_SECRET)
    .update(value)
    .digest("hex");
}

export default adminRouter;
