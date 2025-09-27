const request = require('supertest');
const express = require('express');
const orderRouter = require('./orderRouter.js');
const { DB } = require('../database/database.js');
const { authRouter } = require('./authRouter.js');

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
  });

  jest.clearAllMocks();
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
  const orderReq = { franchiseId: 1, storeId: 1, items: [{ menuId: 1 }] };
  const order = { id: 1, ...orderReq };
  DB.addDinerOrder.mockResolvedValue(order);
  fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ reportUrl: 'url', jwt: '111111' }),
  });
  const res = await request(app).post('/api/order').send(orderReq);
  expect(res.statusCode).toBe(200);
  expect(res.body).toEqual({ order, followLinkToEndChaos: 'url', jwt: '111111' });
});

test('POST / should handle failed factory API', async () => {
  const orderReq = { franchiseId: 1, storeId: 1, items: [{ menuId: 1 }] };
  const order = { id: 1, ...orderReq };
  DB.addDinerOrder.mockResolvedValue(order);
  fetch.mockResolvedValueOnce({
    ok: false,
    json: async () => ({ reportUrl: 'url' }),
  });
  const res = await request(app).post('/api/order').send(orderReq);
  expect(res.statusCode).toBe(500);
  expect(res.body).toEqual({ message: 'Failed to fulfill order at factory', followLinkToEndChaos: 'url' });
});
