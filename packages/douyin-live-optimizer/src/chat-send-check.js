// Observe only the site's own chat POST. Never send, retry, or persist content.
export function isChatRequest(url, base) {
  try { const value = new URL(url, base); return value.origin === new URL(base).origin && value.pathname === '/webcast/room/chat/'; }
  catch { return false; }
}

export function classifyChatResponse(body) {
  if (!body || typeof body !== 'object' || typeof body.status_code !== 'number') return { kind: 'unconfirmed', label: '发送结果未确认' };
  if (body.status_code !== 0) return { kind: 'rejected', label: '平台拒绝发送', code: body.status_code };
  const data = body.data;
  // These are protocol flags, not a general shadow-ban oracle. Absence does not
  // establish public visibility; the page itself inserts successful replies.
  if (data?.send_review === true) return { kind: 'review', label: '平台返回待审核标记' };
  if (data?.visible_to_sender === true) return { kind: 'restricted', label: '平台返回发送者可见标记' };
  return { kind: 'accepted', label: '平台已受理；公开可见性未确认' };
}

export function observeChatRequests({ window, getScope, onResult }) {
  let destroyed = false;
  const originalFetch = window.fetch;
  const pending = new Set();
  const report = (scope, body) => { if (!destroyed && scope && scope === getScope()) onResult(classifyChatResponse(body), body?.data?.msg_id_str); };
  const wrappedFetch = typeof originalFetch === 'function' ? function (...args) {
    if (destroyed) return originalFetch.apply(this, args);
    const request = args[0];
    const url = typeof request === 'string' || request instanceof URL ? String(request) : request?.url;
    const method = args[1]?.method || request?.method || 'GET';
    const scope = getScope();
    const observed = method.toUpperCase() === 'POST' && isChatRequest(url, window.location.href);
    // Return the original promise unchanged. Monitoring failure never affects sending.
    const result = originalFetch.apply(this, args);
    if (observed) result.then((response) => {
      if (destroyed) return;
      return response.clone().json().then((body) => report(scope, body));
    }).catch(() => report(scope, null));
    return result;
  } : null;
  if (wrappedFetch) window.fetch = wrappedFetch;
  const prototype = window.XMLHttpRequest?.prototype;
  const originalOpen = prototype?.open;
  const originalSend = prototype?.send;
  const requests = new WeakMap();
  const wrappedOpen = function (method, url, ...rest) {
    if (destroyed) return originalOpen.call(this, method, url, ...rest);
    requests.set(this, { observed: String(method).toUpperCase() === 'POST' && isChatRequest(url, window.location.href) });
    return originalOpen.call(this, method, url, ...rest);
  };
  const wrappedSend = function (...args) {
    if (destroyed) return originalSend.apply(this, args);
    if (requests.get(this)?.observed) {
      const scope = getScope();
      const xhr = this;
      const finished = () => {
        pending.delete(remove);
        xhr.removeEventListener('loadend', finished);
        try {
          report(scope, xhr.responseType === 'json' ? xhr.response : !xhr.responseType || xhr.responseType === 'text' ? JSON.parse(xhr.responseText) : null);
        } catch { report(scope, null); }
      };
      const remove = () => xhr.removeEventListener('loadend', finished);
      pending.add(remove);
      if (pending.size > 32) { const oldest = pending.values().next().value; oldest(); pending.delete(oldest); }
      xhr.addEventListener('loadend', finished, { once: true });
    }
    return originalSend.apply(this, args);
  };
  if (prototype) { prototype.open = wrappedOpen; prototype.send = wrappedSend; }
  return () => {
    destroyed = true;
    if (wrappedFetch && window.fetch === wrappedFetch) window.fetch = originalFetch;
    if (prototype?.open === wrappedOpen) prototype.open = originalOpen;
    if (prototype?.send === wrappedSend) prototype.send = originalSend;
    for (const remove of pending) remove();
    pending.clear();
  };
}
