// pointrun.js：按处理预算处理并留账（账上的打点下一轮先处理，收尾不限预算）
import { addPoint } from "./buckets.js";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function codes(spec) {
  return {
    badEvent: spec.event_error_code || "E_BAD_EVENT",
    backwards: spec.backwards_error_code || "E_TIME_BACKWARDS",
    dup: spec.point_error_code || "E_DUP_POINT"
  };
}

function validEvent(event) {
  return !!event && typeof event === "object"
    && event.kind === "point"
    && Number.isFinite(event.at)
    && typeof event.source === "string"
    && Number.isFinite(event.count);
}

function cloneState(state) {
  return {
    buckets: state.buckets,
    last_at: state.last_at,
    ledger: state.ledger.slice(),
    applied: state.applied.slice()
  };
}

function applyEntry(state, entry, err, width) {
  if (entry.at < state.last_at) fail(err.backwards, "point time goes backwards");
  const bucketId = Math.floor(entry.at / width);
  for (const row of state.buckets) {
    if (row[0] !== bucketId) continue;
    for (const existing of row[1]) {
      if (existing[0] === entry.source) fail(err.dup, "duplicate point in bucket");
    }
  }
  state.buckets = addPoint(state.buckets, bucketId, entry.source, entry.count);
  state.last_at = entry.at;
  state.applied.push(entry.id);
}

export function step(spec) {
  const events = spec.events || [];
  const err = codes(spec);
  for (const event of events) {
    if (!validEvent(event)) fail(err.badEvent, "malformed event");
  }
  const state = cloneState(spec.state);
  const width = spec.bucket_width;
  let budget = Math.max(0, spec.budget || 0);
  let served = 0;

  const rest = [];
  for (const entry of state.ledger) {
    if (budget > 0) {
      budget -= 1;
      applyEntry(state, entry, err, width);
      served += 1;
    } else {
      rest.push(entry);
    }
  }
  state.ledger = rest;

  for (const event of events) {
    if (event.id !== undefined && state.applied.indexOf(event.id) !== -1) continue;
    if (budget > 0) {
      budget -= 1;
      applyEntry(state, event, err, width);
      served += 1;
    } else {
      state.ledger.push({ id: event.id, kind: event.kind, at: event.at,
                          source: event.source, count: event.count });
    }
  }

  return {
    state: state,
    served: served,
    ledger_before: state.ledger.length,
    ledger: state.ledger.map(function (entry) {
      return [entry.kind, entry.at, entry.source, entry.count];
    }),
    judged: served,
    judged_bound: events.length
  };
}

export function close(spec) {
  const err = codes(spec);
  const state = cloneState(spec.state);
  const width = spec.bucket_width;
  let catchup = 0;
  for (const entry of state.ledger) {
    applyEntry(state, entry, err, width);
    catchup += 1;
  }
  state.ledger = [];
  return { state: state, catchup: catchup };
}
