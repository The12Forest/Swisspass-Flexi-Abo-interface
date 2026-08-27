import express from "express"
import fs from 'fs';
import path from "path";
import { fileURLToPath } from 'url';
import log from '../../functions/log.js';
const console = { log: log('AdminRouter') };
const router = express.Router()
const passwd = process.env.passwd || "123ict"

router.get("/check/:passwd", async (req, res) => {
    if (req.params.passwd == passwd) {
        res.status(200).json({ "Okay": true, "Reason": "Password Correct!" })
    } else {
        res.status(401).json({ "Okay": false, "Reason": "Password Wrong!" })
    }
})


export { router }
