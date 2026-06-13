const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// Register (open registration - anyone can create an account)
router.post('/register', async (req, res) => {
  const { username, password, role } = req.body;
  try {
    const user = new User({ username, password, role: role || 'staff' });
    await user.save();
    res.status(201).json({ message: 'User created' });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'This username is already taken. Please try a different one!' });
    }
    res.status(400).json({ message: err.message });
  }
});

// Setup status - always allow registration
router.get('/setup', async (req, res) => {
  try {
    res.json({ allowRegister: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, role: user.role });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get all users (Admin only)
router.get('/users', auth('admin'), async (req, res) => {
  try {
    const users = await User.find({}, 'username role');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete a user (Admin only)
router.delete('/users/:id', auth('admin'), async (req, res) => {
  try {
    if (req.user.id === req.params.id) {
      return res.status(400).json({ message: 'You cannot delete your own admin account!' });
    }
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
