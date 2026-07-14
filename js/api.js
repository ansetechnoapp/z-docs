import { DOC_CONFIG } from "./config.js?v=20260714a"

let __cache = new Map()

function cacheKey(url) {
  return url
}

function buildUrl(path, params) {
  const base = `${DOC_CONFIG.API_URL}/${path}`.replace(/\/+$/, "")
  const u = new URL(base)
  const p = params || {}
  Object.entries(p).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return
    u.searchParams.set(k, String(v))
  })
  return u.toString()
}

async function request(path, params) {
  const url = buildUrl(path, params)
  const k = cacheKey(url)
  const now = Date.now()
  const hit = __cache.get(k)
  if (hit && now - hit.t < DOC_CONFIG.CACHE_DURATION) return hit.d

  const headers = { "Content-Type": "application/json" }
  if (DOC_CONFIG.API_TOKEN) {
    headers["Authorization"] = `Bearer ${DOC_CONFIG.API_TOKEN}`
    headers["x-api-key"] = DOC_CONFIG.API_TOKEN
  }

  const res = await fetch(url, { headers })
  if (!res.ok) {
    const msg = res.status === 401 || res.status === 403 ? "Invalid API Key" : `API Error: ${res.status}`
    throw new Error(msg)
  }
  const json = await res.json()
  __cache.set(k, { t: now, d: json })
  return json
}

export async function getAll() {
  const params = DOC_CONFIG.PROJECT_ID ? { projectId: DOC_CONFIG.PROJECT_ID } : undefined
  return request("all", params)
}

export async function getSpacePages(spaceSlug) {
  const params = DOC_CONFIG.PROJECT_ID ? { projectId: DOC_CONFIG.PROJECT_ID } : undefined
  return request(`spaces/${encodeURIComponent(spaceSlug)}/pages`, params)
}

export async function getPageBySlug(slug) {
  const params = DOC_CONFIG.PROJECT_ID ? { projectId: DOC_CONFIG.PROJECT_ID } : undefined
  return request(`pages/${encodeURIComponent(slug)}`, params)
}

export async function searchDocs(q, spaceId) {
  const params = {
    q,
    projectId: DOC_CONFIG.PROJECT_ID || undefined,
    spaceId: spaceId || undefined,
  }
  return request("search", params)
}

export async function verifyConnection() {
  try {
    await getAll()
    return true
  } catch {
    return false
  }
}
