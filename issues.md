#371 feat(backend): Add Dynamic Query Optimizations for Large Event Datasets

Rationale & Scope
Optimized database indexing to ensure that event indexing requests do not trigger CPU spikes when querying large transaction histories.

Concrete Tasks
Implement database indices on transaction date and event type fields.
Refactor Prisma queries to leverage cursor-based pagination.
Monitor query duration changes under load tests.
Acceptance Criteria
 Analytics queries resolve under 50ms for lists exceeding 100k records.
 Database locks are resolved during concurrent write spikes.
Suggested Branch Name
git checkout -b feat/backend-query-optimizations

#372 feat(backend): Implement Webhook Signature Keys Auto-Rotation workflow

Rationale & Scope
Protect webhook endpoints by building a secure, automated HMAC signing key rotation workflow.

Concrete Tasks
Store primary and secondary signing keys in database context.
Implement a key rotation service updating secrets every 90 days.
Update verification checks to validate signatures against both keys during transitions.
Acceptance Criteria
 Rotation executes successfully without interrupting webhook deliveries.
 Outdated keys are successfully pruned from database records.
Suggested Branch Name
git checkout -b feat/backend-webhook-key-rotation

#379 feat(frontend): Add Premium Investor APY ROI Yield Forecasters

Rationale & Scope
Savers want clear visual indicators showing dynamic interest rate projections over long durations. Build ROI compound yield visualizer graphs.

Concrete Tasks
Build interactive area charts detailing compounding ROI projections.
Integrate rate feeds dynamically from active registry contracts.
Support monthly repayment timeline slider configurations.
Acceptance Criteria
 Calculations map accurately to lending pool yield parameters.
 Visualizer scales responsively across viewports.
Suggested Branch Name
git checkout -b feat/frontend-investor-yield-forecaster

#383 feat(devops): Set up Centralized APM and Distributed Request Tracing in Terraform

Rationale & Scope
Monitor transaction pathways across databases and contracts by provisioning trace collectors using Terraform.

Concrete Tasks
Write configs provisioning Elastic APM / Jaeger trace collectors.
Connect APM collection hooks to Express backend routes.
Document setup details.
Suggested Branch Name
git checkout -b feat/devops-apm-distributed-tracing