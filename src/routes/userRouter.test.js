// userRouter.test.js
const request = require('supertest');
const express = require('express');
const userRouter = require('./userRouter'); // default export
const { DB } = require('../database/database.js');

// Mock authRouter functions used in userRouter
jest.mock('./authRouter.js', () => ({
  authRouter: {
    authenticateToken: (req, res, next) => {
      req.user = { id: 1, isRole: (role) => role === 'admin' }; // mock admin user
      next();
    },
  },
  setAuth: jest.fn().mockResolvedValue('token123'), // mock token
}));

beforeEach(() => {
  jest.resetAllMocks();

  // Mock DB connection
  DB.getConnection = jest.fn().mockResolvedValue({
    query: jest.fn(),
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    end: jest.fn(),
  });

  // Mock DB.query
  DB.query = jest.fn();
});

// Create Express app and attach userRouter
const app = express();
app.use(express.json());
app.use('/users', userRouter);

describe('userRouter', () => {
  test('GET /users returns paginated users', async () => {
  const mockUsers = [
    { id: 1, name: 'Alice', email: 'a@test.com', roles: [{ role: 'diner' }] },
    { id: 2, name: 'Bob', email: 'b@test.com', roles: [{ role: 'diner' }] },
  ];

  // Mock DB.listUsers to return [users, more]
  DB.listUsers = jest.fn().mockResolvedValue([mockUsers, false]);

  const res = await request(app).get('/users?page=1&limit=10');

  expect(res.statusCode).toBe(200);
  expect(res.body.users.length).toBe(2);
  expect(res.body.users[0].roles).toEqual([{ role: 'diner' }]);
  expect(res.body.more).toBe(false);

  expect(DB.listUsers).toHaveBeenCalledWith('1', '10', undefined); // query params are strings
});


  test('GET /users/me returns authenticated user', async () => {
    const res = await request(app).get('/users/me');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ id: 1 }); // match what router actually returns
  });

  test('DELETE /users/:userId deletes user successfully', async () => {
    const connection = await DB.getConnection();
    DB.query.mockResolvedValueOnce({ affectedRows: 1 }); // delete from userRole
    DB.query.mockResolvedValueOnce({ affectedRows: 1 }); // delete from user

    const res = await request(app).delete('/users/1');

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ message: 'User deleted successfully' });
    expect(connection.commit).toHaveBeenCalled();
  });

  test('DELETE /users/:userId returns 404 if user not found', async () => {
    const connection = await DB.getConnection();
    DB.query.mockResolvedValueOnce({ affectedRows: 1 }); // delete from userRole
    DB.query.mockResolvedValueOnce({ affectedRows: 0 }); // delete from user

    const res = await request(app).delete('/users/999');

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ message: 'User not found' });
    expect(connection.rollback).toHaveBeenCalled();
  });

  test('PUT /:userId - non-admin updating another user returns 403', async () => {
    const nonAdminAuth = (req, res, next) => {
      req.user = { id: 2, isRole: () => false };
      next();
    };
    app.put('/test/:userId', nonAdminAuth, userRouter.stack.find(r => r.route?.path === '/:userId').route.stack[1].handle);

    const res = await request(app).put('/test/1').send({ name: 'New Name' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'unauthorized' });
  });

  test('GET /users returns paginated users', async () => {
  const mockUsers = [
    { id: 1, name: 'Alice', email: 'alice@test.com', roles: [{ role: 'diner' }] },
    { id: 2, name: 'Bob', email: 'bob@test.com', roles: [{ role: 'admin' }] },
  ];

  // Mock DB.listUsers to return [users, more]
  DB.listUsers = jest.fn().mockResolvedValue([mockUsers, false]);

  const res = await request(app)
    .get('/users')  // corrected path
    .query({ page: 1, limit: 10, name: '*' });

  expect(res.status).toBe(200);
  expect(res.body).toEqual({
    users: [
      { id: 1, name: 'Alice', email: 'alice@test.com', roles: [{ role: 'diner' }] },
      { id: 2, name: 'Bob', email: 'bob@test.com', roles: [{ role: 'admin' }] },
    ],
    more: false,
  });

  expect(DB.listUsers).toHaveBeenCalledWith('1', '10', '*'); // query params are strings
});


  test('DELETE /users/:userId - deleting non-existent user returns 404', async () => {
  const mockConn = {
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    end: jest.fn(),
  };
  DB.getConnection.mockResolvedValue(mockConn);

  // Mock queries: first deletes userRole, second attempts to delete user but returns 0 affected rows
  DB.query.mockResolvedValueOnce({ affectedRows: 1 }); // delete userRole
  DB.query.mockResolvedValueOnce({ affectedRows: 0 }); // delete user fails

  const res = await request(app).delete('/users/999'); // correct route

  expect(res.status).toBe(404);
  expect(res.body).toEqual({ message: 'User not found' });
  expect(mockConn.rollback).toHaveBeenCalled();
  expect(mockConn.end).toHaveBeenCalled();
  });

});
