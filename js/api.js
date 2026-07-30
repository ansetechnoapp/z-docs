import { DOC_CONFIG } from "./config.js?v=20260730c"

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

export async function getAll(projectId = DOC_CONFIG.PROJECT_ID) {
  const params = projectId ? { projectId } : undefined
  return request("all", params)
}

export async function getProjectBySlug(slug) {
  return request(`project/${encodeURIComponent(slug)}`)
}

export async function getSpacePages(spaceSlug, projectId = DOC_CONFIG.PROJECT_ID) {
  const params = projectId ? { projectId } : undefined
  return request(`spaces/${encodeURIComponent(spaceSlug)}/pages`, params)
}

export async function getPageBySlug(slug, projectId = DOC_CONFIG.PROJECT_ID) {
  const params = projectId ? { projectId } : undefined
  return request(`pages/${encodeURIComponent(slug)}`, params)
}

export async function searchDocs(q, projectId = DOC_CONFIG.PROJECT_ID, spaceId) {
  const params = {
    q,
    projectId: projectId || undefined,
    spaceId: spaceId || undefined,
  }
  return request("search", params)
}

export async function verifyConnection(projectId = DOC_CONFIG.PROJECT_ID) {
  try {
    await getAll(projectId)
    return true
  } catch {
    return false
  }
}
