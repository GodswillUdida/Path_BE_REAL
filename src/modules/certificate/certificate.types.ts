// certificate.types.ts

export interface IssueCertificateInput {
  enrollmentId: string;
  courseTitle: string;
}

export interface CertificatePublicView {
  id: string;
  courseTitleAtIssuance: string;
  issuedAt: Date;
  url: string;
  verification: string;
}