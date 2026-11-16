import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CATALOG = 'tools_catalog.json';

function validateEntry(entry) {
  if (!entry || entry.status !== 'approved' || entry.auth !== 'none'
    || typeof entry.name !== 'string' || !/^[a-z0-9-]{2,48}$/i.test(entry.name)
    || typeof entry.baseUrl !== 'string' || entry.licenseStatus !== 'verified') return false;
  try {
    const url = new URL(entry.baseUrl);
    return url.protocol === 'https:' && url.pathname === '/' && !url.search && !url.hash;
  } catch { return false; }
}

export async function generateProposals({ catalogPath = CATALOG, outputDir = 'agents/proposals' } = {}) {
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  if (!Array.isArray(catalog.tools)) throw new TypeError('catalog.tools must be an array');
  await mkdir(outputDir, { recursive: true });
  const proposals = [];
  for (const entry of catalog.tools.filter(validateEntry)) {
    const filename = `${entry.name}.adapter.mjs`;
    const fallback = typeof entry.fallbackBaseUrl === 'string' && /^https:\/\/[a-z0-9.-]+(?::\d{1,5})?$/i.test(entry.fallbackBaseUrl)
      ? entry.fallbackBaseUrl : null;
    const source = `// Generated proposal. Human review and tests required before activation.
import { createResourcePolicy } from '../../scripts/agents/resource-manager.mjs';
export const name = ${JSON.stringify(entry.name)};
export const baseUrl = ${JSON.stringify(entry.baseUrl)};
const fallbackBaseUrl = ${JSON.stringify(fallback)};
const budget = createResourcePolicy({ maxRequests: 30, maxRetries: 2, baseDelayMs: 250, maxDelayMs: 2000 });
export async function request(pathname, { signal } = {}) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/') || pathname.startsWith('//')) throw new TypeError('relative path required');
  const primary = new URL(pathname, baseUrl);
  if (primary.origin !== new URL(baseUrl).origin) throw new Error('cross-origin request blocked');
  let response = await budget.run(() => fetch(primary, { signal, headers: { accept: 'application/json' } }));
  if (fallbackBaseUrl && (response.status === 429 || response.status >= 500)) {
    const fallback = new URL(pathname, fallbackBaseUrl);
    if (fallback.protocol !== 'https:') throw new Error('fallback must use HTTPS');
    response = await budget.run(() => fetch(fallback, { signal, headers: { accept: 'application/json' } }));
  }
  return response;
}
`;
    const pythonName = `${entry.name.replace(/-/g, '_')}_adapter.py`;
    const pythonSource = `# Generated proposal; standard-library only. Human review required.
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen

BASE_URL = ${JSON.stringify(entry.baseUrl)}
FALLBACK_BASE_URL = ${JSON.stringify(fallback)}
MAX_REQUESTS = 30
MAX_RETRIES = 2
_requests = 0

def request(pathname: str, timeout: int = 10):
    global _requests
    if not isinstance(pathname, str) or not pathname.startswith('/') or pathname.startswith('//'):
        raise ValueError('relative path required')
    if _requests >= MAX_REQUESTS:
        raise RuntimeError('RESOURCE_BUDGET_EXHAUSTED')
    _requests += 1
    for base in (BASE_URL, FALLBACK_BASE_URL):
        if not base:
            continue
        url = urljoin(base, pathname)
        if urlsplit(url).netloc != urlsplit(base).netloc or urlsplit(url).scheme != 'https':
            raise ValueError('cross-origin request blocked')
        for attempt in range(MAX_RETRIES + 1):
            try:
                req = Request(url, headers={'Accept': 'application/json'})
                with urlopen(req, timeout=min(max(timeout, 1), 15)) as response:
                    return response.read()
            except HTTPError as error:
                if error.code not in (408, 425, 429, 500, 502, 503, 504) or attempt == MAX_RETRIES:
                    if base == BASE_URL and FALLBACK_BASE_URL and error.code >= 500:
                        break
                    raise
            except URLError:
                if attempt == MAX_RETRIES:
                    if base == BASE_URL and FALLBACK_BASE_URL:
                        break
                    raise
            time.sleep(min(2.0, 0.25 * (2 ** attempt)))
    raise RuntimeError('PRIMARY_AND_FALLBACK_FAILED')
`;
    for (const [file, body] of [[filename, source], [pythonName, pythonSource]]) {
      await writeFile(path.join(outputDir, file), body, { flag: 'wx' }).catch(error => {
        if (error.code !== 'EEXIST') throw error;
      });
      proposals.push(file);
    }
  }
  return { proposals, generated: proposals.length, executed: false, installed: false };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generateProposals().then(result => process.stdout.write(JSON.stringify(result) + '\\n'))
    .catch(error => { process.stderr.write(`${error.message}\\n`); process.exitCode = 1; });
}
