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
      if (validUsers[registerReq.email]) {
        await route.fulfill({ status: 409, json: { message: "email already registered" } });
        return;
      }
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
    const params = new URL(route.request().url()).searchParams;
    const nameFilter = (params.get("name") ?? "*").replace(/\*/g, "").toLowerCase();
    const matching = franchises.filter((f) => f.name.toLowerCase().includes(nameFilter));
    // Pretend there is always a second page after page 0
    const more = params.get("page") === "0";
    await route.fulfill({ json: { franchises: matching, more } });
  });

  const orders: any[] = [
    {
      id: 1,
      franchiseId: 2,
      storeId: 4,
      date: "2024-06-05T05:14:40.000Z",
      items: [
        { id: 1, menuId: 1, description: "Veggie", price: 0.05 },
        { id: 2, menuId: 2, description: "Pepperoni", price: 0.0042 },
      ],
    },
  ];

  await page.route("*/**/api/order", async (route) => {
    // Order history
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { dinerId: loggedInUser?.id, orders, page: 1 } });
      return;
    }

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

  await page.route(/\/api\/franchise\/\d+\/store\/\d+$/, async (route) => {
    // Close store
    expect(route.request().method()).toBe("DELETE");
    const storeId = Number(route.request().url().split("/").pop());
    myFranchise.stores = myFranchise.stores.filter((s) => s.id !== storeId);
    await route.fulfill({ json: { message: "store deleted" } });
  });

  // API docs (service and factory)
  await page.route("*/**/api/docs", async (route) => {
    expect(route.request().method()).toBe("GET");
    await route.fulfill({
      json: {
        endpoints: [
          {
            method: "GET",
            path: "/api/order/menu",
            requiresAuth: false,
            description: "Get the pizza menu",
            example: "curl localhost:3000/api/order/menu",
            response: [{ id: 1, title: "Veggie" }],
          },
          {
            method: "POST",
            path: "/api/order",
            requiresAuth: true,
            description: "Create an order",
            example: "curl -X POST localhost:3000/api/order",
            response: { order: { id: 1 }, jwt: "1111111111" },
          },
        ],
      },
    });
  });

  // Pizza factory JWT verification
  await page.route("*/**/api/order/verify", async (route) => {
    expect(route.request().method()).toBe("POST");
    const { jwt } = route.request().postDataJSON();
    if (jwt !== "eyJpYXQ") {
      await route.fulfill({ status: 401, json: { message: "invalid" } });
      return;
    }
    await route.fulfill({ json: { message: "valid", payload: { vendor: { id: "kp" }, order: { id: 23 } } } });
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

  await expect(page.getByRole("link", { name: "MP" })).toBeVisible();
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
  await page.getByRole("link", { name: "Login" }).click();
  await page.getByRole("textbox", { name: "Email address" }).fill("f@jwt.com");
  await page.getByRole("textbox", { name: "Password" }).fill("a");
  await page.getByRole("button", { name: "Login" }).click();

  await page
    .getByRole("navigation", { name: "Global" })
    .getByRole("link", { name: "Franchise" })
    .click();
  await expect(page.getByText("LotaPizza")).toBeVisible();

  await page.getByRole("button", { name: "Create store" }).click();
  await page.getByRole("textbox", { name: "store name" }).fill("Orem");
  await page.getByRole("button", { name: "Create" }).click();

  await expect(page.getByRole("cell", { name: "Orem" })).toBeVisible();

  // Close the store
  await page.getByRole("row").filter({ hasText: "Orem" }).getByRole("button", { name: "Close" }).click();
  await expect(page.getByText("Sorry to see you go")).toBeVisible();
  await expect(page.getByText("Orem")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  await expect(page.getByRole("cell", { name: "Lehi" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Orem" })).not.toBeVisible();
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

//About page
test("About page", async ({ page }) => {
  await basicInit(page);

  await page.getByRole("contentinfo").getByRole("link", { name: "About" }).click();

  await expect(page.getByRole("heading", { name: "The secret sauce" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Our employees" })).toBeVisible();
});

//Diner dashboard
test("Diner dashboard", async ({ page }) => {
  await basicInit(page);

  await page.getByRole("link", { name: "Login" }).click();
  await page.getByRole("textbox", { name: "Email address" }).fill("d@jwt.com");
  await page.getByRole("textbox", { name: "Password" }).fill("a");
  await page.getByRole("button", { name: "Login" }).click();

  // The user's initials link to the diner dashboard
  await page.getByRole("link", { name: "KC" }).click();

  await expect(page.getByText("Your pizza kitchen")).toBeVisible();
  await expect(page.getByText("Kai Chen")).toBeVisible();
  await expect(page.getByText("d@jwt.com")).toBeVisible();
  await expect(page.getByText("diner", { exact: true })).toBeVisible();

  // Order history from the fake backend
  await expect(page.getByText("Here is your history of all the good times.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "0.054 ₿" })).toBeVisible();
});

async function login(page: Page, email: string, password: string) {
  await page.getByRole("link", { name: "Login" }).click();
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Login" }).click();
}

test("Login with wrong password shows an error", async ({ page }) => {
  await basicInit(page);
  await login(page, "d@jwt.com", "wrong");

  await expect(page.getByText('{"code":401')).toBeVisible();
  await expect(page.getByRole("link", { name: "KC" })).not.toBeVisible();
});

test("Register page links to login", async ({ page }) => {
  await basicInit(page);
  await page.getByRole("link", { name: "Register" }).click();
  await page.getByText("Login", { exact: true }).last().click();

  await expect(page.getByText("Welcome back")).toBeVisible();
});

test("Register with an existing email shows an error", async ({ page }) => {
  await basicInit(page);
  await page.getByRole("link", { name: "Register" }).click();
  await page.getByRole("textbox", { name: "Full name" }).fill("Kai Chen");
  await page.getByRole("textbox", { name: "Email address" }).fill("d@jwt.com");
  await page.getByRole("textbox", { name: "Password" }).fill("a");
  await page.getByRole("button", { name: "Register" }).click();

  await expect(page.getByText("email already registered")).toBeVisible();
});

test("Expired token logs the user out", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("token", "expired"));
  await basicInit(page);
  // Replace basicInit's /api/user/me fake with one that rejects the token
  await page.unroute("*/**/api/user/me");
  await page.route("*/**/api/user/me", async (route) => {
    await route.fulfill({ status: 401, json: { message: "unauthorized" } });
  });
  await page.reload();

  await expect(page.getByRole("link", { name: "Login" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("token"))).toBeNull();
});

test("History page", async ({ page }) => {
  await basicInit(page);
  await page.getByRole("contentinfo").getByRole("link", { name: "History" }).click();

  await expect(page.getByRole("heading", { name: "Mama Rucci, my my" })).toBeVisible();
});

test("Not found page", async ({ page }) => {
  await basicInit(page);
  await page.goto("/no-such-page");

  await expect(page.getByRole("heading", { name: "Oops" })).toBeVisible();
});

test("Service docs", async ({ page }) => {
  await basicInit(page);
  await page.goto("/docs");

  await expect(page.getByRole("heading", { name: "JWT Pizza API" })).toBeVisible();
  await expect(page.getByText("[GET] /api/order/menu")).toBeVisible();
  await expect(page.getByText("[POST] /api/order")).toBeVisible();
});

test("Factory docs", async ({ page }) => {
  await basicInit(page);
  await page.goto("/docs/factory");

  await expect(page.getByText("[GET] /api/order/menu")).toBeVisible();
});

async function orderOnePizza(page: Page) {
  await page.getByRole("button", { name: "Order now" }).click();
  await page.getByRole("combobox").selectOption("4");
  const veggie = page.getByRole("button").filter({ hasText: "Veggie" });
  await veggie.click();
  // Wait for the wobble animation to finish
  await expect(veggie).not.toHaveClass(/animate-wobble/);
  await page.getByRole("button", { name: "Checkout" }).click();
}

test("Payment cancel and failure", async ({ page }) => {
  await basicInit(page);
  await login(page, "d@jwt.com", "a");
  await expect(page.getByRole("link", { name: "KC" })).toBeVisible();

  await orderOnePizza(page);
  await expect(page.getByText("Send me that pizza right now!")).toBeVisible();

  // Cancel goes back to the menu with the order kept
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Selected pizzas: 1")).toBeVisible();

  // Simulate a network failure when paying
  await page.getByRole("button", { name: "Checkout" }).click();
  await page.route("*/**/api/order", (route) => route.abort());
  await page.getByRole("button", { name: "Pay now" }).click();

  await expect(page.getByText("⚠️")).toBeVisible();
});

test("Delivery verify", async ({ page }) => {
  await basicInit(page);
  await login(page, "d@jwt.com", "a");
  await expect(page.getByRole("link", { name: "KC" })).toBeVisible();

  await orderOnePizza(page);
  await page.getByRole("button", { name: "Pay now" }).click();
  await expect(page.getByText("Here is your JWT Pizza!")).toBeVisible();

  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.locator("#hs-jwt-modal h3")).toContainText("valid");
  await expect(page.locator("#hs-jwt-modal pre")).toContainText("kp");
});

test("Delivery order more and verify with a bad JWT", async ({ page }) => {
  await basicInit(page);
  await page.goto("/delivery");

  await page.getByRole("button", { name: "Order more" }).click();
  await expect(page.getByText("Awesome is a click away")).toBeVisible();

  await page.goto("/delivery");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.locator("#hs-jwt-modal pre")).toContainText("bad pizza");
});

test("Franchisee diner dashboard shows franchise role", async ({ page }) => {
  await basicInit(page);
  await login(page, "f@jwt.com", "a");
  await page.getByRole("link", { name: "pf" }).click();

  await expect(page.getByText("Franchisee on 2")).toBeVisible();
});

test("Admin closes a store, filters and pages franchises", async ({ page }) => {
  await basicInit(page);
  await login(page, "a@jwt.com", "admin");
  await page.getByRole("link", { name: "Admin" }).click();

  // Paging
  await page.getByRole("button", { name: "»" }).click();
  await expect(page.getByRole("button", { name: "«" })).toBeEnabled();
  await page.getByRole("button", { name: "«" }).click();
  await expect(page.getByRole("button", { name: "«" })).toBeDisabled();

  // Filter
  await page.getByPlaceholder("Filter franchises").fill("pizza");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("PizzaCorp")).toBeVisible();
  await expect(page.getByText("topSpot")).not.toBeVisible();

  // Close a store
  await page.getByRole("row").filter({ hasText: "Spanish Fork" }).getByRole("button", { name: "Close" }).click();
  await expect(page.getByText("Sorry to see you go")).toBeVisible();
  await expect(page.getByText("Spanish Fork")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  await expect(page.getByRole("heading", { name: "Mama Ricci's kitchen" })).toBeVisible();
});
