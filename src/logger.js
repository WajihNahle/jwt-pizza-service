const config = require('./config.js');

class Logger {
  httpLogger = (req, res, next) => {
    let send = res.send;
    res.send = (resBody) => {
      const logData = {
        auth: !!req.headers.authorization,
        path: req.originalUrl,
        method: req.method,
        status: res.statusCode,
        ip: req.ip || req.connection.remoteAddress,
        req: JSON.stringify(req.body),
        res: JSON.stringify(resBody),
      };
      const level = this.statusToLogLevel(res.statusCode);
      this.log(level, 'http-req', logData);
      res.send = send;
      return res.send(resBody);
    };
    next();
  };

  // Log database queries
  dbQuery(sql, params) {
    const logData = {
      query: sql,
      params: params ? JSON.stringify(params) : undefined,
    };
    this.log('info', 'db-query', logData);
  }

  // Log factory requests
  factoryRequest(reqBody, resBody, statusCode) {
    const logData = {
      factoryReqBody: JSON.stringify(reqBody),
      factoryResBody: JSON.stringify(resBody),
      statusCode: statusCode,
    };
    const level = this.statusToLogLevel(statusCode);
    this.log(level, 'factory-req', logData);
  }

  // Log unhandled exceptions
  logException(err, req) {
    const logData = {
      message: err.message,
      stack: err.stack,
      path: req?.originalUrl,
      method: req?.method,
      statusCode: err.statusCode || 500,
    };
    this.log('error', 'exception', logData);
  }

  log(level, type, logData) {
    const labels = { component: config.logging.source, level: level, type: type };
    const values = [this.nowString(), this.sanitize(logData)];
    const logEvent = { streams: [{ stream: labels, values: [values] }] };

    this.sendLogToGrafana(logEvent);
  }

  statusToLogLevel(statusCode) {
    if (statusCode >= 500) return 'error';
    if (statusCode >= 400) return 'warn';
    return 'info';
  }

  nowString() {
    return (Math.floor(Date.now()) * 1000000).toString();
  }

  sanitize(logData) {
    let dataStr = typeof logData === 'string' ? logData : JSON.stringify(logData);
    
    // Sanitize various password patterns
    // Handle escaped quotes in nested JSON: \"password\":\"value\"
    dataStr = dataStr.replace(/\\"password\\":\s*\\"[^"]*\\"/gi, '\\"password\\": \\"*****\\"');
    // Handle normal JSON: "password":"value"
    dataStr = dataStr.replace(/"password":\s*"[^"]*"/gi, '"password": "*****"');
    // Handle URL encoded passwords
    dataStr = dataStr.replace(/password=[^&\s]*/gi, 'password=*****');
    
    return dataStr;
  }

  sendLogToGrafana(event) {
    // Skip logging if fetch is not available (e.g., in test environment)
    if (typeof fetch === 'undefined') {
      return;
    }
    
    const body = JSON.stringify(event);
    fetch(`${config.logging.url}`, {
      method: 'post',
      body: body,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.logging.userId}:${config.logging.apiKey}`,
      },
    }).then((res) => {
      if (!res.ok) console.log('Failed to send log to Grafana');
    }).catch((err) => {
      console.log('Error sending log to Grafana:', err.message);
    });
  }
}

module.exports = new Logger();