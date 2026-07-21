export type CredentialSnapshot<T> = {
  value: T;
  recoveryRequired: boolean;
};

/**
 * Credential ciphertext can become unreadable after an encryption-key rotation.
 * Callers must supply a cleared value that contains no encrypted credential from
 * the failed snapshot, then require a complete replacement before persisting.
 */
export function readCredentialSnapshot<T>(
  decryptStored: () => T,
  clearedValue: T,
): CredentialSnapshot<T> {
  try {
    return { value: decryptStored(), recoveryRequired: false };
  } catch {
    return { value: clearedValue, recoveryRequired: true };
  }
}

export function requireCompleteCredentialReplacement(
  recoveryRequired: boolean,
  replacements: readonly (string | null | undefined)[],
  message: string,
) {
  if (recoveryRequired && replacements.some((value) => !value?.trim())) {
    throw new Error(message);
  }
}
