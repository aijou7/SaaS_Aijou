export function isLoginOtpEnabled(value = process.env.LOGIN_OTP_ENABLED) {
  if (!value) return false;
  return ["1", "true", "on", "enabled", "yes"].includes(
    value.trim().toLowerCase(),
  );
}
