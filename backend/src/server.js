
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

// Home route
app.get("/", (req, res) => {
    res.json({
        message: "Welcome to Planet X - SPHEREx Sky Explorer!",
        status: "Server is running successfully"
    });
});

// Health check
app.get("/api/health", (req, res) => {
    res.json({
        status: "OK",
        project: "Planet X"
    });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Planet X server running at http://localhost:${PORT}`);
});
