(function installPixoWebCompatibility(globalObject) {
  "use strict";

  var userAgent = globalObject && globalObject.navigator
    ? String(globalObject.navigator.userAgent || "")
    : "";
  var chromeVersionMatch = /(?:Chrome|Chromium)\/(\d+)/.exec(userAgent);
  var androidWebViewMajor = chromeVersionMatch
    ? parseInt(chromeVersionMatch[1], 10)
    : null;
  var legacyMediaCompositor = /Android/i.test(userAgent)
    && androidWebViewMajor !== null
    && androidWebViewMajor <= 70;

  // WebView 70's video compositor is unreliable when multiple opacity-backed
  // <video> layers are kept alive. Mark that tier before Runtime starts so CSS
  // and the media pool can fall back to a single, non-composited player.
  if (
    legacyMediaCompositor
    && globalObject.document
    && globalObject.document.documentElement
  ) {
    globalObject.document.documentElement.setAttribute(
      "data-pixo-legacy-media-compositor",
      "true",
    );
  }

  // Android System WebView 70 predates Object.fromEntries. Runtime 0.11.x uses it
  // while normalizing every ExperienceSpec, so install the equivalent operation
  // before any Runtime dependency executes. Keep this bootstrap on ES5 syntax so
  // the compatibility layer itself remains parseable by the oldest supported
  // WebView.
  if (typeof Object.fromEntries !== "function") {
    Object.defineProperty(Object, "fromEntries", {
      configurable: true,
      enumerable: false,
      writable: true,
      value: function fromEntries(iterable) {
        if (iterable == null) {
          throw new TypeError("Object.fromEntries requires an iterable.");
        }

        var result = {};
        Array.from(iterable).forEach(function assignEntry(entry) {
          if (entry == null || (typeof entry !== "object" && typeof entry !== "function")) {
            throw new TypeError("Object.fromEntries iterable values must be entry objects.");
          }
          Object.defineProperty(result, entry[0], {
            configurable: true,
            enumerable: true,
            writable: true,
            value: entry[1],
          });
        });
        return result;
      },
    });
  }

  // ParentNode.replaceChildren landed well after WebView 70. The Runtime only
  // needs the Element implementation, but preserve the standard string-to-text
  // behavior so this remains a safe general compatibility shim.
  if (
    globalObject
    && globalObject.Element
    && typeof globalObject.Element.prototype.replaceChildren !== "function"
  ) {
    Object.defineProperty(globalObject.Element.prototype, "replaceChildren", {
      configurable: true,
      enumerable: false,
      writable: true,
      value: function replaceChildren() {
        var nodes = [];
        var documentObject = this.ownerDocument || globalObject.document;
        var index;
        for (index = 0; index < arguments.length; index += 1) {
          var value = arguments[index];
          if (value && typeof value.nodeType === "number") {
            nodes.push(value);
          } else {
            if (!documentObject || typeof documentObject.createTextNode !== "function") {
              throw new TypeError("Element.replaceChildren requires an owner document.");
            }
            nodes.push(documentObject.createTextNode(String(value)));
          }
        }
        while (this.firstChild) this.removeChild(this.firstChild);
        nodes.forEach(function appendReplacement(node) {
          this.appendChild(node);
        }, this);
      },
    });
  }

  if (globalObject) {
    globalObject.PixoWebCompatibility = Object.freeze({
      objectFromEntries: typeof Object.fromEntries === "function",
      elementReplaceChildren: Boolean(
        globalObject.Element
        && typeof globalObject.Element.prototype.replaceChildren === "function"
      ),
      androidWebViewMajor: androidWebViewMajor,
      legacyMediaCompositor: legacyMediaCompositor,
    });
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
