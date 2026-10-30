import type { CustomerModel } from "./customer.model.js";
import type { StayAccountModel } from "./stay-account.model.js";

export interface CustomerHistorySummary {
  stayCount: number;
  activeStayCount: number;
  totalCharged: number;
  totalPaid: number;
  outstandingBalance: number;
}

export interface CustomerHistoryModel {
  customer: CustomerModel;
  activeStay: StayAccountModel | null;
  stays: StayAccountModel[];
  summary: CustomerHistorySummary;
}
