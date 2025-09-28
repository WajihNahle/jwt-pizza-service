const request = require('supertest');
const app = require('./service');
const version = require('./version.json');
const config = require('./config.js');



const testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };
// let testUserAuthToken;

beforeAll(async () => {
  testUser.email = Math.random().toString(36).substring(2, 12) + '@test.com';
  /*const registerRes = */await request(app).post('/api/auth').send(testUser);
  // testUserAuthToken = registerRes.body.token;
});

// 
test('login', async () => {
  const loginRes = await request(app).put('/api/auth').send(testUser);
  expect(loginRes.status).toBe(200);
  expect(loginRes.body.token).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);

  const expectedUser = { ...testUser, roles: [{ role: 'diner' }] };
  delete expectedUser.password;
  expect(loginRes.body.user).toMatchObject(expectedUser);
});

test('API Docs', async () => {
  const res = await request(app).get('/api/docs')
  expect(res.status).toBe(200);
  expect(res.body.version).toBe(version.version);
  expect(res.body.endpoints.length).toBeGreaterThan(0);
  expect(res.body.config).toBeDefined();
  expect(res.body.config.factory).toBe(config.factory.url);
  expect(res.body.config.db).toBe(config.db.connection.host);
})


test('Homepage', async () => {
  const res = await request(app).get('/');
  expect(res.status).toBe(200);
  expect(res.body.message).toBe('welcome to JWT Pizza');
  expect(res.body.version).toBe(version.version);
});

test('Unknown endpoint', async () => {
  const res = await request(app).get('/unknown-endpoint');
  expect(res.status).toBe(404);
  expect(res.body.message).toBe('unknown endpoint');
});

test('error handler', async () => {
  
});

