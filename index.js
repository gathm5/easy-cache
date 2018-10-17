const EventEmitter = require('events');

const DEFAULT_EXCEED_MEMORY = false;
const DEFAULT_EVENTS_ENABLED = true;
const DEFAULT_MAX_SAVE_COUNT = Infinity;
const DEFAULT_MAX_MEMORY_ALLOCATED = 3e6;

let lruTimer;
let STORE = {
  CACHED_DATA: {},
  CACHED_PROPS: {},
  CACHED_ORDERED_HEAP: [],
};

const timers = {};
const cacheEventEmitter = new EventEmitter();

const OPTIONS = {
  MAX_COUNT: DEFAULT_MAX_SAVE_COUNT,
  EXCEED_MEMORY: DEFAULT_EXCEED_MEMORY,
  EVENTS_ENABLED: DEFAULT_EVENTS_ENABLED,
  MAX_STORAGE: DEFAULT_MAX_MEMORY_ALLOCATED,
};

const isNull = v => v === null;
const keys = obj => Object.keys(obj);
const isDate = v => v instanceof Date;
const isObj = v => typeof v === 'object';
const isNum = v => typeof v === 'number';
const disableEvents = () => { OPTIONS.EVENTS_ENABLED = false; };
const shallowCompare = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const shortid = () => `easy_cache__${(new Date().getTime() * Math.random()).toString(36).replace(/[^a-z]+/g, '').substr(0, 8)}`;

const deepCompare = (a, b) => {
  const aKeys = keys(a), bKeys = keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return !aKeys.find(key => !compare(a[key], b[key]));
};

const compare = (a, b) => {
  if ((a === b) || (!a || !b) || (!isObj(a) || !isObj(b))) return a === b;
  return shallowCompare(a, b) || deepCompare(a, b);
};

const findKeyFromCacheKeys = (props) => {
  let useKey;
  Object.keys(STORE.CACHED_PROPS).find((key) => {
    if (compare((STORE.CACHED_PROPS[key] || {}).props, props)) {
      useKey = key;
      return true;
    }
    return false;
  });
  if (!STORE.CACHED_PROPS[useKey]) { return undefined; }
  const { expires } = STORE.CACHED_PROPS[useKey];
  if (!expires || new Date().getTime() < expires) { return useKey; }
  STORE.CACHED_DATA[useKey] = undefined;
  STORE.CACHED_PROPS[useKey] = undefined;
  if(OPTIONS.EVENTS_ENABLED) { cacheEventEmitter.emit('cache_removed', props, useKey); }
  return undefined;
};
const save = (props, data, expiresDateOrMs = null) => {
  let expires = null;
  switch (true) {
    case isNull(expiresDateOrMs):
      break;
    case isDate(expiresDateOrMs) && expiresDateOrMs <= new Date():
      return;
    case isDate(expiresDateOrMs):
      expires = expiresDateOrMs.getTime();
      break;
    case isNum(expiresDateOrMs) && expiresDateOrMs <= 0:
      return;
    case isNum(expiresDateOrMs):
      expires = (new Date()).getTime() + expiresDateOrMs;
      break;
    default:
  }
  const useKey = findKeyFromCacheKeys(props) || shortid();
  STORE.CACHED_ORDERED_HEAP = [useKey, ...STORE.CACHED_ORDERED_HEAP.filter(v => v !== useKey)]
  STORE.CACHED_DATA[useKey] = data;
  STORE.CACHED_PROPS[useKey] = { props, expires, stackedAt: STORE.CACHED_ORDERED_HEAP.length };
  if (expires) {
    timers[useKey] = setTimeout(() => {
      removeDataById(useKey);
      if(OPTIONS.EVENTS_ENABLED) { cacheEventEmitter.emit('cache_removed', props, useKey); }
    }, expires - new Date().getTime());
  }
  clearTimeout(lruTimer);
  lruTimer = setTimeout(removeLru, 500);
};
const saveDataById = (id, data) => {
  STORE.CACHED_DATA[id] = data;
  STORE.CACHED_ORDERED_HEAP = [id, ...STORE.CACHED_ORDERED_HEAP.filter(v => v !== id)]
  const { props, expires } = (STORE.CACHED_PROPS[id] || {});
  STORE.CACHED_PROPS[id] = { props, expires, stackedAt: STORE.CACHED_ORDERED_HEAP.length };
  clearTimeout(lruTimer);
  lruTimer = setTimeout(removeLru, 500);
};
const get = (props) => {
  const useKey = findKeyFromCacheKeys(props);
  return STORE.CACHED_DATA[useKey];
};
const getDataById = id => STORE.CACHED_DATA[id];
const getId = props => findKeyFromCacheKeys(props);
const remove = (props) => {
  const useKey = findKeyFromCacheKeys(props);
  const removed = STORE.CACHED_DATA[useKey];
  STORE.CACHED_DATA[useKey] = undefined;
  STORE.CACHED_PROPS[useKey] = undefined;
  if(OPTIONS.EVENTS_ENABLED) { cacheEventEmitter.emit('cache_removed', props, useKey); }
  return removed;
};
const clear = () => { STORE.CACHED_DATA = {}; STORE.CACHED_PROPS = {}; };
const removeDataById = (id) => { STORE.CACHED_PROPS[id] = undefined; STORE.CACHED_DATA[id] = undefined; };

const on = (eventName, fn) => {
  cacheEventEmitter.on(eventName, function event(...args) {
    if (OPTIONS.EVENTS_ENABLED) { fn(...args); } else { cacheEventEmitter.removeAllListeners(eventName); }
  });
};

const cacheSize = (raw = false) => {
  const size = JSON.stringify(STORE.CACHED_DATA).length; // bytes
  switch (true) {
    case raw:
      return size;
    case size > 1e+6:
      return `${(size / 1e6).toFixed(1)} MB`;
    default:
      return `${(size / 1e3).toFixed(1)} KB`;
  }
};

const cacheLength = () => Object.keys(STORE.CACHED_DATA).length;

const removeLru = () => {
  if (!OPTIONS.EXCEED_MEMORY) {
    const sizeNow = cacheSize(true);
    const lengthNow = cacheLength();
    if (
      STORE.CACHED_ORDERED_HEAP.length > 0
      && (
        sizeNow > OPTIONS.MAX_STORAGE
        || lengthNow >= OPTIONS.MAX_COUNT
      )
    ) {
      const toRemoveId = STORE.CACHED_ORDERED_HEAP.pop();
      STORE.CACHED_DATA[toRemoveId] = undefined;
      STORE.CACHED_PROPS[toRemoveId] = undefined;
      gc();
      removeLru();
    }
  } else {
    gc();
  }
};

const config = (options = {}) => {
  const {
    maxCount = OPTIONS.MAX_COUNT,
    maxMemory = OPTIONS.MAX_STORAGE,
    exceedMemory = OPTIONS.EXCEED_MEMORY,
    eventsEnabled = OPTIONS.EVENTS_ENABLED,
  } = options;
  OPTIONS.MAX_COUNT = maxCount;
  OPTIONS.MAX_STORAGE = maxMemory;
  OPTIONS.EXCEED_MEMORY = exceedMemory;
  OPTIONS.EVENTS_ENABLED = eventsEnabled;
  removeLru();
};

const gc = () => {
  STORE.CACHED_DATA = JSON.parse(JSON.stringify(STORE.CACHED_DATA));
  STORE.CACHED_PROPS = JSON.parse(JSON.stringify(STORE.CACHED_PROPS));
}

module.exports = {
  on,
  get,
  save,
  clear,
  getId,
  remove,
  set: save,
  put: save,
  read: get,
  getDataById,
  saveDataById,
  retrieve: get,
  disableEvents,
  config: config,
  removeDataById,
};
