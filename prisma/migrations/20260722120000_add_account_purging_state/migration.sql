-- Once irreversible account cleanup starts, keep the owner disabled across
-- retries without overloading the cancellable grace-period state.
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'PURGING';
