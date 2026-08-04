const WEIBO_COMMENT_CLASS = "_input_1fox3_8";
const WEIBO_COMMENT_LABEL = "发布你的评论";
const FOCUS_PATCH_MARKER = Symbol.for(
  "chz.vimium-c-blur-input-focus.weibo-prevent-scroll",
);

export function isWeiboCommentInput(element) {
  if (!element || typeof element !== "object") return false;

  const className =
    typeof element.className === "string" ? element.className : "";
  if (className.includes(WEIBO_COMMENT_CLASS)) return true;

  if (typeof element.getAttribute !== "function") return false;
  return ["placeholder", "data-placeholder", "aria-label"].some(
    (attribute) =>
      element.getAttribute(attribute)?.trim() === WEIBO_COMMENT_LABEL,
  );
}

export function installWeiboPreventScrollFocus(windowObject = globalThis) {
  const prototype = windowObject.HTMLElement?.prototype;
  const currentFocus = prototype?.focus;
  if (typeof currentFocus !== "function" || currentFocus[FOCUS_PATCH_MARKER]) {
    return false;
  }

  function focusWithoutCommentScroll(...args) {
    if (!isWeiboCommentInput(this)) {
      return Reflect.apply(currentFocus, this, args);
    }

    const options =
      args[0] && typeof args[0] === "object" ? { ...args[0] } : {};
    options.preventScroll = true;
    return Reflect.apply(currentFocus, this, [options]);
  }

  Object.defineProperty(focusWithoutCommentScroll, FOCUS_PATCH_MARKER, {
    value: true,
  });
  prototype.focus = focusWithoutCommentScroll;
  return true;
}
