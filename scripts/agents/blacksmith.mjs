import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CATALOG = 'tools_catalog.json';

function validateEntry(entry) {
  return entry && entry.status === 'approved' && entry.auth === 'none'
    && typeof entry.name === 'string' && /^[a-z0-9-]{2,48}$/i.test(entry.name)
    && typeof entry.baseUrl === 'string'
    && /^https:\/\/[a-z0-9.-]+(?::\d{1,5})?$/i.test(entry.baseUrl)
    && entry.licenseStatus === 'verified';
}

export async function generateProposals({ catalogPath = CATALOG, outputDir = 'agents/proposals' } = {}) {
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  if (!Array.isArray(catalog.tools)) throw new TypeError('catalog.tools must be an array');
  await mkdir(outputDir, { recursive: true });
  const proposals = [];
  for (const entry of catalog.tools.filter(validateEntry)) {
    const filename = `${entry.name}.adapter.mjs`;
    const source = `// Generated proposal. Review license, provenance, hostname and tests before use.\nexport const name = ${JSON.stringify(entry.name)};\nexport const baseUrl = ${JSON.stringify(entry.baseUrl)};\nexport async function request(pathname, { signal } = {}) {\n  if (typeof pathname !== 'string' || !pathname.startsWith('/') || pathname.startsWith('//')) throw new TypeError('relative path required');\n  const url = new URL(pathname, baseUrl);\n  if (url.origin !== new URL(baseUrl).origin) throw new Error('cross-origin request blocked');\n  return fetch(url, { signal, headers: { accept: 'application/json' } });\n}\n`;
    const pythonName = `${entry.name.replace(/-/g, '_')}_adapter.py`;
    const pythonSource = `\"\"\"Generated proposal; standard-library only. Review before use.\"\"\"\nfrom urllib.parse import urljoin, urlsplit\nfrom urllib.request import Request, urlopen\n\nBASE_URL = ${JSON.stringify(entry.baseUrl)}\n\ndef request(pathname: str, timeout: int = 10):\n    if not isinstance(pathname, str) or not pathname.startswith('/') or pathname.startswith('//'):\n        raise ValueError('relative path required')\n    url = urljoin(BASE_URL, pathname)\n    if urlsplit(url).netloc != urlsplit(BASE_URL).netloc or urlsplit(url).scheme != 'https':\n        raise ValueError('cross-origin request blocked')\n    req = Request(url, headers={'Accept': 'application/json'})\n    with urlopen(req, timeout=min(max(timeout, 1), 15)) as response:\n        return response.read()\n`;
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
  generateProposals().then(result => process.stdout.write(JSON.stringify(result) + '\n'))
    .catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
