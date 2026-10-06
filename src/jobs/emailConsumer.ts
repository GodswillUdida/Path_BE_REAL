// // src/jobs/emailConsumer.ts
// import { emailQueue } from '../queues/emailQueue';

// emailQueue.process('applicant-registration-confirmation', async (job) => {
//   await sendEmail({ to: job.data.email, template: 'welcome' });
// });

// emailQueue.process('applicant-status-changed', async (job) => {
//   await sendEmail({ to: job.data.email, template: 'status-update' });
// });

// // Import in main entry file to start processing
// import './jobs/emailConsumer';