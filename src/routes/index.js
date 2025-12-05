const express = require("express");

const router = express.Router();

router.get("/", (req, res) => {
    res.send({ message: "Hello from TRASER" });
});

router.get("/favicon.ico", function (req, res) {
    res.sendStatus(204);
});

router.get("/status", (req, res) => {
    return res.status(200).json({
        message: "ok",
    });
});

module.exports = router;
