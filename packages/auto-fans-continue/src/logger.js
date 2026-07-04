export const LOGGER_STATE_KEY = "__chzAutoFansContinue";

const CONSOLE_METHODS = ["info", "warn", "log", "debug"];

function captureConsoleMethod(consoleLike, methodName) {
  if (!consoleLike) return null;

  let method;
  try {
    method = consoleLike[methodName];
  } catch {
    return null;
  }

  if (typeof method !== "function") return null;

  try {
    return Function.prototype.bind.call(method, consoleLike);
  } catch {
    return (...args) => Function.prototype.apply.call(method, consoleLike, args);
  }
}

function serializeArg(arg) {
  if (arg instanceof Error) {
    return {
      name: arg.name,
      message: arg.message,
      stack: arg.stack,
    };
  }

  if (arg && typeof arg === "object") {
    try {
      return JSON.parse(JSON.stringify(arg));
    } catch {
      return String(arg);
    }
  }

  return arg;
}

function formatLogArg(arg) {
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;

  if (arg && typeof arg === "object") {
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }

  return String(arg);
}

function captureGmLog(gmLog) {
  if (typeof gmLog !== "function") return null;

  return (...args) => {
    gmLog(args.map(formatLogArg).join(" "));
  };
}

function createEvent(args) {
  const serializedArgs = args.map(serializeArg);
  return {
    at: new Date().toISOString(),
    message: typeof args[0] === "string" ? args[0] : "",
    args: serializedArgs,
  };
}

export function createLogger(
  consoleLike = globalThis.console,
  {
    target = globalThis,
    prefix = "chz_script",
    maxEvents = 50,
    gmLog,
  } = {},
) {
  const state = target?.[LOGGER_STATE_KEY] ?? {
    startedAt: new Date().toISOString(),
    events: [],
  };

  if (target) {
    target[LOGGER_STATE_KEY] = state;
  }

  const writers = [
    captureGmLog(gmLog),
    ...CONSOLE_METHODS.map((name) => captureConsoleMethod(consoleLike, name)),
  ].filter(Boolean);

  function record(args) {
    const event = createEvent(args);
    state.lastEvent = event;
    state.events.push(event);
    if (state.events.length > maxEvents) {
      state.events.splice(0, state.events.length - maxEvents);
    }
  }

  function write(args) {
    for (const writer of writers) {
      try {
        writer(prefix, ...args);
        return;
      } catch {
        // Keep the userscript flow alive even when the page breaks console.
      }
    }
  }

  return {
    state,
    log(...args) {
      record(args);
      write(args);
    },
  };
}
