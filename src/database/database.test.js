const { DB, Role } = require('./database.js');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

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

test('updateUser updates user and calls getUser', async () => {
  bcrypt.hash.mockResolvedValue('hashedPass');
  connectionMock.execute.mockResolvedValue([{}]);
  const getUserSpy = jest.spyOn(DB, 'getUser').mockResolvedValue({ updated: true });
  const result = await DB.updateUser(1, 'NewName', 'new@test.com', 'pass');
  expect(result).toEqual({ updated: true });
  expect(getUserSpy).toHaveBeenCalledWith('new@test.com', 'pass');
});



test('getOrders returns orders with items', async () => {
  connectionMock.execute
    .mockResolvedValueOnce([[{ id: 1, franchiseId: 1, storeId: 1, date: '2025-01-01' }]])
    .mockResolvedValueOnce([[{ id: 10, menuId: 1, description: 'Pizza', price: 10 }]]);
  const result = await DB.getOrders({ id: 1 });
  expect(result.orders[0].items).toHaveLength(1);
  expect(result.page).toBe(1);
});

test('deleteFranchise rolls back on error', async () => {
  connectionMock.beginTransaction.mockResolvedValue();
  connectionMock.execute.mockRejectedValueOnce(new Error('fail'));
  connectionMock.rollback.mockResolvedValue();
  await expect(DB.deleteFranchise(1)).rejects.toThrow('unable to delete franchise');
});

test('getFranchises returns list and sets stores', async () => {
  connectionMock.execute.mockResolvedValue([[{ id: 1, name: 'F' }]]);
  const result = await DB.getFranchises({ isRole: () => false });
  expect(result[0][0].stores).toBeDefined();
});

test('getUserFranchises returns empty array when none', async () => {
  connectionMock.execute.mockResolvedValue([[]]);
  const result = await DB.getUserFranchises(1);
  expect(result).toEqual([]);
});

test('getFranchise attaches admins and stores', async () => {
  connectionMock.execute
    .mockResolvedValueOnce([[{ id: 1, name: 'A', email: 'a@test.com' }]]) // admins
    .mockResolvedValueOnce([[{ id: 1, name: 'Store', totalRevenue: 100 }]]); // stores
  const franchise = { id: 1 };
  const result = await DB.getFranchise(franchise);
  expect(result.admins).toBeDefined();
  expect(result.stores).toBeDefined();
});

test('createStore inserts store', async () => {
  connectionMock.execute.mockResolvedValue([{ insertId: 50 }]);
  const result = await DB.createStore(1, { name: 'S' });
  expect(result.id).toBe(50);
});
