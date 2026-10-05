import { Page } from "@playwright/test";
import { test, expect } from "./testSetup";
import { Role, User } from "../src/service/pizzaService";

async function basicInit(page: Page) {
  let loggedInUser: User | undefined;
  const validUsers: Record<string, User> = {
    "d@jwt.com": {
      id: "3",
      name: "Kai Chen",
      email: "d@jwt.com",
      password: "a",
      roles: [{ role: Role.Diner }],
    },
    "f@jwt.com": {
      id: "4",
      name: "pizza franchisee",
      email: "f@jwt.com",
      password: "a",
      roles: [{ role: Role.Franchisee, objectId: "2" }],
    },
    "a@jwt.com": {
      id: "1",
      name: "Admin",
      email: "a@jwt.com",
      password: "admin",
      roles: [{ role: Role.Admin }],
    },
  };

  await page.route("*/**/api/auth", async (route) => {
    const method = route.request().method();

    // Register
    if (method === "POST") {
      const registerReq = route.request().postDataJSON();
      const newUser: User = {
        id: "10",
        name: registerReq.name,
        email: registerReq.email,
        password: registerReq.password,
        roles: [{ role: Role.Diner }],
      };
      validUsers[registerReq.email] = newUser;
      loggedInUser = newUser;
      await route.fulfill({ json: { user: loggedInUser, token: "abcdef" } });
      return;
    }

    // Logout
    if (method === "DELETE") {
      loggedInUser = undefined;
      await route.fulfill({ json: { message: "logout successful" } });
      return;
    }

    // Login
    expect(method).toBe("PUT");
    const loginReq = route.request().postDataJSON();
    const user = validUsers[loginReq.email];
    if (!user || user.password !== loginReq.password) {
      await route.fulfill({ status: 401, json: { error: "Unauthorized" } });
      return;
    }
    loggedInUser = user;
    await route.fulfill({ json: { user: loggedInUser, token: "abcdef" } });
  });

  await page.route("*/**/api/user/me", async (route) => {
    expect(route.request().method()).toBe("GET");
    await route.fulfill({ json: loggedInUser });
  });

  await page.route("*/**/api/order/menu", async (route) => {
    const menuRes = [
      {
        id: 1,
        title: "Veggie",
        image: "pizza1.png",
        price: 0.0038,
        description: "A garden of delight",
      },
      {
        id: 2,
        title: "Pepperoni",
        image: "pizza2.png",
        price: 0.0042,
        description: "Spicy treat",
      },
    ];
    expect(route.request().method()).toBe("GET");
    await route.fulfill({ json: menuRes });
  });

  const franchises: any[] = [
    {
      id: 2,
      name: "LotaPizza",
      stores: [
        { id: 4, name: "Lehi" },
        { id: 5, name: "Springville" },
        { id: 6, name: "American Fork" },
      ],
    },
    { id: 3, name: "PizzaCorp", stores: [{ id: 7, name: "Spanish Fork" }] },
    { id: 4, name: "topSpot", stores: [] },
  ];

  await page.route(/\/api\/franchise(\?.*)?$/, async (route) => {
    const method = route.request().method();

    // Create franchise
    if (method === "POST") {
      const franchiseReq = route.request().postDataJSON();
      const newFranchise = { ...franchiseReq, id: 10, stores: [] };
      franchises.push(newFranchise);
      await route.fulfill({ json: newFranchise });
      return;
    }

    expect(method).toBe("GET");
    await route.fulfill({ json: { franchises, more: false } });
  });

  await page.route("*/**/api/order", async (route) => {
    const orderReq = route.request().postDataJSON();
    const orderRes = {
      order: { ...orderReq, id: 23 },
      jwt: "eyJpYXQ",
    };
    expect(route.request().method()).toBe("POST");
    await route.fulfill({ json: orderRes });
  });

  // Franchisee's own franchise and store creation
  const myFranchise = {
    id: 2,
    name: "LotaPizza",
    admins: [{ id: 4, name: "Pizza Franchisee", email: "f@jwt.com" }],
    stores: [{ id: 4, name: "Lehi", totalRevenue: 0 }],
  };

  await page.route(/\/api\/franchise\/\d+$/, async (route) => {
    // Close franchise
    if (route.request().method() === "DELETE") {
      const id = Number(route.request().url().split("/").pop());
      const index = franchises.findIndex((f) => f.id === id);
      if (index !== -1) franchises.splice(index, 1);
      await route.fulfill({ json: { message: "franchise deleted" } });
      return;
    }

    expect(route.request().method()).toBe("GET");
    await route.fulfill({ json: [myFranchise] });
  });

  await page.route(/\/api\/franchise\/\d+\/store$/, async (route) => {
    expect(route.request().method()).toBe("POST");
    const storeReq = route.request().postDataJSON();
    const newStore = { id: 8, name: storeReq.name, totalRevenue: 0 };
    myFranchise.stores.push(newStore);
    await route.fulfill({ json: newStore });
  });

  await page.goto("/");
}

//Login test
test("login", async ({ page }) => {
  await basicInit(page);
  await page.getByRole("link", { name: "Login" }).click();
  await page.getByRole("textbox", { name: "Email address" }).fill("d@jwt.com");
  await page.getByRole("textbox", { name: "Password" }).fill("a");
  await page.getByRole("button", { name: "Login" }).click();

  await expect(page.getByRole("link", { name: "KC" })).toBeVisible();
});

//Purchase with login
test("purchase with login", async ({ page }) => {
  await basicInit(page);

  await page.getByRole("button", { name: "Order now" }).click();

  await expect(page.locator("h2")).toContainText("Awesome is a click away");
  await page.getByRole("combobox").selectOption("4");
  await page.getByRole("link", { name: "Image Description Veggie A" }).click();
  await page.getByRole("link", { name: "Image Description Pepperoni" }).click();
  await expect(page.locator("form")).toContainText("Selected pizzas: 2");
  await page.getByRole("button", { name: "Checkout" }).click();

  await page.getByPlaceholder("Email address").fill("d@jwt.com");
  await page.getByPlaceholder("Password").fill("a");
  await page.getByRole("button", { name: "Login" }).click();

  await expect(page.getByRole("main")).toContainText(
    "Send me those 2 pizzas right now!"
  );
  await expect(page.locator("tbody")).toContainText("Veggie");
  await expect(page.locator("tbody")).toContainText("Pepperoni");
  await expect(page.locator("tfoot")).toContainText("0.008 ₿");
  await page.getByRole("button", { name: "Pay now" }).click();

  await expect(page.getByText("0.008")).toBeVisible();
});
//Register user
test("Register User", async ({ page }) => {
  await basicInit(page);
  await page.getByRole("link", { name: "Register" }).click();
  await page.getByRole("textbox", { name: "Full name" }).click();
  await page.getByRole("textbox", { name: "Full name" }).press("CapsLock");
  await page.getByRole("textbox", { name: "Full name" }).fill("Matthew ");
  await page.getByRole("textbox", { name: "Full name" }).press("CapsLock");
  await page.getByRole("textbox", { name: "Full name" }).fill("Matthew Pena");
  await page.getByRole("textbox", { name: "Full name" }).press("Tab");
  await page
    .getByRole("textbox", { name: "Email address" })
    .fill("matt@test.com");
  await page.getByRole("textbox", { name: "Email address" }).press("Tab");
  await page.getByRole("textbox", { name: "Password" }).fill("a");
  await page.getByRole("button", { name: "Register" }).click();
});

//Logout test
test("Log out", async ({ page }) => {
  await basicInit(page);
  await page.getByRole("link", { name: "Login" }).click();
  await page.getByRole("textbox", { name: "Email address" }).fill("d@jwt.com");
  await page.getByRole("textbox", { name: "Password" }).fill("a");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page.getByRole("link", { name: "KC" })).toBeVisible();

  await page.getByRole("link", { name: "Logout" }).click();
  await expect(page.getByRole("link", { name: "Login" })).toBeVisible();
  await expect(page.getByRole("link", { name: "KC" })).not.toBeVisible();
});

//Creating a store as franchise
test("Creating and closing a store", async ({ page }) => {
  await basicInit(page);
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).fill('franchisee');
  await page.getByRole('textbox', { name: 'Email address' }).press('ControlOrMeta+z');
  await page.getByRole('textbox', { name: 'Email address' }).fill('f@jwt.com');
  await page.getByRole('textbox', { name: 'Email address' }).press('Tab');
  await page.getByRole('textbox', { name: 'Password' }).fill('franchisee');
  await page.getByRole('button', { name: 'Login' }).click();
  await page.getByRole('navigation', { name: 'Global' }).getByRole('link', { name: 'Franchise' }).click();
  await page.getByRole('button', { name: 'Create store' }).click();
  await page.getByRole('textbox', { name: 'store name' }).click();
  await page.getByRole('textbox', { name: 'store name' }).press('CapsLock');
  await page.getByRole('textbox', { name: 'store name' }).fill('Lehi');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('row', { name: 'Lehi 0 ₿ Close' }).getByRole('button').click();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('heading')).toContainText('pizzaPocket');
});

//Navigating as admin
test("Navigating as admin", async ({ page }) => {
  await basicInit(page);

  await page.getByRole("link", { name: "Login" }).click();
  await page.getByRole("textbox", { name: "Email address" }).fill("a@jwt.com");
  await page.getByRole("textbox", { name: "Password" }).fill("admin");
  await page.getByRole("button", { name: "Login" }).click();

  await page.getByRole("link", { name: "Admin" }).click();

  await expect(page.getByText("Mama Ricci's kitchen")).toBeVisible();
  await expect(page.getByText("LotaPizza")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add Franchise" })
  ).toBeVisible();
});

test('Create and Close Franchise', async ({ page }) => {
  await basicInit(page);

  // Log in as admin and open the admin dashboard
  await page.getByRole("link", { name: "Login" }).click();
  await page.getByRole("textbox", { name: "Email address" }).fill("a@jwt.com");
  await page.getByRole("textbox", { name: "Password" }).fill("admin");
  await page.getByRole("button", { name: "Login" }).click();
  await page.getByRole("link", { name: "Admin" }).click();

  // Create a franchise
  await page.getByRole("button", { name: "Add Franchise" }).click();
  await page.getByPlaceholder("franchise name").fill("pizzaPocket");
  await page.getByPlaceholder("franchisee admin email").fill("f@jwt.com");
  await page.getByRole("button", { name: "Create" }).click();

  const newRow = page.getByRole("row").filter({ hasText: "pizzaPocket" });
  await expect(newRow).toBeVisible();

  // Close the franchise
  await newRow.getByRole("button", { name: "Close" }).click();
  await expect(page.getByText("Sorry to see you go")).toBeVisible();
  await expect(page.getByText("pizzaPocket")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  await expect(page.getByText("Mama Ricci's kitchen")).toBeVisible();
  await expect(page.getByText("pizzaPocket")).not.toBeVisible();
});
