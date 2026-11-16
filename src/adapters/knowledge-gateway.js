import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { load } from 'cheerio';
import TurndownService from 'turndown';

const MAX_SEARCH_RESULTS = 5;
const MAX_PAGE_BYTES = 500_000;
const REQUEST_TIMEOUT_MS = 12_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function isPublicAddress(address) {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) return false;
    if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
  }
  if (isIP(address) === 6) {
    const value = address.toLowerCase();
    if (value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd')
      || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea')
      || value.startsWith('feb') || value.startsWith('ff') || value.startsWith('2001:db8')
      || value.startsWith('2001:0:') || value.startsWith('2002:')) return false;
    if (!/^[23]/.test(value)) return false;
    if (value.startsWith('::ffff:')) return isPublicAddress(value.slice(7));
    return true;
  }
  return false;
}

function validateHttpUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new TypeError('URL is invalid'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new TypeError('only credential-free HTTP(S) URLs are allowed');
  if (url.port && !['80', '443'].includes(url.port)) throw new TypeError('non-standard destination ports are blocked');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) throw new TypeError('local network destinations are blocked');
  if (isIP(hostname) && !isPublicAddress(hostname)) throw new TypeError('private or reserved IP destinations are blocked');
  return url;
}

async function requestPinned(url, { maxBytes, timeoutMs }) {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) throw new Error('destination resolves to a private or reserved network address');
  const selected = addresses[0];
  const transport = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request(url, {
      method: 'GET',
      headers: { 'user-agent': 'ZForge-KnowledgeGateway/1.0 (+https://github.com/zopair/ZForge)', accept: 'text/html,text/plain,application/json;q=0.9,*/*;q=0.1' },
      timeout: timeoutMs,
      lookup: (_hostname, options, callback) => {
        if (options?.all) callback(null, addresses);
        else callback(null, selected.address, selected.family);
      },
    }, response => {
      const chunks = [];
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > maxBytes) request.destroy(new Error('response exceeded the configured byte limit'));
        else chunks.push(chunk);
      });
      response.on('end', () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
      response.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new Error('upstream request timed out')));
    request.on('error', reject);
    request.end();
  });
}

async function requestWithRedirects(initialUrl, { budget, agentId, maxBytes, sameHost = false, maxRedirects = 2 }) {
  let current = validateHttpUrl(initialUrl);
  const originalHost = current.host;
  for (let redirects = 0; ; redirects += 1) {
    budget.consume({ method: 'GET', url: current.pathname, agentId });
    const response = await requestPinned(current, { maxBytes, timeoutMs: REQUEST_TIMEOUT_MS });
    if (!REDIRECT_STATUSES.has(response.status)) return { ...response, url: current.href };
    if (redirects >= maxRedirects) throw new Error('upstream redirect limit exceeded');
    const location = response.headers.location;
    if (typeof location !== 'string' || !location) throw new Error('upstream redirect omitted its location');
    const next = validateHttpUrl(new URL(location, current).href);
    if (current.protocol === 'https:' && next.protocol !== 'https:') throw new Error('HTTPS downgrade redirects are blocked');
    if (sameHost && next.host !== originalHost) throw new Error('SearXNG redirects to a different host are blocked');
    current = next;
  }
}

function cleanText(value, max = 1200) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export class KnowledgeGateway {
  constructor({ instances = [], requestImpl = requestWithRedirects } = {}) {
    if (!Array.isArray(instances)) throw new TypeError('SearXNG instances must be an array');
    if (typeof requestImpl !== 'function') throw new TypeError('requestImpl must be a function');
    this.requestImpl = requestImpl;
    this.instances = instances.map(value => {
      const url = validateHttpUrl(value);
      if (url.protocol !== 'https:') throw new TypeError('public SearXNG instances must use HTTPS');
      url.pathname = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
      url.search = '';
      url.hash = '';
      return url.href;
    });
    this.turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
  }

  async search({ query, agentId, budget } = {}) {
    if (typeof query !== 'string' || query.trim().length < 2 || query.length > 300) throw new TypeError('query must contain 2..300 characters');
    if (!budget || typeof budget.consume !== 'function') throw new TypeError('a shared task web budget is required');
    if (!this.instances.length) throw new Error('No public SearXNG JSON instances are configured; set ZFORGE_SEARXNG_INSTANCES to an HTTPS allowlist.');
    const failures = [];
    for (const instance of this.instances) {
      try {
        const endpoint = new URL('search', instance);
        endpoint.searchParams.set('q', query.trim());
        endpoint.searchParams.set('format', 'json');
        const response = await this.requestImpl(endpoint.href, { budget, agentId, maxBytes: 256_000, sameHost: true });
        if (response.status !== 200) throw new Error(`SearXNG returned HTTP ${response.status}`);
        if (!String(response.headers['content-type'] ?? '').toLowerCase().includes('application/json')) throw new Error('SearXNG JSON API is disabled or returned non-JSON content');
        const payload = JSON.parse(response.body);
        if (!Array.isArray(payload.results)) throw new Error('SearXNG response has no results array');
        const results = payload.results.slice(0, MAX_SEARCH_RESULTS).map((item, index) => ({
          rank: index + 1,
          title: cleanText(item.title, 240) || 'Untitled result',
          url: validateHttpUrl(String(item.url ?? '')).href,
          snippet: cleanText(item.content ?? item.snippet, 900),
          source: cleanText(item.engine ?? item.source, 80),
        }));
        const markdown = results.map(item => `### ${item.rank}. ${item.title}\n- URL: ${item.url}\n- Source: ${item.source || 'SearXNG'}\n- Summary: ${item.snippet || 'No snippet supplied'}\n- Status: UNVERIFIED`).join('\n\n');
        return { query: cleanText(query, 300), resultCount: results.length, results, markdown, source: 'SearXNG' };
      } catch (error) {
        if (error?.name === 'ApiBudgetExceededError') throw error;
        failures.push(cleanText(error.message, 240));
      }
    }
    throw new Error(`All configured SearXNG instances failed: ${failures.join(' | ')}`);
  }

  async fetch({ url, agentId, budget } = {}) {
    if (!budget || typeof budget.consume !== 'function') throw new TypeError('a shared task web budget is required');
    const target = validateHttpUrl(url);
    const response = await this.requestImpl(target.href, { budget, agentId, maxBytes: MAX_PAGE_BYTES, maxRedirects: 3 });
    if (response.status < 200 || response.status >= 300) throw new Error(`page fetch returned HTTP ${response.status}`);
    const contentType = String(response.headers['content-type'] ?? '').toLowerCase();
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) throw new Error('only HTML and plain-text pages can be fetched');
    let markdown;
    if (contentType.includes('text/plain')) markdown = response.body;
    else {
      const $ = load(response.body);
      $('script,style,noscript,iframe,object,embed,form,nav,footer,header,aside,svg,canvas,template').remove();
      $('[href]').each((_, element) => {
        const href = $(element).attr('href');
        try {
          const parsed = new URL(href, response.url);
          if (!['http:', 'https:'].includes(parsed.protocol)) $(element).removeAttr('href');
        } catch { $(element).removeAttr('href'); }
      });
      const main = $('main').first().length ? $('main').first() : $('article').first().length ? $('article').first() : $('body');
      markdown = this.turndown.turndown(main.html() ?? '');
    }
    markdown = markdown.replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_PAGE_BYTES);
    if (!markdown) throw new Error('no readable text was extracted from the page');
    return { url: response.url, contentType, bytes: Buffer.byteLength(response.body), markdown, status: 'UNTRUSTED_SOURCE_CONTENT' };
  }
}
