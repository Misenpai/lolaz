import { Router } from 'express';
import { 
  getUserProfileByEmployeeNumber, 
  updateUserProfile
} from '../controllers/profile.controller.js';
import { flexibleAuth } from '../middleware/auth.js';

const router = Router();

router.get('/profile/:employeeNumber', flexibleAuth, getUserProfileByEmployeeNumber);
router.put('/profile/:employeeNumber', flexibleAuth, updateUserProfile);

export default router;