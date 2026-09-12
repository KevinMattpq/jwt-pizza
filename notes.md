# Learning notes

## JWT Pizza code study and debugging

As part of `Deliverable ⓵ Development deployment: JWT Pizza`, start up the application and debug through the code until you understand how it works. During the learning process fill out the following required pieces of information in order to demonstrate that you have successfully completed the deliverable.

| User activity                                       | Frontend component | Backend endpoints | Database SQL |
| --------------------------------------------------- | ------------------ | ----------------- | ------------ |
| View home page                                      |home.tsx            |none               |none          |
| Register new user<br/>(t@jwt.com, pw: test)         |register.tsx        |[POST] /api/auth   |`INSERT INTO user (name, email, password) VALUES (?, ?, ?)` <br/>`INSERT INTO userRole (userId, role, objectId) VALUES (?, ?, ?)`|
| Login new user<br/>(t@jwt.com, pw: test)            |login.tsx           |[PUT] /api/auth    |`SELECT * FROM user WHERE email=?` <br> `SELECT * FROM userRole WHERE userId=?`|
| Order pizza                                         |menu.tsx/payment.tsx|[POST] /api/order|`INSERT INTO dinerOrder (dinerId, franchiseId, storeId, date) VALUES (?, ?, ?, now())` <br> `INSERT INTO orderItem (orderId, menuId, description, price) VALUES (?, ?, ?, ?)`|
| Verify pizza                                        |delivery.tsx        |[POST]https://pizza-factory.cs329.click/api/order/verify|none |none|
| View profile page                                   |dinnerDashboard.tsx |[GET] /api/user/me |`SELECT userId FROM auth WHERE token=?`|
| View franchise<br/>(as diner)                       |franchiseDashboard.tsx|[GET] api/franchise/4|`SELECT objectId FROM userRole WHERE role='franchisee' AND userId=?` <br> `SELECT id, name FROM franchise WHERE id in (${franchiseIds.join(',')})`|
| Logout                                              |logout.tsx          |[DELETE] /api/auth |`DELETE FROM auth WHERE token=?`|
| View About page                                     |about.tsx           |none               |none          |
| View History page                                   |history.tsx         |none               |none          |
| Login as franchisee<br/>(f@jwt.com, pw: franchisee) |login.tsx           |[PUT] /api/auth    |              |
| View franchise<br/>(as franchisee)                  |franchiseDashboard.tsx|[GET] /api/franchise/:userId |  |
| Create a store                                      |createStore.tsx     |[POST] /api/franchise/:franchiseId/store|  |
| Close a store                                       |closeStore.tsx      |[DELETE] /api/franchise/:franchiseId/store/:storeId||
| Login as admin<br/>(a@jwt.com, pw: admin)           |login.tsx           |[PUT] /api/auth    |              |
| View Admin page                                     |adminDashboard.tsx  |none               |none          |
| Create a franchise for t@jwt.com                    |createFranchise.tsx |[POST] /api/franchise/:franchiseId/store|  |
| Close the franchise for t@jwt.com                   |closeFranchise.tsx  |[DELETE] /api/franchise/:franchiseId|      |
