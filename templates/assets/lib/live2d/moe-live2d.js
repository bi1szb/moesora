/*!
 * Moesora Live2D Enhanced Controller
 * Replacement for templates/assets/lib/live2d/moe-live2d.js
 *
 * Features:
 * - Standard Cubism 3/4 model loading and multi-model switching
 * - Reads extended model3.json metadata (Motions / HitAreas / Controllers.KeyTrigger)
 * - Model-defined hit-area actions, keyboard actions, sound, text/subtitles
 * - Complete action panel, random and automatic idle actions
 * - Draggable desktop-pet placement with persistence
 * - Graceful fallback for ordinary Live2D models
 */
(function () {
  "use strict";

  var CFG = window.MoesoraConfig || {};
  var L = CFG.live2d || {};
  if (!L.on) return;

  function bool(value, fallback) {
    if (value === undefined || value === null || value === "") return fallback;
    if (typeof value === "string")
      return !/^(false|0|off|no)$/i.test(value.trim());
    return !!value;
  }

  function number(value, fallback, min, max) {
    var n = parseFloat(value);
    if (!isFinite(n)) n = fallback;
    if (typeof min === "number") n = Math.max(min, n);
    if (typeof max === "number") n = Math.min(max, n);
    return n;
  }

  function escapeHTML(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function parseModels(raw) {
    return String(raw || "")
      .split(/\n+/)
      .map(function (line) {
        var i = line.indexOf("|");
        if (i < 0) return null;
        var name = line.slice(0, i).trim();
        var url = line.slice(i + 1).trim();
        return name && url ? { name: name, url: url } : null;
      })
      .filter(Boolean);
  }

  var models = parseModels(L.models);
  if (!models.length) return;

  var SCALE = number(L.scale, 1, 0.45, 3);
  var POS = L.position === "bottom-left" ? "left" : "right";
  var ENABLE_PANEL = bool(L.actionPanel, true);
  var ENABLE_KEYBOARD = bool(L.keyboard, true);
  var ENABLE_HIT = bool(L.hitActions, true);
  var ENABLE_DRAG = bool(L.draggable, true);
  var ENABLE_IDLE = bool(L.autoMotion, true);
  var ENABLE_START = bool(L.startMotion, true);
  var ENABLE_MOBILE = bool(L.mobile, false);
  var IDLE_SECONDS = number(L.idleSeconds, 55, 15, 600);
  var SOUND_VOLUME = number(L.soundVolume, 0.85, 0, 1);

  var BASE_W = 320;
  var BASE_H = 400;
  var DPR = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  var REDUCED_MOTION = !!(
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  var SELF = (function () {
    if (document.currentScript && document.currentScript.src)
      return document.currentScript.src;
    var t = document.querySelector('script[src*="moe-live2d"]');
    return t ? t.src : "";
  })();
  var LIB_BASE = SELF ? SELF.replace(/\/[^\/?#]*([?#].*)?$/, "") : "";
  var CDN = String(CFG.cdnBase || "https://gcore.jsdelivr.net").replace(
    /\/+$/,
    "",
  );
  var LIBS = LIB_BASE
    ? [
        LIB_BASE + "/live2dcubismcore.min.js",
        LIB_BASE + "/pixi.min.js",
        LIB_BASE + "/cubism4.min.js",
      ]
    : [
        "https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js",
        CDN + "/npm/pixi.js@6.5.10/dist/browser/pixi.min.js",
        CDN + "/npm/pixi-live2d-display@0.4.0/dist/cubism4.min.js",
      ];

  var GREETINGS = [
    "欢迎来到这里～",
    "点点场景里的不同位置，会有不同反应。",
    "打开动作面板，可以查看模型的全部动作。",
    "我会跟着鼠标看向你哦。",
  ];

  var GROUP_NAMES = {
    跟宠: "角色与伙伴",
    桌面: "桌面互动",
    左耳: "左耳互动",
    右耳: "右耳互动",
    书: "画具与书本",
    背景: "背景场景",
    制作者: "模型信息",
    Shake: "摇晃动作",
    生日帽: "生日帽",
    恢复: "恢复初始状态",
    Start: "登场动作",
  };

  var FILE_LABELS = {
    heixiu: "嘿咻",
    xiaobai: "小白",
    shanxin: "山新",
    wuxian: "无限",
    bidiu: "比丢",
    agen: "阿根",
    "heixiu-xiaobai": "嘿咻与小白",
    "drawing-tablet": "数位板",
    mouse: "鼠标",
    "key-01": "键盘动作一",
    "key-02": "键盘动作二",
    "key-03": "键盘动作三",
    "arrow-left": "向左",
    "arrow-right": "向右",
    enter: "回车",
    "left-ear-01": "左耳互动一",
    "left-ear-02": "左耳互动二",
    "left-ear-03": "左耳互动三",
    "right-ear-01": "右耳互动一",
    "right-ear-02": "右耳互动二",
    "right-ear-03": "右耳互动三",
    book: "书",
    eyedropper: "吸管",
    eraser: "橡皮",
    "paint-bucket": "油漆桶",
    "page-turn": "翻页",
    "birthday-hat-01": "生日帽一",
    "birthday-hat-02": "生日帽二",
    "birthday-hat-03": "生日帽三",
    "spirit-space": "灵质空间",
    "magic-wand": "魔棒",
    brush: "画笔",
    carpet: "地毯",
    background: "背景",
    creator: "制作者信息",
    reset: "恢复",
    "shake-01": "摇晃一",
    "shake-02": "摇晃二",
    start: "正式登场",
  };

  var ICONS = {
    actions:
      '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.6 4.4L6 9l4.4 1.6L12 15l1.6-4.4L18 9l-4.4-1.6L12 3Z"/><path d="m5 15-.8 2.2L2 18l2.2.8L5 21l.8-2.2L8 18l-2.2-.8L5 15Z"/><path d="m19 13-1 2.7-2.7 1L18 18l1 2.7 1-2.7 2.7-1-2.7-1L19 13Z"/></svg>',
    random:
      '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="m4 4 5 5"/></svg>',
    sound:
      '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
    muted:
      '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/></svg>',
    reset:
      '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v6h6"/></svg>',
    switcher:
      '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
    home: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>',
    close:
      '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  };

  var widget = null;
  var canvas = null;
  var bubbleEl = null;
  var fab = null;
  var panel = null;
  var panelBody = null;
  var panelTitle = null;
  var soundButton = null;
  var actionButton = null;
  var app = null;
  var model = null;
  var currentIndex = 0;
  var currentMeta = null;
  var currentCatalog = null;
  var bubbleTimer = null;
  var loadStarted = false;
  var modelToken = 0;
  var lastActivity = Date.now();
  var lastHitAt = 0;
  var suppressCanvasClickUntil = 0;
  var idleTimer = null;
  var soundEnabled = readStoredBool("moe-l2d-sound", true);
  var dragState = null;
  var trackingTarget = { x: 0, y: 0 };
  var trackingCurrent = { x: 0, y: 0 };
  var panelSceneMode = null;
  var panelCompanionMode = null;
  var panelBackgroundMode = null;

  function readStoredBool(key, fallback) {
    try {
      var value = localStorage.getItem(key);
      if (value === null) return fallback;
      return value === "1";
    } catch (e) {
      return fallback;
    }
  }

  function store(key, value) {
    try {
      if (value === null || value === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, String(value));
    } catch (e) {}
  }

  function calcSize() {
    var w = Math.round(BASE_W * SCALE);
    var h = Math.round(BASE_H * SCALE);
    var maxH = Math.round((window.innerHeight || 800) * 0.78);
    var maxW = Math.round((window.innerWidth || 1200) * 0.4);
    var k = Math.min(1, maxH / h, maxW / w);
    return { w: Math.round(w * k), h: Math.round(h * k) };
  }

  var initialSize = calcSize();
  var W = initialSize.w;
  var H = initialSize.h;

  function injectStyles() {
    if (document.getElementById("moe-l2d-enhanced-style")) return;
    var style = document.createElement("style");
    style.id = "moe-l2d-enhanced-style";
    style.textContent = [
      ".moe-l2d{--l2d-card:var(--moe-card,#fff);--l2d-bg:var(--moe-bg-2,#f8f4f7);--l2d-text:var(--moe-text,#332c34);--l2d-muted:var(--moe-muted,#786f79);--l2d-border:var(--moe-border,rgba(50,40,50,.13));--l2d-theme:var(--moe-theme,#ef7aa8);--l2d-shadow:var(--moe-shadow,0 12px 32px rgba(50,30,45,.18));position:fixed;bottom:0;z-index:9990;pointer-events:none;transition:transform .35s cubic-bezier(.2,.8,.3,1),opacity .35s ease;touch-action:none}",
      ".moe-l2d-right{right:0}.moe-l2d-left{left:0}",
      ".moe-l2d-canvas{display:block;width:100%;height:100%;pointer-events:auto;cursor:grab;touch-action:none}.moe-l2d.is-dragging .moe-l2d-canvas{cursor:grabbing}",
      ".moe-l2d-off.moe-l2d-right{transform:translateX(125%);opacity:0;pointer-events:none}.moe-l2d-off.moe-l2d-left{transform:translateX(-125%);opacity:0;pointer-events:none}",
      ".moe-l2d-tools{position:absolute;top:8px;display:flex;gap:6px;opacity:.2;transition:opacity .2s ease;pointer-events:auto;z-index:8}.moe-l2d-right .moe-l2d-tools{right:8px}.moe-l2d-left .moe-l2d-tools{left:8px}.moe-l2d:hover .moe-l2d-tools,.moe-l2d:focus-within .moe-l2d-tools{opacity:1}",
      ".moe-l2d-tools button,.moe-l2d-panel button{font:inherit}.moe-l2d-tool{width:31px;height:31px;border:1px solid var(--l2d-border);border-radius:50%;background:color-mix(in srgb,var(--l2d-card) 91%,transparent);color:var(--l2d-muted);box-shadow:0 5px 16px rgba(30,20,30,.15);backdrop-filter:blur(8px);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;transition:color .18s ease,transform .16s ease,background .18s ease}.moe-l2d-tool:hover,.moe-l2d-tool.is-active{color:var(--l2d-theme);background:var(--l2d-card);transform:translateY(-2px)}",
      ".moe-l2d-bubble{position:absolute;bottom:calc(100% - 12px);width:max-content;max-width:min(300px,70vw);white-space:pre-line;background:var(--l2d-card);color:var(--l2d-text);border:1px solid var(--l2d-border);border-radius:14px;box-shadow:var(--l2d-shadow);padding:10px 14px;font-size:13px;line-height:1.65;pointer-events:none;animation:moeL2dEnhancedPop .22s ease;z-index:10}.moe-l2d-right .moe-l2d-bubble{right:7%}.moe-l2d-left .moe-l2d-bubble{left:7%}.moe-l2d-bubble[hidden]{display:none}",
      "@keyframes moeL2dEnhancedPop{from{transform:translateY(7px) scale(.97);opacity:0}to{transform:none;opacity:1}}",
      ".moe-l2d-panel{position:absolute;bottom:42px;width:292px;max-height:min(66vh,620px);display:flex;flex-direction:column;overflow:hidden;background:color-mix(in srgb,var(--l2d-card) 96%,transparent);color:var(--l2d-text);border:1px solid var(--l2d-border);border-radius:17px;box-shadow:var(--l2d-shadow);backdrop-filter:blur(14px);pointer-events:auto;z-index:12;animation:moeL2dEnhancedPop .2s ease}.moe-l2d-panel[hidden]{display:none}.moe-l2d-right .moe-l2d-panel{right:calc(100% - 22px)}.moe-l2d-left .moe-l2d-panel{left:calc(100% - 22px)}",
      ".moe-l2d-panel-head{display:flex;align-items:center;gap:8px;padding:11px 12px 9px;border-bottom:1px solid var(--l2d-border)}.moe-l2d-panel-title{font-size:14px;font-weight:700;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.moe-l2d-panel-head button{width:28px;height:28px;border:none;border-radius:9px;background:var(--l2d-bg);color:var(--l2d-muted);display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}.moe-l2d-panel-head button:hover{color:var(--l2d-theme)}",
      ".moe-l2d-panel-body{overflow:auto;padding:8px 9px 10px;overscroll-behavior:contain}.moe-l2d-panel-empty{padding:18px 10px;text-align:center;color:var(--l2d-muted);font-size:13px;line-height:1.7}",
      ".moe-l2d-group{border:1px solid var(--l2d-border);border-radius:11px;background:var(--l2d-bg);overflow:hidden;margin-bottom:7px}.moe-l2d-group:last-child{margin-bottom:0}.moe-l2d-group summary{list-style:none;cursor:pointer;padding:8px 10px;font-size:13px;font-weight:650;display:flex;align-items:center;justify-content:space-between}.moe-l2d-group summary::-webkit-details-marker{display:none}.moe-l2d-group summary::after{content:'›';font-size:18px;line-height:1;color:var(--l2d-muted);transform:rotate(90deg);transition:transform .18s ease}.moe-l2d-group[open] summary::after{transform:rotate(-90deg)}",
      ".moe-l2d-action-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;padding:0 7px 8px}.moe-l2d-action{min-width:0;border:1px solid var(--l2d-border);border-radius:9px;background:var(--l2d-card);color:var(--l2d-text);padding:7px 8px;font-size:12px;line-height:1.35;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:border-color .16s ease,color .16s ease,transform .16s ease}.moe-l2d-action:hover,.moe-l2d-action.is-active{border-color:var(--l2d-theme);color:var(--l2d-theme);transform:translateY(-1px)}",
      ".moe-l2d-panel-foot{padding:8px 11px;border-top:1px solid var(--l2d-border);font-size:11px;line-height:1.55;color:var(--l2d-muted)}",
      ".moe-l2d-fab{position:fixed;bottom:24px;z-index:9991;width:46px;height:46px;border:none;border-radius:50%;background:var(--moe-theme,#ef7aa8);color:#fff;box-shadow:0 9px 24px rgba(60,30,50,.25);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .2s ease,bottom .25s ease}.moe-l2d-fab:hover{transform:scale(1.08)}.moe-l2d-fab.moe-l2d-right{right:24px}.moe-l2d-fab.moe-l2d-left{left:24px}.moe-l2d-fab.near-bottom{bottom:82px}.moe-l2d-fab[hidden]{display:none}",
      "@media(max-width:900px){.moe-l2d-panel{width:min(280px,72vw)}}",
      "@media(prefers-reduced-motion:reduce){.moe-l2d,.moe-l2d-tool,.moe-l2d-action{transition:none!important}.moe-l2d-bubble,.moe-l2d-panel{animation:none!important}}",
    ].join("");
    document.head.appendChild(style);
  }

  function loadSeq(list, done) {
    var i = 0;
    var failed = [];
    (function next() {
      if (i >= list.length) {
        done(failed);
        return;
      }
      var url = list[i++];
      var existing = document.querySelector(
        'script[src="' + url.replace(/"/g, '\\"') + '"]',
      );
      if (existing) {
        next();
        return;
      }
      var s = document.createElement("script");
      s.src = url;
      s.async = false;
      s.onload = next;
      s.onerror = function () {
        console.error("[moe-live2d] 运行库加载失败：" + url);
        failed.push(url);
        next();
      };
      document.head.appendChild(s);
    })();
  }

  function buttonHTML(role, title, icon, extraClass) {
    return (
      '<button type="button" class="moe-l2d-tool ' +
      (extraClass || "") +
      '" data-role="' +
      role +
      '" title="' +
      escapeHTML(title) +
      '" aria-label="' +
      escapeHTML(title) +
      '">' +
      icon +
      "</button>"
    );
  }

  function buildWidget() {
    injectStyles();
    widget = document.createElement("div");
    widget.id = "moe-l2d";
    widget.className = "moe-l2d moe-l2d-" + POS;
    widget.style.width = W + "px";
    widget.style.height = H + "px";
    widget.innerHTML =
      '<div class="moe-l2d-bubble" data-role="bubble" hidden></div>' +
      '<canvas class="moe-l2d-canvas" aria-label="Live2D 桌宠"></canvas>' +
      '<div class="moe-l2d-tools">' +
      (ENABLE_PANEL ? buttonHTML("actions", "动作面板", ICONS.actions) : "") +
      buttonHTML("random", "随机动作", ICONS.random) +
      buttonHTML(
        "sound",
        soundEnabled ? "关闭声音" : "开启声音",
        soundEnabled ? ICONS.sound : ICONS.muted,
      ) +
      buttonHTML("reset-model", "重置模型状态", ICONS.reset) +
      (models.length > 1
        ? buttonHTML("switch", "切换角色", ICONS.switcher)
        : "") +
      (ENABLE_DRAG ? buttonHTML("home", "恢复桌宠位置", ICONS.home) : "") +
      buttonHTML("hide", "隐藏桌宠", ICONS.close) +
      "</div>" +
      (ENABLE_PANEL
        ? '<section class="moe-l2d-panel" data-role="panel" hidden aria-label="Live2D 动作面板">' +
          '<div class="moe-l2d-panel-head"><strong class="moe-l2d-panel-title" data-role="panel-title">动作</strong>' +
          '<button type="button" data-role="panel-random" title="随机动作" aria-label="随机动作">' +
          ICONS.random +
          "</button>" +
          '<button type="button" data-role="panel-close" title="关闭面板" aria-label="关闭面板">' +
          ICONS.close +
          "</button></div>" +
          '<div class="moe-l2d-panel-body" data-role="panel-body"></div>' +
          '<div class="moe-l2d-panel-foot">点击模型仍使用模型原始互动；面板只展示整理后的动作菜单。</div>' +
          "</section>"
        : "");
    document.body.appendChild(widget);

    canvas = widget.querySelector(".moe-l2d-canvas");
    bubbleEl = widget.querySelector('[data-role="bubble"]');
    panel = widget.querySelector('[data-role="panel"]');
    panelBody = widget.querySelector('[data-role="panel-body"]');
    panelTitle = widget.querySelector('[data-role="panel-title"]');
    soundButton = widget.querySelector('[data-role="sound"]');
    actionButton = widget.querySelector('[data-role="actions"]');

    fab = document.createElement("button");
    fab.type = "button";
    fab.className = "moe-l2d-fab moe-l2d-" + POS;
    fab.title = "召唤桌宠";
    fab.setAttribute("aria-label", "召唤桌宠");
    fab.hidden = true;
    fab.innerHTML =
      '<svg viewBox="0 0 24 24" width="23" height="23" fill="currentColor"><path d="M12 21s-7.2-4.6-9.6-9C1.1 9.2 2.3 5.8 5.5 5.1c1.9-.4 3.8.4 4.9 1.9L12 8.6l1.6-1.6c1.1-1.5 3-2.3 4.9-1.9 3.2.7 4.4 4.1 3.1 6.9-2.4 4.4-9.6 9-9.6 9Z"/></svg>';
    document.body.appendChild(fab);

    bindTool("actions", togglePanel);
    bindTool("random", function () {
      playRandomMotion(false);
    });
    bindTool("sound", toggleSound);
    bindTool("reset-model", resetModelState);
    bindTool("switch", switchModel);
    bindTool("home", resetWidgetPosition);
    bindTool("hide", hideWidget);

    if (panel) {
      panel
        .querySelector('[data-role="panel-close"]')
        .addEventListener("click", function () {
          setPanel(false);
        });
      panel
        .querySelector('[data-role="panel-random"]')
        .addEventListener("click", function () {
          playRandomMotion(false);
        });
      panelBody.addEventListener("click", function (event) {
        var actionBtn = event.target.closest
          ? event.target.closest("[data-panel-action]")
          : null;
        if (actionBtn) {
          handlePanelAction(actionBtn.getAttribute("data-panel-action"));
          return;
        }
        var btn = event.target.closest
          ? event.target.closest("[data-motion-group]")
          : null;
        if (!btn) return;
        var item = getMotionItem(
          btn.getAttribute("data-motion-group"),
          parseInt(btn.getAttribute("data-motion-index"), 10),
        );
        playStatefulMotionItem(item, { source: "panel" });
      });
    }

    fab.addEventListener("click", function () {
      startLoad();
      widget.classList.remove("moe-l2d-off");
      fab.hidden = true;
      store("moe-l2d-hidden", null);
      touchActivity();
      say(randomItem(GREETINGS));
    });

    if (readStoredBool("moe-l2d-hidden", false)) {
      widget.classList.add("moe-l2d-off");
      fab.hidden = false;
    }

    restoreWidgetPosition();
    if (ENABLE_DRAG) bindDragging();
    bindFooterLift();
  }

  function bindTool(role, handler) {
    var el = widget.querySelector('[data-role="' + role + '"]');
    if (!el) return;
    el.addEventListener("click", function (event) {
      event.stopPropagation();
      touchActivity();
      handler(event);
    });
  }

  function bindFooterLift() {
    function update() {
      var y = window.pageYOffset || document.documentElement.scrollTop || 0;
      var max = Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight,
      );
      fab.classList.toggle("near-bottom", max > 0 && max - y < 150);
    }
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    update();
  }

  function hideWidget() {
    setPanel(false);
    widget.classList.add("moe-l2d-off");
    fab.hidden = false;
    store("moe-l2d-hidden", "1");
  }

  function togglePanel() {
    setPanel(panel && panel.hidden);
  }

  function setPanel(open) {
    if (!panel) return;
    panel.hidden = !open;
    if (actionButton) actionButton.classList.toggle("is-active", !!open);
    if (open) touchActivity();
  }

  function toggleSound() {
    soundEnabled = !soundEnabled;
    store("moe-l2d-sound", soundEnabled ? "1" : "0");
    applySoundSetting();
    say(soundEnabled ? "声音已开启。" : "声音已关闭。", 1800);
  }

  function applySoundSetting() {
    if (soundButton) {
      soundButton.innerHTML = soundEnabled ? ICONS.sound : ICONS.muted;
      soundButton.title = soundEnabled ? "关闭声音" : "开启声音";
      soundButton.setAttribute("aria-label", soundButton.title);
      soundButton.classList.toggle("is-active", soundEnabled);
    }
    try {
      if (window.PIXI && PIXI.live2d && PIXI.live2d.config)
        PIXI.live2d.config.sound = soundEnabled;
      if (window.PIXI && PIXI.live2d && PIXI.live2d.SoundManager)
        PIXI.live2d.SoundManager.volume = SOUND_VOLUME;
    } catch (e) {
      console.warn("[moe-live2d] 无法更新声音设置：", e);
    }
  }

  function randomItem(array) {
    return array && array.length
      ? array[Math.floor(Math.random() * array.length)]
      : null;
  }

  function touchActivity() {
    lastActivity = Date.now();
  }

  function say(text, ms) {
    if (!bubbleEl || !text) return;
    bubbleEl.textContent = String(text).trim();
    bubbleEl.hidden = false;
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(function () {
      bubbleEl.hidden = true;
    }, ms || 4000);
  }

  function getJSON(url) {
    if (window.fetch) {
      return fetch(url, {
        mode: "cors",
        credentials: "omit",
        cache: "default",
      }).then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      });
    }
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", url, true);
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch (e) {
            reject(e);
          }
        } else reject(new Error("HTTP " + xhr.status));
      };
      xhr.onerror = function () {
        reject(new Error("网络错误"));
      };
      xhr.send();
    });
  }

  function basename(path) {
    var value = String(path || "").replace(/\\/g, "/");
    value = value.slice(value.lastIndexOf("/") + 1);
    return value.replace(/\.motion3\.json$/i, "").replace(/\.json$/i, "");
  }

  function motionLabel(group, entry, index) {
    var raw =
      entry && (entry.Name || entry.File) ? entry.Name || entry.File : "";
    var base = basename(raw);
    try {
      base = decodeURIComponent(base);
    } catch (e) {}
    if (FILE_LABELS[base]) return FILE_LABELS[base];
    if (/^[\u3400-\u9fff]/.test(base)) return base;
    if (group === "左耳") return "左耳互动" + (index + 1);
    if (group === "右耳") return "右耳互动" + (index + 1);
    if (group === "生日帽") return "生日帽状态" + (index + 1);
    if (group === "Start") return "登场动作" + (index + 1);
    return base || (GROUP_NAMES[group] || group) + " " + (index + 1);
  }

  function buildCatalog(meta) {
    var refs = meta && meta.FileReferences;
    var groups = refs && refs.Motions;
    if (!groups || typeof groups !== "object")
      return { groups: [], byName: {}, hitAreas: [], keyTriggers: [] };
    var catalog = {
      groups: [],
      byName: {},
      hitAreas: Array.isArray(meta.HitAreas) ? meta.HitAreas : [],
      keyTriggers: [],
    };
    Object.keys(groups).forEach(function (group) {
      var list = Array.isArray(groups[group]) ? groups[group] : [];
      var normalized = list.map(function (entry, index) {
        var item = {
          group: group,
          index: index,
          entry: entry || {},
          label: motionLabel(group, entry || {}, index),
        };
        var keys = [
          entry && entry.Name,
          entry && entry.File,
          basename(entry && entry.Name),
          basename(entry && entry.File),
        ].filter(Boolean);
        keys.forEach(function (key) {
          catalog.byName[group + ":" + key] = item;
          catalog.byName[group + ":" + basename(key)] = item;
        });
        return item;
      });
      if (normalized.length)
        catalog.groups.push({
          name: group,
          label: GROUP_NAMES[group] || group,
          items: normalized,
        });
    });
    var controllers = meta.Controllers || {};
    var keyController = controllers.KeyTrigger || {};
    if (keyController.Enabled !== false && Array.isArray(keyController.Items))
      catalog.keyTriggers = keyController.Items;
    return catalog;
  }

  function catalogGroup(name) {
    if (!currentCatalog) return null;
    return (
      currentCatalog.groups.filter(function (group) {
        return group.name === name;
      })[0] || null
    );
  }

  function itemByBase(groupName, names) {
    var group = catalogGroup(groupName);
    if (!group) return null;
    names = Array.isArray(names) ? names : [names];
    return (
      group.items.filter(function (item) {
        var entry = item.entry || {};
        var candidates = [entry.Name, entry.File].map(basename);
        return names.some(function (name) {
          return candidates.indexOf(name) >= 0;
        });
      })[0] || null
    );
  }

  function itemBase(item) {
    var entry = (item && item.entry) || {};
    return basename(entry.Name || entry.File);
  }

  function motionButton(item, label, active) {
    if (!item) return "";
    var hasSound = item.entry && item.entry.Sound;
    var title = (label || item.label) + (hasSound ? "（含音效）" : "");
    return (
      '<button type="button" class="moe-l2d-action' +
      (active ? " is-active" : "") +
      '" data-motion-group="' +
      escapeHTML(item.group) +
      '" data-motion-index="' +
      item.index +
      '" title="' +
      escapeHTML(title) +
      '">' +
      escapeHTML(label || item.label) +
      (hasSound ? " ♪" : "") +
      "</button>"
    );
  }

  function actionButtonHTML(action, label, active) {
    return (
      '<button type="button" class="moe-l2d-action' +
      (active ? " is-active" : "") +
      '" data-panel-action="' +
      escapeHTML(action) +
      '">' +
      escapeHTML(label) +
      "</button>"
    );
  }

  function renderPanelGroup(label, buttons, open) {
    buttons = buttons.filter(Boolean);
    if (!buttons.length) return "";
    return (
      '<details class="moe-l2d-group"' +
      (open !== false ? " open" : "") +
      "><summary>" +
      escapeHTML(label) +
      "<small>" +
      buttons.length +
      "</small></summary>" +
      '<div class="moe-l2d-action-grid">' +
      buttons.join("") +
      "</div></details>"
    );
  }

  function renderActionPanel() {
    if (!panelBody) return;
    panelTitle.textContent = models[currentIndex]
      ? models[currentIndex].name + " · 动作面板"
      : "动作面板";
    if (!currentCatalog || !currentCatalog.groups.length) {
      panelBody.innerHTML =
        '<div class="moe-l2d-panel-empty">该模型没有可读取的动作清单。<br>点击模型仍可使用它自身支持的交互。</div>';
      return;
    }

    var companion = catalogGroup("跟宠");
    var leftEar = catalogGroup("左耳");
    var rightEar = catalogGroup("右耳");
    var birthdayHat = catalogGroup("生日帽");
    var background = catalogGroup("背景");
    var creator = catalogGroup("制作者");

    var sceneButtons = [
      actionButtonHTML("scene-book", "书", panelSceneMode === "book"),
      actionButtonHTML("scene-desktop", "桌面", panelSceneMode === "desktop"),
    ];
    if (panelSceneMode === "book") {
      sceneButtons.push(motionButton(itemByBase("书", "page-turn"), "翻页"));
    }
    if (panelSceneMode === "desktop") {
      sceneButtons = sceneButtons.concat([
        motionButton(itemByBase("桌面", "drawing-tablet"), "数位板"),
        motionButton(itemByBase("桌面", "enter"), "回车"),
        motionButton(itemByBase("桌面", "key-01"), "按键1"),
        motionButton(itemByBase("桌面", "key-02"), "按键2"),
        motionButton(itemByBase("桌面", "key-03"), "按键3"),
      ]);
    }

    var html = [
      renderPanelGroup(
        "跟宠",
        companion
          ? companion.items.map(function (item) {
              return motionButton(
                item,
                null,
                panelCompanionMode === itemBase(item),
              );
            })
          : [],
        true,
      ),
      renderPanelGroup(
        "耳朵",
        []
          .concat(leftEar ? leftEar.items : [])
          .concat(rightEar ? rightEar.items : [])
          .map(function (item) {
            return motionButton(item);
          }),
      ),
      renderPanelGroup(
        "生日帽",
        birthdayHat
          ? birthdayHat.items.map(function (item) {
              return motionButton(item);
            })
          : [],
      ),
      renderPanelGroup("场景道具", sceneButtons),
      background
        ? renderPanelGroup("背景", [
            actionButtonHTML(
              "background-carpet",
              "地毯",
              panelBackgroundMode === "carpet",
            ),
            actionButtonHTML(
              "background-spirit",
              "灵质空间",
              panelBackgroundMode === "spirit",
            ),
          ])
        : "",
      renderPanelGroup(
        "制作者",
        creator
          ? creator.items.map(function (item) {
              return motionButton(item, "制作者");
            })
          : [],
      ),
    ]
      .filter(Boolean)
      .join("");

    panelBody.innerHTML =
      html ||
      '<div class="moe-l2d-panel-empty">该模型没有可展示的动作清单。</div>';
  }

  function handlePanelAction(action) {
    if (action === "scene-book") {
      panelSceneMode = "book";
      renderActionPanel();
      var book = itemByBase("书", "book");
      if (book) playMotion(book.group, book.index, { source: "panel" });
      return;
    }
    if (action === "scene-desktop") {
      panelSceneMode = "desktop";
      renderActionPanel();
      var mouse = itemByBase("桌面", "mouse");
      if (mouse) playMotion(mouse.group, mouse.index, { source: "panel" });
      return;
    }
    if (action.indexOf("background-") === 0) {
      handlePanelBackground(action.slice("background-".length));
    }
  }

  var COMPANION_PARAMS = {
    xiaobai: "Param17",
    shanxin: "Param18",
    agen: "Param19",
    wuxian: "Param20",
    bidiu: "Param21",
    heixiu: "Param22",
  };

  function setModelParameter(id, value) {
    var core = model && model.internalModel && model.internalModel.coreModel;
    if (!core || !core.setParameterValueById) return false;
    try {
      core.setParameterValueById(id, value, 1);
      return true;
    } catch (e) {
      return false;
    }
  }

  function companionParamForItem(item) {
    return COMPANION_PARAMS[itemBase(item)] || null;
  }

  function applyCompanionParameters(item) {
    var activeParam = companionParamForItem(item);
    Object.keys(COMPANION_PARAMS).forEach(function (name) {
      setModelParameter(
        COMPANION_PARAMS[name],
        COMPANION_PARAMS[name] === activeParam ? 1 : 0,
      );
    });
  }

  function backgroundModeForItem(item) {
    var base = itemBase(item);
    if (base === "carpet") return "carpet";
    if (base === "spirit-space" || base === "background") return "spirit";
    return null;
  }

  function applyPanelBackgroundParameters(mode) {
    if (mode !== "carpet" && mode !== "spirit") return false;
    var changed = false;
    changed = setModelParameter("Param2", mode === "carpet" ? 1 : 0) || changed;
    changed = setModelParameter("Param", mode === "spirit" ? 1 : 0) || changed;
    return changed;
  }

  function playStatefulMotionItem(item, options) {
    if (!item) return Promise.resolve(false);
    if (item.group === "跟宠") {
      panelCompanionMode = itemBase(item);
      applyCompanionParameters(item);
      renderActionPanel();
      return playMotion(item.group, item.index, options || {}).then(
        function (started) {
          applyCompanionParameters(item);
          renderActionPanel();
          return started;
        },
      );
    }
    if (item.group === "背景") {
      var mode = backgroundModeForItem(item);
      if (mode) {
        panelBackgroundMode = mode;
        applyPanelBackgroundParameters(mode);
        renderActionPanel();
        return playMotion(item.group, item.index, options || {}).then(
          function (started) {
            applyPanelBackgroundParameters(mode);
            renderActionPanel();
            return started;
          },
        );
      }
    }
    return playMotion(item.group, item.index, options || {});
  }

  function handlePanelBackground(mode) {
    if (mode !== "carpet" && mode !== "spirit") return;
    var item =
      mode === "carpet"
        ? itemByBase("背景", "carpet")
        : itemByBase("背景", ["spirit-space", "background"]);
    playStatefulMotionItem(item, { source: "panel" });
  }

  function resolveMotionReference(reference) {
    if (!currentCatalog || !reference) return null;
    var value = String(reference).trim();
    var colon = value.indexOf(":");
    if (colon < 0) {
      var groupOnly = currentCatalog.groups.filter(function (g) {
        return g.name === value;
      })[0];
      return groupOnly && groupOnly.items.length
        ? randomItem(groupOnly.items)
        : null;
    }
    var group = value.slice(0, colon);
    var key = value.slice(colon + 1);
    return (
      currentCatalog.byName[group + ":" + key] ||
      currentCatalog.byName[group + ":" + basename(key)] ||
      null
    );
  }

  function getMotionItem(group, index) {
    if (!currentCatalog) return null;
    var found = currentCatalog.groups.filter(function (g) {
      return g.name === group;
    })[0];
    return found && found.items[index] ? found.items[index] : null;
  }

  function forcePriority() {
    try {
      return (
        (PIXI.live2d.MotionPriority && PIXI.live2d.MotionPriority.FORCE) || 3
      );
    } catch (e) {
      return 3;
    }
  }

  function normalPriority() {
    try {
      return (
        (PIXI.live2d.MotionPriority && PIXI.live2d.MotionPriority.NORMAL) || 2
      );
    } catch (e) {
      return 2;
    }
  }

  function playMotion(group, index, options) {
    options = options || {};
    if (!model) return Promise.resolve(false);
    var item = getMotionItem(group, index);
    if (!item) return Promise.resolve(false);
    if (!options.auto) touchActivity();
    applySoundSetting();
    var priority = options.auto ? normalPriority() : forcePriority();
    var result;
    try {
      result = model.motion(group, index, priority);
    } catch (error) {
      console.error("[moe-live2d] 动作启动失败：", group, index, error);
      if (!options.quiet) say("动作启动失败：" + item.label, 2600);
      return Promise.resolve(false);
    }
    if (!options.quiet) {
      var text = item.entry && item.entry.Text;
      say(
        text || item.label,
        text && item.entry.TextDuration ? item.entry.TextDuration : 2800,
      );
    }
    return Promise.resolve(result)
      .then(function (started) {
        return started !== false;
      })
      .catch(function (error) {
        console.warn("[moe-live2d] 动作加载失败：", group, index, error);
        if (!options.quiet) say("动作资源加载失败：" + item.label, 3200);
        return false;
      });
  }

  function playableGroups(forAuto) {
    if (!currentCatalog) return [];
    var excluded = { 恢复: 1, Start: 1, Shake: 1 };
    if (forAuto) {
      excluded.制作者 = 1;
      excluded.生日帽 = 1;
      excluded.背景 = 1;
    }
    return currentCatalog.groups.filter(function (group) {
      return group.items.length && !excluded[group.name];
    });
  }

  function playRandomMotion(auto) {
    var groups = playableGroups(!!auto);
    if (!groups.length) {
      try {
        model.expression();
      } catch (e) {}
      if (!auto) say(randomItem(GREETINGS));
      return;
    }
    var group = randomItem(groups);
    var item = randomItem(group.items);
    playStatefulMotionItem(item, {
      auto: !!auto,
      quiet: !!auto,
      source: auto ? "idle" : "random",
    });
  }

  function playReference(reference, options) {
    var item = resolveMotionReference(reference);
    if (!item) return false;
    playStatefulMotionItem(item, options || {});
    return true;
  }

  function handleHit(areaNames) {
    if (!ENABLE_HIT || !currentCatalog) return;
    var names = Array.isArray(areaNames) ? areaNames : [areaNames];
    var area = null;
    for (var i = 0; i < names.length && !area; i++) {
      for (var j = 0; j < currentCatalog.hitAreas.length; j++) {
        if (currentCatalog.hitAreas[j].Name === names[i]) {
          area = currentCatalog.hitAreas[j];
          break;
        }
      }
    }
    if (!area) return;
    lastHitAt = Date.now();
    touchActivity();
    var reference = area.Motion;
    if (!reference && (area.Name === "左耳" || area.Name === "右耳"))
      reference = area.Name;
    if (reference && playReference(reference, { source: "hit" })) return;
    try {
      model.expression();
    } catch (e) {}
    say(area.Name || randomItem(GREETINGS));
  }

  function inputCodesForEvent(event) {
    var codes = [];
    if (typeof event.keyCode === "number") codes.push(event.keyCode);
    if (typeof event.which === "number") codes.push(event.which);
    var byCode = {
      ArrowLeft: [37, 9000],
      ArrowUp: [38],
      ArrowRight: [39, 9001],
      ArrowDown: [40],
      Enter: [13],
      Space: [32],
      CapsLock: [20],
      ShiftLeft: [16, 160],
      ShiftRight: [16, 161],
      ControlLeft: [17, 162],
      ControlRight: [17, 163],
      AltLeft: [18, 164],
      AltRight: [18, 165],
    };
    if (event.code && byCode[event.code])
      codes = codes.concat(byCode[event.code]);
    return codes.filter(function (value, index, array) {
      return array.indexOf(value) === index;
    });
  }

  function isTypingTarget(target) {
    if (!target) return false;
    var tag = String(target.tagName || "").toLowerCase();
    return (
      tag === "input" ||
      tag === "textarea" ||
      tag === "select" ||
      target.isContentEditable
    );
  }

  function bindKeyboard() {
    if (!ENABLE_KEYBOARD) return;
    document.addEventListener("keydown", function (event) {
      if (
        !model ||
        !currentCatalog ||
        event.repeat ||
        isTypingTarget(event.target) ||
        widget.classList.contains("moe-l2d-off")
      )
        return;
      var codes = inputCodesForEvent(event);
      var item = currentCatalog.keyTriggers.filter(function (trigger) {
        return codes.indexOf(Number(trigger.Input)) >= 0;
      })[0];
      if (!item || !item.DownMtn) return;
      if (playReference(item.DownMtn, { source: "keyboard" })) touchActivity();
    });
  }

  function bindDragging() {
    canvas.addEventListener("pointerdown", function (event) {
      if (event.button !== undefined && event.button !== 0) return;
      var rect = widget.getBoundingClientRect();
      dragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        left: rect.left,
        top: rect.top,
        moved: false,
      };
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch (e) {}
    });

    canvas.addEventListener("pointermove", function (event) {
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      var dx = event.clientX - dragState.startX;
      var dy = event.clientY - dragState.startY;
      if (!dragState.moved && Math.sqrt(dx * dx + dy * dy) < 7) return;
      dragState.moved = true;
      widget.classList.add("is-dragging");
      var left = Math.max(
        -W * 0.25,
        Math.min(window.innerWidth - W * 0.75, dragState.left + dx),
      );
      var top = Math.max(
        0,
        Math.min(window.innerHeight - H * 0.35, dragState.top + dy),
      );
      widget.style.left = Math.round(left) + "px";
      widget.style.top = Math.round(top) + "px";
      widget.style.right = "auto";
      widget.style.bottom = "auto";
    });

    function endDrag(event) {
      if (
        !dragState ||
        (event.pointerId !== undefined &&
          dragState.pointerId !== event.pointerId)
      )
        return;
      if (dragState.moved) {
        suppressCanvasClickUntil = Date.now() + 350;
        var rect = widget.getBoundingClientRect();
        store(
          "moe-l2d-position",
          JSON.stringify({
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            vw: window.innerWidth,
            vh: window.innerHeight,
          }),
        );
      }
      widget.classList.remove("is-dragging");
      dragState = null;
    }
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
  }

  function restoreWidgetPosition() {
    var raw = null;
    try {
      raw = localStorage.getItem("moe-l2d-position");
    } catch (e) {}
    if (!raw) return;
    try {
      var saved = JSON.parse(raw);
      if (!isFinite(saved.left) || !isFinite(saved.top)) return;
      var left = Math.max(
        -W * 0.25,
        Math.min(window.innerWidth - W * 0.75, saved.left),
      );
      var top = Math.max(0, Math.min(window.innerHeight - H * 0.35, saved.top));
      widget.style.left = Math.round(left) + "px";
      widget.style.top = Math.round(top) + "px";
      widget.style.right = "auto";
      widget.style.bottom = "auto";
    } catch (e) {
      store("moe-l2d-position", null);
    }
  }

  function resetModelState() {
    panelSceneMode = null;
    panelCompanionMode = null;
    panelBackgroundMode = null;
    renderActionPanel();
    if (playReference("恢复", { source: "reset-model" })) return;
    say("当前模型没有配置恢复动作。", 2200);
  }

  function resetWidgetPosition() {
    store("moe-l2d-position", null);
    widget.style.top = "auto";
    widget.style.bottom = "0";
    if (POS === "right") {
      widget.style.right = "0";
      widget.style.left = "auto";
    } else {
      widget.style.left = "0";
      widget.style.right = "auto";
    }
    say("已经回到默认位置。", 1800);
  }

  function initPixi() {
    try {
      var L2D = PIXI.live2d.Live2DModel;
      if (L2D && L2D.registerTicker && PIXI.Ticker)
        L2D.registerTicker(PIXI.Ticker);
      if (L2D && L2D.registerInteraction && PIXI.InteractionManager)
        L2D.registerInteraction(PIXI.InteractionManager);
    } catch (e) {
      console.warn("[moe-live2d] Ticker/Interaction 注册失败：", e);
    }

    applySoundSetting();
    try {
      if (PIXI.settings) PIXI.settings.FAIL_IF_MAJOR_PERFORMANCE_CAVEAT = false;
      app = new PIXI.Application({
        view: canvas,
        width: W,
        height: H,
        backgroundAlpha: 0,
        antialias: true,
        autoStart: true,
        resolution: DPR,
        autoDensity: true,
      });
    } catch (error) {
      console.error("[moe-live2d] WebGL 渲染器创建失败：", error);
      say("桌宠需要 WebGL，请检查浏览器硬件加速设置。", 9000);
      return;
    }

    document.addEventListener(
      "mousemove",
      function (event) {
        if (!model || widget.classList.contains("moe-l2d-off")) return;
        var rect = canvas.getBoundingClientRect();
        try {
          model.focus(event.clientX - rect.left, event.clientY - rect.top);
        } catch (e) {}
        var cx = rect.left + rect.width / 2;
        var cy = rect.top + rect.height / 2;
        trackingTarget.x = Math.max(
          -1,
          Math.min(
            1,
            (event.clientX - cx) / Math.max(1, window.innerWidth * 0.42),
          ),
        );
        trackingTarget.y = Math.max(
          -1,
          Math.min(
            1,
            (event.clientY - cy) / Math.max(1, window.innerHeight * 0.42),
          ),
        );
      },
      { passive: true },
    );

    if (app.ticker && app.ticker.add)
      app.ticker.add(applyExtendedMouseTracking);

    canvas.addEventListener("click", function () {
      if (!model || Date.now() < suppressCanvasClickUntil) return;
      window.setTimeout(function () {
        if (Date.now() - lastHitAt < 180) return;
        touchActivity();
        playRandomMotion(false);
      }, 70);
    });

    bindKeyboard();
    loadModel(currentIndex, true);
    startIdleLoop();

    var resizeTimer = null;
    window.addEventListener(
      "resize",
      function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
          var size = calcSize();
          if (size.w !== W || size.h !== H) {
            W = size.w;
            H = size.h;
            widget.style.width = W + "px";
            widget.style.height = H + "px";
            try {
              app.renderer.resize(W, H);
            } catch (e) {}
            placeModel();
          }
          if (widget.style.top) {
            var rect = widget.getBoundingClientRect();
            if (rect.left > window.innerWidth || rect.top > window.innerHeight)
              resetWidgetPosition();
          }
        }, 180);
      },
      { passive: true },
    );
  }

  function applyExtendedMouseTracking(delta) {
    if (!model || !currentMeta || widget.classList.contains("moe-l2d-off"))
      return;
    var controller =
      currentMeta.Controllers && currentMeta.Controllers.MouseTracking;
    if (
      !controller ||
      controller.Enabled === false ||
      !Array.isArray(controller.Items)
    )
      return;
    var smoothing = Math.min(1, Math.max(0.025, Number(delta || 1) * 0.08));
    trackingCurrent.x += (trackingTarget.x - trackingCurrent.x) * smoothing;
    trackingCurrent.y += (trackingTarget.y - trackingCurrent.y) * smoothing;
    var standard = {
      ParamAngleX: 1,
      ParamAngleY: 1,
      ParamAngleZ: 1,
      ParamBodyAngleX: 1,
      ParamEyeBallX: 1,
      ParamEyeBallY: 1,
    };
    var core = model.internalModel && model.internalModel.coreModel;
    if (!core || !core.setParameterValueById) return;
    controller.Items.forEach(function (item) {
      if (!item || !item.Id || standard[item.Id]) return;
      var normalized =
        Number(item.Axis) === 1 ? trackingCurrent.y : trackingCurrent.x;
      if (item.Inverted) normalized = -normalized;
      var min = isFinite(Number(item.Min)) ? Number(item.Min) : -1;
      var max = isFinite(Number(item.Max)) ? Number(item.Max) : 1;
      var value = min + (normalized + 1) * 0.5 * (max - min);
      try {
        core.setParameterValueById(item.Id, value, 1);
      } catch (e) {}
    });
  }

  function loadModel(index, greet) {
    var descriptor = models[index];
    if (!descriptor) return;
    var token = ++modelToken;
    say("正在加载 " + descriptor.name + "…", 2200);
    currentMeta = null;
    currentCatalog = null;
    panelSceneMode = null;
    panelCompanionMode = null;
    panelBackgroundMode = null;
    renderActionPanel();

    var metaPromise = getJSON(descriptor.url).catch(function (error) {
      console.warn(
        "[moe-live2d] 扩展元数据读取失败，将按普通模型加载：",
        error,
      );
      return null;
    });

    var modelPromise;
    try {
      modelPromise = PIXI.live2d.Live2DModel.from(descriptor.url, {
        autoInteract: true,
      });
    } catch (error) {
      console.error("[moe-live2d] 模型创建失败：", error);
      say("模型创建失败：" + (error.message || error), 8000);
      return;
    }

    Promise.all([metaPromise, modelPromise])
      .then(function (result) {
        if (token !== modelToken) {
          try {
            result[1].destroy();
          } catch (e) {}
          return;
        }
        if (model) {
          app.stage.removeChild(model);
          try {
            model.destroy();
          } catch (e) {}
        }
        currentMeta = result[0];
        currentCatalog = buildCatalog(currentMeta || {});
        model = result[1];
        app.stage.addChild(model);
        placeModel();
        renderActionPanel();

        model.on("hit", function (areaNames) {
          handleHit(areaNames);
        });
        try {
          var manager =
            model.internalModel && model.internalModel.motionManager;
          if (manager && manager.on) {
            manager.on("motionStart", function (group, motionIndex, audio) {
              var item = getMotionItem(group, motionIndex);
              if (item && item.entry && item.entry.Text)
                say(item.entry.Text, item.entry.TextDuration || 5000);
              if (audio && item && item.entry) {
                var localVolume = isFinite(Number(item.entry.SoundVolume))
                  ? Number(item.entry.SoundVolume)
                  : 1;
                try {
                  audio.volume = soundEnabled
                    ? Math.max(0, Math.min(1, SOUND_VOLUME * localVolume))
                    : 0;
                } catch (e) {}
              }
            });
          }
        } catch (e) {}

        touchActivity();
        if (greet) say(descriptor.name + " 已经来啦。点点不同位置试试。", 3800);
        if (ENABLE_START) {
          window.setTimeout(function () {
            if (token !== modelToken || !currentCatalog) return;
            var startGroup = currentCatalog.groups.filter(function (g) {
              return g.name === "Start";
            })[0];
            if (!startGroup) return;
            var preferred =
              startGroup.items.filter(function (item) {
                return /\/start\.motion3\.json$/i.test(item.entry.File || "");
              })[0] || startGroup.items[0];
            if (preferred)
              playMotion(preferred.group, preferred.index, {
                auto: true,
                quiet: true,
                source: "start",
              });
          }, 600);
        }
      })
      .catch(function (error) {
        if (token !== modelToken) return;
        console.error("[moe-live2d] 模型加载失败：", descriptor.url, error);
        say(
          "模型加载失败：" +
            (error && error.message
              ? error.message
              : "请检查 URL、文件路径和 CORS"),
          9000,
        );
      });
  }

  function placeModel() {
    if (!model) return;
    var mw = model.width;
    var mh = model.height;
    if (!mw || !mh) return;
    var fit = Math.min(W / mw, H / mh) * 0.985;
    model.scale.set(fit);
    var sw = mw * fit;
    var sh = mh * fit;
    var slack = Math.max(0, W - sw);
    model.x = POS === "left" ? slack * 0.08 : slack * 0.92;
    model.y = H - sh + Math.round(H * 0.018);
  }

  function switchModel() {
    if (models.length < 2) {
      say("当前只配置了一个角色。", 2000);
      return;
    }
    setPanel(false);
    currentIndex = (currentIndex + 1) % models.length;
    loadModel(currentIndex, true);
  }

  function startIdleLoop() {
    clearInterval(idleTimer);
    if (!ENABLE_IDLE || REDUCED_MOTION) return;
    idleTimer = setInterval(function () {
      if (
        !model ||
        document.hidden ||
        widget.classList.contains("moe-l2d-off") ||
        (panel && !panel.hidden)
      )
        return;
      if (Date.now() - lastActivity < IDLE_SECONDS * 1000) return;
      playRandomMotion(true);
      touchActivity();
    }, 5000);
  }

  function runtimeReady() {
    return !!(window.PIXI && PIXI.live2d && PIXI.live2d.Live2DModel);
  }

  function finishRuntimeLoad(failed) {
    if (!runtimeReady()) {
      console.error("[moe-live2d] 运行库未就绪：", failed || []);
      say("Live2D 运行库加载失败，请检查网络或主题资源。", 7000);
      return;
    }
    try {
      initPixi();
    } catch (error) {
      console.error("[moe-live2d] 初始化失败：", error);
      say("桌宠初始化失败：" + (error.message || error), 9000);
    }
  }

  function startLoad() {
    if (loadStarted) return;
    loadStarted = true;
    if (runtimeReady()) {
      finishRuntimeLoad([]);
      return;
    }
    loadSeq(LIBS, finishRuntimeLoad);
  }

  function boot() {
    if (window.__moeL2dBooted) return;
    window.__moeL2dBooted = true;
    var isMobile =
      window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
    if (isMobile && !ENABLE_MOBILE) return;
    buildWidget();
    startLoad();
  }

  if (document.readyState !== "loading") boot();
  else document.addEventListener("DOMContentLoaded", boot);
})();
