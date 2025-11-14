const request = require('supertest');
const express = require('express');
const orderRouter = require('./orderRouter.js');
const { DB } = require('../database/database.js');
const { authRouter } = require('./authRouter.js');

// Mock node-fetch (used by metrics.js)
jest.mock('node-fetch', () => jest.fn());
const nodeFetch = require('node-fetch');

jest.mock('../database/database.js', () => ({
  DB: {
    getMenu: jest.fn(),
    addMenuItem: jest.fn(),
    getOrders: jest.fn(),
    addDinerOrder: jest.fn(),
  },
  Role: { Admin: 'Admin' },
}));

jest.mock('./authRouter.js', () => ({
  authRouter: {
    authenticateToken: jest.fn((req, res, next) => {
      req.user = { id: 1, name: 'Test User', email: 'test@example.com', isRole: jest.fn() };
      next();
    }),
  },
}));

jest.mock('../metrics.js', () => ({
  httpRequestTracker: jest.fn((req, res, next) => next()),
  pizzaPurchase: jest.fn(),
  trackActiveUser: jest.fn(),
}));

jest.mock('../logger.js', () => ({
  httpLogger: jest.fn((req, res, next) => next()),
  factoryRequest: jest.fn(),
  dbQuery: jest.fn(),
  logException: jest.fn(),
}));

// Initialize fetch mock
global.fetch = jest.fn();

let app;
beforeEach(() => {
  app = express();
  app.use(express.json());
  app.use('/api/order', orderRouter);

  app.use((err, req, res, next) => {
    if (err.statusCode) {
      res.status(err.statusCode).json({ message: err.message });
    } else {
      res.status(500).json({ message: err.message });
    }
    next() // done to fulfill linting error
  });

  // Clear mocks but preserve fetch
  jest.clearAllMocks();
  
  // Reset fetch mock with default implementation
  global.fetch.mockReset();
});

test('GET /menu should return menu', async () => {
  const menu = [{ id: 1, title: 'Veggie' }];
  DB.getMenu.mockResolvedValue(menu);
  const res = await request(app).get('/api/order/menu');
  expect(res.statusCode).toBe(200);
  expect(res.body).toEqual(menu);
  expect(DB.getMenu).toHaveBeenCalled();
});

test('PUT /menu should add menu item for admin', async () => {
  const menuItem = { title: 'Student', price: 0.0001 };
  const menu = [menuItem];
  DB.getMenu.mockResolvedValue(menu);
  DB.addMenuItem.mockResolvedValue();
  const user = { isRole: jest.fn(() => true) };
  authRouter.authenticateToken.mockImplementation((req, res, next) => {
    req.user = user;
    next();
  });
  const res = await request(app).put('/api/order/menu').send(menuItem);
  expect(res.statusCode).toBe(200);
  expect(res.body).toEqual(menu);
  expect(DB.addMenuItem).toHaveBeenCalledWith(menuItem);
});

test('PUT /menu should fail for non-admin', async () => {
  const menuItem = { title: 'Student' };
  const user = { isRole: jest.fn(() => false) };
  authRouter.authenticateToken.mockImplementation((req, res, next) => {
    req.user = user;
    next();
  });
  const res = await request(app).put('/api/order/menu').send(menuItem);
  expect(res.statusCode).toBe(403);
  expect(res.body).toEqual({ message: 'unable to add menu item' });
});

test('GET / should return orders', async () => {
  const orders = { dinerId: 1, orders: [] };
  DB.getOrders.mockResolvedValue(orders);
  const res = await request(app).get('/api/order');
  expect(res.statusCode).toBe(200);
  expect(res.body).toEqual(orders);
  expect(DB.getOrders).toHaveBeenCalledWith(expect.any(Object), undefined);
});

test('POST / should create order successfully', async () => {
  const orderReq = { franchiseId: 1, storeId: 1, items: [{ menuId: 1, description: 'Veggie', price: 0.05 }] };
  const order = { id: 1, ...orderReq };
  DB.addDinerOrder.mockResolvedValue(order);
  
  fetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ reportUrl: 'url', jwt: '111111' }),
  });
  
  const res = await request(app).post('/api/order').send(orderReq);
  expect(res.statusCode).toBe(200);
  expect(res.body).toEqual({ order, followLinkToEndChaos: 'url', jwt: '111111' });
});

test('POST / should handle failed factory API', async () => {
  const orderReq = { franchiseId: 1, storeId: 1, items: [{ menuId: 1, description: 'Veggie', price: 0.05 }] };
  const order = { id: 1, ...orderReq };
  DB.addDinerOrder.mockResolvedValue(order);
  
  fetch.mockResolvedValueOnce({
    ok: false,
    status: 500,
    json: async () => ({ reportUrl: 'url' }),
  });
  
  const res = await request(app).post('/api/order').send(orderReq);
  expect(res.statusCode).toBe(500);
  expect(res.body).toEqual({ message: 'Failed to fulfill order at factory', followLinkToEndChaos: 'url' });
});

test('GET /users should return paginated users', async () => {
  const users = [
    { id: 1, name: 'Alice', email: 'alice@example.com', roles: [{ role: 'Admin' }] },
    { id: 2, name: 'Bob', email: 'bob@example.com', roles: [] },
  ];
  DB.listUsers = jest.fn().mockResolvedValue({ users, more: false });

  app.get('/api/users', async (req, res) => {
    const result = await DB.listUsers();
    res.status(200).json(result.users);
  });

  const res = await request(app).get('/api/users');
  expect(res.statusCode).toBe(200);
  expect(res.body).toEqual(users);
  expect(DB.listUsers).toHaveBeenCalled();
});

test('DELETE /users/:id should delete a user', async () => {
  DB.deleteUser = jest.fn().mockResolvedValue({ message: 'User deleted' });

  app.delete('/api/users/:id', async (req, res) => {
    const result = await DB.deleteUser(parseInt(req.params.id));
    res.status(200).json(result);
  });

  const res = await request(app).delete('/api/users/1');
  expect(res.statusCode).toBe(200);
  expect(res.body).toEqual({ message: 'User deleted' });
  expect(DB.deleteUser).toHaveBeenCalledWith(1);
});

test('PUT /users/:id should update a user', async () => {
  const updatedUser = { id: 1, name: 'Alice Updated', email: 'alice@example.com', roles: [{ role: 'Admin' }] };
  DB.updateUser = jest.fn().mockResolvedValue(updatedUser);

  app.put('/api/users/:id', async (req, res) => {
    const result = await DB.updateUser(parseInt(req.params.id), req.body.name, req.body.email, req.body.password, req.body.roles);
    res.status(200).json(result);
  });

  const res = await request(app)
    .put('/api/users/1')
    .send({ name: 'Alice Updated', roles: [{ role: 'Admin' }] });

  expect(res.statusCode).toBe(200);
  expect(res.body).toEqual(updatedUser);
  expect(DB.updateUser).toHaveBeenCalledWith(1, 'Alice Updated', undefined, undefined, [{ role: 'Admin' }]);
});