import { Router } from "express";
import { 
    getPIUsersAttendance,
    getPiNotifications,
    submitDataToHR
} from "../controllers/pi.controller.js";
import { flexibleAuth } from "../middleware/auth.js";

const router = Router();

router.get("/pi/users-attendance", flexibleAuth, getPIUsersAttendance);
router.get("/pi/notifications", flexibleAuth, getPiNotifications);
router.post("/pi/submit-data", flexibleAuth, submitDataToHR);

export default router;