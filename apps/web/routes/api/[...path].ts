import {
  defineHandler,
  getProxyRequestHeaders,
  getRequestURL,
  getRouterParam,
  proxyRequest,
  HTTPError
} from 'nitro/h3';

const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE']);

function resolveBackendBaseURL(): URL {
  const rawValue = process.env['BACKEND_URL']?.trim();
  if (!rawValue) {
    throw HTTPError.status(500, 'Missing BACKEND_URL configuration');
  }

  try {
    return new URL(rawValue.endsWith('/') ? rawValue : `${rawValue}/`);
  } catch {
    throw HTTPError.status(500, 'Invalid BACKEND_URL configuration');
  }
}

export default defineHandler(async (event) => {
  const method = event.req.method.toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    throw HTTPError.status(405, 'Method not allowed');
  }

  const rawPath = getRouterParam(event, 'path');
  if (!rawPath) {
    throw HTTPError.status(400, 'Invalid API path');
  }

  const path = decodeURIComponent(rawPath);
  if (path.includes('..') || path.includes('://') || path.startsWith('//')) {
    throw HTTPError.status(400, 'Invalid API path');
  }

  const requestUrl = getRequestURL(event);
  const backendUrl = resolveBackendBaseURL();
  const upstreamUrl = new URL(path, backendUrl);

  if (upstreamUrl.origin !== backendUrl.origin) {
    throw HTTPError.status(400, 'Invalid API path');
  }
  upstreamUrl.search = requestUrl.search;

  const headers = getProxyRequestHeaders(event, { host: false });
  const authToken = process.env['AUTH_TOKEN']?.trim();

  if (authToken) {
    headers.authorization = `Bearer ${authToken}`;
  } else {
    delete headers.authorization;
  }

  try {
    return await proxyRequest(event, upstreamUrl.toString(), {
      headers,
      fetchOptions: {
        redirect: 'manual'
      }
    });
  } catch (error) {
    throw new HTTPError({
      status: 502,
      statusText: 'Failed to reach backend API',
      cause: error
    });
  }
});
