const request = require('supertest');
const app = require('../service');
const { DB, Role } = require('../database/database.js');

const adminUser = { 
  name: 'admin', 
  email: 'f@jwt.com', 
  password: 'a',
  roles: ['Admin'],
};

let adminAuthToken;

beforeAll(async () => {
  const registerRes = await request(app).post('/api/auth').send(adminUser);
  adminAuthToken = registerRes.body.token;
});

  test('GET /api/franchise - list franchises', async () => {
    const res = await request(app)
      .get('/api/franchise')
      .set('Authorization', `Bearer ${adminAuthToken}`);
    expect(res.status).toBe(200);
    expect(res.body.franchises).toBeDefined();
    expect(Array.isArray(res.body.franchises)).toBe(true);
    expect(res.body.more).toBeDefined();
  });

  test('GET /api/franchise/:userId - get user franchises', async () => {
    const res = await request(app)
      .get(`/api/franchise/4`)
      .set('Authorization', `Bearer ${adminAuthToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('DELETE /api/franchise/:franchiseId - delete franchise', async () => {
    const createRes = await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${adminAuthToken}`)
      .send({ name: 'DeleteMe', admins: adminUser.admins });
    const franchiseId = createRes.body.id;
    const res = await request(app)
      .delete(`/api/franchise/${franchiseId}`)
      .set('Authorization', `Bearer ${adminAuthToken}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('franchise deleted');
  });
