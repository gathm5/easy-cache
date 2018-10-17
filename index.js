const EventEmitter = require('events');
const cacheEventEmitter = new EventEmitter();

let lruTimer;
const timers = {};
let cacheData = {};
let cacheHeap = [];
let cacheProps = {};
let exceedLimit = false;
let EVENT_ENABLED = true;

const MAX_SAVE_COUNT = Infinity;
const MAX_MEMORY_ALLOCATED = 3e6;

let OPTIONS = {
  MAX_COUNT: MAX_SAVE_COUNT,
  EXCEED_MEMORY: exceedLimit,
  EVENTS_ENABLED: EVENT_ENABLED,
  MAX_STORAGE: MAX_MEMORY_ALLOCATED,
};

const isNull = v => v === null;
const keys = obj => Object.keys(obj);
const isDate = v => v instanceof Date;
const isObj = v => typeof v === 'object';
const isNum = v => typeof v === 'number';
const disableEvents = () => { EVENT_ENABLED = false; };
const shallowCompare = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const shortid = () => `easy_cache__${(new Date().getTime() * Math.random()).toString(36).replace(/[^a-z]+/g, '').substr(0, 8)}`;

const deepCompare = (a, b) => {
  const aKeys = keys(a);
  const bKeys = keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return !aKeys.find(key => !compare(a[key], b[key]));
};

const compare = (a, b) => {
  if ((a === b) || (!a || !b) || (!isObj(a) || !isObj(b))) return a === b;
  return shallowCompare(a, b) || deepCompare(a, b);
};

const findKeyFromCacheKeys = (props) => {
  let useKey;
  Object.keys(cacheProps).find((key) => {
    if (compare((cacheProps[key] || {}).props, props)) {
      useKey = key;
      return true;
    }
    return false;
  });
  if (!cacheProps[useKey]) { return undefined; }
  const { expires } = cacheProps[useKey];
  if (!expires || new Date().getTime() < expires) { return useKey; }
  cacheData[useKey] = undefined;
  cacheProps[useKey] = undefined;
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
  cacheHeap = [useKey, ...cacheHeap.filter(v => v !== useKey)]
  cacheData[useKey] = data;
  cacheProps[useKey] = { props, expires, stackedAt: cacheHeap.length };
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
  cacheData[id] = data;
  cacheHeap = [id, ...cacheHeap.filter(v => v !== id)]
  const { props, expires } = (cacheProps[id] || {});
  cacheProps[id] = { props, expires, stackedAt: cacheHeap.length };
  clearTimeout(lruTimer);
  lruTimer = setTimeout(removeLru, 500);
};
const get = (props) => {
  const useKey = findKeyFromCacheKeys(props);
  return cacheData[useKey];
};
const getDataById = id => cacheData[id];
const getId = props => findKeyFromCacheKeys(props);
const remove = (props) => {
  const useKey = findKeyFromCacheKeys(props);
  const removed = cacheData[useKey];
  cacheData[useKey] = undefined;
  cacheProps[useKey] = undefined;
  if(OPTIONS.EVENTS_ENABLED) { cacheEventEmitter.emit('cache_removed', props, useKey); }
  return removed;
};
const clear = () => { cacheData = {}; cacheProps = {}; };
const removeDataById = (id) => { cacheProps[id] = undefined; cacheData[id] = undefined; };

const on = (eventName, fn) => {
  cacheEventEmitter.on(eventName, function event(...args) {
    if (OPTIONS.EVENTS_ENABLED) { fn(...args); } else { cacheEventEmitter.removeAllListeners(eventName); }
  });
};

const cacheSize = (raw = false) => {
  const size = JSON.stringify(cacheData).length; // bytes
  switch (true) {
    case raw:
      return size;
    case size > 1e+6:
      return `${(size / 1e6).toFixed(1)} MB`;
    default:
      return `${(size / 1e3).toFixed(1)} KB`;
  }
};

const cacheLength = () => Object.keys(cacheData).length;

const removeLru = () => {
  if (!OPTIONS.EXCEED_MEMORY) {
    const sizeNow = cacheSize(true);
    const lengthNow = cacheLength();
    if (
      cacheHeap.length > 0
      && (
        sizeNow > OPTIONS.MAX_STORAGE
        || lengthNow >= OPTIONS.MAX_COUNT
      )
    ) {
      const toRemoveId = cacheHeap.pop();
      cacheData[toRemoveId] = undefined;
      cacheProps[toRemoveId] = undefined;
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
  OPTIONS = {
    MAX_COUNT: maxCount,
    MAX_STORAGE: maxMemory,
    EXCEED_MEMORY: exceedMemory,
    EVENTS_ENABLED: eventsEnabled,
  };
  removeLru();
};

const gc = () => {
  cacheData = JSON.parse(JSON.stringify(cacheData));
  cacheProps = JSON.parse(JSON.stringify(cacheProps));
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
