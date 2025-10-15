const kv = new Map();
export function putReceipt(hash, receipt){ kv.set(hash, receipt); }
export function getReceipt(hash){ return kv.get(hash) || null; }
