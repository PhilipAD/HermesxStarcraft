(function () {
  "use strict";

  const SDK = window.__HERMES_PLUGIN_SDK__;
  const React = SDK.React;
  const Button = SDK.components.Button;
  const Badge = SDK.components.Badge;
  const useState = SDK.hooks.useState;
  const useEffect = SDK.hooks.useEffect || React.useEffect;
  const useRef = SDK.hooks.useRef || React.useRef;

  const DEFAULT_URL = "http://127.0.0.1:9120/?titan=1&nominimap=1";
  const SINGLETON_KEY = "__HERMESXSTARCRAFT_IFRAME__";

  function hiddenFrameStyle(el) {
    Object.assign(el.style, {
      position: "fixed",
      left: "-10000px",
      top: "-10000px",
      width: "1px",
      height: "1px",
      visibility: "hidden",
      pointerEvents: "none",
      overflow: "hidden",
      background: "#000",
      zIndex: "1"
    });
  }

  function getPersistentFrame() {
    if (!window[SINGLETON_KEY]) {
      const container = document.createElement("div");
      container.setAttribute("data-hermesxstarcraft-frame", "true");
      hiddenFrameStyle(container);

      const iframe = document.createElement("iframe");
      iframe.title = "Hermes x StarCraft";
      iframe.className = "border-0";
      iframe.allow = "fullscreen; clipboard-read; clipboard-write";
      Object.assign(iframe.style, {
        display: "block",
        width: "100%",
        height: "100%",
        border: "0"
      });
      container.appendChild(iframe);
      document.body.appendChild(container);

      window[SINGLETON_KEY] = {
        container,
        iframe,
        currentUrl: ""
      };
    }
    return window[SINGLETON_KEY];
  }

  function showPersistentFrame(host, src) {
    const frame = getPersistentFrame();
    if (frame.currentUrl !== src) {
      frame.iframe.src = src;
      frame.currentUrl = src;
    }

    const syncBounds = function () {
      if (!host || !host.isConnected) return;
      const rect = host.getBoundingClientRect();
      Object.assign(frame.container.style, {
        position: "fixed",
        left: rect.left + "px",
        top: rect.top + "px",
        width: Math.max(0, rect.width) + "px",
        height: Math.max(0, rect.height) + "px",
        visibility: "visible",
        pointerEvents: "auto",
        overflow: "hidden",
        background: "#000",
        zIndex: "20"
      });
    };

    syncBounds();
    requestAnimationFrame(syncBounds);
    return syncBounds;
  }

  function hidePersistentFrame() {
    const frame = window[SINGLETON_KEY];
    if (!frame) return;
    hiddenFrameStyle(frame.container);
  }

  function HermesStarCraftPage() {
    const existing = window[SINGLETON_KEY] && window[SINGLETON_KEY].currentUrl;
    const [src, setSrc] = useState(existing || DEFAULT_URL);
    const iframeHostRef = useRef(null);

    useEffect(function () {
      const host = iframeHostRef.current;
      if (!host) return undefined;

      const syncBounds = showPersistentFrame(host, src);
      let resizeObserver = null;
      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(syncBounds);
        resizeObserver.observe(host);
      }
      window.addEventListener("resize", syncBounds);
      window.addEventListener("scroll", syncBounds, true);
      const interval = window.setInterval(syncBounds, 500);

      return function () {
        if (resizeObserver) resizeObserver.disconnect();
        window.removeEventListener("resize", syncBounds);
        window.removeEventListener("scroll", syncBounds, true);
        window.clearInterval(interval);
        hidePersistentFrame();
      };
    }, [src]);

    return React.createElement(
      "div",
      {
        className: "flex flex-col gap-3",
        style: {
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          height: "100%",
          minHeight: "0",
        },
      },
      React.createElement(
        "div",
        { className: "flex flex-wrap items-center justify-between gap-3" },
        React.createElement(
          "div",
          { className: "flex items-center gap-3" },
          React.createElement("h2", { className: "text-lg font-semibold" }, "Hermes x StarCraft"),
          React.createElement(Badge, { variant: "outline" }, "Live base view")
        ),
        React.createElement(
          "div",
          { className: "flex items-center gap-2" },
          React.createElement(
            Button,
            { variant: "outline", onClick: function () { setSrc(DEFAULT_URL + "&reload=" + Date.now()); } },
            "Reload"
          ),
          React.createElement(
            "a",
            {
              className: "text-sm underline underline-offset-4",
              href: DEFAULT_URL,
              target: "_blank",
              rel: "noreferrer"
            },
            "Open full screen"
          )
        )
      ),
      React.createElement(
        "div",
        {
          className: "overflow-hidden rounded-md border border-border bg-black",
          style: {
            flex: "1 1 auto",
            minHeight: "0",
            overflow: "hidden",
          },
        },
        React.createElement("div", {
          ref: iframeHostRef,
          className: "border-0",
          style: {
            display: "block",
            width: "100%",
            height: "100%",
            border: "0",
            background: "#000",
          }
        })
      ),
      React.createElement(
        "p",
        { className: "text-xs text-muted-foreground" },
        "Start the package with `npm run start` from HermesxStarcraft if this frame is not available."
      )
    );
  }

  window.__HERMES_PLUGINS__.register("hermesxstarcraft", HermesStarCraftPage);
})();
