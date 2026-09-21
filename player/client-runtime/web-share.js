(function installPixoWebShare(root, factory) {
  "use strict";

  const api = factory();
  if (root) root.PixoWebShare = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPixoWebShare() {
  "use strict";

  function normalizedExperienceId(value) {
    const id = typeof value === "string" ? value.trim() : "";
    return id && id.length <= 128 ? id : "";
  }

  function canonicalExperienceShareUrl(runtimeLocationHref, experienceId) {
    const id = normalizedExperienceId(experienceId);
    if (!id) throw new TypeError("A valid hosted interactive video id is required for sharing.");
    const runtimeUrl = new URL(runtimeLocationHref);
    if (!["https:", "http:"].includes(runtimeUrl.protocol)) {
      throw new TypeError("The browser Runtime must use an HTTP(S) URL for sharing.");
    }
    const gameUrl = new URL("../", runtimeUrl);
    if (gameUrl.pathname === "/") {
      gameUrl.pathname = `/experience/${encodeURIComponent(id)}`;
      gameUrl.search = "";
    } else {
      // Development can still mount the static player below /game. The
      // production root always uses the path-based resolver above.
      gameUrl.search = `?experience=${encodeURIComponent(id)}`;
    }
    gameUrl.hash = "";
    return gameUrl.href;
  }

  async function resolveExperienceShareUrl(windowObject, experienceId) {
    const fallback = canonicalExperienceShareUrl(
      windowObject.location.href,
      experienceId,
    );
    if (typeof windowObject.fetch !== "function") return fallback;
    try {
      const endpoint = new URL(
        `/api/v1/public/seo/resolve/${encodeURIComponent(experienceId)}`,
        windowObject.location.href,
      );
      const response = await windowObject.fetch(endpoint.href, {
        cache: "no-store",
        credentials: "omit",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return fallback;
      const payload = await response.json();
      const candidate = new URL(payload?.canonical_url || "", fallback);
      const canonicalPath = candidate.pathname.startsWith("/videos/")
        ? candidate.pathname
        : candidate.pathname.startsWith("/experiences/")
          ? candidate.pathname.replace(/^\/experiences\//, "/videos/")
          : "";
      if (
        ["https:", "http:"].includes(candidate.protocol)
        && canonicalPath
        && !candidate.search
        && !candidate.hash
      ) {
        candidate.pathname = canonicalPath;
        return candidate.href;
      }
    } catch {
      // The path resolver remains a valid, non-query fallback.
    }
    return fallback;
  }

  function copyWithSelection(documentObject, value) {
    if (!documentObject || !documentObject.body ||
        typeof documentObject.createElement !== "function" ||
        typeof documentObject.execCommand !== "function") {
      return false;
    }
    const field = documentObject.createElement("textarea");
    field.value = value;
    field.setAttribute("readonly", "");
    field.setAttribute("aria-hidden", "true");
    field.style.position = "fixed";
    field.style.top = "0";
    field.style.left = "-9999px";
    field.style.opacity = "0";
    documentObject.body.appendChild(field);
    try {
      field.select();
      if (typeof field.setSelectionRange === "function") {
        field.setSelectionRange(0, value.length);
      }
      return documentObject.execCommand("copy") === true;
    } catch {
      return false;
    } finally {
      field.remove();
    }
  }

  async function copyExperienceShareLink(windowObject, experienceId) {
    let shareUrl = "";
    try {
      shareUrl = await resolveExperienceShareUrl(windowObject, experienceId);
    } catch {
      return { status: "copy_failed", code: "copy_failed" };
    }
    const clipboard = windowObject.navigator && windowObject.navigator.clipboard;
    if (windowObject.isSecureContext && clipboard && typeof clipboard.writeText === "function") {
      try {
        await clipboard.writeText(shareUrl);
        return { status: "copied" };
      } catch {
        // Older browsers and restrictive iframe policies can reject Clipboard API writes.
      }
    }
    return copyWithSelection(windowObject.document, shareUrl)
      ? { status: "copied" }
      : { status: "copy_failed", code: "copy_failed" };
  }

  return Object.freeze({
    canonicalExperienceShareUrl,
    copyExperienceShareLink,
    copyWithSelection,
    resolveExperienceShareUrl,
  });
});
