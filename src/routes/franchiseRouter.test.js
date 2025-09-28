const request = require('supertest');
const express = require('express');
const franchiseRouter = require('./franchiseRouter.js');
const { DB } = require('../database/database.js');
const { authRouter } = require('./authRouter.js');

jest.mock('../database/database.js', () => ({
  DB: {
    getFranchises: jest.fn(),
    getUserFranchises: jest.fn(),
    createFranchise: jest.fn(),
    deleteFranchise: jest.fn(),
    getFranchise: jest.fn(),
    createStore: jest.fn(),
    deleteStore: jest.fn(),
  },
  Role: { Admin: 'Admin' },
}));

jest.mock('./authRouter.js', () => ({
  authRouter: {
    authenticateToken: jest.fn((req, res, next) => {
      req.user = { id: 1, isRole: jest.fn() };
      next();
    }),
  },
}));

let app;
beforeEach(() => {
  app = express();
  app.use(express.json());
  app.use('/api/franchise', franchiseRouter);

  app.use((err, req, res, next) => {
    if (err.statusCode) {
      res.status(err.statusCode).json({ message: err.message });
    } else {
      res.status(500).json({ message: err.message });
    }
    next(); // done to fulfill linting error
  });

  jest.clearAllMocks();
});

test('GET / should return franchises', async () => {
  DB.getFranchises.mockResolvedValue([[{ id: 1 }], true]);
  const res = await request(app).get('/api/franchise');
  expect(res.statusCode).toBe(200);
  expect(res.body).toEqual({ franchises: [{ id: 1 }], more: true });
  expect(DB.getFranchises).toHaveBeenCalledWith(undefined, undefined, undefined, undefined);

});

test('GET /:userId should return user franchises for same user', async () => {
  DB.getUserFranchises.mockResolvedValue([{ id: 2 }]);
  const res = await request(app).get('/api/franchise/1');
  expect(res.statusCode).toBe(200);
  expect(res.body).toEqual([{ id: 2 }]);
  expect(DB.getUserFranchises).toHaveBeenCalledWith(1);
});

test('GET /:userId should return empty array if not admin or same user', async () => {
  authRouter.authenticateToken.mockImplementation((req, res, next) => {
    req.user = { id: 99, isRole: jest.fn(() => false) };
    next();
  });
  const res = await request(app).get('/api/franchise/1');
  expect(res.statusCode).toBe(200);
  expect(res.body).toEqual([]);
});

test('POST / should create franchise for admin', async () => {
  const franchise = { name: 'pizzaPocket' };
  authRouter.authenticateToken.mockImplementation((req, res, next) => {
    req.user = { isRole: jest.fn(() => true) };
    next();
  });
  DB.createFranchise.mockResolvedValue(franchise);
  const res = await request(app).post('/api/franchise').send(franchise);
  expect(res.statusCode).toBe(200);
  expect(res.body).toEqual(franchise);
});

test('POST / should fail for non-admin', async () => {
  authRouter.authenticateToken.mockImplementation((req, res, next) => {
    req.user = { isRole: jest.fn(() => false) };
    next();
  });
  const res = await request(app).post('/api/franchise').send({ name: 'x' });
  expect(res.statusCode).toBe(403);
  expect(res.body).toEqual({ message: 'unable to create a franchise' });
});

test('DELETE /:franchiseId should delete franchise', async () => {
  DB.deleteFranchise.mockResolvedValue();
  const res = await request(app).delete('/api/franchise/1');
  expect(res.statusCode).toBe(200);
  expect(res.body).toEqual({ message: 'franchise deleted' });
});

test('POST /:franchiseId/store should create store for admin', async () => {
  authRouter.authenticateToken.mockImplementation((req, res, next) => {
    req.user = { id: 1, isRole: jest.fn(() => true) };
    next();
  });
  DB.getFranchise.mockResolvedValue({ id: 1, admins: [{ id: 1 }] });
  DB.createStore.mockResolvedValue({ id: 1, name: 'SLC', totalRevenue: 0 });
  const res = await request(app).post('/api/franchise/1/store').send({ name: 'SLC' });
  expect(res.statusCode).toBe(200);
  expect(res.body).toEqual({ id: 1, name: 'SLC', totalRevenue: 0 });
});

test('POST /:franchiseId/store should fail for unauthorized user', async () => {
  authRouter.authenticateToken.mockImplementation((req, res, next) => {
    req.user = { id: 2, isRole: jest.fn(() => false) };
    next();
  });
  DB.getFranchise.mockResolvedValue({ id: 1, admins: [{ id: 1 }] });
  const res = await request(app).post('/api/franchise/1/store').send({ name: 'SLC' });
  expect(res.statusCode).toBe(403);
  expect(res.body).toEqual({ message: 'unable to create a store' });
});

test('DELETE /:franchiseId/store/:storeId should delete store for admin', async () => {
  authRouter.authenticateToken.mockImplementation((req, res, next) => {
    req.user = { id: 1, isRole: jest.fn(() => true) };
    next();
  });
  DB.getFranchise.mockResolvedValue({ id: 1, admins: [{ id: 1 }] });
  DB.deleteStore.mockResolvedValue();
  const res = await request(app).delete('/api/franchise/1/store/1');
  expect(res.statusCode).toBe(200);
  expect(res.body).toEqual({ message: 'store deleted' });
});

test('DELETE /:franchiseId/store/:storeId should fail for unauthorized user', async () => {
  authRouter.authenticateToken.mockImplementation((req, res, next) => {
    req.user = { id: 2, isRole: jest.fn(() => false) };
    next();
  });
  DB.getFranchise.mockResolvedValue({ id: 1, admins: [{ id: 1 }] });
  const res = await request(app).delete('/api/franchise/1/store/1');
  expect(res.statusCode).toBe(403);
  expect(res.body).toEqual({ message: 'unable to delete a store' });
});
