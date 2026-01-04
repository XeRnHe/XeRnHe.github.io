import { load } from "cheerio";

/**
 * 从文件名生成数字 ID
 * @param {string} fileName - 文件名
 * @returns {number} - 生成的数字ID
 */
export const generateId = (fileName) => {
  // 保持原有哈希算法与取模逻辑不变（避免影响外部依赖的 ID 稳定性）
  const name = typeof fileName === "string" ? fileName : String(fileName ?? "");
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
  }
  return Math.abs(hash % 10000000000);
};

/**
 * 动态加载脚本
 * @param {string} src - 脚本 URL
 * @param {object} option - 配置
 */
export const loadScript = (src, option = {}) => {
  if (typeof document === "undefined" || !src) return false;
  // 获取配置
  const { async = false, reload = false, callback } = option;

  // 检查是否已经加载过此脚本
  const existingScript = document.querySelector(`script[src="${src}"]`);
  if (existingScript) {
    console.log("已有重复脚本");
    if (!reload) {
      callback && callback(null, existingScript);
      return false;
    }
    existingScript.remove();
  }

  // 创建一个新的 script 标签并加载
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    if (async) script.async = true;

    script.onload = () => {
      resolve(script);
      callback && callback(null, script);
    };
    script.onerror = (error) => {
      reject(error);
      callback && callback(error);
    };

    document.head.appendChild(script);
  });
};

/**
 * 动态加载样式表
 * @param {string} href - 样式表 URL
 * @param {object} option - 配置
 */
export const loadCSS = (href, option = {}) => {
  if (typeof document === "undefined" || !href) return false;
  // 获取配置
  const { reload = false, callback } = option;

  // 检查是否已经加载过此样式表
  const existingLink = document.querySelector(`link[href="${href}"]`);
  if (existingLink) {
    console.log("已有重复样式");
    if (!reload) {
      callback && callback(null, existingLink);
      return false;
    }
    existingLink.remove();
  }

  // 创建新的 link 标签并设置属性
  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.href = href;
    link.rel = "stylesheet";
    link.type = "text/css";

    link.onload = () => {
      resolve(link);
      callback && callback(null, link);
    };
    link.onerror = (error) => {
      reject(error);
      callback && callback(error);
    };

    document.head.appendChild(link);
  });
};

/**
 * 跳转中转页
 * @param {string} html - 页面内容
 * @param {object} themeConfig - 主题配置
 * @param {boolean} isDom - 是否为 DOM 对象
 */
export const jumpRedirect = (html, themeConfig, isDom = false) => {
  try {
    // 是否为开发环境（保持原逻辑：开发环境不处理）
    const isDev = process.env.NODE_ENV === "development";
    if (isDev) return false;

    // 是否启用（做空值保护，避免 themeConfig 缺失时直接抛错）
    const cfg = themeConfig?.jumpRedirect;
    if (!cfg?.enable) return html;

    // 中转页地址
    const redirectPage = "/redirect";
    // 排除的 className
    const excludeClass = Array.isArray(cfg.exclude) ? cfg.exclude : [];

    // Base64：浏览器端 btoa 仅支持 Latin-1，这里做兼容处理；
    // Node 端优先用 Buffer。
    const toBase64 = (str) => {
      if (typeof Buffer !== "undefined") {
        return Buffer.from(str, "utf-8").toString("base64");
      }
      if (typeof btoa === "function") {
        try {
          return btoa(str);
        } catch {
          // unicode-safe
          return btoa(unescape(encodeURIComponent(str)));
        }
      }
      // 兜底：尽量不抛错（返回空字符串会被后续逻辑跳过）
      return "";
    };

    const buildRedirectHref = (rawHref) => {
      const encodedHref = toBase64(rawHref);
      // 注意：URLSearchParams 会把 '+' 当空格，这里必须 encodeURIComponent
      return `${redirectPage}?url=${encodeURIComponent(encodedHref)}`;
    };

    if (isDom) {
      if (typeof window === "undefined" || typeof document === "undefined") return false;

      // 所有链接
      const allLinks = [...document.getElementsByTagName("a")];
      if (allLinks?.length === 0) return false;

      allLinks.forEach((link) => {
        // 仅处理 target="_blank"
        if (link.getAttribute("target") !== "_blank") return;

        // 排除指定 class
        if (excludeClass.some((className) => link.classList.contains(className))) return;

        const linkHref = link.getAttribute("href");
        // 存在链接且非中转页
        if (!linkHref || linkHref.includes(redirectPage)) return;

        const redirectLink = buildRedirectHref(linkHref);
        if (!redirectLink) return;

        // 保存原始链接
        link.setAttribute("original-href", linkHref);
        // 覆盖 href
        link.setAttribute("href", redirectLink);
      });

      // 保持原行为：DOM 分支主要靠副作用，不返回 html
      return;
    }

    // SSR / 构建阶段：替换符合条件的标签
    const $ = load(html);

    $("a[target='_blank']").each((_, el) => {
      const $a = $(el);
      const href = $a.attr("href");
      if (!href || href.includes(redirectPage)) return;

      // 排除指定 class
      const classesStr = $a.attr("class") || "";
      const classes = classesStr ? classesStr.trim().split(/\s+/).filter(Boolean) : [];
      if (excludeClass.some((className) => classes.includes(className))) return;

      const redirectHref = buildRedirectHref(href);
      if (!redirectHref) return;

      // 直接改属性，保留原有 innerHTML 与其它属性（避免重建标签导致丢失内容/重复属性）
      $a.attr("original-href", href);
      $a.attr("href", redirectHref);
    });

    return $.html();
  } catch (error) {
    console.error("处理链接时出错：", error);
  }
};
