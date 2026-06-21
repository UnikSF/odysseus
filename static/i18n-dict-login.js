/* EN/FR string pairs for the Odysseus login page. Base language is English.
 * Covers both the static markup and the strings the page's JS sets at runtime
 * (mode switches, 2FA prompt, validation errors) — the MutationObserver in
 * i18n.js applies these as those nodes appear. */
window.I18N_PAIRS = [
  // Static form
  { en: 'Username', fr: "Nom d'utilisateur" },
  { en: 'Password', fr: 'Mot de passe' },
  { en: 'Confirm Password', fr: 'Confirmer le mot de passe' },
  { en: 'Sign In', fr: 'Se connecter' },
  { en: "Don't have an account?", fr: 'Pas encore de compte ?' },
  { en: 'Sign up', fr: "S'inscrire" },
  { en: 'Remember me', fr: 'Se souvenir de moi' },
  { en: 'Show password', fr: 'Afficher le mot de passe' },
  { en: 'Hide password', fr: 'Masquer le mot de passe' },
  // Mode switches
  { en: 'First-time setup — create your admin account',
    fr: 'Première configuration — créez votre compte admin' },
  { en: 'Create Admin Account', fr: 'Créer le compte admin' },
  { en: 'Create Account', fr: 'Créer un compte' },
  { en: 'Already have an account?', fr: 'Vous avez déjà un compte ?' },
  { en: 'Sign in', fr: 'Se connecter' },
  // 2FA
  { en: '2FA Code', fr: 'Code 2FA' },
  { en: 'Enter 6-digit code', fr: 'Entrez le code à 6 chiffres' },
  { en: 'Two-factor authentication code', fr: "Code d'authentification à deux facteurs" },
  { en: 'Verify', fr: 'Vérifier' },
  // Errors
  { en: 'Passwords do not match', fr: 'Les mots de passe ne correspondent pas' },
  { en: 'Password must be at least 8 characters',
    fr: 'Le mot de passe doit contenir au moins 8 caractères' },
  { en: 'Invalid code', fr: 'Code invalide' },
  { en: 'Login failed', fr: 'Échec de la connexion' },
  { en: 'Account creation failed', fr: 'Échec de la création du compte' }
];
