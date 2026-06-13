const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const mongoURI = process.env.MONGO_URI || process.env.DB_URL;
console.log('Testing connection to:', mongoURI ? mongoURI.replace(/:[^:@]{1,}@/, ':****@') : 'undefined');

mongoose.connect(mongoURI, {
  serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
  socketTimeoutMS: 5000,
}).then(() => {
  console.log('SUCCESSFUL CONNECTION!');
  process.exit(0);
}).catch(err => {
  console.error('FAILED TO CONNECT:', err.message);
  process.exit(1);
});
