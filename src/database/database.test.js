const { DB, Role } = require('./database.js');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const dbModel = require('./dbModel.js');

jest.mock('mysql2/promise');
jest.mock('bcrypt');

  let connectionMock;

  beforeEach(() => {
    connectionMock = {
      execute: jest.fn(),
      query: jest.fn(),
      end: jest.fn(),
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
    };
    mysql.createConnection.mockResolvedValue(connectionMock);

    bcrypt.hash.mockReset();
    bcrypt.compare.mockReset();
  });

  test('getMenu returns rows', async () => {
    connectionMock.execute.mockResolvedValue([[{ id: 1, title: 'Pizza' }]]);
    const result = await DB.getMenu();
    expect(result).toEqual([{ id: 1, title: 'Pizza' }]);
    expect(connectionMock.end).toHaveBeenCalled();
  });

  test('addMenuItem returns inserted item with id', async () => {
    connectionMock.execute.mockResolvedValue([{ insertId: 123 }]);
    const item = { title: 'Burger', description: 'Yum', image: '', price: 5 };
    const result = await DB.addMenuItem(item);
    expect(result).toEqual({ ...item, id: 123 });
  });

  test('addUser hashes password and inserts roles', async () => {
  bcrypt.hash.mockResolvedValue('hashedPassword');

  connectionMock.execute
    .mockResolvedValueOnce([{ insertId: 1 }])
    .mockResolvedValueOnce([[{ id: 10 }]])
    .mockResolvedValueOnce([{ insertId: 100 }]);

  const user = {
    name: 'Alice',
    email: 'a@test.com',
    password: 'pass',
    roles: [{ role: Role.Franchisee, object: 'SomeFranchise' }],
  };

  const result = await DB.addUser(user);

  expect(result.password).toBeUndefined();
  expect(result.id).toBe(1);
  expect(connectionMock.end).toHaveBeenCalled();
});

  test('getUser throws 404 if not found', async () => {
    connectionMock.execute.mockResolvedValue([[]]);
    await expect(DB.getUser('a@test.com')).rejects.toThrow('unknown user');
  });

  test('isLoggedIn returns true if token exists', async () => {
    connectionMock.execute.mockResolvedValue([[{ userId: 1 }]]);
    const loggedIn = await DB.isLoggedIn('header.payload.signature');
    expect(loggedIn).toBe(true);
  });

  test('getOffset calculates correctly', () => {
    expect(DB.getOffset(3, 10)).toEqual((3 - 1) * [10]);
  });

  test('getTokenSignature returns correct part', () => {
    expect(DB.getTokenSignature('a.b.c')).toBe('c');
    expect(DB.getTokenSignature('a.b')).toBe('');
  });

  test('getID returns id or throws', async () => {
    connectionMock.execute.mockResolvedValue([[{ id: 42 }]]);
    const id = await DB.getID(connectionMock, 'name', 'test', 'table');
    expect(id).toBe(42);

    connectionMock.execute.mockResolvedValue([[]]);
    await expect(DB.getID(connectionMock, 'name', 'test', 'table')).rejects.toThrow('No ID found');
    });
