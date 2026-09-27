// pointrun.js：按处理预算处理打点，用尽则连着载压在账上，收尾不限预算把账处理完
import { addPoint, digest } from "./buckets.js";

const DUP_CODE = "E_DUP_POINT";
const BACKWARDS_CODE = "E_TIME_BACKWARDS";
const BAD_EVENT_CODE = "E_BAD_EVENT";

function cloneBuckets(buckets) {
  return (buckets || []).map(function (entry) {
    return [entry[0], entry[1].map(function (row) { return [row[0], row[1]]; })];
  });
}

function cloneLedger(ledger) {
  return (ledger || []).map(function (point) { return point.slice(); });
}

function makeError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

// 事件结构先校验，与预算无关：整批里有一条不合法就直接报 E_BAD_EVENT。
function validateEvents(events, code) {
  if (!Array.isArray(events)) throw makeError(code, "events 必须是数组");
  for (const event of events) {
    if (!event || typeof event !== "object" || Array.isArray(event)) throw makeError(code, "事件必须是对象");
    if (event.kind !== "point") throw makeError(code, "kind 必须是 point");
    if (typeof event.at !== "number" || !Number.isFinite(event.at)) throw makeError(code, "at 必须是数字");
    if (typeof event.source !== "string" || event.source.length === 0) throw makeError(code, "source 必须是非空字符串");
    if (typeof event.count !== "number" || !Number.isFinite(event.count)) throw makeError(code, "count 必须是数字");
  }
}

function pointKey(point) {
  return [point[0], point[1], point[2]].join("\u0000");
}

function toPoint(event) {
  return [event.kind, event.at, event.source, event.count];
}

function sourceSeen(buckets, bucketId, source) {
  for (const entry of buckets) {
    if (entry[0] === bucketId) {
      return entry[1].some(function (row) { return row[0] === source; });
    }
  }
  return false;
}

export function step(spec) {
  const badCode = spec.event_error_code || BAD_EVENT_CODE;
  const backwardsCode = spec.backwards_error_code || BACKWARDS_CODE;
  const dupCode = spec.point_error_code || DUP_CODE;

  const events = Array.isArray(spec.events) ? spec.events : [];
  validateEvents(events, badCode);

  const width = spec.bucket_width;
  const priorState = spec.state || {};
  let buckets = cloneBuckets(priorState.buckets);
  let lastAt = priorState.last_at == null ? 0 : priorState.last_at;
  let applied = (priorState.applied || []).slice();
  const priorLedger = cloneLedger(priorState.ledger);
  const bound = priorLedger.length + events.length;

  // 账优先（FIFO），随后按序处理新打点；已处理过的重放直接跳过。
  const queue = priorLedger.concat(events.map(toPoint));
  let budget = spec.budget == null ? queue.length : spec.budget;
  let served = 0;
  let judged = 0;

  for (let index = 0; index < queue.length; index++) {
    const point = queue[index];
    const kind = point[0];
    const at = point[1];
    const source = point[2];
    const count = point[3];
    const key = pointKey(point);

    if (applied.indexOf(key) !== -1) {
      continue;
    }
    if (at < lastAt) {
      const rest = queue.slice(index).filter(function (pending) {
        return applied.indexOf(pointKey(pending)) === -1;
      });
      throw Object.assign(makeError(backwardsCode, "打点时刻早于上一条：" + at + " < " + lastAt), {
        state: { buckets: buckets, last_at: lastAt, ledger: rest, applied: applied },
        served: served,
        ledger_before: rest.length,
        ledger: rest,
        judged: judged,
        judged_bound: bound
      });
    }
    if (served >= budget) {
      const rest = queue.slice(index).filter(function (pending) {
        return applied.indexOf(pointKey(pending)) === -1;
      });
      return {
        state: { buckets: buckets, last_at: lastAt, ledger: rest, applied: applied },
        served: served,
        ledger_before: rest.length,
        ledger: rest,
        judged: judged,
        judged_bound: bound
      };
    }
    const bucketId = Math.floor(at / width);
    if (sourceSeen(buckets, bucketId, source)) {
      const rest = queue.slice(index).filter(function (pending) {
        return applied.indexOf(pointKey(pending)) === -1;
      });
      throw Object.assign(makeError(dupCode, "同一桶同一来源重复打点：桶 " + bucketId + " 来源 " + source), {
        state: { buckets: buckets, last_at: lastAt, ledger: rest, applied: applied },
        served: served,
        ledger_before: rest.length,
        ledger: rest,
        judged: judged,
        judged_bound: bound
      });
    }
    buckets = addPoint(buckets, bucketId, source, count);
    lastAt = at;
    applied.push(key);
    served += 1;
    judged += 1;
  }

  return {
    state: { buckets: buckets, last_at: lastAt, ledger: [], applied: applied },
    served: served,
    ledger_before: 0,
    ledger: [],
    judged: judged,
    judged_bound: bound
  };
}

export function close(spec) {
  const priorState = spec.state || {};
  let buckets = cloneBuckets(priorState.buckets);
  let lastAt = priorState.last_at == null ? 0 : priorState.last_at;
  const applied = (priorState.applied || []).slice();
  const ledger = cloneLedger(priorState.ledger);

  let catchup = 0;
  for (const point of ledger) {
    const at = point[1];
    const source = point[2];
    const count = point[3];
    if (at < lastAt) {
      throw makeError(spec.backwards_error_code || BACKWARDS_CODE, "收尾时打点时刻倒退：" + at + " < " + lastAt);
    }
    const bucketId = Math.floor(at / spec.bucket_width);
    if (sourceSeen(buckets, bucketId, source)) {
      throw makeError(spec.point_error_code || DUP_CODE, "收尾时同一桶同一来源重复：桶 " + bucketId + " 来源 " + source);
    }
    buckets = addPoint(buckets, bucketId, source, count);
    lastAt = at;
    applied.push(pointKey(point));
    catchup += 1;
  }

  return {
    state: {
      buckets: buckets,
      last_at: lastAt,
      ledger: [],
      applied: applied
    },
    catchup: catchup
  };
}
