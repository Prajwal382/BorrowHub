-- INV-01: an item can have at most one active hold (an Approved request).
CREATE UNIQUE INDEX "Request_one_hold_per_item"
  ON "Request" ("itemId")
  WHERE "status" = 'Approved';

-- INV-01: an item can have at most one Active loan.
CREATE UNIQUE INDEX "Loan_one_active_per_item"
  ON "Loan" ("itemId")
  WHERE "status" = 'Active';

-- NFR-03: a repeated submission cannot create a second pending request for the same item.
CREATE UNIQUE INDEX "Request_one_pending_per_borrower_item"
  ON "Request" ("borrowerId", "itemId")
  WHERE "status" = 'Pending';

-- FR-11: a rejection must record a reason.
ALTER TABLE "Request" ADD CONSTRAINT "Request_rejection_has_reason"
  CHECK ("status" <> 'Rejected' OR ("rejectionReason" IS NOT NULL AND btrim("rejectionReason") <> ''));

-- FR-16: the agreed return date cannot precede checkout.
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_due_not_before_checkout"
  CHECK ("agreedDueDate" >= "checkoutDate");

-- FR-20: the actual return date cannot precede checkout.
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_return_not_before_checkout"
  CHECK ("returnDate" IS NULL OR "returnDate" >= "checkoutDate");

-- FR-20, FR-22: a Closed loan has full return details and an Active loan has none.
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_return_details_match_status"
  CHECK (
    (
      "status" = 'Active'
      AND "returnDate" IS NULL
      AND "returnCondition" IS NULL
      AND "returnedById" IS NULL
      AND "returnedAt" IS NULL
    )
    OR (
      "status" = 'Closed'
      AND "returnDate" IS NOT NULL
      AND "returnCondition" IS NOT NULL
      AND "returnedById" IS NOT NULL
      AND "returnedAt" IS NOT NULL
    )
  );
