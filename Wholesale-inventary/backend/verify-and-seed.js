const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');

dotenv.config();

async function run() {
  console.log('Connecting to MongoDB at:', process.env.MONGO_URI);
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected successfully!');

    // Check if an admin user already exists
    const adminUser = await User.findOne({ role: 'admin' });
    const defaultUsername = 'admin';
    const defaultPassword = 'adminpassword123';

    if (adminUser) {
      console.log(`Found existing admin user: "${adminUser.username}".`);
      console.log('Updating password for this admin to ensure you can login...');
      
      // Let's reset the password of the existing admin so the user knows it
      adminUser.password = defaultPassword;
      await adminUser.save();
      console.log(`Admin user "${adminUser.username}" updated with password: "${defaultPassword}"`);
    } else {
      console.log('No admin user found. Creating a new admin user...');
      const newAdmin = new User({
        username: defaultUsername,
        password: defaultPassword,
        role: 'admin'
      });
      await newAdmin.save();
      console.log(`New admin user created!`);
      console.log(`Username: ${defaultUsername}`);
      console.log(`Password: ${defaultPassword}`);
    }

    // List all users in the database
    const allUsers = await User.find({}, 'username role');
    console.log('\nCurrent Database Users:');
    allUsers.forEach(u => {
      console.log(`- Username: ${u.username}, Role: ${u.role}`);
    });

  } catch (err) {
    console.error('Database connection or seeding error:', err);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed.');
  }
}

run();
