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
    .then((res) => {
      if (!res.ok) {
        res.text().then((text) => {
          console.error(`Failed to push metrics: ${text}`);
        });
      } else {
        console.log(`Pushed ${metricName}: ${metricValue}`);
      }
    })
    .catch((err) => console.error('Error sending metrics:', err));
}

/////////////////////////////
// HTTP Request Metrics
/////////////////////////////

function httpRequestTracker(req, res, next) {
  const startTime = Date.now();


  const trackRequest = () => {
    const latencyMs = Date.now() - startTime;
    const method = req.method;
    const path = req.path || 'unknown';
    
    // Clean up the path for metric name (remove /api prefix, replace slashes)
    const metricPath = path.replace(/^\/api/, '').replace(/\//g, '_') || 'root';
    
    // Send latency metric for this specific endpoint
    sendMetricToGrafana(`http_${method.toLowerCase()}${metricPath}_latency`, latencyMs, 'gauge', 'ms');
    
    // Send total request count (all methods)
    sendMetricToGrafana(`http_request_total`, 1, 'sum', 'requests');
    
    // Send request count by method
    sendMetricToGrafana(`http_${method.toLowerCase()}_requests`, 1, 'sum', 'requests');
  };
  
  res.on('finish', () => {
    trackRequest();
  })
  
  next();
}

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

function incrementAuthAttempt(success) {
  if (success) {
    sendMetricToGrafana('auth_successful', 1, 'sum', 'attempts');
  } else {
    sendMetricToGrafana('auth_failed', 1, 'sum', 'attempts');
  }
}

/////////////////////////////
// Pizza Metrics
/////////////////////////////

function pizzaPurchase(success, latency, pizzasSold, revenue) {
  if (success) {
    sendMetricToGrafana('pizza_sold', pizzasSold, 'sum', 'pizzas');
    sendMetricToGrafana('pizza_revenue', revenue, 'sum', 'cents', true);
    sendMetricToGrafana('pizza_creation_latency', latency, 'gauge', 'ms');
  } else {
    sendMetricToGrafana('pizza_creation_failures', 1, 'sum', 'failures');
    sendMetricToGrafana('pizza_creation_latency', latency, 'gauge', 'ms');
  }
}

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
