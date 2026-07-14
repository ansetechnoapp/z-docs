import { DOC_CONFIG } from "./config.js?v=20260714a"
import { verifyConnection, getAll, getSpacePages, getPageBySlug, searchDocs } from "./api.js?v=20260714a"
import { renderMarkdown } from "./renderer.js?v=20260714a"

let state = {
  spaces: [],
  pages: [],
  currentPage: null,
  currentSpace: null,
}

// ── DOM Helpers ──
const $ = (sel) => document.querySelector(sel)

// ── Routing ──
function getRoute() {
  const hash = location.hash.slice(1) || "/"
  const parts = hash.split("/").filter(Boolean)
  if (parts[0] === "space" && parts[1]) return { type: "space", slug: parts[1] }
  if (parts[0] === "page" && parts[1]) return { type: "page", slug: parts[1] }
  if (parts[0] === "search") return { type: "search", query: new URLSearchParams(hash.split("?")[1] || "").get("q") || "" }
  return { type: "home" }
}

function navigate(hash) {
  location.hash = hash
}

// ── Render Functions ──
function renderSidebar() {
  const nav = $("#sidebar-nav")
  if (!nav) return

  let html = ""
  for (const space of state.spaces) {
    const isActive = state.currentSpace?.slug === space.slug
    html += `<div class="item${isActive ? " active" : ""}" onclick="location.hash='#/space/${space.slug}'">${space.icon || "📚"} ${space.name}</div>`
  }
  nav.innerHTML = html
}

function renderHome() {
  const content = $("#content")
  if (!content) return

  let html = `<h2>${DOC_CONFIG.SITE_TITLE}</h2>`
  html += `<p class="muted">Browse documentation by space or search for specific topics.</p>`

  if (state.spaces.length > 0) {
    html += `<div class="list" style="margin-top:1rem">`
    for (const space of state.spaces) {
      html += `<div class="item" onclick="location.hash='#/space/${space.slug}'">`
      html += `<strong>${space.icon || "📚"} ${space.name}</strong>`
      if (space.description) html += `<div class="muted" style="font-size:.85em;margin-top:.25rem">${space.description}</div>`
      html += `</div>`
    }
    html += `</div>`
  }

  if (state.pages.length > 0) {
    html += `<h2 style="margin-top:1.5rem">All Published Pages</h2>`
    html += `<div class="list">`
    for (const page of state.pages) {
      html += `<div class="item" onclick="location.hash='#/page/${page.slug}'">`
      html += `<strong>${page.title}</strong>`
      if (page.excerpt) html += `<div class="muted" style="font-size:.85em;margin-top:.25rem">${page.excerpt}</div>`
      html += `</div>`
    }
    html += `</div>`
  }

  content.innerHTML = html
}

function renderSpaceView(spaceData) {
  const content = $("#content")
  if (!content) return

  const { space, pages } = spaceData
  state.currentSpace = space
  renderSidebar()

  let html = `<h2>${space.icon || "📚"} ${space.name}</h2>`
  if (space.description) html += `<p class="muted">${space.description}</p>`

  if (pages.length === 0) {
    html += `<p class="muted" style="margin-top:1rem">No published pages in this space.</p>`
  } else {
    html += `<div class="list" style="margin-top:1rem">`
    for (const page of pages) {
      html += `<div class="item" onclick="location.hash='#/page/${page.slug}'">`
      html += `<strong>${page.title}</strong>`
      if (page.excerpt) html += `<div class="muted" style="font-size:.85em;margin-top:.25rem">${page.excerpt}</div>`
      html += `</div>`
    }
    html += `</div>`
  }

  content.innerHTML = html
}

function renderPageView(pageData) {
  const content = $("#content")
  if (!content) return

  const page = pageData.data || pageData
  state.currentPage = page

  const renderedContent = renderMarkdown(page.content || "")

  let html = `<article>`
  html += `<h2>${page.title}</h2>`
  if (page.excerpt) html += `<p class="muted">${page.excerpt}</p>`
  html += `<div class="markdown-body" style="margin-top:1rem">${renderedContent}</div>`
  html += `<div class="muted" style="margin-top:1.5rem;padding-top:.75rem;border-top:1px solid var(--border);font-size:.85em;display:flex;gap:1rem">`
  if (page.publishedAt) html += `<span>Published: ${new Date(page.publishedAt).toLocaleDateString()}</span>`
  if (page.updatedAt) html += `<span>Updated: ${new Date(page.updatedAt).toLocaleDateString()}</span>`
  html += `</div></article>`

  content.innerHTML = html
}

function renderSearchResults(results) {
  const content = $("#content")
  if (!content) return

  const data = results.data || results || []

  let html = `<h2>Search Results</h2>`
  if (data.length === 0) {
    html += `<p class="muted">No results found.</p>`
  } else {
    html += `<div class="list">`
    for (const page of data) {
      html += `<div class="item" onclick="location.hash='#/page/${page.slug}'">`
      html += `<strong>${page.title}</strong>`
      if (page.excerpt) html += `<div class="muted" style="font-size:.85em;margin-top:.25rem">${page.excerpt}</div>`
      html += `</div>`
    }
    html += `</div>`
  }

  content.innerHTML = html
}

function renderError(message) {
  const content = $("#content")
  if (!content) return
  content.innerHTML = `<h2 style="color:#ef4444">Connection Error</h2><p>${message}</p><p class="muted">Check your <code>config.js</code> settings (API_URL, API_TOKEN, PROJECT_ID).</p>`
}

function showLoading() {
  const content = $("#content")
  if (content) content.innerHTML = `<p class="muted">Loading...</p>`
}

// ── Route Handler ──
async function handleRoute() {
  const route = getRoute()
  showLoading()

  try {
    switch (route.type) {
      case "home":
        state.currentSpace = null
        renderSidebar()
        renderHome()
        break

      case "space": {
        const spaceData = await getSpacePages(route.slug)
        renderSpaceView(spaceData.data || spaceData)
        break
      }

      case "page": {
        const pageData = await getPageBySlug(route.slug)
        renderPageView(pageData)
        break
      }

      case "search":
        if (route.query) {
          const results = await searchDocs(route.query)
          renderSearchResults(results)
        } else {
          renderHome()
        }
        break

      default:
        renderHome()
    }
  } catch (err) {
    renderError(err.message)
  }
}

// ── Search ──
function setupSearch() {
  const searchInput = $("#search-input")
  if (!searchInput) return

  let timeout
  searchInput.addEventListener("input", (e) => {
    clearTimeout(timeout)
    const q = e.target.value.trim()
    timeout = setTimeout(() => {
      if (q.length > 0) {
        navigate(`/search?q=${encodeURIComponent(q)}`)
      }
    }, 400)
  })

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      clearTimeout(timeout)
      const q = e.target.value.trim()
      if (q.length > 0) navigate(`/search?q=${encodeURIComponent(q)}`)
    }
  })
}

// ── Theme ──
function setupTheme() {
  const toggle = $("#theme-toggle")
  if (!toggle) return

  const saved = localStorage.getItem("docs-theme") || DOC_CONFIG.THEME
  if (saved === "light") {
    document.documentElement.style.setProperty("--bg", "#ffffff")
    document.documentElement.style.setProperty("--fg", "#1a1a2e")
    document.documentElement.style.setProperty("--muted", "#6c757d")
    document.documentElement.style.setProperty("--card", "#f8f9fa")
    document.documentElement.style.setProperty("--border", "#e9ecef")
    document.documentElement.style.setProperty("--accent", "#22c55e")
    toggle.textContent = "☀️"
  }

  toggle.addEventListener("click", () => {
    const isLight = localStorage.getItem("docs-theme") === "light"
    if (isLight) {
      document.documentElement.style.setProperty("--bg", "#0b1220")
      document.documentElement.style.setProperty("--fg", "#e5e7eb")
      document.documentElement.style.setProperty("--muted", "#9ca3af")
      document.documentElement.style.setProperty("--card", "#0f172a")
      document.documentElement.style.setProperty("--border", "#1f2937")
      localStorage.setItem("docs-theme", "dark")
      toggle.textContent = "🌙"
    } else {
      document.documentElement.style.setProperty("--bg", "#ffffff")
      document.documentElement.style.setProperty("--fg", "#1a1a2e")
      document.documentElement.style.setProperty("--muted", "#6c757d")
      document.documentElement.style.setProperty("--card", "#f8f9fa")
      document.documentElement.style.setProperty("--border", "#e9ecef")
      localStorage.setItem("docs-theme", "light")
      toggle.textContent = "☀️"
    }
  })
}

// ── Mobile Sidebar ──
function setupMobileSidebar() {
  const toggle = $("#sidebar-toggle")
  const sidebar = $("#sidebar")
  if (!toggle || !sidebar) return

  toggle.addEventListener("click", () => {
    sidebar.classList.toggle("open")
  })

  sidebar.addEventListener("click", (e) => {
    if (e.target.closest(".item")) {
      sidebar.classList.remove("open")
    }
  })
}

// ── Init ──
async function init() {
  document.title = DOC_CONFIG.SITE_TITLE
  const titleEl = $("#site-title")
  if (titleEl) titleEl.textContent = DOC_CONFIG.SITE_TITLE

  setupSearch()
  setupTheme()
  setupMobileSidebar()
  showLoading()

  const connected = await verifyConnection()
  if (!connected) {
    renderError("Could not connect to the documentation API.")
    return
  }

  try {
    const allData = await getAll()
    const data = allData.data || allData
    state.spaces = data.spaces || []
    state.pages = data.pages || []
    renderSidebar()
    handleRoute()
  } catch (err) {
    renderError(err.message)
  }
}

window.addEventListener("hashchange", handleRoute)
window.addEventListener("DOMContentLoaded", init)
