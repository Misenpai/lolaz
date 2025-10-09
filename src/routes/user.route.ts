import { Router } from 'express';
import { loginUser, getUserById } from '../controllers/user.controller.js';
import { flexibleAuth } from '../middleware/auth.js';

const router = Router();

router.post('/login', loginUser);
router.get('/user/:employeeNumber', flexibleAuth, getUserById);

export default router;