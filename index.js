const EventEmitter = require('events');
const cacheEventEmitter = new EventEmitter();

const timers = {};
let cacheData = {};
let cacheProps = {};
let eventEnabled = true;
const isNull = v => v === null;
const keys = obj => Object.keys(obj);
const isDate = v => v instanceof Date;
const isObj = v => typeof v === 'object';
const isNum = v => typeof v === 'number';
const isUndef = v => typeof v === 'undefined';
const disableEvents = () => { eventEnabled = false; };
const shallowCompare = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const shortid = () => Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 8);
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
  if (!cacheProps[useKey]) {
    return undefined;
  }
  const { expires } = cacheProps[useKey];
  if (!expires || new Date().getTime() < expires) {
    return useKey;
  }
  cacheProps[useKey] = undefined;
  cacheData[useKey] = undefined;
  cacheEventEmitter.emit('cache_removed', props, useKey);
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
  cacheData[useKey] = data;
  cacheProps[useKey] = { props, expires };
  timers[useKey] = setTimeout(() => {
    removeDataById(useKey);
    cacheEventEmitter.emit('cache_removed', props, useKey);
  }, expires - new Date().getTime());
};
const saveDataById = (id, data) => { cacheData[id] = data; };
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
  cacheEventEmitter.emit('cache_removed', props, useKey);
  return removed;
};
const clear = () => { cacheData = {}; cacheProps = {}; };
const removeDataById = (id) => { cacheData[id] = undefined; };

const on = (eventName, fn) => {
  cacheEventEmitter.on(eventName, function event(...args) {
    if (eventEnabled) {
      fn(...args);
    } else {
      cacheEventEmitter.removeAllListeners(eventName);
    }
  });
};

module.exports = {
  on,
  get,
  save,
  clear,
  getId,
  remove,
  getDataById,
  saveDataById,
  disableEvents,
  removeDataById,
};
