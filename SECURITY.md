# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly.

### How to Report

1. **Do not** open a public GitHub issue for security vulnerabilities
2. Email the maintainer directly at [your-email@example.com]
3. Include the following information:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Any suggested fixes (optional)

### What to Expect

- **Acknowledgment**: Within 48 hours of your report
- **Initial Assessment**: Within 7 days
- **Resolution Timeline**: Depends on severity, typically 30-90 days
- **Credit**: You will be credited in the release notes (unless you prefer anonymity)

## Security Best Practices

This project follows these security practices:

### Authentication & Authorization
- Firebase Authentication for user management
- Firestore security rules for data access control
- No client-side storage of sensitive credentials

### Data Protection
- All API communications over HTTPS
- No storage of payment information
- User data minimization principles

### Secrets Management
- Environment variables for sensitive configuration
- Firebase service account keys excluded from version control
- `.gitignore` configured to prevent accidental credential commits

## Known Security Considerations

### Firebase Configuration
The `google-services.json` file contains Firebase project identifiers (not secrets). These are safe to include in the repository as Firebase security relies on:
- Firebase Authentication
- Firestore Security Rules
- App Check (recommended for production)

### API Keys
- OpenF1 API: Public API, no authentication required
- Firebase API keys: Restricted by Firebase Security Rules

## Security Checklist for Contributors

- [ ] Never commit service account keys or private credentials
- [ ] Use environment variables for sensitive configuration
- [ ] Validate all user input on both client and server
- [ ] Follow the principle of least privilege in Firestore rules
- [ ] Keep dependencies updated to patch known vulnerabilities

## Dependencies

Run `npm audit` regularly to check for vulnerable dependencies:

```bash
npm audit
npm audit fix
```
