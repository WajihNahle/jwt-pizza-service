const os = require('os');
const fetch = require('node-fetch');
const config = require('./config.js');

/////////////////////////////
// System Metrics
/////////////////////////////

function getCpuUsagePercentage() {
  const cpuUsage = os.loadavg()[0] / os.cpus().length;
  return Math.round(cpuUsage * 100);
}

function getMemoryUsagePercentage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsage = (usedMemory / totalMemory) * 100;
  return Math.round(memoryUsage);
}

function sendMetricToGrafana(metricName, metricValue, type, unit, useDouble = false) {
  const dataPointValue = useDouble 
    ? { asDouble: metricValue } 
    : { asInt: metricValue };

  const metric = {
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics: [
              {
                name: metricName,
                unit: unit,
                [type]: {
                  dataPoints: [
                    {
                      ...dataPointValue,
                      timeUnixNano: Date.now() * 1000000,
                       "attributes": [
                     {
                        "key": "source",
                        "value": { "stringValue": config.metrics.source }
                     }
                  ]
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
  };

  if (type === 'sum') {
    metric.resourceMetrics[0].scopeMetrics[0].metrics[0][type].aggregationTemporality =
      'AGGREGATION_TEMPORALITY_CUMULATIVE';
    metric.resourceMetrics[0].scopeMetrics[0].metrics[0][type].isMonotonic = true;
  }

  fetch(`${config.metrics.url}`, {
    method: 'POST',
    body: JSON.stringify(metric),
    headers: {
      Authorization: `Bearer ${config.metrics.apiKey}`,
      'Content-Type': 'application/json',
    },
  })
    // .then((res) => {
    //   if (!res.ok) {
    //     res.text().then((text) => {
    //       console.error(`Failed to push metrics: ${text}`);
    //     });
    //   } else {
    //     console.log(`Pushed ${metricName}: ${metricValue}`);
    //   }
    // })
    // .catch((err) => console.error('Error sending metrics:', err));
}

/////////////////////////////
// HTTP Request Metrics
/////////////////////////////

const requestCounts = {
  total: 0,
  get: 0,
  post: 0,
  put: 0,
  delete: 0
};

function httpRequestTracker(req, res, next) {
  const startTime = Date.now();

  const trackRequest = () => {
    const latencyMs = Date.now() - startTime;
    const method = req.method.toLowerCase();
    const path = req.path || 'unknown';
    
    const metricPath = path.replace(/^\/api/, '').replace(/\//g, '_') || 'root';
    
    // Increment counters
    requestCounts.total++;
    if (requestCounts[method] !== undefined) {
      requestCounts[method]++;
    }
    
    // Still send latency per request
    sendMetricToGrafana(`http_${method}${metricPath}_latency`, latencyMs, 'gauge', 'ms');
  };
  
  res.on('finish', () => {
    trackRequest();
  })
  
  next();
}

// Send request counts every minute
function sendRequestMetrics() {
  sendMetricToGrafana('http_request_total', requestCounts.total, 'gauge', 'requests');
  sendMetricToGrafana('http_get_requests', requestCounts.get, 'gauge', 'requests');
  sendMetricToGrafana('http_post_requests', requestCounts.post, 'gauge', 'requests');
  sendMetricToGrafana('http_put_requests', requestCounts.put, 'gauge', 'requests');
  sendMetricToGrafana('http_delete_requests', requestCounts.delete, 'gauge', 'requests');
  
  // Reset counters
  requestCounts.total = 0;
  requestCounts.get = 0;
  requestCounts.post = 0;
  requestCounts.put = 0;
  requestCounts.delete = 0;
}

setInterval(sendRequestMetrics, 60000);

/////////////////////////////
// Active Users Tracking
/////////////////////////////

const activeUsers = new Set();

function trackActiveUser(userId) {
  if (userId) {
    activeUsers.add(userId);
  }
}

function sendActiveUsersMetric() {
  const count = activeUsers.size;
  sendMetricToGrafana('active_users', count, 'gauge', 'users');
  activeUsers.clear(); // Reset for next interval
}

// Send active users count every minute and reset
setInterval(sendActiveUsersMetric, 60000);

/////////////////////////////
// Authentication Metrics
/////////////////////////////

const authCounts = {
  successful: 0,
  failed: 0
};

function incrementAuthAttempt(success) {
  if (success) {
    authCounts.successful++;
  } else {
    authCounts.failed++;
  }
}

// Send auth attempt counts every minute
function sendAuthMetrics() {
  sendMetricToGrafana('auth_successful', authCounts.successful, 'gauge', 'attempts');
  sendMetricToGrafana('auth_failed', authCounts.failed, 'gauge', 'attempts');
  
  // Reset counters
  authCounts.successful = 0;
  authCounts.failed = 0;
}

setInterval(sendAuthMetrics, 60000);

/////////////////////////////
// Pizza Metrics
/////////////////////////////

const pizzaCounts = {
  sold: 0,
  revenue: 0,
  failures: 0
};

function pizzaPurchase(success, latency, pizzasSold, revenue) {
  if (success) {
    pizzaCounts.sold += pizzasSold;
    pizzaCounts.revenue += revenue;
    sendMetricToGrafana('pizza_creation_latency', latency, 'gauge', 'ms');
  } else {
    pizzaCounts.failures++;
    sendMetricToGrafana('pizza_creation_latency', latency, 'gauge', 'ms');
  }
}

// Send pizza metrics every minute
function sendPizzaMetrics() {
  sendMetricToGrafana('pizza_sold', pizzaCounts.sold, 'gauge', 'pizzas');
  sendMetricToGrafana('pizza_revenue', pizzaCounts.revenue, 'gauge', 'bitcoin', true);
  sendMetricToGrafana('pizza_creation_failures', pizzaCounts.failures, 'gauge', 'failures');
  
  // Reset counters
  pizzaCounts.sold = 0;
  pizzaCounts.revenue = 0;
  pizzaCounts.failures = 0;
}

setInterval(sendPizzaMetrics, 60000);

/////////////////////////////
// Periodic System Metrics
/////////////////////////////

function sendSystemMetrics() {
  const cpu = getCpuUsagePercentage();
  const mem = getMemoryUsagePercentage();

  sendMetricToGrafana('cpu_usage_percentage', cpu, 'gauge', '%');
  sendMetricToGrafana('memory_usage_percentage', mem, 'gauge', '%');
}

// Send system metrics every 5 seconds
setInterval(sendSystemMetrics, 5000);

/////////////////////////////
// Exports
/////////////////////////////

module.exports = {
  sendMetricToGrafana,
  httpRequestTracker,
  trackActiveUser,
  incrementAuthAttempt,
  pizzaPurchase,
};