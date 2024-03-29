const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const cron = require("node-cron");
const twilio = require("twilio");
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

// Getting difference between today date and due date
function getDaysDifference(startDate, endDate) {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const difference = end - start;
  const daysDifference = Math.ceil(difference / (1000 * 60 * 60 * 24));
  return daysDifference;
}

// To get today date in yyyy-mm-dd format
function getStartDate() {
  const miliSec = Date.now();
  const currDate = new Date(miliSec);
  const startDay = `${currDate.getFullYear()}-${
    currDate.getMonth() + 1
  }-${currDate.getDate()}`;
  return startDay;
}

// To get priority of a task
function getPriority(days) {
  if (days <= 0) {
    return 0;
  } else if (days == 1 || days == 2) {
    return 1;
  } else if (days == 3 || days == 4) {
    return 2;
  } else {
    return 3;
  }
}

// Changing status
async function changeStatus(task_id) {
  try {
    const subtasks = await SubTask.find({
      task_id,
      deleted_at: null,
    }).countDocuments();
    const subtasks0 = await SubTask.find({
      task_id,
      status: 0,
      deleted_at: null,
    }).countDocuments();
    const subtasks1 = await SubTask.find({
      task_id,
      status: 1,
      deleted_at: null,
    }).countDocuments();
    if (subtasks == subtasks1) {
      const task = await Task.findById(task_id);
      task.status = "DONE";
      await task.save();
    } else if (subtasks - subtasks0 > 0) {
      const task = await Task.findById(task_id);
      task.status = "IN_PROGRESS";
      await task.save();
    } else {
      const task = await Task.findById(task_id);
      task.status = "TODO";
      await task.save();
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// Deleting all associated subtasks on associated task deletion
async function deleteSubTasks(task_id) {
  try {
    const deletedTasks = await SubTask.updateMany(
      { task_id },
      { $set: { deleted_at: Date.now() } }
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

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

// Function for twilio calling
async function performVoiceCalling() {
  try {
    const overdueTasks = await Task.find({
      due_date: { $lt: new Date() },
      status: { $ne: "DONE" },
      deleted_at: null,
    }).populate("user_id");
    overdueTasks.sort((a, b) => a.user_id.priority - b.user_id.priority);
    const twilioClient = twilio(
      process.env.ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    const calledUsers = [];
    for (const task of overdueTasks) {
      const userPhoneNumber = task.user_id.phone_number;
      if (!calledUsers.includes(userPhoneNumber)) {
        await twilioClient.calls.create({
          to: userPhoneNumber,
          from: process.env.TWILIO_PHONE_NUMBER,
          url: process.env.URL,
        });
        console.log(`Voice call made to ${userPhoneNumber}`);
        calledUsers.push(userPhoneNumber);
      } else {
        console.log(`User ${userPhoneNumber} has already been called`);
      }
    }
  } catch (error) {
    console.error("Error performing voice calling:", error);
  }
}

// Cron job for priority
cron.schedule("0 10 * * *", async () => {
  try {
    const tasks = await Task.find({ deleted_at: null });
    tasks.forEach(async (task) => {
      const startDate = getStartDate();
      const diffDays = getDaysDifference(startDate, task.due_date);
      const priority = getPriority(diffDays - 1);
      task.priority = priority;
      await task.save();
    });
    console.log("Priority of tasks updated successfully!");
  } catch (error) {
    console.error("Error updating priority of tasks:", error);
  }
});

// Cron job for calling users
cron.schedule("0 11 * * *", async () => {
  await performVoiceCalling();
});

// User signup endpoint
server.post("/openinapp/signup", async (req, res) => {
  try {
    const { name, password, phone_number } = req.body;
    // Check if user already exists
    const existingUser = await User.findOne({ name });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }
    // Create new user
    const newUser = new User({ name, password, phone_number });
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
    const startDate = getStartDate();
    const diffDays = getDaysDifference(startDate, due_date);
    const priority = getPriority(diffDays - 1);
    const task = new Task({ title, description, due_date, user_id, priority });
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
      changeStatus(task_id);
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
      const startDate = getStartDate();
      const diffDays = getDaysDifference(startDate, due_date);
      const priority = getPriority(diffDays - 1);
      task.priority = priority;
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
      let subtask = await SubTask.findById({ _id: subtask_id });
      if (!subtask) {
        return res.status(404).json({ message: "Subtask not found" });
      }
      const { status } = req.body;
      if (status !== undefined) {
        subtask.status = status;
        subtask.updated_at = Date.now();
        await subtask.save();
        changeStatus(subtask.task_id);
        res.json(subtask);
      }
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
      let task = await Task.findOne({ _id: task_id, deleted_at: null });
      if (!task || task.deleted_at !== null) {
        return res.status(404).json({ message: "Task not found" });
      }
      task.deleted_at = Date.now();
      deleteSubTasks(task_id);
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
      let subtask = await SubTask.findById({ _id: subtask_id });
      if (!subtask || subtask.deleted_at !== null) {
        return res.status(404).json({ message: "Subtask not found" });
      }
      changeStatus(subtask.task_id);
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
