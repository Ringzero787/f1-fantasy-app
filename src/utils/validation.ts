/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength
 */
export function validatePassword(password: string): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate display name
 */
export function validateDisplayName(name: string): {
  isValid: boolean;
  error?: string;
} {
  if (!name || name.trim().length === 0) {
    return { isValid: false, error: 'Display name is required' };
  }

  if (name.trim().length < 2) {
    return { isValid: false, error: 'Display name must be at least 2 characters' };
  }

  if (name.trim().length > 30) {
    return { isValid: false, error: 'Display name must be at most 30 characters' };
  }

  if (!/^[a-zA-Z0-9\s_-]+$/.test(name)) {
    return { isValid: false, error: 'Display name can only contain letters, numbers, spaces, hyphens, and underscores' };
  }

  return { isValid: true };
}

/**
 * Validate league name
 */
export function validateLeagueName(name: string): {
  isValid: boolean;
  error?: string;
} {
  if (!name || name.trim().length === 0) {
    return { isValid: false, error: 'League name is required' };
  }

  if (name.trim().length < 3) {
    return { isValid: false, error: 'League name must be at least 3 characters' };
  }

  if (name.trim().length > 50) {
    return { isValid: false, error: 'League name must be at most 50 characters' };
  }

  if (!/^[a-zA-Z0-9\s_\-!'.,&#+()@]+$/.test(name.trim())) {
    return { isValid: false, error: 'League name contains invalid characters' };
  }

  return { isValid: true };
}

/**
 * Validate invite code format
 */
export function validateInviteCode(code: string): {
  isValid: boolean;
  error?: string;
} {
  if (!code || code.trim().length === 0) {
    return { isValid: false, error: 'Invite code is required' };
  }

  if (!/^[A-Z0-9]{4,10}$/i.test(code.trim())) {
    return { isValid: false, error: 'Invalid invite code format' };
  }

  return { isValid: true };
}

/**
 * Validate team name
 */
export function validateTeamName(name: string): {
  isValid: boolean;
  error?: string;
} {
  if (!name || name.trim().length === 0) {
    return { isValid: false, error: 'Team name is required' };
  }

  if (name.trim().length < 2) {
    return { isValid: false, error: 'Team name must be at least 2 characters' };
  }

  if (name.trim().length > 30) {
    return { isValid: false, error: 'Team name must be at most 30 characters' };
  }

  if (!/^[a-zA-Z0-9\s_\-!'.,&#+()@]+$/.test(name.trim())) {
    return { isValid: false, error: 'Team name contains invalid characters' };
  }

  return { isValid: true };
}
