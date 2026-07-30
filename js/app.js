import { DOC_CONFIG } from "./config.js?v=20260730c"
import { getAll, getPageBySlug, getProjectBySlug, getSpacePages, searchDocs } from "./api.js?v=20260730c"
import { extractHeadings, renderMarkdown } from "./renderer.js?v=20260730c"

const state = {
  project: null,
  spaces: [],
  pages: [],
  counts: { spaces: 0, pages: 0 },
  currentPage: null,
  currentSpace: null,
  searchQuery: "",
  sidebarOpen: false,
}

const FEATURED_SLUGS = [
  "guide-deploy-introduction",
  "authentication-api-tokens",
  "overview-and-concepts",
  "guide-deploy-vercel",
]

const HOME_TOC = [
  { label: "Hero", target: "overview" },
  { label: "Quickstart", target: "quickstart" },
  { label: "Integration", target: "integration" },
  { label: "Paths", target: "paths" },
  { label: "Updates", target: "updates" },
  { label: "FAQ", target: "faq" },
]

const FAQ_ITEMS = [
  {
    question: "How is usage billed?",
    answer:
      "We operate on a credit-based system with usage tracked by tier and context length. Plans can be topped up manually or replenished automatically.",
  },
  {
    question: "Support for private clusters?",
    answer:
      "Yes. Enterprise customers can deploy into isolated environments with private routing, dedicated capacity, and restricted access controls.",
  },
  {
    question: "Rate limiting policy?",
    answer:
      "The platform enforces per-key and per-route limits. Burst behavior is configurable, and higher plans unlock larger concurrency ceilings.",
  },
]

const CODE_SNIPPET = `curl -X GET "https://integrations-api.zodev.live/api/docs/v1/public/all?projectId=3" \\
  -H "x-api-key: <DOCS_TOKEN>" \\
  -H "Origin: https://docs.zodev.live"`

const $ = (selector, root = document) => root.querySelector(selector)
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector))

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function codeToHtml(code) {
  return escapeHtml(code)
    .replace(/(".*?")/g, '<span class="cy">$1</span>')
    .replace(/\b(import|const|await|async|return|class|def|print|method|body|headers|model|messages|role|content|fetch|requests)\b/g, '<span class="kw">$1</span>')
    .replace(/(\b\d+\b)/g, '<span class="am">$1</span>')
    .replace(/(\/\/.*?$|#.*?$)/gm, '<span class="mt">$1</span>')
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim()
}

function formatDate(dateValue) {
  if (!dateValue) return "—"
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date)
}

function estimateReadTime(markdown) {
  const words = normalizeText(markdown).split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 180))
}

function getRoute() {
  const hash = location.hash.replace(/^#/, "")
  if (!hash || hash === "/") return { type: "home" }

  const [path, queryString = ""] = hash.split("?")
  const parts = path.split("/").filter(Boolean)

  if (parts[0] === "space" && parts[1]) {
    return { type: "space", slug: decodeURIComponent(parts[1]) }
  }

  if (parts[0] === "page" && parts[1]) {
    return { type: "page", slug: decodeURIComponent(parts[1]) }
  }

  if (parts[0] === "search") {
    const params = new URLSearchParams(queryString)
    return { type: "search", query: params.get("q") || "" }
  }

  return { type: "home" }
}

function navigate(hash) {
  if (location.hash === hash) {
    handleRoute()
    return
  }
  location.hash = hash
}

function pageUrl(slug) {
  return `#/page/${encodeURIComponent(slug)}`
}

function spaceUrl(slug) {
  return `#/space/${encodeURIComponent(slug)}`
}

function searchUrl(query) {
  return `#/search?q=${encodeURIComponent(query)}`
}

function getPage(slug) {
  return state.pages.find((page) => page.slug === slug) || null
}

function getSpaceBySlug(slug) {
  return state.spaces.find((space) => space.slug === slug) || null
}

function getSpaceById(spaceId) {
  return state.spaces.find((space) => Number(space.id) === Number(spaceId)) || null
}

function getPagesForSpace(spaceId) {
  return state.pages.filter((page) => Number(page.spaceId) === Number(spaceId))
}

function getLatestPages(limit = 4) {
  return [...state.pages]
    .sort((a, b) => {
      const left = new Date(b.updatedAt || b.publishedAt || 0).getTime()
      const right = new Date(a.updatedAt || a.publishedAt || 0).getTime()
      return left - right
    })
    .slice(0, limit)
}

function getFeaturedPages() {
  return FEATURED_SLUGS.map((slug) => getPage(slug)).filter(Boolean)
}

function setupSearchInput(input) {
  if (!input || input.dataset.bound === "true") return
  input.dataset.bound = "true"

  let timer
  input.addEventListener("input", (event) => {
    clearTimeout(timer)
    const value = event.target.value.trim()
    timer = window.setTimeout(() => {
      if (value.length >= 2) {
        state.searchQuery = value
        navigate(searchUrl(value))
      }
    }, 350)
  })

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      clearTimeout(timer)
      const value = event.target.value.trim()
      if (value.length >= 1) {
        state.searchQuery = value
        navigate(searchUrl(value))
      }
    }

    if (event.key === "Escape") {
      event.target.blur()
    }
  })
}

function setupSearchControls() {
  $$("input[data-search-input]").forEach(setupSearchInput)
}

function focusSearch() {
  const input = $("#hero-search") || $("#search-input")
  if (input) {
    input.focus()
    input.select?.()
  }
}

function openSidebar() {
  state.sidebarOpen = true
  document.body.classList.add("sidebar-open")
  $("#sidebar")?.classList.add("open")
  $("#drawer-backdrop")?.classList.add("visible")
}

function closeSidebar() {
  state.sidebarOpen = false
  document.body.classList.remove("sidebar-open")
  $("#sidebar")?.classList.remove("open")
  $("#drawer-backdrop")?.classList.remove("visible")
}

function setupMobileSidebar() {
  const toggle = $("#sidebar-toggle")
  const backdrop = $("#drawer-backdrop")
  if (toggle && !toggle.dataset.bound) {
    toggle.dataset.bound = "true"
    toggle.addEventListener("click", () => {
      if (state.sidebarOpen) closeSidebar()
      else openSidebar()
    })
  }

  if (backdrop && !backdrop.dataset.bound) {
    backdrop.dataset.bound = "true"
    backdrop.addEventListener("click", closeSidebar)
  }

  document.addEventListener("click", (event) => {
    const target = event.target.closest?.("[data-close-sidebar]")
    if (target) closeSidebar()
  })
}

function setupKeyboardShortcuts() {
  document.addEventListener("keydown", (event) => {
    const isSearchShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k"
    if (isSearchShortcut) {
      event.preventDefault()
      focusSearch()
    }

    if (event.key === "Escape") {
      closeSidebar()
    }
  })
}

function setupCopyButtons() {
  document.querySelectorAll("[data-copy-current-code]").forEach((button) => {
    if (button.dataset.bound === "true") return
    button.dataset.bound = "true"
    button.addEventListener("click", async () => {
      const text = button.getAttribute("data-copy-current-code") || currentCodeText()
      const label = button.querySelector("span:last-child")
      if (!text || !label) return

      try {
        await navigator.clipboard.writeText(text)
        const previous = label.textContent
        label.textContent = "Copied"
        window.setTimeout(() => {
          label.textContent = previous || "Copy"
        }, 1400)
      } catch {
        const previous = label.textContent
        label.textContent = "Error"
        window.setTimeout(() => {
          label.textContent = previous || "Copy"
        }, 1400)
      }
    })
  })
}

function currentCodeText() {
  const activePanel = $("[data-code-panel]:not([hidden])")
  return activePanel ? activePanel.textContent || "" : ""
}

function switchCodeTab(tabName) {
  const windowEl = $("[data-code-window]")
  if (!windowEl) return

  $$("[data-code-tab]", windowEl).forEach((button) => {
    const active = button.dataset.codeTab === tabName
    button.classList.toggle("active", active)
    button.setAttribute("aria-selected", active ? "true" : "false")
  })

  $$("[data-code-panel]", windowEl).forEach((panel) => {
    const active = panel.dataset.codePanel === tabName
    panel.hidden = !active
  })
}

function updateActiveLinks(id) {
  $$("[data-nav-link], [data-toc-link], .mobile-bottom-nav a").forEach((link) => {
    const linkId = link.dataset.navLink || link.dataset.tocLink || link.getAttribute("href")?.replace("#", "") || ""
    const active = linkId === id
    link.classList.toggle("active", active)
    if (active) link.setAttribute("aria-current", "page")
    else link.removeAttribute("aria-current")
  })
}

function renderShell() {
  const app = $("#app")
  if (!app) return

  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="topbar-inner">
          <div class="brand-row">
            <button class="burger" id="sidebar-toggle" aria-label="Ouvrir le menu">
              <span class="material-symbols-outlined">menu</span>
            </button>
            <a class="brand" href="#overview" aria-label="NeuralAPI">
              <span class="brand-mark" aria-hidden="true">N</span>
              <span class="brand-copy">
                <strong class="brand-name">NeuralAPI</strong>
                <span class="brand-tagline">Developer-first infrastructure for the neural era</span>
              </span>
            </a>
          </div>

          <nav class="topnav" aria-label="Navigation principale">
            <a href="#overview">Documentation</a>
            <a href="#paths">Endpoints</a>
            <a href="#cards">Models</a>
            <a href="#integration">SDKs</a>
            <a href="#footer">Status</a>
          </nav>

          <div class="top-actions">
            <label class="search-shell" aria-label="Search documentation">
              <span class="material-symbols-outlined">search</span>
              <input id="search-input" data-search-input type="search" placeholder="Search..." autocomplete="off" spellcheck="false">
              <span class="kbd-hint" aria-hidden="true"><kbd>Ctrl</kbd><kbd>K</kbd></span>
            </label>
            <span class="status-pill">Operational</span>
            <span class="version-pill">${escapeHtml(DOC_CONFIG.VERSION || "v3.0")}</span>
            <button class="icon-btn" aria-label="Code">
              <span class="material-symbols-outlined">code</span>
            </button>
            <button class="profile-btn icon-btn" aria-label="Account">
              <span class="material-symbols-outlined">person</span>
            </button>
          </div>
        </div>
      </header>

      <aside class="sidebar" id="sidebar" aria-label="Navigation latérale">
        <div class="nav-panel" id="sidebar-content"></div>
      </aside>

      <div class="drawer-backdrop" id="drawer-backdrop" aria-hidden="true"></div>

      <main class="shell-grid">
        <div class="main">
          <div class="main-inner" id="content"></div>
        </div>

        <aside class="toc" aria-label="On this page">
          <div class="toc-panel" id="toc-content"></div>
        </aside>
      </main>

      <nav class="mobile-bottom-nav" aria-label="Navigation mobile">
        <a class="active" href="#overview">
          <span class="material-symbols-outlined">explore</span>
          <span>Explore</span>
        </a>
        <a href="#request-preview">
          <span class="material-symbols-outlined">terminal</span>
          <span>API</span>
        </a>
        <a href="#paths">
          <span class="material-symbols-outlined">cloud_sync</span>
          <span>Deploy</span>
        </a>
      </nav>
    </div>
  `
}

function renderSidebar() {
  const root = $("#sidebar-content")
  if (!root) return

  const project = state.project || {
    id: DOC_CONFIG.PROJECT_ID,
    name: DOC_CONFIG.SITE_TITLE,
    description: DOC_CONFIG.SITE_TAGLINE,
  }
  const activeSlug = state.currentPage?.slug || state.currentSpace?.slug || null

  const groups = state.spaces
    .slice()
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
    .map((space) => {
      const pages = getPagesForSpace(space.id)
      const items = pages
        .slice()
        .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
        .map((page) => `
          <a class="nav-link${page.slug === activeSlug ? " active" : ""}" href="${pageUrl(page.slug)}" data-close-sidebar="true">
            <strong>${escapeHtml(page.title)}</strong>
            <span>${escapeHtml(page.excerpt || "")}</span>
          </a>
        `)
        .join("")

      return `
        <section class="nav-section">
          <h2 class="nav-heading">${escapeHtml(space.name)}</h2>
          <div class="nav-links">
            <a class="nav-link${space.slug === activeSlug ? " active" : ""}" href="${spaceUrl(space.slug)}" data-close-sidebar="true">
              <strong>${escapeHtml(space.scope || "project")}</strong>
              <span>${pages.length} pages</span>
            </a>
            ${items}
          </div>
        </section>
      `
    })
    .join("")

  root.innerHTML = `
    <div class="sidebar-card">
      <div class="label">Project ${escapeHtml(String(project.id || DOC_CONFIG.PROJECT_ID))}</div>
      <h2>${escapeHtml(project.name)}</h2>
      <p>${escapeHtml(project.description || DOC_CONFIG.SITE_TAGLINE || "")}</p>
      <div class="metrics">
        <div class="metric">
          <strong>${state.counts.spaces}</strong>
          <span>spaces</span>
        </div>
        <div class="metric">
          <strong>${state.counts.pages}</strong>
          <span>pages</span>
        </div>
        <div class="metric">
          <strong>read-only</strong>
          <span>token</span>
        </div>
      </div>
      <a class="sidebar-cta" href="#quickstart" data-close-sidebar="true">
        <strong>Get API Key</strong>
        <span>Créer ou vérifier l'accès docs</span>
      </a>
    </div>

    ${groups || `<div class="sidebar-card"><p>No spaces available.</p></div>`}
  `
}

function renderToc(items, title = "On this page", support = true) {
  const root = $("#toc-content")
  if (!root) return

  const list = items
    .map((item) => {
      if (item.href) {
        return `
          <a class="toc-link" href="${item.href}" ${item.active ? 'aria-current="page"' : ""}>
            <span>${escapeHtml(item.label)}</span>
          </a>
        `
      }

      return `
        <a class="toc-link" href="#${escapeHtml(item.target)}" data-toc-link="${escapeHtml(item.target)}">
          <span>${escapeHtml(item.label)}</span>
        </a>
      `
    })
    .join("")

  root.innerHTML = `
    <div class="toc-inner">
      <div>
        <div class="toc-heading">${escapeHtml(title)}</div>
        <div class="toc-progress"><span class="toc-progress-bar" data-progress-bar></span></div>
      </div>

      <div class="toc-links">
        ${list || `<div class="toc-empty">Aucune section disponible.</div>`}
      </div>

      ${support ? `
        <div class="support-box">
          <h3>Need help?</h3>
          <p>Join our community or open the troubleshooting guide when you need a quick unblock.</p>
          <a class="button secondary" href="#faq" style="width: 100%;">Get Support</a>
        </div>
      ` : ""}
    </div>
  `
}

function renderLoading() {
  const root = $("#content")
  if (!root) return

  root.innerHTML = `
    <div class="hero section-anchor">
      <span class="hero-badge">Loading</span>
      <div class="hero-grid">
        <div class="hero-copy">
          <h1>Loading<br>documentation.</h1>
          <p class="hero-lead">Fetching spaces, pages, and search data from the backend.</p>
        </div>
        <aside class="hero-panel">
          <div class="panel-title">Operational</div>
          <h2>Connecting</h2>
          <p>Waiting for the docs API.</p>
        </aside>
      </div>
    </div>
  `

  $("#toc-content")?.replaceChildren()
}

function renderError(message) {
  const root = $("#content")
  if (!root) return

  root.innerHTML = `
    <div class="hero section-anchor">
      <span class="hero-badge">Error</span>
      <div class="hero-grid">
        <div class="hero-copy">
          <h1>Impossible de charger la documentation.</h1>
          <p class="hero-lead">${escapeHtml(message)}</p>
          <div class="hero-actions">
            <button class="button primary" type="button" onclick="window.location.reload()">Recharger</button>
            <a class="button secondary" href="#overview">Retour à l'accueil</a>
          </div>
        </div>
        <aside class="hero-panel">
          <div class="panel-title">Check</div>
          <h2>API connection</h2>
          <p>Verify <code>js/config.js</code>, the token, CORS, and the project slug.</p>
        </aside>
      </div>
    </div>
  `

  $("#toc-content")?.replaceChildren()
}

function renderHome() {
  const root = $("#content")
  if (!root) return

  const project = state.project || {
    name: DOC_CONFIG.SITE_TITLE,
    description: DOC_CONFIG.SITE_TAGLINE,
  }
  const featured = getFeaturedPages()
  const latestPages = getLatestPages(4)
  const primaryPage = featured[0] || latestPages[0]
  const quickPages = (featured.length ? featured : latestPages).slice(0, 4)

  root.innerHTML = `
    <section class="hero section-anchor" id="overview">
      <span class="hero-badge">${escapeHtml(DOC_CONFIG.VERSION || "v3.0")}-STABLE</span>
      <div class="hero-grid">
        <div class="hero-copy">
          <h1>${escapeHtml(project.name || "ZodBack Docs")}<br>orchestrated.</h1>
          <p class="hero-lead">${escapeHtml(project.description || DOC_CONFIG.SITE_TAGLINE || "")}</p>

          <div class="hero-actions">
            <a class="button primary" href="${pageUrl(primaryPage?.slug || "overview-and-concepts")}">Get API Key <span class="material-symbols-outlined">vpn_key</span></a>
            <a class="button secondary" href="#request-preview">View Endpoints <span class="material-symbols-outlined">terminal</span></a>
          </div>

          <div class="hero-search-panel" id="quickstart">
            <label class="hero-search">
              <span class="material-symbols-outlined">search</span>
              <input id="hero-search" data-search-input type="search" placeholder="Search documentation..." autocomplete="off" spellcheck="false">
              <span class="kbd-hint" aria-hidden="true"><kbd>Ctrl</kbd><kbd>K</kbd></span>
            </label>
            <p>Parcourez les guides, la référence API et les notes de déploiement.</p>
          </div>

          <div class="hero-meta">
            <span>${state.counts.spaces} spaces</span>
            <span>${state.counts.pages} pages</span>
            <span>${escapeHtml(state.currentSpace?.name || "Public docs")}</span>
          </div>
        </div>

        <aside class="hero-panel">
          <div class="panel-title">Operational</div>
          <h2>${escapeHtml(project.name || "ZodBack Docs")}</h2>
          <p>${escapeHtml(project.description || DOC_CONFIG.SITE_TAGLINE || "")}</p>
          <div class="hero-stats">
            <div class="hero-stat"><strong>01</strong><span>Quickstart</span></div>
            <div class="hero-stat"><strong>02</strong><span>Authentication</span></div>
            <div class="hero-stat"><strong>03</strong><span>API Reference</span></div>
            <div class="hero-stat"><strong>04</strong><span>Deploy</span></div>
          </div>
        </aside>
      </div>
    </section>

    <section class="section section-anchor" id="cards">
      <div class="section-header">
        <div>
          <p class="section-eyebrow">Quick access</p>
          <h2 class="section-title">Curated paths</h2>
        </div>
        <p class="section-copy">Un ensemble de parcours et de modules connecté au contenu réel du projet via l'API docs.</p>
      </div>

      <div class="quick-grid">
        ${state.spaces.slice(0, 4).map((space) => `
          <a class="quick-card featured${space.slug === state.currentSpace?.slug ? " purple" : ""}" href="${spaceUrl(space.slug)}">
            <div class="quick-icon">
              <span class="material-symbols-outlined">folder</span>
            </div>
            <div class="quick-copy">
              <h3>${escapeHtml(space.name)}</h3>
              <p>${escapeHtml(space.description || "")}</p>
            </div>
          </a>
        `).join("")}
      </div>

      <div class="mini-grid" style="margin-top: 14px;">
        ${quickPages.slice(0, 2).map((page) => `
          <a class="mini-card" href="${pageUrl(page.slug)}">
            <span class="material-symbols-outlined">${page.slug.includes("deploy") ? "cloud_sync" : "smart_toy"}</span>
            <span>${escapeHtml(page.title)}</span>
          </a>
        `).join("")}
      </div>
    </section>

    <section class="section section-anchor" id="integration">
      <div class="section-header">
        <div>
          <p class="section-eyebrow">Request preview</p>
          <h2 class="section-title">A clean integration flow</h2>
        </div>
        <p class="section-copy">La page conserve une zone de code lisible, un header d’onglets et un bouton copier, mais les données viennent du backend.</p>
      </div>

      <div class="integration">
        <div class="integration-copy">
          <h2>Une intégration<br><em>sans friction.</em></h2>
          <p>Le portail reste branché à l’API docs pour charger les pages, les espaces et la recherche sans régression fonctionnelle.</p>
          <ul class="checklist">
            <li>Support natif pour le contenu Markdown du backend</li>
            <li>Navigation par espace et page via les routes hash</li>
            <li>Recherche distante avec résultats publics</li>
          </ul>
          <a class="text-link" href="#paths">Voir toutes les méthodes d'appel</a>
        </div>

        <div class="code-window" id="request-preview" data-code-window>
          <div class="code-window-bar">
            <div class="code-tabs" role="tablist" aria-label="Code samples">
              <button class="code-tab active" type="button" role="tab" aria-selected="true" data-code-tab="curl">curl</button>
              <button class="code-tab" type="button" role="tab" aria-selected="false" data-code-tab="fetch">fetch</button>
              <button class="code-tab" type="button" role="tab" aria-selected="false" data-code-tab="python">python</button>
            </div>
            <button class="copy-code" type="button" data-copy-current-code="${escapeHtml(CODE_SNIPPET)}">
              <span class="material-symbols-outlined">content_copy</span>
              <span>Copy</span>
            </button>
          </div>
          <div class="code-body" data-code-panel="curl">${codeToHtml(CODE_SNIPPET)}</div>
          <div class="code-body" data-code-panel="fetch" hidden>${codeToHtml(`fetch("https://integrations-api.zodev.live/api/docs/v1/public/all?projectId=3", { headers: { "x-api-key": "<DOCS_TOKEN>" } })`)}</div>
          <div class="code-body" data-code-panel="python" hidden>${codeToHtml(`import requests\n\nrequests.get("https://integrations-api.zodev.live/api/docs/v1/public/all", headers={"x-api-key": "<DOCS_TOKEN>"})`)}</div>
        </div>
      </div>
    </section>

    <section class="section section-anchor" id="paths">
      <div class="section-header">
        <div>
          <p class="section-eyebrow">Recommended paths</p>
          <h2 class="section-title">Guides structurés</h2>
        </div>
        <p class="section-copy">Les cartes ci-dessous reprennent le style des parcours recommandés avec le contenu réel des pages publiées.</p>
      </div>

      <div class="paths">
        ${quickPages.map((page, index) => `
          <a class="path-card" href="${pageUrl(page.slug)}">
            <div class="path-media" style="background-image:${index % 2 === 0 ? "linear-gradient(135deg, rgba(17, 36, 78, 0.95), rgba(27, 72, 109, 0.85) 50%, rgba(7, 9, 12, 0.98))" : "linear-gradient(135deg, rgba(22, 17, 64, 0.95), rgba(34, 77, 103, 0.8) 50%, rgba(7, 9, 12, 0.98))"};"></div>
            <div class="path-overlay"></div>
            <div class="path-copy">
              <span class="path-badge">${escapeHtml(getSpaceById(page.spaceId)?.name || "Docs")}</span>
              <h3>${escapeHtml(page.title)}</h3>
              <p>${escapeHtml(page.excerpt || "")}</p>
              <div class="path-meta">
                <span>${formatDate(page.updatedAt || page.publishedAt)}</span>
                <span>${estimateReadTime(page.content)} min</span>
              </div>
            </div>
          </a>
        `).join("")}
      </div>
    </section>

    <section class="section section-anchor updates" id="updates">
      <div class="updates-intro">
        <p class="section-eyebrow">What’s new</p>
        <h2 class="section-title updates-title">What’s new in v3.0</h2>
        <p class="section-copy">Les dernières mises à jour de contenu provenant directement du backend docs.</p>
        <div style="margin-top: 18px;">
          <a class="text-link" href="#footer">Changelog complet</a>
        </div>
      </div>

      <div class="updates-grid">
        ${latestPages.map((page) => `
          <article class="update-card">
            <p class="date">${formatDate(page.updatedAt || page.publishedAt)}</p>
            <h3><a href="${pageUrl(page.slug)}">${escapeHtml(page.title)}</a></h3>
            <p>${escapeHtml(page.excerpt || "")}</p>
          </article>
        `).join("")}
      </div>
    </section>

    <section class="section section-anchor" id="faq">
      <div class="section-header">
        <div>
          <p class="section-eyebrow">Frequently asked</p>
          <h2 class="section-title faq-title">Questions fréquentes</h2>
        </div>
      </div>

      <div class="faq-list">
        ${FAQ_ITEMS.map((item, index) => `
          <details class="faq-item"${index === 0 ? " open" : ""}>
            <summary class="faq-question">
              <span>${escapeHtml(item.question)}</span>
              <span class="material-symbols-outlined">expand_more</span>
            </summary>
            <div class="faq-answer">${escapeHtml(item.answer)}</div>
          </details>
        `).join("")}
      </div>
    </section>

    <footer class="footer section-anchor" id="footer">
      <div class="footer-top">
        <div>
          <div class="footer-brand">NeuralAPI</div>
          <p class="footer-about">${escapeHtml(project.description || DOC_CONFIG.SITE_TAGLINE || "")}</p>
        </div>
        <div class="footer-col">
          <h4>Product</h4>
          ${state.spaces.slice(0, 4).map((space) => `<a href="${spaceUrl(space.slug)}">${escapeHtml(space.name)}</a>`).join("")}
        </div>
        <div class="footer-col">
          <h4>Resources</h4>
          <a href="#overview">Documentation</a>
          <a href="#request-preview">SDKs</a>
          <a href="#paths">Cookbook</a>
          <a href="#updates">API Status</a>
        </div>
        <div class="footer-col">
          <h4>Company</h4>
          <a href="#overview">About</a>
          <a href="#updates">Changelog</a>
          <a href="#footer">Blog</a>
          <a href="#footer">Privacy</a>
        </div>
        <div class="footer-col">
          <h4>Legal</h4>
          <a href="#footer">Terms</a>
          <a href="#footer">Cookies</a>
          <a href="#footer">Security</a>
        </div>
      </div>

      <div class="footer-bottom">
        <span>© 2026 NeuralAPI infrastructure inc. Built for developers.</span>
        <span>All systems go</span>
      </div>
    </footer>
  `

  renderSidebar()
  renderToc(HOME_TOC, "On this page", true)
}

function renderSpaceView(space, pages) {
  const root = $("#content")
  if (!root) return

  root.innerHTML = `
    <section class="hero section-anchor">
      <span class="hero-badge">${escapeHtml(space.scope || "project")}</span>
      <div class="hero-grid">
        <div class="hero-copy">
          <h1>${escapeHtml(space.icon || "")} ${escapeHtml(space.name)}</h1>
          <p class="hero-lead">${escapeHtml(space.description || "")}</p>
          <div class="hero-actions">
            <a class="button primary" href="${pageUrl(pages[0]?.slug || "overview-and-concepts")}">Open first page <span class="material-symbols-outlined">arrow_right_alt</span></a>
            <a class="button secondary" href="#overview">Back to overview <span class="material-symbols-outlined">home</span></a>
          </div>
          <div class="hero-meta">
            <span>${pages.length} pages</span>
            <span>${space.isPublic ? "Public" : "Private"}</span>
            <span>${escapeHtml(space.slug)}</span>
          </div>
        </div>
        <aside class="hero-panel">
          <div class="panel-title">Space</div>
          <h2>${escapeHtml(space.name)}</h2>
          <p>${escapeHtml(space.description || "")}</p>
          <div class="hero-stats">
            ${pages.slice(0, 4).map((page, index) => `
              <a class="hero-stat" href="${pageUrl(page.slug)}">
                <strong>${String(index + 1).padStart(2, "0")}</strong>
                <span>${escapeHtml(page.title)}</span>
              </a>
            `).join("")}
          </div>
        </aside>
      </div>
    </section>

    <section class="section">
      <div class="section-header">
        <div>
          <p class="section-eyebrow">Space pages</p>
          <h2 class="section-title">${escapeHtml(space.name)}</h2>
        </div>
        <p class="section-copy">Les pages publiées dans cet espace sont disponibles ci-dessous.</p>
      </div>

      <div class="quick-grid">
        ${pages.map((page) => `
          <a class="quick-card featured" href="${pageUrl(page.slug)}">
            <div class="quick-icon">
              <span class="material-symbols-outlined">article</span>
            </div>
            <div class="quick-copy">
              <h3>${escapeHtml(page.title)}</h3>
              <p>${escapeHtml(page.excerpt || "")}</p>
            </div>
          </a>
        `).join("")}
      </div>
    </section>
  `

  renderSidebar()
  renderToc(
    pages.map((page) => ({ label: page.title, href: pageUrl(page.slug) })),
    space.name,
    true,
  )
}

function renderPageView(page) {
  const root = $("#content")
  if (!root) return

  const space = getSpaceById(page.spaceId)
  const headings = extractHeadings(page.content || "").filter((heading) => heading.level >= 2)
  const related = state.pages
    .filter((entry) => Number(entry.spaceId) === Number(page.spaceId) && entry.slug !== page.slug)
    .slice(0, 3)
  const readTime = estimateReadTime(page.content)

  root.innerHTML = `
    <article class="page-layout article-layout">
      <header class="article-hero">
        <p class="page-kicker">${escapeHtml(space?.name || "Documentation")}</p>
        <div class="article-headline">
          <h1>${escapeHtml(page.title)}</h1>
          <span class="article-badge">${readTime} min</span>
        </div>
        <p class="page-lead">${escapeHtml(page.excerpt || "")}</p>
        <div class="page-meta">
          <span>Publié ${formatDate(page.publishedAt || page.createdAt)}</span>
          <span>Mis à jour ${formatDate(page.updatedAt || page.publishedAt)}</span>
          <span>${escapeHtml(space?.slug || "docs")}</span>
        </div>
      </header>

      <section class="article-body-wrap">
        <div class="markdown-body article-body">
          ${renderMarkdown(page.content || "")}
        </div>
      </section>

      <section class="related-section" id="related-section">
        <div class="section-header">
          <div>
            <p class="section-eyebrow">Related</p>
            <h2 class="section-title">Autres pages utiles</h2>
          </div>
        </div>
        <div class="paths">
          ${related.map((item, index) => `
            <a class="path-card" href="${pageUrl(item.slug)}">
              <div class="path-media" style="background-image:${index % 2 === 0 ? "linear-gradient(135deg, rgba(17, 36, 78, 0.95), rgba(27, 72, 109, 0.85) 50%, rgba(7, 9, 12, 0.98))" : "linear-gradient(135deg, rgba(22, 17, 64, 0.95), rgba(34, 77, 103, 0.8) 50%, rgba(7, 9, 12, 0.98))"};"></div>
              <div class="path-overlay"></div>
              <div class="path-copy">
                <span class="path-badge">${escapeHtml(getSpaceById(item.spaceId)?.name || "Docs")}</span>
                <h3>${escapeHtml(item.title)}</h3>
                <p>${escapeHtml(item.excerpt || "")}</p>
                <div class="path-meta">
                  <span>${formatDate(item.updatedAt || item.publishedAt)}</span>
                  <span>${estimateReadTime(item.content)} min</span>
                </div>
              </div>
            </a>
          `).join("")}
        </div>
      </section>
    </article>
  `

  renderSidebar()
  renderToc(
    [
      ...headings.map((heading) => ({
        label: heading.text,
        href: `#${heading.id}`,
      })),
      { label: "Related", href: "#related-section" },
    ],
    "On this page",
    true,
  )
}

function renderSearchView(query, results) {
  const root = $("#content")
  if (!root) return

  const items = Array.isArray(results) ? results : []
  root.innerHTML = `
    <section class="hero section-anchor">
      <span class="hero-badge">Search</span>
      <div class="hero-grid">
        <div class="hero-copy">
          <h1>Results for<br>${escapeHtml(query)}</h1>
          <p class="hero-lead">${items.length} résultat(s) trouvé(s) dans la documentation publique.</p>
          <div class="hero-actions">
            <a class="button secondary" href="#overview">Back to overview <span class="material-symbols-outlined">home</span></a>
          </div>
        </div>
        <aside class="hero-panel">
          <div class="panel-title">Search</div>
          <h2>${items.length} results</h2>
          <p>Content was returned from the docs API in real time.</p>
        </aside>
      </div>
    </section>

    <section class="section">
      <div class="search-results">
        ${items.length
          ? items.map((item) => {
              const space = getSpaceById(item.spaceId)
              return `
                <a class="search-result-card" href="${pageUrl(item.slug)}">
                  <div class="search-result-top">
                    <span>${escapeHtml(space?.name || "Documentation")}</span>
                    <small>${formatDate(item.updatedAt || item.publishedAt)}</small>
                  </div>
                  <h3>${escapeHtml(item.title)}</h3>
                  <p>${escapeHtml(item.excerpt || "")}</p>
                </a>
              `
            }).join("")
          : `<div class="empty-state">
              <h3>Aucun résultat</h3>
              <p>Essayez un mot plus large, par exemple <code>token</code>, <code>deploy</code> ou <code>portfolio</code>.</p>
            </div>`}
      </div>
    </section>
  `

  renderSidebar()
  renderToc(
    [
      { label: "Conseils", href: "#overview" },
      { label: "Retour", href: "#overview" },
    ],
    "Search",
    false,
  )
}

function renderRouteLoading() {
  renderLoading()
  renderSidebar()
}

async function handleRoute() {
  const route = getRoute()
  renderRouteLoading()

  try {
    closeSidebar()
    setupSearchControls()

    switch (route.type) {
      case "home":
        state.currentPage = null
        state.currentSpace = null
        document.title = `${DOC_CONFIG.SITE_TITLE}`
        renderHome()
        break

      case "space": {
        let space = getSpaceBySlug(route.slug)
        let pages = space ? getPagesForSpace(space.id) : []
        if (!space || pages.length === 0) {
          const fetched = await getSpacePages(route.slug, state.project?.id || DOC_CONFIG.PROJECT_ID)
          const data = fetched?.data || fetched
          space = data?.space || data?.data?.space || data?.space || space
          pages = Array.isArray(data?.pages) ? data.pages : pages
          if (!space && data?.id) space = data
        }

        if (!space) throw new Error("Space not found")
        if (!pages.length) pages = getPagesForSpace(space.id)

        state.currentPage = null
        state.currentSpace = space
        document.title = `${space.name} · ${DOC_CONFIG.SITE_TITLE}`
        renderSpaceView(space, pages)
        break
      }

      case "page": {
        let page = getPage(route.slug)
        if (!page) {
          const fetched = await getPageBySlug(route.slug, state.project?.id || DOC_CONFIG.PROJECT_ID)
          const data = fetched?.data || fetched
          if (data?.id) {
            page = data
            state.pages = [page, ...state.pages.filter((entry) => entry.slug !== page.slug)]
          }
        }

        if (!page) throw new Error("Page not found")
        state.currentPage = page
        state.currentSpace = getSpaceById(page.spaceId)
        document.title = `${page.title} · ${DOC_CONFIG.SITE_TITLE}`
        renderPageView(page)
        break
      }

      case "search": {
        const query = route.query || ""
        state.searchQuery = query
        if (!query) {
          navigate("#/")
          return
        }

        document.title = `${query} · ${DOC_CONFIG.SITE_TITLE}`
        const response = await searchDocs(query, state.project?.id || DOC_CONFIG.PROJECT_ID)
        const data = response?.data || response || []
        renderSearchView(query, Array.isArray(data) ? data : [])
        break
      }

      default:
        navigate("#/")
        return
    }

    renderSidebar()
    setupCopyButtons()
    setupSearchControls()
    window.scrollTo({ top: 0, behavior: "auto" })
    syncNavigation()
  } catch (error) {
    renderError(error?.message || "Impossible de contacter l'API documentation")
    renderSidebar()
  }
}

function syncNavigation() {
  if (state.currentPage) {
    updateActiveLinks(state.currentPage.slug)
    return
  }

  if (state.currentSpace) {
    updateActiveLinks(state.currentSpace.slug)
    return
  }

  updateActiveLinks("overview")
}

function observeSections() {
  const homeSections = ["overview", "quickstart", "integration", "paths", "updates", "faq", "footer"]
    .map((id) => document.getElementById(id))
    .filter(Boolean)

  if (!homeSections.length) return

  const observer = new IntersectionObserver(
    (entries) => {
      if (state.currentPage || state.currentSpace) return
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (visible?.target?.id) {
        updateActiveLinks(visible.target.id)
      }
    },
    { rootMargin: "-35% 0px -50% 0px", threshold: [0.18, 0.3, 0.45, 0.6] },
  )

  homeSections.forEach((section) => observer.observe(section))
}

async function init() {
  document.title = DOC_CONFIG.SITE_TITLE
  renderShell()
  setupMobileSidebar()
  setupKeyboardShortcuts()
  setupSearchControls()
  renderLoading()

  try {
    const projectResponse = await getProjectBySlug(DOC_CONFIG.PROJECT_SLUG || "zodback-platform")
    const project = projectResponse?.data || projectResponse
    state.project = project

    const allResponse = await getAll(project.id || DOC_CONFIG.PROJECT_ID)
    const data = allResponse?.data || allResponse
    state.spaces = data.spaces || []
    state.pages = data.pages || []
    state.counts = {
      spaces: state.spaces.length,
      pages: state.pages.length,
    }

    renderSidebar()
    await handleRoute()
    observeSections()
  } catch (error) {
    renderError(error?.message || "Impossible de contacter l'API documentation")
  }
}

window.addEventListener("hashchange", handleRoute)
window.addEventListener("DOMContentLoaded", init)
