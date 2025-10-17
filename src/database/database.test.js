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

test('updateUser updates user and returns updated record', async () => {
  bcrypt.hash.mockResolvedValue('hashedPass');
  bcrypt.compare.mockResolvedValue(true);

  connectionMock.execute
    .mockResolvedValueOnce([{}]); 

  connectionMock.execute
    .mockResolvedValueOnce([[{ id: 1, name: 'Alice', email: 'alice@test.com', password: 'hashedPass' }]]); // SELECT user

  connectionMock.execute
    .mockResolvedValueOnce([[{ role: Role.Diner, objectId: null }]]);

  const result = await DB.updateUser(
    1,
    'Alice',
    'alice@test.com',
    'newpass',
    [{ role: Role.Diner }]
  );

  expect(result).toEqual({
    id: 1,
    name: 'Alice',
    email: 'alice@test.com',
    roles: [{ role: Role.Diner, objectId: undefined }],
  });
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

// List users (paginated and filtered)
test('listUsers returns paginated users with roles', async () => {
  // Mock users returned by first query
  const mockUsers = [
    { id: 1, name: 'Alice', email: 'alice@test.com' },
    { id: 2, name: 'Bob', email: 'bob@test.com' },
  ];

  // Mock roles for each user
  const mockRolesAlice = [{ role: Role.Diner, objectId: null }];
  const mockRolesBob = [{ role: Role.Admin, objectId: null }];

  // Mock queries in order: users, roles for Alice, roles for Bob
  connectionMock.execute
    .mockResolvedValueOnce([mockUsers])      // query users
    .mockResolvedValueOnce([mockRolesAlice]) // query roles for Alice
    .mockResolvedValueOnce([mockRolesBob]);  // query roles for Bob

  const [users, more] = await DB.listUsers(1, 10, '*');

  // Expected output
  const expectedUsers = [
    { id: 1, name: 'Alice', email: 'alice@test.com', roles: [{ role: Role.Diner, objectId: undefined }] },
    { id: 2, name: 'Bob', email: 'bob@test.com', roles: [{ role: Role.Admin, objectId: undefined }] },
  ];

  expect(users).toEqual(expectedUsers);
  expect(more).toBe(false);
  expect(connectionMock.end).toHaveBeenCalled();
});

// Delete user
test('deleteUser removes user by ID', async () => {
  connectionMock.execute.mockResolvedValue([{ affectedRows: 1 }]);
  const result = await DB.deleteUser(1);
  expect(result).toEqual({ message: 'User deleted' });

  // Simulate user not found
  connectionMock.execute.mockResolvedValue([{ affectedRows: 0 }]);
  await expect(DB.deleteUser(999)).rejects.toThrow('User not found');
});

// Update user
test('updateUser updates user data and returns updated record', async () => {
  bcrypt.hash.mockResolvedValue('hashedPass');
  bcrypt.compare.mockResolvedValue(true);

  connectionMock.execute.mockResolvedValueOnce([{}]);

  connectionMock.execute.mockResolvedValueOnce([
    [{ id: 1, name: 'Alice', email: 'alice@test.com', password: 'hashedPass' }]
  ]);

  connectionMock.execute.mockResolvedValueOnce([
    [{ role: Role.Diner, objectId: null }]
  ]);

  const result = await DB.updateUser(
    1,
    'Alice',
    'alice@test.com',
    'newpass',
    [{ role: Role.Diner }]
  );

  expect(result).toEqual({
    id: 1,
    name: 'Alice',
    email: 'alice@test.com',
    roles: [{ role: Role.Diner, objectId: undefined }],
  });

  expect(connectionMock.end).toHaveBeenCalled();
});



test('updateUser with no roles or password', async () => {
  // No password or roles
  connectionMock.execute
    .mockResolvedValueOnce([{}]) // UPDATE user (name/email only)
    .mockResolvedValueOnce([[{ id: 2, name: 'Bob', email: 'bob@test.com' }]]) // SELECT user
    .mockResolvedValueOnce([[]]); // SELECT user roles

  const result = await DB.updateUser(2, 'Bob', 'bob@test.com');
  expect(result).toEqual({ id: 2, name: 'Bob', email: 'bob@test.com', roles: [] });
});


test('listUsers groups multiple roles per user', async () => {
  // Mock the initial users query
  const mockUsers = [
    { id: 1, name: 'Alice', email: 'a@test.com' },
  ];

  // Mock roles query for Alice
  const mockRolesAlice = [
    { role: Role.Diner, objectId: null },
    { role: Role.Admin, objectId: null },
  ];

  // Mock queries in order: users, roles for Alice
  connectionMock.execute
    .mockResolvedValueOnce([mockUsers])      // query users
    .mockResolvedValueOnce([mockRolesAlice]); // query roles for Alice

  const [users, more] = await DB.listUsers(1, 10, '*');

  expect(users).toEqual([
    {
      id: 1,
      name: 'Alice',
      email: 'a@test.com',
      roles: [
        { role: Role.Diner, objectId: undefined },
        { role: Role.Admin, objectId: undefined },
      ],
    },
  ]);

  expect(more).toBe(false);
  expect(connectionMock.end).toHaveBeenCalled();
});


test('deleteFranchise commits successfully', async () => {
  connectionMock.beginTransaction.mockResolvedValue();
  connectionMock.execute.mockResolvedValue([{}]); // all deletes
  connectionMock.commit.mockResolvedValue();

  await expect(DB.deleteFranchise(10)).resolves.toBeUndefined();
  expect(connectionMock.commit).toHaveBeenCalled();
});

test('getUser returns user with multiple roles', async () => {
  bcrypt.compare.mockResolvedValue(true);
  connectionMock.execute
    .mockResolvedValueOnce([[{ id: 1, name: 'Alice', email: 'a@test.com', password: 'hash' }]]) // SELECT user
    .mockResolvedValueOnce([
      [{ role: Role.Diner, objectId: null }, { role: Role.Admin, objectId: 0 }],
    ]); // SELECT roles

  const result = await DB.getUser('a@test.com', 'password');
  expect(result).toEqual({
    id: 1,
    name: 'Alice',
    email: 'a@test.com',
    roles: [
      { role: Role.Diner, objectId: undefined },
      { role: Role.Admin, objectId: undefined },
    ],
    password: undefined,
  });
});

test('getFranchises calls getFranchise for admin', async () => {
  const franchise = { id: 1, name: 'F' };
  connectionMock.execute.mockResolvedValue([[franchise]]);

  const getFranchiseSpy = jest.spyOn(DB, 'getFranchise').mockResolvedValue({ ...franchise, stores: [] });

  const result = await DB.getFranchises({ isRole: () => true });
  expect(getFranchiseSpy).toHaveBeenCalled();
});

test('getTokenSignature returns empty string for invalid token', () => {
  expect(DB.getTokenSignature('')).toBe('');
  expect(DB.getTokenSignature('singlepart')).toBe('');
});

test('getID returns correct id', async () => {
  connectionMock.execute.mockResolvedValue([[{ id: 123 }]]);
  const id = await DB.getID(connectionMock, 'name', 'test', 'table');
  expect(id).toBe(123);
});

test('addUser with no roles', async () => {
  bcrypt.hash.mockResolvedValue('hash');
  connectionMock.execute.mockResolvedValueOnce([{ insertId: 1 }]);
  const user = { name: 'X', email: 'x@test.com', password: 'pass', roles: [] };
  const result = await DB.addUser(user);
  expect(result.id).toBe(1);
});

test('updateUser returns empty roles if none provided', async () => {
  connectionMock.execute
    .mockResolvedValueOnce([{}])
    .mockResolvedValueOnce([[{ id: 5, name: 'Eve', email: 'eve@test.com' }]])
    .mockResolvedValueOnce([[]]);

  const result = await DB.updateUser(5, 'Eve', 'eve@test.com');
  expect(result.roles).toEqual([]);
});
