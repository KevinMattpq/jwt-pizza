import { test, expect } from './testSetup';
import { Page } from '@playwright/test';

type MockUser = { id: number; name: string; email: string; password: string; roles: { role: string; objectId?: number }[] };

async function mockUserBackend(page: Page, startUser?: MockUser) {
  let user: MockUser = startUser ?? { id: 7, name: '', email: '', password: '', roles: [{ role: 'diner' }] };
  const token = 'fake-token';
  const publicUser = () => ({ id: user.id, name: user.name, email: user.email, roles: user.roles });

  // Register / Login / Logout
  await page.route('*/**/api/auth', async (route) => {
    const req = route.request();
    const body = req.postDataJSON();
    if (req.method() === 'POST') {
      user = { ...user, ...body, roles: [{ role: 'diner' }] };
      return route.fulfill({ json: { user: publicUser(), token } });
    }
    if (req.method() === 'PUT') {
      if (body.email !== user.email || body.password !== user.password) {
        return route.fulfill({ status: 401, json: { message: 'unknown user' } });
      }
      return route.fulfill({ json: { user: publicUser(), token } });
    }
    if (req.method() === 'DELETE') {
      return route.fulfill({ json: { message: 'logout successful' } });
    }
  });

  // GET /api/user/me and PUT /api/user/:id
  await page.route('*/**/api/user/**', async (route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      return route.fulfill({ json: publicUser() });
    }
    if (req.method() === 'PUT') {
      const body = req.postDataJSON();
      user = { ...user, name: body.name, email: body.email, password: body.password || user.password };
      return route.fulfill({ json: { user: publicUser(), token } });
    }
  });

  // Diner dashboard order history
  await page.route('*/**/api/order', async (route) => {
    await route.fulfill({ json: { dinerId: user.id, orders: [], page: 1 } });
  });
}

//Helper Functions
function randomEmail() {
  return `user${Math.floor(Math.random() * 10000)}@jwt.com`;
}

async function register(page: Page, name: string, email: string, password: string) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Register' }).click();
  await page.getByRole('textbox', { name: 'Full name' }).fill(name);
  await page.getByRole('textbox', { name: 'Email address' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('button', { name: 'Register' }).click();
}

async function login(page: Page, email: string, password: string) {
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('button', { name: 'Login' }).click();
}

async function logout(page: Page) {
  await page.getByRole('link', { name: 'Logout' }).click();
}

async function editUser(page: Page, fields: { name?: string; email?: string; password?: string }) {
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.locator('h3')).toContainText('Edit user');
  if (fields.name !== undefined) await page.getByRole('textbox').first().fill(fields.name);
  if (fields.email !== undefined) await page.locator('input[type="email"]').fill(fields.email);
  if (fields.password !== undefined) await page.locator('#password').fill(fields.password);
  await page.getByRole('button', { name: 'Update' }).click();
  await page.waitForSelector('[role="dialog"].hidden', { state: 'attached' });
}

//Dinner - Update User
test('updateUser', async ({ page }) => {
  await mockUserBackend(page);
  const email = randomEmail();

  await register(page, 'pizza diner', email, 'diner');
  await page.getByRole('link', { name: 'pd' }).click();
  await expect(page.getByRole('main')).toContainText('pizza diner');

  await editUser(page, { name: 'pizza dinerx' });
  await expect(page.getByRole('main')).toContainText('pizza dinerx');

  await logout(page);
  await login(page, email, 'diner');
  await page.getByRole('link', { name: 'pd' }).click();
  await expect(page.getByRole('main')).toContainText('pizza dinerx');
});

test('update user email', async ({ page }) => {
  await mockUserBackend(page);
  const email = randomEmail();
  const newEmail = randomEmail().replace('user', 'new');

  await register(page, 'pizza diner', email, 'diner');
  await page.getByRole('link', { name: 'pd' }).click();

  await editUser(page, { email: newEmail });
  await expect(page.getByRole('main')).toContainText(newEmail);

  await logout(page);
  await login(page, newEmail, 'diner');
  await page.getByRole('link', { name: 'pd' }).click();
  await expect(page.getByRole('main')).toContainText(newEmail);
});

test('update user password', async ({ page }) => {
  await mockUserBackend(page);
  const email = randomEmail();

  await register(page, 'pizza diner', email, 'diner');
  await page.getByRole('link', { name: 'pd' }).click();

  await editUser(page, { password: 'newpass' });

  await logout(page);
  await login(page, email, 'newpass');
  await page.getByRole('link', { name: 'pd' }).click();
  await expect(page.getByRole('main')).toContainText('pizza diner');
});

for (const role of ['admin', 'franchisee']) {
  test(`update user as ${role}`, async ({ page }) => {
    const email = `${role}@jwt.com`;
    const roles = role === 'franchisee' ? [{ role: 'franchisee', objectId: 1 }] : [{ role }];
    await mockUserBackend(page, { id: 3, name: `pizza ${role}`, email, password: 'secret', roles });

    await page.goto('/');
    await login(page, email, 'secret');

    const initials = role === 'admin' ? 'pa' : 'pf';
    await page.getByRole('link', { name: initials }).click();
    await expect(page.getByRole('main')).toContainText(`pizza ${role}`);

    await editUser(page, { name: `pizza ${role}x` });
    await expect(page.getByRole('main')).toContainText(`pizza ${role}x`);

    await logout(page);
    await login(page, email, 'secret');
    await page.getByRole('link', { name: initials }).click();
    await expect(page.getByRole('main')).toContainText(`pizza ${role}x`);
  });
}