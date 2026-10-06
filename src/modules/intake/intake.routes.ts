import { Router } from 'express';
import { authGuard } from '@/middleware/authGuard';
import { roleGuard } from '@/middleware/roleGuard';
import prisma from '@/lib/prisma';
import { createIntakeControllers } from './intake.controller';

const router = Router();

const {
  registerApplicantController,
  listApplicantsController,
  getApplicantController,
  updateApplicantController,
  updateApplicantStatusController,
  deleteApplicantController,
  getStatsController,
} = createIntakeControllers(prisma);

router.post('/register', registerApplicantController);
router.get('/', authGuard, roleGuard('admin', 'superadmin'), listApplicantsController);
router.get('/:id', authGuard, roleGuard('admin', 'superadmin'), getApplicantController);
router.put('/:id', authGuard, roleGuard('admin', 'superadmin'), updateApplicantController);
router.patch('/:id/status', authGuard, roleGuard('admin', 'superadmin'), updateApplicantStatusController);
router.delete('/:id', authGuard, roleGuard('admin', 'superadmin'), deleteApplicantController);
router.get('/stats', authGuard, roleGuard('admin', 'superadmin'), getStatsController);

export default router;