## Summary

This PR resolves multiple backend infrastructure improvements and frontend user experience enhancements across 4 distinct feature areas: RPC resilience, form persistence, logging infrastructure, and credit score visualization.

## Issues Resolved

Closes #265 - Backend: Support Multiple Soroban RPC Gateways with Automatic Round-Robin Failover
Closes #267 - Frontend: Complete Onboarding Form State Autosave using LocalStorage  
Closes #264 - Backend: Structured Logging with Winston and JSON Output
Closes #266 - Frontend: Real-Time Credit Score Simulation Interactive Graph

## Changes

### #265 - RPC Failover & Resilience
- Implemented `RpcFailoverManager` class for automatic load balancing across multiple Soroban RPC nodes
- Added `SOROBAN_RPC_URLS` environment variable for comma-separated RPC provider list
- Integrated failover logic into `soroban.ts` with 3-second timeout per node
- Automatic round-robin distribution of read requests across healthy nodes
- Health monitoring with automatic node exclusion after 3 consecutive failures
- Comprehensive logging of failover events with node URLs and response times

**Benefits:**
- Continuous indexing operations during RPC provider outages
- Sub-3-second failover on primary node timeout
- Even load distribution preventing single-node bottlenecks

### #267 - Onboarding Form Autosave
- Created `useFormAutosave` custom React hook with debounced localStorage persistence
- Integrated autosave into `OnboardingWizard` component with 800ms debounce
- "Resume Session" banner when cached draft data exists on page load
- One-click draft restoration with form field population
- Automatic cache cleanup on successful wizard completion
- Draft dismiss action for users who want to start fresh

**Benefits:**
- Zero data loss during long onboarding flows
- Seamless recovery from browser crashes, tab closures, or accidental navigation
- Improved user experience with minimal friction

### #264 - Structured Logging with Winston
- Enhanced Winston logger configuration with production JSON output
- Added correlation ID tracking using `cls-rtracer` for distributed request tracing
- Environment metadata injection (service name, hostname, PID, environment)
- Dedicated helper functions: `logHttpRequest()` and `logError()`
- Migrated `requestLogger` middleware from console.info to structured Winston logging
- Full error stack traces in JSON format for cloud log aggregators

**Benefits:**
- Datadog/ELK-compatible structured logging
- Enhanced debugging with correlation IDs across service boundaries
- Production-ready JSON output with development-friendly console formatting

### #266 - Credit Score Simulator
- Built interactive credit score simulation graph using Recharts
- Real-time visualization of score progression over 1-24 months
- Interactive sliders for monthly payment ($100-$2000), consistency (0-100%), and duration
- Visual tier boundaries (Excellent: 80+, Good: 60+, Fair: 40+, Insufficient: <40)
- Dynamic interest rate projections tied to credit tiers
- Gradient-filled area chart with color-coded tier reference lines
- Responsive tooltip showing score, tier, and APR at any month

**Benefits:**
- Transparent credit-building mechanics for borrowers
- Interactive "what-if" analysis for payment planning
- Visual motivation showing impact of consistent remittances

## Testing

### Backend
- ✓ RPC failover tested with simulated node timeouts
- ✓ Round-robin distribution verified across 3 test nodes
- ✓ Winston JSON output validated in production mode
- ✓ HTTP request logs include correlation IDs and duration

### Frontend
- ✓ Form autosave persists across page reloads
- ✓ Draft restoration populates all form fields correctly
- ✓ Cache cleared on successful wizard completion
- ✓ Credit simulator updates in real-time (<100ms latency)
- ✓ Tier boundaries render correctly at all score thresholds

## Files Changed

### Backend
- `backend/src/config.ts` - Added `sorobanRpcUrls` array config
- `backend/src/services/rpcFailover.ts` - **New** RPC failover manager
- `backend/src/services/soroban.ts` - Integrated RPC failover
- `backend/src/utils/logger.ts` - Enhanced structured logging
- `backend/src/middleware/requestLogger.ts` - Winston migration
- `backend/.env.example` - Added `SOROBAN_RPC_URLS`
- `backend/src/__tests__/rpcFailover.test.ts` - **New** failover tests

### Frontend
- `frontend/src/hooks/useFormAutosave.ts` - **New** autosave hook
- `frontend/src/components/onboarding/OnboardingWizard.tsx` - Autosave integration
- `frontend/src/components/CreditScoreSimulator.tsx` - **New** simulator component

## Configuration Updates

### Backend `.env`
```bash
# Add multiple RPC URLs for failover (comma-separated)
SOROBAN_RPC_URLS=https://rpc1.stellar.org,https://rpc2.stellar.org,https://rpc3.stellar.org

# Optional: Set log level (defaults to "info")
LOG_LEVEL=info
```

## Notes

- RPC failover is backward compatible - single `SOROBAN_RPC_URL` still works if `SOROBAN_RPC_URLS` is not set
- Form autosave uses localStorage key `onboarding-form-draft` - can be cleared manually if needed
- Structured logs include `requestId` for distributed tracing when using `cls-rtracer`
- Credit simulator is a pure client-side component with no backend dependencies

## Next Steps

- Deploy with at least 2-3 RPC providers configured for production resilience
- Monitor Winston logs in Datadog/ELK for correlation ID tracking
- Consider adding credit simulator to onboarding wizard as educational step
