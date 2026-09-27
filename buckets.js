// buckets.js：打点分桶（桶表按桶号升序，桶内来源按名字升序）
export function addPoint(buckets, bucketId, source, count) {
  const next = buckets.map(function (entry) {
    return [entry[0], entry[1].map(function (row) { return [row[0], row[1]]; })];
  });
  let entry = null;
  for (const candidate of next) {
    if (candidate[0] === bucketId) { entry = candidate; break; }
  }
  if (!entry) {
    entry = [bucketId, [[source, count]]];
    next.push(entry);
    next.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
  } else {
    const sources = entry[1];
    const existing = sources.find(function (row) { return row[0] === source; });
    if (existing) {
      existing[1] += count;
    } else {
      sources.push([source, count]);
      sources.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
    }
  }
  return next;
}

export function digest(buckets) {
  return buckets.map(function (entry) {
    const sources = entry[1];
    const total = sources.reduce(function (sum, row) { return sum + row[1]; }, 0);
    return [entry[0], total, sources.length];
  });
}
