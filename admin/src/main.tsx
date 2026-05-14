import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Ipynb } from "@jupyter-kit/react";
import {
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Eye,
  Globe2,
  Loader2,
  LogOut,
  Play,
  RefreshCw,
  Save,
  Search,
  Shield,
  XCircle,
} from "lucide-react";
import "./styles.css";

type SessionState = "checking" | "signed-out" | "signed-in";
type AdminTab = "scrapes" | "whitelist";

type DomainRule = {
  id: string;
  type: "domain_rule";
  domain: string;
  allowed: boolean;
  notes?: string;
  updatedAt: string;
};

type ScrapeState = {
  id: string;
  type: "url_state";
  url: string;
  domain: string;
  status: "ready" | "pending" | "failed" | "blocked";
  token?: string;
  error?: string;
  requestedAt: number;
  lastFetchedAt?: number;
  ttlExpiresAt?: number;
  scrapeStartedAt?: number;
  scrapeUpdatedAt?: number;
  manuallyEdited?: boolean;
  log?: ScrapeLogEntry[];
};

type ScrapeLogEntry = {
  at: number;
  step: string;
  message: string;
  data?: Record<string, unknown>;
};

type ScrapeVersion = {
  id: string;
  type: "scrape_version";
  url: string;
  domain: string;
  token: string;
  text: string;
  rawText?: string;
  source: "auto" | "manual";
  sourceUrl?: string;
  contentType?: string;
  extractionMode?: string;
  createdAt: string;
  expiresAt?: string;
};

type Notice = { tone: "info" | "error"; text: string } | null;

const statusIcon = {
  ready: CheckCircle2,
  pending: Loader2,
  failed: XCircle,
  blocked: Shield,
};

const LazyNotebook = React.lazy(async () => {
  const [{ Notebook }, { python }] = await Promise.all([
    import("@jupyter-kit/react"),
    import("@jupyter-kit/core/langs/python"),
  ]);

  return {
    default: function LazyNotebookRenderer({
      filename,
      ipynb,
    }: {
      filename: string;
      ipynb: Ipynb;
    }) {
      return (
        <Notebook
          ipynb={ipynb}
          language="python"
          languages={[python]}
          filename={filename}
        />
      );
    },
  };
});

function App() {
  const [session, setSession] = useState<SessionState>("checking");
  const [password, setPassword] = useState("");
  const [domains, setDomains] = useState<DomainRule[]>([]);
  const [scrapes, setScrapes] = useState<ScrapeState[]>([]);
  const [versions, setVersions] = useState<ScrapeVersion[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [domainInput, setDomainInput] = useState("");
  const [domainAllowed, setDomainAllowed] = useState(true);
  const [urlInput, setUrlInput] = useState("");
  const [manualText, setManualText] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>("scrapes");

  useEffect(() => {
    fetchJson("/admin/api/session")
      .then(() => setSession("signed-in"))
      .catch(() => setSession("signed-out"));
  }, []);

  useEffect(() => {
    if (session !== "signed-in") return;
    refreshAll();
  }, [session]);

  useEffect(() => {
    if (!selectedUrl) {
      setVersions([]);
      setManualText("");
      return;
    }
    loadDetail(selectedUrl);
  }, [selectedUrl]);

  const domainCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const scrape of scrapes) {
      counts.set(scrape.domain, (counts.get(scrape.domain) ?? 0) + 1);
    }
    return counts;
  }, [scrapes]);

  const visibleScrapes = useMemo(() => {
    if (!selectedDomain) return scrapes;
    return scrapes.filter((scrape) => scrape.domain === selectedDomain);
  }, [scrapes, selectedDomain]);

  const selectedScrape = useMemo(
    () => scrapes.find((scrape) => scrape.url === selectedUrl),
    [scrapes, selectedUrl],
  );
  const validVersions = useMemo(
    () =>
      versions.filter(
        (version) =>
          version.type === "scrape_version" &&
          typeof version.text === "string" &&
          typeof version.createdAt !== "undefined",
      ),
    [versions],
  );
  const currentVersion = useMemo(() => {
    if (!selectedScrape?.token) return validVersions[0];
    return (
      validVersions.find((version) => version.token === selectedScrape.token) ??
      validVersions[0]
    );
  }, [selectedScrape?.token, validVersions]);

  useEffect(() => {
    setManualText(currentVersion?.text ?? "");
  }, [selectedUrl, currentVersion?.token]);

  async function refreshAll() {
    setLoading(true);
    setNotice(null);
    try {
      const [domainResponse, scrapeResponse] = await Promise.all([
        fetchJson<{ domains: DomainRule[] }>("/admin/api/domains"),
        fetchJson<{ scrapes: ScrapeState[] }>("/admin/api/scrapes"),
      ]);
      setDomains(domainResponse.domains);
      setScrapes(scrapeResponse.scrapes);
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  }

  async function login(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setNotice(null);
    try {
      await fetchJson("/admin/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      setPassword("");
      setSession("signed-in");
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetchJson("/admin/api/logout", { method: "POST" }).catch(() => null);
    setSession("signed-out");
    setDomains([]);
    setScrapes([]);
    setVersions([]);
    setSelectedDomain(null);
    setSelectedUrl(null);
  }

  async function saveDomain(event: FormEvent) {
    event.preventDefault();
    const domain = domainInput.trim().toLowerCase();
    if (!domain) return;
    setLoading(true);
    setNotice(null);
    try {
      await fetchJson(`/admin/api/domains/${encodeURIComponent(domain)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowed: domainAllowed }),
      });
      setDomainInput("");
      setSelectedDomain(domain);
      setActiveTab("scrapes");
      await refreshAll();
      setNotice({ tone: "info", text: "Domain saved." });
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  }

  async function resolveUrl(event: FormEvent) {
    event.preventDefault();
    const url = urlInput.trim();
    if (!url) return;
    setLoading(true);
    setNotice(null);
    try {
      const { scrape } = await fetchJson<{ scrape: ScrapeState }>(
        "/admin/api/scrapes/resolve",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        },
      );
      setSelectedDomain(scrape.domain);
      setSelectedUrl(scrape.url);
      await refreshAll();
      setNotice({ tone: "info", text: `Scrape ${scrape.status}.` });
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  }

  async function saveManualText(event: FormEvent) {
    event.preventDefault();
    if (!selectedUrl || !manualText.trim()) return;
    setLoading(true);
    setNotice(null);
    try {
      await fetchJson("/admin/api/scrapes/manual-text", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: selectedUrl, text: manualText }),
      });
      await refreshAll();
      await loadDetail(selectedUrl);
      setNotice({ tone: "info", text: "Manual text saved." });
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  }

  async function retrySelectedScrape() {
    if (!selectedUrl) return;
    const url = selectedUrl;
    setLoading(true);
    setNotice(null);
    try {
      const { scrape } = await fetchJson<{ scrape: ScrapeState }>(
        "/admin/api/scrapes/retry",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: selectedUrl }),
        },
      );
      await refreshAll();
      await loadDetail(url);
      void pollScrapeUntilSettled(url);
      setNotice({ tone: "info", text: `Retry ${scrape.status}.` });
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  }

  async function pollScrapeUntilSettled(url: string) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await delay(Math.min(1000 + attempt * 500, 4000));
      try {
        const response = await fetchJson<{ scrapes: ScrapeState[] }>(
          "/admin/api/scrapes",
        );
        setScrapes(response.scrapes);
        const scrape = response.scrapes.find((item) => item.url === url);
        if (!scrape || scrape.status === "pending") continue;
        await loadDetail(url);
        return;
      } catch (error) {
        showError(error);
        return;
      }
    }
  }

  async function loadDetail(url: string) {
    setLoading(true);
    setNotice(null);
    try {
      const response = await fetchJson<{ documents: ScrapeVersion[] }>(
        `/admin/api/scrapes/detail?url=${encodeURIComponent(url)}`,
      );
      const docs = response.documents.filter(
        (doc) =>
          doc.type === "scrape_version" &&
          typeof doc.text === "string" &&
          typeof doc.createdAt !== "undefined",
      );
      setVersions(docs);
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  }

  function selectDomain(domain: string | null) {
    setSelectedDomain(domain);
    setSelectedUrl(null);
    setUrlInput("");
  }

  function viewDomainScrapes(domain: string | null) {
    selectDomain(domain);
    setActiveTab("scrapes");
  }

  function selectScrape(scrape: ScrapeState) {
    setSelectedUrl(scrape.url);
    setUrlInput(scrape.url);
  }

  function showError(error: unknown) {
    setNotice({
      tone: "error",
      text: error instanceof Error ? error.message : "Request failed.",
    });
  }

  if (session === "checking") {
    return (
      <main className="auth-shell">
        <Loader2 className="spin" size={22} aria-hidden="true" />
      </main>
    );
  }

  if (session === "signed-out") {
    return (
      <main className="auth-shell">
        <section className="login-panel" aria-labelledby="login-title">
          <div className="brand-row">
            <Globe2 size={24} aria-hidden="true" />
            <h1 id="login-title">Jupytutor Admin</h1>
          </div>
          <form className="login-form" onSubmit={login}>
            <label htmlFor="password">Admin password</label>
            <div className="input-action">
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button type="submit" disabled={loading || !password}>
                <ClipboardCheck size={17} aria-hidden="true" />
                Sign in
              </button>
            </div>
          </form>
          {notice ? <Notice notice={notice} /> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>{activeTab === "scrapes" ? "Scrapes" : "Whitelist"}</h1>
          <p>{scrapes.length} URLs across {domainCounts.size} domains</p>
        </div>
        <div className="header-actions">
          {notice ? <Notice notice={notice} /> : null}
          <button type="button" onClick={refreshAll} disabled={loading} title="Refresh">
            <RefreshCw className={loading ? "spin" : undefined} size={17} aria-hidden="true" />
            Refresh
          </button>
          <button type="button" onClick={logout} title="Sign out">
            <LogOut size={17} aria-hidden="true" />
            Sign out
          </button>
        </div>
      </header>

      <nav className="tabs" aria-label="Admin sections">
        <button
          type="button"
          className={activeTab === "scrapes" ? "selected" : ""}
          onClick={() => setActiveTab("scrapes")}
        >
          Scrapes
        </button>
        <button
          type="button"
          className={activeTab === "whitelist" ? "selected" : ""}
          onClick={() => setActiveTab("whitelist")}
        >
          Whitelist
        </button>
      </nav>

      {activeTab === "scrapes" ? (
        <section className="workspace scrapes-workspace">
          <aside className="domain-pane" aria-label="Domains">
            <nav className="domain-list">
              <button
                type="button"
                className={!selectedDomain ? "selected" : ""}
                onClick={() => selectDomain(null)}
              >
                <Circle size={14} aria-hidden="true" />
                <span>All domains</span>
                <strong>{scrapes.length}</strong>
              </button>
              {domains.map((domain) => (
                <button
                  type="button"
                  key={domain.domain}
                  className={selectedDomain === domain.domain ? "selected" : ""}
                  onClick={() => selectDomain(domain.domain)}
                >
                  {domain.allowed ? (
                    <CheckCircle2 size={14} aria-hidden="true" />
                  ) : (
                    <XCircle size={14} aria-hidden="true" />
                  )}
                  <span>{domain.domain}</span>
                  <strong>{domainCounts.get(domain.domain) ?? 0}</strong>
                </button>
              ))}
            </nav>
          </aside>

          <section className="url-pane" aria-label="URLs">
            <form className="resolve-form" onSubmit={resolveUrl}>
              <Search size={17} aria-hidden="true" />
              <input
                value={urlInput}
                onChange={(event) => setUrlInput(event.target.value)}
                placeholder="https://..."
              />
              <button type="submit" disabled={loading || !urlInput.trim()}>
                <Play size={16} aria-hidden="true" />
                Resolve
              </button>
            </form>

            <div className="scrape-list">
              {visibleScrapes.map((scrape) => {
                const Status = statusIcon[scrape.status] ?? Circle;
                return (
                  <button
                    type="button"
                    key={scrape.id}
                    className={selectedUrl === scrape.url ? "scrape-row selected" : "scrape-row"}
                    onClick={() => selectScrape(scrape)}
                  >
                    <Status
                      className={scrape.status === "pending" ? "spin" : undefined}
                      size={16}
                      aria-hidden="true"
                    />
                    <span>
                      <strong>{scrape.status}</strong>
                      <small>{scrape.url}</small>
                      {scrape.error ? <em>{scrape.error}</em> : null}
                    </span>
                  </button>
                );
              })}
              {!visibleScrapes.length ? (
                <div className="empty-state">No scrapes for this domain.</div>
              ) : null}
            </div>
          </section>

          <ScrapeDetail
            loading={loading}
            manualText={manualText}
            selectedScrape={selectedScrape}
            currentVersion={currentVersion}
            versions={validVersions}
            onManualTextChange={setManualText}
            onRetry={retrySelectedScrape}
            onSaveManualText={saveManualText}
          />
        </section>
      ) : (
        <section className="whitelist-workspace" aria-label="Whitelist">
          <form className="domain-form" onSubmit={saveDomain}>
            <div className="form-row">
              <label htmlFor="domain">Domain</label>
              <input
                id="domain"
                value={domainInput}
                onChange={(event) => setDomainInput(event.target.value)}
                placeholder="domain.example"
              />
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={domainAllowed}
                onChange={(event) => setDomainAllowed(event.target.checked)}
              />
              <span>Allowed</span>
            </label>
            <button type="submit" disabled={loading || !domainInput.trim()}>
              <Save size={16} aria-hidden="true" />
              Save
            </button>
          </form>

          <nav className="domain-list whitelist-list">
            <button
              type="button"
              className={!selectedDomain ? "selected" : ""}
              onClick={() => viewDomainScrapes(null)}
            >
              <Circle size={14} aria-hidden="true" />
              <span>View all scrapes</span>
              <strong>{scrapes.length}</strong>
            </button>
            {domains.map((domain) => (
              <button
                type="button"
                key={domain.domain}
                className={selectedDomain === domain.domain ? "selected" : ""}
                onClick={() => viewDomainScrapes(domain.domain)}
              >
                {domain.allowed ? (
                  <CheckCircle2 size={14} aria-hidden="true" />
                ) : (
                  <XCircle size={14} aria-hidden="true" />
                )}
                <span>{domain.domain}</span>
                <strong>{domainCounts.get(domain.domain) ?? 0}</strong>
              </button>
            ))}
          </nav>
        </section>
      )}
    </main>
  );
}

function ScrapeDetail({
  loading,
  manualText,
  selectedScrape,
  currentVersion,
  versions,
  onManualTextChange,
  onRetry,
  onSaveManualText,
}: {
  loading: boolean;
  manualText: string;
  selectedScrape?: ScrapeState;
  currentVersion?: ScrapeVersion;
  versions: ScrapeVersion[];
  onManualTextChange: (text: string) => void;
  onRetry: () => void;
  onSaveManualText: (event: FormEvent) => void;
}) {
  if (!selectedScrape) {
    return (
      <section className="detail-pane" aria-label="Scrape detail">
        <div className="empty-state detail-empty">Select a scrape.</div>
      </section>
    );
  }

  return (
    <section className="detail-pane" aria-label="Scrape detail">
      <div className="detail-heading">
        <div>
          <h2>{selectedScrape.domain}</h2>
          <p>{selectedScrape.url}</p>
        </div>
        <div className="status-actions">
          <span className={`status-chip ${selectedScrape.status}`}>
            {selectedScrape.status}
          </span>
          <button type="button" onClick={onRetry} disabled={loading}>
            <RefreshCw size={16} aria-hidden="true" />
            {selectedScrape.status === "failed" ? "Retry" : "Rescrape"}
          </button>
        </div>
      </div>

      {selectedScrape.error ? (
        <div className="failure-message">
          <strong>Failure</strong>
          <p>{selectedScrape.error}</p>
        </div>
      ) : null}

      <dl className="metadata">
        <div>
          <dt>Updated</dt>
          <dd>
            {selectedScrape.scrapeUpdatedAt
              ? formatDate(selectedScrape.scrapeUpdatedAt)
              : "Unknown"}
          </dd>
        </div>
        <div>
          <dt>Expires</dt>
          <dd>
            {selectedScrape.ttlExpiresAt
              ? formatDate(selectedScrape.ttlExpiresAt)
              : "Never"}
          </dd>
        </div>
        <div>
          <dt>Token</dt>
          <dd>{selectedScrape.token ?? "None"}</dd>
        </div>
      </dl>

      <details className="scrape-log" aria-label="Scrape log">
        <summary>
          <h3>Debug Log</h3>
          <span>{selectedScrape.log?.length ?? 0} entries</span>
        </summary>
        {selectedScrape.log?.length ? (
          <ol>
            {selectedScrape.log.map((entry, index) => (
              <li key={`${entry.at}-${entry.step}-${index}`}>
                <div>
                  <strong>{entry.step}</strong>
                  <time>{formatDate(entry.at)}</time>
                </div>
                <p>{entry.message}</p>
                {entry.data ? (
                  <pre>{JSON.stringify(entry.data, null, 2)}</pre>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <div className="empty-state">No scrape log stored for this URL.</div>
        )}
      </details>

      {currentVersion ? <CurrentContent version={currentVersion} /> : null}

      <form className="manual-editor" onSubmit={onSaveManualText}>
        <div className="editor-header">
          <div>
            <h3>Replacement Text</h3>
            <p>
              Starts from the current content above. Saving creates a manual
              version with infinite TTL.
            </p>
          </div>
          <div className="editor-actions">
            <a
              className="button-link"
              href={selectedScrape.url}
              target="_blank"
              rel="noreferrer"
            >
              <Globe2 size={16} aria-hidden="true" />
              Open URL
            </a>
            <button type="submit" disabled={loading || !manualText.trim()}>
              <Save size={16} aria-hidden="true" />
              Save
            </button>
          </div>
        </div>
        <textarea
          value={manualText}
          onChange={(event) => onManualTextChange(event.target.value)}
        />
      </form>

      <div className="version-list">
        <h3>Versions</h3>
        {versions.map((version) => (
          <article key={version.id} className="version-row">
            <div>
              <strong>{version.source}</strong>
              <span>{formatDate(version.createdAt)}</span>
            </div>
            <button
              type="button"
              onClick={() => onManualTextChange(version.text)}
              title="View version text"
              disabled={!version.text}
            >
              <Eye size={16} aria-hidden="true" />
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function CurrentContent({ version }: { version: ScrapeVersion }) {
  const mode = inferContentMode(version);
  const [view, setView] = useState<"rendered" | "raw">("rendered");
  const rawOutput = version.rawText ?? version.text;

  return (
    <section className="current-content">
      <div className="section-heading">
        <div>
          <h3>Current Content</h3>
          <p>{formatProvenance(version)}</p>
        </div>
        <span>{mode}</span>
      </div>
      <div className="content-tabs" aria-label="Extracted content view">
        <button
          type="button"
          className={view === "rendered" ? "selected" : ""}
          onClick={() => setView("rendered")}
        >
          Rendered
        </button>
        <button
          type="button"
          className={view === "raw" ? "selected" : ""}
          onClick={() => setView("raw")}
        >
          Raw
        </button>
      </div>
      {view === "raw" ? (
        <pre>{rawOutput}</pre>
      ) : mode === "html" ? (
        <iframe
          title="Extracted HTML"
          sandbox=""
          srcDoc={rawOutput}
        />
      ) : mode === "ipynb" ? (
        <NotebookRenderer
          rawText={version.rawText}
          fallbackText={version.text}
          filename={version.sourceUrl ?? version.url}
        />
      ) : mode === "markdown" ? (
        <MarkdownRenderer text={rawOutput} />
      ) : (
        <pre>{version.text}</pre>
      )}
    </section>
  );
}

function NotebookRenderer({
  rawText,
  fallbackText,
  filename,
}: {
  rawText?: string;
  fallbackText: string;
  filename: string;
}) {
  const notebook = parseNotebook(rawText);
  if (!notebook) return <pre>{fallbackText}</pre>;

  return (
    <React.Suspense fallback={<div className="empty-state">Loading notebook renderer.</div>}>
      <LazyNotebook ipynb={notebook} filename={filename} />
    </React.Suspense>
  );
}

function MarkdownRenderer({ text }: { text: string }) {
  return (
    <div className="markdown-renderer">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

function Notice({ notice }: { notice: Exclude<Notice, null> }) {
  return <p className={`notice ${notice.tone}`}>{notice.text}</p>;
}

async function fetchJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Keep the status-derived message.
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDate(value: string | number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function inferContentMode(version: ScrapeVersion): string {
  if (version.extractionMode?.includes("ipynb")) return "ipynb";
  if (version.extractionMode?.includes("html")) return "html";
  if (version.extractionMode?.includes("plain")) return inferPlainMode(version);
  if (version.sourceUrl?.endsWith(".ipynb")) return "ipynb";
  if (version.sourceUrl?.endsWith(".md")) return "markdown";
  if (version.contentType?.includes("html")) return "html";
  if (version.contentType?.includes("json") && looksLikeNotebook(version.rawText)) {
    return "ipynb";
  }
  if (looksLikeHtml(version.rawText)) return "html";
  if (looksLikeNotebook(version.rawText)) return "ipynb";
  return inferPlainMode(version);
}

function formatProvenance(version: ScrapeVersion): string {
  const origin =
    version.source === "manual"
      ? "Manual replacement"
      : "Automatic scrape";
  const source = version.sourceUrl ?? version.url;
  return `${origin} from ${source}`;
}

function inferPlainMode(version: ScrapeVersion): string {
  if (version.sourceUrl?.endsWith(".md")) return "markdown";
  if ((version.rawText ?? version.text).includes("\n# ")) return "markdown";
  return "text";
}

function looksLikeHtml(text?: string): boolean {
  return Boolean(text?.trim().startsWith("<"));
}

function looksLikeNotebook(text?: string): boolean {
  if (!text) return false;
  try {
    const parsed = JSON.parse(text) as { cells?: unknown };
    return Array.isArray(parsed.cells);
  } catch {
    return false;
  }
}

function parseNotebook(rawText?: string): Ipynb | null {
  if (!rawText) return null;
  try {
    return JSON.parse(rawText) as Ipynb;
  } catch {
    return null;
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/admin/sw.js").catch(() => null);
  });
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
