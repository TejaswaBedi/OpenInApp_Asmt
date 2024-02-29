// models/task.js
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  password: { type: String, required: true },
  phone_number: { type: Number, required: true },
  priority: {
    type: Number,
    enum: [0, 1, 2],
    default: 0,
  },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  deleted_at: { type: Date, default: null },
});

module.exports = mongoose.model("User", userSchema);
