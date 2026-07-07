import { Router } from 'express';
import { Queue } from 'bullmq';
// import { IntakeRepository } from './intake.repo';
import { authGuard } from '@/middleware/authGuard';
import { roleGuard } from '@/middleware/roleGuard';
import prisma from '@/lib/prisma';
import { createIntakeControllers } from './intake.controller';

const router = Router();
// const emailQueue = new Queue('email');
// const repo = new IntakeRepository(prisma);
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