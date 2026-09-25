export function hasVerifiedRecoveryPhone(
  user: {
    phoneNumber: string | null;
    recoveryPhoneVerifiedAt: Date | null;
    emailVerifiedAt: Date | null;
  },
  expectedPhoneNumber: string | null,
  issuedAt?: Date,
) {
  return Boolean(
    expectedPhoneNumber &&
    user.phoneNumber === expectedPhoneNumber &&
    user.recoveryPhoneVerifiedAt &&
    user.emailVerifiedAt &&
    (!issuedAt || user.recoveryPhoneVerifiedAt <= issuedAt),
  );
}
