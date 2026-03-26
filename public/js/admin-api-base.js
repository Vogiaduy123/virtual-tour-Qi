(function () {
  const configuredBase = (window.ADMIN_API_BASE_URL || "").trim().replace(/\/$/, "");
  if (!configuredBase) return;

  const pathPrefixes = ["/api/", "/uploads/", "/backend/tiles/"];

  function shouldRewrite(pathname) {
    return pathPrefixes.some(prefix => pathname.startsWith(prefix));
  }

  function rewriteUrl(url) {
    try {
      const parsed = new URL(url, window.location.origin);
      if (parsed.origin !== window.location.origin || !shouldRewrite(parsed.pathname)) {
        return url;
      }
      return `${configuredBase}${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return url;
    }
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    if (typeof input === "string") {
      return nativeFetch(rewriteUrl(input), init);
    }

    if (input instanceof Request) {
      const nextUrl = rewriteUrl(input.url);
      if (nextUrl !== input.url) {
        return nativeFetch(new Request(nextUrl, input), init);
      }
    }

    return nativeFetch(input, init);
  };

  const NativeEventSource = window.EventSource;
  if (typeof NativeEventSource === "function") {
    function RewrittenEventSource(url, config) {
      const nextUrl = typeof url === "string" ? rewriteUrl(url) : url;
      return new NativeEventSource(nextUrl, config);
    }

    RewrittenEventSource.prototype = NativeEventSource.prototype;
    window.EventSource = RewrittenEventSource;
  }
})();
