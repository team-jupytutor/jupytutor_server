import express from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { resolveScrapes } from "../scraping/scrape-service.js";

const scrapesRouter = express.Router();

const resolveScrapesRequestSchema = z.object({
  urls: z.array(z.string().url()).max(100),
});

scrapesRouter.post(
  "/scrapes/resolve",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = resolveScrapesRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid scrape resolve request.",
        details: parsed.error.flatten(),
      });
      return;
    }

    try {
      res.json(await resolveScrapes(parsed.data.urls));
    } catch (error) {
      const err = error as Error;
      console.error("Error resolving scrapes:", err);
      res.status(500).json({ error: err.message || "Internal server error" });
    }
  },
);

export default scrapesRouter;

