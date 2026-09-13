// scripts/test_e2e_auth.mjs

const BASE_URL = 'http://localhost:3000';

async function runE2ETests() {
  console.log('==================================================');
  console.log('   ARB BEARINGS AUTHENTICATION E2E TEST SUITE     ');
  console.log('==================================================\n');

  let adminCookie = '';
  let testUserId = '';
  let testUserCookie = '';

  // TEST 1: Check initial unauthenticated state
  console.log('[TEST 1] Checking /api/auth/me without cookies...');
  const res1 = await fetch(`${BASE_URL}/api/auth/me`);
  const data1 = await res1.json();
  if (res1.status === 401 && data1.authenticated === false) {
    console.log('✓ PASS: Correctly blocked unauthenticated request with 401.');
  } else {
    throw new Error(`TEST 1 Failed: Expected 401, got ${res1.status}: ${JSON.stringify(data1)}`);
  }

  // TEST 2: Test invalid login
  console.log('\n[TEST 2] Testing invalid credentials login attempt...');
  const res2 = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'arbbearings.marketing@gmail.com', password: 'wrongpassword' })
  });
  const data2 = await res2.json();
  if (res2.status === 401 && data2.success === false) {
    console.log('✓ PASS: Invalid login correctly rejected with error: "' + data2.error + '"');
  } else {
    throw new Error(`TEST 2 Failed: Expected 401, got ${res2.status}: ${JSON.stringify(data2)}`);
  }

  // TEST 3: Login with default admin credentials
  console.log('\n[TEST 3] Logging in with primary admin (arbbearings.marketing@gmail.com : 12345678)...');
  const res3 = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'arbbearings.marketing@gmail.com', password: '12345678' })
  });
  const data3 = await res3.json();
  const setCookieHeader = res3.headers.get('set-cookie');
  if (res3.status === 200 && data3.success === true && data3.user.email === 'arbbearings.marketing@gmail.com' && data3.user.role === 'Admin') {
    adminCookie = setCookieHeader ? setCookieHeader.split(';')[0] : '';
    console.log('✓ PASS: Admin login successful! User:', data3.user.email, '| Role:', data3.user.role);
    console.log('  Cookie set:', adminCookie ? 'arb_auth_token is present' : 'none');
  } else {
    throw new Error(`TEST 3 Failed: ${JSON.stringify(data3)}`);
  }

  // TEST 4: Verify authenticated session with cookie
  console.log('\n[TEST 4] Verifying active session via /api/auth/me with cookie...');
  const res4 = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Cookie: adminCookie }
  });
  const data4 = await res4.json();
  if (res4.status === 200 && data4.authenticated === true && data4.user.email === 'arbbearings.marketing@gmail.com') {
    console.log('✓ PASS: Session verified! Authenticated user:', data4.user.email, '| ID:', data4.user.id);
  } else {
    throw new Error(`TEST 4 Failed: ${JSON.stringify(data4)}`);
  }

  // TEST 5: Fetch list of users (Admin only)
  console.log('\n[TEST 5] Fetching user accounts list via /api/users...');
  const res5 = await fetch(`${BASE_URL}/api/users`, {
    headers: { Cookie: adminCookie }
  });
  const data5 = await res5.json();
  if (res5.status === 200 && data5.success && Array.isArray(data5.users)) {
    console.log(`✓ PASS: Found ${data5.users.length} account(s):`, data5.users.map(u => `${u.email} (${u.role})`).join(', '));
  } else {
    throw new Error(`TEST 5 Failed: ${JSON.stringify(data5)}`);
  }

  // TEST 6: Create a new user account (Planner)
  const testEmail = `planner.test.${Date.now()}@arbbearings.com`;
  console.log(`\n[TEST 6] Creating new user account: ${testEmail}...`);
  const res6 = await fetch(`${BASE_URL}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      email: testEmail,
      name: 'Test Planning Engineer',
      password: 'initialpass123',
      role: 'Production Planner'
    })
  });
  const data6 = await res6.json();
  if (res6.status === 201 && data6.success && data6.user.email === testEmail) {
    testUserId = data6.user.id;
    console.log('✓ PASS: User created successfully! ID:', testUserId, '| Role:', data6.user.role);
  } else {
    throw new Error(`TEST 6 Failed: ${JSON.stringify(data6)}`);
  }

  // TEST 7: Reset / Manage user password (Admin action)
  console.log(`\n[TEST 7] Admin resetting password for ${testEmail} to "updatedpass456"...`);
  const res7 = await fetch(`${BASE_URL}/api/users/${testUserId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ resetPassword: 'updatedpass456' })
  });
  const data7 = await res7.json();
  if (res7.status === 200 && data7.success) {
    console.log('✓ PASS: Admin successfully updated user password.');
  } else {
    throw new Error(`TEST 7 Failed: ${JSON.stringify(data7)}`);
  }

  // TEST 8: Log in with the newly created user and their updated password
  console.log(`\n[TEST 8] Logging in with new user (${testEmail} : updatedpass456)...`);
  const res8 = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: 'updatedpass456' })
  });
  const data8 = await res8.json();
  const testSetCookie = res8.headers.get('set-cookie');
  if (res8.status === 200 && data8.success && data8.user.email === testEmail && data8.user.role === 'Production Planner') {
    testUserCookie = testSetCookie ? testSetCookie.split(';')[0] : '';
    console.log('✓ PASS: New user logged in successfully! Role:', data8.user.role);
  } else {
    throw new Error(`TEST 8 Failed: ${JSON.stringify(data8)}`);
  }

  // TEST 9: Change own password using /api/auth/change-password
  console.log('\n[TEST 9] New user changing own password via /api/auth/change-password...');
  const res9 = await fetch(`${BASE_URL}/api/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: testUserCookie },
    body: JSON.stringify({ currentPassword: 'updatedpass456', newPassword: 'finalsecurepass999' })
  });
  const data9 = await res9.json();
  if (res9.status === 200 && data9.success) {
    console.log('✓ PASS: Self password change succeeded:', data9.message);
  } else {
    throw new Error(`TEST 9 Failed: ${JSON.stringify(data9)}`);
  }

  // TEST 10: Verify login with the changed password
  console.log('\n[TEST 10] Testing login with newly changed password (finalsecurepass999)...');
  const res10 = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: 'finalsecurepass999' })
  });
  const data10 = await res10.json();
  if (res10.status === 200 && data10.success) {
    console.log('✓ PASS: Successfully authenticated with changed password!');
  } else {
    throw new Error(`TEST 10 Failed: ${JSON.stringify(data10)}`);
  }

  // TEST 11: Cleanup test user (Admin deletes test user)
  console.log(`\n[TEST 11] Admin deleting test user ${testEmail}...`);
  const res11 = await fetch(`${BASE_URL}/api/users/${testUserId}`, {
    method: 'DELETE',
    headers: { Cookie: adminCookie }
  });
  const data11 = await res11.json();
  if (res11.status === 200 && data11.success) {
    console.log('✓ PASS: Test user cleanly removed from database.');
  } else {
    throw new Error(`TEST 11 Failed: ${JSON.stringify(data11)}`);
  }

  // TEST 12: Logout
  console.log('\n[TEST 12] Testing /api/auth/logout...');
  const res12 = await fetch(`${BASE_URL}/api/auth/logout`, {
    method: 'POST',
    headers: { Cookie: adminCookie }
  });
  const data12 = await res12.json();
  if (res12.status === 200 && data12.success) {
    console.log('✓ PASS: Logout succeeded.');
  } else {
    throw new Error(`TEST 12 Failed: ${JSON.stringify(data12)}`);
  }

  console.log('\n==================================================');
  console.log('  🎉 ALL 12 END-TO-END AUTH TESTS PASSED PERFECTLY! ');
  console.log('==================================================');
}

runE2ETests().catch(err => {
  console.error('\n❌ E2E TEST FAILED:', err.message);
  process.exit(1);
});
