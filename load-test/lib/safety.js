const denied = ['github.com', 'komarev.com', 'shields.io'];

export function targetUrl() {
  const raw = (__ENV.TARGET_URL || 'http://app:3000').replace(/\/$/, '');
  const match = raw.match(/^https?:\/\/([^/?#]+)(?:[/?#]|$)/i);
  if (!match || match[1].includes('@')) throw new Error('REFUSED: TARGET_URL must be an HTTP(S) URL without embedded credentials');
  const authority = match[1];
  const host = (authority.startsWith('[') ? authority.slice(1, authority.indexOf(']')) : authority.split(':')[0]).toLowerCase();
  if (denied.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
    throw new Error(`REFUSED: ${host} is a prohibited third-party load-test target`);
  }
  const local = host === 'app' || host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local') ||
    /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (!local && __ENV.ALLOW_REMOTE_TARGET !== 'true') {
    throw new Error(`REFUSED: remote target ${host} requires ALLOW_REMOTE_TARGET=true and explicit authorization`);
  }
  return raw;
}

export const browserParams = (visitor) => ({
  headers: {
    'User-Agent': 'Mozilla/5.0 (authorized local profile-counter test)',
    ...(visitor === undefined ? {} : { 'X-Test-Visitor-ID': String(visitor) }),
  },
  tags: { endpoint: 'badge' },
});

export function stats(base, profile) {
  const response = httpGet(`${base}/api/profiles/${profile}/stats`);
  if (response.status !== 200) return undefined;
  return response.json();
}

function httpGet(url) {
  // Kept behind a function so every scenario imports k6/http only once.
  return globalThis.__k6Http.get(url, { tags: { endpoint: 'stats' } });
}

export function printVerification(before, after, expectedRaw) {
  if (!after) { console.error('Post-load stats could not be fetched.'); return; }
  const rawDelta = after.rawRequests - (before?.rawRequests || 0);
  console.log('\nPost-load verification');
  console.log(`raw requests:         ${after.rawRequests} (delta ${rawDelta})`);
  console.log(`counted views:        ${after.countedViews}`);
  console.log(`unique views:         ${after.uniqueViews}`);
  console.log(`bot requests:         ${after.botRequests}`);
  console.log(`rate-limited requests:${after.rateLimited}`);
  console.log(rawDelta === expectedRaw ? `PASS: raw delta exactly ${expectedRaw}` : `MISMATCH: expected raw delta ${expectedRaw}, received ${rawDelta}`);
}
