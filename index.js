const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Task = require("./models/tasks");
const SubTask = require("./models/subTasks");
const User = require("./models/user");

const server = express();
server.use(express.json());

// MongoDB connection
mongoose
  .connect("mongodb://0.0.0.0:27017/taskManagerDB")
  .then(() => {
    console.log("Connection Successful");
  })
  .catch((err) => {
    console.log("Connection Failed", err.message);
  });

// Middleware for JWT authentication
const authenticateJWT = (req, res, next) => {
  const token = req.headers["authorization"];
  const tokenWhole = token.split(" ");
  const mainToken = tokenWhole[1];
  req.token = mainToken;
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  jwt.verify(mainToken, "qwertyuiopasdfghjklzxcvbnm", (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: "Forbidden" });
    }
    req.user = decoded;
    next();
  });
};

// User signup endpoint
server.post("/openinapp/signup", async (req, res) => {
  try {
    const { name, password } = req.body;
    // Check if user already exists
    const existingUser = await User.findOne({ name });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }
    // Create new user
    const newUser = new User({ name, password });
    await newUser.save();

    res.json({ newUser });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// User login endpoint with JWT token verification
server.post("/openinapp/login", async (req, res) => {
  try {
    const { name, password } = req.body;
    // Find user in database
    const user = await User.findOne({ name, password });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    // Generate JWT token
    const token = jwt.sign({ userId: user._id }, "qwertyuiopasdfghjklzxcvbnm", {
      expiresIn: "24h",
    });
    res.json({ token, user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

server.use(authenticateJWT);

// 1. Create Task API
server.post("/openinapp/tasks", authenticateJWT, async (req, res) => {
  try {
    jwt.verify(req.token, "qwertyuiopasdfghjklzxcvbnm", (err, data) => {});
    const { title, description, due_date } = req.body;
    const user_id = req.user.userId;
    const task = new Task({ title, description, due_date, user_id });
    await task.save();
    res.json({ task });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 2. Create Sub Task API
server.post(
  "/openinapp/tasks/:task_id/subtasks",
  authenticateJWT,
  async (req, res) => {
    try {
      jwt.verify(req.token, "qwertyuiopasdfghjklzxcvbnm", (err, data) => {});
      const { task_id } = req.params;
      const { status } = req.body;
      const user_id = req.user.userId;
      const subtask = new SubTask({ task_id, user_id, status });
      await subtask.save();
      res.json(subtask);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// 3. Get All User Tasks API
server.get("/openinapp/tasks", authenticateJWT, async (req, res) => {
  try {
    jwt.verify(req.token, "qwertyuiopasdfghjklzxcvbnm", (err, data) => {});
    console.log("query", req.query);
    let { priority, due_date, page, limit } = req.query;
    page = parseInt(page) || 1;
    limit = parseInt(limit) || 10;
    let query = {};
    if (priority) {
      query.priority = priority;
    }
    if (due_date) {
      query.due_date = due_date;
    }
    const tasks = await Task.find({
      user_id: req.user.userId,
      deleted_at: null,
    })
      .sort({ due_date: "asc" })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json(tasks);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 4. Get All User Subtasks API
server.get("/openinapp/subtasks", authenticateJWT, async (req, res) => {
  try {
    jwt.verify(req.token, "qwertyuiopasdfghjklzxcvbnm", (err, data) => {});
    let { task_id } = req.query;
    let query = { user_id: req.user.userId, deleted_at: null };
    if (task_id) {
      query.task_id = task_id;
    }
    const subtasks = await SubTask.find(query);
    res.json(subtasks);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 5. Update Task API
server.patch("/openinapp/tasks/:task_id", authenticateJWT, async (req, res) => {
  try {
    jwt.verify(req.token, "qwertyuiopasdfghjklzxcvbnm", (err, data) => {});
    const { task_id } = req.params;
    let task = await Task.findById(task_id);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }
    const { due_date, status } = req.body;
    if (due_date !== undefined) {
      task.due_date = due_date;
      task.updated_at = Date.now();
    }
    if (status !== undefined) {
      task.status = status;
      task.updated_at = Date.now();
    }
    await task.save();
    res.json(task);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 6. Update Subtask API
server.patch(
  "/openinapp/subtasks/:subtask_id",
  authenticateJWT,
  async (req, res) => {
    try {
      jwt.verify(req.token, "qwertyuiopasdfghjklzxcvbnm", (err, data) => {});
      const { subtask_id } = req.params;
      const subtaskId = subtask_id.split("=")[1];
      let subtask = await SubTask.findById({ _id: subtaskId });
      if (!subtask) {
        return res.status(404).json({ message: "Subtask not found" });
      }
      const { status } = req.body;
      if (status !== undefined) {
        subtask.status = status;
        subtask.updated_at = Date.now();
      }
      await subtask.save();
      res.json(subtask);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// 7. Delete Task API
server.delete(
  "/openinapp/tasks/:task_id",
  authenticateJWT,
  async (req, res) => {
    try {
      jwt.verify(req.token, "qwertyuiopasdfghjklzxcvbnm", (err, data) => {});
      const { task_id } = req.params;
      let task = await Task.findById(task_id);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      task.deleted_at = Date.now();
      await task.save();
      res.json({ message: "Task deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// 8. Delete Sub Task API
server.delete(
  "/openinapp/subtasks/:subtask_id",
  authenticateJWT,
  async (req, res) => {
    try {
      jwt.verify(req.token, "qwertyuiopasdfghjklzxcvbnm", (err, data) => {});
      const { subtask_id } = req.params;
      const subtaskId = subtask_id.split("=")[1];
      let subtask = await SubTask.findById({ _id: subtaskId });
      if (!subtask) {
        return res.status(404).json({ message: "Subtask not found" });
      }
      subtask.deleted_at = Date.now();
      await subtask.save();
      res.json({ message: "Subtask deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
