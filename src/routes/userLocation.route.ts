import { Router } from 'express';
import {
  saveFieldTrips,
  getFieldTrips,
  getUserFieldTrips,
  getUserFieldTripsByUsername,
  getUserFieldTripsByEmployeeNumber,
  checkAndDeactivateExpiredFieldTrips,
  processFieldTripAttendance,
  deleteFieldTrip,
  getAllActiveFieldTrips,
  updateFieldTrip
} from '../controllers/userLocation.controller.js';
import { flexibleAuth } from '../middleware/auth.js';

const router = Router();

router.put('/field-trips', flexibleAuth, saveFieldTrips);
router.get('/field-trips/:employeeNumber', flexibleAuth, getFieldTrips);
router.get('/user-field-trips/:employeeNumber', flexibleAuth, getUserFieldTrips);
router.get('/user-field-trips/username/:username', flexibleAuth, getUserFieldTripsByUsername);
router.get('/user-field-trips/employee/:employeeNumber', flexibleAuth, getUserFieldTripsByEmployeeNumber);
router.delete('/field-trip/:fieldTripKey', flexibleAuth, deleteFieldTrip);
router.patch('/field-trip/:fieldTripKey', flexibleAuth, updateFieldTrip);
router.get('/field-trips', flexibleAuth, getAllActiveFieldTrips);
router.post('/field-trips/check-expired', flexibleAuth, checkAndDeactivateExpiredFieldTrips);
router.post('/field-trips/process-attendance', flexibleAuth, processFieldTripAttendance);

export default router;