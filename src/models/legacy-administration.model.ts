export interface HistoricalAccountModel {
  id: number;
  sourceTable: string;
  sourceId: string;
  customerId?: number;
  reservationId?: number;
  stayId?: number;
  guestName: string;
  roomName: string;
  concept: string;
  total: number;
  paid: number;
  balance: number;
  legacyStatus: string;
  legacyDate: string;
  historicalPaymentMethod?: string;
  historicalPaymentRecordedAt?: string;
  paymentDateBasis?: string;
  needsReview: boolean;
  reviewNotes?: string;
  migratedAt: string;
}

export interface LegacyReviewModel {
  id: number;
  sourceTable: string;
  sourceId: string;
  targetTable?: string;
  targetId?: string;
  status: "REVIEW" | "SKIPPED";
  notes?: string;
  resolution?: "ACCEPTED_UNLINKED";
  resolvedBy?: string;
  resolvedAt?: string;
  sourceData?: Record<string, unknown>;
}
