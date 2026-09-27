// buckets.js：打点分桶（桶表按桶号升序、桶内来源按名字升序，纯函数不改入参）
export function addPoint(buckets, bucketId, source, count) {
  const next = [];
  let placed = false;
  for (const row of buckets) {
    const id = row[0];
    if (id === bucketId) {
      const merged = [];
      let added = false;
      for (const entry of row[1]) {
        if (!added && entry[0] > source) {
          merged.push([source, count]);
          added = true;
        }
        if (entry[0] === source) {
          merged.push([entry[0], entry[1] + count]);
          added = true;
        } else {
          merged.push(entry);
        }
      }
      if (!added) merged.push([source, count]);
      next.push([id, merged]);
      placed = true;
    } else {
      if (!placed && id > bucketId) {
        next.push([bucketId, [[source, count]]]);
        placed = true;
      }
      next.push(row);
    }
  }
  if (!placed) next.push([bucketId, [[source, count]]]);
  return next;
}

export function digest(buckets) {
  return buckets.map(function (row) {
    let total = 0;
    for (const entry of row[1]) total += entry[1];
    return [row[0], total, row[1].length];
  });
}
