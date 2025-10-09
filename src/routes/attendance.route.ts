import { Router } from 'express';
import { 
  createAttendance,
  checkoutAttendance,
  getTodayAttendance,
  getUserAttendanceCalendar,
} from '../controllers/attendance.controller.js';
import { upload } from '../utils/fileUpload.js';
import { flexibleAuth } from '../middleware/auth.js';

const router = Router();

router.post('/attendance', flexibleAuth, upload.any(), createAttendance);
router.post('/attendance/checkout', flexibleAuth, checkoutAttendance);
router.get('/attendance/today/:employeeNumber', flexibleAuth, getTodayAttendance);
router.get('/attendance/calendar/:employeeNumber', flexibleAuth, getUserAttendanceCalendar);

export default router;