function joinUrl(baseUrl, relativePath) {
  const base = new URL(baseUrl.endsWith('/') ? baseUrl : baseUrl + '/');
  return new URL(relativePath, base);
}

async function readResponse(fetchImpl, url, label) {
  const response = await fetchImpl(url.toString(), { cache: 'no-store' });
  if (!response.ok) throw new Error(label + ' returned HTTP ' + response.status);
  return response.text();
}

export async function verifyPagesDeployment({ baseUrl, expectedCommit, fetchImpl = globalThis.fetch } = {}) {
  if (typeof baseUrl !== 'string' || !/^https:\/\//i.test(baseUrl)) throw new TypeError('baseUrl must be an HTTPS Pages URL');
  if (typeof expectedCommit !== 'string' || !/^[a-f0-9]{7,40}$/i.test(expectedCommit)) throw new TypeError('expectedCommit must be a Git commit SHA');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');

  const indexUrl = joinUrl(baseUrl, 'index.html');
  const html = await readResponse(fetchImpl, indexUrl, 'index.html');
  if (!html.includes('BLACK VANTA')) throw new Error('live index.html does not contain the BLACK VANTA identity');

  const metadataText = await readResponse(fetchImpl, joinUrl(baseUrl, 'deployment-meta.json'), 'deployment-meta.json');
  let metadata;
  try { metadata = JSON.parse(metadataText); } catch { throw new Error('deployment metadata is not valid JSON'); }
  if (metadata.commit !== expectedCommit) throw new Error('deployment commit mismatch: expected ' + expectedCommit + ', received ' + String(metadata.commit));

  const serviceWorker = await readResponse(fetchImpl, joinUrl(baseUrl, 'sw.js'), 'sw.js');
  if (!serviceWorker.includes('zforge-black-vanta-' + expectedCommit)) {
    throw new Error('service-worker cache revision does not match the deployed commit');
  }

  const references = [...html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)]
    .map(match => match[1])
    .filter(path => /\.(?:js|css)(?:\?|$)/i.test(path));
  const assetUrls = [...new Set(references.map(path => joinUrl(baseUrl, path)))];
  if (!assetUrls.some(url => /\/assets\/app\.js$/i.test(url.pathname))) throw new Error('index.html does not reference assets/app.js');
  if (!assetUrls.some(url => /\/assets\/app\.css$/i.test(url.pathname))) throw new Error('index.html does not reference assets/app.css');

  for (const assetUrl of assetUrls) {
    if (assetUrl.origin !== indexUrl.origin) throw new Error('unexpected cross-origin critical asset: ' + assetUrl.origin);
    await readResponse(fetchImpl, assetUrl, assetUrl.pathname);
  }

  return { status: 'verified', commit: expectedCommit, assetsChecked: assetUrls.length, serviceWorker: 'verified' };
}
