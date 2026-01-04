import { load } from "cheerio";

export const generateId = (fileName) => {
  const name = typeof fileName === "string" ? fileName : String(fileName ?? "");
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
  }
  return Math.abs(hash % 10000000000);
};

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


export const loadCSS = (href, option = {}) => {
  if (typeof document === "undefined" || !href) return false;
  const { reload = false, callback } = option;
  const existingLink = document.querySelector(`link[href="${href}"]`);
  if (existingLink) {
    console.log("已有重复样式");
    if (!reload) {
      callback && callback(null, existingLink);
      return false;
    }
    existingLink.remove();
  }

  // 创建新的 link
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


export const jumpRedirect = (html, themeConfig, isDom = false) => {
  try {
    const isDev = process.env.NODE_ENV === "development";
    if (isDev) return false;

    const cfg = themeConfig?.jumpRedirect;
    if (!cfg?.enable) return html;

    // 中转页地址
    const redirectPage = "/redirect";
    const excludeClass = Array.isArray(cfg.exclude) ? cfg.exclude : [];
    const toBase64 = (str) => {
      if (typeof Buffer !== "undefined") {
        return Buffer.from(str, "utf-8").toString("base64");
      }
      if (typeof btoa === "function") {
        try {
          return btoa(str);
        } catch {
          return btoa(unescape(encodeURIComponent(str)));
        }
      }
      return "";
    };

    const buildRedirectHref = (rawHref) => {
      const encodedHref = toBase64(rawHref);
      return `${redirectPage}?url=${encodeURIComponent(encodedHref)}`;
    };

    if (isDom) {
      if (typeof window === "undefined" || typeof document === "undefined") return false;

      // 所有链接
      const allLinks = [...document.getElementsByTagName("a")];
      if (allLinks?.length === 0) return false;

      allLinks.forEach((link) => {
        if (link.getAttribute("target") !== "_blank") return;

        if (excludeClass.some((className) => link.classList.contains(className))) return;

        const linkHref = link.getAttribute("href");
        if (!linkHref || linkHref.includes(redirectPage)) return;

        const redirectLink = buildRedirectHref(linkHref);
        if (!redirectLink) return;

        link.setAttribute("original-href", linkHref);
        link.setAttribute("href", redirectLink);
      });

      // 保持原行为
      return;
    }

    const $ = load(html);

    $("a[target='_blank']").each((_, el) => {
      const $a = $(el);
      const href = $a.attr("href");
      if (!href || href.includes(redirectPage)) return;

      const classesStr = $a.attr("class") || "";
      const classes = classesStr ? classesStr.trim().split(/\s+/).filter(Boolean) : [];
      if (excludeClass.some((className) => classes.includes(className))) return;

      const redirectHref = buildRedirectHref(href);
      if (!redirectHref) return;

      $a.attr("original-href", href);
      $a.attr("href", redirectHref);
    });

    return $.html();
  } catch (error) {
    console.error("处理链接时出错：", error);
  }
};
