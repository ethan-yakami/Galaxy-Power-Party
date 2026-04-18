function sanitizeLabel(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

function formatLabels(labels) {
  const entries = Object.entries(labels || {}).filter(([, value]) => value !== undefined && value !== null && value !== '');
  if (entries.length === 0) return '';
  return `{${entries.map(([key, value]) => `${key}="${sanitizeLabel(value)}"`).join(',')}}`;
}

function createMetricsRegistry({ rooms }) {
  const counters = new Map();
  const gauges = new Map();
  const timings = new Map();

  function counterKey(name, labels) {
    return `${name}|${JSON.stringify(labels || {})}`;
  }

  function observeCounter(name, labels, delta) {
    const key = counterKey(name, labels);
    const current = counters.get(key);
    if (current) {
      current.value += delta;
      return;
    }
    counters.set(key, { name, labels: labels || {}, value: delta });
  }

  function setGauge(name, value, labels) {
    gauges.set(counterKey(name, labels), {
      name,
      labels: labels || {},
      value,
    });
  }

  return Object.freeze({
    inc(name, labels, delta = 1) {
      observeCounter(name, labels, delta);
    },
    dec(name, labels, delta = 1) {
      observeCounter(name, labels, -delta);
    },
    setGauge,
    observeDuration(name, milliseconds, labels) {
      const key = counterKey(name, labels);
      const current = timings.get(key) || {
        name,
        labels: labels || {},
        count: 0,
        sum: 0,
      };
      current.count += 1;
      current.sum += Number.isFinite(milliseconds) ? milliseconds : 0;
      timings.set(key, current);
    },
    snapshot() {
      setGauge('gpp_active_rooms', rooms.size);
      let activeSockets = 0;
      for (const room of rooms.values()) {
        if (!room || !Array.isArray(room.players)) continue;
        for (const player of room.players) {
          if (player && player.ws && player.ws.readyState === 1) activeSockets += 1;
        }
      }
      setGauge('gpp_active_room_sockets', activeSockets);
    },
    renderPrometheus() {
      this.snapshot();
      const lines = [];
      for (const metric of counters.values()) {
        lines.push(`${metric.name}${formatLabels(metric.labels)} ${metric.value}`);
      }
      for (const metric of gauges.values()) {
        lines.push(`${metric.name}${formatLabels(metric.labels)} ${metric.value}`);
      }
      for (const metric of timings.values()) {
        lines.push(`${metric.name}_count${formatLabels(metric.labels)} ${metric.count}`);
        lines.push(`${metric.name}_sum${formatLabels(metric.labels)} ${metric.sum}`);
      }
      return `${lines.join('\n')}\n`;
    },
  });
}

module.exports = {
  createMetricsRegistry,
};
