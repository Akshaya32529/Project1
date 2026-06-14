const adminCredentials = {
  username: 'admin',
  password: 'adminpassword123'
};

async function run() {
  try {
    console.log('Logging in as admin...');
    const loginRes = await fetch('https://project1-6-y1bz.onrender.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(adminCredentials)
    });

    if (!loginRes.ok) {
      throw new Error(`Login failed: ${await loginRes.text()}`);
    }

    const { token } = await loginRes.json();
    console.log('Login successful.');

    console.log('Fetching users list...');
    const usersRes = await fetch('https://project1-6-y1bz.onrender.com/api/auth/users', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!usersRes.ok) {
      throw new Error(`Failed to list users: ${await usersRes.text()}`);
    }

    const users = await usersRes.json();
    console.log('Users found:', users);

    // Find a staff member
    const staffUser = users.find(u => u.role === 'staff');
    if (!staffUser) {
      console.log('No staff member found in DB to delete. Creating one first...');
      const createRes = await fetch('https://project1-6-y1bz.onrender.com/api/auth/register', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          username: 'temp_staff_' + Math.floor(Math.random() * 100),
          password: 'password123',
          role: 'staff'
        })
      });
      if (!createRes.ok) {
        throw new Error(`Failed to create temp staff: ${await createRes.text()}`);
      }
      console.log('Temp staff created.');
      // Re-fetch users
      const reFetch = await fetch('https://project1-6-y1bz.onrender.com/api/auth/users', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const updatedUsers = await reFetch.json();
      const newStaff = updatedUsers.find(u => u.username.startsWith('temp_staff_'));
      await attemptDelete(newStaff._id, token);
    } else {
      await attemptDelete(staffUser._id, token);
    }

  } catch (err) {
    console.error('Test script failed:', err.message);
  }
}

async function attemptDelete(userId, token) {
  console.log(`Attempting to delete user with ID: ${userId}...`);
  const deleteRes = await fetch(`https://project1-6-y1bz.onrender.com/api/auth/users/${userId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  console.log(`Delete response status: ${deleteRes.status}`);
  const text = await deleteRes.text();
  console.log(`Delete response body:`, text);
}

run();
