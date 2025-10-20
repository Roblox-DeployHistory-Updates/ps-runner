const OWNER = 'Roblox-DeployHistory-Updates';
const REPO = 'ps-runner';
const API_BASE = 'https://api.github.com';

const state = {
  releases: [],
  filtered: [],
  usePSLinks: false,
  q: '',
};

const dom = {
  grid: document.getElementById('grid'),
  skeleton: document.getElementById('skeletonList'),
  status: document.getElementById('status'),
  live: document.getElementById('liveRegion'),
  search: document.getElementById('searchInput'),
  usePSLinks: document.getElementById('usePSLinks'),
};

function showSkeleton(count = 8) {
  dom.grid.setAttribute('aria-busy', 'true');
  dom.skeleton.innerHTML = Array.from({ length: count })
    .map(() => '<div class="skeleton-card"></div>')
    .join('');
}

function hideSkeleton() {
  dom.skeleton.innerHTML = '';
  dom.grid.setAttribute('aria-busy', 'false');
}

function noteLive(msg) { dom.live.textContent = msg; }

async function tryFetchJson(url) {
  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) { return null; }
}

function parseArchivedRelease(item) {
  let _details;
  if (item && typeof item.details === 'object' && item.details) {
    const d = item.details;
    _details = {
      version: d.version ?? undefined,
      requiredFirmware: d.required_firmware ?? undefined,
      contentId: d.content_id ?? undefined,
      digest: d.digest ?? undefined,
      manifestUrl: d.manifest_url ?? undefined,
      pkgFile: d.pkg_file ?? undefined,
      pkgName: d.pkg_name ?? undefined,
      pkgSizeBytes: Number.isFinite(+d.pkg_size_bytes) ? +d.pkg_size_bytes : undefined,
      pkgSize: d.pkg_size ?? undefined,
      pkgHash: d.pkg_hash ?? undefined,
      patchNotes: d.patch_notes ?? undefined,
    };
  }
  return {
    ...item,
    _archived: true,
    _details,
  };
}

async function fetchArchivedReleases() {
  const data = await tryFetchJson('./web/archived-releases.json');
  if (Array.isArray(data)) {
    return data.map(parseArchivedRelease);
  } else return [];
}

function isPlayStationRelease(rel) {
  // Heuristic: tag or name includes ps, playstation, ps5, ps4
  const hay = `${rel.tag_name} ${rel.name || ''}`.toLowerCase();
  return /\b(ps|ps5|ps4|playstation)\b/.test(hay);
}

function filterAndSearch() {
  const { q } = state;
  const qn = q.trim().toLowerCase();
  let items = state.releases.filter(r => {
    // Only show PlayStation-related releases
    if (!isPlayStationRelease(r)) return false;
    return true;
  });
  if (qn) {
    items = items.filter(r => {
      const body = r.body || '';
      const hay = `${r.tag_name} ${r.name || ''} ${body}`.toLowerCase();
      return hay.includes(qn);
    });
  }
  state.filtered = items;
}

function formatDate(iso) {
  const d = new Date(iso);
  if (!+d) return '';
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function makeTag(text) { return `<span class="chip ${text.toLowerCase()}">${text}</span>`; }

function humanBytes(n) {
  const b = Number(n);
  if (!isFinite(b) || b < 0) return '';
  const units = ['B','KB','MB','GB','TB'];
  const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), units.length - 1);
  const val = b / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : val < 10 ? 2 : val < 100 ? 1 : 0)} ${units[i]}`;
}

function truncateMiddle(str, left = 10, right = 6) {
  if (!str) return '';
  const s = String(str);
  if (s.length <= left + right + 3) return s;
  return `${s.slice(0, left)}…${s.slice(-right)}`;
}

function parseReleaseDetails(body) {
  if (!body) return null;
  const text = String(body).trim();
  if (!text) return null;
  const d = {
    version: undefined,
    requiredFirmware: undefined,
    contentId: undefined,
    digest: undefined,
    manifestUrl: undefined,
    pkgFile: undefined,
    pkgName: undefined,
    pkgSizeBytes: undefined,
    pkgHash: undefined,
    patchNotes: undefined,
  };

  // Capture Patch Notes
  const pnMatch = text.match(/(?:^|\n)\s*Patch\s*Notes:\s*`([\s\S]*?)`*$/i);
  if (pnMatch) d.patchNotes = pnMatch[1].trim();

  // Simple key: value pairs line by line
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z][A-Za-z\s]+?)\s*:\s*(.+)\s*$/);
    if (!m) continue;
    const key = m[1].trim().toLowerCase();
    const val = m[2].trim();
    if (key === 'version') d.version = val;
  else if (key === 'content id') d.contentId = val;
  else if (key === 'required firmware') d.requiredFirmware = val;
    else if (key === 'digest') d.digest = val;
    else if (key === 'manifest url') d.manifestUrl = val;
    else if (key === 'pkg file') d.pkgFile = val;
    else if (key === 'pkg name') d.pkgName = val;
    else if (key === 'pkg size') {
      const num = parseInt(val.replace(/[^0-9]/g, ''), 10);
      if (Number.isFinite(num)) d.pkgSizeBytes = num;
    }
    else if (key === 'pkg hash') d.pkgHash = val;
  }

  // If no fields found, return null
  const hasAny = Object.values(d).some(v => v !== undefined && v !== '');
  return hasAny ? d : null;
}

function renderDetails(d, links) {
  if (!d) return '';
  const rows = [];
  if (d.version) rows.push(`<dt>Version</dt><dd>${escapeHtml(d.version)}</dd>`);
  if (d.requiredFirmware) rows.push(`<dt>Required Firmware</dt><dd>${escapeHtml(d.requiredFirmware)}</dd>`);
  if (d.contentId) rows.push(`<dt>Content ID</dt><dd class="code" title="${escapeHtml(d.contentId)}">${escapeHtml(d.contentId)}</dd>`);
  if (d.pkgSize) rows.push(`<dt>PKG Size</dt><dd>${escapeHtml(d.pkgSize)}</dd>`);
  else if (d.pkgSizeBytes) rows.push(`<dt>PKG Size</dt><dd>${escapeHtml(humanBytes(d.pkgSizeBytes))} <span class="muted">(${d.pkgSizeBytes.toLocaleString()} bytes)</span></dd>`);
  if (d.digest) rows.push(`<dt>Digest</dt><dd class="code" title="${escapeHtml(d.digest)}">${escapeHtml(truncateMiddle(d.digest))}</dd>`);
  if (d.pkgHash) rows.push(`<dt>PKG Hash</dt><dd class="code" title="${escapeHtml(d.pkgHash)}">${escapeHtml(truncateMiddle(d.pkgHash))}</dd>`);

  const linkBtns = [
    links?.manifestHref ? `<a class="asset-link" href="${links.manifestHref}" target="_blank" rel="noopener">Manifest</a>` : '',
    links?.pkgHref ? `<a class="asset-link" href="${links.pkgHref}" target="_blank" rel="noopener">PKG File</a>` : ''
  ].filter(Boolean).join('');

  const nameRow = d.pkgName ? `<div class="row"><div class="full-row"><span class="muted">PKG Name:</span> <span class="code">${escapeHtml(d.pkgName)}</span></div></div>` : '';
  const notesBlock = d.patchNotes ? `<div class="notes">${escapeHtml(d.patchNotes.slice(0, 320))}${d.patchNotes.length > 320 ? '…' : ''}</div>` : '';

  return `
    <div class="details">
      <dl class="kv">${rows.join('')}</dl>
      ${nameRow}
      ${(linkBtns) ? `<div class="links">${linkBtns}</div>` : ''}
      ${notesBlock}
    </div>
  `;
}

function render() {
  filterAndSearch();
  const items = state.filtered;
  if (!items.length) {
    dom.grid.innerHTML = `
      <div class="card" style="grid-column: 1 / -1; padding: 20px; text-align: center; color: var(--muted);">
        <div style="font-weight:600; color:white; margin-bottom:6px;">No releases match your filters</div>
        <div>Try adjusting search.</div>
      </div>
    `;
    return;
  }

  dom.grid.innerHTML = items.map(r => renderRelease(r)).join('');
}

function renderRelease(r) {
  const tag = r.tag_name;
  const name = r.name || '';
  const isPS = isPlayStationRelease(r);
  const created = r.created_at ? formatDate(r.created_at) : null;
  const published = r.published_at ? formatDate(r.published_at) : null;
  const assets = r.assets || [];

  const notes = (r.body || '').trim();
  const details = r._archived ? r._details : parseReleaseDetails(notes);
  const preview = !details && notes ? notes.split('\n').slice(0, 3).join(' ').slice(0, 220) : '';
  const more = !details && notes && notes.length > preview.length ? '…' : '';

  // Determine which links to use for Manifest / PKG buttons
  let manifestHref = '';
  let pkgHref = '';
  if (state.usePSLinks) {
    if (details?.manifestUrl) manifestHref = details.manifestUrl;
    if (details?.pkgFile) pkgHref = details.pkgFile;
  } else {
    const manifestAsset = assets.find(a => /manifest/i.test(a.name) && /\.json$/i.test(a.name))
      || assets.find(a => /\.json$/i.test(a.name));
    const pkgAsset = assets.find(a => /\.pkg$/i.test(a.name))
      || assets.find(a => /pkg/i.test(a.name));
    if (manifestAsset) manifestHref = manifestAsset.browser_download_url;
    if (pkgAsset) pkgHref = pkgAsset.browser_download_url;
  }

  return `
  <article class="tile">
    <div class="tile-header">
      <div class="tag">
        <span>${name || tag}</span>
        ${isPS ? '<span class="chip">PlayStation</span>' : ''}
        ${r._archived ? '<span class="chip archived" title="Archived items are from other sources predating the tracker.">Archived</span>' : ''}
      </div>
    </div>
    <div class="tile-body">
      ${details ? renderDetails(details, { manifestHref, pkgHref }) : (preview ? preview + more : '<span style="color:var(--muted)">No release notes</span>')}
    </div>
    <div class="tile-footer">
      <div class="meta">
        ${published ? `<span>Published ${published}</span>` : created ? `<span>Created ${created}</span>` : ''}
        ${(published || created) && r.html_url ? '<span class="dot"></span>' : ''}
        ${r.html_url ? `<a class="asset-link" href="${r.html_url}" target="_blank" rel="noopener">View on GitHub</a>` : ''}
      </div>
    </div>
  </article>`;
}

async function fetchAllReleases() {
  // Paginate up to first ~200 releases
  const perPage = 100;
  let page = 1;
  const all = [];
  while (page <= 3) { // cap pages for now
    const url = `${API_BASE}/repos/${OWNER}/${REPO}/releases?per_page=${perPage}&page=${page}`;
    const res = await fetch(url, { headers: { 'Accept': 'application/vnd.github+json' } });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub API error ${res.status}: ${text}`);
    }
    const data = await res.json();
    all.push(...data);
    if (data.length < perPage) break;
    page++;
  }
  return all;
}

function wireControls() {
  dom.search.addEventListener('input', () => { state.q = dom.search.value; render(); });
  dom.usePSLinks.addEventListener('change', () => { state.usePSLinks = dom.usePSLinks.checked; render(); });
  state.usePSLinks = !!dom.usePSLinks?.checked;
  state.q = dom.search?.value || '';
}

async function init() {
  wireControls();
  showSkeleton(9);
  try {
    const [archived, gh] = await Promise.all([
      fetchArchivedReleases(),
      fetchAllReleases(),
    ]);
  // Keep GitHub (newer) first, then archived (older) earlier
    state.releases = [...gh, ...archived];
    hideSkeleton();
    noteLive(`Loaded ${state.releases.length} releases`);
    render();
  } catch (err) {
    hideSkeleton();
    console.error(err);
    const msg = err?.message || 'Failed to load releases';
    dom.grid.innerHTML = `
      <div class="card" style="grid-column: 1 / -1; padding: 20px;">
        <div style="color:#ff9b9b; font-weight:700; margin-bottom:6px;">Error loading releases</div>
        <div style="color:var(--muted);">${escapeHtml(msg)}</div>
        <div style="margin-top:10px; color:var(--muted); font-size:12px;">You have hit GitHub rate limits, try again later.</div>
      </div>
    `;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"] /g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',' ':' '}[c]));
}

init();
