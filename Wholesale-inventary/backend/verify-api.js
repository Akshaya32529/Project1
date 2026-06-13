const adminCredentials = {
  username: 'admin',
  password: 'adminpassword123'
};

const testUser = {
  username: 'api_test_user_' + Math.floor(Math.random() * 1000),
  password: 'password123',
  role: 'staff'
};

async function run() {
  try {
    console.log('Testing Admin Login using fetch...');
    
    const loginRes = await fetch('https://project1-1-1ie9.onrender.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(adminCredentials)
    });

    if (!loginRes.ok) {
      const text = await loginRes.text();
      throw new Error(`Login failed with status ${loginRes.status}: ${text}`);
    }

    const loginResponse = await loginRes.json();
    console.log('Login successful! Received response:', loginResponse);
    const token = loginResponse.token;

    console.log('\nTesting User Creation (via Admin token)...');
    console.log(`Creating user: "${testUser.username}" with role "${testUser.role}"...`);
    
    const registerRes = await fetch('https://project1-1-1ie9.onrender.com/api/auth/register', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(testUser)
    });

    if (!registerRes.ok) {
      const text = await registerRes.text();
      throw new Error(`Registration failed with status ${registerRes.status}: ${text}`);
    }

    const registerResponse = await registerRes.json();
    console.log('User creation successful! Response:', registerResponse);

    console.log('\nTesting User Listing...');
    const usersRes = await fetch('https://project1-1-1ie9.onrender.com/api/auth/users', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!usersRes.ok) {
      const text = await usersRes.text();
      throw new Error(`Listing users failed with status ${usersRes.status}: ${text}`);
    }

    const usersList = await usersRes.json();
    console.log('List of users successfully retrieved from DB:');
    usersList.forEach(u => {
      console.log(`- Username: ${u.username}, Role: ${u.role}`);
    });

    console.log('\nVerification complete! Database and Authentication flow are verified to be fully operational.');

  } catch (error) {
    console.error('API Verification failed:', error.message);
  }
}

run();
